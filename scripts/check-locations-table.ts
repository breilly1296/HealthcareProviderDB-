/**
 * Check if locations table exists
 */
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function checkTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  try {
    // Check if table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'locations'
      );
    `);

    console.log('\n📊 Locations table exists:', tableExists.rows[0].exists);

    if (tableExists.rows[0].exists) {
      // Show schema
      const schema = await pool.query(`
        SELECT column_name, data_type, character_maximum_length, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'locations'
        ORDER BY ordinal_position
      `);

      console.log('\nColumns:');
      schema.rows.forEach(row => {
        const type = row.character_maximum_length
          ? `${row.data_type}(${row.character_maximum_length})`
          : row.data_type;
        console.log(`  ${row.column_name.padEnd(30)} ${type.padEnd(20)} ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });

      // Show count
      const count = await pool.query('SELECT COUNT(*) FROM locations');
      console.log(`\nTotal locations: ${parseInt(count.rows[0].count).toLocaleString()}\n`);
    } else {
      console.log('\n❌ Table does not exist. Will need to create it.\n');
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTable();
