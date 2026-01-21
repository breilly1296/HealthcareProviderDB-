'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronUpIcon } from './icons/Icons';

export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  // Debounced scroll handler
  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY;
    setIsVisible(scrollY > 300);
  }, []);

  useEffect(() => {
    // Debounce the scroll handler
    let timeoutId: NodeJS.Timeout;
    const debouncedScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleScroll, 10);
    };

    window.addEventListener('scroll', debouncedScroll, { passive: true });

    // Check initial scroll position
    handleScroll();

    return () => {
      window.removeEventListener('scroll', debouncedScroll);
      clearTimeout(timeoutId);
    };
  }, [handleScroll]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className={`
        fixed z-50
        bottom-4 right-4 md:bottom-6 md:right-6
        w-10 h-10 md:w-12 md:h-12
        flex items-center justify-center
        bg-primary-500 hover:bg-primary-600 active:bg-primary-700
        text-white rounded-full
        shadow-lg hover:shadow-xl
        transition-all duration-300 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        ${isVisible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-4 pointer-events-none'
        }
      `}
    >
      <ChevronUpIcon className="w-5 h-5 md:w-6 md:h-6" />
    </button>
  );
}
