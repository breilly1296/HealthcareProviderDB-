import type { Metadata } from 'next';
import { SavedProvidersList } from './SavedProvidersList';

export const metadata: Metadata = {
  title: 'Saved Providers | VerifyMyProvider',
  description: 'Your saved healthcare providers',
};

export default function SavedProvidersPage() {
  return <SavedProvidersList />;
}
