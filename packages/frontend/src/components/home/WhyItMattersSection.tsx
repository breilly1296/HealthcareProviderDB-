'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

const cards = [
  {
    headline: 'Half of directory listings are wrong',
    body: 'Studies show insurance directories are wrong 46\u201377% of the time, leading to surprise bills and denied claims.',
    color: 'red' as const,
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    headline: 'Surprise bills cost thousands',
    body: 'Patients who unknowingly see out-of-network providers face bills averaging $600\u2013$2,400 per visit.',
    color: 'amber' as const,
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    headline: 'We fix it with real patient data',
    body: 'Community verifications from real patients keep our data accurate and up to date.',
    color: 'green' as const,
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const colorStyles = {
  red: {
    bg: 'bg-rose-50/70 dark:bg-red-900/20',
    border: 'border-rose-200 dark:border-red-800',
    iconColor: 'text-rose-500 dark:text-red-400',
  },
  amber: {
    bg: 'bg-amber-50/70 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    iconColor: 'text-amber-500 dark:text-amber-400',
  },
  green: {
    bg: 'bg-emerald-50/70 dark:bg-green-900/20',
    border: 'border-emerald-200 dark:border-green-800',
    iconColor: 'text-emerald-500 dark:text-green-400',
  },
};

export function WhyItMattersSection() {
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0]?.isIntersecting) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(handleIntersect, {
      threshold: 0.15,
    });
    observer.observe(el);

    const fallback = setTimeout(() => setVisible(true), 3500);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [handleIntersect]);

  return (
    <section className="py-8 md:py-12 bg-transparent dark:bg-gray-900 border-b border-stone-200 dark:border-gray-800">
      <div className="container-wide">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-stone-800 dark:text-white mb-3">
          Why Directory Data Matters
        </h2>
        <p className="text-base text-stone-600 dark:text-gray-300 text-center max-w-2xl mx-auto mb-6">
          Insurance directories are wrong up to half the time — and patients pay the price.
        </p>

        <div ref={sectionRef} className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
          {cards.map((card, index) => {
            const styles = colorStyles[card.color];
            return (
              <div
                key={card.headline}
                className={`text-center p-6 rounded-xl shadow-sm ${styles.bg} border ${styles.border} ${
                  visible ? 'animate-fade-up' : 'opacity-0'
                }`}
                style={visible ? { animationDelay: `${index * 100}ms` } : undefined}
              >
                <div className={`flex justify-center mb-3 ${styles.iconColor}`}>
                  {card.icon}
                </div>
                <h3 className="text-lg font-bold text-stone-800 dark:text-white mb-2">
                  {card.headline}
                </h3>
                <p className="text-sm text-stone-600 dark:text-gray-300">
                  {card.body}
                </p>
              </div>
            );
          })}
        </div>

        <p className="text-center mt-6">
          <Link
            href="/research"
            className="text-sm text-stone-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            Based on peer-reviewed research &rarr;
          </Link>
        </p>
      </div>
    </section>
  );
}
