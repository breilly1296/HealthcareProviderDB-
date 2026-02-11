/**
 * Location Enrichment Service
 *
 * Enriches practiceLocations with hospital/health-system data from providerHospitals.
 * No writes to practiceLocations — enrichment data is returned for API responses.
 */

import prisma from '../lib/prisma';

// ============================================================================
// Shared Selects (avoid address_hash — not yet migrated)
// ============================================================================

const locationSelect = {
  id: true,
  npi: true,
  addressType: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  zipCode: true,
  phone: true,
  fax: true,
} as const;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Enrich a single practice_location with hospital affiliation data.
 *
 * Looks up the provider's NPI from the location, then checks providerHospitals
 * for hospitalSystem and hospitalName. Returns enrichment data (does not write).
 */
export async function enrichLocationWithHospitalData(locationId: number) {
  const location = await prisma.practiceLocation.findUnique({
    where: { id: locationId },
    select: { ...locationSelect, providers: { select: { npi: true } } },
  });

  if (!location) {
    return null;
  }

  const hospitals = await prisma.providerHospital.findMany({
    where: { npi: location.npi },
    select: {
      hospitalName: true,
      hospitalSystem: true,
      ccn: true,
      confidence: true,
    },
  });

  return {
    location,
    hospitalAffiliations: hospitals,
  };
}

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
 * Find co-located providers at the same address (case-insensitive match).
 */
export async function findColocatedProviders(
  addressLine1: string,
  city: string,
  state: string,
  zipCode: string
) {
  const locations = await prisma.practiceLocation.findMany({
    where: {
      addressLine1: { equals: addressLine1, mode: 'insensitive' },
      city: { equals: city, mode: 'insensitive' },
      state: { equals: state, mode: 'insensitive' },
      zipCode: zipCode,
    },
    select: {
      ...locationSelect,
      providers: {
        select: {
          npi: true,
          firstName: true,
          lastName: true,
          organizationName: true,
          entityType: true,
          primarySpecialty: true,
        },
      },
    },
  });

  return locations.map((loc) => ({
    locationId: loc.id,
    npi: loc.npi,
    address: {
      addressLine1: loc.addressLine1,
      city: loc.city,
      state: loc.state,
      zipCode: loc.zipCode,
    },
    provider: loc.providers,
  }));
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
