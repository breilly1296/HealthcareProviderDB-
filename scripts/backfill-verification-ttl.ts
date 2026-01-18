/**
 * Backfill TTL (expires_at) for Verification Tables
 *
 * Based on research showing 12% annual provider turnover, verifications
 * expire after 6 months from their last verification/creation date.
 *
 * Usage:
 *   npx tsx scripts/backfill-verification-ttl.ts          # DRY RUN
 *   npx tsx scripts/backfill-verification-ttl.ts --apply  # Apply changes
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

interface BackfillStats {
  tableName: string;
  totalRecords: number;
  withExpiresAt: number;
  toUpdate: number;
  withLastVerified?: number;
  withoutLastVerified?: number;
}

interface ExpiryBreakdown {
  tableName: string;
  alreadyExpired: number;
  expiringWithin1Month: number;
  expiring1To3Months: number;
  expiringAfter3Months: number;
}

async function analyzeTable(pool: pg.Pool, tableName: string): Promise<BackfillStats> {
  if (tableName === 'provider_plan_acceptance') {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_records,
        COUNT(expires_at) as with_expires_at,
        COUNT(*) - COUNT(expires_at) as to_update,
        COUNT(last_verified) as with_last_verified,
        COUNT(*) - COUNT(last_verified) as without_last_verified
      FROM provider_plan_acceptance
    `);
    const row = result.rows[0];
    return {
      tableName,
      totalRecords: parseInt(row.total_records),
      withExpiresAt: parseInt(row.with_expires_at),
      toUpdate: parseInt(row.to_update),
      withLastVerified: parseInt(row.with_last_verified),
      withoutLastVerified: parseInt(row.without_last_verified),
    };
  } else {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_records,
        COUNT(expires_at) as with_expires_at,
        COUNT(*) - COUNT(expires_at) as to_update
      FROM verification_logs
    `);
    const row = result.rows[0];
    return {
      tableName,
      totalRecords: parseInt(row.total_records),
      withExpiresAt: parseInt(row.with_expires_at),
      toUpdate: parseInt(row.to_update),
    };
  }
}

async function getExpiryBreakdown(pool: pg.Pool, tableName: string): Promise<ExpiryBreakdown> {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE expires_at < NOW()) as already_expired,
      COUNT(*) FILTER (WHERE expires_at >= NOW() AND expires_at < NOW() + INTERVAL '1 month') as expiring_1_month,
      COUNT(*) FILTER (WHERE expires_at >= NOW() + INTERVAL '1 month' AND expires_at < NOW() + INTERVAL '3 months') as expiring_1_to_3,
      COUNT(*) FILTER (WHERE expires_at >= NOW() + INTERVAL '3 months') as expiring_after_3
    FROM ${tableName}
    WHERE expires_at IS NOT NULL
  `);
  const row = result.rows[0];
  return {
    tableName,
    alreadyExpired: parseInt(row.already_expired || '0'),
    expiringWithin1Month: parseInt(row.expiring_1_month || '0'),
    expiring1To3Months: parseInt(row.expiring_1_to_3 || '0'),
    expiringAfter3Months: parseInt(row.expiring_after_3 || '0'),
  };
}

async function backfillProviderPlanAcceptance(client: pg.PoolClient): Promise<number> {
  // Update records with last_verified
  const result1 = await client.query(`
    UPDATE provider_plan_acceptance
    SET expires_at = last_verified + INTERVAL '6 months'
    WHERE last_verified IS NOT NULL
      AND expires_at IS NULL
  `);
  const updated1 = result1.rowCount || 0;

  // Update records without last_verified (use created_at)
  const result2 = await client.query(`
    UPDATE provider_plan_acceptance
    SET expires_at = created_at + INTERVAL '6 months'
    WHERE last_verified IS NULL
      AND expires_at IS NULL
  `);
  const updated2 = result2.rowCount || 0;

  return updated1 + updated2;
}

async function backfillVerificationLogs(client: pg.PoolClient): Promise<number> {
  const result = await client.query(`
    UPDATE verification_logs
    SET expires_at = created_at + INTERVAL '6 months'
    WHERE expires_at IS NULL
  `);
  return result.rowCount || 0;
}

function printStats(stats: BackfillStats) {
  console.log(`\n  ${stats.tableName}:`);
  console.log(`    Total records:        ${stats.totalRecords.toLocaleString()}`);
  console.log(`    Already has TTL:      ${stats.withExpiresAt.toLocaleString()}`);
  console.log(`    To update:            ${stats.toUpdate.toLocaleString()}`);
  if (stats.withLastVerified !== undefined) {
    console.log(`    With last_verified:   ${stats.withLastVerified.toLocaleString()}`);
    console.log(`    Using created_at:     ${stats.withoutLastVerified?.toLocaleString()}`);
  }
}

function printExpiryBreakdown(breakdown: ExpiryBreakdown) {
  console.log(`\n  ${breakdown.tableName}:`);
  console.log(`    Already expired:      ${breakdown.alreadyExpired.toLocaleString()}`);
  console.log(`    Expiring < 1 month:   ${breakdown.expiringWithin1Month.toLocaleString()}`);
  console.log(`    Expiring 1-3 months:  ${breakdown.expiring1To3Months.toLocaleString()}`);
  console.log(`    Expiring > 3 months:  ${breakdown.expiringAfter3Months.toLocaleString()}`);
}

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');

  console.log('\n' + '═'.repeat(80));
  console.log('BACKFILL VERIFICATION TTL (expires_at)');
  console.log('═'.repeat(80));
  console.log('\nTTL Policy: 6 months (based on 12% annual provider turnover)\n');

  if (!applyMode) {
    console.log('🔍 DRY RUN MODE - No changes will be made.');
    console.log('   Use --apply flag to apply changes.\n');
  } else {
    console.log('⚠️  APPLY MODE - Records will be updated.\n');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 3,
  });

  try {
    // Analyze before state
    console.log('─'.repeat(40));
    console.log('BEFORE BACKFILL:');
    console.log('─'.repeat(40));

    const ppaStatsBefore = await analyzeTable(pool, 'provider_plan_acceptance');
    const vlStatsBefore = await analyzeTable(pool, 'verification_logs');

    printStats(ppaStatsBefore);
    printStats(vlStatsBefore);

    if (ppaStatsBefore.toUpdate === 0 && vlStatsBefore.toUpdate === 0) {
      console.log('\n✅ All records already have expires_at set. Nothing to do!\n');

      // Show expiry breakdown
      console.log('─'.repeat(40));
      console.log('EXPIRY BREAKDOWN:');
      console.log('─'.repeat(40));

      const ppaBreakdown = await getExpiryBreakdown(pool, 'provider_plan_acceptance');
      const vlBreakdown = await getExpiryBreakdown(pool, 'verification_logs');

      printExpiryBreakdown(ppaBreakdown);
      printExpiryBreakdown(vlBreakdown);

      process.exit(0);
    }

    if (applyMode) {
      // Execute backfill in transaction
      console.log('\n' + '─'.repeat(40));
      console.log('APPLYING BACKFILL:');
      console.log('─'.repeat(40));

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        console.log('\n  Updating provider_plan_acceptance...');
        const ppaUpdated = await backfillProviderPlanAcceptance(client);
        console.log(`  ✓ Updated ${ppaUpdated.toLocaleString()} records`);

        console.log('\n  Updating verification_logs...');
        const vlUpdated = await backfillVerificationLogs(client);
        console.log(`  ✓ Updated ${vlUpdated.toLocaleString()} records`);

        await client.query('COMMIT');
        console.log('\n✅ Transaction committed successfully.');

      } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ Transaction rolled back:', error);
        throw error;
      } finally {
        client.release();
      }

      // Show after state
      console.log('\n' + '─'.repeat(40));
      console.log('AFTER BACKFILL:');
      console.log('─'.repeat(40));

      const ppaStatsAfter = await analyzeTable(pool, 'provider_plan_acceptance');
      const vlStatsAfter = await analyzeTable(pool, 'verification_logs');

      printStats(ppaStatsAfter);
      printStats(vlStatsAfter);

      // Show expiry breakdown
      console.log('\n' + '─'.repeat(40));
      console.log('EXPIRY BREAKDOWN:');
      console.log('─'.repeat(40));

      const ppaBreakdown = await getExpiryBreakdown(pool, 'provider_plan_acceptance');
      const vlBreakdown = await getExpiryBreakdown(pool, 'verification_logs');

      printExpiryBreakdown(ppaBreakdown);
      printExpiryBreakdown(vlBreakdown);

    } else {
      // Dry run summary
      console.log('\n' + '─'.repeat(40));
      console.log('DRY RUN SUMMARY:');
      console.log('─'.repeat(40));
      console.log(`\n  provider_plan_acceptance: ${ppaStatsBefore.toUpdate.toLocaleString()} records would be updated`);
      console.log(`  verification_logs:        ${vlStatsBefore.toUpdate.toLocaleString()} records would be updated`);
      console.log(`\n  TTL calculation:`);
      console.log(`    - provider_plan_acceptance: last_verified + 6 months (or created_at + 6 months if null)`);
      console.log(`    - verification_logs: created_at + 6 months`);
      console.log(`\n  To apply these changes, run:`);
      console.log(`    npx tsx scripts/backfill-verification-ttl.ts --apply\n`);
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
