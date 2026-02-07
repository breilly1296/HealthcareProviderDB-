'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from '@/context/ThemeContext';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  const { resolvedTheme } = useTheme();

  return (
    <header className="bg-stone-50/95 dark:bg-gray-900 backdrop-blur-sm border-b border-stone-200 dark:border-gray-700 sticky top-0 z-50 transition-colors duration-200">
      <div className="container-wide">
        <nav className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center">
            <Image
              src={resolvedTheme === 'dark' ? '/nav-logo/logo-nav-dark.svg' : '/nav-logo/logo-nav-light.svg'}
              alt="VerifyMyProvider"
              width={200}
              height={32}
              priority
            />
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/search"
              className="hidden md:inline text-base font-medium text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Find Providers
            </Link>
            <Link
              href="/insurance"
              className="hidden md:inline text-base font-medium text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Scan Card
            </Link>
            <Link
              href="/about"
              className="hidden md:inline text-base font-medium text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              About
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
