import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div>
      {/* Header */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-12 md:py-16">
        <div className="container-wide">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Privacy Policy
          </h1>
          <p className="text-lg text-gray-600">
            Last updated: January 2025
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-12 md:py-16">
        <div className="container-wide">
          <div className="max-w-3xl mx-auto">

            {/* Introduction */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Your Privacy Matters
              </h2>
              <p className="text-gray-600 mb-4">
                VerifyMyProvider ("we," "our," or "us") is committed to protecting your privacy.
                This policy explains what information we collect, how we use it, and your rights
                regarding your data.
              </p>
              <p className="text-gray-600 font-medium">
                Key point: We do not collect personal health information. Our service uses public
                data and anonymous verifications.
              </p>
            </div>

            {/* What We Collect */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                1. Information We Collect
              </h2>

              <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">
                Information you provide:
              </h3>
              <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-6">
                <li>
                  <strong>Verification submissions:</strong> When you verify a provider's insurance
                  acceptance, we collect the verification details (provider, insurance plan, acceptance status)
                </li>
                <li>
                  <strong>Optional email:</strong> If you choose to provide an email address with
                  your verification (not required)
                </li>
                <li>
                  <strong>Feedback:</strong> Any feedback or communications you send us
                </li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Information collected automatically:
              </h3>
              <ul className="list-disc pl-6 text-gray-600 space-y-2">
                <li>
                  <strong>IP address:</strong> Used for rate limiting, spam prevention, and security
                </li>
                <li>
                  <strong>Browser/device information:</strong> Browser type, device type, operating system
                </li>
                <li>
                  <strong>Usage data:</strong> Pages visited, search queries, time spent on site
                </li>
                <li>
                  <strong>Cookies:</strong> For analytics and site functionality (see Cookies section below)
                </li>
              </ul>
            </div>

            {/* Insurance Card Scanning */}
            <div className="card mb-8 border-l-4 border-l-blue-500">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                2. Insurance Card Scanning
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                When you use our insurance card scanning feature:
              </p>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2 mb-4">
                <li>
                  <strong>Images are NOT stored:</strong> Card images are processed in memory only
                  and immediately discarded after extraction
                </li>
                <li>
                  <strong>AI processing:</strong> Images are sent to Anthropic's Claude API for text
                  extraction; they do not retain images per their data policy
                </li>
                <li>
                  <strong>Extracted text:</strong> Only the extracted plan information (plan name,
                  network) is returned to your browser; we do not store member IDs or personal details
                </li>
              </ul>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                <strong>Your data stays private:</strong> We never see, store, or have access to your
                insurance card images or member ID numbers after processing.
              </p>
            </div>

            {/* What We Don't Collect */}
            <div className="card mb-8 border-l-4 border-l-green-500">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                3. What We Don't Collect
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                We are committed to minimal data collection. We do <strong className="text-gray-900 dark:text-white">NOT</strong> collect:
              </p>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
                <li>Personal health information (PHI) or medical records</li>
                <li>Insurance card images (processed in memory only, never stored)</li>
                <li>Member IDs or insurance account numbers</li>
                <li>Social Security numbers or government IDs</li>
                <li>Payment or financial information</li>
                <li>Account passwords (we don't have user accounts yet)</li>
                <li>Precise location data beyond IP-based city/region</li>
              </ul>
              <p className="text-gray-600 dark:text-gray-300 mt-4">
                <strong>Note:</strong> VerifyMyProvider is not subject to HIPAA as we do not handle
                protected health information.
              </p>
            </div>

            {/* How We Use Information */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                4. How We Use Your Information
              </h2>
              <p className="text-gray-600 mb-4">
                We use the information we collect to:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2">
                <li>Display and improve provider directory information</li>
                <li>Calculate confidence scores for provider-insurance matches</li>
                <li>Prevent spam, abuse, and fraudulent verifications</li>
                <li>Analyze usage patterns to improve our service</li>
                <li>Respond to your feedback or inquiries</li>
                <li>Comply with legal obligations</li>
              </ul>
            </div>

            {/* Cookies */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                5. Cookies
              </h2>
              <p className="text-gray-600 mb-4">
                We use cookies for:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
                <li>
                  <strong>Analytics:</strong> To understand how visitors use our site (via PostHog)
                </li>
                <li>
                  <strong>Functionality:</strong> To remember your preferences (like search filters)
                </li>
              </ul>
              <p className="text-gray-600">
                We do not use cookies for advertising or tracking across other websites. You can
                disable cookies in your browser settings, though some site features may not work properly.
              </p>
            </div>

            {/* Third Parties */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                6. Third-Party Services
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                We use the following third-party services:
              </p>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white">PostHog (Analytics)</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                    Helps us understand how users interact with our site. Collects anonymized usage data.
                  </p>
                  <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer"
                     className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm">
                    PostHog Privacy Policy →
                  </a>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white">Anthropic Claude (AI Processing)</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                    Used for insurance card text extraction. Images are processed in real-time and not stored.
                    Anthropic does not use data from API calls for training.
                  </p>
                  <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer"
                     className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm">
                    Anthropic Privacy Policy →
                  </a>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white">Google reCAPTCHA (Bot Protection)</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                    Protects our verification forms from spam and abuse. Collects interaction data for risk analysis.
                  </p>
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"
                     className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm">
                    Google Privacy Policy →
                  </a>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white">Google Cloud Platform (Hosting)</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                    Our service is hosted on Google Cloud Run. Google may process server logs.
                  </p>
                  <a href="https://cloud.google.com/privacy" target="_blank" rel="noopener noreferrer"
                     className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm">
                    Google Cloud Privacy →
                  </a>
                </div>
              </div>
            </div>

            {/* Data Retention */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                7. Data Retention
              </h2>
              <p className="text-gray-600 mb-4">
                Verification data is retained indefinitely to maintain the accuracy and history of
                our crowdsourced database. However, we reserve the right to archive or remove stale,
                redundant, or low-quality data to maintain database integrity.
              </p>
              <p className="text-gray-600 mb-4">
                We retain data as follows:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
                <li>
                  <strong>Verifications:</strong> Kept indefinitely to maintain directory accuracy
                  and calculate confidence scores
                </li>
                <li>
                  <strong>Account information:</strong> Retained until you request deletion
                </li>
                <li>
                  <strong>Server logs (IP addresses):</strong> Retained for 90 days for security purposes
                </li>
                <li>
                  <strong>Analytics data:</strong> Aggregated and anonymized; retained per PostHog's policies
                </li>
              </ul>
            </div>

            {/* Your Rights */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                8. Your Rights
              </h2>
              <p className="text-gray-600 mb-4">
                Depending on your location, you may have the right to:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
                <li>Request access to your personal data</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Opt out of analytics tracking</li>
              </ul>
              <p className="text-gray-600">
                To exercise these rights, please contact us at the email below.
              </p>
            </div>

            {/* Security */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                9. Security
              </h2>
              <p className="text-gray-600">
                We implement reasonable security measures to protect your information, including
                HTTPS encryption, rate limiting, and secure cloud hosting. However, no method of
                transmission over the Internet is 100% secure.
              </p>
            </div>

            {/* Children */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                10. Children's Privacy
              </h2>
              <p className="text-gray-600">
                Our service is not directed to children under 13. We do not knowingly collect
                information from children. If you believe a child has provided us with personal
                information, please contact us.
              </p>
            </div>

            {/* Changes */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                11. Changes to This Policy
              </h2>
              <p className="text-gray-600">
                We may update this Privacy Policy from time to time. We'll post the updated policy
                on this page with a new "Last updated" date. Continued use of our service after
                changes constitutes acceptance of the updated policy.
              </p>
            </div>

            {/* Contact */}
            <div className="card mb-8 bg-gray-50 dark:bg-gray-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                12. Contact Us
              </h2>
              <p className="text-gray-600 mb-4">
                For privacy-related questions or to exercise your rights, contact us:
              </p>
              <p className="text-gray-600">
                Email: <a href="mailto:privacy@verifymyprovider.com" className="text-primary-600 hover:text-primary-700">privacy@verifymyprovider.com</a>
              </p>
            </div>

            {/* Back Link */}
            <div className="text-center mt-12">
              <Link href="/" className="btn-outline">
                ← Back to Home
              </Link>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
}
