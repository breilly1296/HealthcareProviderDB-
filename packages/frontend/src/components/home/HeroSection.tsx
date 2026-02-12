import Link from 'next/link';
import Image from 'next/image';
import { CreditCard } from 'lucide-react';
import { HeroSearch } from './HeroSearch';

export function HeroSection() {
  return (
      <section className="bg-gradient-to-b from-amber-50/40 to-stone-100 dark:from-gray-800 dark:to-gray-900 py-12 md:py-20">
        <div className="container-wide text-center">
          {/* Full logo - theme-aware via CSS */}
          <div className="flex justify-center mb-6">
            <Image
              src="/full-logo/logo-full-light.svg"
              alt="VerifyMyProvider"
              width={400}
              height={64}
              className="h-12 md:h-16 w-auto dark:hidden"
              priority
            />
            <Image
              src="/full-logo/logo-full-dark.svg"
              alt="VerifyMyProvider"
              width={400}
              height={64}
              className="h-12 md:h-16 w-auto hidden dark:block"
              priority
            />
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-stone-800 dark:text-white mb-4 px-4">
            Find Providers Who Actually
            <span className="text-primary-600 dark:text-primary-400"> Accept Your Insurance</span>
          </h1>
          <p className="text-lg sm:text-xl text-stone-600 dark:text-gray-300 max-w-3xl mx-auto mb-8 px-4">
            Search by specialty, location, and insurance plan.
          </p>

          {/* Inline search bar */}
          <div className="max-w-4xl mx-auto px-4">
            <HeroSearch />
          </div>

          {/* Scan card link */}
          <Link
            href="/insurance"
            className="inline-flex items-center gap-1.5 mt-6 text-sm text-stone-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            or scan your insurance card
          </Link>
        </div>
      </section>
  );
}
