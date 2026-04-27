import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LocationDetailClient from './LocationDetailClient';
import type { Location } from '@/types';
import { safeJsonLd } from '@/lib/jsonLd';
import { formatZipCode } from '@/lib/formatName';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://verifymyprovider.com';

async function getLocation(locationId: number): Promise<Location | null> {
  if (!Number.isFinite(locationId) || locationId <= 0) return null;
  try {
    const res = await fetch(`${API_URL}/locations/${locationId}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.location ?? null;
  } catch {
    return null;
  }
}

function formatLocationLabel(location: Location): string {
  const parts = [
    location.addressLine1,
    location.city,
    [location.state, formatZipCode(location.zipCode)].filter(Boolean).join(' '),
  ].filter(Boolean);
  return parts.join(', ');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locationId: string }>;
}): Promise<Metadata> {
  const { locationId } = await params;
  const id = parseInt(locationId, 10);
  const location = await getLocation(id);

  if (!location) {
    return { title: 'Location Not Found | VerifyMyProvider' };
  }

  const label = formatLocationLabel(location);
  const heading = location.name ? `${location.name}, ${label}` : label;

  const title = `Healthcare Providers at ${heading} | VerifyMyProvider`;
  const description = location.name
    ? `View healthcare providers practicing at ${location.name}, ${label}. Verify insurance acceptance with community-verified data.`
    : `View healthcare providers practicing at ${label}. Verify insurance acceptance with community-verified data.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/location/${id}`,
    },
    openGraph: {
      title: location.name
        ? `Providers at ${location.name}`
        : `Providers at ${label}`,
      description,
      type: 'website',
    },
  };
}

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  const id = parseInt(locationId, 10);

  if (!Number.isFinite(id) || id <= 0) {
    notFound();
  }

  const location = await getLocation(id);

  // 404 only when the backend confirms the row is absent (the endpoint
  // returns a 4xx → getLocation returns null). A network blip during SSR
  // would also land us here; that's acceptable — the client will retry on
  // mount and show its own error UI if the second fetch also fails.
  if (!location) {
    notFound();
  }

  // Schema.org structured data — MedicalOrganization fits a clinic /
  // facility location better than Place because the page is specifically
  // about healthcare practice at this address.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalOrganization',
    name: location.name || location.addressLine1,
    ...(location.healthSystem && { parentOrganization: location.healthSystem }),
    address: {
      '@type': 'PostalAddress',
      streetAddress: [location.addressLine1, location.addressLine2]
        .filter(Boolean)
        .join(', '),
      addressLocality: location.city,
      addressRegion: location.state,
      postalCode: formatZipCode(location.zipCode),
      addressCountry: 'US',
    },
    url: `${SITE_URL}/location/${id}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Content is server-built from typed Location fields and escaped via
        // safeJsonLd() to neutralize any `</script>` breakout in user-
        // influenceable strings (location.name, healthSystem). See helper.
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <LocationDetailClient locationId={id} initialLocation={location} />
    </>
  );
}
