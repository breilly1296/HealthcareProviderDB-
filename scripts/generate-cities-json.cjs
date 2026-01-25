/**
 * Generate cities.json for frontend static loading
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@host:5432/db node scripts/generate-cities-json.cjs
 *
 * Or if DATABASE_URL is already set in environment:
 *   node scripts/generate-cities-json.cjs
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL=postgresql://user:pass@host:5432/db node scripts/generate-cities-json.cjs');
  process.exit(1);
}

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 30000,
  });

  console.log('Generating cities.json...\n');

  try {
    // Get all unique state/city combinations
    const result = await pool.query(`
      SELECT DISTINCT state, city
      FROM providers
      WHERE city IS NOT NULL
        AND city != ''
      ORDER BY state, city
    `);

    console.log(`Found ${result.rows.length} unique state/city combinations`);

    // Group by state and title-case cities
    const citiesByState = {};

    for (const row of result.rows) {
      const state = row.state;
      const city = row.city
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      if (!citiesByState[state]) {
        citiesByState[state] = new Set();
      }
      citiesByState[state].add(city);
    }

    // Convert Sets to sorted arrays
    const output = {};
    for (const state of Object.keys(citiesByState).sort()) {
      output[state] = [...citiesByState[state]].sort();
    }

    // Calculate stats
    const totalCities = Object.values(output).reduce((sum, cities) => sum + cities.length, 0);
    console.log(`States: ${Object.keys(output).length}`);
    console.log(`Total unique cities: ${totalCities}`);

    // Write to frontend public folder
    const outputPath = path.join(__dirname, '..', 'packages', 'frontend', 'public', 'data', 'cities.json');

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nWritten to: ${outputPath}`);

    // Show file size
    const stats = fs.statSync(outputPath);
    console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB`);

    // Show sample
    console.log('\nSample (FL cities):');
    if (output.FL) {
      console.log(`  ${output.FL.slice(0, 10).join(', ')}... (${output.FL.length} total)`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
