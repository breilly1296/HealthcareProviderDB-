/**
 * Quick database connection test
 */
import pg from 'pg';

const { Pool } = pg;

async function testConnection() {
  const databaseUrl = process.argv[2] || process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ Please provide database URL as argument or DATABASE_URL env var');
    process.exit(1);
  }

  console.log('🔗 Testing database connection...');
  console.log(`📍 URL: ${databaseUrl.replace(/:[^:@]+@/, ':***@')}`);

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connection successful!');

    const result = await client.query('SELECT version()');
    console.log('📊 PostgreSQL version:', result.rows[0].version);

    const tableCheck = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    console.log('📋 Tables:', tableCheck.rows.map(r => r.tablename).join(', '));

    client.release();
    await pool.end();
    console.log('✅ Test complete!');
  } catch (error: any) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();
