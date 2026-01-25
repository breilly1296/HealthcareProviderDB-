/**
 * Verification Timeline Component
 * Displays verification progress and activity history
 */

import { ClockIcon, CheckIcon } from '../icons/Icons';
import { formatConfidenceLevel, getAcceptanceStatusText, getNewPatientStatusText, formatDate } from '@/lib/provider-utils';
import { progressWidth } from '@/lib/utils';

interface VerificationTimelineProps {
  verificationCount: number;
  lastVerifiedAt: string | null;
  confidenceLevel?: string | null;
  confidenceScore: number;
  acceptanceStatus: string;
  acceptsNewPatients: boolean | null;
}

const MIN_VERIFICATIONS = 3;

export function VerificationTimeline({
  verificationCount,
  lastVerifiedAt,
  confidenceLevel,
  confidenceScore,
  acceptanceStatus,
  acceptsNewPatients,
}: VerificationTimelineProps) {
  const progressPercentage = (verificationCount / MIN_VERIFICATIONS) * 100;
  const isExpertLevel = verificationCount >= MIN_VERIFICATIONS;
  const verificationsNeeded = MIN_VERIFICATIONS - verificationCount;
  const barWidth = progressWidth(progressPercentage);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
          <ClockIcon className="w-4 h-4 text-green-600" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 mb-3">
            Verification Activity
          </h4>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Community verifications
              </span>
              <span className="text-sm text-gray-600">
                {verificationCount} of {MIN_VERIFICATIONS} needed
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isExpertLevel ? 'bg-green-500' : 'bg-primary-500'
                }`}
                style={barWidth}
              />
            </div>
            {isExpertLevel ? (
              <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                <CheckIcon className="w-4 h-4" />
                Expert-level accuracy achieved (κ=0.58)
              </p>
            ) : (
              <p className="text-xs text-gray-600 mt-2">
                {verificationsNeeded} more {verificationsNeeded === 1 ? 'verification' : 'verifications'} needed for high confidence
              </p>
            )}
          </div>

          {/* Timeline */}
          <div className="space-y-3">
            <TimelineItem
              color="green"
              title={`${verificationCount} patient${verificationCount !== 1 ? 's' : ''} verified`}
              subtitle={`Most recent: ${formatDate(lastVerifiedAt)}`}
            />

            <TimelineItem
              color="primary"
              title="Confidence level"
              subtitle={`${formatConfidenceLevel(confidenceLevel)} (${confidenceScore}%)`}
            />

            <TimelineItem
              color="gray"
              title="Acceptance status"
              subtitle={getStatusSubtitle(acceptanceStatus, acceptsNewPatients)}
              isLast
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface TimelineItemProps {
  color: 'green' | 'primary' | 'gray';
  title: string;
  subtitle: string;
  isLast?: boolean;
}

function TimelineItem({ color, title, subtitle, isLast = false }: TimelineItemProps) {
  const colorClasses = {
    green: 'bg-green-500',
    primary: 'bg-primary-500',
    gray: 'bg-gray-400',
  };

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-2 h-2 rounded-full ${colorClasses[color]} ${isLast ? 'flex-shrink-0 mt-1' : ''}`} />
        {!isLast && <div className="w-0.5 h-full bg-gray-300" />}
      </div>
      <div className={isLast ? 'flex-1' : 'flex-1 pb-3'}>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-600">{subtitle}</p>
      </div>
    </div>
  );
}

function getStatusSubtitle(acceptanceStatus: string, acceptsNewPatients: boolean | null): string {
  const statusText = getAcceptanceStatusText(acceptanceStatus);
  const patientText = getNewPatientStatusText(acceptsNewPatients);

  return patientText ? `${statusText} • ${patientText}` : statusText;
}
