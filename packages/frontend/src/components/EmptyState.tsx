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

export function EmptyState({
  type,
  suggestions = [],
  onSuggestionClick,
}: EmptyStateProps) {
  const config = EMPTY_STATE_CONFIG[type];
  const { title, description, Illustration } = config;

  return (
    <div className="text-center py-12 px-4">
      {/* Illustration */}
      <div className="flex justify-center mb-6">
        <Illustration className="w-40 h-40 md:w-48 md:h-48" />
      </div>

      {/* Text content */}
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        {title}
      </h3>
      <p className="text-gray-600 max-w-md mx-auto mb-6">
        {description}
      </p>

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
                bg-primary-50 hover:bg-primary-100
                text-primary-700 text-sm font-medium
                rounded-full
                transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
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
