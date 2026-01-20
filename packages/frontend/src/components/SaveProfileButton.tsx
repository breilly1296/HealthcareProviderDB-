'use client';

import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

export function SaveProfileButton() {
  const searchParams = useSearchParams();
  
  // Check if there are any search parameters
  const hasParams = Array.from(searchParams.keys()).length > 0;

  if (!hasParams) {
    return null;
  }

  const handleSaveProfile = async () => {
    const currentUrl = window.location.href;

    // Check if Web Share API is available (mobile devices)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Provider Search Profile',
          text: 'Save this link to resume your provider search later',
          url: currentUrl,
        });
      } catch (err) {
        // User cancelled or error occurred
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      // Desktop: Show toast with keyboard shortcut
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const shortcut = isMac ? '⌘ + D' : 'Ctrl + D';
      
      toast(
        `Press ${shortcut} to save this profile. No login required—your data stays on your device.`,
        {
          duration: 5000,
          icon: '🔖',
          style: {
            maxWidth: '500px',
          },
        }
      );
    }
  };

  return (
    <button
      onClick={handleSaveProfile}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
      aria-label="Save search profile"
    >
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
      <span className="hidden sm:inline">Save Profile</span>
      <span className="sm:hidden">Save</span>
    </button>
  );
}
