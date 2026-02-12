'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { UserIcon } from '@/components/icons/Icons';

export function Header() {
  const { resolvedTheme } = useTheme();
  const { user, isAuthenticated, isLoading } = useAuth();

  return (
    <header className="bg-stone-50/95 dark:bg-gray-900 backdrop-blur-sm border-b border-stone-200 dark:border-gray-700 sticky top-0 z-50 transition-colors duration-200">
      <div className="container-wide">
        <nav aria-label="Primary" className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center">
            <Image
              src={resolvedTheme === 'dark' ? '/nav-logo/logo-nav-dark.svg' : '/nav-logo/logo-nav-light.svg'}
              alt="VerifyMyProvider"
              width={260}
              height={44}
              className="h-8 w-auto"
              priority
            />
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/search"
              className="hidden md:inline text-base font-medium text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Search
            </Link>
            <Link
              href="/map"
              className="hidden md:inline text-base font-medium text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Map
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

            {!isLoading && (
              <AuthNav user={user} isAuthenticated={isAuthenticated} />
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

/** Auth state display — separated to isolate the logout callback. */
function AuthNav({
  user,
  isAuthenticated,
}: {
  user: { email: string } | null;
  isAuthenticated: boolean;
}) {
  const { logout } = useAuth();

  const handleLogout = useCallback(async () => {
    await logout();
    toast.success('Signed out', { duration: 2000 });
  }, [logout]);

  if (isAuthenticated && user) {
    return (
      <>
        {/* Desktop: email · Sign Out */}
        <div className="hidden md:flex items-center gap-3 ml-2 pl-4 border-l border-stone-200 dark:border-gray-700">
          <span className="text-sm text-stone-500 dark:text-gray-400 max-w-[160px] truncate">
            {user.email}
          </span>
          <span className="text-stone-300 dark:text-gray-600" aria-hidden="true">&middot;</span>
          <button
            onClick={handleLogout}
            className="text-sm font-medium text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors whitespace-nowrap"
          >
            Sign Out
          </button>
        </div>

        {/* Mobile: user icon → saved providers */}
        <Link
          href="/saved-providers"
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-primary-600 dark:text-primary-400 hover:bg-stone-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Saved providers"
        >
          <UserIcon className="w-6 h-6" />
        </Link>
      </>
    );
  }

  return (
    <>
      {/* Desktop: Sign In link */}
      <Link
        href="/login"
        className="hidden md:inline text-base font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors ml-2 pl-4 border-l border-stone-200 dark:border-gray-700"
      >
        Sign In
      </Link>

      {/* Mobile: user icon → login */}
      <Link
        href="/login"
        className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-stone-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-stone-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Sign in"
      >
        <UserIcon className="w-6 h-6" />
      </Link>
    </>
  );
}
