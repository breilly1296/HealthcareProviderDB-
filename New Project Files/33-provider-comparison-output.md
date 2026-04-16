# Provider Comparison

**Last Updated:** 2026-04-16
**Status:** Implemented

## Features

- [x] Add up to **3** providers (not 4 as prompt describes) — `packages/frontend/src/lib/constants.ts:10` (`MAX_COMPARE_PROVIDERS = 3`)
- [x] Side-by-side comparison — `packages/frontend/src/components/compare/CompareModal.tsx:178`
- [x] Remove from compare — `CompareContext.tsx:120`, `CompareModal.tsx:388`
- [x] Clear all — `CompareContext.tsx:124`, `CompareBar.tsx:84`
- [x] Session persistence — `sessionStorage` key `verifymyprovider-compare` (`CompareContext.tsx:34, 36-91`)

## Components

| Component | File:Line | Notes |
|-----------|-----------|-------|
| `CompareContext` / `CompareProvider` | `context/CompareContext.tsx:93` | Wraps app in `app/layout.tsx:130-148` |
| `useCompare` hook | `hooks/useCompare.ts:4` | Thin re-export of context hook |
| `CompareCheckbox` | `components/compare/CompareCheckbox.tsx:10` | Rendered on `ProviderCard` |
| `CompareBar` | `components/compare/CompareBar.tsx:25` | Rendered globally in layout at `app/layout.tsx:142` |
| `CompareModal` | `components/compare/CompareModal.tsx:178` | FocusTrap-wrapped dialog |

## State Model (`CompareContext.tsx:7-30`)

```ts
interface CompareProvider {
  npi, name, specialty, healthSystem, address, city, state, zip,
  confidenceScore?, acceptanceStatus?, verificationCount?, lastVerified?, phone?
}
interface CompareContextType {
  selectedProviders, addProvider, removeProvider, clearAll, isSelected, canAddMore
}
```

## Comparison Rows (`CompareModal.tsx:228-319`)

| Row | "Best" highlight | Evidence |
|-----|------------------|----------|
| Specialty | none | `:231-234` |
| Health System | hasValue | `:236-241` |
| Location | none | `:243-254` |
| Confidence | highest | `:256-268` |
| Status | ACCEPTED > PENDING > UNKNOWN | `:270-283` |
| Verifications | highest count | `:285-294` |
| Last Verified | most recent | `:296-301` |
| Phone | none (tel: link) | `:303-318` |

This richer feature set exceeds the prompt's listed fields: **additional** status/verifications/lastVerified/highlight-best-cell, **missing** "Accepted plans" column (plans aren't shown individually; status is from the best plan acceptance already flattened onto `CompareProvider`).

## Persistence

- Stored in `sessionStorage` (not `localStorage` — survives tab reload but not browser close) at `CompareContext.tsx:40`.
- SSR-safe: reads after mount (`:98-101`).
- Defensive: validates JSON is an array, logs corrupt data via `logError` (`:42-69`).
- `QuotaExceededError` / `SecurityError` handled distinctly (`:79-86`).
- Not synced across tabs (no `storage` event listener).

## Accessibility

- Modal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (`CompareModal.tsx:332-335`); `FocusTrap` wrapper (`:322-328`); `Escape` handler (`:186-192`); focus restoration via captured `document.activeElement` (`:197-208`).
- Checkbox: `aria-pressed`, dynamic `aria-label` depending on state (`CompareCheckbox.tsx:32-40`).
- CompareBar buttons: `aria-label` per action, visible focus ring via `focus-visible:ring-*` (`CompareBar.tsx:68-71, 85, 126-128, 139-141`).

## Issues Found

