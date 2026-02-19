/**
 * Import Enrichment CSVs into the database
 *
 * Imports practice-level enrichment data (names, websites, hospital systems,
 * insurance, hours, confidence) from specialty CSVs. This is the bridge
 * between our enrichment pipeline and the database.
 *
 * Data protection rules:
 *   - NEVER overwrite user_verification data
 *   - NEVER downgrade confidence scores
 *   - Phone: only update if current value is NULL
 *   - Conflicts logged to import_conflicts table
 *   - Sets data_source = 'enrichment' on updated records
 *
 * Usage:
 *   npx tsx scripts/import-enrichment-csv.ts ./data/dermatology.csv --specialty "Dermatology"
 *   npx tsx scripts/import-enrichment-csv.ts ./data/dermatology.csv --specialty "Dermatology" --apply
 *   npx tsx scripts/import-enrichment-csv.ts ./data/dermatology.csv --specialty "Dermatology" --apply --limit 100
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { createPool, preImportCheck } from './pre-import-check.js';

// Confidence score for enrichment CSV data
const ENRICHMENT_CSV_CONFIDENCE = 80;

// Data source priorities (higher = more authoritative)
const SOURCE_PRIORITY: Record<string, number> = {
  nppes: 10,
  hospital_scrape: 70,
  enrichment: 80,
  user_verification: 90,
};

interface ImportStats {
  totalRows: number;
  processed: number;
  providersUpdated: number;
  locationsUpdated: number;
  hospitalAffiliationsAdded: number;
  insuranceAcceptancesAdded: number;
  phoneFilled: number;
  conflictsLogged: number;
  skippedNpiNotFound: number;
  skippedNoNpi: number;
  skippedHigherPriority: number;
  errors: number;
}

// TODO: Finalize CSV column names once enrichment CSV format is decided.
// These are placeholder column names — update to match actual CSV headers.
interface EnrichmentCsvRow {
  npi: string;
  practice_name?: string;        // TODO: map to location display name or org name
  website_url?: string;           // TODO: map to provider_profile_url or new location field
  hospital_system?: string;       // TODO: upsert into provider_hospitals
  insurance_accepted?: string;    // TODO: semicolon-delimited plan list → ProviderPlanAcceptance
  phone?: string;                 // TODO: only fill if existing is NULL
  office_hours?: string;          // TODO: needs schema field — park for now
  confidence_level?: string;      // TODO: map to confidence on hospital/insurance records
  accepting_new_patients?: string; // TODO: needs schema field — park for now
}

/**
 * Parse a CSV line respecting quoted fields
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Parse CSV file into rows with header mapping
 */
function parseCsv(filePath: string): EnrichmentCsvRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim());

  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: EnrichmentCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (values[idx] !== undefined) {
        row[header.toLowerCase().trim()] = values[idx];
      }
    });
    rows.push(row as unknown as EnrichmentCsvRow);
  }

  return rows;
}

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/**
 * Check if the existing data_source has higher priority than our enrichment import.
 * Returns true if we should skip (existing is higher priority).
 */
function isHigherPriority(existingSource: string | null): boolean {
  const existingPriority = SOURCE_PRIORITY[existingSource || 'nppes'] || 0;
  return existingPriority > SOURCE_PRIORITY['enrichment'];
}

/**
 * Process a single provider's enrichment data
 */
