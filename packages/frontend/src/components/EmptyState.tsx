'use client';

import { NoResultsIllustration, SearchLandingIllustration } from './illustrations';

export type EmptyStateType = 'no-results' | 'landing' | 'no-results-locations';

export interface SearchSuggestion {
  label: string;
  action: string;
}

interface EmptyStateProps {
  type: EmptyStateType;
  suggestions?: SearchSuggestion[];
  onSuggestionClick?: (action: string) => void;
  compact?: boolean;
}

const EMPTY_STATE_CONFIG: Record<EmptyStateType, {
  title: string;
  description: string;
  Illustration: React.ComponentType<{ className?: string }>;
}> = {
  'landing': {
    title: 'Find Healthcare Providers',
    description: 'Search by specialty, location, and insurance plan to find providers in your area.',
    Illustration: SearchLandingIllustration,
  },
  'no-results': {
    title: 'No Providers Found',
    description: 'We couldn\'t find any providers matching your search. Try adjusting your filters or broadening your location.',
    Illustration: NoResultsIllustration,
  },
  'no-results-locations': {
    title: 'No Locations Found',
    description: 'We couldn\'t find any locations matching your search. Try adjusting your filters or broadening your location.',
    Illustration: NoResultsIllustration,
  },
};

const SEARCH_TIPS = [
  'Remove the city filter to search the entire state',
  'Try a different or broader specialty',
  'Check for typos in the provider name or NPI',
  'Remove the insurance filter — not all plans are listed yet',
];

export function EmptyState({
  type,
  suggestions = [],
  onSuggestionClick,
  compact = false,
}: EmptyStateProps) {
  const config = EMPTY_STATE_CONFIG[type];
  const { title, description, Illustration } = config;
  const showTips = type === 'no-results' || type === 'no-results-locations';

  return (
    <div className={`text-center ${compact ? 'py-6' : 'py-12'} px-4`}>
      {/* Illustration */}
      <div className="flex justify-center mb-4">
        <Illustration className={compact ? 'w-20 h-20' : 'w-40 h-40 md:w-48 md:h-48'} />
      </div>

      {/* Text content */}
      <h3 className={`${compact ? 'text-lg' : 'text-xl'} font-semibold text-gray-900 dark:text-white mb-2`}>
        {title}
      </h3>
      <p className={`text-gray-600 dark:text-gray-300 max-w-md mx-auto mb-6 ${compact ? 'text-sm' : ''}`}>
        {description}
      </p>

      {/* Search tips */}
      {showTips && (
        <div className="max-w-sm mx-auto mb-6 text-left">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Try broadening your search:
          </p>
          <ul className="space-y-1.5">
            {SEARCH_TIPS.map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="mt-1 block w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestion chips */}
      {suggestions.length > 0 && onSuggestionClick && (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.action}
              type="button"
              onClick={() => onSuggestionClick(suggestion.action)}
              className="
                inline-flex items-center gap-1.5
                px-4 py-2
                bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/30 dark:hover:bg-primary-900/50
                text-primary-700 dark:text-primary-300 text-sm font-medium
                rounded-full
                transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900
              "
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
