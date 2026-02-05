# Provider Comparison Feature — Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/33-provider-comparison.md
**Status:** Fully Implemented -- Comparison feature with context, components, persistence, and accessibility

---

## Findings

### CompareContext (`packages/frontend/src/context/CompareContext.tsx`)
- [x] **Context created** -- `CompareContext` created with `createContext<CompareContextType | undefined>(undefined)`.
- [x] **CompareProvider interface** -- Comprehensive type with `npi`, `name`, `specialty`, `healthSystem`, `address`, `city`, `state`, `zip`, `confidenceScore?`, `acceptanceStatus?`, `verificationCount?`, `lastVerified?`, `phone?`. More fields than the prompt specified.
- [x] **addProvider function** -- Uses `useCallback` with functional state update. Checks `prev.length >= MAX_COMPARE_PROVIDERS` and `prev.some(p => p.npi === provider.npi)` for duplicate prevention.
- [x] **removeProvider function** -- `useCallback` with `filter(p => p.npi !== npi)`.
- [x] **clearAll function** -- `useCallback` with `setSelectedProviders([])`.
- [x] **isSelected function** -- `useCallback` with `selectedProviders.some(p => p.npi === npi)`. Depends on `[selectedProviders]`.
- [x] **canAddMore computed** -- `selectedProviders.length < MAX_COMPARE_PROVIDERS`.
- [x] **Duplicate prevention** -- Checked in `addProvider` via `prev.some(p => p.npi === provider.npi)`.
- [x] **useCompare hook** -- Defined in the same file (line 151). Throws descriptive error if used outside provider.

### Max Provider Limit
- [!] **MAX_COMPARE_PROVIDERS = 3, not 4** -- `packages/frontend/src/lib/constants.ts` defines `MAX_COMPARE_PROVIDERS = 3`. The prompt states "up to 4 providers" but the implementation limits to 3. This is a discrepancy between the spec and implementation.

### State Persistence
- [x] **sessionStorage persistence** -- Uses `sessionStorage` (not localStorage) with key `verifymyprovider-compare`. Reads on mount via `useEffect`, writes on every state change.
- [x] **SSR-safe initialization** -- Checks `typeof window === 'undefined'` before accessing `sessionStorage`. Uses `mounted` state flag to prevent SSR hydration mismatches.
- [x] **Error handling on storage** -- Comprehensive error handling for `SyntaxError` (corrupt JSON), `DOMException` (quota exceeded, security errors). Uses `logError()` utility for structured error reporting. Removes corrupted data automatically.
- [x] **Array validation** -- Validates parsed JSON is an array before using it, resetting if not.

### CompareCheckbox (`packages/frontend/src/components/compare/CompareCheckbox.tsx`)
- [x] **Toggle behavior** -- Adds on click if `canAddMore`, removes if `selected`. Uses `e.preventDefault()` and `e.stopPropagation()` to avoid parent click handlers.
- [x] **Disabled state** -- `disabled={!selected && !canAddMore}` prevents adding when at limit.
- [x] **Visual feedback** -- Shows checkmark icon + "Added" when selected, plus icon + "Compare" when not. Uses distinct color schemes for selected/disabled/default states.
- [x] **aria-pressed attribute** -- `aria-pressed={selected}` for screen readers.
- [x] **Dynamic aria-label** -- Different labels for selected ("Remove X from comparison"), disabled ("Remove a provider to add another"), and default ("Add X to comparison") states.
- [x] **Focus ring** -- `focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2` with dark mode offset.

### CompareBar (`packages/frontend/src/components/compare/CompareBar.tsx`)
- [x] **Fixed positioning** -- Desktop: `fixed bottom-6 right-6 z-40` as floating card. Mobile: `fixed bottom-16 left-0 right-0 z-40` as full-width bar above BottomNav.
- [x] **Hidden when empty** -- Returns `null` when `count === 0`.
- [x] **Requires 2+ to compare** -- `canCompare = count >= 2`. Compare button disabled when only 1 provider selected.
- [x] **Provider initials display** -- Shows circular initials for each provider. Mobile limits to first 3 (`slice(0, 3)`).
- [x] **Clear all button** -- Calls `clearAll()` from context.
- [x] **Compare button** -- Opens `CompareModal` via local `isModalOpen` state.
- [x] **Responsive design** -- Separate desktop (floating card, `hidden md:flex`) and mobile (full-width bar, `md:hidden`) layouts.
- [x] **Animation** -- Uses `animate-slide-up` class for entrance animation.
- [x] **Aria label** -- `aria-label={Compare ${count} providers}` on compare button.

