'use client';

import { useCompare, CompareProvider } from '@/hooks/useCompare';
import { Check, Plus } from 'lucide-react';

interface CompareCheckboxProps {
  provider: CompareProvider;
}

export function CompareCheckbox({ provider }: CompareCheckboxProps) {
  const { addProvider, removeProvider, isSelected, canAddMore } = useCompare();

  const selected = isSelected(provider.npi);
  const disabled = !selected && !canAddMore;

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (selected) {
      removeProvider(provider.npi);
    } else if (canAddMore) {
      addProvider(provider);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={
        selected
          ? `Remove ${provider.name} from comparison`
          : disabled
          ? 'Remove a provider to add another'
          : `Add ${provider.name} to comparison`
      }
      title={disabled ? 'Remove a provider to add another' : undefined}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
        transition-all duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        dark:focus-visible:ring-offset-gray-800
        ${
          selected
            ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/60'
            : disabled
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
        }
      `}
    >
      {selected ? (
        <>
          <Check className="w-3.5 h-3.5" />
          <span>Added</span>
        </>
      ) : (
        <>
          <Plus className="w-3.5 h-3.5" />
          <span>Compare</span>
        </>
      )}
    </button>
  );
}
