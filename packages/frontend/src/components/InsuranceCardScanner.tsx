'use client';

import { useState, useRef } from 'react';
import { ImageIcon, X, Loader2, Shield, Check, AlertTriangle, Info } from 'lucide-react';
import { useInsuranceCard } from '@/hooks/useInsuranceCard';
import type { ScanResponse } from '@/lib/api';

// ============================================================================
// Types
// ============================================================================

interface InsuranceCardScannerProps {
  onScanComplete?: () => void;
  onCancel?: () => void;
}

// ============================================================================
// Sub-components
// ============================================================================

function ScanSuccessBanner({ extraction }: { extraction: ScanResponse['extraction'] }) {
  const confidence = extraction.confidence?.toLowerCase() ?? 'medium';

  const configMap = {
    high: {
      label: 'High Confidence',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      barColor: 'bg-green-500',
    },
    medium: {
      label: 'Medium Confidence',
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      barColor: 'bg-yellow-500',
    },
    low: {
      label: 'Low Confidence',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      barColor: 'bg-red-500',
    },
  } as const;

  type ConfidenceLevel = keyof typeof configMap;
  const level: ConfidenceLevel = (confidence in configMap) ? confidence as ConfidenceLevel : 'medium';
  const config = configMap[level];
  const scorePercent = extraction.confidenceScore != null
    ? Math.round(extraction.confidenceScore * 100)
    : null;

  return (
    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Check className="w-5 h-5 text-green-600 dark:text-green-400" aria-hidden="true" />
        <h3 className="font-semibold text-green-800 dark:text-green-200">Card Saved to Profile</h3>
      </div>

      <div className="space-y-3">
        {/* Confidence bar */}
        <div className={`rounded-lg px-3 py-2 ${config.bgColor}`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
            {scorePercent != null && (
              <span className={`text-xs ${config.color}`}>{scorePercent}%</span>
            )}
          </div>
          {scorePercent != null && (
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${config.barColor}`}
                style={{ width: `${scorePercent}%` }}
                role="progressbar"
                aria-valuenow={scorePercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${config.label}: ${scorePercent}%`}
              />
            </div>
          )}
        </div>

        {/* Fields extracted */}
        {extraction.fieldsExtracted > 0 && (
          <p className="text-sm text-green-700 dark:text-green-300">
            {extraction.fieldsExtracted} of {extraction.totalFields} fields extracted
          </p>
        )}

        {/* Suggestions */}
        {extraction.suggestions.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mt-2">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200 text-xs mb-1">Tips for better results</p>
                <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-0.5">
                  {extraction.suggestions.map((suggestion, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-blue-400 dark:text-blue-500">&#8226;</span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function InsuranceCardScanner({ onScanComplete, onCancel }: InsuranceCardScannerProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { scanAsync, isScanning } = useInsuranceCard();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setValidationError('Please select an image file (JPEG, PNG, WebP, or GIF)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setValidationError('Image size must be less than 10MB. Try taking a new photo at lower resolution.');
      return;
    }

    setValidationError(null);
    setScanResult(null);
    setMimeType(file.type);

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setSelectedImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
    if (!selectedImage) return;

    setScanResult(null);

    try {
      // Strip the data URL prefix to get raw base64
      const commaIdx = selectedImage.indexOf(',');
      const base64 = commaIdx >= 0
        ? selectedImage.substring(commaIdx + 1)
        : selectedImage;

      const result = await scanAsync({ imageBase64: base64, mimeType });
      setScanResult(result);
      onScanComplete?.();
    } catch (err) {
      // Toast is already shown by the hook's onError
      // Show validation-style inline error for extraction-specific failures
      if (err instanceof Error && err.message.includes('extract')) {
        setValidationError(err.message);
      }
    }
  };

  const handleReset = () => {
    setSelectedImage(null);
    setScanResult(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Upload Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Scan Insurance Card</h2>

        {!selectedImage ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Upload insurance card image"
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
          >
            <ImageIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" aria-hidden="true" />
            <p className="text-gray-600 dark:text-gray-300 mb-2">Click to upload or drag and drop</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">PNG, JPG, WebP or GIF (max 10MB)</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center justify-center gap-1">
              <Shield className="w-3 h-3" aria-hidden="true" />
              Sensitive fields are encrypted before saving
            </p>
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
                disabled={isScanning}
                aria-label="Remove image"
                className="absolute top-2 right-2 bg-white dark:bg-gray-700 rounded-full p-1 shadow-md hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" aria-hidden="true" />
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleScan}
                disabled={isScanning}
                className="flex-1 bg-primary-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5" aria-hidden="true" />
                    Scanning & saving...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5" aria-hidden="true" />
                    Scan & Save to Profile
                  </>
                )}
              </button>
              {onCancel && (
                <button
                  onClick={onCancel}
                  disabled={isScanning}
                  className="px-4 py-3 rounded-lg font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              )}
            </div>

            <div aria-live="polite" className="sr-only">
              {isScanning ? 'Scanning and saving insurance card...' : scanResult ? 'Insurance card saved to profile.' : ''}
            </div>
          </div>
        )}

        <label htmlFor="insurance-card-scan-upload" className="sr-only">
          Upload insurance card image
        </label>
        <input
          ref={fileInputRef}
          id="insurance-card-scan-upload"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          aria-describedby={validationError ? 'scan-validation-error' : undefined}
        />
      </div>

      {/* Validation Error */}
      {validationError && (
        <div id="scan-validation-error" role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">Invalid File</p>
              <p className="text-sm text-red-700 dark:text-red-300">{validationError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {scanResult && (
        <div className="mt-4">
          <ScanSuccessBanner extraction={scanResult.extraction} />
        </div>
      )}
    </div>
  );
}
