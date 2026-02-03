# VerifyMyProvider Frontend Structure Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

The frontend is built with Next.js 14+ App Router, React 18, TypeScript, and Tailwind CSS. It follows modern React patterns with server components, client components, and a clean component hierarchy.

---

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14+ | React framework with App Router |
| React | 18 | UI library |
| TypeScript | 5+ | Type safety |
| Tailwind CSS | 3+ | Styling |
| Lucide React | Latest | Icons |
| PostHog | Latest | Analytics |

---

## Directory Structure

```
packages/frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Home page
│   │   ├── providers/          # Provider routes
│   │   │   ├── page.tsx        # Provider search
│   │   │   ├── [npi]/          # Provider detail
│   │   │   │   └── page.tsx
│   │   │   └── compare/        # Provider comparison
│   │   │       └── page.tsx
│   │   ├── verify/             # Verification routes
│   │   │   └── page.tsx
│   │   ├── plans/              # Insurance plans
│   │   │   └── page.tsx
│   │   └── locations/          # Location pages
│   │       └── [id]/
│   │           └── page.tsx
│   ├── components/             # React components
│   │   ├── ui/                 # Base UI components
│   │   ├── providers/          # Provider components
│   │   ├── verification/       # Verification components
│   │   ├── search/             # Search components
│   │   └── layout/             # Layout components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities
│   ├── contexts/               # React contexts
│   └── types/                  # TypeScript types
├── public/                     # Static assets
├── tailwind.config.ts          # Tailwind config
├── next.config.js              # Next.js config
└── package.json
```

---

## Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `page.tsx` | Home page with search |
| `/providers` | `providers/page.tsx` | Provider search results |
| `/providers/[npi]` | `providers/[npi]/page.tsx` | Provider detail |
| `/providers/compare` | `providers/compare/page.tsx` | Compare providers |
| `/verify` | `verify/page.tsx` | Submit verification |
| `/plans` | `plans/page.tsx` | Browse insurance plans |
| `/locations/[id]` | `locations/[id]/page.tsx` | Location detail |

---

## Component Hierarchy

### Layout Components

```typescript
// src/components/layout/Header.tsx
export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b">
      <nav className="container mx-auto px-4 py-3">
        <Logo />
        <Navigation />
        <SearchBar />
      </nav>
    </header>
  );
}

// src/components/layout/Footer.tsx
export function Footer() {
  return (
    <footer className="bg-gray-50 border-t mt-auto">
      <div className="container mx-auto px-4 py-8">
        <FooterLinks />
        <Copyright />
      </div>
    </footer>
  );
}
```

### Provider Components

```typescript
// src/components/providers/ProviderCard.tsx
interface ProviderCardProps {
  provider: Provider;
  showVerificationStatus?: boolean;
  onCompare?: (npi: string) => void;
}

export function ProviderCard({ provider, showVerificationStatus, onCompare }: ProviderCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-shadow">
      <ProviderName provider={provider} />
      <ProviderSpecialty specialty={provider.specialty} />
      <ProviderAddress address={provider} />
      {showVerificationStatus && (
        <VerificationBadge npi={provider.npi} />
      )}
      <ProviderActions provider={provider} onCompare={onCompare} />
    </div>
  );
}

// src/components/providers/ProviderDetail.tsx
export function ProviderDetail({ npi }: { npi: string }) {
  const { data: provider, isLoading } = useProvider(npi);

  if (isLoading) return <ProviderDetailSkeleton />;
  if (!provider) return <ProviderNotFound />;

  return (
    <div className="space-y-6">
      <ProviderHeader provider={provider} />
      <ProviderInfo provider={provider} />
      <ProviderPlans npi={npi} />
      <ProviderVerifications npi={npi} />
      <ColocatedProviders locationId={provider.locationId} />
    </div>
  );
}

// src/components/providers/ProviderComparison.tsx
export function ProviderComparison({ npis }: { npis: string[] }) {
  const providers = useProviders(npis);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {providers.map(provider => (
        <ComparisonColumn key={provider.npi} provider={provider} />
      ))}
    </div>
  );
}
```

### Search Components

```typescript
// src/components/search/SearchForm.tsx
export function SearchForm({ onSearch }: { onSearch: (query: SearchQuery) => void }) {
  const [query, setQuery] = useState<SearchQuery>({});

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StateSelect value={query.state} onChange={handleStateChange} />
        <CityInput value={query.city} onChange={handleCityChange} />
        <SpecialtyCombobox value={query.specialty} onChange={handleSpecialtyChange} />
      </div>
      <SearchButton loading={isSearching} />
    </form>
  );
}

// src/components/search/SearchResults.tsx
export function SearchResults({ results, isLoading }: SearchResultsProps) {
  if (isLoading) return <SearchResultsSkeleton />;
  if (!results?.length) return <NoResults />;

  return (
    <div className="space-y-4">
      <ResultsHeader count={results.length} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map(provider => (
          <ProviderCard key={provider.npi} provider={provider} />
        ))}
      </div>
      <Pagination />
    </div>
  );
}
```

### Verification Components

