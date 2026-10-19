const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

/**
 * POST /api/reviews
 * Submit a review (protected).
 * Body: { product_id (optional), rating, comment }
 * One review per user per product (or one general review if no product_id).
 */
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { product_id, rating, comment, image_url: provided_image_url } = req.body;
    const userId = req.user.id;

    // Validate rating
    const numRating = parseInt(rating, 10);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
    }

    // Validate comment length (prevent database bloat / DoS)
    if (comment && typeof comment === 'string' && comment.trim().length > 1000) {
      return res.status(400).json({ error: 'Review comment must not exceed 1000 characters.' });
    }

    const cleanComment = comment && typeof comment === 'string' ? comment.trim() : null;

    // Check for duplicate review (same user + same product/null)
    const duplicateCheck = product_id
      ? await pool.query(
          'SELECT id FROM reviews WHERE user_id = $1 AND product_id = $2',
          [userId, product_id]
        )
      : await pool.query(
          'SELECT id FROM reviews WHERE user_id = $1 AND product_id IS NULL',
          [userId]
        );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ error: 'You have already submitted a review.' });
    }

    // If product_id is provided, verify the product exists AND that user has purchased it
    let validProductId = null;
    if (product_id) {
      const pId = parseInt(product_id, 10);
      if (!pId || isNaN(pId)) {
        return res.status(400).json({ error: 'Invalid product ID.' });
      }

      const productExists = await pool.query('SELECT id FROM products WHERE id = $1', [pId]);
      if (productExists.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found.' });
      }

      // Business logic integrity: Verify that user has a completed/confirmed order containing this product
      const purchaseCheck = await pool.query(
        `SELECT o.id FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         WHERE o.user_id = $1 AND oi.product_id = $2 AND o.status != 'cancelled'
         LIMIT 1`,
        [userId, pId]
      );

      if (purchaseCheck.rows.length === 0) {
        return res.status(403).json({
          error: 'Verified purchase required. You can only review products you have purchased.'
        });
      }

      validProductId = pId;
    }

    // Store only verified local uploads
    const image_url = req.file ? '/uploads/' + req.file.filename : null;

    const result = await pool.query(
      `INSERT INTO reviews (user_id, product_id, rating, comment, image_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, validProductId, numRating, cleanComment, image_url]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Review creation error:', err);
    res.status(500).json({ error: 'Failed to submit review. Please try again.' });
  }
});

/**
 * GET /api/reviews
 * Get all reviews with user names, ordered by most recent. Limit 20.
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.product_id, r.created_at, r.image_url,
              u.name AS user_name,
              p.name AS product_name
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN products p ON r.product_id = p.id
       ORDER BY r.created_at DESC
       LIMIT 20`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch reviews error:', err);
    res.status(500).json({ error: 'Failed to retrieve reviews.' });
  }
});

/**
 * GET /api/reviews/product/:id
 * Get all reviews for a specific product.
 */
router.get('/product/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.image_url,
              u.name AS user_name
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC`,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch product reviews error:', err);
    res.status(500).json({ error: 'Failed to retrieve product reviews.' });
  }
});

module.exports = router;
