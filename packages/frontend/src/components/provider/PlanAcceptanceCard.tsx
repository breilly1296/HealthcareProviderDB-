/**
 * Plan Acceptance Card Component
 * Displays a single insurance plan with verification details
 */

import type { PlanAcceptanceDisplay } from '@/types';
import { ConfidenceIndicator } from '../ConfidenceBadge';
import { VerificationButton } from '../VerificationButton';
import FreshnessWarning from '../FreshnessWarning';
import { ConfidenceScoreExplainer } from './ConfidenceScoreExplainer';
import { VerificationTimeline } from './VerificationTimeline';

interface PlanAcceptanceCardProps {
  planAcceptance: PlanAcceptanceDisplay;
  providerNpi: string;
  providerName: string;
  providerSpecialty: string | null | undefined;
  providerTaxonomy: string | null | undefined;
}

export function PlanAcceptanceCard({
  planAcceptance: pa,
  providerNpi,
  providerName,
  providerSpecialty,
  providerTaxonomy,
}: PlanAcceptanceCardProps) {
  return (
    <div className="space-y-4">
      {/* Plan Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-gray-50 rounded-lg gap-4">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">
            {pa.plan?.planName || 'Unknown Plan'}
          </h3>
          <p className="text-sm text-gray-600">
            {pa.plan?.carrier || pa.plan?.issuerName || 'Unknown Carrier'} • {pa.plan?.planType}
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
          <ConfidenceIndicator
            lastVerifiedAt={pa.lastVerifiedAt}
            verificationCount={pa.verificationCount}
            acceptanceStatus={pa.acceptanceStatus}
          />
          <VerificationButton
            npi={providerNpi}
            providerName={providerName}
            planId={pa.plan?.planId}
            planName={pa.plan?.planName ?? undefined}
          />
        </div>
      </div>

      {/* Freshness Warning */}
      <FreshnessWarning
        lastVerifiedAt={pa.lastVerifiedAt ? new Date(pa.lastVerifiedAt) : null}
        specialty={providerSpecialty}
        taxonomyDescription={providerTaxonomy}
        providerNpi={providerNpi}
        providerName={providerName}
        planId={pa.plan?.planId}
        planName={pa.plan?.planName ?? undefined}
        variant="detail"
        showVerifyButton={true}
      />

      {/* Confidence Score Explainer */}
      {pa.confidenceScore !== undefined && (
        <ConfidenceScoreExplainer
          confidenceScore={pa.confidenceScore}
          confidenceLevel={pa.confidenceLevel}
          verificationCount={pa.verificationCount || 0}
          lastVerifiedAt={pa.lastVerifiedAt}
        />
      )}

      {/* Verification Timeline */}
      {pa.verificationCount > 0 && (
        <VerificationTimeline
          verificationCount={pa.verificationCount}
          lastVerifiedAt={pa.lastVerifiedAt}
          confidenceLevel={pa.confidenceLevel}
          confidenceScore={pa.confidenceScore}
          acceptanceStatus={pa.acceptanceStatus}
          acceptsNewPatients={pa.acceptsNewPatients}
        />
      )}
    </div>
  );
}
