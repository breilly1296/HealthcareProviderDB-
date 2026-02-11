import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Data Accuracy Disclaimer - VerifyMyProvider',
  description: 'Important information about the accuracy and reliability of crowdsourced healthcare provider data on VerifyMyProvider.',
};

export default function DisclaimerPage() {
  return (
    <div className="dark:bg-gray-900">
      {/* Header */}
      <section className="bg-gradient-to-b from-amber-50 to-white dark:from-amber-900/20 dark:to-gray-900 py-12 md:py-16">
        <div className="container-wide">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
              Data Accuracy Disclaimer
            </h1>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl">
            Important information about the reliability and accuracy of the information on VerifyMyProvider.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-12 md:py-16">
        <div className="container-wide">
          <div className="max-w-3xl mx-auto">

            {/* Key Message */}
            <div className="card mb-8 border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-900/20">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Always Verify Directly
              </h2>
              <p className="text-gray-700 dark:text-gray-300 text-lg">
                <strong>Always call the provider's office to verify they accept your insurance plan before scheduling an appointment.</strong>
              </p>
              <p className="text-gray-600 dark:text-gray-400 mt-3">
                Insurance networks change frequently, and our crowdsourced data may not reflect the most current information.
              </p>
            </div>

            {/* About Our Data */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                How Our Data Works
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                VerifyMyProvider combines two sources of information:
              </p>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                    1. Official NPI Registry Data
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Basic provider information (name, address, specialty) comes from the CMS National Plan
                    and Provider Enumeration System (NPPES), a public government database. This data is updated
                    weekly but may lag behind real-world changes.
                  </p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                    2. Crowdsourced Verifications
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Insurance acceptance information comes from anonymous users who report their experiences.
                    This data is inherently less reliable than official sources because:
                  </p>
                  <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 text-sm mt-2 space-y-1">
                    <li>Anyone can submit a verification (we cannot verify identity)</li>
                    <li>Users may make mistakes or misunderstand their coverage</li>
                    <li>Insurance networks can change after a verification is submitted</li>
                    <li>A provider may accept one plan from an insurer but not another</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* No Guarantee */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                No Guarantee of Accuracy
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                We make <strong>no guarantees</strong> about the accuracy, completeness, or currency of any
                information on VerifyMyProvider. Specifically:
              </p>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 space-y-2">
                <li>A provider may stop accepting an insurance plan at any time</li>
                <li>A provider may accept your insurance but not have availability</li>
                <li>Insurance plan names and networks can be confusing, leading to errors</li>
                <li>Verifications may be outdated (some data may be months or years old)</li>
                <li>We cannot verify the identity or accuracy of user submissions</li>
                <li>Official provider directories from insurers may contain different information</li>
              </ul>
            </div>

            {/* Confidence Scores */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Understanding Confidence Scores
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                We display "confidence scores" to help you understand the reliability of our data.
                However, these scores are estimates based on:
              </p>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 space-y-2 mb-4">
                <li><strong>Number of verifications:</strong> More verifications = higher confidence</li>
                <li><strong>Recency:</strong> Recent verifications are weighted more heavily</li>
                <li><strong>Agreement:</strong> Consistent reports increase confidence</li>
                <li><strong>Source quality:</strong> Some verification methods are weighted higher</li>
              </ul>
              <div className="p-4 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
                <p className="text-amber-800 dark:text-amber-200 text-sm">
                  <strong>Important:</strong> Even high confidence scores (80-100%) do not guarantee accuracy.
                  A confident score means many users have reported the same information - it does not mean
                  the information is currently correct.
                </p>
              </div>
            </div>

            {/* Your Responsibility */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Your Responsibility
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                By using VerifyMyProvider, you acknowledge and agree that:
              </p>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 space-y-2">
                <li>You will verify insurance acceptance directly with the provider before scheduling</li>
                <li>You will not make healthcare decisions based solely on our data</li>
                <li>You assume all risk for decisions made using our service</li>
                <li>VerifyMyProvider is not responsible for surprise medical bills or out-of-network costs</li>
              </ul>
            </div>

            {/* Report Inaccuracies */}
            <div className="card mb-8 bg-primary-50 dark:bg-primary-900/20">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Report Inaccurate Information
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Help improve our data by reporting inaccuracies:
              </p>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 space-y-2 mb-4">
                <li>Submit a new verification with the correct information</li>
                <li>Contact us at <a href="mailto:data@verifymyprovider.com" className="text-primary-600 dark:text-primary-400 hover:underline">data@verifymyprovider.com</a></li>
              </ul>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                We review all reports but cannot guarantee immediate corrections. The crowdsourced nature
                of our data means corrections may take time to be reflected in confidence scores.
              </p>
            </div>

            {/* Not Medical Advice */}
            <div className="card mb-8 border-l-4 border-l-red-500">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Not Medical or Insurance Advice
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                VerifyMyProvider is a directory service only. We do not provide:
              </p>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-400 space-y-2">
                <li>Medical advice, diagnosis, or treatment recommendations</li>
                <li>Insurance advice or recommendations</li>
                <li>Endorsements of any healthcare provider or insurance plan</li>
                <li>Guarantees about provider quality, availability, or outcomes</li>
              </ul>
            </div>

            {/* Legal Reference */}
            <div className="card mb-8 bg-gray-50 dark:bg-gray-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Legal Documents
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                For complete legal terms, please review:
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/terms"
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                >
                  Terms of Service →
                </Link>
                <Link
                  href="/privacy"
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                >
                  Privacy Policy →
                </Link>
              </div>
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
