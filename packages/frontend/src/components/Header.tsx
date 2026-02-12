'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { ChevronDown, Bookmark, CreditCard, LogOut } from 'lucide-react';
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

/** Auth state display — separated to isolate state and callbacks. */
function AuthNav({
  user,
  isAuthenticated,
}: {
  user: { email: string } | null;
  isAuthenticated: boolean;
}) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = useCallback(async () => {
    setOpen(false);
    await logout();
    toast.success('Signed out', { duration: 2000 });
  }, [logout]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (isAuthenticated && user) {
    return (
      <>
        {/* Desktop: dropdown menu */}
        <div ref={menuRef} className="hidden md:block relative ml-2 pl-4 border-l border-stone-200 dark:border-gray-700">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            aria-expanded={open}
            aria-haspopup="true"
          >
            <span className="max-w-[160px] truncate">{user.email}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-stone-200 dark:border-gray-700 py-1 z-50">
              <Link
                href="/saved-providers"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-700 dark:text-gray-200 hover:bg-stone-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Bookmark className="w-4 h-4 text-stone-400 dark:text-gray-500" />
                Saved Providers
              </Link>
              <Link
                href="/dashboard/insurance"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-700 dark:text-gray-200 hover:bg-stone-50 dark:hover:bg-gray-700 transition-colors"
              >
                <CreditCard className="w-4 h-4 text-stone-400 dark:text-gray-500" />
                My Insurance
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-stone-700 dark:text-gray-200 hover:bg-stone-50 dark:hover:bg-gray-700 transition-colors"
              >
                <LogOut className="w-4 h-4 text-stone-400 dark:text-gray-500" />
                Sign Out
              </button>
            </div>
          )}
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
