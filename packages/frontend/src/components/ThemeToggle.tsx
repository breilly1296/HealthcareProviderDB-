'use client';

import { useTheme, ThemeMode } from '@/context/ThemeContext';
import { Sun, Moon, Monitor } from 'lucide-react';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: <Sun className="w-3.5 h-3.5" aria-hidden="true" />,
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: <Moon className="w-3.5 h-3.5" aria-hidden="true" />,
  },
  {
    value: 'system',
    label: 'System',
    icon: <Monitor className="w-3.5 h-3.5" aria-hidden="true" />,
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
