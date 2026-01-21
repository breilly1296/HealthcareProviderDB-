import InsuranceCardUploader from '@/components/InsuranceCardUploader';
import Link from 'next/link';

export const metadata = {
  title: 'Insurance Card Scanner | ProviderDB',
  description: 'Upload your insurance card to extract plan information and find in-network providers.',
};

export default function InsurancePage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 md:py-12">
      <div className="container-wide">
        {/* Breadcrumb */}
        <nav className="mb-6">
          <ol className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <li>
              <Link href="/" className="hover:text-primary-600 dark:hover:text-primary-400">
                Home
              </Link>
            </li>
            <li>/</li>
            <li className="text-gray-900 dark:text-white font-medium">Insurance Card Scanner</li>
          </ol>
        </nav>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Insurance Card Scanner
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Upload a photo of your insurance card to automatically extract your plan information.
            We&apos;ll use this to help you find in-network providers.
          </p>
        </div>

        {/* Privacy Notice */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200">Privacy Notice</p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Your insurance card image is processed securely and is not stored on our servers.
                  The extracted data is only used during your current session.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Uploader Component */}
        <InsuranceCardUploader />

        {/* Tips */}
        <div className="max-w-2xl mx-auto mt-8">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Tips for Best Results</h2>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Take a clear, well-lit photo of your insurance card
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Include the front of the card (back is optional but helpful for Rx info)
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Make sure all text is legible and not blurry
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Avoid glare and reflections on the card
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
