'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, Clock, HelpCircle, Search, ChevronDown, ChevronRight, MessageSquarePlus, X, ThumbsUp, ThumbsDown, Users, Loader2, MessageSquare, MapPin } from 'lucide-react';
import FocusTrap from 'focus-trap-react';
import { verificationApi } from '@/lib/api';
import { useCaptcha } from '@/hooks/useCaptcha';
import toast from 'react-hot-toast';

type PlanStatus = 'accepted' | 'not_accepted' | 'pending' | 'unknown';

interface InsurancePlan {
  id: string;
  planId?: string;
  name: string;
  status: PlanStatus;
  confidence: number;
  locationId?: number;
  location?: {
    id: number;
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  } | null;
  lastVerifiedAt?: string | null;
}

interface ProviderLocation {
  id: number;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

interface InsuranceListProps {
  plans?: InsurancePlan[];
  npi?: string;
  providerName?: string;
  lastVerifiedAt?: string | null;
  verificationCount?: number;
  mainConfidenceScore?: number;
  locations?: ProviderLocation[];
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

// ============================================================================
// Data Freshness Badge
// ============================================================================

function DataFreshnessBadge({ dateString }: { dateString: string | null | undefined }) {
  if (!dateString) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-stone-400 dark:text-gray-500 bg-stone-100 dark:bg-gray-700/50 rounded" title="Never verified">
        <span className="w-1.5 h-1.5 rounded-full bg-stone-300 dark:bg-gray-600" />
      </span>
    );
  }

  const date = new Date(dateString);
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));

  let color: string;
  let dotColor: string;

  if (diffDays < 30) {
    color = 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
    dotColor = 'bg-green-500';
  } else if (diffDays < 90) {
    color = 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20';
    dotColor = 'bg-yellow-500';
  } else {
    color = 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
    dotColor = 'bg-red-500';
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium ${color} rounded`}
      title={`Last verified: ${date.toLocaleDateString()}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
    </span>
  );
}

// ============================================================================
// Status Icon
// ============================================================================

function StatusIcon({ status }: { status: PlanStatus }) {
  const labelMap: Record<PlanStatus, string> = {
    accepted: 'Accepted',
    not_accepted: 'Not accepted',
    pending: 'Pending verification',
    unknown: 'Unknown status',
  };
  const label = labelMap[status] || 'Unknown status';

  switch (status) {
    case 'accepted':
      return <><CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" aria-hidden="true" /><span className="sr-only">{label}</span></>;
    case 'not_accepted':
      return <><XCircle className="w-4 h-4 text-red-500 flex-shrink-0" aria-hidden="true" /><span className="sr-only">{label}</span></>;
    case 'pending':
      return <><Clock className="w-4 h-4 text-yellow-500 flex-shrink-0" aria-hidden="true" /><span className="sr-only">{label}</span></>;
    default:
      return <><HelpCircle className="w-4 h-4 text-stone-400 dark:text-gray-500 flex-shrink-0" aria-hidden="true" /><span className="sr-only">{label}</span></>;
  }
}

// ============================================================================
// Verification Modal
// ============================================================================

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: InsurancePlan | null;
  npi: string;
  providerName: string;
  onVerified?: (planId: string) => void;
}

type VerificationDate = 'today' | 'this_week' | 'this_month' | 'a_while_ago' | null;

const DATE_OPTIONS: { value: VerificationDate; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'a_while_ago', label: 'A while ago' },
];