async function processProvider(
  client: pg.PoolClient,
  row: EnrichmentCsvRow,
  specialty: string,
  sourceFile: string,
  stats: ImportStats,
  applyMode: boolean
): Promise<void> {
  const npi = row.npi;

  // Look up provider
  const provResult = await client.query(
    `SELECT npi, data_source, provider_profile_url, confidence_score
     FROM providers WHERE npi = $1`,
    [npi]
  );

  if (provResult.rows.length === 0) {
    stats.skippedNpiNotFound++;
    return;
  }

  const provider = provResult.rows[0];

  // Check if provider has user_verification data — never overwrite
  if (isHigherPriority(provider.data_source)) {
    stats.skippedHigherPriority++;
    return;
  }

  // --- Update provider-level enrichment fields ---

  // TODO: Map website_url to provider_profile_url
  // Only set if current is NULL or current source is lower priority
  if (row.website_url && row.website_url.trim()) {
    const url = row.website_url.trim();

    if (!provider.provider_profile_url) {
      if (applyMode) {
        await client.query(
          `UPDATE providers
           SET provider_profile_url = $1,
               data_source = 'enrichment',
               confidence_score = COALESCE(confidence_score, $2)
           WHERE npi = $3`,
          [url, ENRICHMENT_CSV_CONFIDENCE, npi]
        );
      }
      stats.providersUpdated++;
    } else if (provider.provider_profile_url !== url) {
      // Conflict: we have a URL but it differs
      if (applyMode) {
        await client.query(
          `INSERT INTO import_conflicts (npi, table_name, field_name, current_value, incoming_value, current_source, incoming_source)
           VALUES ($1, 'providers', 'provider_profile_url', $2, $3, $4, 'enrichment')`,
          [npi, provider.provider_profile_url, url, provider.data_source || 'nppes']
        );
      }
      stats.conflictsLogged++;
    }
  }

  // --- Update practice location enrichment fields ---

  // Find the provider's practice locations
  const locResult = await client.query(
    `SELECT id, phone, fax, data_source
     FROM practice_locations
     WHERE npi = $1 AND address_type = 'practice'
     ORDER BY id
     LIMIT 1`,
    [npi]
  );

  if (locResult.rows.length > 0) {
    const loc = locResult.rows[0];

    // TODO: Map phone column from CSV
    // Phone: only update if current is NULL
    if (row.phone && row.phone.trim()) {
      const incomingPhone = row.phone.trim();

      if (!loc.phone) {
        if (applyMode) {
          await client.query(
            `UPDATE practice_locations
             SET phone = $1,
                 data_source = 'enrichment',
                 enriched_at = NOW(),
                 enrichment_source = $2
             WHERE id = $3`,
            [incomingPhone, sourceFile, loc.id]
          );
        }
        stats.phoneFilled++;
        stats.locationsUpdated++;
      } else if (digitsOnly(loc.phone) !== digitsOnly(incomingPhone)) {
        // Phone exists and differs — log conflict, don't overwrite
        if (applyMode) {
          await client.query(
            `INSERT INTO import_conflicts (npi, table_name, field_name, current_value, incoming_value, current_source, incoming_source)
             VALUES ($1, 'practice_locations', 'phone', $2, $3, $4, 'enrichment')`,
            [npi, loc.phone, incomingPhone, loc.data_source || 'nppes']
          );
        }
        stats.conflictsLogged++;
      }
    }

    // Mark location as enriched even if only other fields changed
    // TODO: Update this when more location-level fields are mapped
  }

  // --- Hospital system affiliation ---

  // TODO: Map hospital_system column from CSV
  if (row.hospital_system && row.hospital_system.trim()) {
    const system = row.hospital_system.trim();

    // Check if this affiliation already exists
    const existingHosp = await client.query(
      `SELECT id FROM provider_hospitals
       WHERE npi = $1 AND hospital_system = $2`,
      [npi, system]
    );

    if (existingHosp.rows.length === 0) {
      if (applyMode) {
        // TODO: Determine confidence from CSV confidence_level column
        const confidence = row.confidence_level || 'MEDIUM';
        await client.query(
          `INSERT INTO provider_hospitals (npi, hospital_system, source, confidence)
           VALUES ($1, $2, 'enrichment_csv', $3)`,
          [npi, system, confidence]
        );
      }
      stats.hospitalAffiliationsAdded++;
    }
  }

  // --- Insurance acceptance ---

  // TODO: Map insurance_accepted column from CSV
  // Expected format: semicolon-delimited plan names (e.g., "Aetna HMO; Blue Cross PPO; United")
  if (row.insurance_accepted && row.insurance_accepted.trim() && row.insurance_accepted !== 'NOT_FOUND') {
    const plans = row.insurance_accepted
      .split(';')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    for (const planName of plans) {
      // TODO: Use parsePlanList from insurancePlanParser for better normalization
      // For now, check by raw plan name match against existing plans
      const existingPlan = await client.query(
        `SELECT plan_id FROM insurance_plans WHERE plan_name = $1 LIMIT 1`,
        [planName]
      );

      if (existingPlan.rows.length > 0) {
        const planId = existingPlan.rows[0].plan_id;

        // Check if acceptance already exists
        const existingAcceptance = await client.query(
          `SELECT id, confidence_score FROM provider_plan_acceptance
           WHERE npi = $1 AND plan_id = $2`,
          [npi, planId]
        );

        if (existingAcceptance.rows.length === 0) {
          if (applyMode) {
            await client.query(
              `INSERT INTO provider_plan_acceptance (npi, plan_id, acceptance_status, confidence_score, last_verified, verification_count)
               VALUES ($1, $2, 'ACCEPTED', $3, NOW(), 1)`,
              [npi, planId, ENRICHMENT_CSV_CONFIDENCE]
            );
          }
          stats.insuranceAcceptancesAdded++;
        } else {
          const existing = existingAcceptance.rows[0];
          // Never downgrade confidence
          if (existing.confidence_score > ENRICHMENT_CSV_CONFIDENCE) {
            if (applyMode) {
              await client.query(
                `INSERT INTO import_conflicts (npi, table_name, field_name, current_value, incoming_value, current_source, incoming_source)
                 VALUES ($1, 'provider_plan_acceptance', 'confidence_score', $2, $3, 'user_verification', 'enrichment')`,
                [npi, String(existing.confidence_score), String(ENRICHMENT_CSV_CONFIDENCE)]
              );
            }
            stats.conflictsLogged++;
          }
        }
      }
      // If plan not found in insurance_plans table, skip silently.
      // TODO: Consider auto-creating plans or logging unmatched plan names.
    }
  }

  // --- Fields that need schema additions (parked) ---

  // TODO: office_hours — needs a new column on practice_locations or a separate table
  // if (row.office_hours) { ... }

  // TODO: accepting_new_patients — needs a new column on providers or practice_locations
  // if (row.accepting_new_patients) { ... }
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const applyMode = args.includes('--apply');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : 0;
  const specialtyIdx = args.indexOf('--specialty');
  const specialty = specialtyIdx !== -1 ? args[specialtyIdx + 1] : 'Unknown';

  // Find CSV file path (first arg that doesn't start with --)
  const csvPath = args.find(a => !a.startsWith('--') && a !== specialty && a !== String(limit));

  if (!csvPath) {
    console.log('Usage: npx tsx scripts/import-enrichment-csv.ts <csv-file> --specialty <name> [--apply] [--limit N]');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx scripts/import-enrichment-csv.ts ./data/dermatology.csv --specialty "Dermatology"');
    console.log('  npx tsx scripts/import-enrichment-csv.ts ./data/dermatology.csv --specialty "Dermatology" --apply');
    console.log('  npx tsx scripts/import-enrichment-csv.ts ./data/dermatology.csv --specialty "Dermatology" --apply --limit 50');
    process.exit(1);
  }

  const absolutePath = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found: ${absolutePath}`);
    process.exit(1);
  }

  const sourceFile = path.basename(absolutePath);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable not set');
    process.exit(1);
  }

  // Pre-import safety check
  await preImportCheck(databaseUrl);

  console.log('📥 Enrichment CSV Import\n');
  console.log('='.repeat(70));
  console.log(`Mode:      ${applyMode ? 'APPLY' : 'DRY RUN'}`);
  console.log(`File:      ${sourceFile}`);
  console.log(`Specialty: ${specialty}`);
  console.log(`Limit:     ${limit || 'ALL'}`);
  console.log(`Source:    enrichment (priority ${SOURCE_PRIORITY['enrichment']})`);
  console.log('='.repeat(70));

  // Parse CSV
  const rows = parseCsv(absolutePath);
  console.log(`\nFound ${rows.length} rows in CSV\n`);

  const stats: ImportStats = {
    totalRows: rows.length,
    processed: 0,
    providersUpdated: 0,
    locationsUpdated: 0,
    hospitalAffiliationsAdded: 0,
    insuranceAcceptancesAdded: 0,
    phoneFilled: 0,
    conflictsLogged: 0,
    skippedNpiNotFound: 0,
    skippedNoNpi: 0,
    skippedHigherPriority: 0,
    errors: 0,
  };

  const pool = createPool(databaseUrl, 3);

  try {
    const rowsToProcess = limit ? rows.slice(0, limit) : rows;

    for (const row of rowsToProcess) {
      // TODO: Map NPI column name from CSV (might be "NPI", "npi", "Provider_NPI", etc.)
      const npi = row.npi;

      if (!npi || npi.length !== 10) {
        stats.skippedNoNpi++;
        stats.processed++;
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await processProvider(client, row, specialty, sourceFile, stats, applyMode);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        stats.errors++;
        if (stats.errors <= 5) {
          console.error(`\nError processing NPI ${npi}:`, err);
        }
      } finally {
        client.release();
      }

      stats.processed++;

      // Progress logging
      if (stats.processed % 100 === 0 || stats.processed === rowsToProcess.length) {
        const pct = Math.round((stats.processed / rowsToProcess.length) * 100);
        process.stdout.write(
          `\r  Processed: ${stats.processed}/${rowsToProcess.length} (${pct}%) | Updated: ${stats.providersUpdated} | Hospitals: +${stats.hospitalAffiliationsAdded} | Insurance: +${stats.insuranceAcceptancesAdded} | Conflicts: ${stats.conflictsLogged} | Errors: ${stats.errors}`
        );
      }
    }

    // Final summary
    console.log('\n\n' + '='.repeat(70));
    console.log(`ENRICHMENT IMPORT COMPLETE — ${specialty}`);
    console.log(`Finished at: ${new Date().toISOString()}`);
    console.log('='.repeat(70));
    console.log(`  Total rows in CSV:           ${stats.totalRows}`);
    console.log(`  Processed:                   ${stats.processed}`);
    console.log(`  Skipped (no NPI):            ${stats.skippedNoNpi}`);
    console.log(`  Skipped (NPI not in DB):     ${stats.skippedNpiNotFound}`);
    console.log(`  Skipped (higher priority):   ${stats.skippedHigherPriority}`);
    console.log(`  Errors:                      ${stats.errors}`);
    console.log('  ' + '-'.repeat(45));
    console.log(`  Providers updated:           ${stats.providersUpdated}`);
    console.log(`  Locations updated:           ${stats.locationsUpdated}`);
    console.log(`  Phone numbers filled:        ${stats.phoneFilled}`);
    console.log(`  Hospital affiliations added: ${stats.hospitalAffiliationsAdded}`);
    console.log(`  Insurance acceptances added: ${stats.insuranceAcceptancesAdded}`);
    console.log(`  Conflicts logged:            ${stats.conflictsLogged}`);
    console.log('='.repeat(70));

    if (!applyMode) {
      console.log('\n  This was a DRY RUN. Run with --apply to write changes to database.\n');
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
