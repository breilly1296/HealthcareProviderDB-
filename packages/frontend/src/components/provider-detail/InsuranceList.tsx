'use client';

import { useState, useMemo } from 'react';
import { CheckCircle, HelpCircle, Search, ChevronDown, ChevronUp } from 'lucide-react';

interface InsurancePlan {
  id: string;
  name: string;
  status: 'accepted' | 'unknown';
  confidence: number;
}

interface InsuranceListProps {
  plans?: InsurancePlan[];
}

// Sample data for demo
const samplePlans: InsurancePlan[] = [
  { id: '1', name: 'Blue Cross Blue Shield PPO', status: 'accepted', confidence: 92 },
  { id: '2', name: 'Aetna HMO Plus', status: 'accepted', confidence: 88 },
  { id: '3', name: 'UnitedHealthcare Choice', status: 'unknown', confidence: 45 },
];

const INITIAL_DISPLAY_COUNT = 5;

function PlanCard({ plan }: { plan: InsurancePlan }) {
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

      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
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

export function InsuranceList({ plans = samplePlans }: InsuranceListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const verifiedCount = plans.filter(p => p.status === 'accepted').length;

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
            <PlanCard key={plan.id} plan={plan} />
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

      {/* Don't see your plan link */}
      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button className="text-sm text-[#137fec] hover:underline">
          Don't see your plan?
        </button>
      </div>
    </div>
  );
}
