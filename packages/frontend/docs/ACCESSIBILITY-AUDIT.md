# Accessibility Audit Report

**Date:** 2026-02-10
**Scope:** /search, /provider/[npi], /insurance pages + shared layout
**Standard:** WCAG 2.1 AA

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 13 | Fixed |
| HIGH | 20 | Fixed |
| MEDIUM | 30 | Open |
| LOW | 25 | Open |

## Positive Findings

The codebase already has strong a11y foundations:
- `lang="en"` on `<html>`, skip-to-content link, `<main id="main-content">`
- Global `focus-visible` ring styles in `globals.css`
- 44px minimum touch targets enforced via CSS
- Custom `Icons.tsx` system defaults to `aria-hidden="true"`
- BottomNav: `aria-current="page"`, labeled icons, `aria-label` on `<nav>`
- ThemeToggle: proper `role="radiogroup"` with `aria-checked`
- Modals (ConfidenceGauge, InsuranceList, VerificationButton): focus trap, Escape key, `role="dialog"`
- ConfidenceScoreBreakdown: proper `role="progressbar"` with aria-value attributes
- All `<img>` tags have `alt` text; all `target="_blank"` links have `rel="noopener noreferrer"`
- Honeypot fields correctly `aria-hidden` and `tabIndex={-1}`

---

## CRITICAL Issues (Fixed)

