'use client';

interface ConfidenceGaugeProps {
  score: number;
  size?: number;
  showLink?: boolean;
}

export function ConfidenceGauge({ score, size = 140, showLink = true }: ConfidenceGaugeProps) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  // Color based on score
  const getColor = (s: number) => {
    if (s >= 80) return '#10b981'; // green
    if (s >= 60) return '#3b82f6'; // blue
    if (s >= 40) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  const strokeColor = getColor(score);

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
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-gray-900">{score}%</span>
        </div>
      </div>

      <p className="mt-2 text-sm font-medium text-gray-600">Confidence Score</p>

      {showLink && (
        <button className="mt-1 text-xs text-[#137fec] hover:underline">
          How is this calculated?
        </button>
      )}
    </div>
  );
}
