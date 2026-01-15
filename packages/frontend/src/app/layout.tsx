import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { Suspense } from 'react';
import './globals.css';
import ToastProvider from '@/components/ToastProvider';
import { PostHogProvider } from '@/components/PostHogProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'VerifyMyProvider - Find Providers Who Accept Your Insurance',
  description: 'Search for healthcare providers and verify insurance acceptance with community-verified data.',
};

function Header() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="container-wide">
        <nav className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg sm:text-xl font-bold text-primary-600 hover:text-primary-700"
          >
            <svg
              className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <span className="hidden sm:inline">VerifyMyProvider</span>
            <span className="sm:hidden">VMP</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/search"
              className="hidden md:inline text-base font-medium text-gray-600 hover:text-primary-600 transition-colors"
            >
              Find Providers
            </Link>
            <Link
              href="/search"
              className="btn-primary text-sm sm:text-base px-3 py-2 sm:px-4 sm:py-2"
            >
              <span className="hidden sm:inline">Search Now</span>
              <span className="sm:hidden">Search</span>
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="container-wide py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              VerifyMyProvider
            </h3>
            <p className="text-gray-600">
              Community-verified provider and insurance information to help you find the right care.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Quick Links
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/search" className="text-gray-600 hover:text-primary-600">
                  Find Providers
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className="text-gray-600 hover:text-primary-600">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/#confidence" className="text-gray-600 hover:text-primary-600">
                  Confidence Scores
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Legal
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/terms" className="text-gray-600 hover:text-primary-600">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-gray-600 hover:text-primary-600">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* OwnMyHealth */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Part of OwnMyHealth
            </h3>
            <p className="text-gray-600 mb-4">
              Empowering patients with the information they need to make informed healthcare decisions.
            </p>
            <a
              href="https://ownmyhealth.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Visit OwnMyHealth →
            </a>
          </div>
        </div>

        <div className="border-t border-gray-200 mt-8 pt-8 text-center text-gray-500">
          <p>© {new Date().getFullYear()} VerifyMyProvider. All rights reserved.</p>
          <p className="mt-2 text-sm">
            Data sourced from CMS NPPES and community verifications.
            Always confirm with providers directly.
          </p>
          <p className="mt-2 text-sm">
            <Link href="/terms" className="hover:text-primary-600">Terms</Link>
            {' · '}
            <Link href="/privacy" className="hover:text-primary-600">Privacy</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <Suspense fallback={null}>
          <PostHogProvider>
            <ToastProvider />
            <Header />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
          </PostHogProvider>
        </Suspense>
      </body>
    </html>
  );
}
