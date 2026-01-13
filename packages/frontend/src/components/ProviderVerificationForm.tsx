'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Research-based Provider Verification Form
 *
 * Based on Mortensen et al. (2015), JAMIA:
 * - Simple binary yes/no questions achieve highest accuracy
 * - One question per screen improves accuracy
 * - 3 verifications achieve expert-level accuracy (κ=0.58)
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

type Step = 'intro' | 'phone-reached' | 'phone-correct' | 'accepts-insurance' | 'new-patients' | 'appointment' | 'success';

interface FormData {
  phoneReached: boolean | null;
  phoneCorrect: boolean | null;
  acceptsInsurance: 'YES' | 'NO' | 'NOT_ACCEPTING_NEW' | null;
  scheduledAppointment: boolean | null;
  notes: string;
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
    phoneReached: null,
    phoneCorrect: null,
    acceptsInsurance: null,
    scheduledAppointment: null,
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  const totalSteps = 5; // Main questions (excluding intro and success)
  const currentStepNumber =
    currentStep === 'phone-reached' ? 1 :
    currentStep === 'phone-correct' ? 2 :
    currentStep === 'accepts-insurance' ? 3 :
    currentStep === 'new-patients' ? 4 :
    currentStep === 'appointment' ? 5 :
    0;

  const verificationsNeeded = Math.max(0, 3 - existingVerificationCount);

  const handleNext = (step: Step) => {
    setCurrentStep(step);
  };

  const handleAnswer = (field: keyof FormData, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npi: providerNpi,
          planId: planId,
          phoneReached: formData.phoneReached,
          phoneCorrect: formData.phoneCorrect,
          acceptsInsurance: formData.acceptsInsurance === 'YES',
          acceptsNewPatients: formData.acceptsInsurance !== 'NOT_ACCEPTING_NEW',
          scheduledAppointment: formData.scheduledAppointment,
          notes: formData.notes || undefined,
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

  const Tooltip = ({ id, children }: { id: string; children: React.ReactNode }) => (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(id)}
        onMouseLeave={() => setShowTooltip(null)}
        onClick={() => setShowTooltip(showTooltip === id ? null : id)}
        className="ml-2 text-primary-600 hover:text-primary-700"
      >
        <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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

  const ProgressBar = () => {
    const newTotal = existingVerificationCount + 1;
    const verificationsStillNeeded = Math.max(0, 3 - newTotal);

    return (
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
          <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-900 px-4 py-2 rounded-full">
            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-semibold">
              Verification {newTotal} of 3 needed for expert-level accuracy
            </span>
          </div>
          {verificationsStillNeeded > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              {verificationsStillNeeded} more {verificationsStillNeeded === 1 ? 'verification' : 'verifications'} after this to reach high confidence
            </p>
          )}
        </div>
      </div>
    );
  };

