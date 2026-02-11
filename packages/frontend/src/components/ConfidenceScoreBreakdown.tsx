'use client';

import { useState, useRef, useEffect } from 'react';
import { progressWidth } from '@/lib/utils';
import { FileText, Clock, Users, CheckCircle2, Check, AlertCircle, AlertTriangle, ChevronDown, BarChart3, Info } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export type ConfidenceLevelType = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';

export interface ConfidenceFactors {
  dataSourceScore: number;      // 0-25 points
  recencyScore: number;         // 0-30 points
  verificationScore: number;    // 0-25 points
  agreementScore: number;       // 0-20 points
}

export interface ConfidenceMetadata {
  researchNote?: string;
  isStale?: boolean;
  daysSinceVerification?: number | null;
  explanation?: string;
  daysUntilStale?: number;
  freshnessThreshold?: number;
  recommendReVerification?: boolean;
}

export interface ConfidenceScoreBreakdownProps {
  score: number;
  level: ConfidenceLevelType;
  factors: ConfidenceFactors;
  metadata?: ConfidenceMetadata;
  showExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
}

// ============================================================================
// Constants
// ============================================================================

const FACTOR_CONFIG = [
  {
    key: 'dataSourceScore' as const,
    label: 'Data Source',
    maxPoints: 25,
    description: 'Quality of data source',
    icon: <FileText className="w-4 h-4" />,
  },
  {
    key: 'recencyScore' as const,
    label: 'Recency',
    maxPoints: 30,
    description: 'How recently verified',
    icon: <Clock className="w-4 h-4" />,
  },
  {
    key: 'verificationScore' as const,
    label: 'Verifications',
    maxPoints: 25,
    description: 'Number of community verifications',
    icon: <Users className="w-4 h-4" />,
  },
  {
    key: 'agreementScore' as const,
    label: 'Agreement',
    maxPoints: 20,
    description: 'Consensus among verifications',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
];

const LEVEL_STYLES: Record<ConfidenceLevelType, {
  bg: string;
  border: string;
  text: string;
  progressBg: string;
  progressFill: string;
  label: string;
  icon: JSX.Element;
}> = {
  VERY_HIGH: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    progressBg: 'bg-green-100',
    progressFill: 'bg-green-500',
    label: 'Very High',
    icon: <CheckCircle2 className="w-5 h-5" />,
  },
  HIGH: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    progressBg: 'bg-green-100',
    progressFill: 'bg-green-500',
    label: 'High',
    icon: <Check className="w-5 h-5" />,
  },
  MEDIUM: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    progressBg: 'bg-yellow-100',
    progressFill: 'bg-yellow-500',
    label: 'Medium',
    icon: <AlertCircle className="w-5 h-5" />,
  },
  LOW: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    progressBg: 'bg-orange-100',
    progressFill: 'bg-orange-500',
    label: 'Low',
    icon: <AlertTriangle className="w-5 h-5" />,
  },
  VERY_LOW: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    progressBg: 'bg-red-100',
    progressFill: 'bg-red-500',
    label: 'Very Low',
    icon: <AlertCircle className="w-5 h-5" />,
  },
};

// ============================================================================
// Helper Components
// ============================================================================

interface ProgressBarProps {
  value: number;
  max: number;
  fillClass: string;
  bgClass: string;
}