function VerificationModal({ isOpen, onClose, plan, npi, providerName, onVerified }: VerificationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState<'yes' | 'no' | null>(null);
  const [verificationDate, setVerificationDate] = useState<VerificationDate>(null);
  const [showNoteField, setShowNoteField] = useState(false);
  const [note, setNote] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const { getToken } = useCaptcha();
  const triggerRef = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    setIsSubmitting(null);
    setVerificationDate(null);
    setShowNoteField(false);
    setNote('');
    setHoneypot('');
    onClose();
    // Restore focus to trigger element
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    // Capture the element that triggered the modal
    triggerRef.current = document.activeElement as HTMLElement;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen || !plan) return null;

  const handleVerify = async (acceptsInsurance: boolean) => {
    if (!plan.planId) {
      toast.error('Plan ID is missing. Please try again.');
      return;
    }

    setIsSubmitting(acceptsInsurance ? 'yes' : 'no');

    try {
      // Build notes with date context if provided
      let fullNote = note.trim();
      if (verificationDate) {
        const dateLabel = DATE_OPTIONS.find(d => d.value === verificationDate)?.label || '';
        const dateContext = `Verified: ${dateLabel}`;
        fullNote = fullNote ? `${dateContext}. ${fullNote}` : dateContext;
      }

      const captchaToken = await getToken('submit_verification');

      await verificationApi.submit({
        npi,
        planId: plan.planId,
        locationId: plan.locationId,
        acceptsInsurance,
        notes: fullNote || undefined,
        website: honeypot || undefined,
        captchaToken,
      });

      // Close modal immediately and show success toast
      resetAndClose();
      toast.success("Thanks! Your verification helps others find the right care.");

      // Notify parent of successful verification
      if (onVerified) {
        onVerified(plan.id);
      }
    } catch (err) {
      toast.error('Failed to submit verification. Please try again.');
    } finally {
      setIsSubmitting(null);
    }
  };

  const resetAndClose = handleClose;

  const handleSkip = () => {
    handleClose();
  };

  const isLoading = isSubmitting !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-modal-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={resetAndClose} aria-hidden="true" />
      <FocusTrap focusTrapOptions={{ allowOutsideClick: true, escapeDeactivates: false }}>
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <button
          onClick={resetAndClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 dark:hover:text-gray-300"
          aria-label="Close"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <h3 id="verify-modal-title" className="text-lg font-bold text-stone-800 dark:text-white mb-1">
          Verify Insurance Acceptance
        </h3>
        <p className="text-sm text-stone-500 dark:text-gray-400 mb-5">
          Does <strong className="text-stone-800 dark:text-white">{providerName}</strong> accept{' '}
          <strong className="text-stone-800 dark:text-white">{plan.name}</strong>?
        </p>

        {/* Yes/No Buttons */}
        <div className="space-y-2.5">
          <button
            onClick={() => handleVerify(true)}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting === 'yes' ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : (
              <ThumbsUp className="w-5 h-5" aria-hidden="true" />
            )}
            {isSubmitting === 'yes' ? 'Submitting...' : 'Yes, they accept this plan'}
          </button>
          <button
            onClick={() => handleVerify(false)}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting === 'no' ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : (
              <ThumbsDown className="w-5 h-5" aria-hidden="true" />
            )}
            {isSubmitting === 'no' ? 'Submitting...' : "No, they don't accept this plan"}
          </button>
        </div>

        {/* Date Selector */}
        <div className="mt-4">
          <p className="text-xs text-stone-500 dark:text-gray-400 mb-2">When did you verify this? (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {DATE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setVerificationDate(verificationDate === value ? null : value)}
                disabled={isLoading}
                className={`px-3 py-1 text-xs rounded-full border transition-all disabled:opacity-50 ${
                  verificationDate === value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-transparent text-stone-500 dark:text-gray-400 border-stone-300 dark:border-gray-600 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Optional Note Field */}
        <div className="mt-4">
          {!showNoteField ? (
            <button
              onClick={() => setShowNoteField(true)}
              disabled={isLoading}
              className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-gray-400 hover:text-[#137fec] transition-colors disabled:opacity-50"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Add a note (optional)
            </button>
          ) : (
            <div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                placeholder="Optional: When did you verify? Any details?"
                disabled={isLoading}
                className="w-full px-3 py-2 text-sm bg-stone-50 dark:bg-gray-700/50 border border-stone-200 dark:border-gray-600 rounded-lg text-stone-800 dark:text-white placeholder-stone-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent resize-none disabled:opacity-50"
                rows={2}
              />
              <p className="text-xs text-stone-400 dark:text-gray-500 text-right mt-1">
                {note.length}/200
              </p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-stone-100 dark:border-gray-700 mt-4 pt-4">
          {/* I'm not sure button */}
          <button
            onClick={handleSkip}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-sm text-stone-500 dark:text-gray-400 hover:text-stone-700 dark:hover:text-gray-300 border border-stone-200 dark:border-gray-600 rounded-lg hover:bg-stone-50 dark:hover:bg-gray-700/30 transition-colors disabled:opacity-50"
          >
            I'm not sure
          </button>
        </div>

        <p className="text-xs text-stone-500 dark:text-gray-400 text-center mt-4">
          Your contribution helps others avoid surprise bills
        </p>

        {/* Honeypot field — hidden from real users, filled by bots */}
        <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
          <label htmlFor="website">Website</label>
          <input
            type="text"
            id="website"
            name="website"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            autoComplete="off"
            tabIndex={-1}
          />
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}

// ============================================================================
// Plan Row
// ============================================================================

interface PlanRowProps {
  plan: InsurancePlan;
  onVerify: (plan: InsurancePlan) => void;
  showConfidence: boolean;
  isLast: boolean;
  indented?: boolean;
  showAcceptedBadge?: boolean;
  recentlyVerified?: boolean;
}

function PlanRow({ plan, onVerify, showConfidence, isLast, indented = false, showAcceptedBadge = false, recentlyVerified = false }: PlanRowProps) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${!isLast ? 'border-b border-stone-100 dark:border-gray-700/50' : ''} ${indented ? 'pl-7' : ''}`}>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <StatusIcon status={plan.status} />
        <span className="text-sm text-stone-700 dark:text-gray-200 truncate">{plan.name}</span>
        {/* Location badge for location-specific plans */}
        {plan.locationId && plan.location && (
          <span
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-stone-400 dark:text-gray-500 bg-stone-50 dark:bg-gray-700/50 rounded"
            title={`${plan.location.city}, ${plan.location.state}`}
          >
            <MapPin className="w-2.5 h-2.5" />
            {plan.location.city}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <DataFreshnessBadge dateString={plan.lastVerifiedAt} />
        {recentlyVerified ? (
          <span className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
            <CheckCircle className="w-3 h-3" />
            Verified
          </span>
        ) : (
          <button
            onClick={() => onVerify(plan)}
            className="px-2.5 py-0.5 text-xs font-medium text-[#137fec] border border-[#137fec] rounded hover:bg-[#137fec] hover:text-white transition-colors"
          >
            Verify
          </button>
        )}
        {showAcceptedBadge && plan.status === 'accepted' && (
          <span className="px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded">
            Accepted
          </span>
        )}
        {plan.status === 'not_accepted' && (
          <span className="px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded">
            Not Accepted
          </span>
        )}
        {plan.status === 'pending' && (
          <span className="px-2 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded">
            Pending
          </span>
        )}
        {showConfidence && (
          <span className="text-xs text-stone-500 dark:text-gray-400 w-8 text-right">{plan.confidence}%</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Carrier Group Section
// ============================================================================

interface CarrierGroupSectionProps {
  group: CarrierGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onVerify: (plan: InsurancePlan) => void;
  showConfidence: boolean;
  forceExpand?: boolean;
  recentlyVerifiedPlans: Set<string>;
}

function CarrierGroupSection({ group, isExpanded, onToggle, onVerify, showConfidence, forceExpand, recentlyVerifiedPlans }: CarrierGroupSectionProps) {
  const shouldExpand = forceExpand || isExpanded;
  const acceptedCount = group.plans.filter(p => p.status === 'accepted').length;
  const notAcceptedCount = group.plans.filter(p => p.status === 'not_accepted').length;

  return (
    <div className="border-b border-stone-200 dark:border-gray-700 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 hover:bg-stone-50 dark:hover:bg-gray-700/30 transition-colors -mx-2 px-2 rounded"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {shouldExpand ? (
            <ChevronDown className="w-4 h-4 text-stone-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />
          )}
          <span className="font-medium text-stone-800 dark:text-white truncate">{group.displayName}</span>
          <span className="text-sm text-stone-500 dark:text-gray-400 flex-shrink-0">
            ({group.plans.length})
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {acceptedCount > 0 && (
            <span className="text-xs text-green-600 dark:text-green-400">
              {acceptedCount} accepted
            </span>
          )}
          {notAcceptedCount > 0 && (
            <span className="text-xs text-red-600 dark:text-red-400">
              {notAcceptedCount} not accepted
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
              recentlyVerified={recentlyVerifiedPlans.has(plan.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

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

function formatLocationLabel(loc: ProviderLocation): string {
  const parts = [loc.city, loc.state].filter(Boolean);
  if (loc.address_line1) {
    return `${loc.address_line1}${parts.length > 0 ? `, ${parts.join(', ')}` : ''}`;
  }
  return parts.join(', ') || `Location #${loc.id}`;
}

// ============================================================================
// Main Component
// ============================================================================

export function InsuranceList({
  plans = samplePlans,
  npi,
  providerName = 'This provider',
  lastVerifiedAt,
  verificationCount = 0,
  mainConfidenceScore,
  locations = [],
}: InsuranceListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [verifyingPlan, setVerifyingPlan] = useState<InsurancePlan | null>(null);
  const [otherPlansExpanded, setOtherPlansExpanded] = useState(false);
  const [recentlyVerifiedPlans, setRecentlyVerifiedPlans] = useState<Set<string>>(new Set());
  const [selectedLocationId, setSelectedLocationId] = useState<number | 'all'>('all');

  const acceptedCount = plans.filter(p => p.status === 'accepted').length;
  const notAcceptedCount = plans.filter(p => p.status === 'not_accepted').length;
  const pendingCount = plans.filter(p => p.status === 'pending').length;

  // Check if we have location-specific plan data
  const hasLocationSpecificPlans = useMemo(() => {
    return plans.some(p => p.locationId != null);
  }, [plans]);

  // Unique locations that have plan acceptance data
  const locationsWithPlans = useMemo(() => {
    if (!hasLocationSpecificPlans) return [];
    const locIds = new Set(plans.filter(p => p.locationId != null).map(p => p.locationId!));
    return locations.filter(l => locIds.has(l.id));
  }, [plans, locations, hasLocationSpecificPlans]);

  const showLocationFilter = locationsWithPlans.length >= 2;

  const handleVerify = (plan: InsurancePlan) => {
    setVerifyingPlan(plan);
  };

  const handleCloseModal = () => {
    setVerifyingPlan(null);
  };

  const handleVerificationSuccess = (planId: string) => {
    setRecentlyVerifiedPlans(prev => new Set(prev).add(planId));
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

  // Filter plans based on search query and location
  const filteredPlans = useMemo(() => {
    let filtered = plans;

    // Location filter
    if (selectedLocationId !== 'all') {
      filtered = filtered.filter(p =>
        p.locationId === selectedLocationId || p.locationId == null
      );
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(query));
    }

    return filtered;
  }, [plans, searchQuery, selectedLocationId]);

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

  // Status summary line
  const statusParts: string[] = [];
  if (acceptedCount > 0) statusParts.push(`${acceptedCount} accepted`);
  if (notAcceptedCount > 0) statusParts.push(`${notAcceptedCount} not accepted`);
  if (pendingCount > 0) statusParts.push(`${pendingCount} pending`);
  const statusSummary = statusParts.join(', ') || `${plans.length} plans`;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-stone-200 dark:border-gray-700 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-stone-800 dark:text-white">Insurance Acceptance</h2>
        <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">{statusSummary}</p>
      </div>

      {/* Location Filter */}
      {showLocationFilter && (
        <div className="mb-4">
          <label className="text-xs text-stone-500 dark:text-gray-400 mb-1.5 block">Filter by office location</label>
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="w-full px-3 py-2 bg-stone-50 dark:bg-gray-700/50 border border-stone-200 dark:border-gray-600 rounded-lg text-sm text-stone-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
          >
            <option value="all">All Locations</option>
            {locationsWithPlans.map(loc => (
              <option key={loc.id} value={loc.id}>
                {formatLocationLabel(loc)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Search Input */}
      {plans.length > 5 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 dark:text-gray-500" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search your insurance plan..."
            aria-label="Search insurance plans"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-stone-50 dark:bg-gray-700/50 border border-stone-200 dark:border-gray-600 rounded-lg text-sm text-stone-800 dark:text-white placeholder-stone-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
          />
        </div>
      )}

      {/* Results count when filtering */}
      {hasSearch && (
        <p className="text-xs text-stone-500 dark:text-gray-400 mb-3">
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
                recentlyVerifiedPlans={recentlyVerifiedPlans}
              />
            ))}

            {/* Single Plans (Other Plans) */}
            {singlePlans.length > 0 && (
              <div className={groups.length > 0 ? 'mt-4 pt-4 border-t border-stone-200 dark:border-gray-700' : ''}>
                {groups.length > 0 && singlePlans.length > 5 ? (
                  // Collapsible "Other Plans" section for 6+ plans
                  <>
                    <button
                      onClick={() => setOtherPlansExpanded(!otherPlansExpanded)}
                      className="w-full flex items-center justify-between py-2 hover:bg-stone-50 dark:hover:bg-gray-700/30 transition-colors -mx-2 px-2 rounded mb-1"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {otherPlansExpanded || hasSearch ? (
                          <ChevronDown className="w-4 h-4 text-stone-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-stone-500 dark:text-gray-400">
                          Other Plans ({singlePlans.length})
                        </span>
                      </div>
                      {singlePlans.filter(p => p.status === 'accepted').length > 0 && (
                        <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0 ml-2">
                          {singlePlans.filter(p => p.status === 'accepted').length} accepted
                        </span>
                      )}
                    </button>
                    {(otherPlansExpanded || hasSearch) && singlePlans.map((plan, idx) => (
                      <PlanRow
                        key={plan.id}
                        plan={plan}
                        onVerify={handleVerify}
                        showConfidence={showIndividualConfidence}
                        isLast={idx === singlePlans.length - 1}
                        showAcceptedBadge
                        recentlyVerified={recentlyVerifiedPlans.has(plan.id)}
                      />
                    ))}
                  </>
                ) : (
                  // Regular display for 5 or fewer plans
                  <>
                    {groups.length > 0 && (
                      <p className="text-sm font-medium text-stone-500 dark:text-gray-400 mb-2">Other Plans</p>
                    )}
                    {singlePlans.map((plan, idx) => (
                      <PlanRow
                        key={plan.id}
                        plan={plan}
                        onVerify={handleVerify}
                        showConfidence={showIndividualConfidence}
                        isLast={idx === singlePlans.length - 1}
                        showAcceptedBadge={groups.length > 0}
                        recentlyVerified={recentlyVerifiedPlans.has(plan.id)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-stone-500 dark:text-gray-400 py-4 text-center">
            No plans match "{searchQuery}"
          </p>
        )}
      </div>

      {/* Verification CTA */}
      <div className="mt-6 pt-4 border-t border-stone-100 dark:border-gray-700">
        <p className="text-sm text-stone-600 dark:text-gray-400 text-center mb-3">
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
          <p className="flex items-center justify-center gap-1.5 text-xs text-stone-500 dark:text-gray-400 text-center mt-3">
            <Users className="w-3.5 h-3.5" />
            Join {verificationCount} {verificationCount === 1 ? 'person' : 'people'} who verified this provider
          </p>
        )}

        {verificationCount === 0 && (
          <p className="text-xs text-stone-500 dark:text-gray-400 text-center mt-3">
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
        onVerified={handleVerificationSuccess}
      />
    </div>
  );
}
