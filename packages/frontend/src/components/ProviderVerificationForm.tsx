'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Verification Form - Research-Backed Simplicity
 *
 * Based on Mortensen et al. (2015), JAMIA:
 * - Simple binary yes/no/not-sure questions achieve highest accuracy
 * - One question per screen reduces cognitive load
 * - Under 2 minutes total completion time
 * - 3 verifications achieve expert-level accuracy (κ=0.58)
 *
 * Key Design Principles:
 * - Binary choices only (no rating scales, no text fields)
 * - Immediate progress feedback
 * - Research context throughout
 * - Mobile-optimized touch targets
 */

interface VerificationFormProps {
  providerNpi: string;
  providerName: string;
  planId: string;
  planName: string;
  providerPhone: string | null;
  existingVerificationCount?: number;
  onComplete?: () => void;
}

type Step =
  | 'intro'
  | 'accepts-insurance-general'
  | 'contacted-provider'
  | 'phone-accuracy'
  | 'accepts-specific-plan'
  | 'success'
  | 'thank-you-not-sure'
  | 'thank-you-cash-only';

interface FormData {
  acceptsInsuranceGeneral: boolean | null; // Does provider accept insurance at all?
  contactedProvider: boolean | null; // Did user contact them?
  phoneAccurate: boolean | null; // Is phone number correct?
  acceptsSpecificPlan: 'YES' | 'NO' | 'NOT_ACCEPTING_NEW' | 'NOT_SURE' | null;
}

