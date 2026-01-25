'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import { AppError, toAppError, getUserMessage, getErrorVariant, ErrorVariant } from '@/lib/errorUtils';

interface ErrorContextValue {
  // Current global error (if any)
  error: AppError | null;

  // Error variant for styling
  errorVariant: ErrorVariant | null;

  // User-friendly error message
  errorMessage: string | null;

  // Set a global error (shows in UI)
  setError: (error: unknown) => void;

  // Clear the current error
  clearError: () => void;

  // Show a temporary error toast/notification
  showErrorToast: (error: unknown, duration?: number) => void;

  // Track if there's an active error
  hasError: boolean;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [error, setErrorState] = useState<AppError | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear any pending timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const setError = useCallback((err: unknown) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const appError = toAppError(err);
    setErrorState(appError);
  }, []);

  const clearError = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setErrorState(null);
  }, []);

  const showErrorToast = useCallback((err: unknown, duration = 5000) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const appError = toAppError(err);
    setErrorState(appError);

    if (duration > 0) {
      timeoutRef.current = setTimeout(() => {
        setErrorState(null);
        timeoutRef.current = null;
      }, duration);
    }
  }, []);

  const errorVariant = error ? getErrorVariant(error) : null;
  const errorMessage = error ? getUserMessage(error) : null;

  return (
    <ErrorContext.Provider
      value={{
        error,
        errorVariant,
        errorMessage,
        setError,
        clearError,
        showErrorToast,
        hasError: error !== null,
      }}
    >
      {children}
    </ErrorContext.Provider>
  );
}

export function useError() {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
}
