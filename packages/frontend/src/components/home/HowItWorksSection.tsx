'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const steps = [
  {
    number: 1,
    title: 'Search',
    description:
      'Enter your location and insurance to find matching providers near you.',
  },
  {
    number: 2,
    title: 'Compare',
    description:
      'See which providers are verified by other patients like you.',
  },
  {
    number: 3,
    title: 'Book with confidence',
    description:
      'Found a provider? After your visit, help others by sharing your experience.',
  },
];

export function HowItWorksSection() {
  const [visible, setVisible] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0]?.isIntersecting) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(handleIntersect, {
      threshold: 0.3,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  return (
    <section id="how-it-works" className="py-10 md:py-14 bg-transparent dark:bg-gray-900">
      <div className="container-wide">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-stone-800 dark:text-white mb-3">
          How It Works
        </h2>
        <p className="text-base text-stone-600 dark:text-gray-300 text-center max-w-2xl mx-auto mb-8">
          Three simple steps to find the right provider.
        </p>

        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-0 max-w-4xl mx-auto">
          {steps.map((step, index) => (
            <div key={step.number} className="flex flex-col items-center md:flex-row md:items-stretch">
              {/* Step card */}
              <div
                className={`
                  flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-stone-200 dark:border-gray-700
                  p-6 text-center transition-all duration-200
                  hover:-translate-y-1 hover:shadow-md
                  ${visible ? 'animate-fade-up' : 'opacity-0'}
                `}
                style={visible ? { animationDelay: `${index * 0.1}s` } : undefined}
              >
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

              {/* Connecting arrow — desktop only, not after last step */}
              {index < steps.length - 1 && (
                <>
                  {/* Desktop: horizontal arrow */}
                  <div className="hidden md:flex items-center justify-center w-10 flex-shrink-0">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-stone-300 dark:text-gray-600" aria-hidden="true">
                      <path d="M5 12h14m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  {/* Mobile: vertical arrow */}
                  <div className="flex md:hidden items-center justify-center h-8 flex-shrink-0">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-stone-300 dark:text-gray-600" aria-hidden="true">
                      <path d="M12 5v14m-4-4 4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
