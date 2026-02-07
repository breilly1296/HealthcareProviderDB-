# Testing Strategy

**Last Updated:** 2026-02-07

## Test Coverage

| Area | Coverage | Status |
|------|----------|--------|
| Backend Services | ~57% (4/7 service files have tests) | Partial |
| Backend Routes | 0% (0/6 route files have tests) | Not started |
| Backend Middleware | 0% (0/9 middleware files have tests) | Not started |
| Frontend Lib Utilities | ~50% (6/12 lib files have tests) | Partial |
| Frontend Hooks | 0% (0/8 hook files have tests) | Not started |
| Frontend Components | 0% (0/30+ component files have tests) | Not started |
| E2E Critical Paths | ~60% (search, compare, cookies, theme, SEO) | Partial |

## Test Counts

- **Backend unit tests:** 66 test cases across 4 test files
  - `confidenceService.test.ts` — 35 tests (data source scoring, recency decay, specialty-based decay, verification count, community agreement, overall score, confidence levels, descriptions, metadata)
  - `providerService.test.ts` — 20 tests (search with filters, pagination, entity type mapping, NPI lookup, display names, primary location)
  - `planService.test.ts` — 14 tests (search/filter plans, get plan by ID, get providers for plan, grouped plans)
  - `verificationService.test.ts` — 22 tests (submit verification, sybil resistance, voting, stats, cleanup, expiration)
- **Frontend unit tests:** 99 test cases across 6 test files
  - `errorUtils.test.ts` — 38 tests (error conversion, user messages, retryable status, error variants, helper functions, error state)
  - `constants.test.ts` — 20 tests (pagination, UI limits, confidence thresholds, freshness thresholds, acceptance status, entity types)
  - `debounce.test.ts` — 22 tests (basic debounce, cancel, flush, pending, leading/trailing edge, constants, edge cases)
  - `imagePreprocess.test.ts` — 14 tests (image processing, resizing, contrast, grayscale, EXIF rotation, compression, enhanced mode, quality detection)
  - `formatName.test.ts` — 21 tests (title case with special names, provider name formatting, display case, address case, full address formatting)
  - `insuranceCardSchema.test.ts` — 15 tests (JSON parsing, partial extraction, embedded JSON, failure cases, confidence scoring, plan types, prompts)
- **E2E tests:** 8 test cases across 2 spec files
  - `smoke.spec.ts` — 4 tests (homepage loads, search page loads, basic search, provider detail page)
  - `flows.spec.ts` — 4 tests (full search flow, search filter narrowing, provider comparison, cookie consent, theme toggle, SEO meta tags)
- **Total: 173 test cases**

## Testing Stack

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| Jest | 29.7 | Test runner and assertion library |
| ts-jest | 29.4.6 | TypeScript transform for Jest |
| @types/jest | 29.5.14 | TypeScript type definitions |

**Configuration:** `packages/backend/jest.config.js`
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
```

**Test command:** `node ../../node_modules/jest/bin/jest.js` (uses hoisted Jest from root)

### Frontend (Unit Tests)

| Technology | Version | Purpose |
|-----------|---------|---------|
| Jest | 29.7 | Test runner and assertion library |
| babel-jest | 29.7 | Babel transform for Jest (since Next.js SWC is not used for tests) |
| @testing-library/jest-dom | 6.9.1 | Custom DOM matchers |
| @testing-library/react | 16.3.2 | React component testing utilities |
| jest-environment-jsdom | 29.7 | Browser-like DOM environment |
| identity-obj-proxy | 3.0.0 | CSS module mocking |

**Configuration:** `packages/frontend/jest.config.js`
```javascript
const config = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
  },
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['babel-jest', { configFile: 'babel.config.jest.js' }],
  },
};
```

**Note:** The frontend uses `babel-jest` with a dedicated `babel.config.jest.js` (Babel presets for env, typescript, and react with automatic JSX runtime) because Next.js SWC is incompatible with Jest's transform pipeline. The actual Next.js build still uses SWC.

**Jest setup file** (`packages/frontend/jest.setup.js`) mocks:
- `window.matchMedia` for responsive components
- `IntersectionObserver` for lazy loading / scroll detection
- `ResizeObserver` for layout components
- Imports `@testing-library/jest-dom` for DOM assertions

### Frontend (E2E Tests)

| Technology | Version | Purpose |
|-----------|---------|---------|
| Playwright | 1.58.0 | Browser automation and E2E testing |

**Configuration:** `packages/frontend/playwright.config.ts`
- Test directory: `./e2e`
- Fully parallel execution
- Chromium-only project (single browser)
- 30-second test timeout, 5-second assertion timeout
- Screenshots on failure, trace on first retry, video on first retry
- HTML + list reporters
- CI retries: 2 (local: 0)
- CI workers: 1 (local: auto)

**Mock API server** (`packages/frontend/e2e/mock-api.mjs`): A lightweight Node.js HTTP server on port 3001 that serves canned responses so E2E tests run independently of the real backend. Handles:
- `GET /api/v1/providers/search` -- returns mock NY providers
- `GET /api/v1/providers/cities` -- returns mock city list
- `GET /api/v1/providers/:npi` -- returns a single provider
- `GET /api/v1/providers/:npi/plans` -- returns empty plan acceptances
- `GET /health` -- health check

Both the mock API and the Next.js frontend are started automatically via Playwright's `webServer` configuration.

## Test Commands

```bash
# Backend tests
npm run test:backend                # Run all backend tests
npm run test:backend -- --watch     # Watch mode
npm run test:backend -- --coverage  # With coverage report

