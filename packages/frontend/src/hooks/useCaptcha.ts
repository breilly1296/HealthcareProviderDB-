'use client';

import { useCallback } from 'react';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

/**
 * Hook that wraps useGoogleReCaptcha with graceful degradation.
 * Returns executeRecaptcha(action) or undefined if reCAPTCHA is not configured.
 * Callers should pass the token if available, or omit it (backend will fail-open).
 */
export function useCaptcha() {
  const { executeRecaptcha } = useGoogleReCaptcha();

  const getToken = useCallback(
    async (action: string): Promise<string | undefined> => {
      if (!executeRecaptcha) return undefined;
      try {
        return await executeRecaptcha(action);
      } catch {
        return undefined;
      }
    },
    [executeRecaptcha]
  );

  return { getToken };
}
