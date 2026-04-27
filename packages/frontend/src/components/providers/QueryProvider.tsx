'use client';

import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { queryClient } from '@/lib/queryClient';
import { prefetchCities } from '@/hooks/useCities';
import { prefetchHealthSystems } from '@/hooks/useHealthSystems';

// Dynamic + ssr:false guarantees the devtools bundle never reaches the
// production client (Next strips the import path entirely when the module
// isn't referenced at build time). The component is a no-op outside of
// development, but skipping the dynamic chunk keeps the prod bundle clean.
const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? dynamic(
        () =>
          import('@tanstack/react-query-devtools').then(
            (mod) => mod.ReactQueryDevtools
          ),
        { ssr: false }
      )
    : null;

/**
 * Warm the React Query cache with the NY-state datasets that drive the
 * launch experience (NYC is the Q2 2026 launch market — see
 * prompts/13-npi-data-pipeline.md). Both prefetch helpers share the
 * module-level queryClient with the rest of the app, so calling them
 * here populates the same cache that `useCities('NY')` and
 * `useHealthSystems({ state: 'NY' })` will consult later.
 *
 * Fire-and-forget: failures are swallowed because per-component queries
 * will retry on demand and own their loading/error UI. useEffect already
 * skips SSR, so there's no `typeof window` guard needed.
 */
function LaunchPrefetcher() {
  useEffect(() => {
    prefetchCities('NY').catch(() => {});
    prefetchHealthSystems('NY').catch(() => {});
  }, []);
  return null;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <LaunchPrefetcher />
      {children}
      {ReactQueryDevtools ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      ) : null}
    </QueryClientProvider>
  );
}
