import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Find Healthcare Providers | VerifyMyProvider',
  description: 'Search for doctors, specialists, and healthcare providers. Verify which insurance plans they accept with community-verified data.',
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
