# Testing Strategy

**Last Updated:** 2026-02-06

## Test Coverage

| Area | Coverage | Status |
|------|----------|--------|
| Backend Services | Unknown (no coverage report) | Partial |
| Backend Routes | 0% | Not started |
| Frontend Libs | Unknown | Partial |
| Frontend Components | 0% | Not started |
| E2E | 2 spec files | Partial |

## Test Counts
- Backend unit tests: 4 files (confidenceService, providerService, planService, verificationService)
- Frontend unit tests: 6 files (errorUtils, constants, debounce, imagePreprocess, insuranceCardSchema, formatName)
- E2E tests: 2 files (smoke.spec.ts, flows.spec.ts)
- Total test files: 12

---

## Test Configuration: VERIFIED

### Root Jest Config (`jest.config.js`)
- Uses `projects` configuration with a single `frontend` project
- Test environment: `jsdom`
- Module mapper: `@/` to `src/`, CSS mocks
- Transform: Babel with custom Jest config (`babel.config.jest.js`)
- Excludes: `node_modules`, `.next`, `e2e`
- **Note**: Only configures frontend -- backend uses its own standalone config

### Backend Jest Config (`packages/backend/jest.config.js`)
- Preset: `ts-jest`
- Environment: `node`
- Roots: `src`
- Coverage: Collects from `src/**/*.ts`, excludes `.d.ts` and `index.ts`
- Coverage directory: `coverage`
- Verbose output enabled

### Frontend Jest Config (`packages/frontend/jest.config.js`)
- Environment: `node` (not `jsdom` -- mismatch with root config)
- Module mapper: `@/` to `src/`, CSS mocks
- Transform: Babel with custom Jest config
- Coverage: Collects from `src/**/*.{ts,tsx}`, excludes `.d.ts` and `index.ts`

### Playwright Config (`packages/frontend/playwright.config.ts`)
- Test directory: `e2e/`
- Parallel execution, 2 retries on CI
- Single browser: Chromium only
- Base URL: `http://localhost:3000`
- Trace/screenshot/video on failure
- 30s test timeout, 5s assertion timeout
- **Dual web server setup**:
  - Mock API server (`e2e/mock-api.mjs`) on port 3001
  - Next.js frontend on port 3000
- Mock API allows E2E tests to run without the real backend

### Vitest Config
- A `vitest.config.ts` file exists at the root but was not read (not referenced in any prompt). Its presence suggests possible migration planning or parallel usage.

---

## Backend Tests: DETAILED ANALYSIS

### `confidenceService.test.ts` -- VERIFIED (646 lines)
**Quality: Excellent.** Comprehensive unit test suite covering:
- Data source scoring (CMS_NPPES=25, CARRIER_API=20, CROWDSOURCE=15, null=10)
- Recency decay (day 0 through day 200+, progressive decay verification)
- Specialty-based decay rates (mental health vs radiology, primary care vs hospital-based)
- Verification count scoring (0 through 10, diminishing returns at 3)
- Community agreement scoring (100% through 0%, all tier boundaries)
- Overall score calculation (sum verification, clamping 0-100, perfect/poor inputs)
- Confidence level assignment (VERY_HIGH through VERY_LOW, capping with < 3 verifications)
- Confidence level descriptions (research notes, verification thresholds)
- Metadata calculations (isStale, daysUntilStale, recommendReVerification)
- Uses `jest.useFakeTimers()` for deterministic date testing

### `providerService.test.ts` -- EXISTS
File exists at `packages/backend/src/services/__tests__/providerService.test.ts`.

### `planService.test.ts` -- EXISTS
File exists at `packages/backend/src/services/__tests__/planService.test.ts`.

### `verificationService.test.ts` -- EXISTS
File exists at `packages/backend/src/services/__tests__/verificationService.test.ts`.

## Frontend Tests: DETAILED ANALYSIS

### `errorUtils.test.ts` -- EXISTS
Tests for error utility functions.

### `constants.test.ts` -- EXISTS
Tests for frontend constants.

### `debounce.test.ts` -- EXISTS
Tests for debounce utility.

### `imagePreprocess.test.ts` -- EXISTS
Tests for Sharp-based image preprocessing.

### `insuranceCardSchema.test.ts` -- EXISTS
Tests for Zod schema validation and confidence scoring.

### `formatName.test.ts` -- EXISTS
Tests for name formatting utilities (toDisplayCase, toAddressCase, toTitleCase).

## E2E Tests

### `smoke.spec.ts` -- EXISTS
Basic smoke tests verifying the app loads.

### `flows.spec.ts` -- EXISTS
User flow tests (likely search, provider detail).

---