  if (currentStep === 'intro') {
    return (
      <div className="card max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Verify Provider Information
          </h2>
          <p className="text-gray-600 mb-4">
            <strong>{providerName}</strong> • {planName}
          </p>
        </div>

        {/* Research Context Banner */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-primary-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <h3 className="font-semibold text-primary-900 mb-1">
                Research-Backed Verification
              </h3>
              <p className="text-sm text-primary-800">
                <strong>3 verifications achieve expert-level accuracy (κ=0.58)</strong>
                <br />
                Based on peer-reviewed research from JAMIA
              </p>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        {verificationsNeeded > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium text-yellow-900">
                Verification {existingVerificationCount + 1} of 3 needed for high confidence
              </span>
            </div>
          </div>
        )}

        <div className="space-y-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <strong className="text-gray-900">5 simple yes/no questions</strong>
              <p className="text-sm text-gray-600">Research shows binary questions achieve highest accuracy</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <strong className="text-gray-900">Under 2 minutes total</strong>
              <p className="text-sm text-gray-600">One question at a time, no typing required</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <strong className="text-gray-900">Prevent surprise bills</strong>
              <p className="text-sm text-gray-600">Research shows wrong directories cause 4x more surprise bills</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => handleNext('phone-reached')}
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

  if (currentStep === 'success') {
    const newTotal = existingVerificationCount + 1;
    const isComplete = newTotal >= 3;

    return (
      <div className="card max-w-2xl mx-auto text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Thank You!
        </h2>

        <p className="text-xl text-gray-600 mb-6">
          Your verification has been recorded.
        </p>

        {/* Research Citation */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-6 mb-6">
          <h3 className="font-semibold text-primary-900 mb-2">
            Research Impact
          </h3>
          <p className="text-sm text-primary-800 mb-3">
            <strong>Research shows 3 verifications achieve expert-level accuracy (κ=0.58)</strong>
            <br />
            <span className="text-xs">Mortensen et al. (2015), JAMIA</span>
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="flex gap-1">
              {[...Array(Math.min(3, newTotal))].map((_, i) => (
                <svg key={i} className="w-6 h-6 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ))}
              {[...Array(Math.max(0, 3 - newTotal))].map((_, i) => (
                <svg key={i} className="w-6 h-6 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              ))}
            </div>
            <span className="text-sm font-medium text-gray-700">
              {newTotal} of 3 verifications
            </span>
          </div>
        </div>

        {isComplete ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-green-900">
              ✓ This provider now has expert-level verification confidence!
            </p>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-yellow-900">
              {3 - newTotal} more {3 - newTotal === 1 ? 'verification' : 'verifications'} needed for high confidence
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/search" className="btn-outline flex-1">
            Back to Search
          </Link>
          <button
            onClick={onComplete}
            className="btn-primary flex-1"
          >
            View Provider
          </button>
        </div>

        <Link href="/research" className="text-sm text-primary-600 hover:text-primary-700 mt-6 inline-block">
          Learn about our research methodology →
        </Link>
      </div>
    );
  }

  // Main question screens
  return (
    <div className="card max-w-2xl mx-auto">
      <ProgressBar />

      {/* Step 1: Phone Reached */}
      {currentStep === 'phone-reached' && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Did you reach this phone number?
          </h2>
          <p className="text-gray-600 mb-2">
            {providerPhone || 'Phone number on file'}
          </p>
          <div className="flex items-center text-sm text-gray-500 mb-8">
            Why we ask this
            <Tooltip id="phone-reached">
              <strong>Research shows 36% of directory errors are contact information.</strong>
              <br />
              <br />Wrong phone numbers waste time and delay care. When directories are wrong, 28% of patients delay care and 10% skip it entirely.
              <br />
              <br /><em className="text-xs">Source: Health Affairs</em>
            </Tooltip>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                handleAnswer('phoneReached', true);
                handleNext('phone-correct');
              }}
              className="w-full btn-primary text-lg py-4"
            >
              Yes, I reached them
            </button>
            <button
              onClick={() => {
                handleAnswer('phoneReached', false);
                handleAnswer('phoneCorrect', false);
                handleNext('accepts-insurance');
              }}
              className="w-full btn-outline text-lg py-4"
            >
              No, couldn't reach them
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Phone Correct */}
      {currentStep === 'phone-correct' && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Is the phone number correct?
          </h2>
          <p className="text-gray-600 mb-8">
            Did you reach <strong>{providerName}</strong> at this number?
          </p>

          <div className="space-y-3">
            <button
              onClick={() => {
                handleAnswer('phoneCorrect', true);
                handleNext('accepts-insurance');
              }}
              className="w-full btn-primary text-lg py-4"
            >
              Yes, correct number
            </button>
            <button
              onClick={() => {
                handleAnswer('phoneCorrect', false);
                handleNext('accepts-insurance');
              }}
              className="w-full btn-outline text-lg py-4"
            >
              No, wrong office/number
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Accepts Insurance */}
      {currentStep === 'accepts-insurance' && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Do they accept {planName}?
          </h2>
          <div className="flex items-center text-sm text-gray-500 mb-8">
            Why we ask this
            <Tooltip id="insurance">
              <strong>Research shows providers change insurance networks 12% annually.</strong>
              <br />
              <br />When directories are wrong, patients face 4x more surprise medical bills (16% vs 4%). Mental health providers change networks even more frequently - only 43% accept Medicaid.
              <br />
              <br /><em className="text-xs">Sources: Health Affairs, Ndumele et al. 2018</em>
            </Tooltip>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                handleAnswer('acceptsInsurance', 'YES');
                handleNext('new-patients');
              }}
              className="w-full btn-primary text-lg py-4"
            >
              Yes, they accept it
            </button>
            <button
              onClick={() => {
                handleAnswer('acceptsInsurance', 'NOT_ACCEPTING_NEW');
                handleNext('appointment');
              }}
              className="w-full btn-outline text-lg py-4"
            >
              Yes, but not accepting new patients
            </button>
            <button
              onClick={() => {
                handleAnswer('acceptsInsurance', 'NO');
                handleNext('appointment');
              }}
              className="w-full btn-outline text-lg py-4"
            >
              No, they don't accept it
            </button>
          </div>
        </div>
      )}

      {/* Step 4: New Patients (only if accepts insurance) */}
      {currentStep === 'new-patients' && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Are they accepting new patients?
          </h2>
          <p className="text-gray-600 mb-8">
            With {planName}
          </p>

          <div className="space-y-3">
            <button
              onClick={() => {
                handleNext('appointment');
              }}
              className="w-full btn-primary text-lg py-4"
            >
              Yes, accepting new patients
            </button>
            <button
              onClick={() => {
                handleAnswer('acceptsInsurance', 'NOT_ACCEPTING_NEW');
                handleNext('appointment');
              }}
              className="w-full btn-outline text-lg py-4"
            >
              No, not accepting new patients
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Appointment (optional) */}
      {currentStep === 'appointment' && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Did you schedule an appointment?
          </h2>
          <p className="text-gray-600 mb-8">
            Optional - this helps us verify acceptance
          </p>

          <div className="space-y-3">
            <button
              onClick={() => {
                handleAnswer('scheduledAppointment', true);
                handleSubmit();
              }}
              disabled={isSubmitting}
              className="w-full btn-primary text-lg py-4"
            >
              {isSubmitting ? 'Submitting...' : 'Yes, I scheduled'}
            </button>
            <button
              onClick={() => {
                handleAnswer('scheduledAppointment', false);
                handleSubmit();
              }}
              disabled={isSubmitting}
              className="w-full btn-outline text-lg py-4"
            >
              {isSubmitting ? 'Submitting...' : 'No appointment yet'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
