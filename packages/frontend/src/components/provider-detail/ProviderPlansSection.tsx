'use client';

import { useState, useMemo } from 'react';
import type { PlanAcceptanceDisplay, ProviderDisplay } from '@/types';
import {
  ConfidenceScoreBreakdown,
  ConfidenceScoreBadge,
  type ConfidenceLevelType,
} from '@/components/ConfidenceScoreBreakdown';
import { VerificationButton } from '@/components/VerificationButton';
import FreshnessWarning from '@/components/FreshnessWarning';
import { Search, X, ChevronRight } from 'lucide-react';

interface ProviderPlansSectionProps {
  provider: ProviderDisplay;
  planAcceptances: PlanAcceptanceDisplay[];
}

export function ProviderPlansSection({ provider, planAcceptances }: ProviderPlansSectionProps) {
  const [planSearchQuery, setPlanSearchQuery] = useState('');
  const [expandedCarriers, setExpandedCarriers] = useState<Set<string>>(new Set());

  const acceptedPlans = useMemo(() => {
    return planAcceptances.filter(pa => pa.acceptanceStatus === 'ACCEPTED');
  }, [planAcceptances]);

  const groupedPlans = useMemo(() => {
    const groups: Record<string, PlanAcceptanceDisplay[]> = {};

    for (const pa of acceptedPlans) {
      const carrier = pa.plan?.carrier || pa.plan?.issuerName || 'Other';

      if (planSearchQuery) {
        const query = planSearchQuery.toLowerCase();
        const planName = (pa.plan?.planName || '').toLowerCase();
        const carrierName = carrier.toLowerCase();
        if (!planName.includes(query) && !carrierName.includes(query)) {
          continue;
        }
      }

      if (!groups[carrier]) {
        groups[carrier] = [];
      }
      groups[carrier].push(pa);
    }

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [acceptedPlans, planSearchQuery]);

  const toggleCarrier = (carrier: string) => {
    setExpandedCarriers(prev => {
      const next = new Set(prev);
      if (next.has(carrier)) {
        next.delete(carrier);
      } else {
        next.add(carrier);
      }
      return next;
    });
  };

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Accepted Insurance Plans
          {acceptedPlans.length > 0 && (
            <span className="ml-2 text-base font-normal text-gray-500 dark:text-gray-400">
              ({acceptedPlans.length} plan{acceptedPlans.length !== 1 ? 's' : ''})
            </span>
          )}
        </h2>
        {groupedPlans.length > 1 && (
          <div className="flex gap-2">
            <button
              onClick={() => setExpandedCarriers(new Set(groupedPlans.map(([carrier]) => carrier)))}
              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
            >
              Expand All
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button
              onClick={() => setExpandedCarriers(new Set())}
              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      {/* Search Input */}
      {acceptedPlans.length > 5 && (
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search plans or carriers..."
              aria-label="Search plans or carriers"
              value={planSearchQuery}
              onChange={(e) => setPlanSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {planSearchQuery && (
              <button
                onClick={() => setPlanSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {acceptedPlans.length > 0 ? (
        groupedPlans.length > 0 ? (
          <div className="space-y-4">
            {groupedPlans.map(([carrier, plans]) => {
              const isExpanded = expandedCarriers.has(carrier);
              return (
                <div key={carrier} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  {/* Carrier Header */}
                  <button
                    onClick={() => toggleCarrier(carrier)}
                    aria-expanded={isExpanded}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronRight className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} aria-hidden="true" />
                      <span className="font-semibold text-gray-900 dark:text-white">{carrier}</span>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full">
                      {plans.length} plan{plans.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Plans List */}
                  {isExpanded && (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                      {plans.map((pa) => (
                        <PlanCard key={pa.id} plan={pa} provider={provider} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-gray-600 dark:text-gray-300">
              No plans match your search.
            </p>
            <button
              onClick={() => setPlanSearchQuery('')}
              className="mt-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
            >
              Clear search
            </button>
          </div>
        )
      ) : (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            No verified insurance plans yet.
          </p>
          <VerificationButton
            npi={provider.npi}
            providerName={provider.displayName}
          />
        </div>
      )}
    </div>
  );
}

interface PlanCardProps {
  plan: PlanAcceptanceDisplay;
  provider: ProviderDisplay;
}

function PlanCard({ plan: pa, provider }: PlanCardProps) {
  const confidenceLevel = (pa.confidence?.level ||
    pa.confidenceLevel?.toUpperCase().replace(' ', '_') ||
    'MEDIUM') as ConfidenceLevelType;

  const factors = pa.confidence?.factors || {
    dataSourceScore: Math.round(pa.confidenceScore * 0.25),
    recencyScore: Math.round(pa.confidenceScore * 0.30),
    verificationScore: Math.min(25, pa.verificationCount * 8),
    agreementScore: Math.round(pa.confidenceScore * 0.20),
  };

  const metadata = pa.confidence?.metadata || {
    isStale: pa.lastVerifiedAt
      ? (new Date().getTime() - new Date(pa.lastVerifiedAt).getTime()) > 60 * 24 * 60 * 60 * 1000
      : false,
    daysSinceVerification: pa.lastVerifiedAt
      ? Math.floor((new Date().getTime() - new Date(pa.lastVerifiedAt).getTime()) / (24 * 60 * 60 * 1000))
      : null,
    researchNote: pa.verificationCount < 3
      ? 'Just 3 patient reports are needed for high confidence.'
      : 'This provider has enough reports for high confidence.',
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white">
            {pa.plan?.planName || 'Unknown Plan'}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {pa.plan?.planType}
          </p>
          {pa.acceptsNewPatients !== null && (
            <p className="text-sm mt-1">
              {pa.acceptsNewPatients ? (
                <span className="text-green-600">✓ Accepting new patients</span>
              ) : (
                <span className="text-red-600">✗ Not accepting new patients</span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <ConfidenceScoreBadge
            score={pa.confidenceScore}
            level={confidenceLevel}
            size="sm"
            showScore={true}
          />
          <VerificationButton
            npi={provider.npi}
            providerName={provider.displayName}
            planId={pa.plan?.planId}
            planName={pa.plan?.planName ?? undefined}
          />
        </div>
      </div>

      <ConfidenceScoreBreakdown
        score={pa.confidenceScore}
        level={confidenceLevel}
        factors={factors}
        metadata={metadata}
      />

      <FreshnessWarning
        lastVerifiedAt={pa.lastVerifiedAt ? new Date(pa.lastVerifiedAt) : null}
        specialty={provider.specialtyCategory}
        taxonomyDescription={provider.taxonomyDescription}
        providerNpi={provider.npi}
        providerName={provider.displayName}
        planId={pa.plan?.planId}
        planName={pa.plan?.planName ?? undefined}
        variant="detail"
        showVerifyButton={true}
      />
    </div>
  );
}
