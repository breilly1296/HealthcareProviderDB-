const confidenceLevels = [
  {
    level: 'High Confidence',
    range: '70-100 Score',
    description: 'Verified by official sources or multiple community members. Very reliable.',
    color: 'green',
    icon: (
      <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  {
    level: 'Medium Confidence',
    range: '40-69 Score',
    description: 'Some verification exists, but may be outdated. Consider calling to confirm.',
    color: 'yellow',
    icon: (
      <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    level: 'Low Confidence',
    range: '0-39 Score',
    description: 'Limited or no verification. Always call the provider to confirm before visiting.',
    color: 'red',
    icon: (
      <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
] as const;

const colorStyles = {
  green: {
    border: 'border-l-green-500',
    bg: 'bg-green-100 dark:bg-green-900/40',
    text: 'text-green-600 dark:text-green-400',
  },
  yellow: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-100 dark:bg-yellow-900/40',
    text: 'text-yellow-600 dark:text-yellow-400',
  },
  red: {
    border: 'border-l-red-500',
    bg: 'bg-red-100 dark:bg-red-900/40',
    text: 'text-red-600 dark:text-red-400',
  },
} as const;

const scoringFactors = [
  {
    title: 'Recency (30 points)',
    badge: { text: '↑ Most Important', color: 'text-primary-600 dark:text-primary-400' },
    description:
      'Research shows 12% annual provider turnover — recent data is critical. Verifications within 30 days score highest, with specialty-specific decay rates.',
  },
  {
    title: 'Data Source (25 points)',
    description:
      'Official CMS data scores highest, followed by insurance carrier data, then community verifications. All sources combined create reliability.',
  },
  {
    title: 'Verification Count (25 points)',
    badge: { text: '✓ Expert-Level', color: 'text-green-600 dark:text-green-400' },
    description:
      'Research shows 3 verifications achieve expert-level accuracy (κ=0.58) — matching professional validation. Additional verifications beyond 3 provide no significant benefit.',
  },
  {
    title: 'Agreement (20 points)',
    description:
      'Community consensus matters. High agreement (80%+) indicates reliable data, while conflicting reports (<40%) suggest outdated information.',
  },
];

export function ConfidenceSection() {
  return (
    <section id="confidence" className="py-10 md:py-14 bg-transparent dark:bg-gray-800">
      <div className="container-wide">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-stone-800 dark:text-white mb-3">
          Understanding Confidence Scores
        </h2>
        <p className="text-base text-stone-600 dark:text-gray-300 text-center max-w-2xl mx-auto mb-3">
          Our scoring system helps you understand how reliable our information is
        </p>
        <p className="text-sm text-stone-500 dark:text-gray-400 text-center max-w-2xl mx-auto mb-8">
          Research shows crowdsourced verification achieves <strong className="text-stone-700 dark:text-gray-200">expert-level accuracy</strong> while being
          <strong className="text-stone-700 dark:text-gray-200"> 5-150x faster</strong> and <strong className="text-stone-700 dark:text-gray-200">75% cheaper</strong> than traditional methods
        </p>

        <div className="max-w-4xl mx-auto">
          {/* Confidence Levels */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {confidenceLevels.map((level) => {
              const styles = colorStyles[level.color];
              return (
                <div key={level.level} className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-stone-200 dark:border-gray-700 p-6 border-l-4 ${styles.border}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 ${styles.bg} rounded-full flex items-center justify-center`}>
                      {level.icon}
                    </div>
                    <div>
                      <div className="font-semibold text-stone-800 dark:text-white">{level.level}</div>
                      <div className={`text-sm ${styles.text}`}>{level.range}</div>
                    </div>
                  </div>
                  <p className="text-stone-600 dark:text-gray-300">{level.description}</p>
                </div>
              );
            })}
          </div>

          {/* Scoring Factors */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-stone-200 dark:border-gray-700 p-6">
            <h3 className="text-xl font-semibold text-stone-800 dark:text-white mb-6">
              How We Calculate Scores
            </h3>
            <p className="text-sm text-stone-600 dark:text-gray-300 mb-6">
              Our research-backed scoring system emphasizes recent data and optimal verification thresholds
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {scoringFactors.map((factor) => (
                <div key={factor.title}>
                  <h4 className="font-medium text-stone-800 dark:text-white mb-2">
                    {factor.title}
                    {factor.badge && (
                      <span className={`ml-2 text-xs ${factor.badge.color} font-normal`}>
                        {factor.badge.text}
                      </span>
                    )}
                  </h4>
                  <p className="text-stone-600 dark:text-gray-300 text-sm">
                    <strong className="text-stone-700 dark:text-gray-200">{factor.description.split('—')[0]}</strong>
                    {factor.description.includes('—') && `—${factor.description.split('—')[1]}`}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 bg-amber-50 dark:bg-primary-900/30 rounded-lg border border-amber-200 dark:border-primary-800">
              <p className="text-xs text-amber-900 dark:text-primary-300">
                <strong>Total: 100 points</strong> (25 + 30 + 25 + 20) • Updated scoring emphasizes time-sensitivity
                based on Ndumele et al. (2018) and optimal verification threshold from Mortensen et al. (2015)
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
