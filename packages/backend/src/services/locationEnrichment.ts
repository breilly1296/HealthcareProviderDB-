/**
 * Location Name Enrichment Service
 *
 * Populates human-readable facility names for locations by analyzing
 * provider organization names at each location.
 *
 * Strategy:
 * 1. Find all locations without names (name IS NULL)
 * 2. For each location, query providers at that locationId
 * 3. Find the most common organizationName among providers
 * 4. Prioritize names that look like facility names
 * 5. Update the location with the derived name
 */

import prisma from '../lib/prisma';
import logger from '../utils/logger';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Keywords that indicate a name is likely a facility name.
 * Names containing these keywords are prioritized.
 */
const FACILITY_KEYWORDS = [
  'hospital',
  'medical center',
  'medical centre',
  'clinic',
  'health center',
  'health centre',
  'healthcare',
  'health system',
  'health services',
  'physicians',
  'medical group',
  'medical associates',
  'surgery center',
  'surgical center',
  'urgent care',
  'emergency',
  'rehabilitation',
  'rehab center',
  'nursing',
  'care center',
  'wellness',
  'pediatric',
  'orthopedic',
  'cardiology',
  'oncology',
  'radiology',
  'imaging',
  'laboratory',
  'diagnostics',
  'specialty',
  'family medicine',
  'internal medicine',
  'primary care',
];

/**
 * Patterns to exclude - these are likely not good facility names
 */
const EXCLUDE_PATTERNS = [
  /^dr\.?\s/i,           // Starts with "Dr." or "Dr "
  /^doctor\s/i,          // Starts with "Doctor "
  /,\s*(md|do|phd|np|pa|rn)/i,  // Contains credential suffix
  /^\d/,                 // Starts with a number
  /^[a-z]\s/i,           // Single letter followed by space
];

// ============================================================================
// Types
// ============================================================================

interface EnrichmentResult {
  locationId: number;
  previousName: string | null;
  newName: string;
  providerCount: number;
  confidence: 'high' | 'medium' | 'low';
}

interface EnrichmentStats {
  totalLocationsProcessed: number;
  locationsEnriched: number;
  locationsSkipped: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  errors: number;
  durationMs: number;
}

interface EnrichmentOptions {
  /** Process only locations without names (default: true) */
  onlyUnnamed?: boolean;
  /** Maximum locations to process per batch (default: 1000) */
  batchSize?: number;
  /** Minimum provider count to derive name (default: 1) */
  minProviders?: number;
  /** Dry run - don't actually update (default: false) */
  dryRun?: boolean;
  /** Specific location IDs to process (optional) */
  locationIds?: number[];
}

interface OrgNameCount {
  organizationName: string;
  count: number;
  isFacilityName: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a name looks like a facility name based on keywords.
 */
function isFacilityName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return FACILITY_KEYWORDS.some((keyword) => lowerName.includes(keyword));
}

/**
 * Check if a name should be excluded as a facility name.
 */
function shouldExcludeName(name: string): boolean {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Clean and normalize an organization name.
 */
function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/[""]/g, '"')          // Normalize quotes
    .replace(/['']/g, "'");         // Normalize apostrophes
}

/**
 * Determine confidence level based on provider count and name quality.
 */
