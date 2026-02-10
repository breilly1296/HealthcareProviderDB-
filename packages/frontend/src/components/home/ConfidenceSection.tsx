import Link from 'next/link';

const confidenceLevels = [
  {
    level: 'High Confidence',
    description: 'Multiple patients have confirmed this provider accepts their insurance. You can trust this information.',
    color: 'green',
    icon: (
      <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  {
    level: 'Medium Confidence',
    description: 'Some verification exists, but it may be outdated. Consider calling the office to confirm.',
    color: 'yellow',
    icon: (
      <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    level: 'Low Confidence',
    description: 'Limited information available. Always call the provider to confirm before scheduling.',
    color: 'red',
    icon: (
      <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
] as const;

const colorStyles = {
  green: {
    border: 'border-l-green-500',
    bg: 'bg-green-100 dark:bg-green-900/40',
  },
  yellow: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-100 dark:bg-yellow-900/40',
  },
  red: {
    border: 'border-l-red-500',
    bg: 'bg-red-100 dark:bg-red-900/40',
  },
} as const;

export function ConfidenceSection() {
  return (
    <section id="confidence" className="py-10 md:py-14 bg-transparent dark:bg-gray-800">
      <div className="container-wide">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-stone-800 dark:text-white mb-3">
          Verified by Real Patients
        </h2>
        <p className="text-base text-stone-600 dark:text-gray-300 text-center max-w-2xl mx-auto mb-8">
          Our verification system uses reports from real patients who&apos;ve visited these providers.
          When multiple patients confirm a provider accepts their insurance, you can trust that information.
          It&apos;s like checking reviews before booking a restaurant.
        </p>

        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {confidenceLevels.map((level) => {
              const styles = colorStyles[level.color];
              return (
                <div key={level.level} className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-stone-200 dark:border-gray-700 p-6 border-l-4 ${styles.border}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 ${styles.bg} rounded-full flex items-center justify-center`}>
                      {level.icon}
                    </div>
                    <div className="font-semibold text-stone-800 dark:text-white">{level.level}</div>
                  </div>
                  <p className="text-stone-600 dark:text-gray-300">{level.description}</p>
                </div>
              );
            })}
          </div>

          <p className="text-center mt-8">
            <Link
              href="/research"
              className="text-sm text-stone-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              See our research methodology &rarr;
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
