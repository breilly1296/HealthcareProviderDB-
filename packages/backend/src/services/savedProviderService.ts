import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

// ============================================================================
// Shared select for Provider fields included with saved providers
// ============================================================================

const SAVED_PROVIDER_SELECT = {
  provider: {
    select: {
      npi: true,
      firstName: true,
      lastName: true,
      credential: true,
      primarySpecialty: true,
      specialtyCategory: true,
      entityType: true,
      organizationName: true,
      practiceLocations: {
        where: { addressType: 'practice' },
        select: {
          addressLine1: true,
          city: true,
          state: true,
          zipCode: true,
        },
        take: 1,
      },
    },
  },
} as const;

// ============================================================================
// getSavedProviders
// ============================================================================

export async function getSavedProviders(userId: string, page: number = 1, limit: number = 20) {
  const take = Math.min(limit, 100);
  const skip = (page - 1) * take;

  const [savedProviders, total] = await Promise.all([
    prisma.savedProvider.findMany({
      where: { userId },
      include: SAVED_PROVIDER_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.savedProvider.count({ where: { userId } }),
  ]);

  const providers = savedProviders.map((sp) => {
    const p = sp.provider;
    const loc = p.practiceLocations[0] || null;

    return {
      npi: p.npi,
      firstName: p.firstName,
      lastName: p.lastName,
      credential: p.credential,
      primarySpecialty: p.primarySpecialty,
      specialtyCategory: p.specialtyCategory,
      entityType: p.entityType,
      organizationName: p.organizationName,
      location: loc
        ? {
            addressLine1: loc.addressLine1,
            city: loc.city,
            state: loc.state,
            zipCode: loc.zipCode,
          }
        : null,
      savedAt: sp.createdAt,
    };
  });

  return {
    providers,
    total,
    page,
    totalPages: Math.ceil(total / take),
  };
}

// ============================================================================
// saveProvider
// ============================================================================

export async function saveProvider(userId: string, providerNpi: string) {
  // Verify provider exists
  const provider = await prisma.provider.findUnique({
    where: { npi: providerNpi },
    select: { npi: true },
  });

  if (!provider) {
    throw AppError.notFound(`Provider with NPI ${providerNpi} not found`);
  }

  // Check if already saved (idempotent)
  const existing = await prisma.savedProvider.findUnique({
    where: {
      userId_providerNpi: { userId, providerNpi },
    },
    include: SAVED_PROVIDER_SELECT,
  });

  if (existing) {
    const p = existing.provider;
    const loc = p.practiceLocations[0] || null;
    return {
      npi: p.npi,
      firstName: p.firstName,
      lastName: p.lastName,
      credential: p.credential,
      primarySpecialty: p.primarySpecialty,
      entityType: p.entityType,
      organizationName: p.organizationName,
      location: loc
        ? {
            addressLine1: loc.addressLine1,
            city: loc.city,
            state: loc.state,
            zipCode: loc.zipCode,
          }
        : null,
      savedAt: existing.createdAt,
    };
  }

  // Create new bookmark
  const saved = await prisma.savedProvider.create({
    data: { userId, providerNpi },
    include: SAVED_PROVIDER_SELECT,
  });

  const p = saved.provider;
  const loc = p.practiceLocations[0] || null;

  return {
    npi: p.npi,
    firstName: p.firstName,
    lastName: p.lastName,
    credential: p.credential,
    primarySpecialty: p.primarySpecialty,
    entityType: p.entityType,
    organizationName: p.organizationName,
    location: loc
      ? {
          addressLine1: loc.addressLine1,
          city: loc.city,
          state: loc.state,
          zipCode: loc.zipCode,
        }
      : null,
    savedAt: saved.createdAt,
  };
}

// ============================================================================
// unsaveProvider
// ============================================================================

export async function unsaveProvider(userId: string, providerNpi: string) {
  await prisma.savedProvider.delete({
    where: {
      userId_providerNpi: { userId, providerNpi },
    },
  }).catch((error) => {
    // P2025 = record not found — treat as success (idempotent)
    if (error?.code !== 'P2025') throw error;
  });

  return { success: true };
}

// ============================================================================
// isProviderSaved
// ============================================================================

export async function isProviderSaved(userId: string, providerNpi: string) {
  const count = await prisma.savedProvider.count({
    where: { userId, providerNpi },
  });

  return { saved: count > 0 };
}
