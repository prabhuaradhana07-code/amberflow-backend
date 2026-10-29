const pool = require('./index');

/**
 * Supabase Security Advisor Hardening Script
 * -------------------------------------------
 * 1. Enables Row Level Security (RLS) on all public tables.
 * 2. Revokes public/anon/authenticated access to prevent unauthorized PostgREST API access.
 * 3. Configures default privileges so future tables are secure by default.
 */
async function fixSupabaseSecurity() {
  const client = await pool.connect();

  try {
    console.log('🔒 Starting Supabase Database Security Hardening...\n');

    const tables = [
      'users',
      'vendor_details',
      'products',
      'orders',
      'order_items',
      'reviews',
      'password_reset_codes',
      'promo_usage'
    ];

    await client.query('BEGIN');

    // 1. Enable RLS on all public tables
    for (const table of tables) {
      console.log(`Enabling Row Level Security on public.${table}...`);
      await client.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }

    // 2. Revoke all privileges from anon and authenticated roles on public tables & sequences
    console.log('\nRevoking privileges from public PostgREST roles (anon, authenticated)...');
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;`);
    await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;`);
    await client.query(`REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;`);

    // 3. Ensure future tables do not automatically grant permissions to anon or authenticated
    console.log('Configuring default privileges to prevent auto-grants on future tables...');
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;`);

    await client.query('COMMIT');
    console.log('\n✅ All security fixes applied and committed successfully!');

    // 4. Verification Check
    console.log('\n--- Verification: Current Table RLS Status ---');
    const rlsCheck = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    console.table(rlsCheck.rows);

    console.log('\n--- Verification: Remaining Permissions for anon/authenticated ---');
    const permCheck = await client.query(`
      SELECT grantee, table_name, string_agg(privilege_type, ', ') as privileges
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
      GROUP BY grantee, table_name;
    `);
    if (permCheck.rows.length === 0) {
      console.log('✅ ZERO permissions remain for anon/authenticated roles. PostgREST backdoor is completely closed!');
    } else {
      console.table(permCheck.rows);
    }

    // 5. Verify that Express backend connection (postgres user) still works normally
    console.log('\n--- Verification: Backend Query Test ---');
    const userCount = await client.query('SELECT count(*) FROM users;');
    const prodCount = await client.query('SELECT count(*) FROM products;');
    console.log(`✅ Backend database queries working normally (Users count: ${userCount.rows[0].count}, Products count: ${prodCount.rows[0].count}).`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to apply security fixes:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

fixSupabaseSecurity();
