/**
 * Deduplicate practice locations by computing address hashes
 *
 * Computes SHA256(LOWER(TRIM(address_line1)) | city | state | zip5)
 * and populates the address_hash column on practice_locations.
 *
 * Usage:
 *   npx tsx scripts/deduplicate-locations.ts           # Dry run (report only)
 *   npx tsx scripts/deduplicate-locations.ts --apply    # Apply hashes to DB
 */

import pg from 'pg';
import crypto from 'crypto';
import 'dotenv/config';

const { Pool } = pg;
const BATCH_SIZE = 1000;

function computeAddressHash(
  addressLine1: string | null,
  city: string | null,
  state: string | null,
  zipCode: string | null
): string {
  const parts = [
    (addressLine1 || '').toLowerCase().trim(),
    (city || '').toLowerCase().trim(),
    (state || '').toUpperCase().trim(),
    (zipCode || '').substring(0, 5).trim(),
  ].join('|');

  return crypto.createHash('sha256').update(parts).digest('hex');
}

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const limitArg = args.indexOf('--limit');
  const limit = limitArg !== -1 ? parseInt(args[limitArg + 1]) : 0;

  console.log('\n🏢 Location Deduplication\n');
  console.log('='.repeat(70));
  console.log(`Mode: ${applyMode ? 'APPLY' : 'DRY RUN (report only)'}`);
  if (limit) console.log(`Limit: ${limit}`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
  });

  try {
    // Count total locations
    const countResult = await pool.query('SELECT COUNT(*) as total FROM practice_locations');
    const totalLocations = parseInt(countResult.rows[0].total);
    console.log(`\nTotal locations: ${totalLocations}`);

    // Count locations already with hashes
    const hashedResult = await pool.query(
      'SELECT COUNT(*) as total FROM practice_locations WHERE address_hash IS NOT NULL'
    );
    const alreadyHashed = parseInt(hashedResult.rows[0].total);
    console.log(`Already hashed: ${alreadyHashed}`);
    console.log(`To process: ${totalLocations - alreadyHashed}`);

    if (applyMode) {
      let processed = 0;
      let offset = 0;
      const toProcess = limit ? Math.min(limit, totalLocations - alreadyHashed) : totalLocations - alreadyHashed;

      while (true) {
        const remaining = limit ? toProcess - processed : BATCH_SIZE;
        const batchLimit = Math.min(BATCH_SIZE, remaining);
        if (batchLimit <= 0) break;

        const batch = await pool.query(
          `SELECT id, address_line1, city, state, zip_code
           FROM practice_locations
           WHERE address_hash IS NULL
           ORDER BY id
           LIMIT $1 OFFSET $2`,
          [batchLimit, offset]
        );

        if (batch.rows.length === 0) break;

        // Build batch update
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const row of batch.rows) {
            const hash = computeAddressHash(
              row.address_line1,
              row.city,
              row.state,
              row.zip_code
            );
            await client.query(
              'UPDATE practice_locations SET address_hash = $1 WHERE id = $2',
              [hash, row.id]
            );
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }

        processed += batch.rows.length;
        offset += BATCH_SIZE;

        const pct = Math.round((processed / toProcess) * 100);
        process.stdout.write(`\r  Hashed: ${processed}/${toProcess} (${pct}%)`);
      }

      console.log('\n');
    }

    // Deduplication report
    console.log('\n--- Deduplication Report ---');

    // Count unique addresses (by hash or computed)
    let uniqueQuery: string;
    if (alreadyHashed > 0 || applyMode) {
      uniqueQuery = `
        SELECT COUNT(DISTINCT address_hash) as unique_addresses
        FROM practice_locations
        WHERE address_hash IS NOT NULL
      `;
    } else {
      // Compute on the fly for dry run
      uniqueQuery = `
        SELECT COUNT(DISTINCT
          LOWER(TRIM(COALESCE(address_line1, ''))) || '|' ||
          LOWER(TRIM(COALESCE(city, ''))) || '|' ||
          UPPER(TRIM(COALESCE(state, ''))) || '|' ||
          LEFT(TRIM(COALESCE(zip_code, '')), 5)
        ) as unique_addresses
        FROM practice_locations
      `;
    }

    const uniqueResult = await pool.query(uniqueQuery);
    const uniqueAddresses = parseInt(uniqueResult.rows[0].unique_addresses);

    console.log(`  Total locations:    ${totalLocations}`);
    console.log(`  Unique addresses:   ${uniqueAddresses}`);
    console.log(`  Duplicates:         ${totalLocations - uniqueAddresses}`);
    console.log(`  Duplication ratio:  ${((totalLocations - uniqueAddresses) / totalLocations * 100).toFixed(1)}%`);

    // Top duplicated addresses
    console.log('\n--- Most Duplicated Addresses (Top 10) ---');
    const topDupes = await pool.query(`
      SELECT
        LOWER(TRIM(COALESCE(address_line1, ''))) as addr,
        LOWER(TRIM(COALESCE(city, ''))) as city,
        UPPER(TRIM(COALESCE(state, ''))) as state,
        COUNT(*) as count
      FROM practice_locations
      GROUP BY addr, city, state
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 10
    `);

    for (const row of topDupes.rows) {
      console.log(`  ${row.count}x: ${row.addr}, ${row.city}, ${row.state}`);
    }

    // Providers with most locations
    console.log('\n--- Providers with Most Locations ---');
    const topProviders = await pool.query(`
      SELECT p.npi, p.first_name, p.last_name, p.organization_name, p.entity_type,
             COUNT(pl.id) as location_count
      FROM providers p
      JOIN practice_locations pl ON p.npi = pl.npi
      GROUP BY p.npi
      ORDER BY location_count DESC
      LIMIT 10
    `);

    for (const row of topProviders.rows) {
      const name = row.entity_type === '2'
        ? (row.organization_name || 'Unknown Org')
        : `${row.first_name} ${row.last_name}`;
      console.log(`  ${row.npi}: ${name} (${row.location_count} locations)`);
    }

    if (!applyMode) {
      console.log('\n  Run with --apply to populate address_hash column.');
    }

    console.log('\n' + '='.repeat(70));
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
