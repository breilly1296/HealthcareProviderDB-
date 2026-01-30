'use client';

import { useState, useMemo } from 'react';
import { CheckCircle, HelpCircle, Search, ChevronDown, ChevronUp, MessageSquarePlus, X, ThumbsUp, ThumbsDown } from 'lucide-react';
import { verificationApi } from '@/lib/api';

interface InsurancePlan {
  id: string;
  planId?: string;
  name: string;
  status: 'accepted' | 'unknown';
  confidence: number;
}

interface InsuranceListProps {
  plans?: InsurancePlan[];
  npi?: string;
  providerName?: string;
}

// Sample data for demo
const samplePlans: InsurancePlan[] = [
  { id: '1', name: 'Blue Cross Blue Shield PPO', status: 'accepted', confidence: 92 },
  { id: '2', name: 'Aetna HMO Plus', status: 'accepted', confidence: 88 },
  { id: '3', name: 'UnitedHealthcare Choice', status: 'unknown', confidence: 45 },
];

const INITIAL_DISPLAY_COUNT = 5;

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: InsurancePlan | null;
  npi: string;
  providerName: string;
}

function VerificationModal({ isOpen, onClose, plan, npi, providerName }: VerificationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !plan) return null;

  const handleVerify = async (acceptsInsurance: boolean) => {
    if (!plan.planId) {
      setError('Plan ID is missing');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await verificationApi.submit({
        npi,
        planId: plan.planId,
        acceptsInsurance,
      });
      setSubmitted(true);
    } catch (err) {
      setError('Failed to submit verification. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Thank You!</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Your verification helps improve data accuracy for everyone.
            </p>
            <button
              onClick={handleClose}
              className="px-6 py-2 bg-[#137fec] hover:bg-[#0d6edb] text-white font-medium rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              Verify Insurance Acceptance
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Does <strong className="text-slate-900 dark:text-white">{providerName}</strong> accept{' '}
              <strong className="text-slate-900 dark:text-white">{plan.name}</strong>?
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => handleVerify(true)}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 font-medium rounded-lg border border-green-200 dark:border-green-800 transition-colors disabled:opacity-50"
              >
                <ThumbsUp className="w-5 h-5" />
                {isSubmitting ? 'Submitting...' : 'Yes, they accept this plan'}
              </button>
              <button
                onClick={() => handleVerify(false)}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 font-medium rounded-lg border border-red-200 dark:border-red-800 transition-colors disabled:opacity-50"
              >
                <ThumbsDown className="w-5 h-5" />
                {isSubmitting ? 'Submitting...' : "No, they don't accept this plan"}
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-4">
              Your contribution helps others avoid surprise bills
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function PlanCard({ plan, onVerify }: { plan: InsurancePlan; onVerify: (plan: InsurancePlan) => void }) {
  const isAccepted = plan.status === 'accepted';

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {isAccepted ? (
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
        ) : (
          <HelpCircle className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
        )}
        <span className="font-medium text-slate-900 dark:text-white truncate">{plan.name}</span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <button
          onClick={() => onVerify(plan)}
          className="text-xs text-[#137fec] hover:text-[#0d6edb] font-medium transition-colors"
        >
          Verify
        </button>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            isAccepted
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
          }`}
        >
          {isAccepted ? 'Accepted' : 'Unknown'}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400 w-10 text-right">{plan.confidence}%</span>
      </div>
    </div>
  );
}

export function InsuranceList({ plans = samplePlans, npi, providerName = 'This provider' }: InsuranceListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [verifyingPlan, setVerifyingPlan] = useState<InsurancePlan | null>(null);

  const verifiedCount = plans.filter(p => p.status === 'accepted').length;

  const handleVerify = (plan: InsurancePlan) => {
    setVerifyingPlan(plan);
  };

  const handleCloseModal = () => {
    setVerifyingPlan(null);
  };

  const handleOpenGeneralVerify = () => {
    // Open modal with first plan or a general verification
    const firstPlan = plans[0];
    if (firstPlan) {
      setVerifyingPlan(firstPlan);
    }
  };

  // Filter plans based on search query
  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) return plans;
    const query = searchQuery.toLowerCase();
    return plans.filter(p => p.name.toLowerCase().includes(query));
  }, [plans, searchQuery]);

  // Determine which plans to display
  const hasSearch = searchQuery.trim().length > 0;
  const shouldCollapse = !hasSearch && !isExpanded && filteredPlans.length > INITIAL_DISPLAY_COUNT;
  const displayedPlans = shouldCollapse
    ? filteredPlans.slice(0, INITIAL_DISPLAY_COUNT)
    : filteredPlans;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Insurance Acceptance</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{verifiedCount} verified plans</p>
      </div>

      {/* Search Input */}
      {plans.length > INITIAL_DISPLAY_COUNT && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search your insurance plan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
          />
        </div>
      )}

      {/* Results count when filtering */}
      {hasSearch && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Showing {filteredPlans.length} of {plans.length} plans
        </p>
      )}

      {/* Plan list */}
      <div className="space-y-2">
        {displayedPlans.length > 0 ? (
          displayedPlans.map(plan => (
            <PlanCard key={plan.id} plan={plan} onVerify={handleVerify} />
          ))
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
            No plans match "{searchQuery}"
          </p>
        )}
      </div>

      {/* Show more/less button */}
      {!hasSearch && filteredPlans.length > INITIAL_DISPLAY_COUNT && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-3 w-full flex items-center justify-center gap-1 py-2 text-sm font-medium text-[#137fec] hover:text-[#0d6edb] transition-colors"
        >
          {isExpanded ? (
            <>
              Show less
              <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              Show all {filteredPlans.length} plans
              <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}

      {/* Verification CTA */}
      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={handleOpenGeneralVerify}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#137fec] hover:bg-[#0d6edb] text-white font-medium rounded-lg transition-colors"
        >
          <MessageSquarePlus className="w-5 h-5" />
          Verify Insurance Acceptance
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-3">
          Help others by confirming if this provider accepts your insurance
        </p>
      </div>

      {/* Verification Modal */}
      <VerificationModal
        isOpen={!!verifyingPlan}
        onClose={handleCloseModal}
        plan={verifyingPlan}
        npi={npi || ''}
        providerName={providerName}
      />
    </div>
  );
}
