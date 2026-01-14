/**
 * List all tables in the database
 */
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function listTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  try {
    const result = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log('\n📊 Tables in database:\n');
    result.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });
    console.log('');

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

listTables();
