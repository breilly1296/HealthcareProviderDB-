/**
 * Check import status
 */
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function checkStatus() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  try {
    const result = await pool.query(`
      SELECT state, COUNT(*) as count
      FROM providers
      WHERE state = 'NY'
      GROUP BY state
    `);

    console.log('\n📊 Import Status:');
    console.log('================');
    if (result.rows.length > 0) {
      console.log(`NY records: ${result.rows[0].count.toLocaleString()}`);
    } else {
      console.log('NY records: 0');
    }

    // Check total records
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM providers');
    console.log(`Total records: ${totalResult.rows[0].count.toLocaleString()}\n`);

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkStatus();
