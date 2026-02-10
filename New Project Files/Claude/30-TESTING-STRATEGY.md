# 30 - Testing Strategy

## Overview

Testing is organized across three layers: backend unit/integration tests, frontend unit tests, and end-to-end tests. The goal is reliable coverage of critical paths with pragmatic coverage targets.

## Test Stack

| Layer          | Framework         | Runner     | Notes                          |
|----------------|-------------------|------------|--------------------------------|
| Backend        | Jest 29.7         | ts-jest    | TypeScript support via ts-jest |
| Frontend Unit  | Jest              | Babel      | Babel transform for JSX/TSX    |
| Frontend E2E   | Playwright        | Playwright | Browser-based end-to-end tests |

## Test Commands

```bash
# Backend tests
npm run test:backend

# Frontend unit tests
npm run test:frontend

# End-to-end tests
npm run test:e2e
```

## Backend Tests

### Location
Tests are located alongside source files in `__tests__` directories within the backend package.

### Key Test Suites

- **`services/__tests__/confidenceService.test.ts`** - Comprehensive test suite for the confidence scoring algorithm. Tests cover:
  - Base score calculation
  - Recency weighting
  - Corroboration bonuses
  - Source diversity factors
  - Edge cases (zero verifications, expired data, conflicting votes)

## Frontend Tests

### Unit Tests
Located in `__tests__` directories within the frontend package:

- **`lib/__tests__/`** - Utility function tests
- **`hooks/__tests__/`** - Custom React hook tests
- **`components/__tests__/`** - Component rendering and interaction tests

### End-to-End Tests
Located in `packages/frontend/e2e/`:

- **Search specs** - Search flow, filters, pagination, empty states
- **Provider detail specs** - Provider page rendering, verification display, voting
- **Verification specs** - Verification submission flow, CAPTCHA interaction

## Coverage Goals

| Area              | Target | Rationale                                              |
|-------------------|--------|--------------------------------------------------------|
| Backend Services  | 80%    | Core business logic; highest value for testing         |
| Backend Routes    | 60%    | Integration-level; some coverage via E2E               |
| Frontend Hooks    | 70%    | Shared logic used across components                    |
| Frontend Components | 50%  | Visual components tested more effectively via E2E      |
| E2E Critical Paths | 100% | Search, detail view, verification, and voting flows    |

## CI Integration

### `test.yml` - Unit Tests
- Triggered on pull requests
- Runs `npm run test:backend` and `npm run test:frontend`
- Fails the PR check if any test fails

### `playwright.yml` - E2E Tests
- Triggered on staging deployments
- Runs the full Playwright suite against the staging environment
- Reports results with screenshots on failure

## Known Test Gaps

The following areas have been identified as needing additional test coverage:

- **Verification service tests** - The verification submission and retrieval logic lacks dedicated unit tests
- **Provider service tests** - Provider search and detail retrieval are tested primarily through E2E, not unit tests
- **Rate limiter tests** - The Redis and in-memory rate limiting logic has no dedicated tests
- **Most frontend component tests** - The majority of React components do not have unit tests; coverage relies on E2E

These gaps should be addressed incrementally as features stabilize.
