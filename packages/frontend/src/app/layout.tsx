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
import { ReCaptchaProvider } from '@/components/ReCaptchaProvider';
import { CompareBar } from '@/components/compare';
import { GlobalErrorBanner } from '@/components/GlobalErrorBanner';
import { Disclaimer } from '@/components/Disclaimer';
import { CookieConsent } from '@/components/CookieConsent';
import { ThemeToggle } from '@/components/ThemeToggle';

// Script to prevent flash of wrong theme on page load
const themeScript = `
  (function() {
    const stored = localStorage.getItem('verifymyprovider-theme');
    const theme = stored === 'dark' ? 'dark' :
      stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  })();
`;

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://verifymyprovider.com'),
  title: 'VerifyMyProvider - Find Providers Who Accept Your Insurance',
  description: 'Search for healthcare providers and verify insurance acceptance with community-verified data.',
  icons: {
    icon: [
      { url: '/favicon/favicon.ico' },
      { url: '/favicon/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/favicon/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'VerifyMyProvider',
    images: ['/full-logo/logo-full-light-1200w.png'],
  },
  twitter: {
    card: 'summary_large_image',
  },
};

function Footer() {
  return (
    <footer className="bg-stone-200 dark:bg-gray-800 border-t border-stone-300 dark:border-gray-700 mt-auto">
      <div className="container-wide py-8">
        {/* Main footer content - compact */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          {/* Left: Brand + description */}
          <div className="max-w-sm">
            <h3 className="text-lg font-semibold text-stone-800 dark:text-white mb-2">
              VerifyMyProvider
            </h3>
            <p className="text-sm text-stone-600 dark:text-gray-300">
              Community-verified provider and insurance data. A product of{' '}
              <a
                href="https://ownmyhealth.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:underline"
              >
                OwnMyHealth
              </a>.
            </p>
          </div>

          {/* Right: Links in a compact row */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/search" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">Search</Link>
            <Link href="/insurance" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">Scan Card</Link>
            <Link href="/about" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">About</Link>
            <Link href="/research" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">Research</Link>
            <Link href="/terms" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">Terms</Link>
            <Link href="/privacy" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">Privacy</Link>
            <Link href="/disclaimer" className="text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">Disclaimer</Link>
          </div>
        </div>

        {/* Bottom bar: copyright + theme toggle */}
        <div className="border-t border-stone-300 dark:border-gray-700 mt-6 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500 dark:text-gray-400">
          <p>© {new Date().getFullYear()} VerifyMyProvider. All rights reserved.</p>
          <ThemeToggle />
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
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-white focus:text-primary-600 focus:rounded-lg focus:shadow-lg focus:font-medium">
          Skip to main content
        </a>
        <Suspense fallback={null}>
          <PostHogProvider>
            <QueryProvider>
              <ThemeProvider>
                <CompareProvider>
                  <ErrorProvider>
                    <ReCaptchaProvider>
                      <ToastProvider />
                      <GlobalErrorBanner />
                      <Header />
                      <Disclaimer variant="banner" />
                      <main id="main-content" className="flex-1 pb-20 md:pb-0">
                        {children}
                      </main>
                      <Footer />
                      <ScrollToTop />
                      <CompareBar />
                      <CookieConsent />
                      <BottomNav />
                    </ReCaptchaProvider>
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
