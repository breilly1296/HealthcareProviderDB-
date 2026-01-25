'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { ChevronDown, X, Check, Search, Loader2 } from 'lucide-react';
import type { SelectOption, GroupedSelectOptions } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface SearchableSelectProps {
  options: SelectOption[] | GroupedSelectOptions[];
  value: string | string[] | undefined;
  onChange: (value: string | string[] | undefined) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  required?: boolean;
  multiple?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  isLoading?: boolean;
  error?: string;
  maxHeight?: number;
  noOptionsText?: string;
  className?: string;
  id?: string;
}

export interface SearchableSelectRef {
  focus: () => void;
}

interface FlatOption extends SelectOption {
  groupLabel?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function isGroupedOptions(
  options: SelectOption[] | GroupedSelectOptions[]
): options is GroupedSelectOptions[] {
  return options.length > 0 && 'options' in options[0];
}

function flattenOptions(
  options: SelectOption[] | GroupedSelectOptions[]
): FlatOption[] {
  if (isGroupedOptions(options)) {
    return options.flatMap((group) =>
      group.options.map((opt) => ({ ...opt, groupLabel: group.label }))
    );
  }
  return options;
}

function filterOptions(
  options: SelectOption[] | GroupedSelectOptions[],
  searchQuery: string
): SelectOption[] | GroupedSelectOptions[] {
  const query = searchQuery.toLowerCase().trim();
  if (!query) return options;

  if (isGroupedOptions(options)) {
    return options
      .map((group) => ({
        ...group,
        options: group.options.filter((opt) =>
          opt.label.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.options.length > 0);
  }

  return options.filter((opt) => opt.label.toLowerCase().includes(query));
}

function getOptionId(baseId: string, optionValue: string): string {
  return `${baseId}-option-${optionValue.replace(/[^a-zA-Z0-9]/g, '-')}`;
}

// ============================================================================
// Component
// ============================================================================

export const SearchableSelect = forwardRef<
  SearchableSelectRef,
  SearchableSelectProps
>(function SearchableSelect(
  {
    options,
    value,
    onChange,
    placeholder = 'Select...',
    label,
    disabled = false,
    required = false,
    multiple = false,
    searchable = false,
    clearable = false,
    isLoading = false,
    error,
    maxHeight = 300,
    noOptionsText = 'No options found',
    className = '',
    id,
  },
  ref
) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const componentId = id || `searchable-select-${Math.random().toString(36).slice(2, 9)}`;
  const listboxId = `${componentId}-listbox`;

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      triggerRef.current?.focus();
    },
  }));

  // Flatten and filter options
  const filteredOptions = useMemo(
    () => filterOptions(options, searchQuery),
    [options, searchQuery]
  );

  const flatFilteredOptions = useMemo(
    () => flattenOptions(filteredOptions).filter((opt) => !opt.disabled),
    [filteredOptions]
  );

  // Get selected values as array
  const selectedValues = useMemo((): string[] => {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }, [value]);

  // Get display text for selected value(s)
  const displayText = useMemo(() => {
    if (selectedValues.length === 0) return '';

    const allFlat = flattenOptions(options);
    const selectedLabels = selectedValues
      .map((v) => allFlat.find((opt) => opt.value === v)?.label)
      .filter(Boolean);

    if (multiple) {
      return selectedLabels.join(', ');
    }
    return selectedLabels[0] || '';
  }, [selectedValues, options, multiple]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: globalThis.MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // Reset highlighted index when options change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listboxRef.current) {
      const option = flatFilteredOptions[highlightedIndex];
      if (option) {
        const optionEl = document.getElementById(
          getOptionId(componentId, option.value)
        );
        optionEl?.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, flatFilteredOptions, componentId]);

  const toggleOpen = useCallback(() => {
    if (disabled || isLoading) return;
    setIsOpen((prev) => !prev);
    if (isOpen) {
      setSearchQuery('');
    }
  }, [disabled, isLoading, isOpen]);

  const handleSelect = useCallback(
    (optionValue: string) => {
      if (multiple) {
        const newValues = selectedValues.includes(optionValue)
          ? selectedValues.filter((v) => v !== optionValue)
          : [...selectedValues, optionValue];
        onChange(newValues.length > 0 ? newValues : undefined);
      } else {
        onChange(optionValue);
        setIsOpen(false);
        setSearchQuery('');
        triggerRef.current?.focus();
      }
    },
    [multiple, selectedValues, onChange]
  );