- MEDIUM
  - Prompt claims **4** provider cap; actual is **3** (`constants.ts:10`). Documentation drift, not a code bug.
  - `CompareBar.handleRemoveProvider` closes modal when `selectedProviders.length <= 2` (`CompareModal.tsx:220-225`). Since the state update is async, the read of `.length` happens BEFORE React re-renders — so removing the 3rd provider still leaves length=3 at read time, which `> 2`, so modal stays open. Removing down to 1 likely evaluates after the prior state change, closing correctly. Edge case: if count would drop below 2, this check fires, but the comparison is stale one render. Consider computing with `selectedProviders.length - 1 < 2`.
- LOW
  - `useCompare` hook file is a re-export (`hooks/useCompare.ts:4`); real impl lives in `context/`. Prompt file list assumes logic is in the hook — harmless.
  - Only desktop floats bottom-right, mobile floats bottom-16 (above BottomNav). No collision check if BottomNav height changes (`CompareBar.tsx:99-108`).
  - Compare actions are not tracked in analytics (`lib/analytics.ts` has no compare-related helper). Prompt 34 flagged this separately.

## Checklist Verification

### Context
- [x] `CompareContext` created — `context/CompareContext.tsx:32`
- [x] Add/remove/clear — `:110, :120, :124`
- [x] Max **3** (prompt says 4) — `constants.ts:10`, enforced at `:113, :133`
- [x] Duplicate prevention — `:113`

### Components
- [x] `CompareCheckbox` on cards — `components/ProviderCard.tsx` references `CompareCheckbox` (grep hit; not inlined here)
- [x] `CompareBar` fixed at bottom — `CompareBar.tsx:37, 99`
- [x] `CompareModal` for side-by-side — `CompareModal.tsx:178`
- [x] Empty state handling — returns null when count=0 (`CompareBar.tsx:32-34`); modal has no empty state because caller gates it
- [x] Mobile responsive modal — `max-w-4xl`, `max-h-[90vh]`, horizontal scroll via `overflow-auto` on table wrapper (`:369`); separate mobile bar layout (`:99-155`)

### UX
- [x] Visual feedback when added — green Check icon replaces Plus (`CompareCheckbox.tsx:55-66`)
- [x] Disabled state at limit — `disabled={!isSelected && !canAddMore}` (`:31`)
- [x] Clear all — `CompareBar.tsx:84-94, 125-135`
- [x] Remove individual — table header per-provider Remove button (`CompareModal.tsx:387-392`)
- [ ] Drag to reorder — not implemented

### Accessibility
- [x] Keyboard navigation — FocusTrap + Escape (`CompareModal.tsx:186-192, 322-328`)
- [x] Screen reader support — `aria-pressed`/`aria-label`/`aria-modal`/`aria-labelledby` used
- [x] Focus management — initial focus on close button, restored to trigger on unmount (`:197-208`)

## Recommendations (ranked)

1. Reconcile prompt documentation with code: change prompt or bump `MAX_COMPARE_PROVIDERS` to 4. The 3-cap limits usefulness on wide screens where 4 cards fit easily.
2. Fix the stale-state close condition in `handleRemoveProvider` (`CompareModal.tsx:220-225`): compare against `selectedProviders.length - 1 < 2` to reflect the post-remove count.
3. Add compare-event instrumentation in `lib/analytics.ts` (e.g., `trackCompareOpen`, `trackCompareAdd`) — currently unchecked in prompt 34's checklist and still not present.
4. Persist to `localStorage` (not `sessionStorage`) behind a user toggle, and add a cross-tab `storage` event listener so the bar stays in sync.
5. Add optional sharable URL: encode NPIs into `/compare?npis=...` for emailing/shareable links.

## Open Questions

1. Is the 3-provider cap deliberate (matches 3-wide card layout) or should it match the prompt's stated 4?
2. Should comparison persist across sessions (localStorage) for logged-in users, with server-side sync?
3. Should we add "accepts my plan" column by joining the current user's saved insurance card plan vs each provider's acceptance list?
4. Should compare link generate shareable URLs or PDFs?
5. Would a mobile swipe-between-cards view beat the horizontal-scroll table?
