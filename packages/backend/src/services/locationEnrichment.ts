/**
 * Location Enrichment Service
 *
 * Enriches practiceLocations with hospital/health-system data from
 * providerHospitals. No writes to practiceLocations — enrichment data is
 * returned for API responses.
 *
 * Live exports:
 *
 *   • getLocationHealthSystem(npi)
 *       — routes/providers.ts:448 (GET /api/v1/providers/:npi/colocated,
 *         executed in parallel with getColocatedNpis to populate the
 *         synthetic `location.healthSystem` field on the response).
 *
 *   • getEnrichmentStats()
 *       — routes/admin.ts:620 (GET /api/v1/admin/enrichment/stats,
 *         admin-protected, returns counts of enriched
 *         practice_locations / provider_hospitals rows).
 *
 * Deleted 2026-04-26:
 *
 *   • enrichLocationWithHospitalData — never wired at runtime. Intended for
 *     a future GET /api/v1/locations/:id enrichment shape that hasn't been
 *     built. Reintroduce from git history when the feature lands; design
 *     was a single-row hospital-affiliation lookup and is straightforward
 *     to recreate.
 *
 *   • findColocatedProviders — consolidated into
 *     locationService.getColocatedNpis, which now performs the same
 *     "providers at this address" match using the indexed `address_hash`
 *     column (single-index lookup) with the original multi-field ILIKE
 *     match as a fallback for legacy rows that pre-date the hash backfill.
 *     The legacy duplicate had no callers since the schema split.
 */

import prisma from '../lib/prisma';

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get enrichment statistics across practiceLocations and providerHospitals.
 */
export async function getEnrichmentStats() {
  const [
    totalLocations,
    totalProvidersWithHospitals,
    distinctHospitalSystems,
    locationsByState,
  ] = await Promise.all([
    prisma.practiceLocation.count(),

    prisma.providerHospital.groupBy({
      by: ['npi'],
      _count: true,
    }),

    prisma.providerHospital.groupBy({
      by: ['hospitalSystem'],
      where: { hospitalSystem: { not: null } },
    }),

    prisma.practiceLocation.groupBy({
      by: ['state'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
  ]);

  // Count distinct NPIs that have locations but no hospital affiliations
  const npisWithHospitals = new Set(totalProvidersWithHospitals.map((r) => r.npi));

  const allLocationNpis = await prisma.practiceLocation.groupBy({
    by: ['npi'],
  });
  const npisWithoutHospitals = allLocationNpis.filter(
    (r) => !npisWithHospitals.has(r.npi)
  ).length;

  return {
    totalLocations,
    providersWithHospitalAffiliations: npisWithHospitals.size,
    providersWithoutHospitalAffiliations: npisWithoutHospitals,
    distinctHospitalSystems: distinctHospitalSystems.length,
    byState: locationsByState.map((s) => ({
      state: s.state,
      count: s._count.id,
    })),
  };
}

/**
 * Get the health system name for a provider via providerHospitals.
 * Returns the first hospitalSystem found, or null.
 */
export async function getLocationHealthSystem(npi: string): Promise<string | null> {
  const hospital = await prisma.providerHospital.findFirst({
    where: { npi, hospitalSystem: { not: null } },
    select: { hospitalSystem: true },
  });

  return hospital?.hospitalSystem ?? null;
}
