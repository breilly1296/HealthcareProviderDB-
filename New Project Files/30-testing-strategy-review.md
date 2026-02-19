# Testing Strategy Review

**Generated:** 2026-02-18
**Prompt:** 30-testing-strategy.md
**Status:** Partially Implemented -- Good unit test coverage on core services, E2E framework in place, significant gaps in frontend component tests

---

## Summary

The testing infrastructure is set up across three layers: Jest for backend unit/integration tests, Jest for frontend unit tests (via Babel), and Playwright for E2E tests. The backend has strong coverage of core business logic (confidence scoring, verification service, rate limiter, CAPTCHA, honeypot). The frontend has tests for utility functions and schemas but lacks component tests. E2E tests cover smoke flows and several user journeys including search, comparison, theme toggle, and cookie consent. There is no CI pipeline running tests automatically.

---

## Test Inventory

### Backend Tests (Jest + ts-jest, `packages/backend/jest.config.js`)

| Test File | Type | Tests | Status |
|-----------|------|-------|--------|
| `services/__tests__/confidenceService.test.ts` | Unit | ~45 | Passing -- comprehensive |
| `services/__tests__/verificationService.test.ts` | Unit/Integration | 22 | Passing -- comprehensive |
| `services/__tests__/providerService.test.ts` | Unit | Unknown | Exists |
| `services/__tests__/planService.test.ts` | Unit | Unknown | Exists |
| `routes/__tests__/providers.test.ts` | Integration | Unknown | Exists |
| `routes/__tests__/verify.test.ts` | Integration | Unknown | Exists |
| `middleware/__tests__/rateLimiter.test.ts` | Unit | 12 | Passing -- thorough |
| `middleware/__tests__/captcha.test.ts` | Unit | Unknown | Exists |
| `middleware/__tests__/honeypot.test.ts` | Unit | Unknown | Exists |

**Total backend test files:** 9 (source), 9 (compiled .d.ts in dist/)

### Frontend Tests (Jest + Babel, `packages/frontend/jest.config.js`)

| Test File | Type | Tests | Status |
|-----------|------|-------|--------|
| `lib/__tests__/errorUtils.test.ts` | Unit | Unknown | Exists |
| `lib/__tests__/constants.test.ts` | Unit | Unknown | Exists |
| `lib/__tests__/debounce.test.ts` | Unit | Unknown | Exists |
| `lib/__tests__/imagePreprocess.test.ts` | Unit | Unknown | Exists |
| `lib/__tests__/formatName.test.ts` | Unit | Unknown | Exists |
| `lib/__tests__/insuranceCardSchema.test.ts` | Unit | Unknown | Exists |

**Total frontend test files:** 6

### E2E Tests (Playwright, `packages/frontend/playwright.config.ts`)

| Test File | Tests | Status |
|-----------|-------|--------|
| `e2e/smoke.spec.ts` | 4 tests | Homepage, search page, basic search, provider detail |
| `e2e/flows.spec.ts` | 5 tests | Search NY, filter narrowing, comparison flow, cookie consent, theme toggle, SEO/JSON-LD |

**Total E2E test files:** 2, **Total E2E tests:** ~9

---

## Configuration Details

### Root Jest Config (`jest.config.js`)
- Multi-project configuration with only `frontend` project defined
- Frontend uses `jsdom` test environment
- Path alias `@/` mapped to `<rootDir>/src/`
- CSS imports mocked via `styleMock.js`
- Transform via `babel-jest` with project-specific Babel config
- Ignores `node_modules`, `.next`, and `e2e` directories

### Backend Jest Config (`packages/backend/jest.config.js`)
- Preset: `ts-jest`
- Environment: `node`
- Roots: `<rootDir>/src`
- Coverage configured: collects from `src/**/*.ts`, excludes `.d.ts` and `index.ts`
- Coverage directory: `coverage/` (coverage HTML reports exist in `packages/backend/coverage/`)

### Frontend Jest Config (`packages/frontend/jest.config.js`)
- Environment: `node` (not jsdom -- note: root config overrides to jsdom for the frontend project)
- Path alias `@/` mapped
- CSS mocked
- Transform via `babel-jest`
- Coverage configured for `src/**/*.{ts,tsx}`

### Playwright Config (`packages/frontend/playwright.config.ts`)
- Test directory: `./e2e`
- Fully parallel execution
- Retries: 2 on CI, 0 locally
- Reporter: HTML + list
- Base URL: `http://localhost:3000` (configurable via `PLAYWRIGHT_BASE_URL`)
- Timeout: 30s per test, 5s for assertions
- Browser: Chromium only
- **Web server setup:**
  - Mock API server (`e2e/mock-api.mjs`) on port 3001 -- provides canned responses
  - Frontend Next.js on port 3000 (dev or start mode based on CI flag)
- Screenshot on failure, video on first retry, trace on first retry

---

## Verified Checklist

### Test Infrastructure
- [x] Jest configured for backend (ts-jest, node environment)
- [x] Jest configured for frontend (babel-jest, jsdom via root config)
- [x] Playwright configured for E2E (Chromium, mock API server)
- [x] Coverage reporting configured for backend
- [x] Coverage reporting configured for frontend
- [ ] CI pipeline runs tests (no CI config found)
- [ ] Coverage reports published or enforced