## CI Status
- Tests in CI: **Unknown** -- No CI configuration files (`.github/workflows/`, `cloudbuild.yaml`) were reviewed
- Blocking deploys: **Unknown**
- Coverage reporting: **Not configured** -- Backend Jest config has `collectCoverageFrom` but no CI integration

---

## Questions Answered

### 1. What's the current test coverage?

**Backend:** Coverage collection is configured in `jest.config.js` (`collectCoverageFrom: ['src/**/*.ts']`) but no coverage reports were found. There are 4 test files covering services (confidenceService, providerService, planService, verificationService). No tests exist for routes, middleware (rateLimiter, captcha, errorHandler), or utility functions.

**Frontend:** Coverage collection is configured (`collectCoverageFrom: ['src/**/*.{ts,tsx}']`). There are 6 test files covering library/utility functions. No tests exist for React components, hooks, or context providers.

### 2. What areas are untested?

**Critical untested paths:**
- **Backend routes**: No route handler tests (providers, plans, verify, locations, admin)
- **Backend middleware**: No tests for rateLimiter, captcha, errorHandler
- **Backend Redis**: No tests for redis.ts or distributed rate limiting behavior
- **Frontend components**: No tests for SearchForm, ProviderCard, LocationCard, CompareModal, InsuranceCardUploader, ColocatedProviders
- **Frontend hooks**: No tests for useCompare, useProviderSearch, or any custom hooks
- **Frontend context**: No tests for CompareContext, ErrorContext

**Edge cases not covered:**
- Rate limiter failover behavior (Redis to in-memory)
- CAPTCHA fail-open vs fail-closed modes
- TTL expiration and cleanup logic
- Sybil attack prevention
- Location co-location matching edge cases

### 3. Are tests running in CI?

**Cannot confirm.** No CI pipeline configuration was reviewed. The Playwright config has CI-specific settings (`forbidOnly`, `retries: 2`, `workers: 1`), suggesting CI integration was planned. The mock API server for E2E tests (`e2e/mock-api.mjs`) enables CI testing without a real backend.

### 4. What's the test database strategy?

**Backend tests mock Prisma.** The `providerService.test.ts`, `planService.test.ts`, and `verificationService.test.ts` files likely mock the Prisma client since no test database configuration was found. The `confidenceService.test.ts` uses pure function testing (no database at all).

**E2E tests use a mock API.** Playwright config starts `e2e/mock-api.mjs` on port 3001, providing canned responses without requiring a real PostgreSQL database.

### 5. Are there flaky tests?

**Cannot determine from code review alone.** No flaky test tracking or retry patterns are present in the Jest configs. The Playwright config has `retries: 2` on CI, which could mask flaky tests.

---

## Known Issues

1. **Root vs frontend Jest config mismatch**: Root config sets `testEnvironment: 'jsdom'` for the frontend project, but the standalone frontend config sets `testEnvironment: 'node'`. Running tests from root vs. from `packages/frontend` may behave differently.

2. **No component tests**: Zero React component tests exist. The SearchForm, ProviderCard, and CompareModal components are complex interactive components that would benefit from testing.

3. **No middleware tests**: The rateLimiter middleware contains significant logic (sliding window algorithm, Redis vs in-memory selection, fail-open behavior) that is entirely untested.

4. **Coverage not enforced**: Neither Jest config has coverage thresholds (`coverageThreshold`) configured. Tests can be added without meeting any minimum coverage bar.

5. **Single browser in E2E**: Playwright only tests Chromium. No Firefox or Safari/WebKit testing configured.

---

## Recommendations

1. **Add coverage thresholds**: Configure `coverageThreshold` in both Jest configs to enforce minimums (suggest: 60% for backend services, 40% for frontend components).

2. **Add route handler tests**: Create integration tests for the 5 main API route files using `supertest` or similar. The admin routes are especially important since they handle data cleanup.

3. **Add middleware tests**: The rate limiter has well-defined behavior (sliding window, fail-open, Redis/memory selection) that is ideal for unit testing. Mock the Redis client and verify each code path.

4. **Add React component tests**: Prioritize testing the compare feature (CompareContext, CompareCheckbox, CompareBar, CompareModal) since it has complex state management and user interactions.

5. **Add cross-browser E2E**: Add Firefox and WebKit projects to Playwright config, at minimum for smoke tests.

6. **Resolve config mismatch**: Either remove the root `jest.config.js` or ensure the frontend standalone config matches the root project settings (particularly `testEnvironment`).

7. **Set up CI pipeline**: Configure GitHub Actions or Cloud Build to run `npm test` and `npm run test:e2e` on every PR, with coverage reporting.

8. **Add hook tests**: The `useCompare` hook (via CompareContext) has session storage persistence, max limit enforcement, and SSR safety -- all testable with `@testing-library/react`.
