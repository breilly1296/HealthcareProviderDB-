'use client';

import { useTheme, ThemeMode } from '@/context/ThemeContext';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
    ),
  },
  {
    value: 'system',
    label: 'System',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
  },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-md"
      role="radiogroup"
      aria-label="Theme settings"
    >
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => setTheme(option.value)}
          className={`
            flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
            transition-colors duration-150
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1
            dark:focus-visible:ring-offset-gray-900
            ${
              theme === option.value
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
          role="radio"
          aria-checked={theme === option.value}
          aria-pressed={theme === option.value}
          aria-label={`${option.label} theme`}
        >
          {option.icon}
          <span className="hidden sm:inline">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
