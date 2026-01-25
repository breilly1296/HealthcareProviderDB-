import Link from 'next/link';
import { WelcomeBackBanner } from '@/components/WelcomeBackBanner';

export function HeroSection() {
  return (
    <section className="bg-gradient-to-b from-primary-50 to-white dark:from-gray-800 dark:to-gray-900 py-10 md:py-24">
      <div className="container-wide text-center">
        {/* Welcome Back Banner */}
        <WelcomeBackBanner />

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6 px-4">
          Find Providers Who Actually
          <span className="text-primary-600 dark:text-primary-400"> Accept Your Insurance</span>
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-6 md:mb-8 px-4">
          Verified by real patients. Backed by peer-reviewed research.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center px-4">
          <Link href="/search" className="btn-primary text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4">
            Search Providers
          </Link>
          <Link href="#how-it-works" className="btn-outline text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4">
            How it works →
          </Link>
        </div>
      </div>
    </section>
  );
}
