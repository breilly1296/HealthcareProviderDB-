/**
 * Generate Data Quality Report from audit results
 *
 * Queries the data_quality_audit table and produces a summary report
 * showing discrepancy counts by severity, type, and actionability.
 *
 * Usage:
 *   npx tsx scripts/generate-dq-report.ts
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  try {
    console.log('\n📊 Data Quality Audit Report\n');
    console.log('='.repeat(70));

    // Overall counts
    const totalResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE resolved = true) as resolved,
        COUNT(*) FILTER (WHERE resolved = false) as unresolved
      FROM data_quality_audit
    `);

    const { total, resolved, unresolved } = totalResult.rows[0];
    console.log(`\nTotal audit records: ${total}`);
    console.log(`  Resolved: ${resolved}`);
    console.log(`  Unresolved: ${unresolved}`);

    // By severity
    console.log('\n--- By Severity ---');
    const bySeverity = await pool.query(`
      SELECT severity, COUNT(*) as count,
             COUNT(*) FILTER (WHERE resolved = false) as unresolved
      FROM data_quality_audit
      GROUP BY severity
      ORDER BY
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'WARNING' THEN 2
          WHEN 'INFO' THEN 3
        END
    `);

    for (const row of bySeverity.rows) {
      const marker = row.severity === 'CRITICAL' ? '🔴' : row.severity === 'WARNING' ? '🟡' : '🔵';
      console.log(`  ${marker} ${row.severity}: ${row.count} total (${row.unresolved} unresolved)`);
    }

    // By audit type
    console.log('\n--- By Audit Type ---');
    const byType = await pool.query(`
      SELECT audit_type, severity, COUNT(*) as count,
             COUNT(*) FILTER (WHERE resolved = false) as unresolved
      FROM data_quality_audit
      GROUP BY audit_type, severity
      ORDER BY
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'WARNING' THEN 2
          WHEN 'INFO' THEN 3
        END,
        count DESC
    `);

    for (const row of byType.rows) {
      console.log(`  ${row.audit_type} [${row.severity}]: ${row.count} (${row.unresolved} unresolved)`);
    }

    // Deactivated NPIs (CRITICAL - auto-fixable)
    console.log('\n--- Deactivated NPIs (Auto-fixable) ---');
    const deactivated = await pool.query(`
      SELECT dqa.npi, dqa.expected_value as deactivation_date,
             p.first_name, p.last_name, p.organization_name
      FROM data_quality_audit dqa
      JOIN providers p ON dqa.npi = p.npi
      WHERE dqa.audit_type = 'DEACTIVATED_NPI' AND dqa.resolved = false
      ORDER BY dqa.created_at DESC
      LIMIT 20
    `);

    if (deactivated.rows.length === 0) {
      console.log('  None found');
    } else {
      for (const row of deactivated.rows) {
        const name = row.organization_name || `${row.first_name} ${row.last_name}`;
        console.log(`  NPI ${row.npi}: ${name} (deactivated: ${row.deactivation_date})`);
      }
      if (deactivated.rows.length === 20) {
        console.log('  ... (showing first 20)');
      }
    }

    // NPIs not found in NPPES
    console.log('\n--- NPIs Not Found in NPPES ---');
    const notFound = await pool.query(`
      SELECT dqa.npi, p.first_name, p.last_name, p.organization_name
      FROM data_quality_audit dqa
      JOIN providers p ON dqa.npi = p.npi
      WHERE dqa.audit_type = 'NPI_NOT_FOUND' AND dqa.resolved = false
      ORDER BY dqa.created_at DESC
      LIMIT 20
    `);

    if (notFound.rows.length === 0) {
      console.log('  None found');
    } else {
      for (const row of notFound.rows) {
        const name = row.organization_name || `${row.first_name} ${row.last_name}`;
        console.log(`  NPI ${row.npi}: ${name}`);
      }
    }

    // Name mismatches (manual review)
    console.log('\n--- Name Mismatches (Manual Review) ---');
    const nameMismatch = await pool.query(`
      SELECT dqa.npi, dqa.field, dqa.current_value, dqa.expected_value
      FROM data_quality_audit dqa
      WHERE dqa.audit_type = 'NAME_MISMATCH' AND dqa.resolved = false
      ORDER BY dqa.created_at DESC
      LIMIT 10
    `);

    if (nameMismatch.rows.length === 0) {
      console.log('  None found');
    } else {
      for (const row of nameMismatch.rows) {
        console.log(`  NPI ${row.npi}: ${row.field} "${row.current_value}" -> "${row.expected_value}"`);
      }
    }

    // Actionability summary
    console.log('\n--- Actionability Summary ---');
    const autoFixable = await pool.query(`
      SELECT COUNT(*) as count FROM data_quality_audit
      WHERE audit_type IN ('DEACTIVATED_NPI', 'SPECIALTY_MISMATCH', 'CREDENTIAL_MISMATCH')
        AND resolved = false
    `);
    const manualReview = await pool.query(`
      SELECT COUNT(*) as count FROM data_quality_audit
      WHERE audit_type IN ('NAME_MISMATCH', 'NPI_NOT_FOUND')
        AND resolved = false
    `);
    const informational = await pool.query(`
      SELECT COUNT(*) as count FROM data_quality_audit
      WHERE audit_type = 'ADDRESS_MISMATCH'
        AND resolved = false
    `);

    console.log(`  Auto-fixable (update from NPPES):  ${autoFixable.rows[0].count}`);
    console.log(`  Manual review required:            ${manualReview.rows[0].count}`);
    console.log(`  Informational only:                ${informational.rows[0].count}`);

    // NPPES sync coverage
    console.log('\n--- NPPES Sync Coverage ---');
    const syncCoverage = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(nppes_last_synced) as synced,
        COUNT(*) - COUNT(nppes_last_synced) as unsynced,
        MIN(nppes_last_synced) as oldest_sync,
        MAX(nppes_last_synced) as newest_sync
      FROM providers
    `);

    const sc = syncCoverage.rows[0];
    console.log(`  Total providers:  ${sc.total}`);
    console.log(`  Synced with NPPES: ${sc.synced} (${Math.round(sc.synced / sc.total * 100)}%)`);
    console.log(`  Not yet synced:    ${sc.unsynced}`);
    if (sc.oldest_sync) {
      console.log(`  Oldest sync: ${new Date(sc.oldest_sync).toLocaleDateString()}`);
      console.log(`  Newest sync: ${new Date(sc.newest_sync).toLocaleDateString()}`);
    }

    console.log('\n' + '='.repeat(70));
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