| # | Component | Issue | WCAG | Fix |
|---|-----------|-------|------|-----|
| C1 | `home/HeroSearch.tsx` | 3 form inputs (specialty, state, insurance) have no `<label>` or `aria-label` | 1.3.1, 4.1.2 | Added `aria-label` to all 3 inputs |
| C2 | `InsuranceCardUploader.tsx` | Upload dropzone is a `<div onClick>` with no keyboard support | 2.1.1 | Added `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space |
| C3 | `InsuranceCardUploader.tsx` | Loading/success states not announced to screen readers | 4.1.3 | Added `aria-live="polite"` status region |
| C4 | `provider-detail/ProviderDetailClient.tsx` | Breadcrumb `<nav>` missing `aria-label`; rendered as single link instead of `<ol>/<li>` | 1.3.1 | Restructured as `<nav aria-label="Breadcrumb"><ol>` with `aria-current="page"` |
| C5 | `provider-detail/InsuranceList.tsx` | Carrier group toggle buttons missing `aria-expanded` | 4.1.2 | Added `aria-expanded={shouldExpand}` |
| C6 | `provider-detail/InsuranceList.tsx` | "Other Plans" toggle missing `aria-expanded` | 4.1.2 | Added `aria-expanded` |
| C7 | `provider-detail/ProviderPlansSection.tsx` | Search input has no label | 1.3.1 | Added `aria-label="Search plans or carriers"` |
| C8 | `provider-detail/ProviderPlansSection.tsx` | Clear-search icon button missing `aria-label` | 4.1.2 | Added `aria-label="Clear search"` |
| C9 | `provider-detail/ProviderPlansSection.tsx` | Carrier toggle buttons missing `aria-expanded` | 4.1.2 | Added `aria-expanded={isExpanded}` |
| C10 | `provider-detail/ProviderHeroCard.tsx` | BadgeCheck icon conveys "verified" but has no screen reader text | 1.1.1 | Added `aria-hidden` on icon + `sr-only` "Verified" text |
| C11 | `InsuranceCardUploader.tsx` | Confidence progress bar missing `role="progressbar"` and aria-value attributes | 4.1.2 | Added `role="progressbar"` with `aria-valuenow/min/max` |
| C12 | `InsuranceCardUploader.tsx` | Validation error not connected to file input via `aria-describedby` | 3.3.1 | Added `aria-describedby` linking |
| C13 | `InsuranceCardUploader.tsx` | Error/warning messages lack `role="alert"` | 4.1.3 | Added `role="alert"` to both error containers |

## HIGH Issues (Fixed)

| # | Component | Issue | WCAG | Fix |
|---|-----------|-------|------|-----|
| H1 | `SearchForm.tsx` | "More Filters" toggle missing `aria-expanded` | 4.1.2 | Added `aria-expanded={showMoreFilters}` |
| H2 | `SearchForm.tsx` | Inline form lacks `role="search"` landmark | 1.3.1 | Added `role="search"` to `<form>` |
| H3 | `FilterButton.tsx` | `aria-expanded` hardcoded to `false` | 4.1.2 | Made dynamic via `isExpanded` prop |
| H4 | `ErrorMessage.tsx` | Main ErrorMessage wrapper lacks `role="alert"` | 4.1.3 | Added `role="alert"` |
| H5 | `ErrorMessage.tsx` | Text colors have no dark-mode variants (invisible text) | 1.4.3 | Added `dark:text-white` and `dark:text-gray-300` |
| H6 | `Header.tsx` | `<nav>` missing `aria-label` | 1.3.1 | Added `aria-label="Primary"` |
| H7 | `search/SearchResultsList.tsx` | Empty/no-results states render outside `aria-live` region | 4.1.3 | Wrapped all result states in `aria-live="polite"` |
| H8 | `provider-detail/ScoreBreakdown.tsx` | Progress bars missing `role="progressbar"` and aria-value attrs | 4.1.2 | Added full ARIA progressbar attributes |
| H9 | `provider-detail/InsuranceList.tsx` | "Verify" buttons all say "Verify" with no plan context | 4.1.2 | Added `aria-label="Verify {planName}"` |
| H10 | `provider-detail/InsuranceList.tsx` | Verification notes `<textarea>` missing label | 1.3.1 | Added `aria-label="Additional notes"` |
| H11 | `ProviderVerificationForm.tsx` | Tooltip button has `focus:outline-none` with no replacement | 2.4.7 | Added `focus-visible:ring-2` |
| H12 | `search/SearchHeader.tsx` | ViewModeToggle has no `role="group"` or `aria-label` | 4.1.2 | Added `role="group"` and `aria-label="View mode"` |
| H13 | `search/SearchMapView.tsx` | Map container has no accessible alternative | 4.1.2 | Added `role="region"` and `aria-label` |
| H14 | `provider-detail/ProviderHeroCard.tsx` | Decorative MapPin, Phone, Navigation icons not `aria-hidden` | 1.1.1 | Added `aria-hidden="true"` |
| H15 | `provider-detail/ProviderHeader.tsx` | Decorative icons not `aria-hidden`; external link missing new-tab indicator | 1.1.1, 3.2.5 | Added `aria-hidden` + sr-only "(opens in new tab)" |
| H16 | `provider-detail/ColocatedProviders.tsx` | 4 decorative icons not `aria-hidden` | 1.1.1 | Added `aria-hidden="true"` |
| H17 | `provider-detail/ProviderSidebar.tsx` | 6 decorative icons not `aria-hidden` | 1.1.1 | Added `aria-hidden="true"` |
| H18 | `provider-detail/AboutProvider.tsx` | 3 decorative icons not `aria-hidden` | 1.1.1 | Added `aria-hidden="true"` |
| H19 | `Disclaimer.tsx` | 4 decorative icons not `aria-hidden` | 1.1.1 | Added `aria-hidden="true"` |
| H20 | `FreshnessWarning.tsx` | Tooltip is mouse-only (no `onFocus`/`onBlur`); icons not `aria-hidden` | 2.1.1, 1.1.1 | Added keyboard handlers + `aria-hidden` on icons |

## MEDIUM Issues (Open -- To Be Addressed)

| # | Component | Issue | WCAG |
|---|-----------|-------|------|
| M1 | `ui/SearchableSelect.tsx` | `Math.random()` for IDs causes hydration mismatches | 4.1.1 |
| M2 | `ProviderCard.tsx` | Entire card is a `<Link>` -- screen readers read all content as link text | 2.4.4 |
| M3 | `ProviderCard.tsx` | Brand color `#137fec` on white has ~3.76:1 contrast ratio (needs 4.5:1) | 1.4.3 |
| M4 | `InsuranceCardUploader.tsx` | Extracted data fields use `<div>/<span>` instead of `<dl>/<dt>/<dd>` | 1.3.1 |
| M5 | `InsuranceCardUploader.tsx` | Dropzone text says "drag and drop" but no drag handlers exist | 3.3.2 |
| M6 | `SearchForm.tsx` | Drawer variant uses `<div>` instead of `<form>`, losing form semantics | 1.3.1 |
| M7 | `InsuranceList.tsx` | DataFreshnessBadge relies on color-only dot and `title` attribute | 1.4.1 |
| M8 | `InsuranceList.tsx` | Verification date toggle buttons lack `aria-pressed` | 4.1.2 |
| M9 | `VerificationButton.tsx` | Yes/No/Unsure toggles lack `aria-pressed` | 4.1.2 |
| M10 | `VerificationButton.tsx` | Loading spinner during submit has no `role="status"` | 4.1.3 |
| M11 | `ConfidenceScoreBreakdown.tsx` | Hardcoded `id` causes duplicates when multiple instances render | 4.1.1 |
| M12 | `ConfidenceGauge.tsx` | Amber `#f59e0b` label text fails contrast on white (~2.1:1) | 1.4.3 |
| M13 | `ProviderHeroCard.tsx` | Stale-data dot indicator has no screen reader text | 1.3.3 |
| M14 | `ProviderHeroCard.tsx` | Confidence factor pills use color-only distinction | 1.4.1 |
| M15 | `ProviderDetailClient.tsx` | Error container missing `role="alert"` | 4.1.3 |
| M16 | `LoadingSpinner.tsx` | LoadingOverlay missing `role="alertdialog"` | 4.1.2 |
| M17 | `Header.tsx` | Desktop nav links missing `aria-current` for active page | 2.4.8 |
| M18 | `ThemeToggle.tsx` | Conflicting `role="radio"` and `aria-pressed` on same element | 4.1.2 |
| M19 | `ErrorMessage.tsx` | `InlineError` lacks `role="alert"` | 4.1.3 |
| M20 | `globals.css` | `scroll-behavior: smooth` ignores `prefers-reduced-motion` | 2.3.3 |
| M21 | `InsuranceCardUploader.tsx` | Section heading icons (6) missing `aria-hidden` | 1.1.1 |
| M22 | `InsuranceList.tsx` | 5 decorative icons missing `aria-hidden` | 1.1.1 |
| M23 | `VerificationButton.tsx` | 3 decorative icons missing `aria-hidden` | 1.1.1 |
| M24 | `ConfidenceScoreBreakdown.tsx` | 9 icons in config objects missing `aria-hidden` | 1.1.1 |
| M25 | `FreshnessWarning.tsx:268,289,316` | Uses `<h3>` for status labels inside cards (not structural headings) | 1.3.1 |
| M26 | `insurance/page.tsx` | Breadcrumb `<nav>` missing `aria-label` | 1.3.1 |
| M27 | `search/SearchResultsList.tsx` | "Learn more" link text is vague | 2.4.4 |
| M28 | `RecentSearches.tsx` | Outer `<div>` has `cursor-pointer` but only inner `<button>` is clickable | 2.5.5 |
| M29 | `SearchableSelect.tsx` | "No options found" `<li>` inside listbox lacks `role="presentation"` | 4.1.2 |
| M30 | `home/HeroSearch.tsx` | `<form>` missing `aria-label` | 1.3.1 |

