/**
 * Clean NY data from database
 */
import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function cleanNYData() {
  try {
    console.log('🗑️  Deleting NY records from database...');

    const deleteResult = await pool.query("DELETE FROM providers WHERE state = 'NY'");
    console.log(`✅ Deleted ${deleteResult.rowCount} NY records`);

    const countResult = await pool.query("SELECT COUNT(*) FROM providers");
    console.log(`📊 Remaining providers in database: ${countResult.rows[0].count}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

cleanNYData();
