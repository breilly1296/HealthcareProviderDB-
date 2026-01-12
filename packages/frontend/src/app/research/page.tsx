import Link from 'next/link';

export default function ResearchPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 md:py-24">
        <div className="container-wide text-center">
          <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-primary-200 mb-6">
            <span className="text-2xl">🔬</span>
            <span className="text-sm font-medium text-gray-700">
              Peer-Reviewed Research
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            The Research Behind
            <span className="text-primary-600"> VerifyMyProvider</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Our platform is built on peer-reviewed evidence from leading healthcare
            policy and informatics journals. See the science behind our approach.
          </p>
        </div>
      </section>

      {/* Key Findings Cards */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container-wide">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-4">
            Core Research Findings
          </h2>
          <p className="text-xl text-gray-600 text-center max-w-2xl mx-auto mb-12">
            Three critical studies that shaped our product
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Card 1: Directory Inaccuracy */}
            <div className="card border-t-4 border-t-red-500">
              <div className="mb-6">
                <div className="text-5xl font-bold text-red-600 mb-2">46-77%</div>
                <div className="text-xl font-semibold text-gray-900">
                  Directory Inaccuracy
                </div>
              </div>
              <p className="text-gray-600 mb-4">
                Studies show insurance provider directories are wrong nearly half the time,
                with some plans showing inaccuracy rates as high as 77%. Patients face
                4x more surprise bills when relying on inaccurate directories.
              </p>
              <div className="text-sm text-gray-500 mb-4">
                Haeder, S.F. & Xu, W.Y. (2024)
                <br />
                <em>World Medical & Health Policy</em>
              </div>
              <a
                href="/research/reports/Elicit - Financial Impact of Provider Directory Inaccuracie - Report.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline text-sm"
              >
                Read Study →
              </a>
            </div>

            {/* Card 2: Crowdsourcing Effectiveness */}
            <div className="card border-t-4 border-t-green-500">
              <div className="mb-6">
                <div className="text-5xl font-bold text-green-600 mb-2">κ=0.58</div>
                <div className="text-xl font-semibold text-gray-900">
                  Expert-Level Accuracy
                </div>
              </div>
              <p className="text-gray-600 mb-4">
                Crowdsourced verification achieves expert-level accuracy (κ=0.58 vs 0.59)
                while being 5-150x faster and 75% cheaper. Research shows 3 verifications
                per item is optimal for reliability.
              </p>
              <div className="text-sm text-gray-500 mb-4">
                Mortensen, J. et al. (2015)
                <br />
                <em>Journal of the American Medical Informatics Association</em>
              </div>
              <a
                href="/research/reports/Elicit - Effectiveness of Crowdsourcing in Healthcare Verif - Report.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline text-sm"
              >
                Read Study →
              </a>
            </div>

            {/* Card 3: Financial Impact */}
            <div className="card border-t-4 border-t-yellow-500">
              <div className="mb-6">
                <div className="text-5xl font-bold text-yellow-600 mb-2">540</div>
                <div className="text-xl font-semibold text-gray-900">
                  Days to Fix Errors
                </div>
              </div>
              <p className="text-gray-600 mb-4">
                Directory inaccuracies persist for an average of 540 days—far exceeding
                the 90-day federal requirement. Only 11.6% of errors are corrected
                within 4-9 months of identification.
              </p>
              <div className="text-sm text-gray-500 mb-4">
                Haeder, S.F. & Zhu, J.M. (2024)
                <br />
                <em>Health Affairs Scholar</em>
              </div>
              <a
                href="/research/reports/Elicit - Accuracy of Health Insurance Directories - Report.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline text-sm"
              >
                Read Study →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Why This Matters Section */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="container-wide">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
            Why This Matters
          </h2>

          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              {/* Impact Card 1 */}
              <div className="card">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Financial Harm
                    </h3>
                    <p className="text-gray-600">
                      <strong className="text-gray-900">51%</strong> of patients affected by directory errors
                      report financial problems. Inaccurate directories cause patients to receive
                      <strong className="text-gray-900"> 4x more surprise medical bills</strong> (16% vs 4%).
                    </p>
                  </div>
                </div>
              </div>

              {/* Impact Card 2 */}
              <div className="card">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Delayed Care
                    </h3>
                    <p className="text-gray-600">
                      <strong className="text-gray-900">28%</strong> of patients delay necessary medical care,
                      and <strong className="text-gray-900">10% forgo care entirely</strong> due to confusion
                      from inaccurate provider directories.
                    </p>
                  </div>
                </div>
              </div>

              {/* Impact Card 3 */}
              <div className="card">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Regulatory Failure
                    </h3>
                    <p className="text-gray-600">
                      Federal regulations require directory updates every <strong className="text-gray-900">90 days</strong>,
                      but errors persist for an average of <strong className="text-gray-900">540 days</strong>—
                      6x longer than required.
                    </p>
                  </div>
                </div>
              </div>

              {/* Impact Card 4 */}
              <div className="card">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Network Churn
                    </h3>
                    <p className="text-gray-600">
                      Providers exit insurance networks at a <strong className="text-gray-900">12% annual rate</strong>,
                      with <strong className="text-gray-900">34% leaving over 5 years</strong>. Mental health
                      providers show even higher turnover rates.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Solution Statement */}
            <div className="card bg-primary-50 border-primary-200">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Our Solution
                </h3>
                <p className="text-lg text-gray-700 mb-4">
                  VerifyMyProvider combines <strong>crowdsourced verification</strong> with
                  <strong> research-backed algorithms</strong> to provide real-time, accurate
                  provider directory information—solving what regulation couldn't fix.
                </p>
                <div className="flex flex-wrap justify-center gap-6 mt-6">
                  <div>
                    <div className="text-2xl font-bold text-primary-600">Expert-Level</div>
                    <div className="text-sm text-gray-600">Accuracy (κ=0.58)</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-primary-600">5-150x</div>
                    <div className="text-sm text-gray-600">Faster Updates</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-primary-600">Real-Time</div>
                    <div className="text-sm text-gray-600">vs 540-Day Lag</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Full Citations */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container-wide">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
            Academic Citations
          </h2>

          <div className="max-w-4xl mx-auto">
            <div className="space-y-6">
              {/* Citation 1 */}
              <div className="card">
                <div className="flex items-start gap-4">
                  <div className="text-primary-600 font-bold text-lg flex-shrink-0">[1]</div>
                  <div>
                    <p className="text-gray-700">
                      Haeder, S.F. & Xu, W.Y. (2024). "Consumer Experiences Navigating Health Care
                      Provider Directories." <em>World Medical & Health Policy</em>.
                    </p>
                    <div className="mt-2">
                      <a
                        href="/research/reports/Elicit - Financial Impact of Provider Directory Inaccuracie - Report.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        View PDF →
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Citation 2 */}
              <div className="card">
                <div className="flex items-start gap-4">
                  <div className="text-primary-600 font-bold text-lg flex-shrink-0">[2]</div>
                  <div>
                    <p className="text-gray-700">
                      Haeder, S.F. & Zhu, J.M. (2024). "Inaccuracies in provider directories persist
                      for long periods of time." <em>Health Affairs Scholar</em>, 2(6), qxae079.
                    </p>
                    <div className="mt-2">
                      <a
                        href="/research/reports/qxae079.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        View PDF →
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Citation 3 */}
              <div className="card">
                <div className="flex items-start gap-4">
                  <div className="text-primary-600 font-bold text-lg flex-shrink-0">[3]</div>
                  <div>
                    <p className="text-gray-700">
                      Mortensen, J., Minty, E.P., Januszyk, M., Sweeney, T.E., Agarwal, G.S.,
                      Noy, N.F., & Musen, M.A. (2015). "Using the Wisdom of the Crowds to Find
                      Critical Errors in Biomedical Ontologies: A Study of SNOMED CT."
                      <em> Journal of the American Medical Informatics Association</em>, 22(3), 640-648.
                    </p>
                    <div className="mt-2">
                      <a
                        href="/research/reports/Elicit - Effectiveness of Crowdsourcing in Healthcare Verif - Report.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        View PDF →
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Citation 4 */}
              <div className="card">
                <div className="flex items-start gap-4">
                  <div className="text-primary-600 font-bold text-lg flex-shrink-0">[4]</div>
                  <div>
                    <p className="text-gray-700">
                      Ndumele, C.D., Elliott, M.N., Haviland, A.M., Haas, A., Dembosky, J.W., &
                      Gildner, J.L. (2018). "Network Optimization And The Continuity Of Physicians
                      In Medicaid Managed Care." <em>Health Affairs</em>, 37(6), 929-935.
                    </p>
                    <div className="mt-2">
                      <a
                        href="/research/reports/Elicit - Insurance Network Participation Changes - Report.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        View PDF →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Research Note */}
            <div className="mt-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600">
                <strong className="text-gray-900">Note:</strong> All research studies cited on this page
                are peer-reviewed publications from leading healthcare policy and informatics journals.
                PDF copies are provided for transparency and are subject to copyright by their respective publishers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-primary-600">
        <div className="container-wide text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            See How It Works
          </h2>
          <p className="text-xl text-primary-100 max-w-2xl mx-auto mb-8">
            Discover how we turn peer-reviewed research into practical solutions
            that help you find accurate provider information.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="btn bg-white text-primary-600 hover:bg-gray-100 text-lg px-8 py-4"
            >
              Back to Home
            </Link>
            <Link
              href="/search"
              className="btn bg-primary-700 text-white hover:bg-primary-800 text-lg px-8 py-4"
            >
              Search Providers
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
