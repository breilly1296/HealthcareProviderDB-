'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { providerApi } from '@/lib/api';
import type { ProviderDisplay, PlanAcceptanceDisplay } from '@/types';
import { ProviderDetailSkeleton } from '@/components/ProviderCardSkeleton';
import ErrorMessage from '@/components/ErrorMessage';
import { trackProviderView } from '@/lib/analytics';
import {
  ProviderHeader,
  ProviderPlansSection,
  ColocatedProviders,
  ProviderSidebar,
} from '@/components/provider-detail';

interface ProviderWithPlans extends ProviderDisplay {
  planAcceptances: PlanAcceptanceDisplay[];
}

export default function ProviderDetailPage() {
  const params = useParams();
  const npi = params.npi as string;

  const [provider, setProvider] = useState<ProviderWithPlans | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; type: 'network' | 'server' | 'not-found' } | null>(null);

  const fetchProvider = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await providerApi.getByNpi(npi);
      setProvider(result.provider);

      trackProviderView({
        npi,
        specialty: result.provider.specialtyCategory || result.provider.taxonomyDescription || undefined,
        providerName: result.provider.displayName,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load provider';
      const isNetworkError = errorMessage.toLowerCase().includes('network') ||
                            errorMessage.toLowerCase().includes('fetch') ||
                            errorMessage.toLowerCase().includes('connection');
      const isNotFound = errorMessage.toLowerCase().includes('not found') ||
                        errorMessage.toLowerCase().includes('404');

      setError({
        message: errorMessage,
        type: isNotFound ? 'not-found' : isNetworkError ? 'network' : 'server'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (npi) {
      fetchProvider();
    }
  }, [npi]);

  if (loading) {
    return <ProviderDetailSkeleton />;
  }

  if (error || !provider) {
    return (
      <div className="py-12">
        <div className="container-wide">
          <ErrorMessage
            variant={error?.type || 'not-found'}
            message={error?.message || 'The provider you are looking for does not exist.'}
            action={
              error?.type === 'network' || error?.type === 'server'
                ? { label: 'Try Again', onClick: fetchProvider }
                : undefined
            }
          >
            <Link href="/search" className="btn-primary">
              Back to Search
            </Link>
          </ErrorMessage>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 md:py-12">
      <div className="container-wide">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <li>
              <Link href="/" className="hover:text-primary-600 dark:hover:text-primary-400">Home</Link>
            </li>
            <li>/</li>
            <li>
              <Link href="/search" className="hover:text-primary-600 dark:hover:text-primary-400">Search</Link>
            </li>
            <li>/</li>
            <li className="text-gray-900 dark:text-white font-medium truncate max-w-[200px]">
              {provider.displayName}
            </li>
          </ol>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <ProviderHeader provider={provider} />
            <ProviderPlansSection provider={provider} planAcceptances={provider.planAcceptances} />
            <ColocatedProviders npi={npi} />
          </div>

          {/* Sidebar */}
          <ProviderSidebar provider={provider} />
        </div>
      </div>
    </div>
  );
}
