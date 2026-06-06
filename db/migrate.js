const pool = require('./index');

/**
 * AmberFlow Database Migration Script
 * ------------------------------------
 * Creates all required tables and adds missing columns.
 * Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 *
 * Usage:  node db/migrate.js
 */
async function migrate() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting AmberFlow database migration...\n');

    // ── Users table ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'customer',
        phone VARCHAR(20),
        address TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // Ensure new columns exist on tables that were created before this migration
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100);`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(100);`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved_vendor BOOLEAN DEFAULT false;`);
    console.log('✅  users table ready');

    // ── Vendor Details table ───────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_details (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        aadhaar_number VARCHAR(50),
        pan_number VARCHAR(50),
        aadhaar_doc_url TEXT,
        pan_doc_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅  vendor_details table ready');

    // ── Products table (already exists, adding columns) ───────────
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES users(id);`);
    console.log('✅  products table updated');

    // ── Orders table ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        status VARCHAR(50) DEFAULT 'confirmed',
        subtotal DECIMAL(10,2),
        discount DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(10,2),
        promo_code VARCHAR(50),
        shipping_name VARCHAR(255),
        shipping_phone VARCHAR(20),
        shipping_address TEXT,
        shipping_city VARCHAR(100),
        shipping_state VARCHAR(100),
        shipping_pincode VARCHAR(10),
        delivery_partner VARCHAR(100),
        tracking_id VARCHAR(100),
        estimated_delivery DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst DECIMAL(10,2) DEFAULT 0;`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_charge DECIMAL(10,2) DEFAULT 0;`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS packaging_charge DECIMAL(10,2) DEFAULT 0;`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS upi_ref VARCHAR(100);`);
    console.log('✅  orders table ready');

    // ── Order Items table ─────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL
      );
    `);
    console.log('✅  order_items table ready');

    // ── Reviews table ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        product_id INTEGER REFERENCES products(id),
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS image_url TEXT;`);
    console.log('✅  reviews table ready');

    // ── Password Reset Codes table ────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅  password_reset_codes table ready');

    // ── Promo Usage table (one-time per user per code) ────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS promo_usage (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        promo_code VARCHAR(50) NOT NULL,
        used_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, promo_code)
      );
    `);
    console.log('✅  promo_usage table ready');

    console.log('\n🎉 Migration complete – all tables are up to date.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
