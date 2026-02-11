'use client';

import { ReactNode } from 'react';
import { SearchIcon, WarningIcon, InfoIcon } from '@/components/icons';
import { WifiOff } from 'lucide-react';

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
    icon: <SearchIcon className="w-8 h-8 text-gray-600" />,
    bgColor: 'bg-gray-100',
    defaultTitle: 'No Results Found',
    defaultMessage: "We couldn't find any providers matching your search. Try adjusting your criteria or expanding your location.",
  },
  network: {
    icon: <WifiOff className="w-8 h-8 text-orange-600" />,
    bgColor: 'bg-orange-100',
    defaultTitle: 'Connection Error',
    defaultMessage: 'Unable to connect to the server. Please check your internet connection and try again.',
  },
  server: {
    icon: <WarningIcon className="w-8 h-8 text-red-600" />,
    bgColor: 'bg-red-100',
    defaultTitle: 'Server Error',
    defaultMessage: 'Something went wrong on our end. Please try again in a few moments.',
  },
  'not-found': {
    icon: <InfoIcon className="w-8 h-8 text-gray-600" />,
    bgColor: 'bg-gray-100',
    defaultTitle: 'Not Found',
    defaultMessage: 'The provider you are looking for could not be found. They may have been removed from our database.',
  },
  validation: {
    icon: <WarningIcon className="w-8 h-8 text-yellow-600" />,
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
    <div role="alert" className={`text-center py-12 ${className}`}>
      <div className={`w-16 h-16 ${config.bgColor} dark:bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4`}>
        {config.icon}
      </div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{displayTitle}</h2>
      <p className="text-gray-600 dark:text-gray-300 mb-6 max-w-md mx-auto">{displayMessage}</p>

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
    <div role="alert" className={`flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg ${className}`}>
      <InfoIcon className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-800 dark:text-red-200 flex-1">{message}</p>
    </div>
  );
}
