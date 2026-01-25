# VerifyMyProvider Frontend Structure Review

**Last Updated:** January 25, 2026
**Priority:** Medium
**Framework:** Next.js 14+ (App Router)
**Styling:** Tailwind CSS 3.3.6

---

## Pages/Routes

### Main Routes

| Route | Purpose | Notes |
|-------|---------|-------|
| `/` | Landing page | Hero, "Why It Matters", "How It Works" |
| `/search` | Provider search | Filtering by state, city, specialty, plan |
| `/provider/[npi]` | Provider detail | Verification, plans, colocated providers |
| `/location/[locationId]` | Location detail | Facility information |
| `/insurance` | Insurance card scan | AI-powered card extraction |
| `/research` | Research info | Background information |
| `/terms` | Terms of service | Legal |
| `/privacy` | Privacy policy | Legal |

### API Routes

| Route | Purpose |
|-------|---------|
| `/api/insurance-card/extract` | Process insurance card images |

---

## Key Components

### Layout & Navigation

| Component | Purpose |
|-----------|---------|
| Header | Top navigation, theme toggle |
| Footer | Links, OwnMyHealth partnership |
| BottomNav | Mobile-only tab navigation |
| ThemeToggle | Light/dark mode switcher |

### Search & Filtering

| Component | Purpose |
|-----------|---------|
| SearchForm | Main search with all filters |
| FilterButton | Mobile filter trigger |
| FilterDrawer | Mobile filter modal |
| SearchableSelect | Custom searchable dropdown |
| RecentSearches | Search history |

### Provider Display

| Component | Purpose |
|-----------|---------|
| ProviderCard | List view card |
| ProviderCardSkeleton | Loading placeholder |
| ConfidenceBadge | Color-coded confidence |
| ConfidenceScoreBreakdown | Detailed score factors |
| ProviderVerificationForm | Verification submission |

### Insurance & Verification

| Component | Purpose |
|-----------|---------|
| InsuranceCardUploader | Card image upload |
| VerificationButton | Open verification modal |
| PlanAcceptanceCard | Plan status display |
| FreshnessWarning | Stale data warning |

### UI Components

| Component | Purpose |
|-----------|---------|
| EmptyState | No results state |
| ErrorMessage | Error display |
| LoadingSpinner | Loading indicator |
| ScrollToTop | Scroll button |
| CompareBar | Provider comparison |
| CompareModal | Side-by-side comparison |

---

## State Management Approach

### React Context API

**ThemeContext** (`/src/context/ThemeContext.tsx`)
- Modes: 'light', 'dark', 'system'
- Persists to localStorage
- Listens to system preference
- Prevents hydration mismatch

**CompareContext** (`/src/context/CompareContext.tsx`)
- Selected providers for comparison (max 3)
- Persists to sessionStorage
- Methods: add, remove, clearAll

### URL-Driven State
- Search filters sync with URL query params
- Shareable/bookmarkable searches
- Uses Next.js `useSearchParams`, `useRouter`

### Component-Level State
- useState for local UI state
- useRef for abort controllers, debounce

**No Redux/Zustand** - Lightweight approach suitable for the application

---

## API Integration

### API Layer (`/src/lib/api.ts`)

```typescript
// Configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL

// Namespaced Methods
api.providers.search(filters, page, limit)
api.providers.getByNpi(npi)
api.providers.getCities(state)
api.providers.getPlans(npi, params)
api.providers.getColocated(npi, params)

api.plans.search(params)
api.plans.getGrouped(params)
api.plans.getIssuers(state)
api.plans.getPlanTypes(params)

api.verify.submit(data)
api.verify.vote(verificationId, direction)
api.verify.getStats()
api.verify.getRecent(params)

api.locations.search(params)
api.locations.getHealthSystems(state, cities)
api.locations.getById(locationId)
```

### Features
- Query string building with null filtering
- Rate limit handling with toast notifications
- Validation error support (field-level)
- Abort signals for unmount cleanup

### Custom Hooks
- **useSearchForm** - Search filter logic, URL sync, debouncing
- **useCities** - Fetch cities for state
- **useInsurancePlans** - Fetch plans grouped by carrier
- **useHealthSystems** - Fetch health systems
- **useRecentSearches** - localStorage search history

---

## Mobile Responsiveness

### Breakpoints (Tailwind)
- `sm:` 640px+ (Small phones)
- `md:` 768px+ (Tablets)
- `lg:` 1024px+ (Desktops)

### Mobile-First Patterns

**Header:**
- "VMP" on mobile, "VerifyMyProvider" on desktop
- Hidden nav links on mobile

**Search Form:**
- Desktop: Full form visible
- Mobile: Filter button + drawer

**BottomNav:**
- Mobile-only (`md:hidden`)
- 4 items: Home, Search, Scan, How It Works
- Safe area support for notches

**Provider Cards:**
- Single column mobile, grid on desktop

**Provider Detail:**
- Mobile: Stacked layout
- Desktop: 2-column (3:1 ratio)

### Accessibility
- Minimum 44px touch targets
- ARIA labels on navigation
- Keyboard focus indicators
- Semantic HTML

---

## Dark Mode Support

### Implementation
- All colors have dark variants
- Theme preference in localStorage
- System preference listener
- Smooth transitions

### Example
```typescript
className="text-gray-900 dark:text-white bg-white dark:bg-gray-800"
```

---

## Performance Optimizations

### Implemented
- Server components by default (Next.js 14)
- Client components only where needed
- Lazy loading for colocated providers
- Skeleton loading states
- Debounced search

### Font Optimization
- Base font: 18px (for older demographic)
- Responsive scaling

---

## Analytics Integration

### PostHog
- Provider: `PostHogProvider`
- Feature flag support
- Optional via environment variable

---

## Component Library

**Custom Components** - No external UI library

Built with:
- Tailwind CSS utilities
- Custom keyframe animations
- Lucide React icons
- react-hot-toast for notifications

---

## Summary Table

| Aspect | Technology |
|--------|------------|
| Framework | Next.js 14+ (App Router) |
| Styling | Tailwind CSS 3.3.6 |
| State | React Context API |
| Data Fetching | Custom fetch wrapper |
| Animations | Tailwind keyframes |
| Analytics | PostHog |
| Notifications | react-hot-toast |
| Icons | Lucide React |
| Type Safety | Full TypeScript |

---

## Recommendations

### Immediate
- None critical

### Performance
1. Consider lazy loading for insurance card scanner
2. Add image optimization for provider photos (if added)
3. Monitor Core Web Vitals

### Accessibility
1. Add skip navigation link
2. Improve screen reader announcements
3. Test with VoiceOver/NVDA

### Future
1. PWA capabilities (offline support)
2. Push notifications for alerts
3. Native app (React Native) for mobile

---

*Frontend is well-structured with appropriate mobile support and accessibility patterns*
