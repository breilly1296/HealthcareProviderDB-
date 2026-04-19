import type { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://verifymyprovider.com';

export const metadata: Metadata = {
  title: 'Provider Map | VerifyMyProvider',
  description: 'Browse healthcare providers on an interactive map',
  alternates: { canonical: `${SITE_URL}/map` },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
