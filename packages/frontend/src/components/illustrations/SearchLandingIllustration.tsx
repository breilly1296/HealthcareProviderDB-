interface IllustrationProps {
  className?: string;
}

export function SearchLandingIllustration({ className = "w-48 h-48" }: IllustrationProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Search for healthcare providers illustration"
    >
      {/* Background circle */}
      <circle cx="100" cy="100" r="80" className="fill-primary-50" />

      {/* Stethoscope */}
      {/* Ear pieces */}
      <circle cx="70" cy="55" r="6" className="fill-primary-200 stroke-primary-400" strokeWidth="2" />
      <circle cx="130" cy="55" r="6" className="fill-primary-200 stroke-primary-400" strokeWidth="2" />

      {/* Y-shaped tubing */}
      <path
        d="M70 61 L70 80 Q70 95 85 100 L100 105"
        className="stroke-primary-400"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M130 61 L130 80 Q130 95 115 100 L100 105"
        className="stroke-primary-400"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />

      {/* Main tube */}
      <path
        d="M100 105 L100 125"
        className="stroke-primary-400"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />

      {/* Chest piece (diaphragm) */}
      <circle cx="100" cy="140" r="20" className="fill-primary-100 stroke-primary-500" strokeWidth="3" />
      <circle cx="100" cy="140" r="12" className="fill-white stroke-primary-400" strokeWidth="2" />

      {/* Medical cross in center */}
      <rect x="96" y="132" width="8" height="16" rx="1" className="fill-primary-500" />
      <rect x="92" y="136" width="16" height="8" rx="1" className="fill-primary-500" />

      {/* Magnifying glass overlay (search aspect) */}
      <circle
        cx="150"
        cy="150"
        r="22"
        className="fill-white stroke-primary-300"
        strokeWidth="3"
      />
      <circle
        cx="150"
        cy="150"
        r="15"
        className="fill-primary-50"
      />
      <line
        x1="165"
        y1="165"
        x2="180"
        y2="180"
        className="stroke-primary-400"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* Search icon lines inside magnifying glass */}
      <line x1="145" y1="150" x2="155" y2="150" className="stroke-primary-400" strokeWidth="2" strokeLinecap="round" />
      <line x1="150" y1="145" x2="150" y2="155" className="stroke-primary-400" strokeWidth="2" strokeLinecap="round" />

      {/* Decorative elements */}
      <circle cx="45" cy="85" r="4" className="fill-primary-200" />
      <circle cx="160" cy="70" r="3" className="fill-primary-300" />
      <circle cx="40" cy="130" r="5" className="fill-primary-100" />

      {/* Small plus signs */}
      <g className="stroke-primary-200" strokeWidth="2" strokeLinecap="round">
        <line x1="165" y1="90" x2="175" y2="90" />
        <line x1="170" y1="85" x2="170" y2="95" />
      </g>
      <g className="stroke-primary-200" strokeWidth="2" strokeLinecap="round">
        <line x1="30" y1="105" x2="38" y2="105" />
        <line x1="34" y1="101" x2="34" y2="109" />
      </g>
    </svg>
  );
}
