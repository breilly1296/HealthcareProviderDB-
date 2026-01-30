'use client';

import { useState, useMemo } from 'react';
import { CheckCircle, HelpCircle, Search, ChevronDown, ChevronRight, MessageSquarePlus, X, ThumbsUp, ThumbsDown, Users } from 'lucide-react';
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
  lastVerifiedAt?: string | null;
  verificationCount?: number;
  mainConfidenceScore?: number;
}

// Sample data for demo
const samplePlans: InsurancePlan[] = [
  { id: '1', name: 'Blue Cross Blue Shield PPO', status: 'accepted', confidence: 92 },
  { id: '2', name: 'Aetna HMO Plus', status: 'accepted', confidence: 88 },
  { id: '3', name: 'UnitedHealthcare Choice', status: 'unknown', confidence: 45 },
];

// Known carrier families for grouping
const CARRIER_PATTERNS: { pattern: RegExp; family: string; displayName: string }[] = [
  { pattern: /^aetna/i, family: 'aetna', displayName: 'Aetna' },
  { pattern: /^emblem\s*health/i, family: 'emblemhealth', displayName: 'EmblemHealth' },
  { pattern: /^empire\s*(blue\s*cross|bcbs)/i, family: 'empire', displayName: 'Empire Blue Cross Blue Shield' },
  { pattern: /^(blue\s*cross|bcbs)/i, family: 'bluecross', displayName: 'Blue Cross Blue Shield' },
  { pattern: /^health\s*first/i, family: 'healthfirst', displayName: 'Healthfirst' },
  { pattern: /^united\s*health/i, family: 'united', displayName: 'UnitedHealthcare' },
  { pattern: /^cigna/i, family: 'cigna', displayName: 'Cigna' },
  { pattern: /^humana/i, family: 'humana', displayName: 'Humana' },
  { pattern: /^kaiser/i, family: 'kaiser', displayName: 'Kaiser Permanente' },
  { pattern: /^anthem/i, family: 'anthem', displayName: 'Anthem' },
  { pattern: /^fidelis/i, family: 'fidelis', displayName: 'Fidelis Care' },
  { pattern: /^medicare/i, family: 'medicare', displayName: 'Medicare' },
  { pattern: /^medicaid/i, family: 'medicaid', displayName: 'Medicaid' },
  { pattern: /^oscar/i, family: 'oscar', displayName: 'Oscar Health' },
  { pattern: /^molina/i, family: 'molina', displayName: 'Molina Healthcare' },
  { pattern: /^horizon/i, family: 'horizon', displayName: 'Horizon' },
  { pattern: /^oxford/i, family: 'oxford', displayName: 'Oxford' },
  { pattern: /^amerihealth/i, family: 'amerihealth', displayName: 'AmeriHealth' },
  { pattern: /^tricare/i, family: 'tricare', displayName: 'TRICARE' },
];

function getCarrierFamily(planName: string): { family: string; displayName: string } {
  for (const { pattern, family, displayName } of CARRIER_PATTERNS) {
    if (pattern.test(planName)) {
      return { family, displayName };
    }
  }
  // Default: use the first word as the family
  const firstWord = planName.split(/[\s-]/)[0] || planName;
  return { family: firstWord.toLowerCase(), displayName: firstWord };
}

interface CarrierGroup {
  family: string;
  displayName: string;
  plans: InsurancePlan[];
}

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
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
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

interface PlanRowProps {
  plan: InsurancePlan;
  onVerify: (plan: InsurancePlan) => void;
  showConfidence: boolean;
  isLast: boolean;
  indented?: boolean;
}

function PlanRow({ plan, onVerify, showConfidence, isLast, indented = false }: PlanRowProps) {
  const isAccepted = plan.status === 'accepted';

  return (
    <div className={`flex items-center justify-between py-2.5 ${!isLast ? 'border-b border-slate-100 dark:border-slate-700/50' : ''} ${indented ? 'pl-7' : ''}`}>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {isAccepted ? (
          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
        ) : (
          <HelpCircle className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
        )}
        <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{plan.name}</span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <button
          onClick={() => onVerify(plan)}
          className="px-2.5 py-0.5 text-xs font-medium text-[#137fec] border border-[#137fec] rounded hover:bg-[#137fec] hover:text-white transition-colors"
        >
          Verify
        </button>
        {showConfidence && (
          <span className="text-xs text-slate-500 dark:text-slate-400 w-8 text-right">{plan.confidence}%</span>
        )}
      </div>
    </div>
  );
}

interface CarrierGroupSectionProps {
  group: CarrierGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onVerify: (plan: InsurancePlan) => void;
  showConfidence: boolean;
  forceExpand?: boolean;
}

