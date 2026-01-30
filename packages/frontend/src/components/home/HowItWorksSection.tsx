const steps = [
  {
    number: 1,
    title: 'Search Providers',
    description:
      'Enter your location, specialty needed, and optionally your insurance plan to find matching providers.',
  },
  {
    number: 2,
    title: 'Check Confidence Scores',
    description:
      'See our confidence rating for each provider-insurance match, based on official data and community verifications.',
  },
  {
    number: 3,
    title: 'Verify & Contribute',
    description:
      'After your visit, help others by verifying whether the provider accepted your insurance as expected.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-10 md:py-14 bg-transparent dark:bg-gray-900">
      <div className="container-wide">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-stone-800 dark:text-white mb-3">
          How It Works
        </h2>
        <p className="text-base text-stone-600 dark:text-gray-300 text-center max-w-2xl mx-auto mb-3">
          Finding the right provider for your insurance is simple
        </p>
        <p className="text-sm text-stone-500 dark:text-gray-400 text-center max-w-2xl mx-auto mb-8">
          Our approach achieves <strong className="text-stone-700 dark:text-gray-200">expert-level accuracy (κ=0.58 vs 0.59)</strong> with
          <strong className="text-stone-700 dark:text-gray-200"> real-time updates vs 540-day industry lag</strong>
          <br />
          <span className="text-xs">Based on research from Health Affairs Scholar, JAMIA</span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step) => (
            <div key={step.number} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-stone-200 dark:border-gray-700 p-6 text-center">
              <div className="w-16 h-16 bg-stone-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-stone-600 dark:text-primary-400">
                  {step.number}
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-800 dark:text-white mb-4">
                {step.title}
              </h3>
              <p className="text-stone-600 dark:text-gray-300">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
