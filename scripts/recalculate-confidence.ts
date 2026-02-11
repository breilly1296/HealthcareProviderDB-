/**
 * Recalculate confidence scores for all provider-plan acceptance records.
 *
 * Applies time-based decay proactively so search results show accurate scores
 * instead of only decaying when a user views a provider page.
 *
 * Usage:
 *   npx tsx scripts/recalculate-confidence.ts --dry-run          # Preview changes
 *   npx tsx scripts/recalculate-confidence.ts --dry-run --limit 50  # Preview first 50
 *   npx tsx scripts/recalculate-confidence.ts --apply             # Apply changes
 *
 * Requires DATABASE_URL in .env or environment.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { calculateConfidenceScore } from '../packages/backend/src/services/confidenceService';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

const dryRun = !args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;
const BATCH_SIZE = 100;
const LOG_INTERVAL = 1000;

if (limit !== undefined && (isNaN(limit) || limit < 1)) {
  console.error('Error: --limit must be a positive integer');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const prisma = new PrismaClient({
  log: ['error'],
});

interface Stats {
  processed: number;
  updated: number;
  unchanged: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('');
  console.log('==============================================');
  console.log('  Confidence Score Recalculation');
  console.log('==============================================');
  console.log('');
  console.log(`  Mode:       ${dryRun ? 'DRY RUN (no writes)' : 'APPLY (writing changes)'}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  if (limit) console.log(`  Limit:      ${limit}`);
  console.log('');

  const startTime = Date.now();

  // Count total records to process
  const totalCount = await prisma.providerPlanAcceptance.count({
    where: { verificationCount: { gte: 1 } },
  });

  const effectiveLimit = limit ? Math.min(limit, totalCount) : totalCount;
  console.log(`  Records with verifications: ${totalCount.toLocaleString()}`);
  console.log(`  Records to process:         ${effectiveLimit.toLocaleString()}`);
  console.log('');

  if (effectiveLimit === 0) {
    console.log('  No records to process. Exiting.');
    return;
  }

  const stats: Stats = { processed: 0, updated: 0, unchanged: 0, errors: 0 };
  let cursor: number | undefined;
  let lastLogAt = 0;

  while (stats.processed < effectiveLimit) {
    const take = Math.min(BATCH_SIZE, effectiveLimit - stats.processed);

    // Fetch batch with provider specialty for decay calculation
    const batch = await prisma.providerPlanAcceptance.findMany({
      where: { verificationCount: { gte: 1 } },
      orderBy: { id: 'asc' },
      take,
      ...(cursor !== undefined ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        providerNpi: true,
        planId: true,
        confidenceScore: true,
        lastVerified: true,
        verificationCount: true,
        provider: {
          select: {
            primarySpecialty: true,
          },
        },
      },
    });

    if (batch.length === 0) break;

    for (const record of batch) {
      try {
        // Aggregate upvotes/downvotes from non-expired verification logs
        const voteAgg = await prisma.verificationLog.aggregate({
          where: {
            providerNpi: record.providerNpi,
            planId: record.planId,
            expiresAt: { gt: new Date() },
          },
          _sum: {
            upvotes: true,
            downvotes: true,
          },
        });

        const upvotes = voteAgg._sum.upvotes ?? 0;
        const downvotes = voteAgg._sum.downvotes ?? 0;

        // Recalculate
        const result = calculateConfidenceScore({
          dataSource: null,
          lastVerifiedAt: record.lastVerified,
          verificationCount: record.verificationCount,
          upvotes,
          downvotes,
          specialty: record.provider?.primarySpecialty ?? null,
        });

        const newScore = Math.round(result.score);

        if (newScore !== record.confidenceScore) {
          if (!dryRun) {
            await prisma.providerPlanAcceptance.update({
              where: { id: record.id },
              data: {
                confidenceScore: newScore,
                updatedAt: new Date(),
              },
            });
          }
          stats.updated++;
        } else {
          stats.unchanged++;
        }
      } catch (err) {
        stats.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [ERROR] Record id=${record.id}: ${msg}`);
      }

      stats.processed++;
    }

    cursor = batch[batch.length - 1].id;

    // Progress logging
    if (stats.processed - lastLogAt >= LOG_INTERVAL || stats.processed >= effectiveLimit) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = ((stats.processed / effectiveLimit) * 100).toFixed(1);
      console.log(
        `  [${pct}%] Processed ${stats.processed.toLocaleString()} / ${effectiveLimit.toLocaleString()} ` +
        `| Updated: ${stats.updated.toLocaleString()} | Unchanged: ${stats.unchanged.toLocaleString()} ` +
        `| Errors: ${stats.errors} | ${elapsed}s`
      );
      lastLogAt = stats.processed;
    }
  }

  const durationMs = Date.now() - startTime;

  console.log('');
  console.log('==============================================');
  console.log('  Results');
  console.log('==============================================');
  console.log('');
  console.log(`  Mode:       ${dryRun ? 'DRY RUN (no changes written)' : 'APPLIED'}`);
  console.log(`  Processed:  ${stats.processed.toLocaleString()}`);
  console.log(`  Updated:    ${stats.updated.toLocaleString()}`);
  console.log(`  Unchanged:  ${stats.unchanged.toLocaleString()}`);
  console.log(`  Errors:     ${stats.errors}`);
  console.log(`  Duration:   ${(durationMs / 1000).toFixed(1)}s`);

  if (dryRun && stats.updated > 0) {
    console.log('');
    console.log(`  ${stats.updated} records would be updated. Run with --apply to write changes.`);
  }

  console.log('');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
