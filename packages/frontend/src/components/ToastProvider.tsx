'use client';

/**
 * Toast Provider Component
 *
 * This component provides toast notification functionality using react-hot-toast.
 * To use this, you need to install react-hot-toast:
 *
 * npm install react-hot-toast
 *
 * Then wrap your app with this provider in the root layout.
 */

import { Toaster } from 'react-hot-toast';

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      reverseOrder={false}
      gutter={8}
      toastOptions={{
        // Default options for all toasts
        duration: 5000,
        style: {
          background: '#363636',
          color: '#fff',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '14px',
          maxWidth: '400px',
        },
        // Success toast
        success: {
          duration: 4000,
          style: {
            background: '#10B981',
          },
          iconTheme: {
            primary: '#ffffff',
            secondary: '#10B981',
          },
        },
        // Error toast
        error: {
          duration: 6000,
          style: {
            background: '#EF4444',
          },
          iconTheme: {
            primary: '#ffffff',
            secondary: '#EF4444',
          },
        },
        // Loading toast
        loading: {
          style: {
            background: '#3B82F6',
          },
          iconTheme: {
            primary: '#ffffff',
            secondary: '#3B82F6',
          },
        },
      }}
    />
  );
}

/**
 * Toast Helper Functions
 *
 * Usage examples:
 *
 * import { toast } from 'react-hot-toast';
 *
 * // Success
 * toast.success('Verification submitted successfully!');
 *
 * // Error
 * toast.error('Failed to submit verification. Please try again.');
 *
 * // Loading (with promise)
 * const promise = fetch('/api/verifications', {...});
 * toast.promise(promise, {
 *   loading: 'Submitting verification...',
 *   success: 'Verification submitted!',
 *   error: 'Failed to submit verification.',
 * });
 *
 * // Custom toast
 * toast.custom((t) => (
 *   <div className="bg-white shadow-lg rounded-lg p-4">
 *     <h4 className="font-semibold">Custom Toast</h4>
 *     <p className="text-sm text-gray-600">This is a custom message</p>
 *   </div>
 * ));
 */

// Export convenience functions for common use cases
import toast from 'react-hot-toast';

export const showSuccessToast = (message: string) => {
  return toast.success(message);
};

export const showErrorToast = (message: string) => {
  return toast.error(message);
};

export const showLoadingToast = (message: string) => {
  return toast.loading(message);
};
