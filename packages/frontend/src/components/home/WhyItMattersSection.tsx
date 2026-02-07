'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

function useCountUp(
  end: number,
  duration: number,
  decimals = 0,
  triggered: boolean
) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!triggered) return;

    let start: number | null = null;
    let rafId: number;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      setValue(parseFloat((eased * end).toFixed(decimals)));

      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [triggered, end, duration, decimals]);

  return value;
}

const statistics = [
  {
    endValue: 46,
    decimals: 0,
    duration: 1500,
    suffix: '%',
    prefix: '',
    label: 'Directory Inaccuracy Rate',
    source: 'Haeder et al., 2024',
    color: 'red' as const,
  },
  {
    endValue: 4,
    decimals: 0,
    duration: 1000,
    suffix: 'x',
    prefix: '',
    label: 'More Surprise Bills',
    source: 'Health Affairs Scholar',
    color: 'amber' as const,
  },
  {
    endValue: 0.58,
    decimals: 2,
    duration: 1200,
    suffix: '',
    prefix: 'κ=',
    label: 'Our Expert-Level Accuracy',
    source: 'Mortensen et al., 2015',
    color: 'green' as const,
  },
];

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
};

function StatCard({
  stat,
  triggered,
}: {
  stat: (typeof statistics)[number];
  triggered: boolean;
}) {
  const styles = colorStyles[stat.color];
  const count = useCountUp(stat.endValue, stat.duration, stat.decimals, triggered);
  const display = `${stat.prefix}${stat.decimals > 0 ? count.toFixed(stat.decimals) : count}${stat.suffix}`;

  return (
    <div
      className={`text-center p-6 rounded-xl shadow-sm ${styles.bg} border border-stone-200 dark:border-transparent ${styles.border}`}
    >
      <div className={`text-4xl font-bold ${styles.text}`}>{display}</div>
      <div className="text-stone-700 dark:text-gray-300 mt-2 font-medium">{stat.label}</div>
      <div className="text-xs text-stone-500 dark:text-gray-400 mt-1">{stat.source}</div>
    </div>
  );
}

export function WhyItMattersSection() {
  const [triggered, setTriggered] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0]?.isIntersecting) {
      setTriggered(true);
    }
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    // Use a low threshold so stacked mobile layouts still trigger
    const observer = new IntersectionObserver(handleIntersect, {
      threshold: 0.15,
    });
    observer.observe(el);

    // Safety fallback: if the observer never fires (e.g. element is
    // already visible on mount but below threshold), show final values
    const fallback = setTimeout(() => setTriggered(true), 3500);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [handleIntersect]);

  return (
    <section className="py-8 md:py-12 bg-transparent dark:bg-gray-900 border-b border-stone-200 dark:border-gray-800">
      <div className="container-wide">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-stone-800 dark:text-white mb-3">
          Why This Matters
        </h2>
        <p className="text-base text-stone-600 dark:text-gray-300 text-center max-w-2xl mx-auto mb-6">
          Insurance directories are notoriously unreliable, leaving patients with unexpected bills
        </p>

        <div ref={sectionRef} className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
          {statistics.map((stat) => (
            <StatCard key={stat.label} stat={stat} triggered={triggered} />
          ))}
        </div>
      </div>
    </section>
  );
}
