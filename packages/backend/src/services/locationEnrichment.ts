/**
 * Location Enrichment Service
 *
 * Enriches practice_locations with hospital/health-system data from provider_hospitals.
 * No writes to practice_locations — enrichment data is returned for API responses.
 */

import prisma from '../lib/prisma';

// ============================================================================
// Shared Selects (avoid address_hash — not yet migrated)
// ============================================================================

const locationSelect = {
  id: true,
  npi: true,
  address_type: true,
  address_line1: true,
  address_line2: true,
  city: true,
  state: true,
  zip_code: true,
  phone: true,
  fax: true,
} as const;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Enrich a single practice_location with hospital affiliation data.
 *
 * Looks up the provider's NPI from the location, then checks provider_hospitals
 * for hospital_system and hospital_name. Returns enrichment data (does not write).
 */
export async function enrichLocationWithHospitalData(locationId: number) {
  const location = await prisma.practice_locations.findUnique({
    where: { id: locationId },
    select: { ...locationSelect, providers: { select: { npi: true } } },
  });

  if (!location) {
    return null;
  }

  const hospitals = await prisma.provider_hospitals.findMany({
    where: { npi: location.npi },
    select: {
      hospital_name: true,
      hospital_system: true,
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
 * Get enrichment statistics across practice_locations and provider_hospitals.
 */
export async function getEnrichmentStats() {
  const [
    totalLocations,
    totalProvidersWithHospitals,
    distinctHospitalSystems,
    locationsByState,
  ] = await Promise.all([
    prisma.practice_locations.count(),

    prisma.provider_hospitals.groupBy({
      by: ['npi'],
      _count: true,
    }),

    prisma.provider_hospitals.groupBy({
      by: ['hospital_system'],
      where: { hospital_system: { not: null } },
    }),

    prisma.practice_locations.groupBy({
      by: ['state'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
  ]);

  // Count distinct NPIs that have locations but no hospital affiliations
  const npisWithHospitals = new Set(totalProvidersWithHospitals.map((r) => r.npi));

  const allLocationNpis = await prisma.practice_locations.groupBy({
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
  const locations = await prisma.practice_locations.findMany({
    where: {
      address_line1: { equals: addressLine1, mode: 'insensitive' },
      city: { equals: city, mode: 'insensitive' },
      state: { equals: state, mode: 'insensitive' },
      zip_code: zipCode,
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
          primary_specialty: true,
        },
      },
    },
  });

  return locations.map((loc) => ({
    locationId: loc.id,
    npi: loc.npi,
    address: {
      addressLine1: loc.address_line1,
      city: loc.city,
      state: loc.state,
      zipCode: loc.zip_code,
    },
    provider: loc.providers,
  }));
}

/**
 * Get the health system name for a provider via provider_hospitals.
 * Returns the first hospital_system found, or null.
 */
export async function getLocationHealthSystem(npi: string): Promise<string | null> {
  const hospital = await prisma.provider_hospitals.findFirst({
    where: { npi, hospital_system: { not: null } },
    select: { hospital_system: true },
  });

  return hospital?.hospital_system ?? null;
}
