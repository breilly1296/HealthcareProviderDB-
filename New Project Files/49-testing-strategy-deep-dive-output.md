# Testing Audit — 2026-04-16

## Stack

- **Backend:** Jest 29.7 + ts-jest (`packages/backend/jest.config.js:1-15`). No Vitest despite prompt 30's mention. Built-in Jest coverage; no thresholds set. `pretest` script runs `prisma generate` (`packages/backend/package.json:11`) so generated client is always fresh.
- **Frontend:** Jest with Babel transform (`packages/frontend/jest.config.js:1-27`), Playwright 1.x for E2E with Chromium-only project (`packages/frontend/playwright.config.ts:50-56`).
- **CI:** `test.yml` (PR gate on main/staging — runs backend + frontend Jest), `deploy.yml` and `deploy-staging.yml` (`test` job blocks deploy), `playwright.yml` (paths-filtered to `packages/frontend/**`), `codeql.yml`, `security-scan.yml` (gitleaks). No workflow runs `--coverage`.

## Coverage Snapshot

Numbers below are **test counts, not line coverage** — no `--coverage` runs exist. Source-file counts come from `packages/backend/src/{services,routes,middleware}` and `packages/frontend/src/{components,hooks,lib}` directory listings.

| Area | Tests / files | Notes & gaps |
|---|---|---|
| Backend services | ~132 / 4 of ~10 files | Covered: `confidenceService` (63), `verificationService` (28), `providerService` (25), `planService` (15). **Untested:** `authService`, `confidenceDecayService`, `insuranceCardExtractor`, `insuranceCardService`, `locationEnrichment`, `locationService`, `mapService`, `savedProviderService`. |
| Backend routes | ~37 / 2 of 9 files | Covered: `providers` (22), `verify` (15). **Untested:** `admin`, `auth`, `insuranceCard`, `locations`, `plans`, `savedProviders`, `index`. |
| Backend middleware | ~39 / 3 of 11 files | Covered: `captcha` (14), `honeypot` (11), `rateLimiter` (14). **Untested:** `auth`, `csrf`, `errorHandler`, `httpLogger`, `requestId`, `requestLogger`, `requestTimeout`. |
| Backend scripts | 0 | **No tests** for `importInsurancePlans.ts`, `insurancePlanParser.ts`, or any of the ~20 scripts in `packages/backend/src/scripts/`. |
| Frontend components | 0 / 0 of ~60 | **No `components/__tests__/` directory exists.** Zero coverage on SearchForm, ProviderCard, InsuranceCardUploader, ProviderDetailClient, etc. |
| Frontend hooks | 0 / 0 of 13 | **No `hooks/__tests__/` directory exists.** Zero coverage on useCaptcha, useCompare, useInsuranceCard, useInsurancePlans, useMapProviders, useProviderSearch, useRecentSearches, useSearchForm, useGeoLocation, useHealthSystems, useCities. |
| Frontend lib | 154 / 6 files | constants (24), errorUtils (44), debounce (23), insuranceCardSchema (17), imagePreprocess (16), formatName (30). |
| E2E | 11 / 2 files | `smoke.spec.ts` (4: homepage, search page, basic search, provider detail), `flows.spec.ts` (7: NY search, filter narrowing, comparison modal, cookie consent, theme toggle, SEO/JSON-LD). |

**Grand total:** ~373 tests; ~15 test files.

## Critical-path coverage map

| Flow | Backend tests | Frontend tests | E2E | Status |
|---|---|---|---|---|
| Provider search query building | providerService (25), providers route (22) | 0 | `flows.spec.ts:12-69` | Partial — filter matrix not E2E-covered |
| Provider detail page | `providers/:npi` route (3 tests) | 0 | `flows.spec.ts:286-341` (SEO only) | Thin — no interaction tests |
| Verification submission | verificationService (28), verify route (15), captcha (14), honeypot (11), rateLimiter (14) | 0 | **None** | **No end-to-end check.** Form exists; no Playwright spec posts to `/verify`. |
| Magic-link auth (request → email → verify → session) | 0 | 0 | 0 | **0% coverage on auth flow.** `auth.ts` route and `authService.ts` service are entirely untested. |
| Insurance card upload + Claude extraction | 0 | `insuranceCardSchema.test.ts:17`, `imagePreprocess.test.ts:16` | 0 | **Backend flow untested.** `insuranceCardExtractor.ts` + `/api/insurance-card/extract/route.ts` have no tests. Schema + image preprocessing covered client-side only. |
| Plan search → providers-for-plan | planService (15) | 0 | 0 | Backend mocked-Prisma only; no route or integration coverage. |
| Sybil detection (window boundaries) | 0 explicit | 0 | 0 | verificationService has some coverage (28 tests) but no day-29/day-31 window test per the prompt's research-backed requirement. |
| CSRF rejection | 0 | 0 | 0 | `middleware/csrf.ts` ships untested. |
| Rate-limit 429 enforcement | `rateLimiter.test.ts` (14, in-memory mode only) | 0 | 0 | No Redis-backed path tested; Redis mocked to null (`rateLimiter.test.ts:2-5`). |

