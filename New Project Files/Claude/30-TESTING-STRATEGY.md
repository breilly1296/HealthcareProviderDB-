# Testing Strategy — Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/30-testing-strategy.md
**Status:** Partially Implemented -- Infrastructure is configured but test coverage is minimal

---

## Findings

### Setup
- [x] **Jest configured for backend** -- `packages/backend/jest.config.js` exists with `ts-jest` preset, `node` environment, and roots in `<rootDir>/src`. Coverage collection configured for all `.ts` files excluding `.d.ts` and `index.ts`.
- [x] **Jest configured for frontend** -- `packages/frontend/jest.config.js` exists with `jsdom` environment, Babel transform via `babel.config.jest.js`, `@/` path alias mapping, CSS mock via `__mocks__/styleMock.js`, and coverage collection for all `.ts`/`.tsx` files.
- [x] **Playwright configured for E2E** -- `packages/frontend/playwright.config.ts` exists with `./e2e` test directory, Chromium-only project, webServer integration (dev/start), HTML+list reporters, trace/screenshot/video on failure, 30s test timeout.
- [x] **CI pipeline runs E2E tests** -- `.github/workflows/playwright.yml` runs on push/PR to `main` for `packages/frontend/**` paths. Installs Chromium, builds shared + frontend, runs E2E, uploads report artifact.
- [ ] **CI pipeline does NOT run unit tests** -- The `deploy.yml` workflow deploys directly without running Jest unit tests. No dedicated unit test CI workflow exists.
- [ ] **Coverage reports not generated in CI** -- No CI step produces or uploads Jest coverage reports. Coverage can only be run locally via `npm run test:coverage`.

### Backend Tests
- [x] **Confidence service tests** -- `packages/backend/src/services/__tests__/confidenceService.test.ts` exists with 40+ tests across 8 describe blocks covering: data source scoring, recency decay, specialty-based decay rates, verification count, community agreement, overall score calculation, confidence level assignment, confidence level description, and metadata calculations. Uses `jest.useFakeTimers()` for deterministic date testing.
- [ ] **Verification service tests** -- No test file found at `packages/backend/src/services/__tests__/verificationService.test.ts`. This is a critical gap given the service handles verification submission, Sybil prevention, consensus logic, voting, and TTL cleanup.
- [ ] **Provider service tests** -- No test file found. `providerService.ts` is untested.
- [ ] **Rate limiter tests** -- No test file at `packages/backend/src/middleware/__tests__/`. Both Redis and in-memory rate limiting modes are untested.
- [ ] **CAPTCHA middleware tests** -- No test file at `packages/backend/src/middleware/__tests__/`.

### Frontend Tests
- [x] **Utility function tests (partial)** -- `packages/frontend/src/lib/__tests__/` contains 5 test files: `constants.test.ts`, `debounce.test.ts`, `errorUtils.test.ts`, `imagePreprocess.test.ts`, `insuranceCardSchema.test.ts`.
- [ ] **SearchForm component tests** -- No `packages/frontend/src/components/__tests__/` directory exists.
- [ ] **ProviderCard component tests** -- Not found.
- [ ] **Hook tests (useProviderSearch)** -- No `packages/frontend/src/hooks/__tests__/` directory exists.

### E2E Tests
- [x] **Search flow (smoke)** -- `packages/frontend/e2e/smoke.spec.ts` contains 4 smoke tests: homepage loads, search page loads, basic search interaction, provider detail page loads. These are minimal smoke tests rather than full flow tests.
- [ ] **Provider detail page (full)** -- Only a basic "loads or shows not found" test exists in the smoke spec.
- [ ] **Verification submission** -- Not tested in E2E.
- [ ] **Error handling** -- Not tested in E2E.

### Test Infrastructure Details

| Component | File | Status |
|-----------|------|--------|
| Backend Jest Config | `packages/backend/jest.config.js` | Configured |
| Frontend Jest Config | `packages/frontend/jest.config.js` | Configured |
| Playwright Config | `packages/frontend/playwright.config.ts` | Configured |
| Backend test script | `npm run test:backend` | Works (delegates to Jest) |
| Frontend test script | `npm run test:frontend` | Not defined in root; uses `npm run test -w frontend` |
| E2E test script | `npm run test:e2e` | Defined in frontend package.json |
| Root test script | `npm test` | Only runs backend tests |
| CI unit tests | Not configured | Missing |
| CI E2E tests | `.github/workflows/playwright.yml` | Configured |
| CI deploy | `.github/workflows/deploy.yml` | No test gate |

### Test Counts (Actual)

| Category | Count | Files |
|----------|-------|-------|
| Backend unit tests | ~40 tests | 1 file (confidenceService.test.ts) |
| Frontend unit tests | ~unknown | 5 files (lib/__tests__/) |
| E2E tests | 4 tests | 1 file (smoke.spec.ts) |
| **Total test files** | **7** | |

## Summary

The project has testing infrastructure properly configured across all three layers (Jest backend, Jest frontend, Playwright E2E) but the actual test coverage is thin. The backend has one comprehensive test file for the confidence scoring algorithm (~40 tests), the frontend has 5 utility test files, and there is a single E2E smoke test file with 4 basic page-load tests.

Critical business logic in `verificationService.ts` (verification submission, Sybil prevention, consensus determination, voting, TTL cleanup) has zero test coverage. No route handlers, middleware, or React components are tested. The CI deploy pipeline does not gate on test passage -- it deploys directly on push to main.

## Recommendations

1. **Add unit test CI gate** -- Create a `.github/workflows/test.yml` that runs `npm run test:backend` and `npm run test:frontend` on every PR, blocking merge on failure. The deploy workflow should depend on test passage.

2. **Prioritize verificationService tests** -- This is the most critical untested code. Test `submitVerification` (validation, Sybil checks, consensus logic), `voteOnVerification` (duplicate prevention, count updates), and `cleanupExpiredVerifications` (TTL enforcement, dry run mode). Mock Prisma for isolation.

3. **Add rate limiter tests** -- Test both Redis and in-memory modes, sliding window behavior, fail-open behavior, and the pre-configured limiter configurations.

4. **Add admin route tests** -- Test `cleanup-expired`, `expiration-stats`, `health`, and `cache/clear` endpoints, including admin secret authentication (timing-safe comparison, 503 when unconfigured).

5. **Expand E2E tests beyond smoke** -- The current E2E tests only verify pages load. Add tests for the full search-to-detail flow, verification submission form, comparison feature, and error states.

6. **Add frontend component tests** -- Start with `CompareCheckbox`, `CompareBar`, and `CompareModal` since they have well-defined state management via `CompareContext`. The context's max-4 limit, add/remove/clear behavior, and sessionStorage persistence are all testable.

7. **Add root `test:frontend` script** -- The root `package.json` only has `test` and `test:backend`. Add `test:frontend` to make running frontend tests discoverable.

8. **Enable coverage reporting** -- Integrate coverage output into CI (e.g., upload to Codecov or similar). Set minimum coverage thresholds to prevent regression.
