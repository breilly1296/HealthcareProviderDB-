import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getProviderDisplayName } from './providerService';
import { mapEntityTypeToDb, mapEntityTypeToApi } from './utils';
import logger from '../utils/logger';

export interface MapQueryParams {
  north: number;
  south: number;
  east: number;
  west: number;
  specialty?: string;
  specialtyCategory?: string;
  entityType?: string;
  limit: number;
}

interface MapPin {
  npi: string;
  displayName: string;
  specialty: string | null;
  entityType: string;
  latitude: number;
  longitude: number;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  addressHash: string | null;
  providerCount: number;
}

interface MapResponse {
  pins: MapPin[];
  total: number;
  clustered: boolean;
  bounds: { north: number; south: number; east: number; west: number };
}

/**
 * Get providers within a geographic bounding box for map display.
 *
 * Strategy:
 * 1. Query practice_locations within the bounding box that have lat/lng
 * 2. Join to providers for name/specialty data
 * 3. Deduplicate by address_hash so overlapping providers show as one pin
 *    (the frontend will handle showing multiple providers at one location)
 * 4. Limit results to prevent overwhelming the map
 */
export async function getProvidersForMap(params: MapQueryParams): Promise<MapResponse> {
  const { north, south, east, west, specialty, specialtyCategory, entityType, limit } = params;

  // Build where clause for practice_locations
  const locationWhere: Prisma.practice_locationsWhereInput = {
    latitude: { gte: south, lte: north },
    longitude: { gte: west, lte: east },
    address_type: 'practice',
  };

  // Build provider-level filters
  const providerWhere: Prisma.ProviderWhereInput = {};

  if (specialty) {
    providerWhere.OR = [
      { primarySpecialty: { contains: specialty, mode: 'insensitive' } },
      { primaryTaxonomyCode: { contains: specialty, mode: 'insensitive' } },
      { specialtyCategory: { contains: specialty, mode: 'insensitive' } },
    ];
  }

  if (specialtyCategory) {
    providerWhere.specialtyCategory = { contains: specialtyCategory, mode: 'insensitive' };
  }

  if (entityType) {
    providerWhere.entityType = mapEntityTypeToDb(entityType);
  }

  // If we have provider-level filters, nest them under the location query
  if (Object.keys(providerWhere).length > 0) {
    locationWhere.providers = providerWhere;
  }

  // Count total matching locations (for "clustered" flag)
  const total = await prisma.practice_locations.count({ where: locationWhere });
  const clustered = total > limit;

  // Fetch locations with provider data
  // Use distinct on address_hash to deduplicate co-located providers
  // Each pin represents a unique physical address
  const locations = await prisma.practice_locations.findMany({
    where: locationWhere,
    distinct: ['address_hash'],
    take: limit,
    orderBy: { id: 'asc' },
    select: {
      latitude: true,
      longitude: true,
      address_line1: true,
      city: true,
      state: true,
      zip_code: true,
      phone: true,
      address_hash: true,
      npi: true,
      providers: {
        select: {
          npi: true,
          firstName: true,
          lastName: true,
          organizationName: true,
          entityType: true,
          credential: true,
          primarySpecialty: true,
          specialtyCategory: true,
        },
      },
    },
  });

  // Get provider counts per address_hash
  const addressHashes = locations
    .map(l => l.address_hash)
    .filter((h): h is string => h !== null);

  const counts = addressHashes.length > 0
    ? await prisma.practice_locations.groupBy({
        by: ['address_hash'],
        where: {
          address_hash: { in: addressHashes },
          latitude: { not: null },
        },
        _count: { npi: true },
      })
    : [];

  const countMap = new Map(
    counts.map(c => {
      const count = typeof c._count === 'object' && c._count ? c._count.npi ?? 0 : 0;
      return [c.address_hash, count] as const;
    })
  );

  // Transform to map pins
  const pins: MapPin[] = locations
    .filter((loc): loc is typeof loc & { latitude: number; longitude: number } =>
      loc.latitude !== null && loc.longitude !== null
    )
    .map((loc) => {
      const provider = loc.providers;
      const displayName = getProviderDisplayName(provider);

      return {
        npi: loc.npi,
        displayName,
        specialty: provider.primarySpecialty || provider.specialtyCategory || null,
        entityType: mapEntityTypeToApi(provider.entityType),
        latitude: loc.latitude,
        longitude: loc.longitude,
        addressLine1: loc.address_line1,
        city: loc.city,
        state: loc.state,
        zipCode: loc.zip_code,
        phone: loc.phone,
        addressHash: loc.address_hash,
        providerCount: countMap.get(loc.address_hash ?? '') ?? 1,
      };
    });

  logger.debug({ total, returned: pins.length, clustered }, 'Map query results');

  return {
    pins,
    total,
    clustered,
    bounds: { north, south, east, west },
  };
}
