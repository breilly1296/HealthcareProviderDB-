/**
 * Cleanup duplicate practice_locations rows.
 *
 * Duplicates are defined as rows sharing the same (npi, address_line1, city,
 * state, zip_code). For each duplicate group the row with the highest id
 * (most recently inserted) is kept; the rest are deleted.
 *
 * Usage:
 *   npx tsx packages/backend/scripts/cleanup-duplicate-locations.ts             # dry run
 *   npx tsx packages/backend/scripts/cleanup-duplicate-locations.ts --cleanup   # delete duplicates
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const cleanup = process.argv.includes('--cleanup');

interface DuplicateGroup {
  npi: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  cnt: bigint;
  ids: number[];
}

interface TotalRow {
  group_count: bigint;
  total_rows: bigint;
  deletable: bigint;
}

async function main() {
  console.log(`\nDuplicate Location Cleanup — ${cleanup ? 'LIVE' : 'DRY RUN'}\n`);
  console.log('='.repeat(60));

  // ── 1. Detect duplicates ────────────────────────────────────────────────
  const dupes: DuplicateGroup[] = await prisma.$queryRawUnsafe(`
    SELECT npi, address_line1, city, state, zip_code,
           COUNT(*) AS cnt,
           ARRAY_AGG(id ORDER BY id DESC) AS ids
    FROM practice_locations
    WHERE address_line1 IS NOT NULL
    GROUP BY npi, address_line1, city, state, zip_code
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `);

  if (dupes.length === 0) {
    console.log('\nNo duplicate locations found. Database is clean.\n');
    return;
  }

  // ── 2. Report ───────────────────────────────────────────────────────────
  const totals: TotalRow[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS group_count,
           SUM(cnt) AS total_rows,
           SUM(cnt - 1) AS deletable
    FROM (
      SELECT COUNT(*) AS cnt
      FROM practice_locations
      WHERE address_line1 IS NOT NULL
      GROUP BY npi, address_line1, city, state, zip_code
      HAVING COUNT(*) > 1
    ) sub
  `);

  const t = totals[0];
  console.log(`Duplicate groups:   ${Number(t.group_count)}`);
  console.log(`Total affected rows: ${Number(t.total_rows)}`);
  console.log(`Rows to delete:      ${Number(t.deletable)}`);
  console.log('='.repeat(60));

  // Show first 10 groups for visibility
  console.log('\nSample duplicate groups (up to 10):');
  for (const d of dupes.slice(0, 10)) {
    const ids = d.ids.map(Number);
    console.log(
      `  npi=${d.npi} | ${d.address_line1}, ${d.city}, ${d.state} ${d.zip_code}` +
      ` | count=${Number(d.cnt)} | keep=${ids[0]} delete=[${ids.slice(1).join(', ')}]`,
    );
  }

  if (!cleanup) {
    console.log('\nDRY RUN — no rows deleted. Pass --cleanup to execute.\n');
    return;
  }

  // ── 3. Delete duplicates (keep highest id per group) ────────────────────
  console.log('\nDeleting duplicates...');

  // Collect all ids to delete: every id except the first (highest) in each group
  const idsToDelete: number[] = [];
  for (const d of dupes) {
    const ids = d.ids.map(Number);
    // ids[0] is the newest (highest) — keep it, delete the rest
    idsToDelete.push(...ids.slice(1));
  }

  // Before deleting locations, clear any provider_plan_acceptance rows that
  // reference the soon-to-be-deleted location ids (FK constraint).
  const clearedAcceptances = await prisma.providerPlanAcceptance.updateMany({
    where: { locationId: { in: idsToDelete } },
    data: { locationId: null },
  });
  if (clearedAcceptances.count > 0) {
    console.log(`  Cleared locationId on ${clearedAcceptances.count} provider_plan_acceptance rows`);
  }

  // Delete in batches of 1000 to avoid oversized queries
  let totalDeleted = 0;
  const batchSize = 1000;
  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    const result = await prisma.practiceLocation.deleteMany({
      where: { id: { in: batch } },
    });
    totalDeleted += result.count;
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}: deleted ${result.count} rows`);
  }

  console.log(`\nTotal deleted: ${totalDeleted}`);

  // ── 4. Verify ───────────────────────────────────────────────────────────
  const remaining: TotalRow[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS group_count,
           COALESCE(SUM(cnt), 0) AS total_rows,
           COALESCE(SUM(cnt - 1), 0) AS deletable
    FROM (
      SELECT COUNT(*) AS cnt
      FROM practice_locations
      WHERE address_line1 IS NOT NULL
      GROUP BY npi, address_line1, city, state, zip_code
      HAVING COUNT(*) > 1
    ) sub
  `);

  const r = remaining[0];
  if (Number(r.group_count) === 0) {
    console.log('Verification: no duplicates remain.\n');
  } else {
    console.error(`WARNING: ${Number(r.group_count)} duplicate groups still remain!\n`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
