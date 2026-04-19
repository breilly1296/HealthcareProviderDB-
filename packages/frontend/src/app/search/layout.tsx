import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Find Healthcare Providers | VerifyMyProvider',
  description: 'Search for doctors, specialists, and healthcare providers. Verify which insurance plans they accept with community-verified data.',
  // Filter permutations (state, cities, specialty, etc. in query string)
  // create near-unbounded URL variants. Keep the route reachable for
  // crawlers but exclude it from the index.
  robots: { index: false, follow: true },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
