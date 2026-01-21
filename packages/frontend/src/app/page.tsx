'use client';

import Link from 'next/link';
import { WelcomeBackBanner } from '@/components/WelcomeBackBanner';

export default function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white dark:from-gray-800 dark:to-gray-900 py-10 md:py-24">
        <div className="container-wide text-center">
          {/* Welcome Back Banner */}
          <WelcomeBackBanner />
          {/* Research Badge with Citation Summary */}
          <div className="inline-flex flex-col items-center gap-2 bg-white dark:bg-gray-800 px-4 sm:px-6 py-3 rounded-xl shadow-sm border border-primary-200 dark:border-gray-700 mb-6">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xl sm:text-2xl leading-none">📚</span>
              <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                Backed by peer-reviewed research
              </span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 text-center max-w-md">
              Based on Mortensen et al. (2015) JAMIA, Haeder et al. (2024) Health Affairs Scholar
            </p>
            <Link
              href="/research"
              className="inline-flex items-center text-xs sm:text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 whitespace-nowrap"
            >
              View full research methodology →
            </Link>
          </div>

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

      {/* The Problem Section */}
      <section className="py-12 md:py-16 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="container-wide">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
            Why This Matters
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 text-center max-w-2xl mx-auto mb-10">
            Insurance directories are notoriously unreliable, leaving patients with unexpected bills
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-4xl mx-auto">
            <div className="text-center p-6 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
              <div className="text-4xl font-bold text-red-600 dark:text-red-400">46%</div>
              <div className="text-gray-700 dark:text-gray-300 mt-2 font-medium">Directory Inaccuracy Rate</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Haeder et al., 2024</div>
            </div>
            <div className="text-center p-6 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
              <div className="text-4xl font-bold text-amber-600 dark:text-amber-400">4x</div>
              <div className="text-gray-700 dark:text-gray-300 mt-2 font-medium">More Surprise Bills</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Health Affairs Scholar</div>
            </div>
            <div className="text-center p-6 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
              <div className="text-4xl font-bold text-green-600 dark:text-green-400">κ=0.58</div>
              <div className="text-gray-700 dark:text-gray-300 mt-2 font-medium">Our Expert-Level Accuracy</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Mortensen et al., 2015</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 md:py-24 bg-white dark:bg-gray-900">
        <div className="container-wide">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-4">
            How It Works
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 text-center max-w-2xl mx-auto mb-4">
            Finding the right provider for your insurance is simple
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-2xl mx-auto mb-12">
            Our approach achieves <strong className="dark:text-gray-200">expert-level accuracy (κ=0.58 vs 0.59)</strong> with
            <strong className="dark:text-gray-200"> real-time updates vs 540-day industry lag</strong>
            <br />
            <span className="text-xs">Based on research from Health Affairs Scholar, JAMIA</span>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">1</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Search Providers
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Enter your location, specialty needed, and optionally your insurance
                plan to find matching providers.
              </p>
            </div>

            {/* Step 2 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">2</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Check Confidence Scores
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                See our confidence rating for each provider-insurance match, based
                on official data and community verifications.
              </p>
            </div>

            {/* Step 3 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">3</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Verify & Contribute
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                After your visit, help others by verifying whether the provider
                accepted your insurance as expected.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Confidence Scores Explained */}
      <section id="confidence" className="py-16 md:py-24 bg-gray-50 dark:bg-gray-800">
        <div className="container-wide">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-4">
            Understanding Confidence Scores
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 text-center max-w-2xl mx-auto mb-4">
            Our scoring system helps you understand how reliable our information is
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-2xl mx-auto mb-12">
            Research shows crowdsourced verification achieves <strong className="dark:text-gray-200">expert-level accuracy</strong> while being
            <strong className="dark:text-gray-200"> 5-150x faster</strong> and <strong className="dark:text-gray-200">75% cheaper</strong> than traditional methods
          </p>

          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {/* High Confidence */}
              <div className="card border-l-4 border-l-green-500">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">High Confidence</div>
                    <div className="text-sm text-green-600 dark:text-green-400">70-100 Score</div>
                  </div>
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Verified by official sources or multiple community members. Very reliable.
                </p>
              </div>

              {/* Medium Confidence */}
              <div className="card border-l-4 border-l-yellow-500">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/40 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">Medium Confidence</div>
                    <div className="text-sm text-yellow-600 dark:text-yellow-400">40-69 Score</div>
                  </div>
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Some verification exists, but may be outdated. Consider calling to confirm.
                </p>
              </div>

              {/* Low Confidence */}
              <div className="card border-l-4 border-l-red-500">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">Low Confidence</div>
                    <div className="text-sm text-red-600 dark:text-red-400">0-39 Score</div>
                  </div>
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Limited or no verification. Always call the provider to confirm before visiting.
                </p>
              </div>
            </div>

            {/* Scoring Factors */}
            <div className="card">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                How We Calculate Scores
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                Our research-backed scoring system emphasizes recent data and optimal verification thresholds
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                    Recency (30 points)
                    <span className="ml-2 text-xs text-primary-600 dark:text-primary-400 font-normal">↑ Most Important</span>
                  </h4>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    <strong className="dark:text-gray-200">Research shows 12% annual provider turnover</strong> — recent data is critical.
                    Verifications within 30 days score highest, with specialty-specific decay rates.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Data Source (25 points)</h4>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    Official CMS data scores highest, followed by insurance carrier data,
                    then community verifications. All sources combined create reliability.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                    Verification Count (25 points)
                    <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-normal">✓ Expert-Level</span>
                  </h4>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    <strong className="dark:text-gray-200">Research shows 3 verifications achieve expert-level accuracy (κ=0.58)</strong> —
                    matching professional validation. Additional verifications beyond 3 provide no significant benefit.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Agreement (20 points)</h4>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    Community consensus matters. High agreement (80%+) indicates reliable data,
                    while conflicting reports (&lt;40%) suggest outdated information.
                  </p>
                </div>
              </div>
              <div className="mt-6 p-4 bg-primary-50 dark:bg-primary-900/30 rounded-lg border border-primary-200 dark:border-primary-800">
                <p className="text-xs text-primary-900 dark:text-primary-300">
                  <strong>Total: 100 points</strong> (25 + 30 + 25 + 20) • Updated scoring emphasizes time-sensitivity
                  based on Ndumele et al. (2018) and optimal verification threshold from Mortensen et al. (2015)
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-primary-600">
        <div className="container-wide text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Find Your Provider?
          </h2>
          <p className="text-xl text-primary-100 max-w-2xl mx-auto mb-8">
            Don't be part of the 46% affected by inaccurate directories.
            Search now with research-backed verification.
          </p>
          <Link
            href="/search"
            className="btn bg-white text-primary-600 hover:bg-gray-100 text-lg px-8 py-4"
          >
            Start Searching
          </Link>
        </div>
      </section>
    </div>
  );
}
