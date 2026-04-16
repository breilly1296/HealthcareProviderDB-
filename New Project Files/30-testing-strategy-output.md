# Testing Strategy

**Last Updated:** 2026-04-16

## Stack

- **Backend unit/integration:** Jest 29.7 + ts-jest (`packages/backend/jest.config.js:1-15`). Verbose output enabled. Node environment.
- **Frontend unit:** Jest with Babel transform (`packages/frontend/jest.config.js:1-27`). `jsdom` env via root projects config (`jest.config.js:7-9`), but the frontend's own jest.config sets `testEnvironment: 'node'` (inconsistent — see Known Issues).
- **E2E:** Playwright 1.x, Chromium-only project (`packages/frontend/playwright.config.ts:50-56`). Bundled mock API server at `packages/frontend/e2e/mock-api.mjs` for hermetic runs.
- **Vitest / root projects config:** root `jest.config.js` only registers the `frontend` project; backend is run via its own workspace script (`npm test -w @healthcareproviderdb/backend`). No `vitest.config.ts` found — prompt's mention of Vitest is inaccurate for current state.

## Test Coverage

| Area | Count | Status | Notes |
|------|-------|--------|-------|
| Backend services | 4 files / ~132 tests | Partial | `confidenceService` (63), `planService` (15), `providerService` (25), `verificationService` (28). All Prisma-mocked. |
| Backend routes | 2 files / ~37 tests | Partial | `providers.test.ts` (22), `verify.test.ts` (15). Missing: plans, auth, admin, insuranceCard, locations, savedProviders. |
| Backend middleware | 3 files / ~39 tests | Good | captcha (14), honeypot (11), rateLimiter (14). Missing: csrf, auth, requestTimeout, errorHandler. |
| Backend scripts / utils | 0 | Missing | No tests for `importInsurancePlans.ts`, `insurancePlanParser.ts`, `confidenceDecayService.ts`, `locationEnrichment.ts`. |
| Frontend components | 0 | Missing | Zero component tests under `src/components/__tests__/`. Directory doesn't exist. |
| Frontend hooks | 0 | Missing | Zero hook tests under `src/hooks/__tests__/`. Directory doesn't exist. |
| Frontend lib/utils | 6 files / 154 tests | Good | constants, debounce, errorUtils, formatName, imagePreprocess, insuranceCardSchema. |
| E2E | 2 files / 11 tests | Thin | `smoke.spec.ts` (4 tests), `flows.spec.ts` (7 tests: search, comparison, cookie consent, theme, SEO). |

**Grand total (automated, non-E2E):** ~362 tests across 15 files.

## Test Counts

- Unit tests (backend services + middleware + frontend lib): ~325
- Integration-style route tests (supertest + mocked Prisma): ~37
- E2E tests (Playwright, Chromium only): 11
- **Total:** ~373

## CI Status

- **Tests in CI:** Yes — `.github/workflows/test.yml:41-51` runs backend + frontend Jest on every PR to `main` or `staging`.
- **Deploy gate:** Yes — `deploy.yml:18-44` and `deploy-staging.yml:18-44` each include a `test` job that `needs:` blocks the deploy.
- **Playwright in CI:** Yes — `playwright.yml:14-50`, only triggered when `packages/frontend/**` changes. Runs after building frontend; uses 2-retry policy from `playwright.config.ts:18`, `workers: 1` on CI (`playwright.config.ts:21`).
- **Coverage reporting:** No — no `--coverage` flag in CI, no Codecov/Coveralls integration, no thresholds enforced.
- **Security scans in CI:** Yes — `security-scan.yml` (gitleaks), `codeql.yml` (CodeQL weekly + on PR).

## Known Issues

1. **Prisma mocked everywhere** — every service test uses `jest.mock('../../lib/prisma', ...)`. Per project memory, integration tests should hit a real Postgres; none do. See `planService.test.ts:1-12`, `verificationService.test.ts:1-35`, `providerService.test.ts:1-12`, `providers.test.ts:5-13`, `verify.test.ts:5-15`.
2. **Inconsistent test environments** — root `jest.config.js:9` sets `testEnvironment: 'jsdom'` for frontend, but `packages/frontend/jest.config.js:5` sets `node`. The frontend's standalone config is the one invoked via `npm test -w packages/frontend`, so component tests (when added) would run in `node`, breaking React Testing Library DOM assertions.
3. **API contract drift** — frontend `planApi.getPlanTypes` calls `/plans/meta/plan-types` (`api.ts:646`) but backend route is `/meta/types` (`plans.ts:100`). No contract test catches this; E2E doesn't exercise this path.
4. **Zero frontend component/hook tests** — no `components/__tests__/` or `hooks/__tests__/` directories exist. Prompt 30's reference tree (`SearchForm.test.tsx`, `useProviderSearch.test.ts`) is aspirational, not actual.
5. **`planApi removed - unused` comment** (`api.ts:876`) contradicts `api.ts:861` which still exports `plans`. Dead-code indicator.
6. **No import-script tests** — `importInsurancePlans.ts` (560+ lines) has no fixture-driven tests despite being a data-quality-critical pipeline.
7. **Stale compiled tests** — `packages/backend/dist/middleware/__tests__/` and `dist/routes/__tests__/`, `dist/services/__tests__/` contain compiled test artifacts in the dist output. They are likely re-shipped in the Docker image unless excluded by `.dockerignore` (`.dockerignore:40-41` does exclude `**/__tests__/` and `**/*.test.ts`, so runtime image is clean).
8. **No Redis/Anthropic/Resend mock strategy** — captcha test stubs fetch globally (`captcha.test.ts:75-80`); rate limiter mocks the `redis` module to force in-memory mode (`rateLimiter.test.ts:2-5`); there's no central MSW/nock layer for Anthropic or Resend.
9. **Scratch dirs leaked into source tree** — `packages/backend/src/services/tmpclaude-*-cwd/` (22 directories) suggest prior agent runs left artifacts in the service folder. Not a test issue, but could be picked up by `testMatch: 'src/**/*.test.ts'` if any contain test files.

