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
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }

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

    // If product_id is provided, verify the product exists
    if (product_id) {
      const productExists = await pool.query('SELECT id FROM products WHERE id = $1', [product_id]);
      if (productExists.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found.' });
      }
    }

    const image_url = req.file ? '/uploads/' + req.file.filename : provided_image_url;

    const result = await pool.query(
      `INSERT INTO reviews (user_id, product_id, rating, comment, image_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, product_id || null, rating, comment || null, image_url || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Review creation error:', err);
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
