const pool = require('./db');

async function addIndexes() {
  try {
    console.log('Adding indexes...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_slug ON products (slug);
      CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON products (vendor_id);
      CREATE INDEX IF NOT EXISTS idx_products_is_active ON products (is_active);
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
    `);
    console.log('Indexes added successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error adding indexes:', err);
    process.exit(1);
  }
}

addIndexes();
