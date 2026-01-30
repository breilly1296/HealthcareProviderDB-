const statistics = [
  {
    value: '46%',
    label: 'Directory Inaccuracy Rate',
    source: 'Haeder et al., 2024',
    color: 'red',
  },
  {
    value: '4x',
    label: 'More Surprise Bills',
    source: 'Health Affairs Scholar',
    color: 'amber',
  },
  {
    value: 'κ=0.58',
    label: 'Our Expert-Level Accuracy',
    source: 'Mortensen et al., 2015',
    color: 'green',
  },
] as const;

const colorStyles = {
  red: {
    bg: 'bg-rose-50/70 dark:bg-red-900/20',
    border: 'border-rose-200 dark:border-red-800',
    text: 'text-rose-600 dark:text-red-400',
  },
  amber: {
    bg: 'bg-amber-50/70 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-600 dark:text-amber-400',
  },
  green: {
    bg: 'bg-emerald-50/70 dark:bg-green-900/20',
    border: 'border-emerald-200 dark:border-green-800',
    text: 'text-emerald-600 dark:text-green-400',
  },
} as const;

export function WhyItMattersSection() {
  return (
    <section className="py-8 md:py-12 bg-white/60 dark:bg-gray-900 border-b border-stone-200 dark:border-gray-800">
      <div className="container-wide">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-stone-800 dark:text-white mb-3">
          Why This Matters
        </h2>
        <p className="text-base text-stone-600 dark:text-gray-300 text-center max-w-2xl mx-auto mb-6">
          Insurance directories are notoriously unreliable, leaving patients with unexpected bills
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
          {statistics.map((stat) => {
            const styles = colorStyles[stat.color];
            return (
              <div
                key={stat.label}
                className={`text-center p-6 rounded-xl ${styles.bg} border ${styles.border}`}
              >
                <div className={`text-4xl font-bold ${styles.text}`}>{stat.value}</div>
                <div className="text-stone-700 dark:text-gray-300 mt-2 font-medium">{stat.label}</div>
                <div className="text-xs text-stone-500 dark:text-gray-400 mt-1">{stat.source}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
