import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | VerifyMyProvider',
  description: 'How VerifyMyProvider collects, uses, and protects your personal information.',
};

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
            Last updated: February 2026
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
                  <strong>IP address:</strong> Used by our server for rate limiting, spam prevention,
                  and security only. Not sent to analytics.
                </li>
                <li>
                  <strong>Browser/device information:</strong> Browser type, device type, operating system
                  (collected by PostHog analytics if you consent)
                </li>
                <li>
                  <strong>Usage patterns:</strong> Which pages you visit, whether you used search
                  filters (but not what you searched for). See the Analytics section below for details.
                </li>
                <li>
                  <strong>Local storage:</strong> Your theme preference, recent searches, and analytics
                  consent choice are stored in your browser only (see Cookies &amp; Local Storage below)
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
                <li>Account passwords (we don&apos;t have user accounts yet)</li>
                <li>Precise location data beyond IP-based city/region</li>
              </ul>
              <p className="text-gray-600 dark:text-gray-300 mt-4">
                Our analytics also do <strong className="text-gray-900 dark:text-white">NOT</strong> collect:
                provider names, NPI numbers, insurance plan details, your actual search
                terms, or IP addresses. See the Analytics section below.
              </p>
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

            {/* Analytics */}
            <div className="card mb-8 border-l-4 border-l-indigo-500">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                5. Analytics
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                We use <strong>PostHog</strong> for privacy-preserving analytics to understand how people
                use the site and where we can improve. Analytics only run if you accept the consent
                banner that appears on your first visit.
              </p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">
                What we track:
              </h3>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2 mb-4">
                <li>
                  <strong>Page views</strong> — which pages are visited (sensitive URL parameters like
                  NPI numbers are stripped before sending)
                </li>
                <li>
                  <strong>Search events</strong> — only whether filters were used (e.g., &quot;had a state
                  filter&quot;), never the actual filter values
                </li>
                <li>
                  <strong>Verification submissions</strong> — only that a verification occurred, with no
                  details about the provider, plan, or result
                </li>
                <li>
                  <strong>Vote events</strong> — only the direction (up or down), not which verification
                  was voted on
                </li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">
                What we do NOT send to analytics:
              </h3>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2 mb-4">
                <li>Provider names or NPI numbers</li>
                <li>Insurance plan names or IDs</li>
                <li>Your search terms (state, city, specialty, etc.)</li>
                <li>IP addresses</li>
                <li>Personal health information of any kind</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">
                Technical safeguards:
              </h3>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
                <li>
                  <strong>Autocapture is disabled</strong> — we only track the specific events listed
                  above, not every click or form interaction
                </li>
                <li>
                  <strong>Session recording is disabled</strong> — we never record your screen or
                  keystrokes
                </li>
                <li>
                  <strong>Opt-out by default</strong> — analytics are off until you explicitly accept
                  the consent banner
                </li>
                <li>
                  <strong>No advertising</strong> — analytics data is never shared with third parties
                  for advertising purposes
                </li>
              </ul>
            </div>

            {/* Cookies & Local Storage */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                6. Cookies &amp; Local Storage
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                We primarily use your browser&apos;s local storage (not traditional cookies) to remember
                your preferences. Here&apos;s exactly what we store:
              </p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">
                Local storage (stays in your browser):
              </h3>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2 mb-4">
                <li><strong>Theme preference</strong> — your light/dark mode choice</li>
                <li><strong>Recent searches</strong> — your last few search filters for quick access</li>
                <li><strong>Analytics consent</strong> — whether you accepted or declined analytics</li>
                <li><strong>Disclaimer dismissal</strong> — that you&apos;ve seen the site disclaimer</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">
                Session storage (cleared when you close the tab):
              </h3>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2 mb-4">
                <li><strong>Comparison selections</strong> — providers you&apos;ve selected to compare</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">
                PostHog cookie:
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                If you accept analytics, PostHog stores a small identifier in local storage to
                recognize you as the same anonymous visitor across page loads. This is not used for
                advertising or cross-site tracking. If you decline analytics, this identifier is
                never created.
              </p>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  <strong>To withdraw analytics consent:</strong> Click the consent banner if it
                  appears, or clear your browser&apos;s local storage for this site. You can also
                  clear site data in your browser&apos;s settings under &quot;Privacy&quot; or
                  &quot;Site Settings.&quot;
                </p>
              </div>
            </div>

            {/* Third Parties */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                7. Third-Party Services
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
                8. Data Retention
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
                9. Your Rights
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                You are in control of your data. Here&apos;s what you can do:
              </p>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2 mb-4">
                <li>
                  <strong>Opt out of analytics at any time</strong> — decline the consent banner, or
                  clear your browser&apos;s local storage for this site to reset your choice
                </li>
                <li>
                  <strong>No account required</strong> — you can use the entire service without
                  creating an account or providing any personal information
                </li>
                <li>
                  <strong>Request access or deletion</strong> — if you&apos;ve submitted verifications
                  and want to review or remove them, contact us
                </li>
                <li>
                  <strong>We do not sell personal data</strong> — your information is never sold to
                  third parties, period
                </li>
              </ul>
              <p className="text-gray-600 dark:text-gray-300">
                For any data requests, contact us at{' '}
                <a href="mailto:breilly@ownmyhealth.io"
                   className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">
                  breilly@ownmyhealth.io
                </a>.
              </p>
            </div>

            {/* Security */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                10. Security
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
                11. Children&apos;s Privacy
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
                12. Changes to This Policy
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
                13. Contact Us
              </h2>
              <p className="text-gray-600 mb-4">
                For privacy-related questions or to exercise your rights, contact us:
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                Email:{' '}
                <a href="mailto:breilly@ownmyhealth.io"
                   className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">
                  breilly@ownmyhealth.io
                </a>
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
