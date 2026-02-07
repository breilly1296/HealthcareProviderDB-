import Link from 'next/link';
import Image from 'next/image';
import { Search, CreditCard } from 'lucide-react';
import { WelcomeBackBanner } from '@/components/WelcomeBackBanner';

export function HeroSection() {
  return (
    <>
      {/* Welcome Back Banner - at very top */}
      <WelcomeBackBanner />

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
            Verified by real patients. Backed by peer-reviewed research.
          </p>

          {/* Primary CTA */}
          <div className="flex flex-col items-center gap-4 px-4">
            <Link
              href="/search"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-xl shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] hover:shadow-xl"
            >
              <Search className="w-5 h-5" />
              Find a Provider
            </Link>

            {/* Secondary link */}
            <Link
              href="/insurance"
              className="inline-flex items-center gap-1.5 text-sm text-stone-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              or scan your insurance card
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* How it works link */}
          <Link
            href="#how-it-works"
            className="inline-flex items-center gap-1 mt-8 text-sm text-stone-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            How it works
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Link>
        </div>
      </section>
    </>
  );
}
