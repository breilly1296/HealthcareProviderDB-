'use client';

import { Building2, ShieldCheck, Users, BookOpen } from 'lucide-react';

const TRUST_STATS = [
  {
    Icon: Building2,
    value: '50,000+',
    label: 'NYC Providers',
  },
  {
    Icon: ShieldCheck,
    value: 'CMS-Verified',
    label: 'Data Source',
  },
  {
    Icon: Users,
    value: 'Community',
    label: 'Verified',
  },
  {
    Icon: BookOpen,
    value: 'Research',
    label: 'Backed',
  },
];

export function TrustBar() {
  return (
    <section className="bg-stone-50 dark:bg-gray-800/50 border-y border-stone-200 dark:border-gray-700">
      <div className="container-wide py-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
          {TRUST_STATS.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-3 justify-center"
            >
              <stat.Icon className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm font-semibold text-stone-800 dark:text-white leading-tight">
                  {stat.value}
                </p>
                <p className="text-xs text-stone-500 dark:text-gray-400 leading-tight">
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
