# Provider Comparison

**Last Updated:** 2026-02-06
**Status:** Implemented

## Features
- [x] Add up to MAX_COMPARE_PROVIDERS (constant from `lib/constants`)
- [x] Side-by-side comparison in modal with table layout
- [x] Remove from compare (with auto-close when < 2 remain)
- [x] Clear all
- [x] Session persistence via sessionStorage
- [x] Best-value highlighting across providers

## Components
- CompareContext -- Implemented (157 lines)
- CompareCheckbox -- Implemented (71 lines)
- CompareBar -- Implemented (159 lines)
- CompareModal -- Implemented (453 lines)
- useCompare hook -- Re-export from context (5 lines)

---

## CompareContext (`context/CompareContext.tsx`) -- VERIFIED

### State Management
- **Storage**: `sessionStorage` (persists across page navigations, clears on tab close)
- **Storage key**: `verifymyprovider-compare`
- **SSR-safe**: Uses `mounted` state flag; only reads sessionStorage after `useEffect`
- **Error handling**: Comprehensive -- handles `SyntaxError` (corrupt JSON), `DOMException` (security/quota), and validates parsed data is an array

### Provider Data Model
```typescript
interface CompareProvider {
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

### API
- `addProvider(provider)` -- Prevents duplicates (by NPI) and exceeding max
- `removeProvider(npi)` -- Filters by NPI
- `clearAll()` -- Resets to empty array
- `isSelected(npi)` -- Boolean check
- `canAddMore` -- `selectedProviders.length < MAX_COMPARE_PROVIDERS`

### Performance
- All callbacks wrapped in `useCallback` to prevent unnecessary re-renders
- `isSelected` depends on `selectedProviders` array (recalculates when selection changes)

### Naming conflict note
The context file exports both `CompareProvider` as an interface AND as a React component (the provider wrapper). This could cause confusion but TypeScript distinguishes between type and value exports.

---

## CompareCheckbox (`compare/CompareCheckbox.tsx`) -- VERIFIED

- Imports `useCompare` and `CompareProvider` type from `@/hooks/useCompare` (which re-exports from context)
- **Event handling**: `e.preventDefault()` and `e.stopPropagation()` -- prevents parent card navigation when clicking the checkbox
- **Disabled state**: When not selected AND at max capacity
- **Accessibility**:
  - `aria-pressed={selected}` for toggle button semantics
  - Dynamic `aria-label` with provider name and action description
  - `title` attribute when disabled explains why
- **Visual states**: Three distinct styles (selected/primary blue, disabled/gray, available/gray with hover)
- **Icons**: Checkmark when added, plus sign when available

---

## CompareBar (`compare/CompareBar.tsx`) -- VERIFIED

### Responsive Design
- **Desktop** (md+): Floating card in bottom-right corner with initials, count, Compare button, Clear button
- **Mobile** (<md): Full-width bar above bottom navigation with compact layout
- **Animation**: `animate-slide-up` class for entry animation

### Behavior
- Returns `null` when no providers selected (completely hidden)
- Compare button disabled when `count < 2` (need at least 2 to compare)
- Shows provider initials in overlapping circles (`-space-x-2`)
- Mobile shows max 3 initials (`.slice(0, 3)`)
- Opens CompareModal when Compare clicked

---

## CompareModal (`compare/CompareModal.tsx`) -- VERIFIED

### Accessibility
- **Focus trap**: Uses `focus-trap-react` library (FocusTrap component)
- **Initial focus**: Close button receives focus when modal opens
- **Escape key**: Closes modal via `keydown` event listener
- **Backdrop click**: Closes modal when clicking outside
- **ARIA**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="compare-modal-title"`
- **Body scroll lock**: `document.body.style.overflow = 'hidden'` while open

### Comparison Table
The modal displays a table with providers as columns and attributes as rows:

| Row | Data Source | Highlighting |
|-----|------------|--------------|
| Specialty | `provider.specialty` | None (usually same) |
| Health System | `provider.healthSystem` | `hasValue` -- highlights providers with an affiliation |
| Location | `provider.address + city/state/zip` | None (subjective) |
| Confidence | `provider.confidenceScore` | `highest` -- green highlight on best score |
| Status | `provider.acceptanceStatus` | `status` -- ranked ACCEPTED > PENDING > UNKNOWN |
| Verifications | `provider.verificationCount` | `highest` -- most verifications highlighted |
| Last Verified | `provider.lastVerified` | `mostRecent` -- most recent date highlighted |
| Phone | `provider.phone` | None |

### Best-Value Highlighting Algorithm (`getBestIndices`)
Supports 4 comparison types:
1. **`highest`**: Numeric comparison (used for confidenceScore, verificationCount)
2. **`mostRecent`**: Date comparison (used for lastVerified)
3. **`status`**: Ordered ranking ACCEPTED=3 > PENDING=2 > UNKNOWN=1
4. **`hasValue`**: Boolean -- highlights providers that have a value vs. those that do not

**Smart behavior**: Returns empty array (no highlighting) when:
- All values are equal (no differentiation needed)
- All values are null/undefined (no winner)
- All providers have the value (for `hasValue` type)

### Visual Design
- Max width: 4xl (max-w-4xl)
- Max height: 90vh with scrollable body
- Sticky header row and left column for scrollability
- Alternating row backgrounds
- Green background on best-value cells
- Remove button per provider in header
- Auto-closes when removing a provider drops count below 2

### Helper Functions
- `getConfidenceColor(score)` -- Returns color classes based on CONFIDENCE_THRESHOLDS constant (HIGH/MEDIUM thresholds)
- `getAcceptanceColor(status)` -- Green for ACCEPTED, yellow for PENDING, gray for others
- `formatRelativeDate(dateString)` -- Today, Yesterday, N days/weeks/months/years ago
- `ProviderInitial` -- Circular avatar with first letter of name

