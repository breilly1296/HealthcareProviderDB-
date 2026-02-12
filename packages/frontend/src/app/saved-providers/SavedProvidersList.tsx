'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import type { SavedProviderDisplay } from '@/lib/api';
import { toDisplayCase, toTitleCase, toAddressCase } from '@/lib/formatName';
import { LocationIcon, ChevronRightIcon } from '@/components/icons';
import { Shimmer } from '@/components/ui/Shimmer';

// ============================================================================
// Helpers
// ============================================================================

function getProviderName(provider: SavedProviderDisplay): string {
  if (provider.entityType === 'ORGANIZATION' && provider.organizationName) {
    return toDisplayCase(provider.organizationName);
  }
  const parts = [provider.firstName, provider.lastName].filter(Boolean).join(' ');
  const name = toDisplayCase(parts) || 'Unknown Provider';
  if (provider.credential) {
    return `${name}, ${provider.credential}`;
  }
  return name;
}

function getInitials(provider: SavedProviderDisplay): string {
  if (provider.entityType === 'ORGANIZATION' && provider.organizationName) {
    return provider.organizationName
      .split(' ')
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
  }
  const first = provider.firstName?.[0] || '';
  const last = provider.lastName?.[0] || '';
  return (first + last).toUpperCase() || 'DR';
}

// ============================================================================
// Saved Provider Card
// ============================================================================

