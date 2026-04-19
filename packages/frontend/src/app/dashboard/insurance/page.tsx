import type { Metadata } from 'next';
import { InsuranceCardDashboard } from './InsuranceCardDashboard';

export const metadata: Metadata = {
  title: 'My Insurance Card | VerifyMyProvider',
  description: 'Manage your saved insurance card, view plan details, and find in-network providers.',
  // Authenticated-only page — no crawlable content.
  robots: { index: false, follow: true },
};

export default function DashboardInsurancePage() {
  return <InsuranceCardDashboard />;
}
