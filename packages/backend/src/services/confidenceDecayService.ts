import prisma from '../lib/prisma';
import { calculateConfidenceScore } from './confidenceService';
import logger from '../utils/logger';

export interface DecayRecalculationStats {
  processed: number;
  updated: number;
  unchanged: number;
  errors: number;
  durationMs: number;
}

export interface DecayRecalculationOptions {
  dryRun?: boolean;
  limit?: number;
  batchSize?: number;
  onProgress?: (processed: number, updated: number) => void;
}

/**
 * Recalculate confidence scores for all ProviderPlanAcceptance records
 * that have at least 1 verification.
 *
 * This applies time-based decay proactively so search results show
 * accurate scores, rather than only decaying on read (provider page view).
 *
 * For each record:
 *   1. Fetch the provider's specialty (for specialty-specific decay rates)
 *   2. Aggregate upvotes/downvotes from related VerificationLog entries
 *   3. Recalculate score via calculateConfidenceScore()
 *   4. Update if the score has changed
 */
export async function recalculateAllConfidenceScores(
  options: DecayRecalculationOptions = {}
): Promise<DecayRecalculationStats> {
  const {
    dryRun = false,
    limit,
    batchSize = 100,
    onProgress,
  } = options;

  const startTime = Date.now();
  const stats: DecayRecalculationStats = {
    processed: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    durationMs: 0,
  };

  // Count total records to process
  const totalCount = await prisma.providerPlanAcceptance.count({
    where: { verificationCount: { gte: 1 } },
  });

  const effectiveLimit = limit ? Math.min(limit, totalCount) : totalCount;

  logger.info(
    { totalCount, effectiveLimit, dryRun, batchSize },
    'Starting confidence score recalculation'
  );

  let cursor: number | undefined;

  while (stats.processed < effectiveLimit) {
    const take = Math.min(batchSize, effectiveLimit - stats.processed);

    // Fetch a batch of acceptance records with provider specialty
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

    // Process each record in the batch
    for (const record of batch) {
      try {
        // Aggregate upvotes/downvotes from verification logs for this provider-plan
        const voteAgg = await prisma.verificationLog.aggregate({
          where: {
            providerNpi: record.providerNpi,
            planId: record.planId,
            expiresAt: { gt: new Date() }, // Only non-expired verifications
          },
          _sum: {
            upvotes: true,
            downvotes: true,
          },
        });

        const upvotes = voteAgg._sum.upvotes ?? 0;
        const downvotes = voteAgg._sum.downvotes ?? 0;

        // Recalculate confidence score
        const result = calculateConfidenceScore({
          dataSource: null, // Not stored on acceptance records
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
        logger.error(
          { err, recordId: record.id },
          'Error recalculating confidence for record'
        );
      }

      stats.processed++;
    }

    cursor = batch[batch.length - 1].id;

    // Progress callback
    if (onProgress) {
      onProgress(stats.processed, stats.updated);
    }
  }

  stats.durationMs = Date.now() - startTime;

  logger.info(
    {
      ...stats,
      dryRun,
      durationSeconds: (stats.durationMs / 1000).toFixed(1),
    },
    'Confidence score recalculation complete'
  );

  return stats;
}
