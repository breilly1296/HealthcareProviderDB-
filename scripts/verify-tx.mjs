import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function verify() {
  try {
    // Total TX providers
    const total = await pool.query('SELECT COUNT(*) FROM providers WHERE state = $1', ['TX']);
    console.log('\n=== TX IMPORT VERIFICATION ===\n');
    console.log('Total TX Providers:', total.rows[0].count);

    // By Entity Type
    const byType = await pool.query(
      'SELECT "entityType", COUNT(*) as count FROM providers WHERE state = $1 GROUP BY "entityType" ORDER BY count DESC',
      ['TX']
    );
    console.log('\nBy Entity Type:');
    byType.rows.forEach(r => console.log(`  ${r.entityType}: ${r.count}`));

    // By NPI Status
    const byStatus = await pool.query(
      'SELECT "npiStatus", COUNT(*) as count FROM providers WHERE state = $1 GROUP BY "npiStatus" ORDER BY count DESC',
      ['TX']
    );
    console.log('\nBy NPI Status:');
    byStatus.rows.forEach(r => console.log(`  ${r.npiStatus}: ${r.count}`));

    // Top 10 specialties
    const bySpecialty = await pool.query(
      'SELECT "specialtyCategory", COUNT(*) as count FROM providers WHERE state = $1 AND "specialtyCategory" IS NOT NULL GROUP BY "specialtyCategory" ORDER BY count DESC LIMIT 10',
      ['TX']
    );
    console.log('\nTop 10 Specialties:');
    bySpecialty.rows.forEach(r => console.log(`  ${r.specialtyCategory}: ${r.count}`));

    // Database totals across all states
    const dbTotal = await pool.query('SELECT COUNT(*) FROM providers');
    const byState = await pool.query(
      'SELECT state, COUNT(*) as count FROM providers GROUP BY state ORDER BY count DESC'
    );
    console.log('\n=== TOTAL DATABASE STATS ===\n');
    console.log('Total Providers in Database:', dbTotal.rows[0].count);
    console.log('\nBy State:');
    byState.rows.forEach(r => console.log(`  ${r.state}: ${r.count}`));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

verify();
