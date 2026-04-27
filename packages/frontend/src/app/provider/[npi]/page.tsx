import type { Metadata } from 'next';
import ProviderDetailClient from '@/components/provider-detail/ProviderDetailClient';
import type { ProviderWithPlans } from '@/components/provider-detail/ProviderDetailClient';
import { safeJsonLd } from '@/lib/jsonLd';
import { getSpecialtyDisplay } from '@/lib/provider-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://verifymyprovider.com';

async function getProvider(npi: string): Promise<ProviderWithPlans | null> {
  try {
    const res = await fetch(`${API_URL}/providers/${npi}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.provider ?? null;
  } catch {
    return null;
  }
}

function getProviderName(provider: ProviderWithPlans): string {
  if (provider.entityType === 'INDIVIDUAL') {
    const parts = [provider.firstName, provider.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : provider.displayName;
  }
  return provider.organizationName || provider.displayName;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ npi: string }>;
}): Promise<Metadata> {
  const { npi } = await params;
  const provider = await getProvider(npi);

  if (!provider) {
    return { title: 'Provider Not Found | VerifyMyProvider' };
  }

  const name = getProviderName(provider);
  // specialtyCategory is the user-facing specialty grouping (CARDIOLOGY → "Cardiology").
  // taxonomyDescription is the NPPES taxonomy label which can differ
  // (e.g. subspecialties — "Nuclear Medicine" for a CARDIOLOGY provider).
  // Use specialtyCategory for consistency across body + SEO.
  const specialty = getSpecialtyDisplay(provider.specialtyCategory, provider.taxonomyDescription);
  const city = provider.city || '';
  const state = provider.state || '';
  const location = [city, state].filter(Boolean).join(', ');

  return {
    title: `${name} - ${specialty} in ${location} | VerifyMyProvider`,
    description: `Verify insurance acceptance for ${name}, ${specialty} in ${location}. Check which insurance plans are accepted with community-verified data.`,
    alternates: {
      canonical: `${SITE_URL}/provider/${npi}`,
    },
    openGraph: {
      title: `${name} - ${specialty}`,
      description: `Insurance verification for ${name} in ${location}`,
      type: 'profile',
    },
  };
}

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ npi: string }>;
}) {
  const { npi } = await params;
  const provider = await getProvider(npi);

  const name = provider ? getProviderName(provider) : null;
  // Same source-of-truth as generateMetadata — see comment above.
  // Skip emitting medicalSpecialty in JSON-LD when both source fields are
  // missing (avoids a meaningless "Healthcare Provider" sentinel in the
  // structured data).
  const specialty =
    provider && (provider.specialtyCategory || provider.taxonomyDescription)
      ? getSpecialtyDisplay(provider.specialtyCategory, provider.taxonomyDescription)
      : null;
  const firstLocation = provider?.locations?.[0];

  // Accepted insurance plans → schema.org `availableService`. Filters:
  //   - acceptanceStatus must be ACCEPTED (PENDING/UNKNOWN aren't real signals)
  //   - plan.planName must be non-null (schema.org Service requires name;
  //     emitting null would produce invalid JSON-LD that Google ignores)
  // Capped at 50 entries — Google's structured-data parsers process the
  // first few dozen and the JSON-LD payload weight isn't worth more.
  const acceptedPlans =
    provider?.planAcceptances?.filter(
      (pa) => pa.acceptanceStatus === 'ACCEPTED' && pa.plan?.planName
    ) ?? [];

  const jsonLd = provider
    ? {
        '@context': 'https://schema.org',
        '@type': provider.entityType === 'INDIVIDUAL' ? 'Physician' : 'MedicalOrganization',
        name,
        ...(specialty && { medicalSpecialty: specialty }),
        ...(firstLocation && {
          address: {
            '@type': 'PostalAddress',
            streetAddress: firstLocation.addressLine1,
            addressLocality: firstLocation.city,
            addressRegion: firstLocation.state,
            postalCode: firstLocation.zipCode,
          },
        }),
        ...(firstLocation?.phone && { telephone: firstLocation.phone }),
        ...(acceptedPlans.length > 0 && {
          availableService: acceptedPlans.slice(0, 50).map((pa) => ({
            '@type': 'Service',
            // Filter above guarantees plan + planName are present, so the
            // non-null assertion is safe here.
            name: pa.plan!.planName,
            category: 'Health Insurance',
            // schema.org `Service.provider` = the entity OFFERING the
            // service — for an insurance plan that's the issuer/carrier
            // (Aetna, UnitedHealthcare, etc.), NOT the doctor. Skipped
            // when issuerName is null rather than emitting an Organization
            // node with a null name.
            ...(pa.plan?.issuerName && {
              provider: {
                '@type': 'Organization',
                name: pa.plan.issuerName,
              },
            }),
          })),
        }),
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
      )}
      <ProviderDetailClient npi={npi} initialProvider={provider} />
    </>
  );
}
