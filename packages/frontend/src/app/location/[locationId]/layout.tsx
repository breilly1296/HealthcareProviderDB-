import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Location Details | VerifyMyProvider',
  description: 'View healthcare providers at this location, filter by specialty, and verify insurance acceptance.',
};

export default function LocationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
