/**
 * Cleanup Deactivated Providers Script
 *
 * Removes deactivated NPI providers from the database.
 * Hard-deletes providers along with their related records.
 *
 * Usage:
 *   npx tsx scripts/cleanup-deactivated-providers.ts          # DRY RUN (preview)
 *   npx tsx scripts/cleanup-deactivated-providers.ts --apply  # Apply deletion
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// ============================================================================
// TYPES
// ============================================================================

interface DeactivatedProvider {
  npi: string;
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
  state: string;
  specialty: string | null;
  deactivationDate: Date | null;
}

interface CleanupStats {
  totalDeactivated: number;
  byState: Record<string, number>;
  bySpecialty: Record<string, number>;
  sampleProviders: DeactivatedProvider[];
}

interface DeletionResult {
  verificationLogsDeleted: number;
  planAcceptancesDeleted: number;
  providersDeleted: number;
}

// ============================================================================
// COLUMN DETECTION
// ============================================================================

type DeactivationColumnInfo = {
  column: string;
  condition: string;
  dateColumn: string | null;
};

async function detectDeactivationColumn(pool: pg.Pool): Promise<DeactivationColumnInfo | null> {
  // Check which columns exist in the providers table
  const columnsResult = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'providers'
  `);

  const columns = new Set(columnsResult.rows.map(r => r.column_name));

  // Priority order for detecting deactivation:
  // 1. npi_status = 'DEACTIVATED'
  // 2. status = 'DEACTIVATED' or 'deactivated'
  // 3. npi_deactivation_date IS NOT NULL (and no reactivation)
  // 4. deactivation_date IS NOT NULL (and no reactivation)

  if (columns.has('npi_status')) {
    return {
      column: 'npi_status',
      condition: `npi_status = 'DEACTIVATED'`,
      dateColumn: columns.has('deactivation_date') ? 'deactivation_date' : null,
    };
  }

  if (columns.has('status')) {
    return {
      column: 'status',
      condition: `status IN ('DEACTIVATED', 'deactivated', 'inactive', 'INACTIVE')`,
      dateColumn: columns.has('deactivation_date') ? 'deactivation_date' : null,
    };
  }

  if (columns.has('npi_deactivation_date')) {
    const hasReactivation = columns.has('npi_reactivation_date');
    return {
      column: 'npi_deactivation_date',
      condition: hasReactivation
        ? `npi_deactivation_date IS NOT NULL AND (npi_reactivation_date IS NULL OR npi_reactivation_date < npi_deactivation_date)`
        : `npi_deactivation_date IS NOT NULL`,
      dateColumn: 'npi_deactivation_date',
    };
  }

  if (columns.has('deactivation_date')) {
    const hasReactivation = columns.has('reactivation_date');
    return {
      column: 'deactivation_date',
      condition: hasReactivation
        ? `deactivation_date IS NOT NULL AND (reactivation_date IS NULL OR reactivation_date < deactivation_date)`
        : `deactivation_date IS NOT NULL`,
      dateColumn: 'deactivation_date',
    };
  }

  return null;
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

async function analyzeDeactivatedProviders(
  pool: pg.Pool,
  columnInfo: DeactivationColumnInfo
): Promise<CleanupStats> {
  console.log(`\n📊 Analyzing deactivated providers...`);
  console.log(`   Using column: ${columnInfo.column}`);
  console.log(`   Condition: ${columnInfo.condition}\n`);

  // Total count
  const totalResult = await pool.query(`
    SELECT COUNT(*) as count
    FROM providers
    WHERE ${columnInfo.condition}
  `);
  const totalDeactivated = parseInt(totalResult.rows[0].count);

  // By state
  const byStateResult = await pool.query(`
    SELECT state, COUNT(*) as count
    FROM providers
    WHERE ${columnInfo.condition}
    GROUP BY state
    ORDER BY count DESC
  `);
  const byState: Record<string, number> = {};
  for (const row of byStateResult.rows) {
    byState[row.state || 'NULL'] = parseInt(row.count);
  }

  // By specialty
  const bySpecialtyResult = await pool.query(`
    SELECT COALESCE(specialty, specialty_code, 'Unknown') as specialty, COUNT(*) as count
    FROM providers
    WHERE ${columnInfo.condition}
    GROUP BY COALESCE(specialty, specialty_code, 'Unknown')
    ORDER BY count DESC
    LIMIT 20
  `);
  const bySpecialty: Record<string, number> = {};
  for (const row of bySpecialtyResult.rows) {
    bySpecialty[row.specialty || 'Unknown'] = parseInt(row.count);
  }

  // Sample providers
  const dateSelect = columnInfo.dateColumn
    ? `, ${columnInfo.dateColumn} as deactivation_date`
    : ', NULL as deactivation_date';

  const sampleResult = await pool.query(`
    SELECT
      npi,
      first_name,
      last_name,
      organization_name,
      state,
      COALESCE(specialty, specialty_code) as specialty
      ${dateSelect}
    FROM providers
    WHERE ${columnInfo.condition}
    ORDER BY RANDOM()
    LIMIT 10
  `);

  const sampleProviders: DeactivatedProvider[] = sampleResult.rows.map(row => ({
    npi: row.npi,
    firstName: row.first_name,
    lastName: row.last_name,
    organizationName: row.organization_name,
    state: row.state,
    specialty: row.specialty,
    deactivationDate: row.deactivation_date,
  }));

  return {
    totalDeactivated,
    byState,
    bySpecialty,
    sampleProviders,
  };
}

// ============================================================================
// DELETION FUNCTIONS
// ============================================================================

async function deleteDeactivatedProviders(
  pool: pg.Pool,
  columnInfo: DeactivationColumnInfo
): Promise<DeletionResult> {
  console.log('\n🗑️  Deleting deactivated providers in transaction...\n');

  const client = await pool.connect();
  const result: DeletionResult = {
    verificationLogsDeleted: 0,
    planAcceptancesDeleted: 0,
    providersDeleted: 0,
  };

  try {
    await client.query('BEGIN');

    // Step 1: Get list of NPIs to delete
    const npisResult = await client.query(`
      SELECT npi FROM providers WHERE ${columnInfo.condition}
    `);
    const npis = npisResult.rows.map(r => r.npi);

    if (npis.length === 0) {
      console.log('   No deactivated providers found to delete.');
      await client.query('COMMIT');
      return result;
    }

    console.log(`   Found ${npis.length.toLocaleString()} deactivated providers to delete.`);

    // Step 2: Delete verification_logs for these providers
    console.log('\n   Step 1/3: Deleting verification_logs...');
    const verLogsResult = await client.query(`
      DELETE FROM verification_logs
      WHERE provider_npi = ANY($1)
    `, [npis]);
    result.verificationLogsDeleted = verLogsResult.rowCount || 0;
    console.log(`   ✓ Deleted ${result.verificationLogsDeleted.toLocaleString()} verification_logs records`);

    // Step 3: Delete provider_plan_acceptance for these providers
    console.log('\n   Step 2/3: Deleting provider_plan_acceptance...');
    const planAccResult = await client.query(`
      DELETE FROM provider_plan_acceptance
      WHERE npi = ANY($1)
    `, [npis]);
    result.planAcceptancesDeleted = planAccResult.rowCount || 0;
    console.log(`   ✓ Deleted ${result.planAcceptancesDeleted.toLocaleString()} provider_plan_acceptance records`);

    // Step 4: Delete providers
    console.log('\n   Step 3/3: Deleting providers...');
    const providersResult = await client.query(`
      DELETE FROM providers
      WHERE ${columnInfo.condition}
    `);
    result.providersDeleted = providersResult.rowCount || 0;
    console.log(`   ✓ Deleted ${result.providersDeleted.toLocaleString()} provider records`);

    await client.query('COMMIT');
    console.log('\n✅ Transaction committed successfully.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Transaction rolled back due to error:', error);
    throw error;
  } finally {
    client.release();
  }

  return result;
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

function printStats(stats: CleanupStats) {
  console.log('\n' + '═'.repeat(80));
  console.log('DEACTIVATED PROVIDERS ANALYSIS');
  console.log('═'.repeat(80));

  console.log(`\nTotal deactivated providers: ${stats.totalDeactivated.toLocaleString()}`);

  // By State
  console.log('\n' + '─'.repeat(40));
  console.log('Breakdown by State (top 15):');
  console.log('─'.repeat(40));
  const stateEntries = Object.entries(stats.byState).slice(0, 15);
  for (const [state, count] of stateEntries) {
    const pct = ((count / stats.totalDeactivated) * 100).toFixed(1);
    console.log(`  ${state.padEnd(5)} ${count.toLocaleString().padStart(10)}  (${pct}%)`);
  }
  if (Object.keys(stats.byState).length > 15) {
    console.log(`  ... and ${Object.keys(stats.byState).length - 15} more states`);
  }

  // By Specialty
  console.log('\n' + '─'.repeat(40));
  console.log('Breakdown by Specialty (top 15):');
  console.log('─'.repeat(40));
  const specialtyEntries = Object.entries(stats.bySpecialty).slice(0, 15);
  for (const [specialty, count] of specialtyEntries) {
    const pct = ((count / stats.totalDeactivated) * 100).toFixed(1);
    const displaySpecialty = specialty.length > 35 ? specialty.substring(0, 32) + '...' : specialty;
    console.log(`  ${displaySpecialty.padEnd(38)} ${count.toLocaleString().padStart(8)}  (${pct}%)`);
  }

  // Sample Providers
  console.log('\n' + '─'.repeat(40));
  console.log('Sample of 10 Providers to be Deleted:');
  console.log('─'.repeat(40));

  if (stats.sampleProviders.length === 0) {
    console.log('  (no providers found)');
  } else {
    for (const provider of stats.sampleProviders) {
      const name = provider.organizationName
        || `${provider.firstName || ''} ${provider.lastName || ''}`.trim()
        || '(unnamed)';
      const displayName = name.length > 40 ? name.substring(0, 37) + '...' : name;
      const deactDate = provider.deactivationDate
        ? new Date(provider.deactivationDate).toISOString().split('T')[0]
        : 'N/A';
      console.log(`  NPI: ${provider.npi}  ${provider.state.padEnd(3)} ${displayName.padEnd(42)} Deact: ${deactDate}`);
    }
  }
}

function printRecommendation() {
  console.log('\n' + '═'.repeat(80));
  console.log('RECOMMENDATION');
  console.log('═'.repeat(80));
  console.log(`
To prevent importing deactivated providers in the future, update your import
script to filter them out during import. In import-npi-direct.ts, add a check:

  // Skip deactivated providers during import
  if (record['NPI Deactivation Date'] && !record['NPI Reactivation Date']) {
    stats.skippedRecords++;
    continue;
  }

  // Or for reactivated-then-deactivated-again:
  const deactDate = parseDate(record['NPI Deactivation Date']);
  const reactDate = parseDate(record['NPI Reactivation Date']);
  if (deactDate && (!reactDate || reactDate < deactDate)) {
    stats.skippedRecords++;
    continue;
  }

This will skip deactivated NPIs at import time, reducing database size and
eliminating the need for periodic cleanup.
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');

  console.log('\n' + '═'.repeat(80));
  console.log('CLEANUP DEACTIVATED PROVIDERS');
  console.log('═'.repeat(80));

  if (!applyMode) {
    console.log('\n🔍 DRY RUN MODE - No records will be deleted.');
    console.log('   Use --apply flag to delete records.');
  } else {
    console.log('\n⚠️  APPLY MODE - Records will be permanently deleted!');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('\n❌ Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 3,
  });

  try {
    // Detect deactivation column
    const columnInfo = await detectDeactivationColumn(pool);

    if (!columnInfo) {
      console.log('\n⚠️  No deactivation column found in providers table.');
      console.log('   Checked for: npi_status, status, npi_deactivation_date, deactivation_date');
      console.log('\n   Available columns:');

      const columnsResult = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'providers'
        ORDER BY ordinal_position
      `);
      for (const row of columnsResult.rows) {
        console.log(`     - ${row.column_name}`);
      }

      console.log('\n   No deactivated providers to clean up.');
      process.exit(0);
    }

    // Analyze deactivated providers
    const stats = await analyzeDeactivatedProviders(pool, columnInfo);
    printStats(stats);

    if (stats.totalDeactivated === 0) {
      console.log('\n✅ No deactivated providers found. Database is clean!');
      process.exit(0);
    }

    if (applyMode) {
      // Delete providers
      const result = await deleteDeactivatedProviders(pool, columnInfo);

      // Print summary
      console.log('\n' + '═'.repeat(80));
      console.log('DELETION SUMMARY');
      console.log('═'.repeat(80));
      console.log(`  Verification logs deleted:     ${result.verificationLogsDeleted.toLocaleString()}`);
      console.log(`  Plan acceptances deleted:      ${result.planAcceptancesDeleted.toLocaleString()}`);
      console.log(`  Providers deleted:             ${result.providersDeleted.toLocaleString()}`);

      // Verify
      const verifyResult = await pool.query(`
        SELECT COUNT(*) as count FROM providers WHERE ${columnInfo.condition}
      `);
      const remaining = parseInt(verifyResult.rows[0].count);
      console.log(`\n  Remaining deactivated:         ${remaining.toLocaleString()}`);

      if (remaining === 0) {
        console.log('\n✅ All deactivated providers have been removed!');
      } else {
        console.log('\n⚠️  Some deactivated providers may still remain.');
      }

    } else {
      // Dry run summary
      console.log('\n' + '═'.repeat(80));
      console.log('DRY RUN SUMMARY');
      console.log('═'.repeat(80));
      console.log(`\n  ${stats.totalDeactivated.toLocaleString()} providers would be deleted.`);
      console.log(`  Related verification_logs and provider_plan_acceptance records would also be deleted.`);
      console.log(`\n  To delete these records, run:`);
      console.log(`    npx tsx scripts/cleanup-deactivated-providers.ts --apply`);
    }

    // Print recommendation
    printRecommendation();

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