## LOW Issues (Open)

| # | Component | Issue | WCAG |
|---|-----------|-------|------|
| L1 | Multiple files | `focus:ring` used instead of `focus-visible:ring` (~17 instances) | 2.4.7 |
| L2 | `layout.tsx` | Footer links not wrapped in `<nav>` | 1.3.1 |
| L3 | `ErrorMessage.tsx` | Icon backgrounds lack dark-mode variants | 1.4.3 |
| L4 | `CookieConsent.tsx` | Buttons rely only on global focus ring | 2.4.7 |
| L5 | `home/TrustBar.tsx` | Decorative icons not explicitly `aria-hidden` | 1.1.1 |
| L6 | Landing page sections | `<section>` elements lack `aria-labelledby` | 1.3.1 |
| L7 | `insurance/page.tsx` | Breadcrumb separator exposed to SR; missing `aria-current` | 1.3.1 |
| L8 | `insurance/page.tsx` | Decorative Check/Info icons missing explicit `aria-hidden` | 1.1.1 |
| L9 | `InsuranceCardUploader.tsx` | Loader2, ClipboardList icons missing explicit `aria-hidden` | 1.1.1 |
| L10 | `SearchForm.tsx` | Search/X/Chevron icons missing explicit `aria-hidden` | 1.1.1 |
| L11 | `FilterButton.tsx` | Badge count span should be `aria-hidden` (already in aria-label) | 1.3.1 |
| L12 | `ProviderCard.tsx` | Insurance plan badges lack "Accepts:" prefix for SR context | 1.3.1 |
| L13 | `ProviderCard.tsx` | "+N more" plans badge lacks context | 1.3.1 |
| L14 | `RecentSearches.tsx` | "Clear all" button text is ambiguous | 2.4.6 |
| L15 | `EmptyState.tsx` | Decorative bullet spans should be `aria-hidden` | 1.1.1 |
| L16 | `SearchPagination.tsx` | Ellipsis "..." should be `aria-hidden` | 1.3.1 |
| L17 | `SearchMapView.tsx` | Map loading fallback lacks `role="status"` | 4.1.3 |
| L18 | `SaveProfileButton.tsx` | Bookmark icon missing explicit `aria-hidden` | 1.1.1 |
| L19 | `SearchableSelect.tsx` | ChevronDown/Loader2 icons missing explicit `aria-hidden` | 1.1.1 |
| L20 | `ProviderSidebar.tsx` | Heading hierarchy skips h2 (h1 -> h3) | 1.3.1 |
| L21 | `ConfidenceGauge.tsx` | Center text duplicates SVG aria-label (score read twice) | 1.3.1 |
| L22 | `ColocatedProviders.tsx` | Duplicate "View all" links create redundant tab stops | 2.4.4 |
| L23 | `ProviderCard.tsx` | "View Details" text redundant inside card-level link | 2.4.4 |
| L24 | `ProviderSidebar.tsx` | `<dl>` with `<div>` wrappers (valid HTML5, minor concern) | 1.3.1 |
| L25 | `Disclaimer.tsx` | Banner text uses `truncate` class (content hidden visually) | 1.4.4 |

---

## Remediation Priority

**Phase 1 (Done):** All CRITICAL and HIGH issues fixed in this audit.

**Phase 2 (Next sprint):**
- M1: Replace `Math.random()` with `useId()` in SearchableSelect
- M3: Darken brand color from `#137fec` to `#0066cc` for 4.5:1 contrast
- M4: Refactor extracted data fields to `<dl>/<dt>/<dd>`
- M12: Darken amber confidence label from `#f59e0b` to `#b45309`
- M20: Wrap `scroll-behavior: smooth` in `prefers-reduced-motion` query

**Phase 3 (Backlog):**
- M2: Add `aria-label` to ProviderCard links
- M8/M9: Add `aria-pressed` to toggle buttons
- L1: Standardize `focus:ring` → `focus-visible:ring`
- L6: Add `aria-labelledby` to landing page sections
