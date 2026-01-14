/**
 * Check database schema
 */
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function checkSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  try {
    // Check sync_logs columns
    const syncLogsColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sync_logs'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 sync_logs table columns:');
    syncLogsColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    // Check providers columns
    const providersColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'providers'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 providers table columns:');
    providersColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