### Backend Tests -- Verified Content
- [x] **Confidence service** (45+ tests): Data source scoring, recency decay, specialty-based decay, verification count, community agreement, overall score calculation, level assignment, level descriptions, metadata calculations. Uses `jest.useFakeTimers()` for deterministic time-based tests.
- [x] **Verification service** (22 tests): Submit verification (create, accept/reject, sybil IP/email detection, different IP allowed, provider/plan not found, TTL setting, locationId, PII stripping, existing acceptance update), vote on verification (sourceIp required, not found, duplicate vote, vote direction change, new vote), stats, cleanup expired (dry run, actual delete, zero counts), expiration date calculation.
- [x] **Rate limiter** (12 tests): Allow within limit, 429 on exceed, exact boundary, rate limit headers (Limit, Remaining, Reset), Retry-After header, IP isolation with custom keyGenerator, tier-specific limits (10, 100, 200), custom message, skip function.
- [x] **Provider service tests** -- exists
- [x] **Plan service tests** -- exists
- [x] **CAPTCHA middleware tests** -- exists
- [x] **Honeypot middleware tests** -- exists
- [x] **Provider routes tests** -- exists
- [x] **Verify routes tests** -- exists

### Frontend Tests -- Verified Content
- [x] errorUtils tests -- exists
- [x] constants tests -- exists
- [x] debounce tests -- exists
- [x] imagePreprocess tests -- exists
- [x] formatName tests -- exists
- [x] insuranceCardSchema tests -- exists
- [ ] No component tests (SearchForm, ProviderCard, etc.)
- [ ] No hook tests (useProviderSearch, useCompare, etc.)
- [ ] No context tests (CompareContext, AuthContext, etc.)

### E2E Tests -- Verified Content
- [x] **Smoke tests**: Homepage loads (title check), search page loads (combobox/input visible), basic search (select Florida), provider detail page (info or not-found)
- [x] **Search flow**: Search NY providers, verify card structure (name, specialty, address contains "NY"), navigate to detail page, verify NPI URL, confidence gauge visible
- [x] **Filter narrowing**: Search NY, add specialty filter, verify count decreases, clear all, verify count restores
- [x] **Provider comparison**: Seed sessionStorage with 2 fake providers, verify compare bar appears, open modal, verify both names visible, close modal, clear all
- [x] **Cookie consent**: Banner appears, decline works, persists in localStorage, does not reappear on reload
- [x] **Theme toggle**: Light/dark toggle, dark class on html element, persists on reload
- [x] **Provider detail SEO**: Search, click provider, verify title contains name, meta description exists, JSON-LD with @context and @type
- [ ] No verification submission E2E test
- [ ] No insurance card upload E2E test
- [ ] No authentication flow E2E test

---

## Test Coverage Assessment

| Area | Estimated Coverage | Tests Found | Gaps |
|------|--------------------|-------------|------|
| Backend Services | ~70-80% | 4 test files (confidence, verification, provider, plan) | locationService, locationEnrichment, insuranceCardService, authService, confidenceDecayService untested |
| Backend Routes | ~30-40% | 2 test files (providers, verify) | locations, plans, admin, auth, insuranceCard, savedProviders untested |
| Backend Middleware | ~60-70% | 3 test files (rateLimiter, captcha, honeypot) | auth, csrf, errorHandler, httpLogger, requestTimeout untested |
| Frontend Utilities | ~50-60% | 6 test files | api.ts, types.ts, other utilities untested |
| Frontend Components | ~0% | 0 test files | All components untested |
| Frontend Hooks | ~0% | 0 test files | 13 hooks untested |
| E2E Critical Paths | ~50% | 9 tests across 2 files | Verification, auth, insurance card, saved providers flows missing |

---

## Recommendations

1. **Add CI pipeline**: No GitHub Actions, Cloud Build, or other CI configuration was found. Tests should run on every PR and block merges on failure.

2. **Frontend component tests are the largest gap**: The 6 existing frontend tests cover only utility functions. Priority component tests should include:
   - `SearchForm` (most user-facing component)
   - `ProviderCard` (rendering correctness)
   - `CompareCheckbox` / `CompareBar` / `CompareModal` (comparison flow)
   - `InsuranceCardUploader` (upload flow)

3. **Backend service tests to add**:
   - `insuranceCardService` -- encrypt/decrypt flow, plan matching
   - `locationService` -- search, co-location
   - `authService` -- magic link, session management

4. **E2E tests to add**:
   - Authentication flow (magic link login)
   - Insurance card scan/save/view/delete
   - Verification submission with sybil protection
   - Saved providers CRUD

5. **Mock strategy is sound**: Backend tests mock Prisma at the module level. The rate limiter tests mock Redis to force in-memory mode. The E2E tests use a mock API server (`mock-api.mjs`) for canned backend responses.

---

## Key Files

| File | Path | Purpose |
|------|------|---------|
| Root Jest Config | `jest.config.js` | Multi-project (frontend only) |
| Backend Jest Config | `packages/backend/jest.config.js` | ts-jest, node, coverage |
| Frontend Jest Config | `packages/frontend/jest.config.js` | babel-jest, node/jsdom |
| Playwright Config | `packages/frontend/playwright.config.ts` | E2E with mock API |
| Confidence Tests | `packages/backend/src/services/__tests__/confidenceService.test.ts` | 45+ tests |
| Verification Tests | `packages/backend/src/services/__tests__/verificationService.test.ts` | 22 tests |
| Rate Limiter Tests | `packages/backend/src/middleware/__tests__/rateLimiter.test.ts` | 12 tests |
| E2E Smoke Tests | `packages/frontend/e2e/smoke.spec.ts` | 4 smoke tests |
| E2E Flow Tests | `packages/frontend/e2e/flows.spec.ts` | 5 flow tests |
| Mock API Server | `packages/frontend/e2e/mock-api.mjs` | Canned API responses |
