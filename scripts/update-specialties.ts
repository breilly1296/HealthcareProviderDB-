/**
 * Update Specialties Script
 *
 * Fixes providers showing "Specialist" or NULL specialty by mapping their
 * primary taxonomy code to a proper specialty_category and primary_specialty.
 *
 * Data source priority:
 *   1. provider_taxonomies table (is_primary = 'Y')
 *   2. primary_taxonomy_code column on providers
 *   3. Legacy camelCase "taxonomyCode" column (from old import script)
 *
 * Usage:
 *   npx tsx scripts/update-specialties.ts --dry-run          # Preview changes
 *   npx tsx scripts/update-specialties.ts --dry-run --limit 100  # Preview first 100
 *   npx tsx scripts/update-specialties.ts --apply            # Apply all changes
 */

import pg from 'pg';
import 'dotenv/config';
import { getSpecialtyCategory, getTaxonomyDescription, TAXONOMY_DESCRIPTIONS } from '../src/taxonomy-mappings';

const { Pool } = pg;

const BATCH_SIZE = 500;

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const dryRun = args.includes('--dry-run');
  const limitArg = args.indexOf('--limit');
  const limit = limitArg !== -1 ? parseInt(args[limitArg + 1]) : 0;

  if (!applyMode && !dryRun) {
    console.error('Usage: npx tsx scripts/update-specialties.ts [--dry-run | --apply] [--limit N]');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('UPDATE SPECIALTIES');
  console.log(`Mode: ${applyMode ? 'APPLY (will modify database)' : 'DRY RUN (preview only)'}`);
  if (limit) console.log(`Limit: ${limit} providers`);
  console.log('='.repeat(70));
  console.log();

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  });

  try {
    // Step 1: Count providers needing update
    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM providers
      WHERE specialty_category IS NULL
         OR specialty_category = ''
         OR primary_specialty IS NULL
         OR primary_specialty = ''
         OR primary_specialty = 'Specialist'
         OR primary_specialty = 'specialist'
    `);
    const totalNeedingUpdate = parseInt(countResult.rows[0].total);
    console.log(`Providers needing specialty update: ${totalNeedingUpdate.toLocaleString()}`);

    // Step 2: Also check total providers
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM providers');
    console.log(`Total providers in database: ${parseInt(totalResult.rows[0].total).toLocaleString()}`);
    console.log();

    // Step 3: Query providers with their taxonomy codes from multiple sources
    // Priority: provider_taxonomies (primary) > primary_taxonomy_code > legacy "taxonomyCode"
    const toProcess = limit ? Math.min(limit, totalNeedingUpdate) : totalNeedingUpdate;
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    const categoryCounts: Record<string, number> = {};

    while (processed < toProcess) {
      const batchLimit = Math.min(BATCH_SIZE, toProcess - processed);
      if (batchLimit <= 0) break;

      // Fetch batch of providers needing update, joined with their primary taxonomy
      const batch = await pool.query(`
        SELECT
          p.npi,
          p.primary_taxonomy_code,
          p.primary_specialty,
          p.specialty_category,
          pt.taxonomy_code as pt_taxonomy_code
        FROM providers p
        LEFT JOIN provider_taxonomies pt ON p.npi = pt.npi AND pt.is_primary = 'Y'
        WHERE p.specialty_category IS NULL
           OR p.specialty_category = ''
           OR p.primary_specialty IS NULL
           OR p.primary_specialty = ''
           OR p.primary_specialty = 'Specialist'
           OR p.primary_specialty = 'specialist'
        ORDER BY p.npi
        LIMIT $1
      `, [batchLimit]);

      if (batch.rows.length === 0) break;

      // Build batch update arrays
      const updates: Array<{ npi: string; category: string; description: string }> = [];

      for (const row of batch.rows) {
        // Pick best taxonomy code from available sources
        const taxonomyCode = row.pt_taxonomy_code || row.primary_taxonomy_code || null;

        if (!taxonomyCode) {
          skipped++;
          processed++;
          continue;
        }

        const category = getSpecialtyCategory(taxonomyCode);
        const description = getTaxonomyDescription(taxonomyCode) || row.primary_specialty || 'Healthcare Provider';

        // Only update if we have something better than what's there
        const needsCategoryUpdate = !row.specialty_category || row.specialty_category === '';
        const needsDescriptionUpdate = !row.primary_specialty
          || row.primary_specialty === ''
          || row.primary_specialty === 'Specialist'
          || row.primary_specialty === 'specialist';

        if (needsCategoryUpdate || needsDescriptionUpdate) {
          updates.push({
            npi: row.npi,
            category: needsCategoryUpdate ? category : row.specialty_category,
            description: needsDescriptionUpdate ? description : row.primary_specialty,
          });

          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        } else {
          skipped++;
        }

        processed++;
      }

      // Apply batch update
      if (applyMode && updates.length > 0) {
        // Use a single UPDATE with CASE for efficiency
        const npis = updates.map(u => u.npi);
        const placeholders = npis.map((_, i) => `$${i + 1}`).join(', ');

        // Build CASE statements
        let categoryCase = 'CASE npi';
        let descCase = 'CASE npi';
        const params: string[] = [...npis];
        let paramIdx = npis.length + 1;

        for (const u of updates) {
          categoryCase += ` WHEN $${paramIdx} THEN $${paramIdx + 1}`;
          descCase += ` WHEN $${paramIdx + 2} THEN $${paramIdx + 3}`;
          params.push(u.npi, u.category, u.npi, u.description);
          paramIdx += 4;
        }
        categoryCase += ' ELSE specialty_category END';
        descCase += ' ELSE primary_specialty END';

        // Also update primary_taxonomy_code if it's null (backfill from provider_taxonomies)
        await pool.query(`
          UPDATE providers
          SET specialty_category = ${categoryCase},
              primary_specialty = ${descCase}
          WHERE npi IN (${placeholders})
        `, params);
      }

      updated += updates.length;

      // Progress
      const pct = Math.round((processed / toProcess) * 100);
      process.stdout.write(`\r  Progress: ${processed.toLocaleString()}/${toProcess.toLocaleString()} (${pct}%) — Updated: ${updated.toLocaleString()}, Skipped: ${skipped.toLocaleString()}`);
    }

    console.log('\n');

    // Step 4: Also backfill primary_taxonomy_code from provider_taxonomies where missing
    if (applyMode) {
      const backfillResult = await pool.query(`
        UPDATE providers p
        SET primary_taxonomy_code = pt.taxonomy_code
        FROM provider_taxonomies pt
        WHERE p.npi = pt.npi
          AND pt.is_primary = 'Y'
          AND (p.primary_taxonomy_code IS NULL OR p.primary_taxonomy_code = '')
      `);
      if (backfillResult.rowCount && backfillResult.rowCount > 0) {
        console.log(`Backfilled primary_taxonomy_code for ${backfillResult.rowCount.toLocaleString()} providers`);
      }
    }

    // Step 5: Summary
    console.log('--- Update Summary ---');
    console.log(`  Processed: ${processed.toLocaleString()}`);
    console.log(`  Updated:   ${updated.toLocaleString()}`);
    console.log(`  Skipped:   ${skipped.toLocaleString()} (no taxonomy code available)`);
    console.log();

    if (Object.keys(categoryCounts).length > 0) {
      console.log('--- Category Distribution (this run) ---');
      const sorted = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
      for (const [cat, count] of sorted) {
        console.log(`  ${cat.padEnd(28)} ${count.toLocaleString()}`);
      }
      console.log();
    }

    // Step 6: Show remaining issues
    const remainingResult = await pool.query(`
      SELECT COUNT(*) as total FROM providers
      WHERE specialty_category IS NULL
         OR specialty_category = ''
         OR primary_specialty IS NULL
         OR primary_specialty = ''
         OR primary_specialty = 'Specialist'
    `);
    const remaining = parseInt(remainingResult.rows[0].total);
    if (remaining > 0) {
      console.log(`Remaining providers needing update: ${remaining.toLocaleString()}`);
    } else {
      console.log('All providers now have specialty data!');
    }

    // Step 7: Show overall specialty distribution
    if (applyMode) {
      const distResult = await pool.query(`
        SELECT specialty_category, COUNT(*) as count
        FROM providers
        WHERE specialty_category IS NOT NULL AND specialty_category != ''
        GROUP BY specialty_category
        ORDER BY count DESC
        LIMIT 20
      `);
      if (distResult.rows.length > 0) {
        console.log('\n--- Top 20 Specialty Categories (all providers) ---');
        for (const row of distResult.rows) {
          console.log(`  ${(row.specialty_category || 'NULL').padEnd(28)} ${parseInt(row.count).toLocaleString()}`);
        }
      }
    }

  } catch (err) {
    console.error('\nError:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