export default function ProviderVerificationForm({
  providerNpi,
  providerName,
  planId,
  planName,
  providerPhone,
  existingVerificationCount = 0,
  onComplete,
}: VerificationFormProps) {
  const [currentStep, setCurrentStep] = useState<Step>('intro');
  const [formData, setFormData] = useState<FormData>({
    acceptsInsuranceGeneral: null,
    contactedProvider: null,
    phoneAccurate: null,
    acceptsSpecificPlan: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  const totalSteps = 4; // Main verification questions
  const stepNumbers: Record<string, number> = {
    'accepts-insurance-general': 1,
    'contacted-provider': 2,
    'phone-accuracy': 3,
    'accepts-specific-plan': 4,
  };
  const currentStepNumber = stepNumbers[currentStep] || 0;

  const newVerificationTotal = existingVerificationCount + 1;
  const verificationsNeeded = Math.max(0, 3 - newVerificationTotal);

  // === P0 FIX: Type-safe answer handler ===
  const handleAnswer = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ): void => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = (step: Step) => {
    setCurrentStep(step);
  };

  const handleSubmit = async (skipVerification = false) => {
    setIsSubmitting(true);

    try {
      if (skipVerification) {
        // Don't submit verification, just show thank you
        setCurrentStep(currentStep);
        return;
      }

      const response = await fetch('/api/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npi: providerNpi,
          planId: planId,
          phoneReached: formData.contactedProvider,
          phoneCorrect: formData.phoneAccurate,
          acceptsInsurance: formData.acceptsSpecificPlan === 'YES',
          acceptsNewPatients: formData.acceptsSpecificPlan !== 'NOT_ACCEPTING_NEW',
          scheduledAppointment: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Verification submission failed');
      }

      setCurrentStep('success');
    } catch (error) {
      console.error('Error submitting verification:', error);
      alert('Failed to submit verification. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Research tooltip component
  const Tooltip = ({ id, children }: { id: string; children: React.ReactNode }) => (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(id)}
        onMouseLeave={() => setShowTooltip(null)}
        onClick={() => setShowTooltip(showTooltip === id ? null : id)}
        className="ml-2 text-primary-600 hover:text-primary-700 focus:outline-none"
        aria-label="More information"
      >
        <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
      {showTooltip === id && (
        <div className="absolute z-10 w-64 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg -top-2 left-8">
          {children}
          <div className="absolute top-3 -left-1 w-2 h-2 bg-gray-900 transform rotate-45"></div>
        </div>
      )}
    </div>
  );

  // Progress indicator component
  const ProgressBar = () => (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">
          Question {currentStepNumber} of {totalSteps}
        </span>
        <span className="text-sm text-gray-500">
          ~{Math.max(1, totalSteps - currentStepNumber)} min remaining
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-600 transition-all duration-300 ease-in-out"
          style={{ width: `${(currentStepNumber / totalSteps) * 100}%` }}
        />
      </div>

      {/* Verification count progress */}
      <div className="mt-4 text-center">
        <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-900 px-4 py-2 rounded-full border border-primary-200">
          <svg
            className="w-5 h-5 text-primary-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm font-semibold">
            Verification {newVerificationTotal} of 3 needed for expert-level accuracy
          </span>
        </div>
        {verificationsNeeded > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            {verificationsNeeded} more{' '}
            {verificationsNeeded === 1 ? 'verification' : 'verifications'} after this to reach high
            confidence
          </p>
        )}
      </div>
    </div>
  );

  // ============================================================
  // INTRO SCREEN
  // ============================================================
  if (currentStep === 'intro') {
    return (
      <div className="card max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify Provider Information</h2>
          <p className="text-gray-600 mb-4">
            <strong>{providerName}</strong> • {planName}
          </p>
        </div>

        {/* Research Context Banner */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg
              className="w-6 h-6 text-primary-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <div>
              <h3 className="font-semibold text-primary-900 mb-1">
                Research shows simple verification achieves expert-level accuracy
              </h3>
              <p className="text-sm text-primary-800">
                <strong>3 verifications = κ=0.58 accuracy</strong> (matches professional validation)
                <br />
                <span className="text-xs">Based on peer-reviewed research from JAMIA</span>
              </p>
            </div>
          </div>
        </div>

        {/* Verification Progress Indicator */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex gap-1">
              {[...Array(Math.min(3, newVerificationTotal))].map((_, i) => (
                <svg key={i} className="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              ))}
              {[...Array(Math.max(0, 3 - newVerificationTotal))].map((_, i) => (
                <svg key={i} className="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="8" />
                </svg>
              ))}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Verification {newVerificationTotal} of 3
              </p>
              <p className="text-xs text-gray-500">
                {verificationsNeeded > 0
                  ? `${verificationsNeeded} more needed for high confidence`
                  : 'Expert-level accuracy achieved!'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <strong className="text-gray-900">4 simple yes/no questions</strong>
              <p className="text-sm text-gray-600">One question at a time, no typing required</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <strong className="text-gray-900">Under 2 minutes total</strong>
              <p className="text-sm text-gray-600">
                Research shows short tasks maintain attention and accuracy
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <strong className="text-gray-900">Prevent surprise bills</strong>
              <p className="text-sm text-gray-600">
                Research: wrong directories cause 4x more surprise bills
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => handleNext('accepts-insurance-general')}
          className="btn-primary w-full text-lg py-4"
        >
          Start Verification
        </button>

        <p className="text-xs text-gray-500 text-center mt-4">
          By continuing, you agree to provide accurate information based on your recent experience.
        </p>
      </div>
    );
  }

  // ============================================================
  // STEP 1: Does provider accept insurance (general)?
  // ============================================================
  if (currentStep === 'accepts-insurance-general') {
    return (
      <div className="card max-w-2xl mx-auto">
        <ProgressBar />

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Does this provider accept insurance?
        </h2>
        <p className="text-gray-600 mb-4">{providerName}</p>
        <div className="flex items-center text-sm text-gray-500 mb-8">
          Why we ask this
          <Tooltip id="insurance-general">
            <strong>Research shows 12% of providers change networks annually.</strong>
            <br />
            <br />
            Some providers are cash-only. Knowing if they accept any insurance at all helps us route
            your verification correctly.
            <br />
            <br />
            <em className="text-xs">Source: Ndumele et al. (2018), Health Affairs</em>
          </Tooltip>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              handleAnswer('acceptsInsuranceGeneral', true);
              handleNext('contacted-provider');
            }}
            className="w-full btn-primary text-lg py-4"
          >
            Yes - accepts insurance plans
          </button>
          <button
            onClick={() => {
              handleAnswer('acceptsInsuranceGeneral', false);
              handleNext('thank-you-cash-only');
            }}
            className="w-full btn-outline text-lg py-4"
          >
            No - cash only / does not accept insurance
          </button>
          <button
            onClick={() => {
              handleAnswer('acceptsInsuranceGeneral', null);
              handleNext('thank-you-not-sure');
            }}
            className="w-full btn-outline text-lg py-4 border-gray-300"
          >
            I'm not sure
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // STEP 2: Did you contact the provider?
  // ============================================================
  if (currentStep === 'contacted-provider') {
    return (
      <div className="card max-w-2xl mx-auto">
        <ProgressBar />

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Did you successfully contact this provider?
        </h2>
        <p className="text-gray-600 mb-4">By phone, in person, or online</p>
        <div className="flex items-center text-sm text-gray-500 mb-8">
          Why we ask this
          <Tooltip id="contacted">
            <strong>Research shows 36% of directory errors are contact information.</strong>
            <br />
            <br />
            Knowing whether you successfully reached them helps us verify phone accuracy and assess
            data reliability.
            <br />
            <br />
            <em className="text-xs">Source: Health Affairs</em>
          </Tooltip>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              handleAnswer('contactedProvider', true);
              handleNext('phone-accuracy');
            }}
            className="w-full btn-primary text-lg py-4"
          >
            Yes - I reached them
          </button>
          <button
            onClick={() => {
              handleAnswer('contactedProvider', false);
              handleNext('phone-accuracy');
            }}
            className="w-full btn-outline text-lg py-4"
          >
            No - couldn't reach them
          </button>
          <button
            onClick={() => {
              handleAnswer('contactedProvider', null);
              handleNext('accepts-specific-plan');
            }}
            className="w-full btn-outline text-lg py-4 border-gray-300"
          >
            I'm not sure
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // STEP 3: Is the phone number correct?
  // ============================================================
  if (currentStep === 'phone-accuracy') {
    return (
      <div className="card max-w-2xl mx-auto">
        <ProgressBar />

        <h2 className="text-2xl font-bold text-gray-900 mb-2">Is the phone number correct?</h2>
        {providerPhone ? (
          <p className="text-gray-600 mb-4">
            Current number: <strong>{providerPhone}</strong>
          </p>
        ) : (
          <p className="text-gray-600 mb-4">Based on your experience contacting them</p>
        )}
        <p className="text-sm text-gray-500 mb-8">
          Helps us maintain accurate contact information for future patients
        </p>

        <div className="space-y-3">
          <button
            onClick={() => {
              handleAnswer('phoneAccurate', true);
              handleNext('accepts-specific-plan');
            }}
            className="w-full btn-primary text-lg py-4"
          >
            Yes - phone number is correct
          </button>
          <button
            onClick={() => {
              handleAnswer('phoneAccurate', false);
              handleNext('accepts-specific-plan');
            }}
            className="w-full btn-outline text-lg py-4"
          >
            No - phone number is wrong
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // STEP 4: Do they accept your specific plan?
  // ============================================================
  if (currentStep === 'accepts-specific-plan') {
    return (
      <div className="card max-w-2xl mx-auto">
        <ProgressBar />

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Do they accept {planName}?
        </h2>
        <p className="text-gray-600 mb-4">Your specific insurance plan</p>
        <div className="flex items-center text-sm text-gray-500 mb-8">
          Why we ask this
          <Tooltip id="specific-plan">
            <strong>Research shows 12% annual provider network turnover.</strong>
            <br />
            <br />
            Providers frequently change which specific plans they accept. This is the most important
            verification to prevent surprise bills.
            <br />
            <br />
            <em className="text-xs">Source: Ndumele et al. (2018)</em>
          </Tooltip>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              handleAnswer('acceptsSpecificPlan', 'YES');
              handleSubmit();
            }}
            disabled={isSubmitting}
            className="w-full btn-primary text-lg py-4"
          >
            {isSubmitting ? 'Submitting...' : 'Yes - they accept it'}
          </button>
          <button
            onClick={() => {
              handleAnswer('acceptsSpecificPlan', 'NOT_ACCEPTING_NEW');
              handleSubmit();
            }}
            disabled={isSubmitting}
            className="w-full btn-outline text-lg py-4"
          >
            {isSubmitting ? 'Submitting...' : 'Yes, but not accepting new patients'}
          </button>
          <button
            onClick={() => {
              handleAnswer('acceptsSpecificPlan', 'NO');
              handleSubmit();
            }}
            disabled={isSubmitting}
            className="w-full btn-outline text-lg py-4"
          >
            {isSubmitting ? 'Submitting...' : "No - they don't accept it"}
          </button>
          <button
            onClick={() => {
              handleAnswer('acceptsSpecificPlan', 'NOT_SURE');
              handleNext('thank-you-not-sure');
            }}
            disabled={isSubmitting}
            className="w-full btn-outline text-lg py-4 border-gray-300"
          >
            I'm not sure
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // SUCCESS SCREEN (after submission)
  // ============================================================
  if (currentStep === 'success') {
    const isExpertLevel = newVerificationTotal >= 3;

    return (
      <div className="card max-w-2xl mx-auto text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-3xl font-bold text-gray-900 mb-4">Thank You!</h2>

        <p className="text-xl text-gray-600 mb-6">Your verification has been recorded.</p>

        {/* Research Impact Box */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-6 mb-6">
          <h3 className="font-semibold text-primary-900 mb-3">Research Impact</h3>
          <p className="text-sm text-primary-800 mb-4">
            <strong>
              Research shows 3 verifications achieve expert-level accuracy (κ=0.58)
            </strong>
            <br />
            <span className="text-xs">
              Matches professional validation • Mortensen et al. (2015), JAMIA
            </span>
          </p>

          {/* Visual Progress */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex gap-1">
              {[...Array(Math.min(3, newVerificationTotal))].map((_, i) => (
                <svg key={i} className="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              ))}
              {[...Array(Math.max(0, 3 - newVerificationTotal))].map((_, i) => (
                <svg key={i} className="w-8 h-8 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="8" />
                </svg>
              ))}
            </div>
          </div>

          <p className="text-base font-medium text-gray-900">
            You're verification {newVerificationTotal} of 3 for this provider
          </p>
        </div>

        {isExpertLevel ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-base font-bold text-green-900">Expert-level accuracy achieved!</p>
            </div>
            <p className="text-sm text-green-800">
              This provider now has high-confidence verification data
            </p>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-yellow-900">
              {verificationsNeeded} more {verificationsNeeded === 1 ? 'verification' : 'verifications'}{' '}
              needed to reach expert-level accuracy
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Link href="/search" className="btn-outline flex-1">
            Back to Search
          </Link>
          <button onClick={onComplete} className="btn-primary flex-1">
            View Provider
          </button>
        </div>

        <Link
          href="/research"
          className="text-sm text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
        >
          Learn about our research methodology
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    );
  }

  // ============================================================
  // THANK YOU - NOT SURE
  // ============================================================
  if (currentStep === 'thank-you-not-sure') {
    return (
      <div className="card max-w-2xl mx-auto text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h2 className="text-3xl font-bold text-gray-900 mb-4">Thank You!</h2>

        <p className="text-xl text-gray-600 mb-6">
          Your feedback helps us understand what information needs verification.
        </p>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <h3 className="font-semibold text-yellow-900 mb-2">Recommendation</h3>
          <p className="text-sm text-yellow-800">
            <strong>Please call the provider to confirm</strong> they accept your insurance before
            your appointment.
          </p>
          {providerPhone && (
            <p className="text-sm text-yellow-800 mt-2">
              Phone: <strong>{providerPhone}</strong>
            </p>
          )}
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Research shows 46% of insurance directories contain errors. Calling ahead prevents surprise
          bills.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/search" className="btn-outline flex-1">
            Back to Search
          </Link>
          <button onClick={onComplete} className="btn-primary flex-1">
            View Provider
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // THANK YOU - CASH ONLY
  // ============================================================
  if (currentStep === 'thank-you-cash-only') {
    return (
      <div className="card max-w-2xl mx-auto text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h2 className="text-3xl font-bold text-gray-900 mb-4">Thank You!</h2>

        <p className="text-xl text-gray-600 mb-6">
          Your feedback helps us identify cash-only providers.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">Cash-Only Provider</h3>
          <p className="text-sm text-blue-800">
            This provider does not accept insurance. You'll need to pay out-of-pocket and may be able
            to file for reimbursement with your insurer.
          </p>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          This information will help other patients make informed decisions.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/search" className="btn-outline flex-1">
            Find Another Provider
          </Link>
          <button onClick={onComplete} className="btn-primary flex-1">
            View Provider
          </button>
        </div>
      </div>
    );
  }

  return null;
}