function SavedProviderCard({
  provider,
  onUnsave,
  isUnsaving,
}: {
  provider: SavedProviderDisplay;
  onUnsave: (npi: string) => void;
  isUnsaving: boolean;
}) {
  const displayName = getProviderName(provider);
  const initials = getInitials(provider);
  const loc = provider.location;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-stone-200 dark:border-gray-700 p-4 sm:p-5 hover:shadow-lg hover:border-stone-300 dark:hover:border-gray-600 transition-all duration-150">
      <div className="flex gap-3 sm:gap-4">
        {/* Avatar */}
        <Link href={`/provider/${provider.npi}`} className="flex-shrink-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#137fec] to-[#0d5bb5] flex items-center justify-center">
            <span className="text-white font-bold text-base sm:text-lg">{initials}</span>
          </div>
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/provider/${provider.npi}`} className="min-w-0 flex-1 group">
              <h3 className="text-lg sm:text-xl font-bold text-stone-800 dark:text-white line-clamp-2 group-hover:text-[#137fec] transition-colors">
                {displayName}
              </h3>
            </Link>

            {/* Bookmark (unsave) button */}
            <button
              onClick={() => onUnsave(provider.npi)}
              disabled={isUnsaving}
              className="flex-shrink-0 p-2 -m-2 text-primary-600 dark:text-primary-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
              aria-label={`Remove ${displayName} from saved providers`}
              title="Remove from saved"
            >
              <Bookmark className="w-5 h-5 fill-current" aria-hidden="true" />
            </button>
          </div>

          {/* Specialty */}
          {provider.primarySpecialty && (
            <p className="text-[#137fec] font-medium text-sm mb-2">
              {provider.primarySpecialty}
            </p>
          )}

          {/* Location */}
          {loc && (loc.city || loc.state) && (
            <div className="flex items-start gap-2 text-sm text-stone-600 dark:text-gray-300">
              <LocationIcon className="w-4 h-4 text-stone-400 dark:text-gray-500 mt-0.5 flex-shrink-0" aria-hidden={true} />
              <span>
                {loc.addressLine1 && <>{toAddressCase(loc.addressLine1)}, </>}
                {toTitleCase(loc.city)}, {loc.state}
                {loc.zipCode && ` ${loc.zipCode}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-stone-100 dark:border-gray-700 flex items-center justify-between">
        <span className="text-xs text-stone-400 dark:text-gray-500">
          Saved {new Date(provider.savedAt).toLocaleDateString()}
        </span>
        <Link
          href={`/provider/${provider.npi}`}
          className="flex items-center gap-1 text-[#137fec] font-medium text-sm hover:gap-2 transition-all"
        >
          View Details
          <ChevronRightIcon className="w-4 h-4" aria-hidden={true} />
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function SavedProvidersSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading saved providers">
      <span className="sr-only">Loading saved providers...</span>
      <div className="space-y-4" aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="card">
            <div className="flex gap-4">
              <Shimmer className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-3">
                <Shimmer className="h-7 w-3/4 rounded" />
                <Shimmer className="h-5 w-1/2 rounded" />
                <Shimmer className="h-4 w-2/3 rounded" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between">
              <Shimmer className="h-4 w-24 rounded" />
              <Shimmer className="h-4 w-24 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Pagination
// ============================================================================

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2);

  return (
    <nav aria-label="Saved providers pagination" className="mt-8 flex justify-center gap-2">
      {pages.map((p, idx) => {
        const prevPage = pages[idx - 1];
        const showEllipsis = idx > 0 && prevPage !== undefined && p - prevPage > 1;

        return (
          <div key={p} className="flex items-center gap-2">
            {showEllipsis && (
              <span className="px-2 text-gray-400 dark:text-gray-500">...</span>
            )}
            <button
              onClick={() => onPageChange(p)}
              className={`min-w-[44px] min-h-[44px] px-4 py-3 rounded-lg font-medium flex items-center justify-center ${
                p === page
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              aria-label={`Page ${p}${p === page ? ', current page' : ''}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SavedProvidersList() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const {
    data,
    isLoading: providersLoading,
    error,
  } = useQuery({
    queryKey: ['saved-providers', page],
    queryFn: () => api.savedProviders.list({ page, limit: 20 }),
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const unsaveMutation = useMutation({
    mutationFn: (npi: string) => api.savedProviders.unsave(npi),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-providers'] });
    },
    onError: () => {
      toast.error('Failed to remove provider. Please try again.');
    },
  });

  const handleUnsave = useCallback(
    (npi: string) => {
      unsaveMutation.mutate(npi);
    },
    [unsaveMutation]
  );

  // Auth loading state
  if (authLoading) {
    return (
      <div className="py-8 md:py-12">
        <div className="container-wide">
          <SavedProvidersSkeleton />
        </div>
      </div>
    );
  }

  // Not logged in
  if (!isAuthenticated) {
    return (
      <div className="py-12 md:py-20">
        <div className="container-narrow">
          <div className="max-w-md mx-auto text-center">
            <div className="card">
              <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-5">
                <Bookmark className="w-8 h-8 text-primary-600 dark:text-primary-400" />
              </div>
              <h1 className="text-2xl font-bold text-stone-800 dark:text-white mb-3">
                Saved Providers
              </h1>
              <p className="text-stone-600 dark:text-gray-300 mb-6">
                Sign in to save providers you want to remember.
              </p>
              <Link href="/login" className="btn-primary">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged in — loading providers
  if (providersLoading) {
    return (
      <div className="py-8 md:py-12">
        <div className="container-wide">
          <h1 className="text-2xl md:text-3xl font-bold text-stone-800 dark:text-white mb-6">
            Saved Providers
          </h1>
          <SavedProvidersSkeleton />
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="py-8 md:py-12">
        <div className="container-wide">
          <h1 className="text-2xl md:text-3xl font-bold text-stone-800 dark:text-white mb-6">
            Saved Providers
          </h1>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            Something went wrong loading your saved providers. Please try again later.
          </div>
        </div>
      </div>
    );
  }

  const providers = data?.providers ?? [];
  const pagination = data?.pagination;

  // Empty state
  if (providers.length === 0 && page === 1) {
    return (
      <div className="py-8 md:py-12">
        <div className="container-wide">
          <h1 className="text-2xl md:text-3xl font-bold text-stone-800 dark:text-white mb-8">
            Saved Providers
          </h1>
          <div className="card text-center py-12">
            <div className="w-16 h-16 bg-stone-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-5">
              <Bookmark className="w-8 h-8 text-stone-400 dark:text-gray-500" />
            </div>
            <h2 className="text-lg font-semibold text-stone-700 dark:text-gray-200 mb-2">
              No saved providers yet
            </h2>
            <p className="text-stone-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
              Search for providers and click the bookmark icon to save them here.
            </p>
            <Link href="/search" className="btn-primary">
              Search Providers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Provider list
  return (
    <div className="py-8 md:py-12">
      <div className="container-wide">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-stone-800 dark:text-white">
              Saved Providers
            </h1>
            {pagination && (
              <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">
                {pagination.total} saved provider{pagination.total !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {providers.map((provider) => (
            <SavedProviderCard
              key={provider.npi}
              provider={provider}
              onUnsave={handleUnsave}
              isUnsaving={
                unsaveMutation.isPending &&
                unsaveMutation.variables === provider.npi
              }
            />
          ))}
        </div>

        {pagination && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
