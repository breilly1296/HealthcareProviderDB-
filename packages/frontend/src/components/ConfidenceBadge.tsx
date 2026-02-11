'use client';

import {
  getConfidenceLevel,
  CONFIDENCE_STYLES,
  CONFIDENCE_BAR_COLORS,
  type ConfidenceLevel,
} from '@/lib/provider-utils';
import { progressWidth } from '@/lib/utils';
import { Check, AlertCircle, AlertTriangle } from 'lucide-react';

/** SVG icons for confidence levels */
const CONFIDENCE_ICONS: Record<ConfidenceLevel, JSX.Element> = {
  high: <Check className="w-4 h-4" />,
  medium: <AlertCircle className="w-4 h-4" />,
  low: <AlertTriangle className="w-4 h-4" />,
};

const SIZE_CLASSES = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base',
};

interface ConfidenceBadgeProps {
  score: number;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceBadge({ score, showScore = true, size = 'md' }: ConfidenceBadgeProps) {
  const level = getConfidenceLevel(score);
  const { bgColor, color, label } = CONFIDENCE_STYLES[level];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${bgColor} ${color} ${SIZE_CLASSES[size]}`}
      title={`Confidence Score: ${score}/100`}
    >
      {CONFIDENCE_ICONS[level]}
      <span>{label}</span>
      {showScore && <span className="opacity-75">({Math.round(score)})</span>}
    </span>
  );
}

// Compact version for lists - NEW FORMAT
interface VerificationStatusProps {
  lastVerifiedAt: string | null;
  verificationCount: number;
  acceptanceStatus: string;
}

export function ConfidenceIndicator({
  lastVerifiedAt,
  verificationCount,
  acceptanceStatus,
}: VerificationStatusProps) {
  const isVerified = verificationCount > 0 && acceptanceStatus !== 'UNKNOWN';

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (!isVerified) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
        <span className="text-amber-500">⚠️</span>
        <span>Unverified</span>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <span className="text-primary-600 dark:text-primary-400">Be the first to verify</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 flex-wrap">
      <span className="text-green-600 dark:text-green-500">✅</span>
      <span className="text-green-700 dark:text-green-400 font-medium">Verified</span>
      {lastVerifiedAt && (
        <>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span>Last verified {formatDate(lastVerifiedAt)}</span>
        </>
      )}
      <span className="text-gray-300 dark:text-gray-600">·</span>
      <span>
        {verificationCount} {verificationCount === 1 ? 'user' : 'users'} confirmed
      </span>
    </div>
  );
}

// Legacy percentage-based indicator (for backwards compatibility)
export function ConfidenceProgressBar({ score }: { score: number }) {
  const level = getConfidenceLevel(score);
  const barWidth = progressWidth(score);

  return (
    <div className="flex items-center gap-2" title={`Confidence: ${Math.round(score)}%`}>
      <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${CONFIDENCE_BAR_COLORS[level]}`}
          style={barWidth}
        />
      </div>
      <span className="text-sm text-gray-600 dark:text-gray-400">{Math.round(score)}%</span>
    </div>
  );
}
