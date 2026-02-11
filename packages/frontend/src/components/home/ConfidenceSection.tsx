import Link from 'next/link';
import { Check, AlertTriangle, HelpCircle } from 'lucide-react';

const confidenceLevels = [
  {
    level: 'High Confidence',
    description: 'Multiple patients have confirmed this provider accepts their insurance. You can trust this information.',
    color: 'green',
    icon: <Check className="w-6 h-6 text-green-600 dark:text-green-400" />,
  },
  {
    level: 'Medium Confidence',
    description: 'Some verification exists, but it may be outdated. Consider calling the office to confirm.',
    color: 'yellow',
    icon: <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />,
  },
  {
    level: 'Low Confidence',
    description: 'Limited information available. Always call the provider to confirm before scheduling.',
    color: 'red',
    icon: <HelpCircle className="w-6 h-6 text-red-600 dark:text-red-400" />,
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