# Frontend unit tests
npm run test -w @healthcareproviderdb/frontend      # Run all frontend tests
npm run test:watch -w @healthcareproviderdb/frontend # Watch mode
npm run test:coverage -w @healthcareproviderdb/frontend # With coverage

# E2E tests (from packages/frontend)
npm run test:e2e                    # Headless Chromium
npm run test:e2e:ui                 # Interactive Playwright UI
npm run test:e2e:headed             # Chromium with visible browser

# All tests (root level)
npm test                            # Runs backend tests only (see note below)
```

**Important note:** The root `npm test` script currently only runs backend tests (`npm run test -w @healthcareproviderdb/backend`). Frontend unit tests and E2E tests must be run separately.

## CI Status

- **Tests in CI:** Yes
- **Blocking deploys:** Yes (the deploy workflow depends on the test job passing)
- **Coverage reporting:** No (coverage is configured but not uploaded to any service)

### CI Workflows

| Workflow | File | Trigger | Tests Run |
|----------|------|---------|-----------|
| PR Test Gate | `.github/workflows/test.yml` | Pull requests to `main` or `staging` | Backend unit tests + frontend unit tests + security audit |
| Playwright E2E | `.github/workflows/playwright.yml` | Push to `main` or PRs touching `packages/frontend/**` | E2E tests (Chromium only) + report artifact upload |
| Deploy to Cloud Run | `.github/workflows/deploy.yml` | Push to `main` or manual dispatch | Backend unit tests (blocks deploy) + post-deploy smoke tests |

### Deploy Pipeline Test Integration

The deploy workflow (`deploy.yml`) runs backend tests as a prerequisite for deployment. Both backend and frontend get post-deploy smoke tests (HTTP health check on the deployed URL). The test job must pass before `deploy-backend` runs, which in turn must pass before `deploy-frontend` runs, creating a full test-then-deploy gate.

## Test Organization

### Backend Test Files

```
packages/backend/src/
  services/
    __tests__/
      confidenceService.test.ts   -- 35 tests (pure function, no mocks needed)
      providerService.test.ts     -- 20 tests (Prisma mocked)
      planService.test.ts         -- 14 tests (Prisma mocked)
      verificationService.test.ts -- 22 tests (Prisma + cache + logger mocked)
```

### Frontend Test Files

```
packages/frontend/src/
  lib/
    __tests__/
      errorUtils.test.ts          -- 38 tests (pure functions)
      constants.test.ts           -- 20 tests (value assertions)
      debounce.test.ts            -- 22 tests (fake timers, cancel/flush/pending)
      imagePreprocess.test.ts     -- 14 tests (Sharp library mocked)
      formatName.test.ts          -- 21 tests (pure functions)
      insuranceCardSchema.test.ts -- 15 tests (JSON parsing, prompt validation)
```

### E2E Test Files

```
packages/frontend/
  e2e/
    smoke.spec.ts                 -- 4 tests (page loads, basic search)
    flows.spec.ts                 -- 4 tests (search flow, comparison, cookies, theme, SEO)
    mock-api.mjs                  -- Mock backend server for E2E isolation
  playwright.config.ts            -- Playwright configuration
```

## Mocking Strategies

### Backend Mocking Patterns

All backend service tests mock three core dependencies using `jest.mock()`:

1. **Prisma Client** (`../../lib/prisma`): Each test file creates a comprehensive mock of the Prisma client with `jest.fn()` for every model method used. Example from `providerService.test.ts`:
   ```typescript
   jest.mock('../../lib/prisma', () => ({
     __esModule: true,
     default: {
       provider: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
       insurancePlan: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
       $transaction: jest.fn((fn: any) => fn()),
     },
   }));
   ```

2. **Cache utility** (`../../utils/cache`): Mocked to return `null` for cache gets (simulating cache miss) and resolve silently for sets/deletes.

3. **Logger** (`../../utils/logger`): Mocked to prevent console output during tests.

The `confidenceService.test.ts` is the exception -- it tests pure functions with no external dependencies, using only `jest.useFakeTimers()` for deterministic date calculations.

### Frontend Mocking Patterns

- **Sharp library** (in `imagePreprocess.test.ts`): Mocked with a chainable instance pattern (`.resize().normalize().toBuffer()`) since Sharp is a native Node.js module with binary dependencies.
- **CSS modules**: Proxied via `identity-obj-proxy` to return class names as strings.
- **Browser APIs** (in `jest.setup.js`): `matchMedia`, `IntersectionObserver`, and `ResizeObserver` are globally mocked.

### E2E Isolation

E2E tests use a custom mock API server (`e2e/mock-api.mjs`) instead of the real backend, providing deterministic test data without database dependencies. The server returns two hardcoded provider records for all searches, enabling predictable assertions.

## Test Quality Assessment

### Strengths

1. **Deep confidence service testing:** The `confidenceService.test.ts` file is exemplary -- 35 tests covering every scoring dimension (data source, recency, specialty-based decay, verification count, community agreement), boundary conditions, metadata calculations, and research-backed thresholds. Tests reference academic research (Mortensen et al. 2015, Ndumele et al. 2018).

2. **Thorough verification service testing:** 22 tests including sybil resistance (duplicate IP and email rejection), vote direction changes, PII stripping from responses, TTL expiration, and cleanup operations.

3. **Comprehensive utility testing:** Frontend lib tests cover edge cases thoroughly -- null/undefined handling, special name patterns (McDonald, O'Brien, hyphenated), ordinal address formatting, and all HTTP status code classifications.

4. **E2E mock isolation:** The mock API server approach ensures E2E tests are fast, deterministic, and don't require database setup.

5. **CI integration:** Tests block PRs and deployments, preventing regressions from reaching production.

### Weaknesses

1. **No route-level tests:** All 6 backend route files (`admin.ts`, `locations.ts`, `plans.ts`, `providers.ts`, `verify.ts`, `index.ts`) have zero test coverage. Route tests would verify HTTP status codes, request validation, error responses, and middleware integration.

2. **No middleware tests:** All 9 middleware files (`captcha.ts`, `errorHandler.ts`, `honeypot.ts`, `httpLogger.ts`, `rateLimiter.ts`, `requestId.ts`, `requestLogger.ts`, `requestTimeout.ts`, `index.ts`) are untested. These are critical security components.

3. **No React component tests:** Despite having `@testing-library/react` installed, zero component tests exist for any of the 30+ React components (`SearchForm.tsx`, `ProviderCard.tsx`, `ConfidenceBadge.tsx`, `InsuranceCardUploader.tsx`, etc.).

4. **No hook tests:** All 8 custom hooks (`useProviderSearch.ts`, `useCities.ts`, `useCompare.ts`, `useHealthSystems.ts`, `useInsurancePlans.ts`, `useRecentSearches.ts`, `useSearchForm.ts`, `index.ts`) are untested.

5. **Untested frontend lib files:** 6 of 12 lib files lack tests: `api.ts`, `provider-utils.ts`, `queryClient.ts`, `rateLimit.ts`, `utils.ts`, `analytics.ts`.

6. **Untested backend services:** 3 of 7 service files lack tests: `confidenceDecayService.ts`, `locationService.ts`, `locationEnrichment.ts`.

7. **Single browser E2E:** Playwright is configured for Chromium only. No Firefox or WebKit coverage.

8. **No coverage reporting in CI:** Coverage is configured locally but not integrated into CI/CD or any coverage tracking service (e.g., Codecov, Coveralls).

9. **Frontend test environment mismatch:** `jest.config.js` uses `testEnvironment: 'node'` but has jsdom setup for browser APIs. The `jest-environment-jsdom` package is installed but not configured as the environment, which could cause issues for component tests that need a full DOM.

## Known Issues

1. **Root `npm test` only runs backend tests** -- the root `package.json` script `"test": "npm run test -w @healthcareproviderdb/backend"` does not include frontend tests. This means `npm test` at the root gives a false sense of "all tests passing."

2. **Frontend test environment is `node` instead of `jsdom`** -- The frontend Jest config sets `testEnvironment: 'node'` which works for the current pure-function tests but will fail for any React component tests that need DOM APIs. The `jest-environment-jsdom` package and `jest.setup.js` are installed and configured but the environment setting needs to be changed to `jsdom` before component tests can be added.

3. **No test database strategy** -- Backend tests mock Prisma entirely. There are no integration tests that run against an actual database (in-memory, Docker, or test instance). This means database queries, migrations, and Prisma's generated SQL are never tested.

4. **E2E tests depend on specific UI selectors** -- Tests use `article` tags, CSS class selectors (`.text-\\[\\#137fec\\]`), and specific text patterns that could break with UI refactors.

5. **Playwright E2E workflow only triggers on frontend changes** -- Backend API changes that break E2E flows will not be caught because the Playwright workflow is gated to `packages/frontend/**` path changes.

## Recommendations

### Priority 1: High-Impact Gaps

1. **Add backend route tests using supertest.** Install `supertest` and write integration-style tests for each route file. This would cover request validation (Zod schemas), error handling middleware, CORS behavior, and response shapes. Example targets:
   - `packages/backend/src/routes/providers.ts` -- search endpoint validation, NPI format validation, pagination limits
   - `packages/backend/src/routes/verify.ts` -- CAPTCHA validation, honeypot checks, rate limiting
   - `packages/backend/src/routes/admin.ts` -- admin secret authentication

2. **Add middleware tests.** The rate limiter, CAPTCHA validator, honeypot, and error handler are security-critical. Test them in isolation with mock `req`/`res`/`next` objects:
   - `rateLimiter.ts` -- verify rate windows, burst limits, IP extraction
   - `captcha.ts` -- verify reCAPTCHA token validation, bypass in dev mode
   - `honeypot.ts` -- verify bot detection
   - `errorHandler.ts` -- verify error response formatting, stack trace suppression in production

3. **Fix root `npm test` to run all test suites.** Update the root `package.json`:
   ```json
   "test": "npm run test -w @healthcareproviderdb/backend && npm run test -w @healthcareproviderdb/frontend"
   ```

### Priority 2: Frontend Component Coverage

4. **Switch frontend Jest environment to `jsdom`.** Change `testEnvironment: 'node'` to `testEnvironment: 'jest-environment-jsdom'` in `packages/frontend/jest.config.js` and add `setupFilesAfterSetup: ['./jest.setup.js']` to enable the existing browser API mocks.

5. **Add React component tests starting with critical UI.** Target high-traffic components first:
   - `SearchForm.tsx` -- form submission, filter state, validation
   - `ProviderCard.tsx` -- data display, click behavior
   - `ConfidenceBadge.tsx` -- score-to-visual mapping
   - `InsuranceCardUploader.tsx` -- file upload, error states
   - `VerificationButton.tsx` / `ProviderVerificationForm.tsx` -- form validation, submission

6. **Add hook tests with `@testing-library/react`'s `renderHook`.** Priority hooks:
   - `useProviderSearch.ts` -- search state management, API integration
   - `useCompare.ts` -- comparison state, session storage persistence
   - `useSearchForm.ts` -- form state, URL parameter sync

### Priority 3: Test Infrastructure Improvements

7. **Add coverage reporting to CI.** Add a coverage upload step to `test.yml`:
   ```yaml
   - name: Run backend tests with coverage
     run: npm run test:coverage
     working-directory: packages/backend
   - name: Upload coverage
     uses: codecov/codecov-action@v4
   ```

8. **Add cross-browser E2E testing.** Expand the Playwright projects configuration:
   ```typescript
   projects: [
     { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
     { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
     { name: 'webkit', use: { ...devices['Desktop Safari'] } },
   ],
   ```

9. **Add Playwright E2E trigger for backend changes.** Update `.github/workflows/playwright.yml` paths to include backend:
   ```yaml
   paths:
     - 'packages/frontend/**'
     - 'packages/backend/src/routes/**'
     - 'packages/backend/src/services/**'
   ```

10. **Add database integration tests.** Consider using a Docker PostgreSQL container for backend integration tests that verify actual Prisma queries:
    ```yaml
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: test_db
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
    ```

### Priority 4: Coverage Targets

| Category | Current | Target | Path to Target |
|----------|---------|--------|----------------|
| Backend Services | ~57% files | 80% | Add tests for `confidenceDecayService`, `locationService`, `locationEnrichment` |
| Backend Routes | 0% | 60% | Add supertest-based route tests for all 5 route files |
| Backend Middleware | 0% | 70% | Add unit tests for all security middleware |
| Frontend Lib | ~50% files | 80% | Add tests for `api.ts`, `rateLimit.ts`, `utils.ts`, `provider-utils.ts` |
| Frontend Hooks | 0% | 70% | Add renderHook tests for all 8 hooks |
| Frontend Components | 0% | 50% | Add RTL tests for top 10 critical components |
| E2E Critical Paths | ~60% | 100% | Add verification submission flow, insurance card upload flow, error state flows |

## Appendix: File Inventory

### Backend Source Files (Testable)

| File | Tests Exist | Test File |
|------|-------------|-----------|
| `services/confidenceService.ts` | Yes | `services/__tests__/confidenceService.test.ts` (35 tests) |
| `services/providerService.ts` | Yes | `services/__tests__/providerService.test.ts` (20 tests) |
| `services/planService.ts` | Yes | `services/__tests__/planService.test.ts` (14 tests) |
| `services/verificationService.ts` | Yes | `services/__tests__/verificationService.test.ts` (22 tests) |
| `services/confidenceDecayService.ts` | No | -- |
| `services/locationService.ts` | No | -- |
| `services/locationEnrichment.ts` | No | -- |
| `services/utils.ts` | No | -- |
| `routes/providers.ts` | No | -- |
| `routes/plans.ts` | No | -- |
| `routes/verify.ts` | No | -- |
| `routes/admin.ts` | No | -- |
| `routes/locations.ts` | No | -- |
| `middleware/rateLimiter.ts` | No | -- |
| `middleware/captcha.ts` | No | -- |
| `middleware/honeypot.ts` | No | -- |
| `middleware/errorHandler.ts` | No | -- |
| `middleware/httpLogger.ts` | No | -- |
| `middleware/requestId.ts` | No | -- |
| `middleware/requestLogger.ts` | No | -- |
| `middleware/requestTimeout.ts` | No | -- |

### Frontend Source Files (Testable)

| File | Tests Exist | Test File |
|------|-------------|-----------|
| `lib/errorUtils.ts` | Yes | `lib/__tests__/errorUtils.test.ts` (38 tests) |
| `lib/constants.ts` | Yes | `lib/__tests__/constants.test.ts` (20 tests) |
| `lib/debounce.ts` | Yes | `lib/__tests__/debounce.test.ts` (22 tests) |
| `lib/imagePreprocess.ts` | Yes | `lib/__tests__/imagePreprocess.test.ts` (14 tests) |
| `lib/formatName.ts` | Yes | `lib/__tests__/formatName.test.ts` (21 tests) |
| `lib/insuranceCardSchema.ts` | Yes | `lib/__tests__/insuranceCardSchema.test.ts` (15 tests) |
| `lib/api.ts` | No | -- |
| `lib/provider-utils.ts` | No | -- |
| `lib/queryClient.ts` | No | -- |
| `lib/rateLimit.ts` | No | -- |
| `lib/utils.ts` | No | -- |
| `lib/analytics.ts` | No | -- |
| `hooks/useProviderSearch.ts` | No | -- |
| `hooks/useCities.ts` | No | -- |
| `hooks/useCompare.ts` | No | -- |
| `hooks/useHealthSystems.ts` | No | -- |
| `hooks/useInsurancePlans.ts` | No | -- |
| `hooks/useRecentSearches.ts` | No | -- |
| `hooks/useSearchForm.ts` | No | -- |
| `components/SearchForm.tsx` | No | -- |
| `components/ProviderCard.tsx` | No | -- |
| `components/InsuranceCardUploader.tsx` | No | -- |
| `components/ConfidenceBadge.tsx` | No | -- |
| `components/ProviderVerificationForm.tsx` | No | -- |
| (30+ other components) | No | -- |
