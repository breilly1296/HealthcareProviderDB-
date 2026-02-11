'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Info, ImageIcon, X, Loader2, ClipboardList, Check, AlertTriangle, FileText, User, CircleDollarSign, Calculator, FlaskConical, Phone } from 'lucide-react';
import type { InsuranceCardDataWithConfidence, InsuranceCardExtractionResponse, ExtractionConfidence } from '@/types/insurance';
import { useError } from '@/context/ErrorContext';
import { useGeoLocation } from '@/hooks/useGeoLocation';

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
          role="progressbar"
          aria-valuenow={Math.round(score * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${config.label}: ${Math.round(score * 100)}%`}
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
        <Info className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
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
  const router = useRouter();
  const geo = useGeoLocation();

  const handleFindProviders = useCallback(() => {
    if (!extractedData) return;
    const params = new URLSearchParams();
    params.set('state', geo.state || 'NY');
    if (extractedData.insurance_company) params.set('issuerName', extractedData.insurance_company);
    if (extractedData.plan_name) params.set('planName', extractedData.plan_name);
    if (extractedData.plan_type) params.set('planType', extractedData.plan_type);
    router.push(`/search?${params.toString()}`);
  }, [extractedData, geo.state, router]);

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
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
            role="button"
            tabIndex={0}
            aria-label="Upload insurance card image"
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
          >
            <ImageIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
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
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" aria-hidden="true" />
              </button>
            </div>

            <button
              onClick={handleExtract}
              disabled={loading}
              className="w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5" aria-hidden="true" />
                  Scanning card...
                </>
              ) : (
                <>
                  <ClipboardList className="w-5 h-5" aria-hidden="true" />
                  Extract Insurance Data
                </>
              )}
            </button>
            <div aria-live="polite" className="sr-only">
              {loading ? 'Scanning insurance card...' : extractedData ? 'Insurance data extracted successfully.' : ''}
            </div>
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
          aria-describedby={validationError ? 'upload-validation-error' : undefined}
        />
      </div>

      {/* Validation Error Message (file type/size issues) */}
      {validationError && (
        <div id="upload-validation-error" role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400 mt-0.5" aria-hidden="true" />
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
          <div role="alert" className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 dark:text-yellow-400 mt-0.5" aria-hidden="true" />
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
        <>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-green-50 dark:bg-green-900/30 border-b border-green-100 dark:border-green-800 px-6 py-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
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
                <FileText className="w-4 h-4 text-primary-600 dark:text-primary-400" />
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
                <User className="w-4 h-4 text-primary-600 dark:text-primary-400" />
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
                  <CircleDollarSign className="w-4 h-4 text-primary-600 dark:text-primary-400" />
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
                  <Calculator className="w-4 h-4 text-primary-600 dark:text-primary-400" />
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
                  <FlaskConical className="w-4 h-4 text-primary-600 dark:text-primary-400" />
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
                  <Phone className="w-4 h-4 text-primary-600 dark:text-primary-400" />
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

        {/* Find Providers CTA */}
        <div className="mt-6 p-5 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-lg font-semibold text-stone-800 dark:text-white">
                Ready to find providers?
              </h3>
              <p className="text-sm text-stone-600 dark:text-gray-300 mt-1">
                Search for providers who accept {extractedData.plan_name || extractedData.insurance_company || 'your plan'}
              </p>
            </div>
            <button
              onClick={handleFindProviders}
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-xl shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] whitespace-nowrap"
            >
              <Search className="w-5 h-5" />
              Find Providers
            </button>
          </div>
        </div>
        <p className="text-xs text-stone-500 dark:text-gray-400 text-center mt-3">
          Tip: Note your plan name ({extractedData.plan_name || 'shown above'}) to select it in the search filters
        </p>
        </>
      )}
    </div>
  );
}
