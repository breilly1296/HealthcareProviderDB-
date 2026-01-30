'use client';

import { CheckCircle, HelpCircle } from 'lucide-react';

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

function PlanCard({ plan }: { plan: InsurancePlan }) {
  const isAccepted = plan.status === 'accepted';

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        {isAccepted ? (
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
        ) : (
          <HelpCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
        )}
        <span className="font-medium text-gray-900">{plan.name}</span>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            isAccepted
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          {isAccepted ? 'Accepted' : 'Unknown'}
        </span>
        <span className="text-sm text-gray-500">{plan.confidence}%</span>
      </div>
    </div>
  );
}

export function InsuranceList({ plans = samplePlans }: InsuranceListProps) {
  const verifiedCount = plans.filter(p => p.status === 'accepted').length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">Insurance Acceptance</h2>
        <p className="text-sm text-gray-500 mt-1">{verifiedCount} verified plans</p>
      </div>

      <div className="space-y-3">
        {plans.map(plan => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      <button className="mt-4 text-sm text-[#137fec] hover:underline">
        Don't see your plan?
      </button>
    </div>
  );
}
