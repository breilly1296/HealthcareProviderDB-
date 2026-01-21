'use client';

import { useFontSize, FontSize } from '@/context/FontSizeContext';

interface FontSizeOption {
  value: FontSize;
  label: string;
  ariaLabel: string;
  textSize: string;
}

const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  {
    value: 'normal',
    label: 'A',
    ariaLabel: 'Set normal text size',
    textSize: 'text-sm',
  },
  {
    value: 'large',
    label: 'A',
    ariaLabel: 'Set large text size',
    textSize: 'text-base',
  },
  {
    value: 'xl',
    label: 'A',
    ariaLabel: 'Set extra large text size',
    textSize: 'text-lg',
  },
];

interface FontSizeToggleProps {
  className?: string;
}

export function FontSizeToggle({ className = '' }: FontSizeToggleProps) {
  const { fontSize, setFontSize, isHydrated } = useFontSize();

  // Don't render anything meaningful until hydrated to prevent flash
  if (!isHydrated) {
    return (
      <div className={`flex items-center gap-0.5 ${className}`} aria-hidden="true">
        {FONT_SIZE_OPTIONS.map((option) => (
          <div
            key={option.value}
            className="w-8 h-8 rounded bg-gray-100"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center ${className}`}
      role="group"
      aria-label="Text size controls"
    >
      {FONT_SIZE_OPTIONS.map((option) => {
        const isActive = fontSize === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setFontSize(option.value)}
            aria-label={option.ariaLabel}
            aria-pressed={isActive}
            title={option.ariaLabel.replace('Set ', '').replace(' text size', '')}
            className={`
              relative
              w-8 h-8
              flex items-center justify-center
              font-semibold
              transition-colors duration-150
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1
              ${option.textSize}
              ${isActive
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
              ${option.value === 'normal' ? 'rounded-l-md' : ''}
              ${option.value === 'xl' ? 'rounded-r-md' : ''}
            `}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Compact version for mobile menu
export function FontSizeToggleCompact({ className = '' }: FontSizeToggleProps) {
  const { fontSize, setFontSize, isHydrated } = useFontSize();

  if (!isHydrated) {
    return null;
  }

  return (
    <div className={`${className}`}>
      <p className="text-sm font-medium text-gray-700 mb-2">Text Size</p>
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Text size controls"
      >
        {FONT_SIZE_OPTIONS.map((option) => {
          const isActive = fontSize === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setFontSize(option.value)}
              aria-label={option.ariaLabel}
              aria-pressed={isActive}
              className={`
                flex-1
                py-2 px-3
                text-center
                font-semibold
                rounded-md
                transition-colors duration-150
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                ${option.textSize}
                ${isActive
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