function CarrierGroupSection({ group, isExpanded, onToggle, onVerify, showConfidence, forceExpand }: CarrierGroupSectionProps) {
  const shouldExpand = forceExpand || isExpanded;
  const acceptedCount = group.plans.filter(p => p.status === 'accepted').length;

  return (
    <div className="border-b border-slate-200 dark:border-slate-700 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors -mx-2 px-2 rounded"
      >
        <div className="flex items-center gap-2">
          {shouldExpand ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <span className="font-medium text-slate-900 dark:text-white">{group.displayName}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            ({group.plans.length} {group.plans.length === 1 ? 'plan' : 'plans'})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {acceptedCount > 0 && (
            <span className="text-xs text-green-600 dark:text-green-400">
              {acceptedCount} accepted
            </span>
          )}
        </div>
      </button>

      {shouldExpand && (
        <div className="pb-2">
          {group.plans.map((plan, idx) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              onVerify={onVerify}
              showConfidence={showConfidence}
              isLast={idx === group.plans.length - 1}
              indented
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatLastVerified(dateString: string | null | undefined): string {
  if (!dateString) return 'No verifications yet';

  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Last verified: Today';
  if (diffDays === 1) return 'Last verified: Yesterday';
  if (diffDays < 7) return `Last verified: ${diffDays} days ago`;
  if (diffDays < 30) return `Last verified: ${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  if (diffDays < 365) return `Last verified: ${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;

  return `Last verified: ${date.toLocaleDateString()}`;
}

export function InsuranceList({
  plans = samplePlans,
  npi,
  providerName = 'This provider',
  lastVerifiedAt,
  verificationCount = 0,
  mainConfidenceScore
}: InsuranceListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [verifyingPlan, setVerifyingPlan] = useState<InsurancePlan | null>(null);

  const verifiedCount = plans.filter(p => p.status === 'accepted').length;

  const handleVerify = (plan: InsurancePlan) => {
    setVerifyingPlan(plan);
  };

  const handleCloseModal = () => {
    setVerifyingPlan(null);
  };

  const handleOpenGeneralVerify = () => {
    setVerifyingPlan(plans[0] ?? null);
  };

  const toggleGroup = (family: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(family)) {
        next.delete(family);
      } else {
        next.add(family);
      }
      return next;
    });
  };

  // Filter plans based on search query
  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) return plans;
    const query = searchQuery.toLowerCase();
    return plans.filter(p => p.name.toLowerCase().includes(query));
  }, [plans, searchQuery]);

  // Group plans by carrier family
  const { groups, singlePlans } = useMemo(() => {
    const familyMap = new Map<string, CarrierGroup>();

    for (const plan of filteredPlans) {
      const { family, displayName } = getCarrierFamily(plan.name);
      const existing = familyMap.get(family);
      if (existing) {
        existing.plans.push(plan);
      } else {
        familyMap.set(family, { family, displayName, plans: [plan] });
      }
    }

    // Separate into groups (2+ plans) and singles
    const groups: CarrierGroup[] = [];
    const singlePlans: InsurancePlan[] = [];

    for (const group of familyMap.values()) {
      if (group.plans.length >= 2) {
        // Sort plans within group alphabetically
        group.plans.sort((a, b) => a.name.localeCompare(b.name));
        groups.push(group);
      } else {
        singlePlans.push(...group.plans);
      }
    }

    // Sort groups by display name
    groups.sort((a, b) => a.displayName.localeCompare(b.displayName));
    // Sort single plans alphabetically
    singlePlans.sort((a, b) => a.name.localeCompare(b.name));

    return { groups, singlePlans };
  }, [filteredPlans]);

  // Determine if we should show individual confidence scores
  const showIndividualConfidence = useMemo(() => {
    if (mainConfidenceScore === undefined) return true;
    return plans.some(p => p.confidence !== mainConfidenceScore);
  }, [plans, mainConfidenceScore]);

  const hasSearch = searchQuery.trim().length > 0;
  const totalGroupedPlans = groups.reduce((sum, g) => sum + g.plans.length, 0) + singlePlans.length;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Insurance Acceptance</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{verifiedCount} accepted plans</p>
      </div>

      {/* Search Input */}
      {plans.length > 5 && (
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
          Showing {totalGroupedPlans} of {plans.length} plans
        </p>
      )}

      {/* Grouped Plan List */}
      <div>
        {totalGroupedPlans > 0 ? (
          <>
            {/* Carrier Groups */}
            {groups.map(group => (
              <CarrierGroupSection
                key={group.family}
                group={group}
                isExpanded={expandedGroups.has(group.family)}
                onToggle={() => toggleGroup(group.family)}
                onVerify={handleVerify}
                showConfidence={showIndividualConfidence}
                forceExpand={hasSearch}
              />
            ))}

            {/* Single Plans (Other Plans) */}
            {singlePlans.length > 0 && (
              <div className={groups.length > 0 ? 'mt-4 pt-4 border-t border-slate-200 dark:border-slate-700' : ''}>
                {groups.length > 0 && (
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Other Plans</p>
                )}
                {singlePlans.map((plan, idx) => (
                  <PlanRow
                    key={plan.id}
                    plan={plan}
                    onVerify={handleVerify}
                    showConfidence={showIndividualConfidence}
                    isLast={idx === singlePlans.length - 1}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
            No plans match "{searchQuery}"
          </p>
        )}
      </div>

      {/* Verification CTA */}
      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
        <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-3">
          {formatLastVerified(lastVerifiedAt)}
        </p>

        <button
          onClick={handleOpenGeneralVerify}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-white font-medium rounded-lg shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02]"
        >
          <MessageSquarePlus className="w-5 h-5" />
          Verify Insurance Acceptance
        </button>

        {verificationCount > 0 && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 text-center mt-3">
            <Users className="w-3.5 h-3.5" />
            Join {verificationCount} {verificationCount === 1 ? 'person' : 'people'} who verified this provider
          </p>
        )}

        {verificationCount === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-3">
            Be the first to verify this provider's insurance acceptance
          </p>
        )}
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
