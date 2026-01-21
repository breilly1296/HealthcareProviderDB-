import Link from 'next/link';

export default function TermsOfServicePage() {
  return (
    <div>
      {/* Header */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-12 md:py-16">
        <div className="container-wide">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Terms of Service
          </h1>
          <p className="text-lg text-gray-600">
            Last updated: January 2025
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-12 md:py-16">
        <div className="container-wide">
          <div className="max-w-3xl mx-auto prose prose-lg">

            {/* Introduction */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Welcome to VerifyMyProvider
              </h2>
              <p className="text-gray-600">
                VerifyMyProvider ("we," "our," or "us") provides a healthcare provider directory
                service that combines public data with crowdsourced verifications. By using our
                website and services, you agree to these Terms of Service.
              </p>
            </div>

            {/* Service Description */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                1. Our Service
              </h2>
              <p className="text-gray-600 mb-4">
                VerifyMyProvider is a directory that helps users find healthcare providers and
                verify insurance acceptance information. Our data comes from:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2">
                <li>
                  <strong>Public NPI data</strong> from the Centers for Medicare & Medicaid
                  Services (CMS) National Plan and Provider Enumeration System (NPPES)
                </li>
                <li>
                  <strong>User-submitted verifications</strong> from people who have visited
                  providers and can confirm insurance acceptance
                </li>
              </ul>
            </div>

            {/* Data Accuracy Disclaimer */}
            <div className="card mb-8 border-l-4 border-l-yellow-500">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                2. Data Accuracy Disclaimer
              </h2>
              <p className="text-gray-600 mb-4">
                <strong className="text-gray-900">Important:</strong> While we strive to provide
                accurate information, provider details and insurance acceptance can change frequently.
                Our data is crowdsourced and may not always be current.
              </p>
              <p className="text-gray-600 font-medium">
                Always verify insurance acceptance directly with the provider's office before
                scheduling an appointment.
              </p>
            </div>

            {/* No Medical Advice */}
            <div className="card mb-8 border-l-4 border-l-red-500">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                3. No Medical Advice
              </h2>
              <p className="text-gray-600 mb-4">
                VerifyMyProvider is a directory service only. We do not provide:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
                <li>Medical advice, diagnosis, or treatment recommendations</li>
                <li>Endorsements of any healthcare provider</li>
                <li>Guarantees about provider quality or availability</li>
              </ul>
              <p className="text-gray-600">
                Always consult with qualified healthcare professionals for medical decisions.
              </p>
            </div>

            {/* User-Generated Content */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                4. User-Generated Content
              </h2>
              <p className="text-gray-600 mb-4">
                When you submit verifications or other content to our platform, you agree to:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
                <li>Provide truthful and accurate information based on your actual experience</li>
                <li>Not submit false, misleading, or spam content</li>
                <li>Not impersonate others or misrepresent your experience</li>
                <li>Grant us a license to display and use your submissions to improve our service</li>
              </ul>
              <p className="text-gray-600">
                We reserve the right to remove any content that violates these terms or appears
                to be spam, abusive, or inaccurate.
              </p>
            </div>

            {/* Limitation of Liability */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                5. Limitation of Liability
              </h2>
              <p className="text-gray-600 mb-4">
                VerifyMyProvider is provided "as is" without warranties of any kind. We are not
                liable for:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
                <li>Inaccurate, incomplete, or outdated provider information</li>
                <li>Decisions you make based on information from our service</li>
                <li>Financial losses, including surprise medical bills</li>
                <li>Any damages arising from use of our service</li>
              </ul>
              <p className="text-gray-600">
                Your use of VerifyMyProvider is at your own risk.
              </p>
            </div>

            {/* Right to Remove/Modify */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                6. Content Moderation
              </h2>
              <p className="text-gray-600 mb-4">
                We reserve the right to:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2">
                <li>Remove or modify any user-submitted content at our discretion</li>
                <li>Block users who violate our terms or submit spam/abusive content</li>
                <li>Implement rate limits to prevent abuse of our service</li>
                <li>Modify or discontinue any aspect of our service at any time</li>
              </ul>
            </div>

            {/* Data Attribution */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                7. Data Sources & Attribution
              </h2>
              <p className="text-gray-600 mb-4">
                Provider information is sourced from the CMS National Plan and Provider Enumeration
                System (NPPES), a public database maintained by the U.S. government. This data is
                supplemented by crowdsourced verifications from our users.
              </p>
              <p className="text-gray-600">
                CMS NPPES data is public domain. User-submitted verifications remain the property
                of VerifyMyProvider.
              </p>
            </div>

            {/* Changes to Terms */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                8. Changes to These Terms
              </h2>
              <p className="text-gray-600">
                We may update these Terms of Service from time to time. Continued use of our
                service after changes constitutes acceptance of the new terms. We encourage you
                to review this page periodically.
              </p>
            </div>

            {/* Governing Law */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                9. Governing Law
              </h2>
              <p className="text-gray-600">
                These Terms of Service and any disputes arising from your use of VerifyMyProvider
                shall be governed by and construed in accordance with the laws of the State of
                Delaware, without regard to its conflict of law provisions. You agree to submit
                to the personal and exclusive jurisdiction of the courts located in Delaware for
                the resolution of any disputes.
              </p>
            </div>

            {/* Contact */}
            <div className="card mb-8 bg-gray-50">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                10. Contact Us
              </h2>
              <p className="text-gray-600 mb-4">
                If you have questions about these Terms of Service, please contact us:
              </p>
              <p className="text-gray-600">
                Email: <a href="mailto:legal@verifymyprovider.com" className="text-primary-600 hover:text-primary-700">legal@verifymyprovider.com</a>
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