function ProgressBar({ value, max, fillClass, bgClass }: ProgressBarProps) {
  const percentage = (value / max) * 100;
  const barWidth = progressWidth(percentage);

  return (
    <div
      className={`h-2 rounded-full overflow-hidden ${bgClass}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={`h-full rounded-full transition-all duration-300 ${fillClass}`}
        style={barWidth}
      />
    </div>
  );
}

interface FactorRowProps {
  config: typeof FACTOR_CONFIG[number];
  value: number;
  style: typeof LEVEL_STYLES[ConfidenceLevelType];
}

function FactorRow({ config, value, style }: FactorRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-gray-700">
          <span className="text-gray-400">{config.icon}</span>
          <span className="font-medium">{config.label}</span>
        </div>
        <span className={`font-semibold ${style.text}`}>
          {value}/{config.maxPoints}
        </span>
      </div>
      <ProgressBar
        value={value}
        max={config.maxPoints}
        fillClass={style.progressFill}
        bgClass={style.progressBg}
      />
      <p className="text-xs text-gray-500">{config.description}</p>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ConfidenceScoreBreakdown({
  score,
  level,
  factors,
  metadata,
  showExpanded: controlledExpanded,
  onToggle,
}: ConfidenceScoreBreakdownProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : internalExpanded;

  const style = LEVEL_STYLES[level];

  const handleToggle = () => {
    const newValue = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(newValue);
    }
    onToggle?.(newValue);
  };

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} overflow-hidden`}>
      {/* Header - Clickable to expand/collapse */}
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-opacity-80 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-controls="confidence-breakdown-content"
      >
        <div className="flex items-center gap-3">
          <span className={style.text}>{style.icon}</span>
          <div className="text-left">
            <span className={`font-semibold ${style.text}`}>
              {style.label} Confidence
            </span>
            <span className="text-gray-600 ml-2">({Math.round(score)}%)</span>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expandable Content */}
      <div
        id="confidence-breakdown-content"
        className={`transition-all duration-200 ease-in-out ${
          isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="px-4 pb-4 space-y-4 border-t border-gray-200/50">
          {/* Staleness Warning */}
          {metadata?.isStale && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Data may be stale</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Last verified {metadata.daysSinceVerification} days ago.
                  {metadata.recommendReVerification && ' Re-verification recommended.'}
                </p>
              </div>
            </div>
          )}

          {/* Score Factors */}
          <div className="mt-4 space-y-4">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Score Breakdown
            </h4>

            {FACTOR_CONFIG.map((config) => (
              <FactorRow
                key={config.key}
                config={config}
                value={factors[config.key]}
                style={style}
              />
            ))}
          </div>

          {/* Total Score */}
          <div className="pt-3 border-t border-gray-200/50">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-700">Total Score</span>
              <span className={`text-lg font-bold ${style.text}`}>
                {Math.round(score)}/100
              </span>
            </div>
          </div>

          {/* Research Note */}
          {metadata?.researchNote && (
            <div className="pt-3 border-t border-gray-200/50">
              <div className="flex items-start gap-2 text-sm">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-gray-600 italic">
                  {metadata.researchNote}
                </p>
              </div>
            </div>
          )}

          {/* Explanation */}
          {metadata?.explanation && (
            <div className="pt-3 border-t border-gray-200/50">
              <p className="text-sm text-gray-600">
                {metadata.explanation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Compact Badge Component
// ============================================================================

export interface ConfidenceScoreBadgeProps {
  score: number;
  level: ConfidenceLevelType;
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
  onClick?: () => void;
  className?: string;
}

const BADGE_SIZES = {
  sm: 'px-2 py-0.5 text-xs gap-1',
  md: 'px-2.5 py-1 text-sm gap-1.5',
  lg: 'px-3 py-1.5 text-base gap-2',
};

export function ConfidenceScoreBadge({
  score,
  level,
  size = 'md',
  showScore = true,
  onClick,
  className = '',
}: ConfidenceScoreBadgeProps) {
  const style = LEVEL_STYLES[level];
  const isClickable = !!onClick;

  const baseClasses = `
    inline-flex items-center font-medium rounded-full border
    ${style.bg} ${style.border} ${style.text}
    ${BADGE_SIZES[size]}
    ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary-500' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  const content = (
    <>
      <span className="flex-shrink-0">
        {size === 'sm' ? (
          level === 'VERY_HIGH' || level === 'HIGH' ? (
            <Check className="w-3 h-3" />
          ) : level === 'MEDIUM' ? (
            <AlertCircle className="w-3 h-3" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )
        ) : (
          style.icon
        )}
      </span>
      <span>{style.label}</span>
      {showScore && (
        <span className="opacity-75">({Math.round(score)})</span>
      )}
    </>
  );

  if (isClickable) {
    return (
      <button
        type="button"
        className={baseClasses}
        onClick={onClick}
        title={`Confidence Score: ${Math.round(score)}/100 - Click for details`}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={baseClasses}
      title={`Confidence Score: ${Math.round(score)}/100`}
    >
      {content}
    </span>
  );
}

// ============================================================================
// Tooltip Component
// ============================================================================

export interface ConfidenceScoreTooltipProps {
  score: number;
  level: ConfidenceLevelType;
  factors: ConfidenceFactors;
  metadata?: ConfidenceMetadata;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function ConfidenceScoreTooltip({
  score,
  level,
  factors,
  metadata,
  children,
  position = 'top',
}: ConfidenceScoreTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const style = LEVEL_STYLES[level];

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = -tooltipRect.height - 8;
          left = (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'bottom':
          top = triggerRect.height + 8;
          left = (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'left':
          top = (triggerRect.height - tooltipRect.height) / 2;
          left = -tooltipRect.width - 8;
          break;
        case 'right':
          top = (triggerRect.height - tooltipRect.height) / 2;
          left = triggerRect.width + 8;
          break;
      }

      setTooltipPosition({ top, left });
    }
  }, [isVisible, position]);

  return (
    <div
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}

      {isVisible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={`
            absolute z-50 w-72 p-4 rounded-lg shadow-lg border
            ${style.bg} ${style.border}
            animate-in fade-in-0 zoom-in-95 duration-150
          `}
          style={tooltipPosition}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <span className={style.text}>{style.icon}</span>
            <span className={`font-semibold ${style.text}`}>
              {style.label} Confidence ({Math.round(score)}%)
            </span>
          </div>

          {/* Staleness Warning */}
          {metadata?.isStale && (
            <div className="mb-3 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
              <AlertCircle className="w-3 h-3" />
              Data may be stale ({metadata.daysSinceVerification} days old)
            </div>
          )}

          {/* Compact Factor List */}
          <div className="space-y-2 text-sm">
            {FACTOR_CONFIG.map((config) => {
              const value = factors[config.key];
              const percentage = (value / config.maxPoints) * 100;
              const barWidth = progressWidth(percentage);

              return (
                <div key={config.key} className="flex items-center justify-between">
                  <span className="text-gray-600">{config.label}</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-12 h-1.5 rounded-full ${style.progressBg}`}>
                      <div
                        className={`h-full rounded-full ${style.progressFill}`}
                        style={barWidth}
                      />
                    </div>
                    <span className={`text-xs font-medium ${style.text} w-8 text-right`}>
                      {value}/{config.maxPoints}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Research Note */}
          {metadata?.researchNote && (
            <p className="mt-3 pt-3 border-t border-gray-200/50 text-xs text-gray-500 italic">
              {metadata.researchNote}
            </p>
          )}

          {/* Arrow */}
          <div
            className={`
              absolute w-3 h-3 rotate-45
              ${style.bg} ${style.border}
              ${position === 'top' ? 'bottom-[-6px] left-1/2 -translate-x-1/2 border-t-0 border-l-0' : ''}
              ${position === 'bottom' ? 'top-[-6px] left-1/2 -translate-x-1/2 border-b-0 border-r-0' : ''}
              ${position === 'left' ? 'right-[-6px] top-1/2 -translate-y-1/2 border-l-0 border-b-0' : ''}
              ${position === 'right' ? 'left-[-6px] top-1/2 -translate-y-1/2 border-r-0 border-t-0' : ''}
            `}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Export all
// ============================================================================

export default ConfidenceScoreBreakdown;
