/**
 * Describe all table structures
 */
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function describeTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  try {
    const tables = ['providers', 'provider_plan_acceptance', 'insurance_plans', 'sync_logs', 'verifications'];

    for (const table of tables) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Table: ${table}`);
      console.log('='.repeat(80));

      const result = await pool.query(`
        SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);

      result.rows.forEach(row => {
        const type = row.character_maximum_length
          ? `${row.data_type}(${row.character_maximum_length})`
          : row.data_type;
        const nullable = row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const def = row.column_default ? ` DEFAULT ${row.column_default}` : '';
        console.log(`  ${row.column_name.padEnd(30)} ${type.padEnd(20)} ${nullable}${def}`);
      });
    }

    console.log(`\n${'='.repeat(80)}\n`);

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

describeTables();
