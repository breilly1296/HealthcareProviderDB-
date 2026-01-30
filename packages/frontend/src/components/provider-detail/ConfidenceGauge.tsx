'use client';

interface ConfidenceGaugeProps {
  score: number;
  size?: number;
  showLink?: boolean;
  verificationCount?: number;
}

function getConfidenceLevel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'High Confidence', color: '#10b981' };
  if (score >= 60) return { label: 'Medium Confidence', color: '#3b82f6' };
  if (score >= 40) return { label: 'Low Confidence', color: '#f59e0b' };
  return { label: 'Very Low', color: '#ef4444' };
}

function getImprovementHint(score: number, verificationCount: number): string | null {
  if (score >= 80) return null;

  const verificationsNeeded = Math.max(0, 3 - verificationCount);

  if (verificationsNeeded > 0) {
    return `${verificationsNeeded} verification${verificationsNeeded !== 1 ? 's' : ''} needed for high confidence`;
  }

  if (score < 60) {
    return 'More recent verifications would improve confidence';
  }

  return 'Data is being validated';
}

export function ConfidenceGauge({
  score,
  size = 140,
  showLink = true,
  verificationCount = 0
}: ConfidenceGaugeProps) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  const { label, color } = getConfidenceLevel(score);
  const improvementHint = getImprovementHint(score, verificationCount);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className="stroke-slate-200 dark:stroke-slate-700"
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
          <span className="text-3xl font-bold text-slate-900 dark:text-white">{score}%</span>
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
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-center max-w-[160px]">
          {improvementHint}
        </p>
      )}

      {showLink && (
        <button className="mt-2 text-xs text-[#137fec] hover:underline">
          How is this calculated?
        </button>
      )}
    </div>
  );
}
