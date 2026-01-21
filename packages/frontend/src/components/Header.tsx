'use client';

import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 transition-colors duration-200">
      <div className="container-wide">
        <nav className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg sm:text-xl font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
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
              className="hidden md:inline text-base font-medium text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Find Providers
            </Link>
            <Link
              href="/insurance"
              className="hidden md:inline text-base font-medium text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Scan Card
            </Link>
            <ThemeToggle />
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
