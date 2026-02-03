import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About VerifyMyProvider - Our Mission & Team',
  description: 'Learn about VerifyMyProvider\'s mission to create accurate, community-verified provider directories and help patients find care.',
};

export default function AboutPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white dark:from-primary-900/20 dark:to-gray-900 py-12 md:py-16">
        <div className="container-wide">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            About VerifyMyProvider
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Building a better way to find healthcare providers who accept your insurance
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-12 md:py-16">
        <div className="container-wide">
          <div className="max-w-3xl mx-auto">

            {/* The Problem */}
            <div className="card mb-8 border-l-4 border-l-red-500">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                The Problem We're Solving
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Finding a healthcare provider who accepts your insurance shouldn't be this hard. But today's reality is frustrating:
              </p>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2">
                <li>
                  <strong>Outdated directories:</strong> Insurance company provider directories are often months or years out of date, listing providers who no longer accept that insurance or have moved practices.
                </li>
                <li>
                  <strong>Surprise bills:</strong> You think you're seeing an in-network provider, only to receive a surprise bill months later because the directory was wrong.
                </li>
                <li>
                  <strong>Wasted time:</strong> Calling dozens of offices, being put on hold, only to find out they're not accepting new patients or don't actually accept your plan.
                </li>
                <li>
                  <strong>No verification:</strong> There's no way to know if the information is current or accurate until you show up for your appointment.
                </li>
              </ul>
            </div>

            {/* What We're Building */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                What We're Building
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                VerifyMyProvider is a <strong>community-verified provider directory</strong> that helps you find accurate, up-to-date information about which providers accept your insurance.
              </p>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">
                Our Features:
              </h3>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2 mb-6">
                <li>
                  <strong>Search & Find:</strong> Search for providers by specialty, location, and insurance plan
                </li>
                <li>
                  <strong>Community Verification:</strong> Anyone can verify whether a provider accepts an insurance plan, creating a crowdsourced database
                </li>
                <li>
                  <strong>Confidence Scores:</strong> See how confident we are in the data based on verification volume, recency, and consistency
                </li>
                <li>
                  <strong>Insurance Card Scanner:</strong> Scan your insurance card to automatically identify your plan
                </li>
              </ul>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                Current Status:
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                We're launching in <strong>New York City</strong> with a focus on specialties where finding providers is most challenging (psychiatry, endocrinology, and more). Our initial database includes thousands of providers sourced from the CMS National Provider Identifier (NPI) Registry.
              </p>

              <p className="text-gray-600 dark:text-gray-300">
                <strong>The Vision:</strong> A nationwide, always-current provider directory maintained by the people who use it—patients like you.
              </p>
            </div>

            {/* The Team */}
            <div className="card mb-8 bg-primary-50 dark:bg-primary-900/20">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                The Team
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Brian Reilly, Founder
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-3">
                    Brian is a healthcare entrepreneur and software engineer who has experienced firsthand the frustration of outdated provider directories. After spending weeks trying to find an endocrinologist who actually accepted his insurance—calling dozens of offices listed in his insurance company's directory only to find they'd stopped accepting that plan months ago—he decided to build a better solution.
                  </p>
                  <p className="text-gray-600 dark:text-gray-300">
                    VerifyMyProvider is part of <a href="https://ownmyhealth.com" target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium">OwnMyHealth</a>, Brian's mission to empower patients with transparent, accurate healthcare information.
                  </p>
                </div>
              </div>
            </div>

            {/* How It Works */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                How It Works
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Our approach combines public data with community verification to create the most accurate provider directory possible:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-2xl font-bold text-primary-600 dark:text-primary-400 mb-2">1</div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Source NPI Data</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    We start with official data from the CMS National Provider Identifier Registry—a comprehensive database of all healthcare providers in the U.S.
                  </p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-2xl font-bold text-primary-600 dark:text-primary-400 mb-2">2</div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Insurance Verification</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    Community members verify which insurance plans each provider accepts. Each verification includes the date, plan, and acceptance status.
                  </p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-2xl font-bold text-primary-600 dark:text-primary-400 mb-2">3</div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Search & Find</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    Search for providers by specialty, location, and insurance. See confidence scores based on verification recency and consistency.
                  </p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-2xl font-bold text-primary-600 dark:text-primary-400 mb-2">4</div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Community Updates</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    As verifications come in, our data stays current. The more people use and verify, the more accurate the directory becomes.
                  </p>
                </div>
              </div>
            </div>

            {/* Technology */}
            <div className="card mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Technology & Data
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                VerifyMyProvider is built with privacy and accuracy in mind:
              </p>
              <ul className="list-disc pl-6 text-gray-600 dark:text-gray-300 space-y-2 mb-4">
                <li>
                  <strong>Hosted on Google Cloud Platform:</strong> Secure, reliable infrastructure
                </li>
                <li>
                  <strong>Data from CMS NPI Registry:</strong> Official provider data updated monthly
                </li>
                <li>
                  <strong>No PHI stored:</strong> We never collect or store protected health information
                </li>
                <li>
                  <strong>No account required:</strong> Search and verify without creating an account
                </li>
                <li>
                  <strong>Open verification:</strong> Anyone can contribute to keep data current
                </li>
              </ul>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                For more details, see our <Link href="/privacy" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">Privacy Policy</Link>.
              </p>
            </div>

            {/* Contact */}
            <div className="card mb-8 bg-gray-50 dark:bg-gray-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Get in Touch
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                We'd love to hear from you! Whether you have feedback, questions, or ideas for how to make VerifyMyProvider better, reach out:
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                Email: <a href="mailto:breilly@ownmyhealth.io" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium">breilly@ownmyhealth.io</a>
              </p>
            </div>

            {/* Disclaimer */}
            <div className="card mb-8 border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-900/20">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Important Reminder
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-3">
                VerifyMyProvider is a <strong>crowdsourced directory</strong>. While we work hard to ensure accuracy, information can change. <strong>Always verify insurance acceptance directly with the provider's office</strong> before scheduling an appointment.
              </p>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Provider data is sourced from the CMS National Provider Identifier (NPI) Registry. Insurance acceptance data is community-verified and may not reflect recent changes.
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
