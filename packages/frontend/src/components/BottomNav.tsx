'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, SearchIcon, CreditCardIcon, InfoIcon } from './icons/Icons';

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  matchPaths?: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    icon: HomeIcon,
    label: 'Home',
    matchPaths: ['/'],
  },
  {
    href: '/search',
    icon: SearchIcon,
    label: 'Search',
    matchPaths: ['/search', '/provider'],
  },
  {
    href: '/insurance',
    icon: CreditCardIcon,
    label: 'Scan Card',
    matchPaths: ['/insurance'],
  },
  {
    href: '/about',
    icon: InfoIcon,
    label: 'About',
    matchPaths: ['/about', '/research'],
  },
];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (item: NavItem): boolean => {
    // Exact match for home
    if (item.href === '/' && pathname === '/') {
      return true;
    }

    // Check if any match paths apply
    if (item.matchPaths) {
      return item.matchPaths.some((path) => {
        if (path === '/') {
          return pathname === '/';
        }
        return pathname.startsWith(path);
      });
    }

    return false;
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.08)] dark:shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.3)] md:hidden z-50 safe-bottom transition-colors duration-200"
      aria-label="Main navigation"
    >
      <div className="flex justify-around items-stretch h-16">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                relative flex flex-col items-center justify-center
                flex-1 min-w-[64px] min-h-[44px]
                transition-all duration-100
                active:scale-95
                focus:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-gray-800
                ${active
                  ? 'text-[#137fec] dark:text-[#38bdf8]'
                  : 'text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-300'
                }
              `}
              aria-current={active ? 'page' : undefined}
            >
              {/* Active indicator bar */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-gradient-to-r from-[#137fec] to-[#06b6d4]"
                />
              )}
              <Icon className="w-6 h-6" aria-hidden="true" />
              <span className={`text-[11px] mt-1 ${active ? 'font-semibold' : 'font-medium'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
