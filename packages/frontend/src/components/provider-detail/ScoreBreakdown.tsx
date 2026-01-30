'use client';

interface ScoreBreakdownProps {
  breakdown?: {
    dataSource?: number;
    dataSourceMax?: number;
    recency?: number;
    recencyMax?: number;
    verifications?: number;
    verificationsMax?: number;
    agreement?: number;
    agreementMax?: number;
  };
}

interface FactorRowProps {
  label: string;
  value: number;
  max: number;
}

function FactorRow({ label, value, max }: FactorRowProps) {
  const percentage = (value / max) * 100;

  return (
    <div className="flex items-center gap-4">
      <span className="w-28 text-sm text-stone-600 dark:text-gray-400 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-stone-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#137fec] rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-16 text-sm font-medium text-stone-800 dark:text-white text-right">
        {value}/{max} pts
      </span>
    </div>
  );
}

export function ScoreBreakdown({ breakdown }: ScoreBreakdownProps) {
  // Default values for demo
  const factors = {
    dataSource: breakdown?.dataSource ?? 20,
    dataSourceMax: breakdown?.dataSourceMax ?? 25,
    recency: breakdown?.recency ?? 25,
    recencyMax: breakdown?.recencyMax ?? 30,
    verifications: breakdown?.verifications ?? 20,
    verificationsMax: breakdown?.verificationsMax ?? 25,
    agreement: breakdown?.agreement ?? 18,
    agreementMax: breakdown?.agreementMax ?? 20,
  };

  const total = factors.dataSource + factors.recency + factors.verifications + factors.agreement;
  const maxTotal = factors.dataSourceMax + factors.recencyMax + factors.verificationsMax + factors.agreementMax;
  const totalPercentage = (total / maxTotal) * 100;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-stone-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-stone-800 dark:text-white mb-5">Score Breakdown</h2>

      <div className="space-y-4">
        <FactorRow label="Data Source" value={factors.dataSource} max={factors.dataSourceMax} />
        <FactorRow label="Recency" value={factors.recency} max={factors.recencyMax} />
        <FactorRow label="Verifications" value={factors.verifications} max={factors.verificationsMax} />
        <FactorRow label="Agreement" value={factors.agreement} max={factors.agreementMax} />
      </div>

      {/* Total */}
      <div className="mt-6 pt-4 border-t border-stone-100 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <span className="w-28 text-sm font-medium text-stone-800 dark:text-white flex-shrink-0">Total</span>
          <div className="flex-1 h-3 bg-stone-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#137fec] to-[#0d5bb5] rounded-full transition-all duration-500"
              style={{ width: `${totalPercentage}%` }}
            />
          </div>
          <span className="w-20 text-sm font-bold text-stone-800 dark:text-white text-right">
            {total}/{maxTotal} total
          </span>
        </div>
      </div>
    </div>
  );
}
