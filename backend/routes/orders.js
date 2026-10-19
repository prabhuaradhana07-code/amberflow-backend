const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { sendOrderConfirmation, sendOrderStatusUpdate } = require('../utils/email');

// Delivery partners for random assignment
const DELIVERY_PARTNERS = ['BlueDart Express', 'Delhivery', 'DTDC', 'India Post'];
const ALLOWED_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

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
// Create a new order with server-side price & stock verification
// ──────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.id;
    const {
      items, // [{ product_id, quantity }]
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

    // ── Server-side Price & Stock Verification (Prevents Price Tampering) ──
    let subtotal = 0;
    const verifiedItems = [];

    for (const item of items) {
      const pId = parseInt(item.product_id, 10);
      const qty = parseInt(item.quantity, 10);

      if (!pId || isNaN(qty) || qty <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid product ID or quantity specified.' });
      }

      // Fetch authoritative price and stock from database with row locking
      const prodRes = await client.query(
        'SELECT id, name, price, stock, is_active FROM products WHERE id = $1 FOR UPDATE',
        [pId]
      );

      if (prodRes.rows.length === 0 || !prodRes.rows[0].is_active) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Product #${pId} is unavailable.` });
      }

      const prod = prodRes.rows[0];
      if (prod.stock < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient stock for "${prod.name}". Available: ${prod.stock}`
        });
      }

      const verifiedPrice = Number(prod.price);
      subtotal += verifiedPrice * qty;

      verifiedItems.push({
        product_id: pId,
        quantity: qty,
        price: verifiedPrice,
        name: prod.name,
        new_stock: prod.stock - qty
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;

    // Decrement inventory stock
    for (const item of verifiedItems) {
      await client.query(
        'UPDATE products SET stock = $1 WHERE id = $2',
        [item.new_stock, item.product_id]
      );
    }

    // ── Server-side Promo Code Logic ─────────────────────────
    let discount = 0;
    let appliedPromo = null;

    if (promo_code && promo_code.toUpperCase() === 'NEW15') {
      const usageCheck = await client.query(
        'SELECT id FROM promo_usage WHERE user_id = $1 AND promo_code = $2',
        [userId, 'NEW15']
      );

      if (usageCheck.rows.length === 0) {
        discount = Math.round(subtotal * 0.15 * 100) / 100;
        appliedPromo = 'NEW15';
      }
    }

    const gst = Math.round((subtotal - discount) * 0.18 * 100) / 100;
    const delivery_charge = 50.00;
    const packaging_charge = 20.00;
    const total = Math.round((subtotal - discount + gst + delivery_charge + packaging_charge) * 100) / 100;

    // Delivery Partner & Tracking
    const deliveryPartner = DELIVERY_PARTNERS[Math.floor(Math.random() * DELIVERY_PARTNERS.length)];
    const trackingId = generateTrackingId();
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 5);

    // Insert Order Record
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

    // Insert Order Items with Server-Verified Prices
    const insertedItems = [];
    for (const item of verifiedItems) {
      const itemResult = await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [order.id, item.product_id, item.quantity, item.price]
      );
      insertedItems.push({ ...itemResult.rows[0], name: item.name });
    }

    // Record Promo Usage
    if (appliedPromo) {
      await client.query(
        'INSERT INTO promo_usage (user_id, promo_code) VALUES ($1, $2)',
        [userId, appliedPromo]
      );
    }

    await client.query('COMMIT');

    // Send confirmation email asynchronously
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0) {
      sendOrderConfirmation(userResult.rows[0].email, {
        ...order,
        items: insertedItems,
      }).catch((e) => console.error('Order confirmation email error:', e.message));
    }

    res.status(201).json({ order, items: insertedItems });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to process order. Please try again.' });
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/orders/all
// Get ALL orders across the platform (admin only)
// ──────────────────────────────────────────────────────────────
router.get('/all', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const result = await pool.query(`
      SELECT o.*, u.name AS user_name, u.email AS user_email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch all orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/orders/vendor-orders
// Defined BEFORE /:id to prevent route shadowing
// ──────────────────────────────────────────────────────────────
router.get('/vendor-orders', auth, async (req, res) => {
  try {
    if (req.user.role !== 'vendor') {
      return res.status(403).json({ error: 'Vendor access required.' });
    }

    const result = await pool.query(
      `SELECT o.id, o.shipping_name, o.shipping_city, o.shipping_state, o.created_at, o.status,
              oi.quantity, oi.price as item_price, p.name as product_name
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       WHERE p.vendor_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch vendor orders error:', err);
    res.status(500).json({ error: 'Failed to fetch vendor orders.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/orders/vendor-stats
// Defined BEFORE /:id to prevent route shadowing
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
    res.status(500).json({ error: 'Failed to fetch vendor statistics.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/orders AND /api/orders/user
// Get orders for the currently authenticated user
// ──────────────────────────────────────────────────────────────
router.get(['/', '/user'], auth, async (req, res) => {
  try {
    const ordersResult = await pool.query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    const orders = ordersResult.rows;

    for (let order of orders) {
      const itemsResult = await pool.query(
        `SELECT oi.id, oi.product_id, oi.quantity, oi.price,
                p.name AS product_name, p.image_url
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = $1`,
        [order.id]
      );
      order.items = itemsResult.rows;
    }

    res.json(orders);
  } catch (err) {
    console.error('Fetch user orders error:', err);
    res.status(500).json({ error: 'Failed to fetch your orders.' });
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/orders/:id/status
// Update order status (Admin only) with whitelist validation
// ──────────────────────────────────────────────────────────────
router.put('/:id/status', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const orderId = parseInt(req.params.id, 10);
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID.' });
    }

    const { status } = req.body;
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
      });
    }

    const result = await pool.query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = result.rows[0];

    // Send email notification on status change
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [order.user_id]);
    if (userResult.rows.length > 0) {
      sendOrderStatusUpdate(userResult.rows[0].email, order, status).catch((e) =>
        console.error('Status update email error:', e.message)
      );
    }

    res.json(order);
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Failed to update order status.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/orders/:id
// Get a single order with its items (owner or admin only)
// Placed at the bottom to avoid shadowing named sub-routes
// ──────────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID.' });
    }

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderResult.rows[0];

    // Only the order owner or admin may view it
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const itemsResult = await pool.query(
      `SELECT oi.id, oi.product_id, oi.quantity, oi.price,
              p.name AS product_name, p.image_url
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    res.json({ order, items: itemsResult.rows });
  } catch (err) {
    console.error('Fetch single order error:', err);
    res.status(500).json({ error: 'Failed to fetch order details.' });
  }
});

module.exports = router;