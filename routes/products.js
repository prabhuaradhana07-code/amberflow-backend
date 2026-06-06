const express = require('express');
const router = express.Router();
const pool = require('../db');
const slugify = require('slugify');
const NodeCache = require('node-cache');
const productCache = new NodeCache({ stdTTL: 60 }); // Cache for 60 seconds

// Get all active products
router.get('/', async (req, res) => {
  try {
    const cachedProducts = productCache.get('all_active_products');
    if (cachedProducts) {
      return res.json(cachedProducts);
    }
    
    const products = await pool.query('SELECT * FROM products WHERE is_active = true ORDER BY created_at DESC');
    productCache.set('all_active_products', products.rows);
    res.json(products.rows);
  } catch (err) {
    console.error('CRITICAL DATABASE ERROR:', err); 
    res.status(500).json({ error: err.message || 'Database connection failed' });
  }
}); // <-- This was the missing line!

const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Get all products for the logged in vendor
router.get('/vendor', auth, async (req, res) => {
  try {
    if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Vendor access required' });
    const products = await pool.query('SELECT * FROM products WHERE vendor_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(products.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a single product by its slug
router.get('/:slug', async (req, res) => {
  try {
    const cacheKey = `product_slug_${req.params.slug}`;
    const cachedProduct = productCache.get(cacheKey);
    if (cachedProduct) return res.json(cachedProduct);

    const product = await pool.query('SELECT * FROM products WHERE slug = $1', [req.params.slug]);
    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    productCache.set(cacheKey, product.rows[0]);
    res.json(product.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    
    productCache.flushAll(); // Invalidate all cached endpoints
    res.status(201).json(newProduct.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a product (Vendor/Admin)
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, honey_type, price, weight_g, stock, image_url: provided_image_url } = req.body;
    
    // Check ownership or admin
    const check = await pool.query('SELECT vendor_id FROM products WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    if (req.user.role !== 'admin' && check.rows[0].vendor_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const slug = slugify(name, { lower: true, strict: true });
    let image_url = provided_image_url;
    if (req.file) image_url = '/uploads/' + req.file.filename;

    const updated = await pool.query(
      `UPDATE products 
       SET name=$1, slug=$2, description=$3, honey_type=$4, price=$5, weight_g=$6, stock=$7, image_url=COALESCE($8, image_url), updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name, slug, description, honey_type, price, weight_g, stock, image_url, id]
    );
    
    productCache.flushAll(); // Invalidate all cached endpoints
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a product (Vendor/Admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT vendor_id FROM products WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    if (req.user.role !== 'admin' && check.rows[0].vendor_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    
    productCache.flushAll(); // Invalidate all cached endpoints
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;