## Gaps (ranked)

1. **[CRITICAL] Zero auth-flow coverage.** `authService.ts` (magic-link token generation, Resend email, JWT session) and `routes/auth.ts` are untested. Token reuse, token expiry, replay attacks, email enumeration responses — all unverified. Suggested: integration test against a seeded Postgres with Resend mocked at the SDK boundary.

2. **[CRITICAL] Per project memory, "no mocking the DB for integration tests" — but every service test mocks Prisma.** `planService.test.ts:1-12`, `verificationService.test.ts:1-35`, `providerService.test.ts:1-12`. This is a direct policy violation that produces false confidence (the mocks pin semantics, not behavior). Suggested: introduce a single `jest-globalSetup.ts` that starts a disposable Postgres (testcontainers-node), runs `prisma migrate deploy`, and truncates between suites.

3. **[CRITICAL] Frontend-backend API contract drift is not caught.** Example live bug: `api.ts:646` calls `/plans/meta/plan-types`; backend route is `/meta/types` (`plans.ts:100`). The `planApi.search` signature accepts `carrierName, planYear` neither of which the backend parses (`plans.ts:19-24`). A contract test (pact-like) or a shared OpenAPI schema would catch this.

4. **[HIGH] `plans` route has 6 endpoints and 0 tests.** The frontend-facing contract (carrier grouping, provider lists by plan, issuer/type metadata) is entirely unchecked at the HTTP layer.

5. **[HIGH] Zero frontend component tests.** No `components/__tests__/` directory. SearchForm, ProviderVerificationForm, InsuranceCardUploader — all critical user-facing — have zero unit coverage.

6. **[HIGH] No security-focused test suite.** CSRF token rejection, reCAPTCHA bypass (expired/reused tokens), admin-endpoint IDOR, Sybil same-IP multiple-NPI in 28/30/32-day windows — none tested. `verify.test.ts` mocks CAPTCHA to pass (`verify.test.ts:39-41`), which is correct for unit but leaves the middleware's negative paths uncovered beyond `captcha.test.ts`'s basic cases.

7. **[HIGH] `verificationService.test.ts` mocks `$transaction` as a no-op.** `verificationService.test.ts:33` — `$transaction: jest.fn((fn: any) => fn(prismaDefault))`. Unsafe: the real transaction isolation guarantees (e.g., the atomic "check Sybil + insert verification" sequence) are not exercised. A mid-transaction failure scenario cannot be tested.

8. **[HIGH] Import-script (`importInsurancePlans.ts`) has no tests.** ~560 lines of CSV parsing, carrier normalization via `insurancePlanParser.ts`, confidence-scored upserts. Data-quality-critical. One fixture CSV + snapshot test would catch regressions.

9. **[MEDIUM] Playwright tests hit both a mock API and (possibly) a real backend.** `playwright.config.ts:59-68` always starts `e2e/mock-api.mjs`; `flows.spec.ts` tests expect "Found X providers" with X>0, implying real data. In CI, only the mock runs (`playwright.yml:44-49`). If the mock's response shape diverges from the real `/providers/search`, tests pass but the app breaks in production. Decide: fully hermetic mocks, or a seeded real backend.

10. **[MEDIUM] No retry on `networkidle` waits.** `flows.spec.ts:40,76,289` and `smoke.spec.ts:42,75` use `waitForLoadState('networkidle')` — notoriously flaky with analytics/PostHog pings. Combined with `waitForTimeout(1000)` sleeps (`flows.spec.ts:114,135`), this is a flake factory.

11. **[MEDIUM] `jest.isolateModules` in captcha tests.** `captcha.test.ts:58-61` re-imports the module with mutated `process.env`. If Jest ever parallelizes this file, env mutations leak. Fine today (workers default = 1 module-per-worker in CI), but fragile.

12. **[MEDIUM] No load or performance tests.** Search query timings on the `providers` and `insurance_plans` tables (hundreds of thousands of rows per memory notes) are not regression-tested.

13. **[LOW] Inconsistent Jest environment.** Root projects config sets `jsdom` for frontend (`jest.config.js:9`), but `packages/frontend/jest.config.js:5` sets `node`. Workspace script wins; adding a React Testing Library test would require flipping it.

14. **[LOW] Dead test output in `dist/`.** `packages/backend/dist/{middleware,routes,services}/__tests__/` contains compiled tests. `.dockerignore:40-41` does exclude them, but they bloat the local `dist/` tree.

## Flake Sources

