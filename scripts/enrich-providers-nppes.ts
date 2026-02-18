/**
 * Enrich provider data from NPPES Registry
 *
 * Refreshes provider credentials, specialty, taxonomy, and practice locations
 * from the official NPPES API. Updates nppes_last_synced on success.
 *
 * Selection criteria:
 *   - nppes_last_synced IS NULL (never synced)
 *   - nppes_last_synced < now() - 90 days (stale)
 *
 * Usage:
 *   npx tsx scripts/enrich-providers-nppes.ts                  # Dry run (10 NPIs)
 *   npx tsx scripts/enrich-providers-nppes.ts --limit 100      # Dry run (100 NPIs)
 *   npx tsx scripts/enrich-providers-nppes.ts --apply          # Full run
 *   npx tsx scripts/enrich-providers-nppes.ts --apply --limit 500  # Apply, 500 NPIs
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const NPPES_API_URL = 'https://npiregistry.cms.hhs.gov/api/?version=2.1';
const BATCH_SIZE = 50;
const RATE_LIMIT_DELAY_MS = 1000;
const STALE_THRESHOLD_DAYS = 90;

interface NppesResult {
  enumeration_type: string;
  number: string;
  basic: {
    first_name?: string;
    last_name?: string;
    credential?: string;
    organization_name?: string;
    status: string;
    deactivation_date?: string;
  };
  taxonomies?: Array<{
    code: string;
    desc: string;
    primary: boolean;
    state?: string;
    license?: string;
  }>;
  addresses?: Array<{
    address_purpose: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postal_code: string;
    telephone_number?: string;
    fax_number?: string;
  }>;
}

async function fetchNppes(npi: string): Promise<NppesResult | null> {
  try {
    const response = await fetch(`${NPPES_API_URL}&number=${npi}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.result_count === 0) return null;
    return data.results[0] as NppesResult;
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const limitArg = args.indexOf('--limit');
  const limit = limitArg !== -1 ? parseInt(args[limitArg + 1]) : (applyMode ? 0 : 10);

  console.log('\n🔄 NPPES Provider Enrichment\n');
  console.log('='.repeat(70));
  console.log(`Mode: ${applyMode ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Limit: ${limit || 'ALL'}`);
  console.log(`Stale threshold: ${STALE_THRESHOLD_DAYS} days`);
  console.log(`\n⚠️  Import running with enrichment protection — only NPI-sourced fields will be updated on existing records`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
  });

  try {
    // Count eligible providers
    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM providers
      WHERE nppes_last_synced IS NULL
         OR nppes_last_synced < NOW() - INTERVAL '${STALE_THRESHOLD_DAYS} days'
    `);
    const eligible = parseInt(countResult.rows[0].total);
    console.log(`\nEligible providers: ${eligible}`);

    let processed = 0;
    let updated = 0;
    let deactivated = 0;
    let locationsAdded = 0;
    let locationsUpdated = 0;
    let conflictsLogged = 0;
    let errors = 0;
    let cursor: string | null = null;

    while (true) {
      const params: (string | number)[] = [];
      let query = `
        SELECT npi, entity_type, first_name, last_name, credential,
               organization_name, primary_taxonomy_code, primary_specialty,
               deactivation_date
        FROM providers
        WHERE (nppes_last_synced IS NULL
               OR nppes_last_synced < NOW() - INTERVAL '${STALE_THRESHOLD_DAYS} days')
      `;

      if (cursor) {
        query += ` AND npi > $${params.length + 1}`;
        params.push(cursor);
      }

      query += ` ORDER BY npi LIMIT $${params.length + 1}`;
      params.push(BATCH_SIZE);

      const batch = await pool.query(query, params);
      if (batch.rows.length === 0) break;

      for (const row of batch.rows) {
        const nppes = await fetchNppes(row.npi);

        if (!nppes) {
          errors++;
          processed++;
          continue;
        }

        if (applyMode) {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            // Check if deactivated
            if (nppes.basic.status === 'D') {
              await client.query(
                `UPDATE providers SET deactivation_date = $1, nppes_last_synced = NOW() WHERE npi = $2`,
                [nppes.basic.deactivation_date || 'deactivated', row.npi]
              );
              deactivated++;
            } else {
              // Update provider fields
              const primaryTaxonomy = nppes.taxonomies?.find(t => t.primary);
              await client.query(
                `UPDATE providers
                 SET credential = COALESCE($1, credential),
                     primary_taxonomy_code = COALESCE($2, primary_taxonomy_code),
                     primary_specialty = COALESCE($3, primary_specialty),
                     nppes_last_synced = NOW()
                 WHERE npi = $4`,
                [
                  nppes.basic.credential || null,
                  primaryTaxonomy?.code || null,
                  primaryTaxonomy?.desc || null,
                  row.npi,
                ]
              );
              updated++;

              // Add new practice locations from NPPES; never overwrite enrichment data
              const practiceAddresses = nppes.addresses?.filter(
                a => a.address_purpose === 'LOCATION'
              ) || [];

              for (const addr of practiceAddresses) {
                // Check if location already exists
                const existing = await client.query(
                  `SELECT id, address_line2, zip_code, phone, fax
                   FROM practice_locations
                   WHERE npi = $1 AND address_line1 = $2 AND city = $3 AND state = $4`,
                  [row.npi, addr.address_1, addr.city, addr.state]
                );

                if (existing.rows.length === 0) {
                  // New location — insert with data_source = 'nppes'
                  await client.query(
                    `INSERT INTO practice_locations (npi, address_type, address_line1, address_line2, city, state, zip_code, phone, fax, data_source)
                     VALUES ($1, 'practice', $2, $3, $4, $5, $6, $7, $8, 'nppes')`,
                    [
                      row.npi,
                      addr.address_1,
                      addr.address_2 || null,
                      addr.city,
                      addr.state,
                      addr.postal_code,
                      addr.telephone_number || null,
                      addr.fax_number || null,
                    ]
                  );
                  locationsAdded++;
                } else {
                  const loc = existing.rows[0];

                  // Log conflicts where NPPES differs from our enriched data
                  const conflicts: Array<{ field: string; current: string; incoming: string }> = [];

                  if (loc.address_line2 && addr.address_2 && loc.address_line2 !== addr.address_2) {
                    conflicts.push({ field: 'address_line2', current: loc.address_line2, incoming: addr.address_2 });
                  }
                  if (loc.zip_code && addr.postal_code && loc.zip_code !== addr.postal_code) {
                    conflicts.push({ field: 'zip_code', current: loc.zip_code, incoming: addr.postal_code });
                  }
                  if (loc.phone && addr.telephone_number && loc.phone !== addr.telephone_number) {
                    conflicts.push({ field: 'phone', current: loc.phone, incoming: addr.telephone_number });
                  }
                  if (loc.fax && addr.fax_number && loc.fax !== addr.fax_number) {
                    conflicts.push({ field: 'fax', current: loc.fax, incoming: addr.fax_number });
                  }

                  for (const c of conflicts) {
                    await client.query(
                      `INSERT INTO import_conflicts (npi, table_name, field_name, current_value, incoming_value, current_source, incoming_source)
                       VALUES ($1, 'practice_locations', $2, $3, $4, 'enrichment', 'nppes')`,
                      [row.npi, c.field, c.current, c.incoming]
                    );
                    conflictsLogged++;
                  }

                  // Only fill in phone/fax if our current values are NULL
                  const updates: string[] = [];
                  const updateParams: any[] = [];
                  let paramIdx = 1;

                  if (!loc.phone && addr.telephone_number) {
                    updates.push(`phone = $${paramIdx++}`);
                    updateParams.push(addr.telephone_number);
                  }
                  if (!loc.fax && addr.fax_number) {
                    updates.push(`fax = $${paramIdx++}`);
                    updateParams.push(addr.fax_number);
                  }

                  if (updates.length > 0) {
                    updateParams.push(loc.id);
                    await client.query(
                      `UPDATE practice_locations SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
                      updateParams
                    );
                    locationsUpdated++;
                  }
                }
              }
            }

            // Log sync
            await client.query(
              `INSERT INTO sync_logs (sync_type, records_processed, status, started_at, completed_at)
               VALUES ('nppes_enrichment', 1, 'completed', NOW(), NOW())`
            );

            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            errors++;
          } finally {
            client.release();
          }
        } else {
          // Dry run - just count what would change
          if (nppes.basic.status === 'D' && !row.deactivation_date) {
            deactivated++;
          }

          const primaryTaxonomy = nppes.taxonomies?.find(t => t.primary);
          if (
            (nppes.basic.credential && nppes.basic.credential !== row.credential) ||
            (primaryTaxonomy && primaryTaxonomy.code !== row.primary_taxonomy_code)
          ) {
            updated++;
          }
        }

        processed++;
      }

      cursor = batch.rows[batch.rows.length - 1].npi;

      const pct = limit
        ? Math.min(100, Math.round((processed / limit) * 100))
        : Math.round((processed / eligible) * 100);
      process.stdout.write(
        `\r  Processed: ${processed}/${limit || eligible} (${pct}%) | Updated: ${updated} | Deactivated: ${deactivated} | Locations: +${locationsAdded} | Conflicts: ${conflictsLogged} | Errors: ${errors}`
      );

      if (limit && processed >= limit) break;

      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }

    console.log('\n\n' + '='.repeat(70));
    console.log('ENRICHMENT SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Processed:         ${processed}`);
    console.log(`  Fields updated:    ${updated}`);
    console.log(`  Newly deactivated: ${deactivated}`);
    console.log(`  Locations added:   ${locationsAdded}`);
    console.log(`  Locations updated: ${locationsUpdated} (NULL phone/fax filled)`);
    console.log(`  Conflicts logged:  ${conflictsLogged}`);
    console.log(`  Errors:            ${errors}`);

    if (!applyMode) {
      console.log('\n  Run with --apply to write changes to database.');
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
