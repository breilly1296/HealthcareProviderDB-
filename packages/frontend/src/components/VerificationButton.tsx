'use client';

import { useState, FormEvent, useEffect, useRef, useCallback } from 'react';
import { verificationApi } from '@/lib/api';
import { trackVerificationSubmit } from '@/lib/analytics';

// Email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Form submission timeout (10 seconds)
const SUBMISSION_TIMEOUT_MS = 10000;

interface VerificationButtonProps {
  npi: string;
  providerName: string;
  planId?: string;
  planName?: string;
}

export function VerificationButton({
  npi,
  providerName,
  planId: initialPlanId,
  planName: initialPlanName,
}: VerificationButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'submitting' | 'success' | 'error'>('form');
  const [error, setError] = useState('');

  // Form state
  const [planId, setPlanId] = useState(initialPlanId || '');
  const [planName, setPlanName] = useState(initialPlanName || '');
  const [acceptsInsurance, setAcceptsInsurance] = useState<boolean | null>(null);
  const [acceptsNewPatients, setAcceptsNewPatients] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [email, setEmail] = useState('');

  // Refs for focus trap
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const lastFocusableRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Validate email with regex
  const validateEmail = (emailValue: string): boolean => {
    if (!emailValue.trim()) return true; // Empty is valid (optional field)
    return EMAIL_REGEX.test(emailValue.trim());
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!planId.trim()) {
      setError('Please enter a plan ID');
      return;
    }

    if (acceptsInsurance === null) {
      setError('Please select whether the provider accepts this insurance');
      return;
    }

    // Validate email if provided
    if (email.trim() && !validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setStep('submitting');
    setError('');

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, SUBMISSION_TIMEOUT_MS);

    try {
      await verificationApi.submit({
        npi,
        planId: planId.trim(),
        acceptsInsurance,
        acceptsNewPatients: acceptsNewPatients ?? undefined,
        notes: notes.trim() || undefined,
        submittedBy: email.trim() || undefined,
      });

      clearTimeout(timeoutId);

      // Track successful verification submission
      trackVerificationSubmit({
        npi,
        planId: planId.trim(),
        acceptsInsurance,
      });

      setStep('success');
    } catch (err) {
      clearTimeout(timeoutId);
      setStep('error');

      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. Please check your connection and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to submit verification');
      }
    }
  };

  const handleClose = useCallback(() => {
    setIsOpen(false);
    // Restore focus to the element that opened the modal
    if (previousActiveElement.current instanceof HTMLElement) {
      previousActiveElement.current.focus();
    }
    // Reset form after animation
    setTimeout(() => {
      setStep('form');
      setError('');
      if (!initialPlanId) setPlanId('');
      if (!initialPlanName) setPlanName('');
      setAcceptsInsurance(null);
      setAcceptsNewPatients(null);
      setNotes('');
      setEmail('');
    }, 200);
  }, [initialPlanId, initialPlanName]);

  const handleOpen = () => {
    previousActiveElement.current = document.activeElement;
    setIsOpen(true);
  };

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Focus trap: keep focus within modal
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    // Focus the first focusable element when modal opens
    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // Store refs for tab trapping
    if (firstFocusable instanceof HTMLButtonElement) {
      firstFocusableRef.current = firstFocusable;
    }
    if (lastFocusable instanceof HTMLButtonElement) {
      lastFocusableRef.current = lastFocusable;
    }

    // Focus first element
    firstFocusable?.focus();

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isOpen, step]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      <button
        onClick={handleOpen}
        className="btn-primary"
      >
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Verify Insurance
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="verification-modal-title"
        >
          <div className="flex min-h-full items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 transition-opacity"
              onClick={handleClose}
              aria-hidden="true"
            />

            {/* Modal content */}
            <div
              ref={modalRef}
              className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6"
            >
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                aria-label="Close modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {step === 'form' && (
                <>
                  <h2 id="verification-modal-title" className="text-2xl font-bold text-gray-900 mb-2">
                    Verify Insurance Acceptance
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Help others by sharing your experience with <strong>{providerName}</strong>
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Plan ID */}
                    <div>
                      <label htmlFor="planId" className="label">
                        Insurance Plan ID *
                      </label>
                      <input
                        type="text"
                        id="planId"
                        value={planId}
                        onChange={(e) => setPlanId(e.target.value)}
                        placeholder="e.g., H1234-001"
                        className="input"
                        required
                        disabled={!!initialPlanId}
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        Find this on your insurance card or policy documents
                      </p>
                    </div>

                    {/* Accepts Insurance */}
                    <div>
                      <label className="label">
                        Does this provider accept this insurance? *
                      </label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setAcceptsInsurance(true)}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${
                            acceptsInsurance === true
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <svg className="w-5 h-5 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setAcceptsInsurance(false)}
                          className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${
                            acceptsInsurance === false
                              ? 'border-red-500 bg-red-50 text-red-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <svg className="w-5 h-5 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          No
                        </button>
                      </div>
                    </div>

                    {/* Accepts New Patients */}
                    <div>
                      <label className="label">
                        Accepting new patients?
                      </label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setAcceptsNewPatients(true)}
                          className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-colors ${
                            acceptsNewPatients === true
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setAcceptsNewPatients(false)}
                          className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-colors ${
                            acceptsNewPatients === false
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          No
                        </button>
                        <button
                          type="button"
                          onClick={() => setAcceptsNewPatients(null)}
                          className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-colors ${
                            acceptsNewPatients === null
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          Unsure
                        </button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label htmlFor="notes" className="label">
                        Additional Notes (optional)
                      </label>
                      <textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any details about your experience..."
                        className="input min-h-[80px]"
                        maxLength={500}
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label htmlFor="email" className="label">
                        Your Email (optional)
                      </label>
                      <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="For follow-up if needed"
                        className="input"
                        pattern="[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*"
                      />
                    </div>

                    {error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700" role="alert">
                        {error}
                      </div>
                    )}

                    <button type="submit" className="btn-primary w-full">
                      Submit Verification
                    </button>
                  </form>
                </>
              )}

              {step === 'submitting' && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600 mx-auto mb-4" />
                  <p className="text-gray-600">Submitting your verification...</p>
                </div>
              )}

              {step === 'success' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Thank You!
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Your verification has been submitted and will help others find the right provider.
                  </p>
                  <button onClick={handleClose} className="btn-primary">
                    Close
                  </button>
                </div>
              )}

              {step === 'error' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Submission Failed
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {error || 'Something went wrong. Please try again.'}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={() => setStep('form')} className="btn-primary">
                      Try Again
                    </button>
                    <button onClick={handleClose} className="btn-secondary">
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
