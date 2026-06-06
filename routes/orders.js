const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { sendOrderConfirmation, sendOrderStatusUpdate } = require('../utils/email');

// Delivery partners for random assignment
const DELIVERY_PARTNERS = ['BlueDart Express', 'Delhivery', 'DTDC', 'India Post'];

/**
 * Generate a random tracking ID (e.g., "AF-8A3C7D2E")
 */
function generateTrackingId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'AF-';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// ──────────────────────────────────────────────────────────────
// POST /api/orders
// Create a new order (protected).
// ──────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.id;
    const {
      items, // [{ product_id, quantity, price }]
      shipping_name,
      shipping_phone,
      shipping_address,
      shipping_city,
      shipping_state,
      shipping_pincode,
      promo_code,
      upi_ref,
    } = req.body;

    // Basic validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item.' });
    }
    if (!shipping_name || !shipping_address || !shipping_city || !shipping_state || !shipping_pincode) {
      return res.status(400).json({ error: 'All shipping fields are required.' });
    }

    await client.query('BEGIN');

    // Calculate subtotal from provided items
    let subtotal = 0;
    for (const item of items) {
      subtotal += Number(item.price) * Number(item.quantity);
    }
    subtotal = Math.round(subtotal * 100) / 100; // avoid floating-point drift

    // ── Promo code logic ──────────────────────────────────────
    let discount = 0;
    let appliedPromo = null;

    if (promo_code && promo_code.toUpperCase() === 'NEW15') {
      // Check if the user has already used this promo
      const usageCheck = await client.query(
        'SELECT id FROM promo_usage WHERE user_id = $1 AND promo_code = $2',
        [userId, 'NEW15']
      );

      if (usageCheck.rows.length === 0) {
        // 15 % discount
        discount = Math.round(subtotal * 0.15 * 100) / 100;
        appliedPromo = 'NEW15';
      }
      // If already used, silently ignore (no error, just no discount)
    }

    const gst = Math.round((subtotal - discount) * 0.18 * 100) / 100;
    const delivery_charge = 50.00;
    const packaging_charge = 20.00;
    const total = Math.round((subtotal - discount + gst + delivery_charge + packaging_charge) * 100) / 100;

    // Random delivery partner and tracking
    const deliveryPartner = DELIVERY_PARTNERS[Math.floor(Math.random() * DELIVERY_PARTNERS.length)];
    const trackingId = generateTrackingId();

    // Estimated delivery: 5 days from now
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 5);

    // Insert the order
    const orderResult = await client.query(
      `INSERT INTO orders
        (user_id, status, subtotal, discount, gst, delivery_charge, packaging_charge, total, promo_code,
         shipping_name, shipping_phone, shipping_address, shipping_city,
         shipping_state, shipping_pincode, delivery_partner, tracking_id,
         estimated_delivery, upi_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        userId, 'confirmed', subtotal, discount, gst, delivery_charge, packaging_charge, total, appliedPromo,
        shipping_name, shipping_phone || null, shipping_address, shipping_city,
        shipping_state, shipping_pincode, deliveryPartner, trackingId,
        estimatedDelivery, upi_ref || null
      ]
    );

    const order = orderResult.rows[0];

    // Insert order items
    const insertedItems = [];
    for (const item of items) {
      const itemResult = await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [order.id, item.product_id, item.quantity, item.price]
      );
      insertedItems.push({ ...itemResult.rows[0], name: item.name || null });
    }

    // Record promo usage if a code was applied
    if (appliedPromo) {
      await client.query(
        'INSERT INTO promo_usage (user_id, promo_code) VALUES ($1, $2)',
        [userId, appliedPromo]
      );
    }

    await client.query('COMMIT');

    // Fetch user email for confirmation
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0) {
      // Fire-and-forget; don't let email failure break the response
      sendOrderConfirmation(userResult.rows[0].email, {
        ...order,
        items: insertedItems,
      }).catch((e) => console.error('Order confirmation email error:', e));
    }

    res.status(201).json({ order, items: insertedItems });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create order error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/orders/all
// Get ALL orders across the platform (admin only, protected).
// ──────────────────────────────────────────────────────────────
router.get('/all', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const result = await pool.query(
      `SELECT o.*, u.name as user_name, u.email as user_email 
       FROM orders o 
       JOIN users u ON o.user_id = u.id 
       ORDER BY o.created_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch all orders error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/orders
// Get all orders for the authenticated user (protected).
// ──────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch orders error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/orders/:id
// Get a single order with its items (protected, owner only).
// ──────────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the order
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderResult.rows[0];

    // Only the order owner (or admin) may view it
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Fetch order items with product names
    const itemsResult = await pool.query(
      `SELECT oi.id, oi.product_id, oi.quantity, oi.price,
              p.name AS product_name, p.image_url
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [id]
    );

    res.json({ order, items: itemsResult.rows });
  } catch (err) {
    console.error('Fetch single order error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/orders/:id/status
// Update order status (admin only, protected).
// ──────────────────────────────────────────────────────────────
router.put('/:id/status', auth, async (req, res) => {
  try {
    // Admin-only check
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }

    const result = await pool.query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = result.rows[0];

    // Send status update email to the customer
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [order.user_id]);
    if (userResult.rows.length > 0) {
      sendOrderStatusUpdate(userResult.rows[0].email, order, status).catch((e) =>
        console.error('Status update email error:', e)
      );
    }

    res.json(order);
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/orders/vendor-stats
// Get insights for a vendor (protected).
// ──────────────────────────────────────────────────────────────
router.get('/vendor-stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'vendor') {
      return res.status(403).json({ error: 'Vendor access required.' });
    }

    const result = await pool.query(
      `SELECT p.name AS product_name, SUM(oi.quantity) as total_sold, SUM(oi.quantity * oi.price) as revenue
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE p.vendor_id = $1 AND o.status != 'cancelled'
       GROUP BY p.id, p.name
       ORDER BY total_sold DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch vendor stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;