- **`flows.spec.ts:114,135` — `await page.waitForTimeout(1000)`** — arbitrary sleep after a filtered search. Replace with `await page.waitForResponse(...)` (pattern already used at line 83-89).
- **`smoke.spec.ts:42,75` + all `flows.spec.ts` `waitForLoadState('networkidle')`** — PostHog or other analytics traffic defeats `networkidle`. Switch to `waitForLoadState('domcontentloaded')` + an explicit selector wait.
- **`captcha.test.ts` env-var juggling via `jest.isolateModules`** — works serially; fragile under `--maxWorkers >1`.
- **`rateLimiter.test.ts:62-77` 429-after-N-requests** — depends on in-memory store state carried across requests in one test; `beforeEach: jest.clearAllMocks()` does not reset the in-memory store. Tests use a `limiterCounter` (line 24) to sidestep this by giving each test a unique limiter name — this works but is implicit.
- **`providers.test.ts:53-65` confidence-service mock** — returns a fixed shape; if the real service adds a new field, tests pass but route handler may not pass it through.

## Missing Security Tests

- [ ] CSRF token rejection (middleware/csrf.ts has 0 tests)
- [ ] CSRF token success path (valid token → next())
- [ ] reCAPTCHA failure path in production NODE_ENV (captcha.test.ts has skip cases only)
- [ ] reCAPTCHA token reuse / score-too-low
- [ ] Rate limiter under Redis mode (all tests force in-memory via `rateLimiter.test.ts:2-5`)
- [ ] Rate limiter across multiple IPs (key partitioning)
- [ ] Sybil detection at window boundary (day 29 = allow, day 31 = block)
- [ ] Vote-change vs duplicate-vote distinction (same voter, same verification, flipped)
- [ ] IDOR on admin endpoints (non-admin caller receives 403)
- [ ] Magic-link token replay (second `/verify?token=...` with same token)
- [ ] Magic-link token expiry
- [ ] Insurance card upload size limit enforcement
- [ ] Insurance card MIME-type validation
- [ ] Honeypot field name confusability (if submitter legitimately uses `website` field — current test at `honeypot.test.ts:69-79` assumes any value blocks)
- [ ] CORS origin rejection

## Quick Wins (≤ half a day each)

- [ ] Add `plans.test.ts` route file (6 endpoints × 3 basic cases = ~18 tests). Template already exists in `providers.test.ts`.
- [ ] Rename frontend Jest env to `jsdom` and commit the one-line change. Unblocks component tests.
- [ ] Fix frontend-backend path mismatch: `api.ts:646` → `/meta/types`, or backend `plans.ts:100` → `/meta/plan-types`. Either way, add one supertest case.
- [ ] Add `--coverage` to backend test script and wire `actions/upload-artifact` upload in `test.yml`.
- [ ] Replace `waitForLoadState('networkidle')` with `waitForSelector` in both Playwright spec files.
- [ ] Add a CSRF happy-path + rejection test (15 minutes, based on honeypot test's structure).
- [ ] Delete `packages/backend/src/services/tmpclaude-*-cwd/` scratch directories (22 of them).

## Longer Investments

- [ ] **Disposable-Postgres integration harness.** `jest-globalSetup.ts` with testcontainers-node. Rewrite at least `planService.test.ts` and `verificationService.test.ts` to use real Prisma. Per project memory: this is the **correct** approach and current tests violate it.
- [ ] **Contract tests between frontend and backend.** Either a pact-style runner in CI, or share a Zod schema from `packages/shared/` and assert both `api.ts` fetches and backend Zod validators import from it.
- [ ] **Dedicated security test suite.** `packages/backend/src/__tests__/security.spec.ts` covering all items in "Missing Security Tests" above.
- [ ] **Seeded E2E environment.** Either commit to hermetic mock-API-only (and scope `flows.spec.ts` accordingly) or run a seeded Postgres + real backend in `playwright.yml`.
- [ ] **Benchmark suite for search queries.** `packages/backend/src/__tests__/bench/` with 1k/10k/100k provider seeding and `EXPLAIN ANALYZE` assertions.
- [ ] **Mock strategy unification.** Adopt MSW (or nock) at a single `test-helpers/mocks/` directory. Today each test file hand-rolls Anthropic / Resend / fetch stubs inconsistently.
- [ ] **Coverage gating.** Once baseline coverage is measured, enforce thresholds in `jest.config.js` (`coverageThreshold`) and ratchet up quarterly.

## Checklist — known state

- [x] Jest for backend unit tests — verified (`packages/backend/jest.config.js:1-15`)
- [x] Playwright for E2E — `playwright.yml` workflow exists, runs on PR / push to `packages/frontend/**`
- [ ] **No mocking of the database in integration tests (project rule)** — **VIOLATED.** Every service and route test mocks Prisma.
- [ ] Coverage targets enforced in CI — not enforced; no `--coverage` anywhere
- [ ] Flake tracking / quarantine policy — none; Playwright has `retries: 2` on CI (`playwright.config.ts:18`), no quarantine list
- [ ] Load / performance tests — none
- [ ] Contract tests between frontend and backend — none; at least one live drift exists (plans `/meta/types` path)
- [ ] Security-specific test suite (CSRF, rate limit, Sybil, CAPTCHA) — partial: rate limit + captcha + honeypot have suites; CSRF + Sybil + admin IDOR have none
