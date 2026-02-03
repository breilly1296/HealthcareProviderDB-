---
tags:
  - feature
  - frontend
  - implemented
type: prompt
priority: 3
---

# Provider Comparison Feature

## Files to Review
- `packages/frontend/src/context/CompareContext.tsx` (comparison state)
- `packages/frontend/src/components/compare/CompareCheckbox.tsx` (add to compare)
- `packages/frontend/src/components/compare/CompareBar.tsx` (comparison bar)
- `packages/frontend/src/components/compare/CompareModal.tsx` (comparison modal)
- `packages/frontend/src/hooks/useCompare.ts` (comparison hook)

## Feature Overview

Users can compare up to 4 providers side-by-side to help make decisions about which provider to visit.

### User Flow
1. User searches for providers
2. User clicks "Compare" checkbox on provider cards
3. Compare bar appears at bottom of screen
4. User clicks "Compare X Providers" button
5. Modal opens with side-by-side comparison
6. User can remove providers or clear comparison

## Implementation

### CompareContext

```typescript
// packages/frontend/src/context/CompareContext.tsx
interface CompareContextType {
  providers: Provider[];           // Up to 4 providers
  addProvider: (provider: Provider) => void;
  removeProvider: (npi: string) => void;
  clearProviders: () => void;
  isInCompare: (npi: string) => boolean;
  canAddMore: boolean;             // false when at 4
}

export const CompareProvider: React.FC = ({ children }) => {
  const [providers, setProviders] = useState<Provider[]>([]);

  const addProvider = (provider: Provider) => {
    if (providers.length >= 4) return;
    if (providers.some(p => p.npi === provider.npi)) return;
    setProviders([...providers, provider]);
  };

  const removeProvider = (npi: string) => {
    setProviders(providers.filter(p => p.npi !== npi));
  };

  // ... rest of implementation
};
```

### CompareCheckbox

```typescript
// packages/frontend/src/components/compare/CompareCheckbox.tsx
export const CompareCheckbox: React.FC<{ provider: Provider }> = ({ provider }) => {
  const { isInCompare, addProvider, removeProvider, canAddMore } = useCompare();
  const isSelected = isInCompare(provider.npi);

  const handleToggle = () => {
    if (isSelected) {
      removeProvider(provider.npi);
    } else if (canAddMore) {
      addProvider(provider);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={!isSelected && !canAddMore}
      aria-pressed={isSelected}
    >
      {isSelected ? '✓ In Compare' : 'Compare'}
    </button>
  );
};
```

### CompareBar

Fixed bar at bottom of screen when providers are selected:

```typescript
// packages/frontend/src/components/compare/CompareBar.tsx
export const CompareBar: React.FC = () => {
  const { providers, clearProviders } = useCompare();
  const [showModal, setShowModal] = useState(false);

  if (providers.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg p-4">
      <div className="flex items-center justify-between">
        <span>{providers.length} provider(s) selected</span>
        <div className="flex gap-2">
          <button onClick={clearProviders}>Clear</button>
          <button onClick={() => setShowModal(true)}>
            Compare {providers.length} Providers
          </button>
        </div>
      </div>
      {showModal && <CompareModal onClose={() => setShowModal(false)} />}
    </div>
  );
};
```

### CompareModal

Side-by-side comparison view:

```typescript
// packages/frontend/src/components/compare/CompareModal.tsx
export const CompareModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { providers, removeProvider } = useCompare();

  return (
    <div className="modal">
      <div className="modal-content">
        <button onClick={onClose}>Close</button>
        <div className="grid grid-cols-4 gap-4">
          {providers.map(provider => (
            <ProviderCompareCard
              key={provider.npi}
              provider={provider}
              onRemove={() => removeProvider(provider.npi)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
```

## Comparison Fields

| Field | Displayed |
|-------|-----------|
| Provider name | Yes |
| Specialty | Yes |
| Address | Yes |
| Phone | Yes |
| Credential | Yes |
| Confidence score | Yes |
| Accepted plans | Yes |
| Location | Yes |

## State Persistence

Currently, comparison state is:
- **Not persisted** - cleared on page refresh
- **Not synced** - only in current browser tab

### Future Enhancement
- Store in localStorage for persistence
- Sync across tabs

## Checklist

### Context
- [x] CompareContext created
- [x] Add/remove/clear functions
- [x] Max 4 provider limit
- [x] Duplicate prevention

### Components
- [x] CompareCheckbox on provider cards
- [x] CompareBar fixed at bottom
- [x] CompareModal for side-by-side
- [ ] Empty state handling
- [ ] Mobile responsive modal

### UX
- [x] Visual feedback when added
- [x] Disabled state when at limit
- [x] Clear all option
- [x] Remove individual providers
- [ ] Drag to reorder

### Accessibility
- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] Focus management in modal

## Questions to Ask

1. **Is the 4 provider limit appropriate?**
   - Could allow more on larger screens?

2. **Should comparison persist across sessions?**
   - localStorage?
   - Server-side for logged-in users?

3. **What additional fields should be compared?**
   - Insurance acceptance match?
   - Distance from user?
   - Availability?

4. **Should we add comparison sharing?**
   - Generate shareable link?
   - Export to PDF?

5. **Mobile experience improvements?**
   - Swipe between providers?
   - Full-screen cards?

## Output Format

```markdown
# Provider Comparison

**Last Updated:** [Date]
**Status:** ✅ Implemented

## Features
- [x] Add up to 4 providers
- [x] Side-by-side comparison
- [x] Remove from compare
- [x] Clear all

## Components
- CompareContext ✅
- CompareCheckbox ✅
- CompareBar ✅
- CompareModal ✅

## Usage Stats (if available)
- Comparisons started: X
- Avg providers compared: X

## Issues
[List any issues]

## Recommendations
[List recommendations]
```
