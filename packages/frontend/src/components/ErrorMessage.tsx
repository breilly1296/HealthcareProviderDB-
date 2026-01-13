'use client';

import { ReactNode } from 'react';

export type ErrorVariant = 'search' | 'network' | 'server' | 'not-found' | 'validation';

interface ErrorMessageProps {
  title?: string;
  message: string;
  variant?: ErrorVariant;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  children?: ReactNode;
}

const variantConfig = {
  search: {
    icon: (
      <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    bgColor: 'bg-gray-100',
    defaultTitle: 'No Results Found',
    defaultMessage: "We couldn't find any providers matching your search. Try adjusting your criteria or expanding your location.",
  },
  network: {
    icon: (
      <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
      </svg>
    ),
    bgColor: 'bg-orange-100',
    defaultTitle: 'Connection Error',
    defaultMessage: 'Unable to connect to the server. Please check your internet connection and try again.',
  },
  server: {
    icon: (
      <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    bgColor: 'bg-red-100',
    defaultTitle: 'Server Error',
    defaultMessage: 'Something went wrong on our end. Please try again in a few moments.',
  },
  'not-found': {
    icon: (
      <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bgColor: 'bg-gray-100',
    defaultTitle: 'Not Found',
    defaultMessage: 'The provider you are looking for could not be found. They may have been removed from our database.',
  },
  validation: {
    icon: (
      <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    bgColor: 'bg-yellow-100',
    defaultTitle: 'Validation Error',
    defaultMessage: 'Please check your input and try again.',
  },
};

export default function ErrorMessage({
  title,
  message,
  variant = 'server',
  action,
  className = '',
  children,
}: ErrorMessageProps) {
  const config = variantConfig[variant];
  const displayTitle = title || config.defaultTitle;
  const displayMessage = message || config.defaultMessage;

  return (
    <div className={`text-center py-12 ${className}`}>
      <div className={`w-16 h-16 ${config.bgColor} rounded-full flex items-center justify-center mx-auto mb-4`}>
        {config.icon}
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{displayTitle}</h2>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">{displayMessage}</p>

      {children}

      {action && (
        <button onClick={action.onClick} className="btn-primary mt-4">
          {action.label}
        </button>
      )}
    </div>
  );
}

// Inline error message for forms
interface InlineErrorProps {
  message: string;
  className?: string;
}

export function InlineError({ message, className = '' }: InlineErrorProps) {
  return (
    <div className={`flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg ${className}`}>
      <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-sm text-red-800 flex-1">{message}</p>
    </div>
  );
}
