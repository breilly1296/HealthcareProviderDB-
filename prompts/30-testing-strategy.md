---
tags:
  - testing
  - quality
type: prompt
priority: 2
---

# Testing Strategy Review

## Files to Review
- `jest.config.js` (root Jest configuration)
- `packages/backend/jest.config.js` (backend Jest config)
- `packages/frontend/jest.config.js` (frontend Jest config)
- `packages/backend/src/**/__tests__/` (backend tests)
- `packages/frontend/src/**/__tests__/` (frontend tests)
- `packages/frontend/playwright.config.ts` (E2E config)
- `vitest.config.ts` (Vitest configuration)

## Testing Stack

### Backend
- **Framework:** Jest 29.7 with ts-jest
- **Coverage:** Built-in Jest coverage
- **Mocking:** Jest mocks

### Frontend
- **Unit Tests:** Jest with Babel
- **E2E Tests:** Playwright
- **Test Environment:** jsdom

## Test Commands

```bash
# Backend tests
npm run test:backend
npm run test:backend -- --watch
npm run test:backend -- --coverage

# Frontend tests
npm run test:frontend
npm run test:frontend -- --watch

# E2E tests
npm run test:e2e           # Headless
npm run test:e2e:ui        # Interactive UI
npm run test:e2e:headed    # Browser visible

# All tests
npm test
```

## Test Organization

### Backend Tests
```
packages/backend/src/
├── services/
│   └── __tests__/
│       └── confidenceService.test.ts  # Unit tests
├── routes/
│   └── __tests__/
│       └── providers.test.ts          # Route tests
└── middleware/
    └── __tests__/
        └── rateLimiter.test.ts        # Middleware tests
```

### Frontend Tests
```
packages/frontend/src/
├── lib/
│   └── __tests__/
│       └── utils.test.ts              # Utility tests
├── hooks/
│   └── __tests__/
│       └── useProviderSearch.test.ts  # Hook tests
└── components/
    └── __tests__/
        └── SearchForm.test.tsx        # Component tests
```

### E2E Tests
```
packages/frontend/
├── e2e/
│   ├── search.spec.ts                 # Search flow
│   ├── provider-detail.spec.ts        # Provider pages
│   └── verification.spec.ts           # Verification flow
└── playwright.config.ts
```

## Test Categories

### Unit Tests
- Pure functions
- Service methods
- Utility functions
- Hooks (with renderHook)

### Integration Tests
- API route handlers
- Database queries (with test DB)
- Service layer with dependencies

### E2E Tests
- User flows
- Critical paths
- Cross-browser testing

## Example Tests

### Confidence Service Test
```typescript
// packages/backend/src/services/__tests__/confidenceService.test.ts
import { calculateConfidenceScore } from '../confidenceService';

describe('calculateConfidenceScore', () => {
  it('should return high score for recent CMS data with verifications', () => {
    const score = calculateConfidenceScore({
      source: 'CMS_DATA',
      lastVerified: new Date(),
      verificationCount: 5,
      upvotes: 10,
      downvotes: 0,
    });
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it('should return low score for old unverified data', () => {
    const score = calculateConfidenceScore({
      source: 'AUTOMATED',
      lastVerified: new Date('2024-01-01'),
      verificationCount: 0,
      upvotes: 0,
      downvotes: 0,
    });
    expect(score).toBeLessThanOrEqual(30);
  });
});
```

### React Component Test
```typescript
// packages/frontend/src/components/__tests__/SearchForm.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchForm } from '../SearchForm';

describe('SearchForm', () => {
  it('should call onSearch when form submitted', () => {
    const onSearch = jest.fn();
    render(<SearchForm onSearch={onSearch} />);

    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'FL' } });
    fireEvent.click(screen.getByText('Search'));

    expect(onSearch).toHaveBeenCalledWith(expect.objectContaining({ state: 'FL' }));
  });
});
```

### E2E Test
```typescript
// packages/frontend/e2e/search.spec.ts
import { test, expect } from '@playwright/test';

test('should search for providers in Florida', async ({ page }) => {
  await page.goto('/search');

  await page.selectOption('[data-testid="state-select"]', 'FL');
  await page.click('[data-testid="search-button"]');

  await expect(page.locator('[data-testid="provider-card"]')).toHaveCount.greaterThan(0);
});
```

## Coverage Goals

| Category | Current | Target |
|----------|---------|--------|
| Backend Services | ? | 80% |
| Backend Routes | ? | 60% |
| Frontend Hooks | ? | 70% |
| Frontend Components | ? | 50% |
| E2E Critical Paths | ? | 100% |

## Checklist

### Setup
- [x] Jest configured for backend
- [x] Jest configured for frontend
- [x] Playwright configured for E2E
- [ ] CI pipeline runs tests
- [ ] Coverage reports generated

### Backend Tests
- [x] Confidence service tests
- [ ] Verification service tests
- [ ] Provider service tests
- [ ] Rate limiter tests
- [ ] CAPTCHA middleware tests

### Frontend Tests
- [ ] SearchForm component tests
- [ ] ProviderCard component tests
- [ ] Hook tests (useProviderSearch)
- [ ] Utility function tests

### E2E Tests
- [ ] Search flow
- [ ] Provider detail page
- [ ] Verification submission
- [ ] Error handling

## Questions to Ask

1. **What's the current test coverage?**
   - Backend?
   - Frontend?

2. **What areas are untested?**
   - Critical paths?
   - Edge cases?

3. **Are tests running in CI?**
   - On every PR?
   - Blocking deploys?

4. **What's the test database strategy?**
   - In-memory?
   - Docker container?
   - Separate test DB?

5. **Are there flaky tests?**
   - Which ones?
   - Root causes?

## Output Format

```markdown
# Testing Strategy

**Last Updated:** [Date]

## Test Coverage
| Area | Coverage | Status |
|------|----------|--------|
| Backend Services | X% | [status] |
| Backend Routes | X% | [status] |
| Frontend | X% | [status] |
| E2E | X flows | [status] |

## Test Counts
- Unit tests: X
- Integration tests: X
- E2E tests: X
- Total: X

## CI Status
- Tests in CI: [Yes/No]
- Blocking deploys: [Yes/No]
- Coverage reporting: [Yes/No]

## Known Issues
- [Issue 1]
- [Issue 2]

## Recommendations
- [Recommendation 1]
- [Recommendation 2]
```
