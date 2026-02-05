/**
 * Cross-reference insurance network IDs with insurance plans
 *
 * Matches provider_insurance.network_name against insurance_plans.carrier
 * and issuer_name to create ProviderPlanAcceptance records.
 *
 * Usage:
 *   npx tsx scripts/crossref-insurance-networks.ts              # Dry run
 *   npx tsx scripts/crossref-insurance-networks.ts --apply      # Apply
 *   npx tsx scripts/crossref-insurance-networks.ts --carrier "Aetna"  # Single carrier
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// Fuzzy matching threshold (Levenshtein-based similarity, 0-1)
const MATCH_THRESHOLD = 0.7;

/**
 * Simple normalized string similarity for carrier name matching.
 * Normalizes both strings and checks if one contains the other.
 */
function nameMatchScore(a: string, b: string): number {
  const normA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normB = b.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.85;

  // Token overlap
  const tokensA = a.toLowerCase().split(/\s+/).filter(Boolean);
  const tokensB = b.toLowerCase().split(/\s+/).filter(Boolean);
  const overlap = tokensA.filter(t => tokensB.includes(t));
  const score = (2 * overlap.length) / (tokensA.length + tokensB.length);

  return score;
}

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const carrierArg = args.indexOf('--carrier');
  const filterCarrier = carrierArg !== -1 ? args[carrierArg + 1] : null;

  console.log('\n🔗 Insurance Network Cross-Reference\n');
  console.log('='.repeat(70));
  console.log(`Mode: ${applyMode ? 'APPLY' : 'DRY RUN'}`);
  if (filterCarrier) console.log(`Filter carrier: ${filterCarrier}`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
  });

  try {
    // Get all unique network names from provider_insurance
    let networkQuery = `
      SELECT network_name, COUNT(DISTINCT npi) as provider_count
      FROM provider_insurance
      WHERE network_name IS NOT NULL
      GROUP BY network_name
      ORDER BY provider_count DESC
    `;
    const networks = await pool.query(networkQuery);
    console.log(`\nUnique network names: ${networks.rows.length}`);

    // Get all unique carriers and issuers from insurance_plans
    const carriers = await pool.query(`
      SELECT DISTINCT carrier FROM insurance_plans WHERE carrier IS NOT NULL
    `);
    const issuers = await pool.query(`
      SELECT DISTINCT issuer_name FROM insurance_plans WHERE issuer_name IS NOT NULL
    `);

    const carrierNames = carriers.rows.map(r => r.carrier as string);
    const issuerNames = issuers.rows.map(r => r.issuer_name as string);

    console.log(`Insurance plan carriers: ${carrierNames.length}`);
    console.log(`Insurance plan issuers: ${issuerNames.length}`);

    let newMatches = 0;
    let confirmedExisting = 0;
    let ambiguousSkipped = 0;
    let totalProviderLinks = 0;

    // Process each network name
    for (const networkRow of networks.rows) {
      const networkName = networkRow.network_name as string;

      if (filterCarrier) {
        const score = nameMatchScore(networkName, filterCarrier);
        if (score < MATCH_THRESHOLD) continue;
      }

      // Find best matching carrier
      let bestMatch: { name: string; score: number; type: 'carrier' | 'issuer' } | null = null;

      for (const carrier of carrierNames) {
        const score = nameMatchScore(networkName, carrier);
        if (score >= MATCH_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { name: carrier, score, type: 'carrier' };
        }
      }

      for (const issuer of issuerNames) {
        const score = nameMatchScore(networkName, issuer);
        if (score >= MATCH_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { name: issuer, score, type: 'issuer' };
        }
      }

      if (!bestMatch) continue;

      if (bestMatch.score < 0.8) {
        // Ambiguous match - skip but report
        ambiguousSkipped++;
        if (!applyMode) {
          console.log(`  AMBIGUOUS: "${networkName}" ~= "${bestMatch.name}" (${(bestMatch.score * 100).toFixed(0)}%)`);
        }
        continue;
      }

      // Get plans matching this carrier/issuer
      const planQuery = bestMatch.type === 'carrier'
        ? `SELECT plan_id FROM insurance_plans WHERE carrier = $1`
        : `SELECT plan_id FROM insurance_plans WHERE issuer_name = $1`;
      const matchingPlans = await pool.query(planQuery, [bestMatch.name]);

      if (matchingPlans.rows.length === 0) continue;

      // Get providers with this network
      const providerResult = await pool.query(
        `SELECT DISTINCT npi FROM provider_insurance WHERE network_name = $1`,
        [networkName]
      );

      const providerNpis = providerResult.rows.map(r => r.npi as string);

      if (applyMode) {
        for (const npi of providerNpis) {
          for (const planRow of matchingPlans.rows) {
            // Check if PPA already exists
            const existing = await pool.query(
              `SELECT id FROM provider_plan_acceptance WHERE npi = $1 AND plan_id = $2`,
              [npi, planRow.plan_id]
            );

            if (existing.rows.length > 0) {
              confirmedExisting++;
            } else {
              await pool.query(
                `INSERT INTO provider_plan_acceptance (npi, plan_id, acceptance_status, confidence_score, verification_count, created_at, updated_at)
                 VALUES ($1, $2, 'PENDING', 50, 0, NOW(), NOW())
                 ON CONFLICT DO NOTHING`,
                [npi, planRow.plan_id]
              );
              newMatches++;
            }
            totalProviderLinks++;
          }
        }
      } else {
        const potentialLinks = providerNpis.length * matchingPlans.rows.length;
        totalProviderLinks += potentialLinks;
        newMatches += potentialLinks; // In dry run, count all as new
        console.log(`  MATCH: "${networkName}" -> "${bestMatch.name}" (${(bestMatch.score * 100).toFixed(0)}%) | ${providerNpis.length} providers x ${matchingPlans.rows.length} plans`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('CROSS-REFERENCE SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Total provider-plan links processed: ${totalProviderLinks}`);
    console.log(`  New matches created:                 ${newMatches}`);
    console.log(`  Confirmed existing:                  ${confirmedExisting}`);
    console.log(`  Ambiguous (skipped):                 ${ambiguousSkipped}`);

    if (!applyMode) {
      console.log('\n  Run with --apply to create PPA records.');
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
