const pool = require('./db/index');
const bcrypt = require('bcryptjs');

async function run() {
  try {
    const password = await bcrypt.hash('admin123', 10);
    // Check if exists
    const check = await pool.query("SELECT * FROM users WHERE email='admin@amberflow.in'");
    if (check.rows.length === 0) {
      await pool.query(
        "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)",
        ['Admin', 'admin@amberflow.in', password, 'admin']
      );
    } else {
      await pool.query("UPDATE users SET role='admin', password=$1 WHERE email='admin@amberflow.in'", [password]);
    }
    console.log('Admin account created successfully');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