---

## Checklist Verification

### Context
- [x] CompareContext created -- **VERIFIED**: Full implementation with sessionStorage
- [x] Add/remove/clear functions -- **VERIFIED**: All three with proper state management
- [x] Max provider limit -- **VERIFIED**: Uses `MAX_COMPARE_PROVIDERS` from constants
- [x] Duplicate prevention -- **VERIFIED**: Checks `prev.some(p => p.npi === provider.npi)` before adding

### Components
- [x] CompareCheckbox on provider cards -- **VERIFIED**: With event propagation prevention
- [x] CompareBar fixed at bottom -- **VERIFIED**: Desktop floating + mobile full-width
- [x] CompareModal for side-by-side -- **VERIFIED**: Table-based comparison with 8 attribute rows
- [ ] Empty state handling -- **PARTIALLY**: Bar hides when empty, modal requires 2+ providers, but no empty state message in modal
- [x] Mobile responsive modal -- **VERIFIED**: Scrollable table with sticky headers, mobile-friendly bar

### UX
- [x] Visual feedback when added -- **VERIFIED**: Checkmark icon + "Added" text + primary color
- [x] Disabled state when at limit -- **VERIFIED**: Gray styling + "Remove a provider to add another" tooltip
- [x] Clear all option -- **VERIFIED**: In both desktop and mobile bars
- [x] Remove individual providers -- **VERIFIED**: Remove button in modal header per provider
- [ ] Drag to reorder -- **NOT IMPLEMENTED**

### Accessibility
- [x] Keyboard navigation -- **VERIFIED**: FocusTrap, escape key handler
- [x] Screen reader support -- **VERIFIED**: aria-pressed, aria-label, aria-modal, role="dialog"
- [x] Focus management in modal -- **VERIFIED**: Initial focus on close button, focus trap active

---

## Questions Answered

### 1. Is the 4 provider limit appropriate?
The limit is stored in `MAX_COMPARE_PROVIDERS` from `lib/constants`. The modal uses `max-w-4xl` width and `min-w-[200px]` per provider column, allowing up to 4 columns comfortably. 4 is appropriate for the current table layout. Allowing more on larger screens would require a responsive limit or horizontal scrolling (which the current implementation already supports via `overflow-auto`).

### 2. Should comparison persist across sessions?
**Currently uses sessionStorage** -- persists across page navigations within the same tab but clears when the tab is closed. This is a reasonable middle ground:
- localStorage would persist across sessions (useful if users bookmark and return)
- Server-side would require authentication (not currently implemented)
- sessionStorage avoids stale comparisons from old sessions

The prompt incorrectly states comparison is "Not persisted" -- it IS persisted in sessionStorage, which is an improvement over the initial design.

### 3. What additional fields should be compared?
Current fields compared: Specialty, Health System, Location, Confidence, Status, Verifications, Last Verified, Phone.

**Missing fields that could add value:**
- **Insurance acceptance match**: If the user has specified their insurance plan, show whether each provider accepts it
- **Distance from user**: If the user has provided a location/zip code
- **Credential**: Already in the `CompareProvider` interface but not displayed in modal
- **Telehealth availability**: Available in `provider_cms_details.telehealth`
- **Medical school / graduation year**: Available in `provider_cms_details`

### 4. Should we add comparison sharing?
**Not currently implemented.** Options:
- **URL-based sharing**: Encode NPI list in URL params (`/compare?npis=123,456,789`) -- simplest approach, no authentication needed
- **PDF export**: Would require server-side rendering or client-side PDF library
- **Social sharing**: Low priority for healthcare provider comparison

### 5. Mobile experience improvements?
**Currently implemented**: Full-width bar, compact initials, scrollable table. The modal table scrolls horizontally on mobile.

**Potential improvements:**
- Card-based layout on mobile (stacked cards instead of table columns)
- Swipe between providers
- Collapsible comparison rows

---

## Issues

1. **Naming collision**: `CompareProvider` is used as both a TypeScript interface name and a React component name in `CompareContext.tsx`. The type is exported and used in `CompareCheckbox.tsx` and `CompareModal.tsx`, while the component wraps children with the context provider.

2. **No deep link support**: The comparison state is only in sessionStorage. Users cannot share a comparison via URL or return to it after closing the tab.

3. **No loading state for provider data**: The `CompareProvider` interface stores a snapshot of provider data at the time of selection. If the provider's data changes (e.g., confidence score update), the comparison shows stale data.

4. **Missing credential display**: The `CompareProvider` interface does not include `credential`, though the comparison could benefit from showing provider credentials (MD, DO, NP, etc.).

5. **Table not ideal for mobile**: While the table scrolls horizontally on mobile, a card-based comparison view would be more natural for small screens.

---

## Recommendations

1. **Add URL-based sharing**: Encode selected NPIs in URL search params so comparisons can be bookmarked and shared. On page load, fetch provider data for any NPIs in the URL.

2. **Add credential to comparison**: Include the `credential` field in the `CompareProvider` interface and add a row to the comparison table.

3. **Add insurance match row**: If the user has searched with a specific insurance plan, show whether each provider accepts that plan. This is the most valuable comparison metric for the use case.

4. **Consider card view for mobile**: Below `md` breakpoint, render providers as swipeable cards instead of table columns. Each card would show all attributes for one provider.

5. **Fix naming collision**: Rename the React component from `CompareProvider` to `CompareProviderWrapper` or `CompareContextProvider` to distinguish it from the TypeScript interface.

6. **Add localStorage option**: Offer a "Keep for later" toggle that moves storage from sessionStorage to localStorage for persistence across sessions.
