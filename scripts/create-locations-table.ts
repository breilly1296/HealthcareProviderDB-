/**
 * Create and populate locations table
 * Groups providers by shared address (address_line1 + city + state + zip_code)
 */
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function createAndPopulateLocations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

  const startTime = Date.now();

  try {
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│  Create and Populate Locations Table                  │');
    console.log('└────────────────────────────────────────────────────────┘\n');

    // Step 1: Create locations table
    console.log('📝 Step 1: Creating locations table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        address_line1 VARCHAR(200) NOT NULL,
        address_line2 VARCHAR(200),
        city VARCHAR(100) NOT NULL,
        state VARCHAR(2) NOT NULL,
        zip_code VARCHAR(10) NOT NULL,
        provider_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(address_line1, city, state, zip_code)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_locations_state ON locations(state)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_locations_city_state ON locations(city, state)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_locations_zip ON locations(zip_code)
    `);

    console.log('✅ Locations table created\n');

    // Step 2: Populate locations from unique provider addresses
    console.log('📝 Step 2: Populating locations from provider addresses...');
    const insertResult = await pool.query(`
      INSERT INTO locations (address_line1, address_line2, city, state, zip_code, provider_count)
      SELECT
        address_line1,
        address_line2,
        city,
        state,
        zip_code,
        COUNT(*) as provider_count
      FROM providers
      WHERE address_line1 IS NOT NULL
        AND city IS NOT NULL
        AND state IS NOT NULL
        AND zip_code IS NOT NULL
      GROUP BY address_line1, address_line2, city, state, zip_code
      ON CONFLICT (address_line1, city, state, zip_code) DO NOTHING
      RETURNING id
    `);

    console.log(`✅ Created ${insertResult.rowCount?.toLocaleString()} unique locations\n`);

    // Step 3: Add location_id column to providers
    console.log('📝 Step 3: Adding location_id column to providers...');
    await pool.query(`
      ALTER TABLE providers
      ADD COLUMN IF NOT EXISTS location_id INT
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_location ON providers(location_id)
    `);

    console.log('✅ Added location_id column\n');

    // Step 4: Update providers with their location_id
    console.log('📝 Step 4: Linking providers to locations...');
    const updateResult = await pool.query(`
      UPDATE providers p
      SET location_id = l.id
      FROM locations l
      WHERE p.address_line1 = l.address_line1
        AND p.city = l.city
        AND p.state = l.state
        AND p.zip_code = l.zip_code
        AND (
          (p.address_line2 IS NULL AND l.address_line2 IS NULL) OR
          (p.address_line2 = l.address_line2)
        )
    `);

    console.log(`✅ Linked ${updateResult.rowCount?.toLocaleString()} providers to locations\n`);

    // Step 5: Show statistics
    console.log('📊 Statistics:');
    console.log('─'.repeat(60));

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_locations,
        SUM(provider_count) as total_providers,
        AVG(provider_count)::numeric(10,2) as avg_providers_per_location,
        MAX(provider_count) as max_providers_at_one_location
      FROM locations
    `);

    const s = stats.rows[0];
    console.log(`Total locations: ${parseInt(s.total_locations).toLocaleString()}`);
    console.log(`Total providers: ${parseInt(s.total_providers).toLocaleString()}`);
    console.log(`Avg providers/location: ${parseFloat(s.avg_providers_per_location).toFixed(2)}`);
    console.log(`Max providers at one location: ${s.max_providers_at_one_location}`);

    // Show top locations
    console.log('\n🏥 Top 10 Locations by Provider Count:');
    console.log('─'.repeat(60));
    const topLocations = await pool.query(`
      SELECT
        address_line1,
        city,
        state,
        zip_code,
        provider_count
      FROM locations
      ORDER BY provider_count DESC
      LIMIT 10
    `);

    topLocations.rows.forEach((loc, idx) => {
      console.log(`${(idx + 1).toString().padStart(2)}. ${loc.address_line1}, ${loc.city}, ${loc.state} ${loc.zip_code}`);
      console.log(`    ${loc.provider_count} providers\n`);
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Migration completed in ${elapsed}s\n`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createAndPopulateLocations();
