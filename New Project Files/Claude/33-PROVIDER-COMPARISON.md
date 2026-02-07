# Provider Comparison

**Last Updated:** 2026-02-07
**Status:** Implemented (partial integration)

---

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Components](#components)
4. [State Management](#state-management)
5. [Comparison Fields](#comparison-fields)
6. [Best-Value Highlighting](#best-value-highlighting)
7. [Accessibility](#accessibility)
8. [Responsive Design](#responsive-design)
9. [State Persistence](#state-persistence)
10. [Integration Points](#integration-points)
11. [Features Checklist](#features-checklist)
12. [Issues](#issues)
13. [Recommendations](#recommendations)

---

## Feature Overview

The Provider Comparison feature allows users to select up to **3 providers** and view them side-by-side in a modal comparison table. This helps users make informed decisions about which healthcare provider to visit based on attributes such as confidence score, insurance acceptance status, verification history, location, and contact information.

### User Flow

1. User searches for providers on the `/search` page.
2. User clicks "Compare" on provider cards (via `CompareCheckbox`).
3. A floating `CompareBar` appears at the bottom of the screen showing selected providers.
4. User clicks "Compare" in the bar (requires at least 2 providers).
5. A full-screen `CompareModal` opens with a side-by-side comparison table.
6. Best values in each row are highlighted in green to aid visual comparison.
7. User can remove individual providers from the comparison or close the modal.

### Provider Limit

The maximum number of providers that can be compared is defined in the constants file:

```typescript
// packages/frontend/src/lib/constants.ts (line 10)
export const MAX_COMPARE_PROVIDERS = 3;
```

Note: The prompt specification references a limit of 4, but the actual implementation uses a limit of **3** (as defined by `MAX_COMPARE_PROVIDERS`).

---

## Architecture

### File Structure

```
packages/frontend/src/
  context/
    CompareContext.tsx          # React context + provider + hook definition
  hooks/
    useCompare.ts              # Re-exports useCompare hook and CompareProvider type
    index.ts                   # Barrel export includes useCompare
  components/
    compare/
      index.ts                 # Barrel exports: CompareCheckbox, CompareBar, CompareModal
      CompareCheckbox.tsx       # Toggle button for adding/removing providers
      CompareBar.tsx            # Fixed floating bar showing selection state
      CompareModal.tsx          # Full comparison table modal
  lib/
    constants.ts               # MAX_COMPARE_PROVIDERS = 3
```

### Dependency Graph

```
layout.tsx
  -> CompareProvider (context/CompareContext.tsx)
       wraps the entire application
  -> CompareBar (components/compare/CompareBar.tsx)
       always rendered, hides when no providers selected
       -> CompareModal (components/compare/CompareModal.tsx)
            rendered conditionally via isOpen prop

CompareCheckbox (components/compare/CompareCheckbox.tsx)
  -> useCompare (hooks/useCompare.ts -> context/CompareContext.tsx)

CompareModal
  -> useCompare
  -> FocusTrap (focus-trap-react)
  -> formatName utilities (lib/formatName.ts)
  -> CONFIDENCE_THRESHOLDS (lib/constants.ts)
```

---

## Components

### CompareContext (`packages/frontend/src/context/CompareContext.tsx`)

The `CompareContext` is the core state management layer for the comparison feature. It defines the `CompareProvider` data interface and provides all operations for managing the comparison list.

**Provider Data Interface:**

```typescript
// packages/frontend/src/context/CompareContext.tsx (lines 7-21)
export interface CompareProvider {
  npi: string;
  name: string;
  specialty: string;
  healthSystem: string | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  confidenceScore?: number;
  acceptanceStatus?: string;
  verificationCount?: number;
  lastVerified?: string | null;
  phone?: string | null;
}
```

**Context API:**

```typescript
// packages/frontend/src/context/CompareContext.tsx (lines 23-30)
interface CompareContextType {
  selectedProviders: CompareProvider[];
  addProvider: (provider: CompareProvider) => void;
  removeProvider: (npi: string) => void;
  clearAll: () => void;
  isSelected: (npi: string) => boolean;
  canAddMore: boolean;
}
```

**Key Implementation Details:**

- The context is created with `createContext<CompareContextType | undefined>(undefined)` and a safety check in `useCompare()` throws an error if used outside the provider tree (line 151-156).
- `addProvider` uses the functional form of `setSelectedProviders` to avoid stale closures, and guards against both the max limit and duplicate NPI values (lines 110-117).
- `removeProvider` filters by NPI string (lines 120-122).
- `clearAll` resets to an empty array (lines 124-126).
- `isSelected` is memoized with `useCallback` depending on `selectedProviders` (lines 128-131).
- `canAddMore` is a derived boolean: `selectedProviders.length < MAX_COMPARE_PROVIDERS` (line 133).

**Application-Level Integration:**

The `CompareProvider` wraps the entire application in `layout.tsx`:

```typescript
// packages/frontend/src/app/layout.tsx (lines 164-179)
<CompareProvider>
  <ErrorProvider>
    <ToastProvider />
    <GlobalErrorBanner />
    <Header />
    <Disclaimer variant="banner" />
    <main className="flex-1 pb-20 md:pb-0">
      {children}
    </main>
    <Footer />
    <ScrollToTop />
    <CompareBar />
    <CookieConsent />
    <BottomNav />
  </ErrorProvider>
</CompareProvider>
```

This ensures that the compare state is available globally across all pages, and the `CompareBar` is always rendered (it self-hides when empty).

---

### useCompare Hook (`packages/frontend/src/hooks/useCompare.ts`)

A thin re-export module that provides a convenient import path:

```typescript
// packages/frontend/src/hooks/useCompare.ts (lines 1-5)
'use client';

// Re-export the hook from context for convenience
export { useCompare } from '@/context/CompareContext';
export type { CompareProvider } from '@/context/CompareContext';
```

This allows components to import from `@/hooks/useCompare` rather than directly from the context file, maintaining a clean separation between hooks and context internals.

---

### CompareCheckbox (`packages/frontend/src/components/compare/CompareCheckbox.tsx`)

A toggle button component designed to be placed on provider cards. It allows adding and removing a provider from the comparison list.

**Key Behaviors:**

- Prevents event propagation with `e.preventDefault()` and `e.stopPropagation()` (lines 16-17) so clicking the button does not trigger the parent card's link navigation.
- When the provider is already selected, clicking removes it. When not selected and capacity remains, clicking adds it (lines 19-23).
- The button is disabled when the provider is not selected and the max limit has been reached (line 13).
- The `aria-pressed` attribute reflects the selected state (line 31).
- Dynamic `aria-label` describes the action in context, including the provider's name (lines 32-38).
- A `title` attribute on the disabled state explains "Remove a provider to add another" (line 39).

**Visual States:**

| State | Background | Text Color | Icon |
|-------|-----------|------------|------|
| Selected | `bg-primary-100` / `dark:bg-primary-900/40` | `text-primary-700` / `dark:text-primary-300` | Checkmark SVG + "Added" |
| Available | `bg-gray-100` / `dark:bg-gray-700` | `text-gray-600` / `dark:text-gray-300` | Plus SVG + "Compare" |
| Disabled (at limit) | `bg-gray-100` / `dark:bg-gray-700` | `text-gray-400` / `dark:text-gray-500` | Plus SVG + "Compare" (cursor: not-allowed) |

**Styling:** Uses TailwindCSS with `focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2` for keyboard focus indication, with dark mode offset support.

---

### CompareBar (`packages/frontend/src/components/compare/CompareBar.tsx`)

A persistent floating bar that appears whenever at least one provider is selected for comparison. It has distinct layouts for desktop and mobile.

**Desktop Layout (hidden on mobile via `hidden md:flex`):**

- Fixed position: `bottom-6 right-6` as a floating card with rounded corners and shadow.
- Displays overlapping provider initials in circular avatars using the `ProviderInitial` helper component (lines 7-23).
- Shows count text: "{count} provider(s) selected" (lines 59-61).
- "Compare" button is **disabled** when fewer than 2 providers are selected (`canCompare = count >= 2`, line 30).
- "Clear" button calls `clearAll()` to remove all selected providers.

**Mobile Layout (shown only on mobile via `md:hidden`):**

- Full-width bar fixed at `bottom-16` (above the `BottomNav` component).
- Shows up to 3 provider initials with smaller avatars (`w-7 h-7`).
- Compact layout with count text: "{count} selected".
- Same Compare and Clear buttons.

**Animation:** Both layouts use `animate-slide-up` for entrance animation.

**Modal Control:** The CompareBar owns the modal open state (`isModalOpen`) and renders `<CompareModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />` (line 156).

---

### CompareModal (`packages/frontend/src/components/compare/CompareModal.tsx`)

The full-featured comparison modal that displays providers in a side-by-side table format with intelligent highlighting of the best values.

**Modal Behavior:**

- Controlled via `isOpen` prop; returns `null` when closed (line 205).
- Uses `focus-trap-react` (`FocusTrap`) to trap keyboard focus within the modal (lines 348-353).
- Escape key closes the modal via a `keydown` event listener (lines 183-189).
- Clicking the backdrop (outside the modal content) closes it via `handleBackdropClick` (lines 207-210).
- Body scroll is locked when open: `document.body.style.overflow = 'hidden'` (line 196), restored on close (line 201).
- Initial focus is set to the close button via `closeButtonRef` (lines 180, 197, 349-350).
- The modal has proper ARIA attributes: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="compare-modal-title"` (lines 359-361).

**Auto-Close on Remove:**

When a provider is removed and fewer than 2 remain, the modal automatically closes:

```typescript
// packages/frontend/src/components/compare/CompareModal.tsx (lines 213-219)
const handleRemoveProvider = (npi: string) => {
  removeProvider(npi);
  // Close modal if less than 2 providers remain
  if (selectedProviders.length <= 2) {
    onClose();
  }
};
```

**Layout:**

- Maximum width: `max-w-4xl`, maximum height: `max-h-[90vh]`.
- Three sections: Header (title + close button), Body (scrollable comparison table), Footer (disclaimer).
- The table uses sticky headers (`sticky top-0 z-10`) and a sticky label column (`sticky left-0`) for horizontal scrolling support.
- Each provider column has a minimum width of `200px`.

**Provider Headers:**

Each provider column header displays:
- A circular avatar with the provider's initial (using `toDisplayCase` for name formatting).
- The provider's display name.
- A "Remove" button in red text.

---

## Comparison Fields

The modal compares the following 8 attributes in a table format:

| Row | Field | Data Source | Best-Value Highlighting | Notes |
|-----|-------|-------------|------------------------|-------|
| 1 | Specialty | `provider.specialty` | None | Usually the same across compared providers |
| 2 | Health System | `provider.healthSystem` | `hasValue` type | Highlights providers affiliated with a health system |
| 3 | Location | `provider.address`, `city`, `state`, `zip` | None | Subjective; uses `toAddressCase` and `toTitleCase` formatting |
| 4 | Confidence | `provider.confidenceScore` | `highest` type | Displayed as color-coded badge (High/Medium/Low) with numeric score |
| 5 | Status | `provider.acceptanceStatus` | `status` type | Acceptance status badge (ACCEPTED/PENDING/UNKNOWN) |
| 6 | Verifications | `provider.verificationCount` | `highest` type | Shows count with "user(s)" suffix |
| 7 | Last Verified | `provider.lastVerified` | `mostRecent` type | Relative date display (Today, Yesterday, X days/weeks/months ago) |
| 8 | Phone | `provider.phone` | None | Clickable `tel:` link when available |

Each row includes an SVG icon for visual identification and alternating row backgrounds for readability.

---

## Best-Value Highlighting

The modal includes a sophisticated `getBestIndices()` function (lines 60-129) that determines which provider has the "best" value for each comparable attribute. Highlighted cells receive a green background (`bg-green-50 dark:bg-green-900/20`).

### Comparison Types

| Type | Logic | Used For |
|------|-------|----------|
| `highest` | Finds the maximum numeric value | Confidence score, Verification count |
| `mostRecent` | Finds the most recent date | Last verified date |
| `status` | Ranks by status order: ACCEPTED (3) > PENDING (2) > UNKNOWN (1) | Acceptance status |
| `hasValue` | Highlights providers that have a non-null value | Health system affiliation |

### Highlighting Rules

- If all providers have the same value, no highlighting is applied (prevents meaningless highlights).
- If all values are null/undefined/N/A, no highlighting is applied.
- Multiple providers can be highlighted if they share the best value.
- A footer disclaimer states: "Highlighted cells indicate the best value in each row."

---

## Accessibility

### Implemented

- **Focus trapping**: The `CompareModal` uses `focus-trap-react` to prevent keyboard focus from escaping the modal while it is open.
- **Escape key**: Pressing Escape closes the modal (lines 183-189).
- **ARIA attributes**:
  - Modal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="compare-modal-title"`.
  - CompareCheckbox: `aria-pressed` reflects selection state; dynamic `aria-label` includes provider name.
  - CompareBar buttons: `aria-label` with dynamic provider count.
- **Focus management**: Initial focus is directed to the close button on modal open (line 197).
- **Focus-visible rings**: All interactive elements use `focus-visible:ring-2` for keyboard-only focus indication.
- **Scroll lock**: Body scroll is disabled while the modal is open to prevent background scrolling.
- **Disabled state**: CompareCheckbox is visually and functionally disabled when at the provider limit, with a `title` tooltip explaining why.

### Not Yet Implemented

- Full keyboard navigation within the comparison table.
- Screen reader announcements for add/remove actions (live regions).
- Mobile-specific focus management improvements.

---

## Responsive Design

### Desktop (md and above)

- **CompareBar**: Floating card positioned at `bottom-6 right-6` with rounded corners, shadow, and all provider initials visible.
- **CompareModal**: Centered modal with `max-w-4xl`, scrollable table with sticky headers and sticky label column.

### Mobile (below md breakpoint)

- **CompareBar**: Full-width bar fixed at `bottom-16` (above the `BottomNav`), showing up to 3 initials in smaller size, compact layout.
- **CompareModal**: Full-width modal with horizontal scroll support for the comparison table (columns have `min-w-[200px]`).
- **CompareCheckbox**: Compact styling with `px-2.5 py-1.5` padding and `text-xs` font size.

### Animations

- `animate-slide-up`: Entrance animation for the CompareBar.
- `animate-fade-in`: Backdrop fade-in for the modal overlay.
- `animate-modal-enter`: Content entrance animation for the modal panel.

---

## State Persistence

### Current Implementation

Comparison state is persisted to **`sessionStorage`** under the key `verifymyprovider-compare`:

```typescript
// packages/frontend/src/context/CompareContext.tsx (line 34)
const STORAGE_KEY = 'verifymyprovider-compare';
```

**Behavior:**
- State initializes from `sessionStorage` on mount via `useEffect` (lines 98-101), making it SSR-safe.
- State is written to `sessionStorage` whenever the selection changes (lines 104-108), but only after the initial mount (`mounted` guard).
- State persists across page navigations within the same tab/session.
- State is cleared when the browser tab is closed (sessionStorage behavior).
- State is **not** shared across browser tabs.

**Error Handling:**

The storage layer includes comprehensive error handling (lines 36-91):

- `SyntaxError` from corrupted JSON: Logs error, removes corrupted key, returns empty array.
- `DOMException` from storage access (e.g., private browsing restrictions): Logs with specific context.
- `QuotaExceededError`: Logged separately with descriptive context.
- `SecurityError`: Logged separately.
- Array validation: If stored data parses but is not an array, it is logged and reset.
- All errors are logged via `logError()` from `@/lib/errorUtils`, which sends error metadata to PostHog analytics in production.

### Persistence Comparison

| Aspect | Current (sessionStorage) | localStorage Alternative |
|--------|-------------------------|------------------------|
| Tab persistence | Same tab only | Across all tabs |
| Session persistence | Lost on tab close | Persists until cleared |
| Cross-tab sync | No | Possible via `storage` event |
| Private browsing | May be restricted | May be restricted |
| Storage quota | ~5MB | ~5MB |

---

## Integration Points

### Where CompareProvider Wraps the App

The `CompareProvider` context wraps the entire application in `layout.tsx` (line 164), making the comparison state available on every page.

### Where CompareBar is Rendered

The `CompareBar` is rendered in `layout.tsx` (line 175) as a sibling to the main content area, positioned absolutely via CSS. It appears on every page when providers are selected.

### Where CompareCheckbox is Available

`CompareCheckbox` is exported from `components/compare/index.ts` and `hooks/index.ts`, but **it is not currently rendered in any page or component**. The search results page (`app/search/page.tsx`) renders `ProviderCard` components without integrating the `CompareCheckbox`.

The `ProviderCard` component (`components/ProviderCard.tsx`) does not currently accept or render a comparison control. To fully activate the feature, `CompareCheckbox` would need to be integrated into either the `ProviderCard` component or the search results list.

### Type Mapping

The `CompareProvider` interface (defined in `CompareContext.tsx`) is a simplified subset of the full `ProviderDisplay` type (defined in `types/index.ts`). When integrating the checkbox with search results, a mapping from `ProviderDisplay` to `CompareProvider` would be needed:

| CompareProvider field | ProviderDisplay source |
|----------------------|----------------------|
| `npi` | `provider.npi` |
| `name` | `provider.displayName` |
| `specialty` | `provider.taxonomyDescription` or `provider.specialtyCategory` |
| `healthSystem` | Not directly available on `ProviderDisplay`; would need to come from location data |
| `address` | `provider.addressLine1` |
| `city` | `provider.city` |
| `state` | `provider.state` |
| `zip` | `provider.zip` |
| `confidenceScore` | `provider.confidenceScore` |
| `acceptanceStatus` | Derived from `provider.planAcceptances` |
| `verificationCount` | Not available on `ProviderDisplay` (available on detail page) |
| `lastVerified` | Not available on `ProviderDisplay` (available on detail page) |
| `phone` | `provider.phone` |

---

## Features Checklist

### Context
- [x] CompareContext created with typed interface
- [x] Add provider function with functional state update
- [x] Remove provider by NPI
- [x] Clear all function
- [x] Max 3 provider limit enforced
- [x] Duplicate prevention (NPI-based)
- [x] `canAddMore` derived boolean
- [x] `isSelected` lookup function (memoized with useCallback)

### Components
- [x] CompareCheckbox component with toggle behavior
- [x] CompareBar with desktop and mobile layouts
- [x] CompareModal with side-by-side table comparison
- [x] Best-value highlighting with 4 comparison types
- [x] Provider initial avatars in bar and modal
- [x] Relative date formatting for "Last Verified"
- [x] Color-coded confidence score badges
- [x] Color-coded acceptance status badges
- [x] Clickable phone links
- [ ] CompareCheckbox integration into ProviderCard or search results
- [ ] Empty state handling in modal
- [ ] Mobile-optimized modal (swipe between providers)

### State Persistence
- [x] sessionStorage persistence (survives navigation)
- [x] SSR-safe initialization (useEffect + mounted guard)
- [x] Comprehensive error handling for storage operations
- [x] Error logging via PostHog analytics
- [ ] localStorage upgrade for cross-tab persistence
- [ ] Cross-tab synchronization via storage events

### UX
- [x] Visual feedback when provider added (checkmark + "Added" label)
- [x] Disabled state when at limit (grayed out + cursor not-allowed)
- [x] Clear all option in CompareBar
- [x] Remove individual providers from modal
- [x] Auto-close modal when fewer than 2 providers remain
- [x] Minimum 2 providers required to open Compare
- [x] Alternating row backgrounds in comparison table
- [x] Footer disclaimer about highlighted values
- [ ] Drag to reorder providers
- [ ] Toast notification on add/remove

### Accessibility
- [x] Focus trapping in modal (focus-trap-react)
- [x] Escape key to close modal
- [x] ARIA dialog attributes (role, aria-modal, aria-labelledby)
- [x] ARIA pressed state on CompareCheckbox
- [x] Dynamic aria-labels with provider names
- [x] Focus-visible ring styling
- [x] Initial focus on close button
- [x] Body scroll lock
- [ ] Screen reader live region announcements
- [ ] Full keyboard navigation within table

### Dark Mode
- [x] All components support dark mode via TailwindCSS dark: variants
- [x] Dark mode ring offsets configured (`dark:focus-visible:ring-offset-gray-800`)
- [x] Confidence and status badge colors adapted for dark mode

---

## Issues

### 1. CompareCheckbox Not Integrated into Search Results

**Severity:** High
**Description:** The `CompareCheckbox` component is fully implemented and exported, but it is not rendered anywhere in the application. Neither the `ProviderCard` component nor the search results page includes the checkbox. Users currently have no way to add providers to the comparison from the UI.

**Impact:** The comparison feature is effectively non-functional from the user's perspective despite the underlying infrastructure being complete.

**Files affected:**
- `packages/frontend/src/components/ProviderCard.tsx` -- needs to render `CompareCheckbox`
- `packages/frontend/src/app/search/page.tsx` -- alternative integration point

### 2. Provider Limit Mismatch with Specification

**Severity:** Low
**Description:** The prompt specification states "up to 4 providers" but `MAX_COMPARE_PROVIDERS` is set to 3 in `constants.ts` (line 10). The modal uses a 4-column grid in the prompt's example code but the actual implementation uses a dynamic table layout that handles any count.

### 3. Type Gap Between ProviderDisplay and CompareProvider

**Severity:** Medium
**Description:** The `CompareProvider` interface used by the comparison feature does not directly match the `ProviderDisplay` type returned by search results. Fields like `healthSystem`, `verificationCount`, and `lastVerified` are not available on `ProviderDisplay` and would need to be either added to the search API response or sourced from the detail API.

### 4. No Empty State in Modal

**Severity:** Low
**Description:** If somehow all providers are removed from the modal (edge case since auto-close triggers at < 2), there is no empty state UI. The table would render with only the header row.

### 5. Potential Race Condition on Auto-Close

**Severity:** Low
**Description:** In `handleRemoveProvider` (CompareModal, lines 213-219), the check `selectedProviders.length <= 2` uses the current render cycle's value, which may not reflect the state after `removeProvider` executes (since `setSelectedProviders` is asynchronous). However, this is mitigated by the fact that the modal simply closes, and reopening requires 2+ providers.

---

## Recommendations

### Short-Term (High Priority)

1. **Integrate CompareCheckbox into ProviderCard:** Add the `CompareCheckbox` component to the `ProviderCard` component, positioned in the card footer or header area. This requires mapping `ProviderDisplay` fields to the `CompareProvider` interface. This is the single most important step to make the feature functional.

2. **Add healthSystem to search API response:** The search results API should include the provider's health system affiliation so it can be displayed in the comparison without requiring a separate API call for each provider.

3. **Add verificationCount and lastVerified to search results:** These fields are currently only available on the provider detail page. Including summary counts in search results would make the comparison more informative.

### Medium-Term

4. **Upgrade to localStorage:** Replace `sessionStorage` with `localStorage` and add a `storage` event listener for cross-tab synchronization. This would let users open provider detail pages in new tabs and still see their comparison selections.

5. **Add toast notifications:** Show brief toast messages when providers are added to or removed from the comparison (e.g., "John Smith added to comparison" or "Comparison cleared").

6. **Mobile modal improvements:** Consider a swipeable card interface for mobile instead of the horizontal scroll table, as comparing 3 columns on a small screen is difficult even with horizontal scrolling.

### Long-Term

7. **Comparison sharing:** Generate a shareable URL with NPI values encoded as query parameters (e.g., `/compare?npis=1234567890,0987654321,1111111111`) so users can share comparisons with family members or caregivers.

8. **Export to PDF:** Allow users to download the comparison as a PDF for offline reference or to bring to appointments.

9. **Distance-based comparison:** If user location is available, include distance to each provider as a comparison field.

10. **Drag to reorder:** Allow users to reorder providers in the comparison by dragging column headers.

11. **Responsive provider limit:** Consider allowing more providers on larger screens (e.g., 4 on desktop, 3 on tablet, 2 on mobile) by making `MAX_COMPARE_PROVIDERS` responsive.

---

## Usage Stats

No analytics events are currently tracked for comparison actions. Recommended events to add:

| Event | Properties | Purpose |
|-------|-----------|---------|
| `comparison_started` | `provider_count` | Track how many users use the feature |
| `comparison_provider_added` | `npi`, `total_selected` | Track which providers are compared |
| `comparison_provider_removed` | `npi`, `total_remaining` | Track removal patterns |
| `comparison_modal_opened` | `provider_count` | Track modal engagement |
| `comparison_cleared` | `provider_count` | Track clear-all usage |

---

## Source File Reference

| File | Path | Lines | Purpose |
|------|------|-------|---------|
| CompareContext | `packages/frontend/src/context/CompareContext.tsx` | 157 | Context provider, state, hook |
| useCompare | `packages/frontend/src/hooks/useCompare.ts` | 5 | Hook re-export |
| CompareCheckbox | `packages/frontend/src/components/compare/CompareCheckbox.tsx` | 71 | Add/remove toggle button |
| CompareBar | `packages/frontend/src/components/compare/CompareBar.tsx` | 159 | Floating selection bar |
| CompareModal | `packages/frontend/src/components/compare/CompareModal.tsx` | 453 | Comparison table modal |
| compare/index | `packages/frontend/src/components/compare/index.ts` | 3 | Barrel exports |
| constants | `packages/frontend/src/lib/constants.ts` | 40 | MAX_COMPARE_PROVIDERS = 3 |
| layout | `packages/frontend/src/app/layout.tsx` | 187 | App-level integration |
| ProviderCard | `packages/frontend/src/components/ProviderCard.tsx` | 390 | Search result card (missing checkbox) |
| formatName | `packages/frontend/src/lib/formatName.ts` | 205 | Name/address formatting utilities |
| errorUtils | `packages/frontend/src/lib/errorUtils.ts` | 405 | Error handling for storage operations |
