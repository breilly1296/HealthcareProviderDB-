'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CreditCard,
  Info,
  Search,
  RefreshCw,
  Trash2,
  Eye,
  EyeOff,
  Check,
  ExternalLink,
  FileText,
  User,
  CircleDollarSign,
  Calculator,
  FlaskConical,
} from 'lucide-react';
import FocusTrap from 'focus-trap-react';
import { useAuth } from '@/context/AuthContext';
import { useInsuranceCard } from '@/hooks/useInsuranceCard';
import InsuranceCardScanner from '@/components/InsuranceCardScanner';
import type { InsuranceCardResponse } from '@/lib/api';
import { Shimmer } from '@/components/ui/Shimmer';

// ============================================================================
// Helpers
// ============================================================================

function maskValue(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '\u2022\u2022\u2022\u2022';
  return '\u2022\u2022\u2022\u2022' + value.slice(-4);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================================
// Data Field
// ============================================================================

function DataField({
  label,
  value,
  masked,
  showRaw,
}: {
  label: string;
  value: string | null | undefined;
  masked?: boolean;
  showRaw?: boolean;
}) {
  if (!value) return null;

  const display = masked && !showRaw ? maskValue(value) : value;

  return (
    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-gray-600 dark:text-gray-400 text-sm">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white text-sm text-right max-w-[60%] font-mono">
        {display}
      </span>
    </div>
  );
}

// ============================================================================
// Section with Sensitive Toggle
// ============================================================================

function CardSection({
  icon: Icon,
  title,
  hasSensitive,
  children,
}: {
  icon: React.ElementType;
  title: string;
  hasSensitive?: boolean;
  children: (showRaw: boolean) => React.ReactNode;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
          {title}
        </h4>
        {hasSensitive && (
          <button
            onClick={() => setShowRaw((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            aria-label={showRaw ? 'Hide sensitive fields' : 'Show sensitive fields'}
          >
            {showRaw ? (
              <><EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> Hide</>
            ) : (
              <><Eye className="w-3.5 h-3.5" aria-hidden="true" /> Show</>
            )}
          </button>
        )}
      </div>
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
        {children(showRaw)}
      </div>
    </div>
  );
}

// ============================================================================
// Delete Confirmation Modal
// ============================================================================

function DeleteModal({
  onConfirm,
  onCancel,
  isDeleting,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [onCancel, isDeleting]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !isDeleting) onCancel();
    },
    [onCancel, isDeleting],
  );

  return (
    <FocusTrap
      focusTrapOptions={{
        initialFocus: () => cancelRef.current!,
        allowOutsideClick: true,
        escapeDeactivates: false,
      }}
    >
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
      >
        <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 animate-modal-enter">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
            </div>
            <h2
              id="delete-modal-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Remove Insurance Card?
            </h2>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
            This will permanently remove your saved insurance card data. You can always scan a new card later.
          </p>

          <div className="flex gap-3 justify-end">
            <button
              ref={cancelRef}
              onClick={onCancel}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isDeleting ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}

// ============================================================================
// Matched Plan Banner
// ============================================================================

function MatchedPlanBanner({ plan }: { plan: NonNullable<InsuranceCardResponse['matchedPlan']> }) {
  return (
    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Check className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold text-green-800 dark:text-green-200">
              Matched to Plan
            </p>
            <p className="text-sm text-green-700 dark:text-green-300 mt-0.5">
              {plan.planName || plan.planId}
              {plan.planType && <span className="text-green-600 dark:text-green-400"> &middot; {plan.planType}</span>}
              {plan.state && <span className="text-green-600 dark:text-green-400"> &middot; {plan.state}</span>}
            </p>
          </div>
        </div>
        <Link
          href={`/plans/${encodeURIComponent(plan.planId)}`}
          className="flex items-center gap-1 text-sm font-medium text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 whitespace-nowrap"
        >
          View plan
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// Card Data Display
// ============================================================================

function CardDataDisplay({ card }: { card: InsuranceCardResponse }) {
  const hasCopays = !!(card.copayPcp || card.copaySpecialist || card.copayUrgent || card.copayEr);
  const hasDeductibles = !!(card.deductibleIndiv || card.deductibleFamily || card.oopMaxIndiv || card.oopMaxFamily);
  const hasRx = !!(card.rxbin || card.rxpcn || card.rxgrp);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      {/* Plan Information */}
      <CardSection icon={FileText} title="Plan Information">
        {() => (
          <>
            <DataField label="Insurance Company" value={card.insuranceCompany} />
            <DataField label="Plan Name" value={card.planName} />
            <DataField label="Plan Type" value={card.planType} />
            <DataField label="Provider Network" value={card.providerNetwork} />
            {card.networkNotes && <DataField label="Network Notes" value={card.networkNotes} />}
          </>
        )}
      </CardSection>

      {/* Subscriber Information */}
      <CardSection icon={User} title="Subscriber Information" hasSensitive>
        {(showRaw) => (
          <>
            <DataField label="Subscriber Name" value={card.subscriberName} />
            <DataField label="Member ID" value={card.subscriberId} masked showRaw={showRaw} />
            <DataField label="Group Number" value={card.groupNumber} masked showRaw={showRaw} />
            <DataField label="Effective Date" value={card.effectiveDate} />
          </>
        )}
      </CardSection>

      {/* Copays */}
      {hasCopays && (
        <CardSection icon={CircleDollarSign} title="Copays">
          {() => (
            <>
              <DataField label="Primary Care" value={card.copayPcp} />
              <DataField label="Specialist" value={card.copaySpecialist} />
              <DataField label="Urgent Care" value={card.copayUrgent} />
              <DataField label="Emergency Room" value={card.copayEr} />
            </>
          )}
        </CardSection>
      )}

      {/* Deductibles & OOP Max */}
      {hasDeductibles && (
        <CardSection icon={Calculator} title="Deductibles & Out-of-Pocket Max">
          {() => (
            <>
              <DataField label="Individual Deductible" value={card.deductibleIndiv} />
              <DataField label="Family Deductible" value={card.deductibleFamily} />
              <DataField label="Individual OOP Max" value={card.oopMaxIndiv} />
              <DataField label="Family OOP Max" value={card.oopMaxFamily} />
            </>
          )}
        </CardSection>
      )}

      {/* Pharmacy / Rx */}
      {hasRx && (
        <CardSection icon={FlaskConical} title="Pharmacy Information" hasSensitive>
          {(showRaw) => (
            <>
              <DataField label="RxBIN" value={card.rxbin} masked showRaw={showRaw} />
              <DataField label="RxPCN" value={card.rxpcn} masked showRaw={showRaw} />
              <DataField label="RxGRP" value={card.rxgrp} masked showRaw={showRaw} />
            </>
          )}
        </CardSection>
      )}
    </div>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function InsuranceCardSkeleton() {
  return (
    <div role="status" aria-label="Loading insurance card">
      <span className="sr-only">Loading insurance card...</span>
      <div className="space-y-4" aria-hidden="true">
        <div className="flex gap-3">
          <Shimmer className="h-10 w-48 rounded-lg" />
          <Shimmer className="h-10 w-32 rounded-lg" />
          <Shimmer className="h-10 w-24 rounded-lg" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Shimmer className="h-5 w-40 rounded" />
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                <Shimmer className="h-4 w-full rounded" />
                <Shimmer className="h-4 w-3/4 rounded" />
                <Shimmer className="h-4 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function InsuranceCardDashboard() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    card,
    hasCard,
    isLoading,
    error,
    deleteCard,
    isDeleting,
  } = useInsuranceCard();

  const [showScanner, setShowScanner] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login?redirect=/dashboard/insurance');
    }
  }, [authLoading, isAuthenticated, router]);

  const handleFindProviders = useCallback(() => {
    if (!card) return;
    const params = new URLSearchParams();

    if (card.matchedPlan) {
      params.set('insurancePlanId', card.matchedPlan.planId);
    } else {
      if (card.insuranceCompany) params.set('issuerName', card.insuranceCompany);
      if (card.planName) params.set('planName', card.planName);
      if (card.planType) params.set('planType', card.planType);
    }

    router.push(`/search?${params.toString()}`);
  }, [card, router]);

  const handleDelete = useCallback(() => {
    deleteCard(undefined, {
      onSuccess: () => setShowDeleteModal(false),
    });
  }, [deleteCard]);

  const handleScanComplete = useCallback(() => {
    setShowScanner(false);
  }, []);

  // Auth loading
  if (authLoading || (!authLoading && !isAuthenticated)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 md:py-12">
        <div className="container-wide">
          <InsuranceCardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 md:py-12">
      <div className="container-wide">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <li>
              <Link href="/" className="hover:text-primary-600 dark:hover:text-primary-400">Home</Link>
            </li>
            <li>/</li>
            <li>
              <Link href="/saved-providers" className="hover:text-primary-600 dark:hover:text-primary-400">Dashboard</Link>
            </li>
            <li>/</li>
            <li className="text-gray-900 dark:text-white font-medium">My Insurance</li>
          </ol>
        </nav>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary-600 dark:text-primary-400" aria-hidden="true" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
            My Insurance Card
          </h1>
        </div>

        {/* Privacy Notice */}
        <div className="max-w-2xl mb-8">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200">Your data is encrypted</p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Sensitive fields (member ID, group number, Rx info) are encrypted at rest. Card images are never stored.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Loading */}
        {isLoading && <InsuranceCardSkeleton />}

        {/* Error */}
        {error && !isLoading && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            Something went wrong loading your insurance card. Please try again later.
          </div>
        )}

        {/* No card — show scanner */}
        {!isLoading && !error && !hasCard && !showScanner && (
          <div className="max-w-2xl">
            <InsuranceCardScanner onScanComplete={handleScanComplete} />
          </div>
        )}

        {/* Re-scanning */}
        {showScanner && (
          <div className="max-w-2xl">
            <InsuranceCardScanner
              onScanComplete={handleScanComplete}
              onCancel={() => setShowScanner(false)}
            />
          </div>
        )}

        {/* Card saved */}
        {!isLoading && !error && hasCard && card && !showScanner && (
          <div className="max-w-2xl space-y-6">
            {/* Quick Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleFindProviders}
                className="btn-primary flex items-center gap-2"
              >
                <Search className="w-4 h-4" aria-hidden="true" />
                Find In-Network Providers
              </button>
              <button
                onClick={() => setShowScanner(true)}
                className="px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Re-scan Card
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 rounded-lg font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Remove
              </button>
            </div>

            {/* Matched Plan Banner */}
            {card.matchedPlan && (
              <MatchedPlanBanner plan={card.matchedPlan} />
            )}

            {/* Card Data */}
            <CardDataDisplay card={card} />

            {/* Footer Metadata */}
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
              <span>Scanned {formatDate(card.scannedAt)}</span>
              {card.confidenceScore != null && (
                <span>Confidence: {Math.round(card.confidenceScore * 100)}%</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <DeleteModal
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
