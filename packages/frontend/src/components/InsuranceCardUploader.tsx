'use client';

import { useState, useRef } from 'react';
import type { InsuranceCardDataWithConfidence, InsuranceCardExtractionResponse, ExtractionConfidence } from '@/types/insurance';
import { useError } from '@/context/ErrorContext';

/**
 * Confidence level indicator component
 */
function ConfidenceIndicator({ confidence, score }: { confidence: ExtractionConfidence; score: number }) {
  const configs = {
    high: {
      label: 'High Confidence',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      barColor: 'bg-green-500',
    },
    medium: {
      label: 'Medium Confidence',
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      barColor: 'bg-yellow-500',
    },
    low: {
      label: 'Low Confidence',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      barColor: 'bg-red-500',
    },
  };

  const config = configs[confidence];

  return (
    <div className={`rounded-lg px-3 py-2 ${config.bgColor}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
        <span className={`text-xs ${config.color}`}>{Math.round(score * 100)}%</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${config.barColor}`}
          style={{ width: `${Math.round(score * 100)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Suggestions component for improving extraction
 */
function ExtractionSuggestions({ suggestions }: { suggestions: string[] }) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <div className="flex items-start gap-2">
        <svg
          className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <p className="font-medium text-blue-800 dark:text-blue-200 text-sm mb-1">Tips for better results</p>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            {suggestions.map((suggestion, index) => (
              <li key={index} className="flex items-start gap-1">
                <span className="text-blue-400 dark:text-blue-500">•</span>
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Card side indicator
 */
function CardSideIndicator({ side }: { side?: 'front' | 'back' | 'both' | 'unknown' }) {
  if (!side || side === 'unknown') return null;

  const labels = {
    front: 'Front of Card',
    back: 'Back of Card',
    both: 'Both Sides',
  };

  return (
    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
      {labels[side]}
    </span>
  );
}

export default function InsuranceCardUploader() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<InsuranceCardDataWithConfidence | null>(null);
  const [extractionResponse, setExtractionResponse] = useState<InsuranceCardExtractionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showErrorToast } = useError();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setValidationError('Please select an image file (JPEG, PNG, WebP, or GIF)');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setValidationError('Image size must be less than 10MB. Try taking a new photo at lower resolution.');
      return;
    }

    setValidationError(null);
    setExtractedData(null);
    setExtractionResponse(null);

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleExtract = async () => {
    if (!selectedImage) return;

    setLoading(true);
    setValidationError(null);

    try {
      const response = await fetch('/api/insurance-card/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: selectedImage }),
      });

      const result: InsuranceCardExtractionResponse = await response.json();
      setExtractionResponse(result);

      if (result.success && result.data) {
        setExtractedData(result.data);
      } else {
        // Show user-friendly error message
        const errorMessage = result.userMessage || result.error || 'Failed to extract insurance data';
        showErrorToast(new Error(errorMessage));
      }
    } catch (err) {
      // Show network/unexpected errors globally
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedImage(null);
    setExtractedData(null);
    setExtractionResponse(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderDataField = (label: string, value: string | null) => {
    if (!value) return null;
    return (
      <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
        <span className="text-gray-600 dark:text-gray-400 text-sm">{label}</span>
        <span className="font-medium text-gray-900 dark:text-white text-sm text-right max-w-[60%]">{value}</span>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Upload Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Upload Insurance Card</h2>

        {!selectedImage ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
          >
            <svg
              className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-gray-600 dark:text-gray-300 mb-2">Click to upload or drag and drop</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">PNG, JPG, WebP or GIF (max 10MB)</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Your image will be processed securely and not stored</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <img
                src={selectedImage}
                alt="Insurance card preview"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
              />
              <button
                onClick={handleReset}
                aria-label="Remove image"
                className="absolute top-2 right-2 bg-white dark:bg-gray-700 rounded-full p-1 shadow-md hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <button
              onClick={handleExtract}
              disabled={loading}
              className="w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Scanning card...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  Extract Insurance Data
                </>
              )}
            </button>
          </div>
        )}

        <label htmlFor="insurance-card-upload" className="sr-only">
          Upload insurance card image
        </label>
        <input
          ref={fileInputRef}
          id="insurance-card-upload"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Validation Error Message (file type/size issues) */}
      {validationError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 dark:text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">Invalid File</p>
              <p className="text-sm text-red-700 dark:text-red-300">{validationError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Extraction Failed with Suggestions */}
      {extractionResponse && !extractionResponse.success && extractionResponse.suggestions && (
        <div className="mb-6 space-y-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-500 dark:text-yellow-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  {extractionResponse.userMessage || 'Could not extract insurance information'}
                </p>
              </div>
            </div>
          </div>
          <ExtractionSuggestions suggestions={extractionResponse.suggestions} />
        </div>
      )}

      {/* Extracted Data */}
      {extractedData && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-green-50 dark:bg-green-900/30 border-b border-green-100 dark:border-green-800 px-6 py-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <h3 className="font-semibold text-green-800 dark:text-green-200">Insurance Data Extracted</h3>
              </div>
              <div className="flex items-center gap-2">
                <CardSideIndicator side={extractionResponse?.metadata?.cardType} />
              </div>
            </div>
          </div>

          {/* Confidence Indicator */}
          {extractionResponse?.metadata && (
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <ConfidenceIndicator
                confidence={extractionResponse.metadata.confidence}
                score={extractionResponse.metadata.confidenceScore}
              />
              {extractionResponse.metadata.fieldsExtracted > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {extractionResponse.metadata.fieldsExtracted} of {extractionResponse.metadata.totalFields} fields extracted
                </p>
              )}
            </div>
          )}

          {/* Suggestions for medium/low confidence */}
          {extractionResponse?.suggestions && extractionResponse.suggestions.length > 0 && (
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <ExtractionSuggestions suggestions={extractionResponse.suggestions} />
            </div>
          )}

          <div className="p-6 space-y-6">
            {/* Plan Information */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Plan Information
              </h4>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                {renderDataField('Insurance Company', extractedData.insurance_company)}
                {renderDataField('Plan Name', extractedData.plan_name)}
                {renderDataField('Plan Type', extractedData.plan_type)}
                {renderDataField('Provider Network', extractedData.provider_network)}
                {renderDataField('Network Notes', extractedData.network_notes)}
              </div>
            </div>

            {/* Subscriber Information */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                Subscriber Information
              </h4>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                {renderDataField('Subscriber Name', extractedData.subscriber_name)}
                {renderDataField('Subscriber ID', extractedData.subscriber_id)}
                {renderDataField('Group Number', extractedData.group_number)}
                {renderDataField('Effective Date', extractedData.effective_date)}
              </div>
            </div>

            {/* Copays */}
            {(extractedData.copay_pcp ||
              extractedData.copay_specialist ||
              extractedData.copay_urgent ||
              extractedData.copay_er) && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Copays
                </h4>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  {renderDataField('Primary Care', extractedData.copay_pcp)}
                  {renderDataField('Specialist', extractedData.copay_specialist)}
                  {renderDataField('Urgent Care', extractedData.copay_urgent)}
                  {renderDataField('Emergency Room', extractedData.copay_er)}
                </div>
              </div>
            )}

            {/* Deductibles & Out-of-Pocket */}
            {(extractedData.deductible_individual ||
              extractedData.deductible_family ||
              extractedData.oop_max_individual ||
              extractedData.oop_max_family) && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  Deductibles & Out-of-Pocket Max
                </h4>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  {renderDataField('Individual Deductible', extractedData.deductible_individual)}
                  {renderDataField('Family Deductible', extractedData.deductible_family)}
                  {renderDataField('Individual OOP Max', extractedData.oop_max_individual)}
                  {renderDataField('Family OOP Max', extractedData.oop_max_family)}
                </div>
              </div>
            )}

            {/* Pharmacy (Rx) */}
            {(extractedData.rxbin || extractedData.rxpcn || extractedData.rxgrp) && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                    />
                  </svg>
                  Pharmacy Information
                </h4>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  {renderDataField('RxBIN', extractedData.rxbin)}
                  {renderDataField('RxPCN', extractedData.rxpcn)}
                  {renderDataField('RxGRP', extractedData.rxgrp)}
                </div>
              </div>
            )}

            {/* Contact */}
            {(extractedData.customer_care_phone || extractedData.website) && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                  Contact Information
                </h4>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  {renderDataField('Customer Care', extractedData.customer_care_phone)}
                  {renderDataField('Website', extractedData.website)}
                </div>
              </div>
            )}
          </div>

          {/* Manual Correction Note */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Please verify the extracted information. You can manually correct any errors when searching for providers.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
