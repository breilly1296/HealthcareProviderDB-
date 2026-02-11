'use client';

import { useEffect, useRef, useCallback } from 'react';
import FocusTrap from 'focus-trap-react';
import { useCompare, CompareProvider } from '@/hooks/useCompare';
import { CONFIDENCE_THRESHOLDS } from '@/lib/constants';
import { toDisplayCase, toAddressCase, toTitleCase } from '@/lib/formatName';
import { ClipboardList, Building2, MapPin, CheckCircle2, ClipboardCheck, Users, Clock, Phone, X } from 'lucide-react';

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function getConfidenceColor(score?: number): { bg: string; text: string; label: string } {
  if (score === undefined) {
    return { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', label: 'N/A' };
  }
  if (score >= CONFIDENCE_THRESHOLDS.HIGH) {
    return { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', label: 'High' };
  }
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return { bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-700 dark:text-yellow-300', label: 'Medium' };
  }
  return { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', label: 'Low' };
}

function getAcceptanceColor(status?: string): { bg: string; text: string } {
  switch (status?.toUpperCase()) {
    case 'ACCEPTED':
      return { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' };
    case 'PENDING':
      return { bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-700 dark:text-yellow-300' };
    default:
      return { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400' };
  }
}

function formatRelativeDate(dateString?: string | null): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

type ComparisonType = 'highest' | 'mostRecent' | 'status' | 'hasValue';

/**
 * Returns indices of providers with the "best" value for a given comparison type.
 * Returns empty array if all values are equal or all N/A (no highlighting needed).
 */
function getBestIndices(
  providers: CompareProvider[],
  getValue: (p: CompareProvider) => unknown,
  type: ComparisonType
): number[] {
  const values = providers.map(getValue);

  // Check if all values are effectively equal or all null/undefined
  const validValues = values.filter((v) => v !== undefined && v !== null && v !== 'Never' && v !== 'UNKNOWN');
  if (validValues.length === 0) return []; // All N/A

  // For 'hasValue' type, just return indices that have a value
  if (type === 'hasValue') {
    const indices = values
      .map((v, i) => (v && v !== 'Not affiliated' ? i : -1))
      .filter((i) => i !== -1);
    // If all have values or none have values, don't highlight
    const allHaveValue = indices.length === providers.length;
    const noneHaveValue = indices.length === 0;
    if (allHaveValue || noneHaveValue) return [];
    return indices;
  }

  if (type === 'highest') {
    const numericValues = values.map((v) => (typeof v === 'number' ? v : -Infinity));
    const maxValue = Math.max(...numericValues);
    if (maxValue === -Infinity) return []; // All N/A

    // Check if all valid values are the same
    const validNumeric = numericValues.filter((v) => v !== -Infinity);
    const allSame = validNumeric.every((v) => v === validNumeric[0]);
    if (allSame && validNumeric.length === providers.length) return [];

    return numericValues.map((v, i) => (v === maxValue ? i : -1)).filter((i) => i !== -1);
  }

  if (type === 'mostRecent') {
    const dateValues = values.map((v) => {
      if (!v || v === 'Never') return -Infinity;
      return new Date(v as string).getTime();
    });
    const maxDate = Math.max(...dateValues);
    if (maxDate === -Infinity) return []; // All N/A or Never

    // Check if all valid dates are the same
    const validDates = dateValues.filter((v) => v !== -Infinity);
    const allSame = validDates.every((v) => v === validDates[0]);
    if (allSame && validDates.length === providers.length) return [];

    return dateValues.map((v, i) => (v === maxDate ? i : -1)).filter((i) => i !== -1);
  }

  if (type === 'status') {
    const statusOrder: Record<string, number> = {
      ACCEPTED: 3,
      PENDING: 2,
      UNKNOWN: 1,
    };
    const statusValues = values.map((v) => statusOrder[(v as string)?.toUpperCase() || 'UNKNOWN'] || 1);
    const maxStatus = Math.max(...statusValues);

    // Check if all statuses are the same
    const allSame = statusValues.every((v) => v === statusValues[0]);
    if (allSame) return [];

    return statusValues.map((v, i) => (v === maxStatus ? i : -1)).filter((i) => i !== -1);
  }

  return [];
}

function ProviderInitial({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-lg font-bold text-primary-700 dark:text-primary-300">
      {initial}
    </div>
  );
}

interface ComparisonRowProps {
  label: string;
  icon: React.ReactNode;
  providers: CompareProvider[];
  renderValue: (provider: CompareProvider) => React.ReactNode;
  getBestIndices?: (providers: CompareProvider[]) => number[];
  isAlternate?: boolean;
}

function ComparisonRow({ label, icon, providers, renderValue, getBestIndices: getBestIndicesFn, isAlternate }: ComparisonRowProps) {
  const bestIndices = getBestIndicesFn ? getBestIndicesFn(providers) : [];
  const highlightClass = 'bg-green-50 dark:bg-green-900/20';

  return (
    <tr className={isAlternate ? 'bg-gray-50 dark:bg-gray-800/50' : ''}>
      <td className="sticky left-0 bg-inherit px-4 py-3 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 dark:text-gray-500">{icon}</span>
          {label}
        </div>
      </td>
      {providers.map((provider, index) => (
        <td
          key={provider.npi}
          className={`px-4 py-3 text-gray-900 dark:text-gray-100 ${
            bestIndices.includes(index) ? highlightClass : ''
          }`}
        >
          <div className={bestIndices.includes(index) ? 'inline-block rounded px-2 py-1' : ''}>
            {renderValue(provider)}
          </div>
        </td>
      ))}
    </tr>
  );
}

export function CompareModal({ isOpen, onClose }: CompareModalProps) {
  const { selectedProviders, removeProvider } = useCompare();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Focus trap and escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    // Capture the element that triggered the modal
    triggerRef.current = document.activeElement as HTMLElement;

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      // Restore focus to trigger element
      triggerRef.current?.focus();
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleRemoveProvider = (npi: string) => {
    removeProvider(npi);
    // Close modal if less than 2 providers remain
    if (selectedProviders.length <= 2) {
      onClose();
    }
  };

  const comparisonRows = [
    {
      label: 'Specialty',
      icon: <ClipboardList className="w-4 h-4" />,
      renderValue: (p: CompareProvider) => p.specialty || 'N/A',
      // Don't highlight specialty (usually same)
    },
    {
      label: 'Health System',
      icon: <Building2 className="w-4 h-4" />,
      renderValue: (p: CompareProvider) => p.healthSystem || 'Not affiliated',
      getBestIndices: (providers: CompareProvider[]) =>
        getBestIndices(providers, (p) => p.healthSystem, 'hasValue'),
    },
    {
      label: 'Location',
      icon: <MapPin className="w-4 h-4" />,
      renderValue: (p: CompareProvider) => (
        <div className="text-sm">
          <div>{toAddressCase(p.address)}</div>
          <div className="text-gray-500 dark:text-gray-400">
            {toTitleCase(p.city)}, {p.state} {p.zip}
          </div>
        </div>
      ),
      // Don't highlight location (subjective)
    },
    {
      label: 'Confidence',
      icon: <CheckCircle2 className="w-4 h-4" />,
      renderValue: (p: CompareProvider) => {
        const { bg, text, label } = getConfidenceColor(p.confidenceScore);
        return (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
            {p.confidenceScore !== undefined ? `${Math.round(p.confidenceScore)} - ${label}` : label}
          </span>
        );
      },
      getBestIndices: (providers: CompareProvider[]) =>
        getBestIndices(providers, (p) => p.confidenceScore, 'highest'),
    },
    {
      label: 'Status',
      icon: <ClipboardCheck className="w-4 h-4" />,
      renderValue: (p: CompareProvider) => {
        const status = p.acceptanceStatus || 'UNKNOWN';
        const { bg, text } = getAcceptanceColor(status);
        return (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
            {status}
          </span>
        );
      },
      getBestIndices: (providers: CompareProvider[]) =>
        getBestIndices(providers, (p) => p.acceptanceStatus || 'UNKNOWN', 'status'),
    },
    {
      label: 'Verifications',
      icon: <Users className="w-4 h-4" />,
      renderValue: (p: CompareProvider) => (
        <span>
          {p.verificationCount !== undefined ? `${p.verificationCount} user${p.verificationCount !== 1 ? 's' : ''}` : 'None'}
        </span>
      ),
      getBestIndices: (providers: CompareProvider[]) =>
        getBestIndices(providers, (p) => p.verificationCount, 'highest'),
    },
    {
      label: 'Last Verified',
      icon: <Clock className="w-4 h-4" />,
      renderValue: (p: CompareProvider) => formatRelativeDate(p.lastVerified),
      getBestIndices: (providers: CompareProvider[]) =>
        getBestIndices(providers, (p) => p.lastVerified, 'mostRecent'),
    },
    {
      label: 'Phone',
      icon: <Phone className="w-4 h-4" />,
      renderValue: (p: CompareProvider) =>
        p.phone ? (
          <a
            href={`tel:${p.phone}`}
            className="text-primary-600 dark:text-primary-400 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {p.phone}
          </a>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">Not available</span>
        ),
      // Don't highlight phone
    },
  ];

  return (
    <FocusTrap
      focusTrapOptions={{
        initialFocus: () => closeButtonRef.current,
        allowOutsideClick: true,
        escapeDeactivates: false, // We handle escape key ourselves
      }}
    >
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-modal-title"
      >
      <div
        ref={modalRef}
        className="
          w-full max-w-4xl max-h-[90vh]
          bg-white dark:bg-gray-900
          rounded-xl shadow-2xl
          flex flex-col
          animate-modal-enter
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="compare-modal-title" className="text-xl font-semibold text-gray-900 dark:text-white">
            Compare Providers
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="
              p-2 rounded-lg
              text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300
              hover:bg-gray-100 dark:hover:bg-gray-800
              transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
            "
            aria-label="Close comparison"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body - Scrollable table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                <th className="sticky left-0 top-0 z-10 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Attribute
                </th>
                {selectedProviders.map((provider) => (
                  <th
                    key={provider.npi}
                    className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-center min-w-[200px]"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <ProviderInitial name={toDisplayCase(provider.name)} />
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">
                          {toDisplayCase(provider.name)}
                        </div>
                        <button
                          onClick={() => handleRemoveProvider(provider.npi)}
                          className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 mt-1"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, index) => (
                <ComparisonRow
                  key={row.label}
                  label={row.label}
                  icon={row.icon}
                  providers={selectedProviders}
                  renderValue={row.renderValue}
                  getBestIndices={row.getBestIndices}
                  isAlternate={index % 2 === 1}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-xl">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Highlighted cells indicate the best value in each row. Always verify insurance acceptance directly with providers.
          </p>
        </div>
      </div>
    </div>
    </FocusTrap>
  );
}
