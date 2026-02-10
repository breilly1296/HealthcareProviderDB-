import Link from 'next/link';
import { VerificationButton } from '@/components/VerificationButton';
import type { ProviderDisplay } from '@/types';

interface ProviderSidebarProps {
  provider: ProviderDisplay;
}

export function ProviderSidebar({ provider }: ProviderSidebarProps) {
  return (
    <div className="space-y-6">
      <VerifyCTACard provider={provider} />
      <ResearchExplainerCard />
      <ProviderDetailsCard provider={provider} />
      <DisclaimerCard />
    </div>
  );
}

function VerifyCTACard({ provider }: { provider: ProviderDisplay }) {
  return (
    <div className="card bg-gradient-to-br from-primary-50 to-primary-100 border-primary-300 shadow-md">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-primary-900 mb-1">
            Verify This Provider
          </h3>
          <p className="text-sm text-primary-800">
            Your 2-minute verification helps prevent surprise bills
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-700 mb-2">
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          5 simple yes/no questions
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-700 mb-2">
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Under 2 minutes, no typing
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-700">
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          3 verifications = expert accuracy
        </div>
      </div>

      <VerificationButton
        npi={provider.npi}
        providerName={provider.displayName}
      />

      <p className="text-xs text-primary-700 mt-3 text-center">
        Research shows patients face 4x more surprise bills when directories are wrong
      </p>
    </div>
  );
}

function ResearchExplainerCard() {
  return (
    <div className="card bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 bg-blue-600 dark:bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white mb-1">
            Why We Verify
          </h3>
          <p className="text-xs text-stone-700 dark:text-gray-300">
            Insurance directories are often wrong — about half of listings contain errors.
            That means surprise bills and wasted time. We use reports from real patients
            to keep information accurate.
          </p>
          <p className="text-xs text-stone-600 dark:text-gray-400 mt-2">
            Just 3 patient reports are enough to confirm a provider&apos;s insurance status
            with high confidence.
          </p>
        </div>
      </div>
      <Link
        href="/research"
        className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 mt-2"
      >
        See the research behind this
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}

function ProviderDetailsCard({ provider }: { provider: ProviderDisplay }) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Provider Details
      </h3>
      <dl className="space-y-3">
        <div>
          <dt className="text-sm text-gray-500 dark:text-gray-400">Entity Type</dt>
          <dd className="text-gray-900 dark:text-white">
            {provider.entityType === 'INDIVIDUAL' ? 'Individual' : 'Organization'}
          </dd>
        </div>
        {provider.taxonomyCode && (
          <div>
            <dt className="text-sm text-gray-500 dark:text-gray-400">Taxonomy Code</dt>
            <dd className="font-mono text-gray-900 dark:text-white">{provider.taxonomyCode}</dd>
          </div>
        )}
        <div>
          <dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt>
          <dd>
            <span className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium ${
              provider.npiStatus === 'ACTIVE'
                ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
            }`}>
              {provider.npiStatus}
            </span>
          </dd>
        </div>
        <div className="pt-2 mt-2 border-t border-stone-100 dark:border-gray-700">
          <dt className="text-xs text-stone-400 dark:text-gray-500">NPI Number</dt>
          <dd className="font-mono text-xs text-stone-500 dark:text-gray-400">{provider.npi}</dd>
        </div>
      </dl>
    </div>
  );
}

function DisclaimerCard() {
  return (
    <div className="card bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
      <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
        Important Note
      </h3>
      <p className="text-yellow-800 dark:text-yellow-300 text-sm">
        Insurance acceptance can change. Always call the provider to confirm they accept your specific plan before your visit.
      </p>
    </div>
  );
}
