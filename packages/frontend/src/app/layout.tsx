import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { Suspense } from 'react';
import './globals.css';
import ToastProvider from '@/components/ToastProvider';
import { PostHogProvider } from '@/components/PostHogProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ScrollToTop } from '@/components/ScrollToTop';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { ThemeProvider } from '@/context/ThemeContext';
import { CompareProvider } from '@/context/CompareContext';
import { ErrorProvider } from '@/context/ErrorContext';
import { CompareBar } from '@/components/compare';
import { GlobalErrorBanner } from '@/components/GlobalErrorBanner';

// Script to prevent flash of wrong theme on page load
const themeScript = `
  (function() {
    const stored = localStorage.getItem('verifymyprovider-theme');
    const theme = stored === 'light' || stored === 'dark' ? stored :
      (stored === 'system' || !stored) && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  })();
`;

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'VerifyMyProvider - Find Providers Who Accept Your Insurance',
  description: 'Search for healthcare providers and verify insurance acceptance with community-verified data.',
};

function Footer() {
  return (
    <footer className="bg-stone-200 dark:bg-gray-800 border-t border-stone-300 dark:border-gray-700 mt-auto">
      <div className="container-wide py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <h3 className="text-lg font-semibold text-stone-800 dark:text-white mb-4">
              VerifyMyProvider
            </h3>
            <p className="text-stone-600 dark:text-gray-300">
              Community-verified provider and insurance information to help you find the right care.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold text-stone-800 dark:text-white mb-4">
              Quick Links
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/search" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
                  Find Providers
                </Link>
              </li>
              <li>
                <Link href="/insurance" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
                  Scan Insurance Card
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/#confidence" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
                  Confidence Scores
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-lg font-semibold text-stone-800 dark:text-white mb-4">
              Legal
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/terms" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* OwnMyHealth */}
          <div>
            <h3 className="text-lg font-semibold text-stone-800 dark:text-white mb-4">
              Part of OwnMyHealth
            </h3>
            <p className="text-stone-600 dark:text-gray-300 mb-4">
              Empowering patients with the information they need to make informed healthcare decisions.
            </p>
            <a
              href="https://ownmyhealth.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
            >
              Visit OwnMyHealth →
            </a>
          </div>
        </div>

        <div className="border-t border-stone-300 dark:border-gray-700 mt-8 pt-8 text-center text-stone-500 dark:text-gray-400">
          <p>© {new Date().getFullYear()} VerifyMyProvider. All rights reserved.</p>
          <p className="mt-2 text-sm">
            Data sourced from CMS NPPES and community verifications.
            Always confirm with providers directly.
          </p>
          <p className="mt-2 text-sm">
            <Link href="/terms" className="hover:text-primary-600 dark:hover:text-primary-400">Terms</Link>
            {' · '}
            <Link href="/privacy" className="hover:text-primary-600 dark:hover:text-primary-400">Privacy</Link>
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.className} flex flex-col min-h-screen bg-stone-100 dark:bg-gray-900 text-stone-800 dark:text-gray-100 transition-colors duration-200`}>
        <Suspense fallback={null}>
          <PostHogProvider>
            <QueryProvider>
              <ThemeProvider>
                <CompareProvider>
                  <ErrorProvider>
                    <ToastProvider />
                    <GlobalErrorBanner />
                    <Header />
                    <main className="flex-1 pb-20 md:pb-0">
                      {children}
                    </main>
                    <Footer />
                    <ScrollToTop />
                    <CompareBar />
                    <BottomNav />
                  </ErrorProvider>
                </CompareProvider>
              </ThemeProvider>
            </QueryProvider>
          </PostHogProvider>
        </Suspense>
      </body>
    </html>
  );
}
