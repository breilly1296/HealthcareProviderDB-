'use client';

import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

/**
 * Wraps the app in Google reCAPTCHA v3 provider.
 * Gracefully degrades: if NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not set,
 * renders children without the provider (backend will fail-open).
 */
export function ReCaptchaProvider({ children }: { children: React.ReactNode }) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  if (!siteKey) {
    return <>{children}</>;
  }

  return (
    <GoogleReCaptchaProvider reCaptchaKey={siteKey}>
      {children}
    </GoogleReCaptchaProvider>
  );
}
