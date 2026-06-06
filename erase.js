const pool = require('./db/index');
async function run() {
  await pool.query("UPDATE users SET email='test_customer1@example.com', phone='0000000000' WHERE email='Niktesla345@gmail.com'");
  await pool.query("UPDATE users SET email='test_customer2@example.com', phone='0000000000' WHERE email='fsfsfs@gmail.com'");
  console.log('Erased user data');
  process.exit(0);
}
run();
