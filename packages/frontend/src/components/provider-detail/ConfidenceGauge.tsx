'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import FocusTrap from 'focus-trap-react';
import {
  ConfidenceScoreBreakdown,
  type ConfidenceLevelType,
  type ConfidenceFactors,
  type ConfidenceMetadata,
} from '@/components/ConfidenceScoreBreakdown';

interface ConfidenceBreakdown {
  score: number;
  level: ConfidenceLevelType;
  factors: ConfidenceFactors;
  metadata?: ConfidenceMetadata;
}

interface ConfidenceGaugeProps {
  score: number;
  size?: number;
  showLink?: boolean;
  verificationCount?: number;
  confidenceBreakdown?: ConfidenceBreakdown;
}

function getConfidenceLevel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'High Confidence', color: '#10b981' }; // green
  if (score >= 40) return { label: 'Medium Confidence', color: '#f59e0b' }; // amber/yellow
  return { label: 'Low Confidence', color: '#ef4444' }; // red
}

function getImprovementHint(score: number, verificationCount: number): string | null {
  if (score >= 70) return null;

  const verificationsNeeded = Math.max(0, 3 - verificationCount);

  if (verificationsNeeded > 0) {
    return `${verificationsNeeded} verification${verificationsNeeded !== 1 ? 's' : ''} needed for high confidence`;
  }

  if (score < 40) {
    return 'More verifications would improve confidence';
  }

  return 'A few more verifications needed';
}

export function ConfidenceGauge({
  score,
  size = 140,
  showLink = true,
  verificationCount = 0,
  confidenceBreakdown
}: ConfidenceGaugeProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  const { label, color } = getConfidenceLevel(score);
  const improvementHint = getImprovementHint(score, verificationCount);

  const handleClose = useCallback(() => {
    setModalOpen(false);
    // Restore focus to the element that opened the modal
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!modalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, handleClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (modalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [modalOpen]);

  const canShowBreakdown = showLink && confidenceBreakdown?.factors;

  return (
    <>
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90" role="img" aria-label={`Confidence score: ${score}%, ${label}`}>
            {/* Background track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              className="stroke-stone-200 dark:stroke-gray-700"
              strokeWidth={strokeWidth}
            />
            {/* Progress arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700 ease-out"
            />
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-3xl font-bold text-stone-800 dark:text-white">{score}%</span>
          </div>
        </div>

        {/* Confidence Level Label */}
        <p
          className="mt-2 text-sm font-semibold"
          style={{ color }}
        >
          {label}
        </p>

        {/* Improvement hint */}
        {improvementHint && (
          <p className="mt-1 text-xs text-stone-500 dark:text-gray-400 text-center max-w-[160px]">
            {improvementHint}
          </p>
        )}

        {canShowBreakdown ? (
          <button
            className="mt-2 text-xs text-[#137fec] hover:underline"
            onClick={(e) => {
              triggerRef.current = e.currentTarget;
              setModalOpen(true);
            }}
          >
            How is this calculated?
          </button>
        ) : showLink ? (
          <span className="mt-2 text-xs text-stone-400 dark:text-gray-500">
            How is this calculated?
          </span>
        ) : null}
      </div>

      {/* Score Breakdown Modal */}
      {modalOpen && confidenceBreakdown?.factors && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confidence-breakdown-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal Content */}
          <FocusTrap focusTrapOptions={{ allowOutsideClick: true, escapeDeactivates: false }}>
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-stone-200 dark:border-gray-700 w-full max-w-md max-h-[85vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-stone-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between rounded-t-xl">
                <h2 id="confidence-breakdown-title" className="text-lg font-semibold text-stone-800 dark:text-white">
                  Confidence Score Breakdown
                </h2>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-gray-700 text-stone-500 dark:text-gray-400 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4">
                <ConfidenceScoreBreakdown
                  score={confidenceBreakdown.score}
                  level={confidenceBreakdown.level}
                  factors={confidenceBreakdown.factors}
                  metadata={confidenceBreakdown.metadata}
                  showExpanded={true}
                />
              </div>
            </div>
          </FocusTrap>
        </div>
      )}
    </>
  );
}
