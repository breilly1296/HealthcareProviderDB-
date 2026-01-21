'use client';

import { useEffect, useRef, useCallback, ReactNode } from 'react';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: () => void;
  onClear: () => void;
  activeFilterCount: number;
  children: ReactNode;
}

export function FilterDrawer({
  isOpen,
  onClose,
  onApply,
  onClear,
  activeFilterCount,
  children,
}: FilterDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  // Focus trap and body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      // Focus the close button when drawer opens
      setTimeout(() => closeButtonRef.current?.focus(), 100);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleKeyDown]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle apply and close
  const handleApply = () => {
    onApply();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-drawer-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-300"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        ref={drawerRef}
        className="
          absolute bottom-0 left-0 right-0
          max-h-[85vh]
          bg-white dark:bg-gray-800
          rounded-t-2xl
          shadow-2xl
          flex flex-col
          transform transition-transform duration-300 ease-out
          animate-slide-up
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="filter-drawer-title"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            Filter Providers
            {activeFilterCount > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                ({activeFilterCount} active)
              </span>
            )}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="
              p-2 -mr-2
              text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300
              hover:bg-gray-100 dark:hover:bg-gray-700
              rounded-lg
              transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
            "
            aria-label="Close filters"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>

        {/* Footer - Sticky with padding for BottomNav */}
        <div className="sticky bottom-0 left-0 right-0 flex gap-3 px-4 pt-4 pb-20 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <button
            type="button"
            onClick={onClear}
            className="
              flex-1
              px-4 py-3
              border border-gray-300 dark:border-gray-600
              text-gray-700 dark:text-gray-300
              hover:bg-gray-100 dark:hover:bg-gray-800
              font-medium
              rounded-lg
              transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
            "
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="
              flex-1
              px-4 py-3
              bg-primary-600 hover:bg-primary-700
              text-white font-medium
              rounded-lg
              transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
              dark:focus-visible:ring-offset-gray-900
            "
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