```typescript
// src/components/verification/VerificationForm.tsx
export function VerificationForm({ npi, planId }: VerificationFormProps) {
  const { submitVerification, isSubmitting } = useVerification();
  const { executeRecaptcha } = useReCaptcha();

  const handleSubmit = async (data: VerificationData) => {
    const captchaToken = await executeRecaptcha('verification');
    await submitVerification({ ...data, captchaToken });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ProviderConfirmation npi={npi} />
      <PlanSelector selectedPlan={planId} />
      <AcceptanceToggle />
      <NotesTextarea maxLength={1000} />
      <SubmitButton loading={isSubmitting} />
    </form>
  );
}

// src/components/verification/VerificationVoting.tsx
export function VerificationVoting({ verification }: { verification: Verification }) {
  const { vote, hasVoted } = useVoting(verification.id);

  return (
    <div className="flex items-center gap-2">
      <VoteButton
        type="up"
        count={verification.upvotes}
        active={hasVoted === 'up'}
        onClick={() => vote('up')}
      />
      <VoteButton
        type="down"
        count={verification.downvotes}
        active={hasVoted === 'down'}
        onClick={() => vote('down')}
      />
      <ConfidenceIndicator score={verification.confidenceScore} />
    </div>
  );
}

// src/components/verification/ConfidenceBadge.tsx
export function ConfidenceBadge({ score }: { score: number }) {
  const level = getConfidenceLevel(score);

  return (
    <span className={cn(
      'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
      {
        'bg-green-100 text-green-800': level === 'high',
        'bg-yellow-100 text-yellow-800': level === 'medium',
        'bg-red-100 text-red-800': level === 'low',
        'bg-gray-100 text-gray-800': level === 'unknown'
      }
    )}>
      {level === 'high' && 'Verified'}
      {level === 'medium' && 'Likely'}
      {level === 'low' && 'Uncertain'}
      {level === 'unknown' && 'Unknown'}
    </span>
  );
}
```

### UI Components

```typescript
// src/components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }))}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Spinner className="mr-2" />}
      {children}
    </button>
  );
}

// src/components/ui/Card.tsx
export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('bg-white rounded-lg shadow-sm border', className)}>
      {children}
    </div>
  );
}

// src/components/ui/Input.tsx
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
          'text-sm ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
```

---

## Custom Hooks

```typescript
// src/hooks/useProvider.ts
export function useProvider(npi: string) {
  return useQuery({
    queryKey: ['provider', npi],
    queryFn: () => api.getProvider(npi),
    staleTime: 5 * 60 * 1000,  // 5 minutes
  });
}

// src/hooks/useSearch.ts
export function useSearch() {
  const [results, setResults] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const search = async (query: SearchQuery) => {
    setIsLoading(true);
    try {
      const data = await api.searchProviders(query);
      setResults(data.providers);
    } finally {
      setIsLoading(false);
    }
  };

  return { results, isLoading, search };
}

// src/hooks/useVerification.ts
export function useVerification() {
  const mutation = useMutation({
    mutationFn: api.submitVerification,
    onSuccess: () => {
      toast.success('Verification submitted!');
    }
  });

  return {
    submitVerification: mutation.mutate,
    isSubmitting: mutation.isPending
  };
}

// src/hooks/useCompare.ts
export function useCompare() {
  const [compareList, setCompareList] = useState<string[]>([]);

  const addToCompare = (npi: string) => {
    if (compareList.length < 4 && !compareList.includes(npi)) {
      setCompareList([...compareList, npi]);
    }
  };

  const removeFromCompare = (npi: string) => {
    setCompareList(compareList.filter(n => n !== npi));
  };

  return { compareList, addToCompare, removeFromCompare };
}
```

---

## React Contexts

```typescript
// src/contexts/CompareContext.tsx
interface CompareContextValue {
  compareList: string[];
  addToCompare: (npi: string) => void;
  removeFromCompare: (npi: string) => void;
  clearCompare: () => void;
}

export const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [compareList, setCompareList] = useState<string[]>([]);

  // ... implementation

  return (
    <CompareContext.Provider value={{ compareList, addToCompare, removeFromCompare, clearCompare }}>
      {children}
    </CompareContext.Provider>
  );
}

// src/contexts/SearchContext.tsx
export const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<SearchFilters>({});
  const [results, setResults] = useState<Provider[]>([]);

  // ... implementation

  return (
    <SearchContext.Provider value={{ filters, setFilters, results }}>
      {children}
    </SearchContext.Provider>
  );
}
```

---

## API Client

```typescript
// src/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const api = {
  // Providers
  searchProviders: async (query: SearchQuery): Promise<SearchResponse> => {
    const params = new URLSearchParams(query as Record<string, string>);
    const response = await fetch(`${API_URL}/providers/search?${params}`);
    return handleResponse(response);
  },

  getProvider: async (npi: string): Promise<Provider> => {
    const response = await fetch(`${API_URL}/providers/${npi}`);
    return handleResponse(response);
  },

  getProviderPlans: async (npi: string): Promise<PlanAcceptance[]> => {
    const response = await fetch(`${API_URL}/providers/${npi}/plans`);
    return handleResponse(response);
  },

  // Verifications
  submitVerification: async (data: VerificationData): Promise<Verification> => {
    const response = await fetch(`${API_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse(response);
  },

  voteOnVerification: async (id: string, vote: 'up' | 'down', captchaToken: string) => {
    const response = await fetch(`${API_URL}/verify/${id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote, captchaToken })
    });
    return handleResponse(response);
  }
};
```

---

## Styling Patterns

### Tailwind Configuration

```typescript
// tailwind.config.ts
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8'
        }
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography')
  ]
};
```

### Component Variants

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usage
<div className={cn(
  'base-class',
  isActive && 'active-class',
  variant === 'primary' && 'primary-class'
)} />
```

---

## Performance Optimizations

1. **Server Components**: Default for static content
2. **Client Components**: Only for interactivity
3. **Image Optimization**: Next.js Image component
4. **Code Splitting**: Dynamic imports for large components
5. **React Query**: Caching and deduplication

---

## Conclusion

The frontend is **well-structured** with:

- ✅ Modern Next.js App Router
- ✅ Clean component hierarchy
- ✅ Custom hooks for logic reuse
- ✅ Type-safe with TypeScript
- ✅ Consistent styling with Tailwind
- ✅ Good separation of concerns
