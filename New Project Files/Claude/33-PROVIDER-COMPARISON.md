# Provider Comparison Feature

## Status: IMPLEMENTED

## Overview

Users can compare up to 4 providers side-by-side. This feature enables informed decision-making by presenting provider attributes in a structured grid layout for direct comparison.

## User Flow

1. **Search** for providers using the standard search interface.
2. **Select** providers by clicking the Compare checkbox on provider cards.
3. **CompareBar** appears fixed at the bottom of the viewport showing selected providers.
4. **Click** "Compare X Providers" button in the CompareBar.
5. **CompareModal** opens with a side-by-side grid view of all selected providers.

## Components

### CompareContext

React context that manages the comparison state globally.

- `providers` - Array of selected providers (max 4)
- `addProvider(provider)` - Add a provider to the comparison list
- `removeProvider(npi)` - Remove a provider by NPI
- `clearAll()` - Remove all providers from the comparison
- Maximum of 4 providers enforced
- Duplicate prevention (same NPI cannot be added twice)

### CompareCheckbox

Toggle control rendered on each provider card.

- Checked state indicates provider is in the comparison list
- Disabled state when the 4-provider limit is reached (for unchecked providers)
- Clicking toggles add/remove from comparison

### CompareBar

Fixed-position bar at the bottom of the viewport.

- Displays avatars or names of selected providers
- "Clear All" button to reset the comparison
- "Compare X Providers" button to open the modal
- Only visible when at least one provider is selected

### CompareModal

Full-screen or large modal with side-by-side provider comparison.

- Grid layout with one column per provider
- Per-provider cards with a remove button (X) to deselect individual providers
- Scrollable content for long attribute lists
- Closes via backdrop click, escape key, or close button

## Comparison Fields

The following attributes are displayed for each provider in the comparison grid:

| Field | Description |
|-------|-------------|
| Name | Provider full name |
| Specialty | Primary specialty |
| Address | Practice address |
| Phone | Contact phone number |
| Credential | Professional credentials (MD, DO, NP, etc.) |
| Confidence Score | Verification confidence percentage |
| Accepted Plans | Insurance plans accepted |
| Location | Practice location details |

## State Management

### Hook: `useCompare()`

Custom hook that exposes the CompareContext for use in any component.

```typescript
const { providers, addProvider, removeProvider, clearAll } = useCompare();
```

### Persistence

State is **NOT persisted** across sessions. The comparison list is cleared on page refresh or navigation away from the application.

## Future Enhancements

- **localStorage persistence** - Maintain comparison list across page refreshes
- **Mobile swipe navigation** - Swipe between providers on small screens instead of grid
- **Drag reorder** - Allow users to reorder providers in the comparison view
- **Sharing** - Generate shareable comparison links