function determineConfidence(
  providerCount: number,
  isFacility: boolean,
  dominance: number // Percentage of providers with this name
): 'high' | 'medium' | 'low' {
  // High confidence: Many providers agree, and it's a facility name
  if (providerCount >= 5 && dominance >= 0.7 && isFacility) {
    return 'high';
  }

  // Medium confidence: Some agreement or it's a facility name
  if ((providerCount >= 3 && dominance >= 0.5) || isFacility) {
    return 'medium';
  }

  // Low confidence: Few providers or low agreement
  return 'low';
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the best organization name for a location based on providers there.
 *
 * @param locationId - The location ID to analyze
 * @returns The best name and metadata, or null if no suitable name found
 */
export async function getBestNameForLocation(locationId: number): Promise<{
  name: string;
  providerCount: number;
  confidence: 'high' | 'medium' | 'low';
} | null> {
  // Get all organization names at this location
  const providers = await prisma.provider.findMany({
    where: {
      locationId,
      organizationName: { not: null },
    },
    select: {
      organizationName: true,
    },
  });

  if (providers.length === 0) {
    return null;
  }

  // Count occurrences of each organization name
  const nameCounts = new Map<string, number>();

  for (const provider of providers) {
    if (provider.organizationName) {
      const normalized = normalizeName(provider.organizationName);
      if (!shouldExcludeName(normalized)) {
        nameCounts.set(normalized, (nameCounts.get(normalized) || 0) + 1);
      }
    }
  }

  if (nameCounts.size === 0) {
    return null;
  }

  // Convert to array and add facility name flag
  const orgNames: OrgNameCount[] = Array.from(nameCounts.entries()).map(
    ([name, count]) => ({
      organizationName: name,
      count,
      isFacilityName: isFacilityName(name),
    })
  );

  // Sort by: 1) facility name flag (facility names first), 2) count (descending)
  orgNames.sort((a, b) => {
    // Facility names come first
    if (a.isFacilityName !== b.isFacilityName) {
      return a.isFacilityName ? -1 : 1;
    }
    // Then by count
    return b.count - a.count;
  });

  const best = orgNames[0];
  const totalProviders = providers.length;
  const dominance = best.count / totalProviders;

  return {
    name: best.organizationName,
    providerCount: best.count,
    confidence: determineConfidence(best.count, best.isFacilityName, dominance),
  };
}

/**
 * Enrich location names in bulk.
 *
 * @param options - Enrichment options
 * @returns Statistics about the enrichment process
 */
export async function enrichLocationNames(
  options: EnrichmentOptions = {}
): Promise<{
  stats: EnrichmentStats;
  results: EnrichmentResult[];
}> {
  const {
    onlyUnnamed = true,
    batchSize = 1000,
    minProviders = 1,
    dryRun = false,
    locationIds,
  } = options;

  const startTime = Date.now();
  const results: EnrichmentResult[] = [];
  const stats: EnrichmentStats = {
    totalLocationsProcessed: 0,
    locationsEnriched: 0,
    locationsSkipped: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    errors: 0,
    durationMs: 0,
  };

  logger.info({ options: { ...options, dryRun } }, 'Starting location name enrichment');

  try {
    // Build where clause
    const whereClause: {
      id?: { in: number[] };
      name?: null;
    } = {};

    if (locationIds && locationIds.length > 0) {
      whereClause.id = { in: locationIds };
    }

    if (onlyUnnamed) {
      whereClause.name = null;
    }

    // Get locations to process
    const locations = await prisma.location.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        addressLine1: true,
        city: true,
        state: true,
      },
      take: batchSize,
    });

    stats.totalLocationsProcessed = locations.length;
    logger.info({ count: locations.length }, 'Found locations to process');

    // Process each location
    for (const location of locations) {
      try {
        const bestName = await getBestNameForLocation(location.id);

        if (!bestName || bestName.providerCount < minProviders) {
          stats.locationsSkipped++;
          continue;
        }

        const result: EnrichmentResult = {
          locationId: location.id,
          previousName: location.name,
          newName: bestName.name,
          providerCount: bestName.providerCount,
          confidence: bestName.confidence,
        };

        results.push(result);

        // Update confidence stats
        switch (bestName.confidence) {
          case 'high':
            stats.highConfidence++;
            break;
          case 'medium':
            stats.mediumConfidence++;
            break;
          case 'low':
            stats.lowConfidence++;
            break;
        }

        // Update the location if not a dry run
        if (!dryRun) {
          await prisma.location.update({
            where: { id: location.id },
            data: { name: bestName.name },
          });
        }

        stats.locationsEnriched++;

        logger.debug({
          locationId: location.id,
          name: bestName.name,
          confidence: bestName.confidence,
          providerCount: bestName.providerCount,
          dryRun,
        }, 'Location name enriched');

      } catch (error) {
        stats.errors++;
        logger.error({
          locationId: location.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Failed to enrich location');
      }
    }

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Location enrichment failed');
    throw error;
  }

  stats.durationMs = Date.now() - startTime;

  logger.info({
    stats,
    dryRun,
  }, 'Location name enrichment completed');

  return { stats, results };
}

/**
 * Generate a fallback display name for a location without a name.
 * Used when location.name is null and we need something to display.
 *
 * @param location - Location data
 * @returns A formatted display name
 */
export function getLocationDisplayName(location: {
  name: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  healthSystem?: string | null;
  facilityType?: string | null;
}): string {
  // If we have a name, use it
  if (location.name) {
    return location.name;
  }

  // Try health system name
  if (location.healthSystem) {
    return location.healthSystem;
  }

  // Try facility type with address
  if (location.facilityType && location.city) {
    return `${location.facilityType} - ${location.city}, ${location.state || ''}`.trim();
  }

  // Fall back to address
  const parts: string[] = [];
  if (location.addressLine1) parts.push(location.addressLine1);
  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);

  if (parts.length > 0) {
    return parts.join(', ');
  }

  return 'Unknown Location';
}

/**
 * Get enrichment statistics for reporting.
 */
export async function getEnrichmentStats(): Promise<{
  totalLocations: number;
  locationsWithNames: number;
  locationsWithoutNames: number;
  percentageNamed: string;
}> {
  const [total, withNames] = await Promise.all([
    prisma.location.count(),
    prisma.location.count({ where: { name: { not: null } } }),
  ]);

  const withoutNames = total - withNames;
  const percentage = total > 0 ? ((withNames / total) * 100).toFixed(1) : '0';

  return {
    totalLocations: total,
    locationsWithNames: withNames,
    locationsWithoutNames: withoutNames,
    percentageNamed: `${percentage}%`,
  };
}
