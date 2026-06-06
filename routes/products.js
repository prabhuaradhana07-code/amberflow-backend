const express = require('express');
const router = express.Router();
const pool = require('../db');
const slugify = require('slugify');

// Get all active products
router.get('/', async (req, res) => {
  try {
    const products = await pool.query('SELECT * FROM products WHERE is_active = true ORDER BY created_at DESC');
    res.json(products.rows);
  } catch (err) {
    // THIS LINE forces the real error to print in your backend terminal
    console.error('CRITICAL DATABASE ERROR:', err); 
    res.status(500).json({ error: err.message || 'Database connection failed' });
  }
}); // <-- This was the missing line!

// Get a single product by its slug
router.get('/:slug', async (req, res) => {
  try {
    const product = await pool.query('SELECT * FROM products WHERE slug = $1', [req.params.slug]);
    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Create a new product (Vendor/Admin)
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    if (req.user.role === 'customer') {
      return res.status(403).json({ error: 'Forbidden. Customers cannot create products.' });
    }

    if (req.user.role === 'vendor') {
      const userCheck = await pool.query('SELECT is_approved_vendor FROM users WHERE id = $1', [req.user.id]);
      if (!userCheck.rows[0].is_approved_vendor) {
        return res.status(403).json({ error: 'Vendor account pending approval.' });
      }
    }

    const { name, description, honey_type, price, weight_g, stock, image_url: provided_image_url } = req.body;
    
    // Automatically generate a URL slug from the product name
    const slug = slugify(name, { lower: true, strict: true });
    
    const image_url = req.file ? '/uploads/' + req.file.filename : provided_image_url;
    const vendor_id = req.user.id;

    const newProduct = await pool.query(
      `INSERT INTO products 
      (name, slug, description, honey_type, price, weight_g, stock, image_url, vendor_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, slug, description, honey_type, price, weight_g, stock, image_url, vendor_id]
    );
    
    res.status(201).json(newProduct.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;