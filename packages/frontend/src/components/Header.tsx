'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import { ChevronDown, Bookmark, CreditCard, LogOut } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { UserIcon } from '@/components/icons/Icons';

// M17 (F-09): screen readers announce "current page" when aria-current="page"
// is set on a nav link. `startsWith` (not equals) so nested routes like
// /search?x=1 or /provider/:npi still mark the parent section as current.
function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function Header() {
  const { resolvedTheme } = useTheme();
  const { user, isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();

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
              aria-current={isActivePath(pathname, '/search') ? 'page' : undefined}
              className="hidden md:inline text-base font-medium text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Search
            </Link>
            <Link
              href="/map"
              aria-current={isActivePath(pathname, '/map') ? 'page' : undefined}
              className="hidden md:inline text-base font-medium text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Map
            </Link>
            <Link
              href="/insurance"
              aria-current={isActivePath(pathname, '/insurance') ? 'page' : undefined}
              className="hidden md:inline text-base font-medium text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Scan Card
            </Link>
            <Link
              href="/about"
              aria-current={isActivePath(pathname, '/about') ? 'page' : undefined}
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
  // Roving-tabindex focus tracker for the menu items (-1 when menu is closed
  // or no item has keyboard focus yet).
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Callback refs into a single array — `Link` forwards ref as HTMLAnchorElement
  // and the Sign Out trigger is HTMLButtonElement; the array unifies them as
  // generic HTMLElement focusable nodes for the arrow-key handler.
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
  }, []);

  const closeAndReturnFocus = useCallback(() => {
    closeMenu();
    triggerRef.current?.focus();
  }, [closeMenu]);

  const handleLogout = useCallback(async () => {
    closeMenu();
    await logout();
    toast.success('Signed out', { duration: 2000 });
  }, [logout, closeMenu]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, closeMenu]);

  // Focus the first menuitem when the menu opens (matches WAI-ARIA APG menu
  // pattern). Deferred via rAF so the menu has rendered before we focus.
  useEffect(() => {
    if (!open) return;
    setFocusedIndex(0);
    const id = requestAnimationFrame(() => itemRefs.current[0]?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Global Escape handler — closes menu and returns focus to the trigger so
  // the keyboard user lands back where they started.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAndReturnFocus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, closeAndReturnFocus]);

  // Arrow / Home / End navigation within the menu. Wraps at boundaries.
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter(
      (el): el is HTMLElement => el !== null
    );
    if (items.length === 0) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = (focusedIndex + 1) % items.length;
        setFocusedIndex(next);
        items[next]?.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = (focusedIndex - 1 + items.length) % items.length;
        setFocusedIndex(prev);
        items[prev]?.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        setFocusedIndex(0);
        items[0]?.focus();
        break;
      }
      case 'End': {
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        items[items.length - 1]?.focus();
        break;
      }
    }
  };

  if (isAuthenticated && user) {
    return (
      <>
        {/* Desktop: dropdown menu */}
        <div ref={menuRef} className="hidden md:block relative ml-2 pl-4 border-l border-stone-200 dark:border-gray-700">
          <button
            ref={triggerRef}
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-stone-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            aria-expanded={open}
            aria-haspopup="menu"
            aria-controls="user-account-menu"
          >
            <span className="max-w-[160px] truncate">{user.email}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {open && (
            <div
              id="user-account-menu"
              role="menu"
              aria-orientation="vertical"
              aria-label="Account menu"
              onKeyDown={handleMenuKeyDown}
              className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-stone-200 dark:border-gray-700 py-1 z-50"
            >
              <Link
                ref={(el) => { itemRefs.current[0] = el; }}
                role="menuitem"
                tabIndex={focusedIndex === 0 ? 0 : -1}
                href="/saved-providers"
                onClick={closeMenu}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-700 dark:text-gray-200 hover:bg-stone-50 dark:hover:bg-gray-700 focus:bg-stone-50 dark:focus:bg-gray-700 outline-none transition-colors"
              >
                <Bookmark className="w-4 h-4 text-stone-400 dark:text-gray-500" aria-hidden="true" />
                Saved Providers
              </Link>
              <Link
                ref={(el) => { itemRefs.current[1] = el; }}
                role="menuitem"
                tabIndex={focusedIndex === 1 ? 0 : -1}
                href="/dashboard/insurance"
                onClick={closeMenu}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-700 dark:text-gray-200 hover:bg-stone-50 dark:hover:bg-gray-700 focus:bg-stone-50 dark:focus:bg-gray-700 outline-none transition-colors"
              >
                <CreditCard className="w-4 h-4 text-stone-400 dark:text-gray-500" aria-hidden="true" />
                My Insurance
              </Link>
              <button
                ref={(el) => { itemRefs.current[2] = el; }}
                role="menuitem"
                tabIndex={focusedIndex === 2 ? 0 : -1}
                onClick={handleLogout}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-stone-700 dark:text-gray-200 hover:bg-stone-50 dark:hover:bg-gray-700 focus:bg-stone-50 dark:focus:bg-gray-700 outline-none transition-colors"
              >
                <LogOut className="w-4 h-4 text-stone-400 dark:text-gray-500" aria-hidden="true" />
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
