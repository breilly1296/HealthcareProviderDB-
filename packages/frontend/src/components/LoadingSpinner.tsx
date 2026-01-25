'use client';

export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';
export type SpinnerVariant = 'primary' | 'white' | 'gray';

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  text?: string;
  className?: string;
  fullPage?: boolean;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-3',
  lg: 'h-12 w-12 border-4',
  xl: 'h-16 w-16 border-4',
};

const variantClasses = {
  primary: 'border-primary-200 border-t-primary-600',
  white: 'border-white/30 border-t-white',
  gray: 'border-gray-200 border-t-gray-600',
};

export default function LoadingSpinner({
  size = 'md',
  variant = 'primary',
  text,
  className = '',
  fullPage = false,
}: LoadingSpinnerProps) {
  const spinner = (
    <div className={`inline-flex flex-col items-center justify-center gap-3 ${className}`}>
      <div
        className={`animate-spin rounded-full ${sizeClasses[size]} ${variantClasses[variant]}`}
        role="status"
        aria-label="Loading"
      />
      {text && (
        <p className={`${variant === 'white' ? 'text-white' : 'text-gray-600'} ${size === 'sm' ? 'text-sm' : ''}`}>
          {text}
        </p>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}

// Inline loading state for buttons
interface ButtonSpinnerProps {
  text?: string;
  variant?: 'primary' | 'white';
}

export function ButtonSpinner({ text = 'Loading...', variant = 'white' }: ButtonSpinnerProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <div
        className={`animate-spin rounded-full h-4 w-4 border-2 ${
          variant === 'white' ? 'border-white/30 border-t-white' : 'border-primary-200 border-t-primary-600'
        }`}
      />
      {text}
    </span>
  );
}

// Loading state for sections
interface LoadingSectionProps {
  text?: string;
  className?: string;
}

export function LoadingSection({ text = 'Loading...', className = '' }: LoadingSectionProps) {
  return (
    <div className={`text-center py-12 ${className}`}>
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}

// Loading overlay
interface LoadingOverlayProps {
  text?: string;
  show: boolean;
}

export function LoadingOverlay({ text = 'Loading...', show }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8">
        <LoadingSpinner size="lg" text={text} />
      </div>
    </div>
  );
}