## Recommendations

1. **Fix API contract drift now** — rename backend `/meta/types` to `/meta/plan-types` or fix frontend `api.ts:646` to match. Add a single supertest smoke test in `plans.test.ts` hitting every endpoint so the next drift fails CI.
2. **Add a real Postgres test DB** — per project rule "no mocking the DB for integration tests", introduce a `jest-globalSetup` that spins up a throwaway Postgres (docker or testcontainers), applies `prisma migrate deploy`, and truncates between tests. Start with `planService` and `verificationService`.
3. **Write route tests for `plans.ts`** — 6 endpoints, 0 tests. Cover: filter merging, grouped carrier bucketing, `null → _count.providerAcceptances` fallback (`planService.ts:159`), pagination limits.
4. **Unify frontend Jest env** — set `testEnvironment: 'jsdom'` in `packages/frontend/jest.config.js:5` so future React component tests don't require a second config change.
5. **Seed Playwright flows against a seeded Postgres** — `flows.spec.ts:14-69` hits the real backend via `process.env.PLAYWRIGHT_BASE_URL`; CI runs the mock (`playwright.config.ts:60-68`). Decide: either commit to mock-only (remove "search for real providers in NY" semantics) or introduce a hermetic seed.
6. **Add coverage thresholds** — enable `--coverageThreshold` in `packages/backend/jest.config.js`; start low (services: 60%, routes: 40%) and ratchet up. Report to GitHub Actions via `actions/upload-artifact`.
7. **Security test suite** — dedicated `security.test.ts` exercising: CSRF token rejection, rate-limit 429 after N requests, honeypot silent-accept (already covered in `verify.test.ts:262-275`), Sybil duplicate detection at day 29 / day 31 window.
8. **Import pipeline fixtures** — create `packages/backend/src/scripts/__tests__/importInsurancePlans.test.ts` with a 5-row CSV fixture to pin parser behavior and carrier ID assignment logic.

## Checklist verification

### Setup
- [x] Jest configured for backend — `packages/backend/jest.config.js:1-15`
- [x] Jest configured for frontend — `packages/frontend/jest.config.js:1-27`
- [x] Playwright configured for E2E — `packages/frontend/playwright.config.ts`
- [x] CI pipeline runs tests — `test.yml`, `deploy.yml:18-44`, `playwright.yml`
- [ ] Coverage reports generated — no `--coverage` in any workflow, no thresholds

### Backend Tests
- [x] Confidence service tests — 63 tests in `confidenceService.test.ts`
- [x] Verification service tests — 28 tests in `verificationService.test.ts`
- [x] Provider service tests — 25 tests in `providerService.test.ts`
- [x] Rate limiter tests — 14 tests in `rateLimiter.test.ts`
- [x] CAPTCHA middleware tests — 14 tests in `captcha.test.ts`
- [x] Plan service tests — 15 tests in `planService.test.ts`
- [x] Honeypot middleware tests — 11 tests in `honeypot.test.ts`
- [ ] Plan routes tests — missing; 6 endpoints untested
- [ ] Auth middleware / route tests — missing
- [ ] Admin, insuranceCard, locations, savedProviders route tests — missing
- [ ] CSRF middleware tests — missing (`packages/backend/src/middleware/csrf.ts` exists, untested)

### Frontend Tests
- [ ] SearchForm component tests — missing (no `components/__tests__/`)
- [ ] ProviderCard component tests — missing
- [ ] Hook tests (useProviderSearch, useInsurancePlans, useHealthSystems, useCaptcha, etc.) — missing
- [x] Utility function tests — constants, debounce, errorUtils, formatName, imagePreprocess, insuranceCardSchema (6 files)

### E2E Tests
- [x] Search flow — `flows.spec.ts:12-69`
- [x] Provider detail page — `flows.spec.ts:286-341` (SEO checks)
- [ ] Verification submission — missing (no spec exercises `/verify` POST)
- [ ] Error handling — not covered (no 4xx/5xx flow test)
- [x] Cookie consent — `flows.spec.ts:220-255`
- [x] Theme toggle — `flows.spec.ts:257-283`
- [x] Provider comparison — `flows.spec.ts:144-217`

## Questions to Ask

1. **What's the current test coverage?** Unknown — no `--coverage` anywhere. Roughly estimable: services likely 30-50% line coverage (only 4 of ~10 service files tested); routes <20% (2 of 8); middleware ~40% (3 of 9); frontend components 0%.
2. **What areas are untested?** Listed above — plan routes, auth, admin routes, CSRF, all frontend components/hooks, import scripts, insurance card extraction.
3. **Are tests running in CI on every PR?** Yes (`test.yml`), and blocking deploys.
4. **Test database strategy?** No test DB — everything mocks Prisma. Violates project rule per memory note: "no mocking the DB."
5. **Flaky tests?** Probable flake sources: Playwright `waitForTimeout(1000)` in `flows.spec.ts:114,135` (arbitrary sleeps); `networkidle` waits (`smoke.spec.ts:42`) are notoriously unreliable. Captcha test uses `jest.isolateModules` with env var juggling (`captcha.test.ts:44-67`) — race-prone if tests parallelize module cache.
