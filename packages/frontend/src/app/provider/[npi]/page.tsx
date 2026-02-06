import type { Metadata } from 'next';
import ProviderDetailClient from '@/components/provider-detail/ProviderDetailClient';
import type { ProviderWithPlans } from '@/components/provider-detail/ProviderDetailClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

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
  const specialty = provider.taxonomyDescription || provider.specialtyCategory || 'Healthcare Provider';
  const city = provider.city || '';
  const state = provider.state || '';
  const location = [city, state].filter(Boolean).join(', ');

  return {
    title: `${name} - ${specialty} in ${location} | VerifyMyProvider`,
    description: `Verify insurance acceptance for ${name}, ${specialty} in ${location}. Check which insurance plans are accepted with community-verified data.`,
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
  const specialty = provider?.taxonomyDescription || provider?.specialtyCategory || null;
  const firstLocation = provider?.locations?.[0];

  const jsonLd = provider
    ? {
        '@context': 'https://schema.org',
        '@type': provider.entityType === 'INDIVIDUAL' ? 'Physician' : 'MedicalOrganization',
        name,
        ...(specialty && { medicalSpecialty: specialty }),
        ...(firstLocation && {
          address: {
            '@type': 'PostalAddress',
            streetAddress: firstLocation.address_line1,
            addressLocality: firstLocation.city,
            addressRegion: firstLocation.state,
            postalCode: firstLocation.zip_code,
          },
        }),
        ...(firstLocation?.phone && { telephone: firstLocation.phone }),
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProviderDetailClient npi={npi} initialProvider={provider} />
    </>
  );
}
