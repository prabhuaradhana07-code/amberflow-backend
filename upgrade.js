const pool = require('./db/index');
async function run() {
  await pool.query("UPDATE users SET role='admin'");
  console.log('Upgraded all users to admin');
  process.exit(0);
}
run();