  const handleClear = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onChange(undefined);
      triggerRef.current?.focus();
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled || isLoading) return;

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else if (highlightedIndex >= 0 && flatFilteredOptions[highlightedIndex]) {
            handleSelect(flatFilteredOptions[highlightedIndex].value);
          }
          break;

        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setSearchQuery('');
          triggerRef.current?.focus();
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) =>
              prev < flatFilteredOptions.length - 1 ? prev + 1 : 0
            );
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) =>
              prev > 0 ? prev - 1 : flatFilteredOptions.length - 1
            );
          }
          break;

        case 'Tab':
          if (isOpen && highlightedIndex >= 0 && flatFilteredOptions[highlightedIndex]) {
            handleSelect(flatFilteredOptions[highlightedIndex].value);
          }
          setIsOpen(false);
          setSearchQuery('');
          break;

        case 'Home':
          if (isOpen) {
            e.preventDefault();
            setHighlightedIndex(0);
          }
          break;

        case 'End':
          if (isOpen) {
            e.preventDefault();
            setHighlightedIndex(flatFilteredOptions.length - 1);
          }
          break;
      }
    },
    [disabled, isLoading, isOpen, highlightedIndex, flatFilteredOptions, handleSelect]
  );

  const isSelected = useCallback(
    (optionValue: string) => selectedValues.includes(optionValue),
    [selectedValues]
  );

  const highlightedOptionId =
    highlightedIndex >= 0 && flatFilteredOptions[highlightedIndex]
      ? getOptionId(componentId, flatFilteredOptions[highlightedIndex].value)
      : undefined;

  // Render option item
  const renderOption = (option: SelectOption, index: number) => {
    const flatIndex = flatFilteredOptions.findIndex(
      (o) => o.value === option.value
    );
    const isHighlighted = flatIndex === highlightedIndex;
    const selected = isSelected(option.value);
    const optionId = getOptionId(componentId, option.value);

    return (
      <li
        key={option.value}
        id={optionId}
        role="option"
        aria-selected={selected}
        aria-disabled={option.disabled}
        className={`
          relative flex items-center gap-2 px-3 py-2 cursor-pointer select-none
          ${isHighlighted ? 'bg-primary-50 dark:bg-primary-900/30' : ''}
          ${selected ? 'text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-900 dark:text-gray-100'}
          ${option.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}
        `}
        onClick={() => {
          if (!option.disabled) {
            handleSelect(option.value);
          }
        }}
        onMouseEnter={() => {
          if (!option.disabled) {
            setHighlightedIndex(flatIndex);
          }
        }}
      >
        {multiple && (
          <span
            className={`
              flex-shrink-0 w-4 h-4 border rounded flex items-center justify-center
              ${selected
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'border-gray-300 dark:border-gray-600'
              }
            `}
          >
            {selected && <Check className="w-3 h-3" />}
          </span>
        )}
        <span className="flex-1 truncate">{option.label}</span>
        {!multiple && selected && (
          <Check className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
        )}
      </li>
    );
  };

  // Render grouped or flat options
  const renderOptions = () => {
    if (flatFilteredOptions.length === 0) {
      return (
        <li className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
          {noOptionsText}
        </li>
      );
    }

    if (isGroupedOptions(filteredOptions)) {
      return (filteredOptions as GroupedSelectOptions[]).map((group, groupIndex) => (
        <li key={group.label} role="group" aria-labelledby={`${componentId}-group-${groupIndex}`}>
          <div
            id={`${componentId}-group-${groupIndex}`}
            className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800 sticky top-0"
          >
            {group.label}
          </div>
          <ul role="group">
            {group.options.map((option, optIndex) => renderOption(option, optIndex))}
          </ul>
        </li>
      ));
    }

    return (filteredOptions as SelectOption[]).map((option, index) =>
      renderOption(option, index)
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label
          htmlFor={componentId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        id={componentId}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={isOpen ? highlightedOptionId : undefined}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${componentId}-error` : undefined}
        disabled={disabled || isLoading}
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
        className={`
          w-full flex items-center justify-between gap-2 px-3 py-2
          bg-white dark:bg-gray-800 border rounded-lg
          text-left text-gray-900 dark:text-gray-100
          transition-colors duration-150
          ${isOpen
            ? 'border-primary-500 ring-2 ring-primary-500/20'
            : error
              ? 'border-red-500 dark:border-red-400'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
          ${disabled || isLoading ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-900' : 'cursor-pointer'}
          focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
        `}
      >
        <span className={`flex-1 truncate ${!displayText ? 'text-gray-400 dark:text-gray-500' : ''}`}>
          {displayText || placeholder}
        </span>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isLoading && (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          )}

          {clearable && selectedValues.length > 0 && !disabled && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              aria-label="Clear selection"
            >
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </button>
          )}

          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden"
        >
          {/* Search Input */}
          {searchable && (
            <div className="p-2 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
                  aria-label="Search options"
                />
              </div>
            </div>
          )}

          {/* Options List */}
          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-multiselectable={multiple}
            className="overflow-y-auto"
            style={{ maxHeight }}
          >
            {renderOptions()}
          </ul>

          {/* Multi-select actions */}
          {multiple && selectedValues.length > 0 && (
            <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                {selectedValues.length} selected
              </span>
              <button
                type="button"
                onClick={() => onChange(undefined)}
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <p
          id={`${componentId}-error`}
          className="mt-1 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
});

export default SearchableSelect;