### CompareModal (`packages/frontend/src/components/compare/CompareModal.tsx`)
- [x] **Focus trap** -- Uses `focus-trap-react` library with `FocusTrap` wrapper. `initialFocus` set to close button, `allowOutsideClick: true`.
- [x] **Escape key handling** -- `handleKeyDown` listener closes modal on Escape. Registered/cleaned up in `useEffect`.
- [x] **Body scroll lock** -- `document.body.style.overflow = 'hidden'` on open, restored on cleanup.
- [x] **Backdrop click to close** -- `handleBackdropClick` checks `e.target === e.currentTarget` to close on backdrop click.
- [x] **Dialog role and aria** -- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="compare-modal-title"`.
- [x] **Remove individual providers** -- "Remove" button per provider in header. Auto-closes modal if fewer than 2 providers remain after removal.
- [x] **Side-by-side table layout** -- HTML `<table>` with sticky headers and sticky left attribute column. Responsive with `min-w-[200px]` per provider column.
- [x] **Best value highlighting** -- `getBestIndices()` function computes which providers have the "best" value per row. Supports `highest` (numeric), `mostRecent` (date), `status` (ordered), and `hasValue` comparison types. Skips highlighting when all values are equal.

### Comparison Fields Displayed

| Field | Displayed | Highlight Type |
|-------|-----------|---------------|
| Specialty | Yes | None (usually same) |
| Health System | Yes | hasValue |
| Location (address, city, state, zip) | Yes | None (subjective) |
| Confidence Score | Yes | highest |
| Acceptance Status | Yes | status (ACCEPTED > PENDING > UNKNOWN) |
| Verification Count | Yes | highest |
| Last Verified | Yes | mostRecent |
| Phone | Yes | None |

The prompt listed "Provider name", "Credential", and "Accepted plans" as displayed fields. In the actual implementation:
- **Provider name** -- Shown in the header row (not a comparison row).
- **Credential** -- Not displayed in comparison rows.
- **Accepted plans** -- Not displayed; the comparison shows acceptance status and verification count instead.
- **Health System**, **Verification Count**, **Last Verified** -- Additional fields not in the prompt but present in implementation.

### useCompare Hook (`packages/frontend/src/hooks/useCompare.ts`)
- [x] **Re-export pattern** -- Simply re-exports `useCompare` and `CompareProvider` type from `@/context/CompareContext`. Clean import path for consumers.

### Component Barrel Export (`packages/frontend/src/components/compare/index.ts`)
- [x] **Barrel exports** -- Exports `CompareCheckbox`, `CompareBar`, `CompareModal`.

### Accessibility
- [x] **Keyboard navigation** -- Escape to close modal, focus trap within modal, all interactive elements are buttons (natively focusable).
- [x] **Screen reader support** -- `aria-pressed`, `aria-label`, `aria-modal`, `aria-labelledby`, `role="dialog"`. Dynamic labels reflect current state.
- [x] **Focus management** -- `FocusTrap` component manages focus. Close button receives initial focus via `closeButtonRef`. Focus rings visible only on keyboard navigation (`focus-visible`).

### Prompt Checklist Verification

#### Context
- [x] CompareContext created
- [x] Add/remove/clear functions
- [x] Max provider limit (3, not 4 as prompt states)
- [x] Duplicate prevention

#### Components
- [x] CompareCheckbox on provider cards
- [x] CompareBar fixed at bottom
- [x] CompareModal for side-by-side
- [x] Empty state handling (bar hidden when 0, requires 2+ to compare)
- [x] Mobile responsive modal (separate mobile/desktop bar layouts, scrollable modal)

#### UX
- [x] Visual feedback when added (checkmark + "Added" text)
- [x] Disabled state when at limit
- [x] Clear all option
- [x] Remove individual providers
- [ ] Drag to reorder (not implemented)

#### Accessibility
- [x] Keyboard navigation (Escape, Tab via focus trap)
- [x] Screen reader support (ARIA attributes throughout)
- [x] Focus management in modal (focus-trap-react)

## Summary

The provider comparison feature is fully implemented and exceeds the prompt's specification in several areas. The core flow (add providers, view comparison bar, open modal) works as described. The implementation includes session storage persistence (not just ephemeral state), comprehensive error handling for storage operations, SSR-safe hydration, focus trapping, responsive desktop/mobile layouts, and intelligent best-value highlighting in the comparison table.

The main discrepancy is the max provider limit: the prompt specifies 4, but the constant `MAX_COMPARE_PROVIDERS` is set to 3. The comparison fields differ from the prompt's list -- the implementation adds health system, verification count, and last verified date while omitting credential and accepted plans.

## Recommendations

1. **Reconcile max provider limit** -- Decide whether the limit should be 3 or 4. If 4, update `MAX_COMPARE_PROVIDERS` in `packages/frontend/src/lib/constants.ts` and ensure the modal table layout handles 4 columns well. The modal uses `max-w-4xl` which may be tight for 4 provider columns at `min-w-[200px]` each.

2. **Add credential to comparison** -- The prompt lists credential as a comparison field but it is not displayed. Consider adding it as a row if the `CompareProvider` interface includes credential data, or add the field to the interface.

3. **Consider localStorage over sessionStorage** -- Current implementation uses `sessionStorage` which is tab-scoped and lost when the tab closes. The prompt's "Future Enhancement" suggests `localStorage` for persistence across sessions. This is a UX trade-off: sessionStorage prevents stale comparisons but localStorage lets users resume.

4. **Add comparison analytics** -- Track how often the comparison feature is used (providers compared, modal opened, time spent). PostHog is already integrated in the frontend.

5. **Add drag to reorder** -- Listed as unchecked in the prompt. Consider a library like `@dnd-kit/core` for accessible drag-and-drop reordering of providers in the comparison.

6. **Add unit tests for CompareContext** -- Test the max limit enforcement, duplicate prevention, sessionStorage read/write, error recovery from corrupt storage, and SSR-safe initialization. The context has well-defined behavior that is straightforward to test with React Testing Library's `renderHook`.
