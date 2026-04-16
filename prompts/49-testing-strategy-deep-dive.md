---
tags:
  - testing
  - quality
type: prompt
priority: 2
updated: 2026-04-16
role: architect
output_format: analysis
depends_on:
  - 30-testing-strategy.md
---

# Testing Strategy Deep-Dive

## Task

Audit the testing stack for VerifyMyProvider and produce a concrete improvement plan. [[30-testing-strategy]] is a high-level reference; this prompt does the deeper review: what's tested, what isn't, what's brittle, what's missing.

## Files to Review

### Backend tests
- `packages/backend/src/**/*.test.ts` — unit tests
- `packages/backend/src/**/*.spec.ts` — integration tests
- `packages/backend/jest.config.*` / `vitest.config.*` — test runner config
- `packages/backend/package.json` — test scripts, coverage targets

### Frontend tests
- `packages/frontend/src/**/*.test.ts(x)` — component/unit tests
- `packages/frontend/playwright.config.ts` — E2E config
- `packages/frontend/e2e/` or `tests/` — Playwright specs
- `packages/frontend/jest.config.*` — Jest setup

### CI integration
- `.github/workflows/*.yml` — which tests run on which trigger
- Specifically `playwright.yml` (mentioned in [[40-docker-cicd]])
- Coverage thresholds and failure policies

### Test infrastructure
- Any `test-db.ts` / fixtures / factories / seed helpers
- Prisma test reset patterns
- Mock strategies for external APIs (reCAPTCHA, Anthropic, Resend, Redis)

## Questions Claude should investigate

1. **Coverage map:** What percentage of the service layer is tested? Route handlers? Middleware? Frontend hooks? Components?
2. **Critical paths:** Are the highest-value flows covered end-to-end?
   - Verification submission (with CAPTCHA, honeypot, rate limit, Sybil check)
   - Magic link auth (request → email → verify → session)
   - Provider search (query building, caching, pagination)
   - Insurance card upload (Claude extraction, encryption, storage)
2. **Integration vs unit:** Where is the balance? Are tests hitting a real (test) Postgres, or mocking Prisma? (Memory says: **no mocking the DB** for this project — integration tests should hit a real DB.)
3. **Flake:** Which tests flake? What causes it (timing, shared state, network)?
4. **E2E reliability:** Is Playwright flaky in CI? What's the retry policy? Do tests use deterministic seed data?
5. **External API mocking:** How are Anthropic / Resend / reCAPTCHA mocked in tests? Nock? MSW? Handwritten stubs? Are the mocks drifting from real API shapes?
6. **Security tests:** Are there tests for CSRF rejection, rate-limit enforcement, CAPTCHA bypass attempts, Sybil duplicate detection, IDOR on admin endpoints?
7. **Data-layer tests:** Tests for confidence scoring edge cases (all specialty freshness tiers)? Sybil window boundary (day 29 vs day 31)? Vote-change vs duplicate-vote?
8. **Import-script tests:** The NPI and insurance-plan import scripts — are they tested against fixture CSVs?
9. **Performance regressions:** Any benchmark tests, especially for search query timings on large datasets?
10. **Contract tests:** Is there anything verifying the frontend `planApi.getProvidersForPlan` shape matches the backend response?

## Response format

```markdown
# Testing Audit — [date]

## Stack
- Backend: [Jest | Vitest], [coverage tool]
- Frontend: [Jest | Vitest + RTL], Playwright for E2E
- CI: [workflows, triggers]

## Coverage Snapshot
| Area | % Covered | Notes |
|---|---|---|
| Backend services | X% | [gaps] |
| Backend routes | X% | [gaps] |
| Frontend hooks | X% | [gaps] |
| Frontend components | X% | [gaps] |
| E2E critical paths | [n/N] | [which flows] |

## Gaps (ranked)
1. **[CRITICAL]** [gap] — [risk] — [suggested test]
2. **[HIGH]** ...

## Flake Sources
- [test file]: [cause] — [fix]

## Missing Security Tests
- [ ] [specific test to add]

## Quick Wins
- [ ] [1-2 line additions]

## Longer Investments
- [ ] [e.g. contract tests between FE and BE, benchmark harness]
```

## Checklist — known state

- [x] Jest/Vitest for backend unit tests — verify which
- [x] Playwright for E2E — `playwright.yml` workflow exists
- [x] No mocking of the database in integration tests (project rule)
- [ ] Coverage targets enforced in CI
- [ ] Flake tracking / quarantine policy
- [ ] Load / performance tests
- [ ] Contract tests between frontend and backend
- [ ] Security-specific test suite (CSRF, rate limit, Sybil, CAPTCHA)
