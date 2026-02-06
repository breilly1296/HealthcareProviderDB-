/**
 * Cross-validate providers against NPPES Registry
 *
 * Queries providers in batches and compares local data against
 * the official NPPES API to find discrepancies.
 *
 * Discrepancy types:
 *   CRITICAL: Deactivated NPI, NPI not found in NPPES
 *   WARNING:  Name mismatch, specialty mismatch, credential mismatch
 *   INFO:     Address mismatch (addresses change frequently)
 *
 * Usage:
 *   npx tsx scripts/audit-npi-validation.ts                    # Dry run (100 NPIs)
 *   npx tsx scripts/audit-npi-validation.ts --limit 500        # Dry run (500 NPIs)
 *   npx tsx scripts/audit-npi-validation.ts --apply            # Full run, writes to DB
 *   npx tsx scripts/audit-npi-validation.ts --apply --resume   # Resume from last synced
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const NPPES_API_URL = 'https://npiregistry.cms.hhs.gov/api/?version=2.1';
const BATCH_SIZE = 50;
const RATE_LIMIT_DELAY_MS = 1000;

interface NppesResult {
  enumeration_type: string;
  number: string;
  basic: {
    first_name?: string;
    last_name?: string;
    credential?: string;
    organization_name?: string;
    status: string;
    enumeration_date?: string;
    last_updated?: string;
    deactivation_date?: string;
  };
  taxonomies?: Array<{
    code: string;
    desc: string;
    primary: boolean;
  }>;
  addresses?: Array<{
    address_purpose: string;
    address_1: string;
    city: string;
    state: string;
    postal_code: string;
  }>;
}

interface Discrepancy {
  npi: string;
  auditType: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  field: string | null;
  currentValue: string | null;
  expectedValue: string | null;
  details: string | null;
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

function compareProvider(
  local: Record<string, unknown>,
  nppes: NppesResult
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];
  const npi = local.npi as string;

  // CRITICAL: Check deactivation status
  if (nppes.basic.status === 'D' && !local.deactivation_date) {
    discrepancies.push({
      npi,
      auditType: 'DEACTIVATED_NPI',
      severity: 'CRITICAL',
      field: 'deactivation_date',
      currentValue: null,
      expectedValue: nppes.basic.deactivation_date || 'deactivated',
      details: 'NPI is deactivated in NPPES but active in local database',
    });
  }

  // WARNING: Name mismatch (for individuals)
  if (local.entity_type === '1') {
    const nppesFirst = (nppes.basic.first_name || '').toLowerCase().trim();
    const localFirst = (local.first_name as string || '').toLowerCase().trim();
    if (nppesFirst && localFirst && nppesFirst !== localFirst) {
      discrepancies.push({
        npi,
        auditType: 'NAME_MISMATCH',
        severity: 'WARNING',
        field: 'first_name',
        currentValue: local.first_name as string,
        expectedValue: nppes.basic.first_name || null,
        details: null,
      });
    }

    const nppesLast = (nppes.basic.last_name || '').toLowerCase().trim();
    const localLast = (local.last_name as string || '').toLowerCase().trim();
    if (nppesLast && localLast && nppesLast !== localLast) {
      discrepancies.push({
        npi,
        auditType: 'NAME_MISMATCH',
        severity: 'WARNING',
        field: 'last_name',
        currentValue: local.last_name as string,
        expectedValue: nppes.basic.last_name || null,
        details: null,
      });
    }
  }

  // WARNING: Credential mismatch
  const nppesCredential = (nppes.basic.credential || '').toLowerCase().trim();
  const localCredential = (local.credential as string || '').toLowerCase().trim();
  if (nppesCredential && localCredential && nppesCredential !== localCredential) {
    discrepancies.push({
      npi,
      auditType: 'CREDENTIAL_MISMATCH',
      severity: 'WARNING',
      field: 'credential',
      currentValue: local.credential as string,
      expectedValue: nppes.basic.credential || null,
      details: null,
    });
  }

  // WARNING: Specialty/taxonomy mismatch
  const primaryTaxonomy = nppes.taxonomies?.find(t => t.primary);
  if (primaryTaxonomy) {
    const nppesCode = primaryTaxonomy.code.trim();
    const localCode = (local.primary_taxonomy_code as string || '').trim();
    if (localCode && nppesCode !== localCode) {
      discrepancies.push({
        npi,
        auditType: 'SPECIALTY_MISMATCH',
        severity: 'WARNING',
        field: 'primary_taxonomy_code',
        currentValue: local.primary_taxonomy_code as string,
        expectedValue: nppesCode,
        details: `NPPES: ${primaryTaxonomy.desc}`,
      });
    }
  }

  // INFO: Address mismatch (practice address)
  const nppesAddr = nppes.addresses?.find(a => a.address_purpose === 'LOCATION');
  if (nppesAddr) {
    const nppesState = (nppesAddr.state || '').toUpperCase().trim();
    // Check against practice_locations from local data
    const localLocations = local.locations as Array<{ state?: string; city?: string }> | undefined;
    if (localLocations && localLocations.length > 0) {
      const localStates = localLocations.map(l => (l.state || '').toUpperCase().trim());
      if (nppesState && localStates.length > 0 && !localStates.includes(nppesState)) {
        discrepancies.push({
          npi,
          auditType: 'ADDRESS_MISMATCH',
          severity: 'INFO',
          field: 'state',
          currentValue: localStates.join(', '),
          expectedValue: nppesState,
          details: 'Practice state differs from NPPES',
        });
      }
    }
  }

  return discrepancies;
}

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const resumeMode = args.includes('--resume');
  const limitArg = args.indexOf('--limit');
  const limit = limitArg !== -1 ? parseInt(args[limitArg + 1]) : (applyMode ? 0 : 100);

  console.log('\n🔍 NPI Validation Audit\n');
  console.log('='.repeat(70));
  console.log(`Mode: ${applyMode ? 'APPLY (writing to DB)' : 'DRY RUN'}`);
  console.log(`Resume: ${resumeMode ? 'Yes (from nppes_last_synced)' : 'No'}`);
  console.log(`Limit: ${limit || 'ALL'}`);
  console.log('='.repeat(70));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
  });

  try {
    // Count total providers to process
    let countQuery = 'SELECT COUNT(*) as total FROM providers';
    if (resumeMode) {
      countQuery += ' WHERE nppes_last_synced IS NULL';
    }
    const countResult = await pool.query(countQuery);
    const totalProviders = parseInt(countResult.rows[0].total);
    console.log(`\nProviders to process: ${totalProviders}`);

    let processed = 0;
    let discrepancyCount = 0;
    let byCritical = 0;
    let byWarning = 0;
    let byInfo = 0;
    let cursor: string | null = null;
    const allDiscrepancies: Discrepancy[] = [];
    const allProcessedNpis: string[] = [];

    while (true) {
      // Fetch batch with cursor-based pagination
      let query = `
        SELECT p.npi, p.entity_type, p.first_name, p.last_name, p.credential,
               p.organization_name, p.primary_taxonomy_code, p.primary_specialty,
               p.deactivation_date,
               json_agg(json_build_object('state', pl.state, 'city', pl.city)) as locations
        FROM providers p
        LEFT JOIN practice_locations pl ON p.npi = pl.npi
      `;
      const params: string[] = [];
      const conditions: string[] = [];

      if (resumeMode) {
        conditions.push('p.nppes_last_synced IS NULL');
      }
      if (cursor) {
        conditions.push(`p.npi > $${params.length + 1}`);
        params.push(cursor);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      const remaining = limit ? limit - processed : BATCH_SIZE;
      const batchLimit = Math.min(BATCH_SIZE, remaining);
      query += ' GROUP BY p.npi ORDER BY p.npi LIMIT $' + (params.length + 1);
      params.push(String(batchLimit));

      const batch = await pool.query(query, params);

      if (batch.rows.length === 0) break;

      // Process each provider in the batch
      for (const row of batch.rows) {
        allProcessedNpis.push(row.npi);
        const nppes = await fetchNppes(row.npi);

        if (!nppes) {
          allDiscrepancies.push({
            npi: row.npi,
            auditType: 'NPI_NOT_FOUND',
            severity: 'CRITICAL',
            field: null,
            currentValue: null,
            expectedValue: null,
            details: 'NPI not found in NPPES registry',
          });
          byCritical++;
          discrepancyCount++;
        } else {
          const issues = compareProvider(row, nppes);
          for (const issue of issues) {
            if (issue.severity === 'CRITICAL') byCritical++;
            else if (issue.severity === 'WARNING') byWarning++;
            else byInfo++;
          }
          allDiscrepancies.push(...issues);
          discrepancyCount += issues.length;
        }

        processed++;
      }

      cursor = batch.rows[batch.rows.length - 1].npi;

      // Progress log
      const pct = limit
        ? Math.min(100, Math.round((processed / limit) * 100))
        : Math.round((processed / totalProviders) * 100);
      process.stdout.write(
        `\r  Processed: ${processed}/${limit || totalProviders} (${pct}%) | Discrepancies: ${discrepancyCount} (C:${byCritical} W:${byWarning} I:${byInfo})`
      );

      if (limit && processed >= limit) break;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }

    console.log('\n');

    // Write results to DB if in apply mode
    if (applyMode) {
      if (allDiscrepancies.length > 0) {
        console.log('Writing discrepancies to data_quality_audit table...');

        for (const d of allDiscrepancies) {
          await pool.query(
            `INSERT INTO data_quality_audit (npi, audit_type, severity, field, current_value, expected_value, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [d.npi, d.auditType, d.severity, d.field, d.currentValue, d.expectedValue, d.details]
          );
        }

        console.log(`  Wrote ${allDiscrepancies.length} audit records`);
      }

      // Update nppes_last_synced for ALL processed providers (not just those with discrepancies)
      if (allProcessedNpis.length > 0) {
        console.log(`Updating nppes_last_synced for ${allProcessedNpis.length} processed providers...`);
        const SYNC_BATCH = 500;
        for (let i = 0; i < allProcessedNpis.length; i += SYNC_BATCH) {
          const chunk = allProcessedNpis.slice(i, i + SYNC_BATCH);
          const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
          await pool.query(
            `UPDATE providers SET nppes_last_synced = NOW() WHERE npi IN (${placeholders})`,
            chunk
          );
        }
        console.log(`  Updated nppes_last_synced for ${allProcessedNpis.length} providers`);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('AUDIT SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Providers processed: ${processed}`);
    console.log(`  Total discrepancies: ${discrepancyCount}`);
    console.log(`    CRITICAL: ${byCritical}`);
    console.log(`    WARNING:  ${byWarning}`);
    console.log(`    INFO:     ${byInfo}`);

    // Breakdown by type
    const byType = new Map<string, number>();
    for (const d of allDiscrepancies) {
      byType.set(d.auditType, (byType.get(d.auditType) || 0) + 1);
    }
    console.log('\n  By type:');
    for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type}: ${count}`);
    }

    if (!applyMode) {
      console.log('\n  Run with --apply to write results to database.');
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
