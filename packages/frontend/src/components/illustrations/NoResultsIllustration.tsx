interface IllustrationProps {
  className?: string;
}

export function NoResultsIllustration({ className = "w-48 h-48" }: IllustrationProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="No results found illustration"
    >
      {/* Background circle */}
      <circle cx="100" cy="100" r="80" className="fill-gray-100 dark:fill-gray-800" />

      {/* Magnifying glass */}
      <circle
        cx="85"
        cy="85"
        r="35"
        className="stroke-primary-300 dark:stroke-primary-500"
        strokeWidth="6"
        fill="none"
      />
      <circle
        cx="85"
        cy="85"
        r="25"
        className="fill-primary-50 dark:fill-primary-900/50"
      />

      {/* Magnifying glass handle */}
      <line
        x1="112"
        y1="112"
        x2="145"
        y2="145"
        className="stroke-primary-400 dark:stroke-primary-500"
        strokeWidth="8"
        strokeLinecap="round"
      />

      {/* Question mark inside magnifying glass */}
      <path
        d="M78 75c0-6 4-10 10-10s10 4 10 8c0 5-4 6-6 8-1 1-2 2-2 4"
        className="stroke-gray-400 dark:stroke-gray-500"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="90" cy="95" r="2" className="fill-gray-400 dark:fill-gray-500" />

      {/* Small decorative dots */}
      <circle cx="145" cy="60" r="4" className="fill-primary-200 dark:fill-primary-700" />
      <circle cx="55" cy="140" r="3" className="fill-primary-200 dark:fill-primary-700" />
      <circle cx="160" cy="120" r="5" className="fill-gray-200 dark:fill-gray-700" />

      {/* X marks to indicate "not found" */}
      <g className="stroke-gray-300 dark:stroke-gray-600" strokeWidth="2" strokeLinecap="round">
        <line x1="150" y1="70" x2="158" y2="78" />
        <line x1="158" y1="70" x2="150" y2="78" />
      </g>
      <g className="stroke-gray-300 dark:stroke-gray-600" strokeWidth="2" strokeLinecap="round">
        <line x1="45" y1="120" x2="51" y2="126" />
        <line x1="51" y1="120" x2="45" y2="126" />
      </g>
    </svg>
  );
}
