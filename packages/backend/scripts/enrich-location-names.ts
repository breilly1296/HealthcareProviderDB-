#!/usr/bin/env ts-node
/**
 * Location Name Enrichment Script
 *
 * Populates human-readable facility names for locations by analyzing
 * provider organization names at each location.
 *
 * Usage:
 *   npx ts-node scripts/enrich-location-names.ts [options]
 *
 * Options:
 *   --apply       Actually update the database (default: dry run)
 *   --all         Process all locations, not just unnamed ones
 *   --batch=N     Process N locations per batch (default: 1000)
 *   --min=N       Minimum providers needed to derive name (default: 1)
 *
 * Examples:
 *   npx ts-node scripts/enrich-location-names.ts              # Dry run, unnamed only
 *   npx ts-node scripts/enrich-location-names.ts --apply      # Update unnamed locations
 *   npx ts-node scripts/enrich-location-names.ts --all        # Preview all locations
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// Configuration (same as locationEnrichment.ts service)
// ============================================================================

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

const EXCLUDE_PATTERNS = [
  /^dr\.?\s/i,
  /^doctor\s/i,
  /,\s*(md|do|phd|np|pa|rn)/i,
  /^\d/,
  /^[a-z]\s/i,
];

// ============================================================================
// Helper Functions
// ============================================================================

function isFacilityName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return FACILITY_KEYWORDS.some((keyword) => lowerName.includes(keyword));
}

function shouldExcludeName(name: string): boolean {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(name));
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/[""]/g, '"').replace(/['']/g, "'");
}

function determineConfidence(
  providerCount: number,
  isFacility: boolean,
  dominance: number
): 'high' | 'medium' | 'low' {
  if (providerCount >= 5 && dominance >= 0.7 && isFacility) return 'high';
  if ((providerCount >= 3 && dominance >= 0.5) || isFacility) return 'medium';
  return 'low';
}

interface OrgNameCount {
  organizationName: string;
  count: number;
  isFacilityName: boolean;
}

async function getBestNameForLocation(locationId: number): Promise<{
  name: string;
  providerCount: number;
  confidence: 'high' | 'medium' | 'low';
} | null> {
  const providers = await prisma.provider.findMany({
    where: { locationId, organizationName: { not: null } },
    select: { organizationName: true },
  });

  if (providers.length === 0) return null;

  const nameCounts = new Map<string, number>();
  for (const provider of providers) {
    if (provider.organizationName) {
      const normalized = normalizeName(provider.organizationName);
      if (!shouldExcludeName(normalized)) {
        nameCounts.set(normalized, (nameCounts.get(normalized) || 0) + 1);
      }
    }
  }

  if (nameCounts.size === 0) return null;

  const orgNames: OrgNameCount[] = Array.from(nameCounts.entries()).map(
    ([name, count]) => ({
      organizationName: name,
      count,
      isFacilityName: isFacilityName(name),
    })
  );

  orgNames.sort((a, b) => {
    if (a.isFacilityName !== b.isFacilityName) return a.isFacilityName ? -1 : 1;
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

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--apply');
  const onlyUnnamed = !args.includes('--all');

  // Parse batch size
  const batchArg = args.find((a) => a.startsWith('--batch='));
  const batchSize = batchArg ? parseInt(batchArg.split('=')[1], 10) : 1000;

  // Parse minimum providers
  const minArg = args.find((a) => a.startsWith('--min='));
  const minProviders = minArg ? parseInt(minArg.split('=')[1], 10) : 1;

  console.log('='.repeat(70));
  console.log('Location Name Enrichment Script');
  console.log('='.repeat(70));
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'APPLYING CHANGES'}`);
  console.log(`Scope: ${onlyUnnamed ? 'Unnamed locations only' : 'All locations'}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Min providers: ${minProviders}`);
  console.log();

  // Get current stats
  const [totalLocations, unnamedLocations] = await Promise.all([
    prisma.location.count(),
    prisma.location.count({ where: { name: null } }),
  ]);

  console.log(`Database Stats:`);
  console.log(`  Total locations: ${totalLocations}`);
  console.log(`  Locations with names: ${totalLocations - unnamedLocations}`);
  console.log(`  Locations without names: ${unnamedLocations}`);
  console.log();

  // Get locations to process
  const where = onlyUnnamed ? { name: null } : {};
  const locations = await prisma.location.findMany({
    where,
    select: {
      id: true,
      name: true,
      addressLine1: true,
      city: true,
      state: true,
    },
    take: batchSize,
    orderBy: { id: 'asc' },
  });

  console.log(`Processing ${locations.length} locations...`);
  console.log();

  const results: Array<{
    locationId: number;
    address: string;
    city: string;
    state: string;
    previousName: string | null;
    newName: string;
    providerCount: number;
    confidence: 'high' | 'medium' | 'low';
  }> = [];

  let processed = 0;
  let enriched = 0;
  let skipped = 0;
  let errors = 0;

  for (const location of locations) {
    try {
      const bestName = await getBestNameForLocation(location.id);
      processed++;

      if (!bestName || bestName.providerCount < minProviders) {
        skipped++;
        continue;
      }

      results.push({
        locationId: location.id,
        address: location.addressLine1 || '',
        city: location.city || '',
        state: location.state || '',
        previousName: location.name,
        newName: bestName.name,
        providerCount: bestName.providerCount,
        confidence: bestName.confidence,
      });

      if (!isDryRun) {
        await prisma.location.update({
          where: { id: location.id },
          data: { name: bestName.name },
        });
      }

      enriched++;

      if (processed % 100 === 0) {
        process.stdout.write(`  Processed ${processed}/${locations.length}...\r`);
      }
    } catch (error) {
      errors++;
      console.error(`Error processing location ${location.id}:`, error);
    }
  }

  console.log();
  console.log();

  // Show results
  console.log('='.repeat(70));
  console.log('RESULTS');
  console.log('='.repeat(70));
  console.log();

  // Group by confidence
  const byConfidence = {
    high: results.filter((r) => r.confidence === 'high'),
    medium: results.filter((r) => r.confidence === 'medium'),
    low: results.filter((r) => r.confidence === 'low'),
  };

  console.log('By Confidence Level:');
  console.log(`  High:   ${byConfidence.high.length}`);
  console.log(`  Medium: ${byConfidence.medium.length}`);
  console.log(`  Low:    ${byConfidence.low.length}`);
  console.log();

  // Show sample results (first 20)
  if (results.length > 0) {
    console.log('Sample Enrichments (first 20):');
    console.log('-'.repeat(70));

    for (const result of results.slice(0, 20)) {
      const conf = result.confidence.toUpperCase().padEnd(6);
      console.log(`  [${conf}] ${result.address}, ${result.city}, ${result.state}`);
      console.log(`           → "${result.newName}" (${result.providerCount} providers)`);
    }

    if (results.length > 20) {
      console.log(`  ... and ${results.length - 20} more`);
    }
    console.log();
  }

  // Summary
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Locations processed: ${processed}`);
  console.log(`  Locations enriched:  ${enriched}`);
  console.log(`  Locations skipped:   ${skipped}`);
  console.log(`  Errors:              ${errors}`);
  console.log();

  if (isDryRun && enriched > 0) {
    console.log('This was a dry run. To apply changes, run:');
    console.log('  npx ts-node scripts/enrich-location-names.ts --apply');
  } else if (!isDryRun) {
    console.log(`Successfully updated ${enriched} locations.`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
