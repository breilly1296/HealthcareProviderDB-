import Link from 'next/link';

export default function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 md:py-24">
        <div className="container-wide text-center">
          {/* Research Badge */}
          <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-primary-200 mb-6">
            <span className="text-2xl">📚</span>
            <span className="text-sm font-medium text-gray-700">
              Backed by peer-reviewed research
            </span>
            <Link
              href="/research"
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              Learn more →
            </Link>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Insurance Directories Are Wrong
            <span className="text-primary-600"> 46% of the Time</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            <strong className="text-gray-900">Patients face 4x more surprise bills</strong> when directories are inaccurate.
            We fix that with crowdsourced verification backed by peer-reviewed research.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/search" className="btn-primary text-lg px-8 py-4">
              Find Verified Providers
            </Link>
            <Link href="/research" className="btn-outline text-lg px-8 py-4">
              See the research →
            </Link>
          </div>

          {/* Research-Backed Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary-600">46%</div>
              <div className="text-gray-600 mt-2">Directory Inaccuracy Rate</div>
              <div className="text-xs text-gray-500 mt-1">Haeder et al., 2024</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary-600">4x</div>
              <div className="text-gray-600 mt-2">More Surprise Bills</div>
              <div className="text-xs text-gray-500 mt-1">Health Affairs Scholar</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary-600">κ=0.58</div>
              <div className="text-gray-600 mt-2">Expert-Level Accuracy</div>
              <div className="text-xs text-gray-500 mt-1">Mortensen et al., 2015</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 md:py-24 bg-white">
        <div className="container-wide">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-4">
            How It Works
          </h2>
          <p className="text-xl text-gray-600 text-center max-w-2xl mx-auto mb-4">
            Finding the right provider for your insurance is simple
          </p>
          <p className="text-sm text-gray-500 text-center max-w-2xl mx-auto mb-12">
            Our approach achieves <strong>expert-level accuracy (κ=0.58 vs 0.59)</strong> with
            <strong> real-time updates vs 540-day industry lag</strong>
            <br />
            <span className="text-xs">Based on research from Health Affairs Scholar, JAMIA</span>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-600">1</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Search Providers
              </h3>
              <p className="text-gray-600">
                Enter your location, specialty needed, and optionally your insurance
                plan to find matching providers.
              </p>
            </div>

            {/* Step 2 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-600">2</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Check Confidence Scores
              </h3>
              <p className="text-gray-600">
                See our confidence rating for each provider-insurance match, based
                on official data and community verifications.
              </p>
            </div>

            {/* Step 3 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-600">3</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Verify & Contribute
              </h3>
              <p className="text-gray-600">
                After your visit, help others by verifying whether the provider
                accepted your insurance as expected.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Confidence Scores Explained */}
      <section id="confidence" className="py-16 md:py-24 bg-gray-50">
        <div className="container-wide">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-4">
            Understanding Confidence Scores
          </h2>
          <p className="text-xl text-gray-600 text-center max-w-2xl mx-auto mb-4">
            Our scoring system helps you understand how reliable our information is
          </p>
          <p className="text-sm text-gray-500 text-center max-w-2xl mx-auto mb-12">
            Research shows crowdsourced verification achieves <strong>expert-level accuracy</strong> while being
            <strong> 5-150x faster</strong> and <strong>75% cheaper</strong> than traditional methods
          </p>

          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {/* High Confidence */}
              <div className="card border-l-4 border-l-green-500">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">High Confidence</div>
                    <div className="text-sm text-green-600">70-100 Score</div>
                  </div>
                </div>
                <p className="text-gray-600">
                  Verified by official sources or multiple community members. Very reliable.
                </p>
              </div>

              {/* Medium Confidence */}
              <div className="card border-l-4 border-l-yellow-500">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Medium Confidence</div>
                    <div className="text-sm text-yellow-600">40-69 Score</div>
                  </div>
                </div>
                <p className="text-gray-600">
                  Some verification exists, but may be outdated. Consider calling to confirm.
                </p>
              </div>

              {/* Low Confidence */}
              <div className="card border-l-4 border-l-red-500">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Low Confidence</div>
                    <div className="text-sm text-red-600">0-39 Score</div>
                  </div>
                </div>
                <p className="text-gray-600">
                  Limited or no verification. Always call the provider to confirm before visiting.
                </p>
              </div>
            </div>

            {/* Scoring Factors */}
            <div className="card">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">
                How We Calculate Scores
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Data Source (30 points)</h4>
                  <p className="text-gray-600 text-sm">
                    Official CMS data scores highest, followed by insurance carrier data,
                    then community verifications.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Recency (25 points)</h4>
                  <p className="text-gray-600 text-sm">
                    Recent verifications score higher. Research shows 12% annual provider turnover,
                    so fresh data is critical.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Verification Count (25 points)</h4>
                  <p className="text-gray-600 text-sm">
                    Research shows 3 verifications are optimal. More verifications from different users increase confidence in the data.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Agreement (20 points)</h4>
                  <p className="text-gray-600 text-sm">
                    When multiple verifications agree, confidence increases. Conflicting reports lower the score.
                  </p>
                </div>
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
