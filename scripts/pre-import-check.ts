/**
 * Pre-import safety check for NPI import scripts.
 *
 * Counts enriched records and pending conflicts, prints a summary banner,
 * and prompts for confirmation if unresolved conflicts exist.
 */

import pg from 'pg';
import readline from 'readline';

export async function preImportCheck(pool: pg.Pool): Promise<void> {
  // 1. Count enriched providers
  const provResult = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM providers WHERE data_source = 'enrichment'`
  );
  const enrichedProviders: number = provResult.rows[0].cnt;

  // 2. Count enriched locations
  const locResult = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM practice_locations WHERE data_source = 'enrichment'`
  );
  const enrichedLocations: number = locResult.rows[0].cnt;

  // 3. Count pending conflicts
  const conflictResult = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM import_conflicts WHERE resolution = 'pending'`
  );
  const pendingConflicts: number = conflictResult.rows[0].cnt;

  // Log individual warnings
  if (enrichedProviders > 0) {
    console.log(`\n⚠️  ${enrichedProviders.toLocaleString()} providers have enrichment data — these fields will be preserved`);
  }
  if (enrichedLocations > 0) {
    console.log(`⚠️  ${enrichedLocations.toLocaleString()} locations have enrichment data — geocoding and enriched phones will be preserved`);
  }
  if (pendingConflicts > 0) {
    console.log(`⚠️  ${pendingConflicts.toLocaleString()} unresolved conflicts from last import`);
  }

  // Print summary banner
  console.log('\n=== PRE-IMPORT SAFETY CHECK ===');
  console.log(`Enriched providers: ${enrichedProviders.toLocaleString()} (protected)`);
  console.log(`Enriched locations: ${enrichedLocations.toLocaleString()} (protected)`);
  console.log(`Pending conflicts:  ${pendingConflicts}`);
  console.log(`Import mode: SELECTIVE UPDATE (enrichment-safe)`);
  console.log('================================\n');

  // If pending conflicts, ask for confirmation
  if (pendingConflicts > 0) {
    const confirmed = await askConfirmation(
      `There are ${pendingConflicts} unresolved conflicts. Continue with import? (y/N) `
    );
    if (!confirmed) {
      console.log('Import cancelled.');
      process.exit(0);
    }
  }
}

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
