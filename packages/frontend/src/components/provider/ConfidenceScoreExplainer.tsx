/**
 * Confidence Score Explainer Component
 * Displays research-backed explanation of confidence scoring
 */

import { ChartBarIcon } from '../icons/Icons';
import { formatConfidenceLevel, formatDate } from '@/lib/provider-utils';

interface ConfidenceScoreExplainerProps {
  confidenceScore: number;
  confidenceLevel?: string | null;
  verificationCount: number;
  lastVerifiedAt: string | null;
}

export function ConfidenceScoreExplainer({
  confidenceScore,
  confidenceLevel,
  verificationCount,
  lastVerifiedAt,
}: ConfidenceScoreExplainerProps) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
          <ChartBarIcon className="w-4 h-4 text-primary-600" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 mb-2">
            Understanding Confidence Scores
          </h4>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              This plan has a <strong>{formatConfidenceLevel(confidenceLevel)}</strong> confidence
              score ({confidenceScore}%) based on:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>{verificationCount}</strong> patient verifications</li>
              <li>Data freshness (last verified {formatDate(lastVerifiedAt)})</li>
              <li>Source reliability (crowdsourced + authoritative data)</li>
              <li>Community agreement rate</li>
            </ul>
            <div className="bg-white border border-primary-200 rounded p-3 mt-3">
              <p className="text-xs text-primary-900">
                Just 3 patient reports are enough to confirm a provider&apos;s insurance status with high confidence.
                Insurance directories are often wrong, so real patient data makes a big difference.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
