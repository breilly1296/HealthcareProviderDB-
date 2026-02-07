# Monorepo Structure

**Last Updated:** 2026-02-07
**Tool:** npm workspaces
**Repository:** `git+https://github.com/breilly1296/HealthcareProviderDB-.git`
**Minimum Node Version:** >=20.0.0

---

## Table of Contents

1. [Overview](#overview)
2. [Directory Structure](#directory-structure)
3. [Packages](#packages)
4. [Workspace Configuration](#workspace-configuration)
5. [Shared Package](#shared-package)
6. [Backend Package](#backend-package)
7. [Frontend Package](#frontend-package)
8. [TypeScript Configuration](#typescript-configuration)
9. [Docker Configuration](#docker-configuration)
10. [Build Order](#build-order)
11. [Key Scripts](#key-scripts)
12. [Testing Strategy](#testing-strategy)
13. [Dependency Graph](#dependency-graph)
14. [Known Issues](#known-issues)
15. [Recommendations](#recommendations)

---

## Overview

VerifyMyProvider (HealthcareProviderDB) uses **npm workspaces** to manage a monorepo containing three packages: a shared type library, an Express.js backend API, and a Next.js 14 frontend. The monorepo pattern enables type safety across the full stack via the `@healthcareproviderdb/shared` package, while keeping backend and frontend concerns separated.

The workspace configuration uses a glob pattern (`"packages/*"`) to automatically detect all packages under the `packages/` directory:

```json
// Root package.json
{
  "name": "healthcareproviderdb",
  "private": true,
  "workspaces": [
    "packages/*"
  ]
}
```

---

## Directory Structure

```
HealthcareProviderDB/
├── package.json                # Root workspace config
├── package-lock.json           # Unified lockfile (single for all packages)
├── tsconfig.json               # Root TS config (not extended by packages)
├── tsconfig.base.json          # Base TS config (extended by shared + backend)
├── jest.config.js              # Root Jest config (multi-project: frontend)
├── vitest.config.ts            # Vitest config (root-level scripts)
├── docker-compose.yml          # Full-stack Docker (db + backend + frontend)
├── docker-compose.dev.yml      # Dev Docker (database only)
│
├── packages/
│   ├── shared/                 # @healthcareproviderdb/shared
│   │   ├── package.json
│   │   ├── tsconfig.json       # Extends ../../tsconfig.base.json
│   │   └── src/
│   │       ├── index.ts        # Re-exports all types
│   │       └── types/
│   │           ├── index.ts
│   │           ├── enums.ts
│   │           ├── provider.ts
│   │           ├── insurance-plan.ts
│   │           ├── provider-plan-acceptance.ts
│   │           └── verification.ts
│   │
│   ├── backend/                # @healthcareproviderdb/backend
│   │   ├── package.json
│   │   ├── tsconfig.json       # Extends ../../tsconfig.base.json
│   │   ├── Dockerfile          # Multi-stage (builder + runner)
│   │   ├── jest.config.js      # ts-jest, node env
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Authoritative Prisma schema
│   │   │   └── migrations/     # SQL migrations
│   │   ├── scripts/            # Data processing & infra scripts
│   │   └── src/
│   │       ├── index.ts        # Express app entry point
│   │       ├── config/         # constants.ts
│   │       ├── controllers/    # (empty -- logic in routes/services)
│   │       ├── lib/            # prisma.ts, redis.ts
│   │       ├── middleware/     # CORS, rate limiter, honeypot, captcha, etc.
│   │       ├── routes/         # providers, plans, verify, locations, admin
│   │       ├── schemas/        # Zod validation schemas
│   │       ├── scripts/        # importInsurancePlans.ts
│   │       ├── services/       # Business logic + confidence scoring
│   │       └── utils/          # cache, logger, responseHelpers, etc.
│   │
│   └── frontend/               # @healthcareproviderdb/frontend
│       ├── package.json
│       ├── tsconfig.json       # Standalone Next.js config (does NOT extend base)
│       ├── Dockerfile          # Multi-stage (builder + standalone runner)
│       ├── next.config.js      # Standalone output, security headers
│       ├── tailwind.config.ts  # Custom theme (confidence colors, large fonts)
│       ├── postcss.config.js
│       ├── jest.config.js      # babel-jest, node env
│       ├── babel.config.jest.js
│       ├── playwright.config.ts
│       ├── scripts/
│       │   └── patch-next-swc.js  # Windows ARM64 SWC WASM fallback patch
│       ├── e2e/                # Playwright end-to-end tests
│       │   ├── flows.spec.ts
│       │   ├── smoke.spec.ts
│       │   └── mock-api.mjs
│       └── src/
│           ├── app/            # Next.js 14 App Router pages
│           │   ├── layout.tsx  # Root layout with providers
│           │   ├── page.tsx    # Home page
│           │   ├── search/     # Provider search
│           │   ├── provider/[npi]/  # Provider detail
│           │   ├── insurance/  # Insurance card scan
│           │   ├── location/[locationId]/  # Location detail
│           │   ├── about/      # About page
│           │   ├── disclaimer/ # Disclaimer
│           │   ├── privacy/    # Privacy policy
│           │   ├── terms/      # Terms of service
│           │   ├── research/   # Research page
│           │   ├── api/insurance-card/extract/  # API route (Anthropic SDK)
│           │   ├── sitemap.ts  # Dynamic sitemap
│           │   └── error.tsx   # Error boundary
│           ├── components/     # 30+ React components
│           ├── context/        # ThemeContext, CompareContext, ErrorContext
│           ├── hooks/          # useProviderSearch, useInsurancePlans, etc.
│           ├── lib/            # api.ts, analytics.ts, constants.ts, utils
│           └── types/          # Frontend-specific display types
│
├── prisma/                     # Root-level Prisma schema (copy/legacy)
│   └── schema.prisma
├── scripts/                    # 40+ root-level data/infra scripts
├── src/                        # Root-level source (sync, matching, taxonomy)
├── docs/                       # Operations docs, runbooks
├── research/                   # Research files
├── researchcitations/
├── researchmarketing/
├── researchreports/
├── researchsummaries/
└── public/                     # Static assets
```

---

## Packages

| Package | Name | Purpose | Framework | Key Dependencies |
|---------|------|---------|-----------|-----------------|
| shared | `@healthcareproviderdb/shared` | Type definitions, enums, utility functions | TypeScript (compiled to CJS) | None |
| backend | `@healthcareproviderdb/backend` | REST API server | Express 4.18 + Prisma 5.22 | shared, prisma, zod, ioredis, pino, helmet |
| frontend | `@healthcareproviderdb/frontend` | Web application | Next.js 14.2 + React 18 | shared, @tanstack/react-query, tailwindcss, lucide-react, posthog-js, @anthropic-ai/sdk |

### Package Scope

All packages use the `@healthcareproviderdb` npm scope:
- `@healthcareproviderdb/shared`
- `@healthcareproviderdb/backend`
- `@healthcareproviderdb/frontend`

### Inter-Package Dependencies

Both `backend` and `frontend` depend on `shared` via wildcard version:

```json
// packages/backend/package.json
{
  "dependencies": {
    "@healthcareproviderdb/shared": "*"
  }
}

// packages/frontend/package.json
{
  "dependencies": {
    "@healthcareproviderdb/shared": "*"
  }
}
```

The wildcard `"*"` resolves to the local workspace package via npm's workspace symlink resolution.

---

## Workspace Configuration

### Root package.json

The root `package.json` defines workspace orchestration scripts, shared dependencies, and engine requirements:

```json
{
  "name": "healthcareproviderdb",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "build": "npm run build:shared && npm run build:backend && npm run build:frontend",
    "build:shared": "npm run build -w @healthcareproviderdb/shared",
    "build:backend": "npm run build -w @healthcareproviderdb/backend",
    "build:frontend": "npm run build -w @healthcareproviderdb/frontend",
    "dev": "npm run build:shared && concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "npm run dev -w @healthcareproviderdb/backend",
    "dev:frontend": "npm run dev -w @healthcareproviderdb/frontend",
    "db:generate": "npm run db:generate -w @healthcareproviderdb/backend",
    "db:push": "npm run db:push -w @healthcareproviderdb/backend",
    "db:migrate": "npm run db:migrate -w @healthcareproviderdb/backend",
    "db:studio": "npm run db:studio -w @healthcareproviderdb/backend",
    "db:seed": "npm run db:seed -w @healthcareproviderdb/backend",
    "docker:dev": "docker compose -f docker-compose.dev.yml up -d",
    "docker:dev:down": "docker compose -f docker-compose.dev.yml down",
    "docker:build": "docker compose build",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down",
    "clean": "npm run clean --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "test": "npm run test -w @healthcareproviderdb/backend",
    "test:backend": "npm run test -w @healthcareproviderdb/backend"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "csv-parse": "^6.1.0",
    "pg": "^8.16.3",
    "prisma": "^5.22.0"
  },
  "devDependencies": {
    "concurrently": "^9.2.1",
    "rimraf": "^6.1.2"
  }
}
```

**Root-level dependencies** are limited to:
- **Prisma** (shared between root scripts and backend)
- **csv-parse** and **pg** (used by root-level data import scripts in `scripts/`)
- **concurrently** (dev orchestration)
- **rimraf** (clean utility)

**Important:** `next` is intentionally NOT in the root `package.json`. Hoisting `next` to the root causes SWC version mismatches between the root and `packages/frontend`. Only the frontend workspace should own the `next` dependency.

---

## Shared Package

### Purpose

The `@healthcareproviderdb/shared` package provides type definitions, enums, and utility functions used by both backend and frontend. It compiles TypeScript to CommonJS JavaScript with declaration files for cross-package type safety.

### Package Configuration

```json
{
  "name": "@healthcareproviderdb/shared",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rimraf dist"
  }
}
```

### Exported Types and Functions

The shared package exports from `src/index.ts` -> `src/types/index.ts`:

#### Enums (`src/types/enums.ts`)
| Enum | Values | Purpose |
|------|--------|---------|
| `EntityType` | INDIVIDUAL, ORGANIZATION | Provider entity classification |
| `SpecialtyCategory` | ENDOCRINOLOGY, RHEUMATOLOGY, ORTHOPEDICS, INTERNAL_MEDICINE, FAMILY_MEDICINE, GERIATRICS, OTHER | Medical specialty categories |
| `NpiStatus` | ACTIVE, DEACTIVATED | NPI registration status |
| `PlanType` | HMO, PPO, EPO, POS, HDHP, MEDICARE_ADVANTAGE, MEDICAID, OTHER | Insurance plan types |
| `MetalLevel` | BRONZE, SILVER, GOLD, PLATINUM, CATASTROPHIC | ACA metal levels |
| `MarketType` | INDIVIDUAL, SMALL_GROUP, LARGE_GROUP, MEDICARE, MEDICAID | Insurance market segments |
| `DataSource` | CMS_NPPES, CMS_PLAN_FINDER, USER_UPLOAD, CARRIER_API, CROWDSOURCE | Data origin tracking |
| `AcceptanceStatus` | ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN | Provider-plan acceptance |
| `VerificationSource` | CMS_DATA, CARRIER_DATA, PROVIDER_PORTAL, PHONE_CALL, CROWDSOURCE, AUTOMATED | Verification origin |
| `VerificationType` | PLAN_ACCEPTANCE, PROVIDER_INFO, CONTACT_INFO, STATUS_CHANGE, NEW_PLAN | Type of verification |
| `SyncType` | NPI_FULL, NPI_WEEKLY, PLAN_IMPORT, PLAN_UPDATE | Data sync operations |
| `SyncStatus` | PENDING, IN_PROGRESS, COMPLETED, FAILED, CANCELLED | Sync progress states |

#### Interfaces (`src/types/provider.ts`)
- `Provider` -- Full provider entity with NPI, name, address, taxonomy, dates
- `ProviderWithRelations` -- Provider with plan acceptances
- `CreateProviderInput`, `UpdateProviderInput` -- Mutation DTOs
- `ProviderSearchFilters`, `ProviderSearchResult` -- Query types

#### Interfaces (`src/types/insurance-plan.ts`)
- `InsurancePlan` -- Full plan entity with carrier, coverage area, plan year
- `InsurancePlanWithRelations` -- Plan with provider count
- `CreateInsurancePlanInput`, `UpdateInsurancePlanInput` -- Mutation DTOs
- `InsurancePlanSearchFilters`, `InsurancePlanSearchResult` -- Query types

#### Interfaces (`src/types/provider-plan-acceptance.ts`)
- `ConfidenceFactors` -- Research-based scoring (dataSource, recency, verification, agreement)
- `ConfidenceMetadata` -- Staleness and re-verification recommendations
- `ConfidenceDetails` -- Complete confidence result with score, level, factors
- `ProviderPlanAcceptance` -- Provider-plan relationship with confidence scoring
- `ProviderPlanAcceptanceWithRelations` -- With full provider and plan objects

#### Interfaces (`src/types/verification.ts`)
- `VerificationLog` -- Community verification record
- `SubmitVerificationInput` -- Crowdsource submission (research-based binary questions)
- `VerificationVoteInput` -- Up/down voting
- `ReviewVerificationInput` -- Admin review

#### Utility Functions
| Function | Location | Purpose |
|----------|----------|---------|
| `getProviderDisplayName()` | provider.ts | Formats individual or organization names |
| `calculateVerificationScore()` | verification.ts | Computes score from upvotes/downvotes |
| `isVerificationTrustworthy()` | verification.ts | Requires 3+ votes with 60%+ positive ratio |
| `getConfidenceLevel()` | provider-plan-acceptance.ts | Maps numeric score to VERY_HIGH/HIGH/MEDIUM/LOW/VERY_LOW |
| `getConfidenceLevelDescription()` | provider-plan-acceptance.ts | Human-readable confidence explanation |

---

## Backend Package

### Stack

- **Runtime:** Express 4.18 on Node.js 20+
- **ORM:** Prisma 5.22 with PostgreSQL (Google Cloud SQL)
- **Validation:** Zod 3.22
- **Caching:** ioredis 5.9 (Redis) + in-memory LRU
- **Logging:** Pino 10.3 + pino-http
- **Security:** Helmet 7.1, CORS, rate limiting, honeypot, reCAPTCHA
- **Dev tooling:** tsx (watch mode), ts-jest

### API Routes

Defined in `src/routes/index.ts`:

```typescript
router.use('/providers', providersRouter);
router.use('/plans', plansRouter);
router.use('/verify', verifyRouter);
router.use('/locations', locationsRouter);
router.use('/admin', adminRouter);
```

All routes are mounted under `/api/v1` in the Express app.

### Services Layer

Defined in `src/services/index.ts`:

```typescript
export * from './confidenceService';
export * from './providerService';
export * from './planService';
export * from './verificationService';
export * from './utils';
```

Note: `locationService` is commented out due to schema differences (practice_locations is flat per-provider, not deduplicated).

### Middleware Stack (applied in order)

1. `requestId` -- UUID correlation for all requests
2. `httpLogger` -- Structured request/response logging (pino-http)
3. `helmet` -- Security headers (strict CSP for JSON API)
4. `cors` -- Allowlist: verifymyprovider.com, Cloud Run URLs, localhost in dev
5. `express.json` -- Body parsing with 100kb size limit
6. Health check (`/health`) -- Before rate limiter
7. `rateLimiter` -- 200 requests/hour default
8. `requestLogger` -- Usage tracking without PII
9. `requestTimeout` -- 30s timeout for `/api/v1` routes
10. Routes (`/api/v1`)
11. `notFoundHandler` -- 404 for unmatched routes
12. `errorHandler` -- Global error handler

### Prisma Schema

The authoritative Prisma schema lives at `packages/backend/prisma/schema.prisma`. It defines 13 models:

| Model | Table | Primary Key | Purpose |
|-------|-------|-------------|---------|
| `Provider` | providers | npi (VARCHAR 10) | Healthcare providers from NPI registry |
| `hospitals` | hospitals | ccn (VARCHAR 20) | Hospital reference data |
| `practice_locations` | practice_locations | id (autoincrement) | Provider practice addresses |
| `provider_cms_details` | provider_cms_details | npi | CMS supplemental data (med school, telehealth) |
| `provider_hospitals` | provider_hospitals | id (autoincrement) | Provider-hospital affiliations |
| `provider_insurance` | provider_insurance | id (autoincrement) | NPI other identifiers (network names) |
| `provider_medicare` | provider_medicare | id (autoincrement) | Medicare IDs per provider |
| `provider_taxonomies` | provider_taxonomies | id (autoincrement) | Secondary taxonomy codes |
| `taxonomy_reference` | taxonomy_reference | taxonomy_code | NUCC taxonomy lookup table |
| `InsurancePlan` | insurance_plans | plan_id (VARCHAR 50) | Insurance plan metadata |
| `ProviderPlanAcceptance` | provider_plan_acceptance | id (autoincrement) | Provider-plan acceptance with confidence scores |
| `VerificationLog` | verification_logs | id (cuid) | Community verification submissions |
| `VoteLog` | vote_logs | id (cuid) | Up/down votes on verifications |
| `SyncLog` | sync_logs | id (autoincrement) | Data sync operation tracking |
| `DataQualityAudit` | data_quality_audit | id (autoincrement) | Data quality issue tracking |

The schema uses:
- `@map()` for camelCase TypeScript to snake_case PostgreSQL column mapping
- `@@map()` for PascalCase model to snake_case table mapping
- `@default(cuid())` for application-generated text PKs (verification_logs, vote_logs)
- Enums: `AcceptanceStatus`, `VerificationSource`, `VerificationType`

**Note:** There is also a root-level `prisma/schema.prisma` that is a near-identical copy. The backend version has minor differences (e.g., `nppesLastSynced` with `@map` vs `nppes_last_synced` without; partial unique indexes via SQL comments vs Prisma `@@unique`). The backend version is authoritative.

### Backend Scripts

Located in `packages/backend/scripts/`:

- `seed.ts` -- Database seeding
- `analyze-health-systems.ts`, `match-facilities.ts` -- Health system analysis
- `enrich-location-names.ts`, `extract-nyc-providers.ts` -- Data enrichment
- Infrastructure: `setup-cloud-armor.sh`, `setup-alerts.sh`, `setup-log-retention.sh`, etc.

### Test Configuration

```javascript
// packages/backend/jest.config.js
{
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts']
}
```

Test files in `src/services/__tests__/`:
- `confidenceService.test.ts`
- `planService.test.ts`
- `providerService.test.ts`
- `verificationService.test.ts`

---

## Frontend Package

### Stack

- **Framework:** Next.js 14.2 (App Router) with React 18.3
- **Styling:** TailwindCSS 3.3 with custom theme (confidence colors, accessibility-focused larger fonts)
- **State/Data:** @tanstack/react-query 5.90
- **AI Integration:** @anthropic-ai/sdk 0.71 (insurance card OCR)
- **Analytics:** PostHog
- **Icons:** lucide-react 0.563
- **Notifications:** react-hot-toast
- **Testing:** Jest + @testing-library/react, Playwright for E2E
- **Output:** Standalone mode for Docker deployment

### Next.js Configuration

```javascript
// packages/frontend/next.config.js
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',          // Docker-optimized output
  swcMinify: false,              // Disabled for ARM64 compatibility
  experimental: {
    turbo: undefined,            // Turbopack disabled for ARM64
    serverComponentsExternalPackages: ['sharp', 'detect-libc'],
  },
  // Security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
  // Referrer-Policy, Permissions-Policy
};
```

### App Router Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Home page with search CTA |
| `/search` | `app/search/page.tsx` | Provider search with filters |
| `/provider/[npi]` | `app/provider/[npi]/page.tsx` | Provider detail with plans |
| `/insurance` | `app/insurance/page.tsx` | Insurance card scan (AI-powered) |
| `/location/[locationId]` | `app/location/[locationId]/` | Location detail |
| `/about` | `app/about/page.tsx` | About VerifyMyProvider |
| `/disclaimer` | `app/disclaimer/page.tsx` | Data disclaimer |
| `/privacy` | `app/privacy/` | Privacy policy |
| `/terms` | `app/terms/` | Terms of service |
| `/research` | `app/research/` | Research page |
| `/api/insurance-card/extract` | `app/api/.../route.ts` | Server-side API route (Anthropic SDK) |
| `/sitemap.xml` | `app/sitemap.ts` | Dynamic sitemap generation |

### Component Architecture

Key components in `src/components/`:

- **Layout:** `Header.tsx`, `BottomNav.tsx`, `ScrollToTop.tsx`
- **Search:** `SearchForm.tsx`, `FilterButton.tsx`, `FilterDrawer.tsx`, `RecentSearches.tsx`
- **Provider:** `ProviderCard.tsx`, `ProviderCardSkeleton.tsx`, `provider-detail/`, `ProviderVerificationForm.tsx`
- **Confidence:** `ConfidenceBadge.tsx`, `ConfidenceScoreBreakdown.tsx`, `FreshnessWarning.tsx`
- **Compare:** `compare/` directory, integrated via `CompareBar`
- **Insurance:** `InsuranceCardUploader.tsx`
- **UI:** `ui/` directory with base components
- **Providers:** `PostHogProvider.tsx`, `ToastProvider.tsx`
- **UX:** `CookieConsent.tsx`, `WelcomeBackBanner.tsx`, `GlobalErrorBanner.tsx`, `Disclaimer.tsx`

### Context Providers (applied in RootLayout)

```
PostHogProvider > QueryProvider > ThemeProvider > CompareProvider > ErrorProvider
```

- `ThemeContext` -- Dark/light/system theme with localStorage persistence
- `CompareContext` -- Provider comparison (up to 3)
- `ErrorContext` -- Global error state management

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useProviderSearch` | Provider search with filters and pagination |
| `useInsurancePlans` | Insurance plan queries |
| `useCities` | City autocomplete by state |
| `useHealthSystems` | Health system filter data |
| `useCompare` | Provider comparison management |
| `useRecentSearches` | Search history (localStorage) |
| `useSearchForm` | Search form state management |

### API Client

The frontend communicates with the backend via a structured API client (`src/lib/api.ts`):

```typescript
const api = {
  providers: { search, getByNpi, getCities, getPlans, getColocated },
  plans:     { search, getGrouped, getIssuers, getPlanTypes, getById, getProviders },
  verify:    { submit, vote, getStats, getRecent, getForPair },
  locations: { search, getHealthSystems, getById, getProviders, getStats },
};
```

Features:
- Automatic retry with exponential backoff (2 retries, 1s base delay)
- Respects `Retry-After` headers for 429 responses
- Retries on 429, 5xx, and network errors
- `ApiError` class with helper methods (`isRateLimited()`, `isRetryable()`, etc.)
- Toast notifications for rate limiting

### Windows ARM64 SWC Patch

The frontend includes a `postinstall` script (`scripts/patch-next-swc.js`) that patches Next.js 14.x to support Windows ARM64 via WASM fallback:

1. Adds `"aarch64-pc-windows-msvc"` to `knownDefaultWasmFallbackTriples`
2. Removes the `useWasmBinary` gate for unsupported platforms
3. Runs automatically on `npm install`

The `@next/swc-wasm-nodejs` package is included as a devDependency to provide the WASM fallback binary.

### Frontend Test Configuration

**Unit tests (Jest):**
```javascript
// packages/frontend/jest.config.js
{
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: { '^.+\\.(ts|tsx|js|jsx)$': ['babel-jest', { configFile: 'babel.config.jest.js' }] },
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)']
}
```

**E2E tests (Playwright):**
- `e2e/smoke.spec.ts` -- Smoke tests
- `e2e/flows.spec.ts` -- User flow tests
- `e2e/mock-api.mjs` -- API mocking for isolated testing

---

## TypeScript Configuration

### Three-Tier Setup

The project uses three tiers of TypeScript configuration:

**1. Root `tsconfig.base.json` (shared base for backend + shared)**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**2. Root `tsconfig.json` (for root-level scripts)**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["node", "jest"]
  },
  "include": ["src/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**3. Package-specific configs:**

| Package | Extends | Module | Notable Settings |
|---------|---------|--------|------------------|
| shared | `../../tsconfig.base.json` | commonjs | `rootDir: ./src`, `outDir: ./dist` |
| backend | `../../tsconfig.base.json` | commonjs | `rootDir: ./src`, `outDir: ./dist`, excludes location files |
| frontend | (standalone) | esnext | `moduleResolution: bundler`, `jsx: preserve`, `noEmit: true`, strict null checks, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` |

The frontend tsconfig is **standalone** (does not extend `tsconfig.base.json`) because Next.js requires its own module resolution strategy (`esnext` module, `bundler` moduleResolution, `jsx: preserve`).

---

## Docker Configuration

### docker-compose.yml (Full Stack)

Three services for production-like deployment:

```yaml
services:
  db:        # postgres:15-alpine, port 5432
  backend:   # packages/backend/Dockerfile, port 3001->8080
  frontend:  # packages/frontend/Dockerfile, port 3000->8080
```

### docker-compose.dev.yml (Development)

Database only for local development:

```yaml
services:
  db:        # postgres:15-alpine, port 5432
```

### Backend Dockerfile

Multi-stage build:
1. **Builder stage:** Installs all deps, builds shared, generates Prisma client, builds backend
2. **Runner stage:** Installs production deps only, copies built artifacts + Prisma client
3. Runs as non-root `expressjs` user on port 8080
4. Health check via `wget` to `/health`

### Frontend Dockerfile

Multi-stage build:
1. **Builder stage:** Installs all deps, builds shared, then `next build` with standalone output
2. **Runner stage:** Copies standalone build, static assets, public directory
3. Runs as non-root `nextjs` user on port 8080
4. Uses `node packages/frontend/server.js` (Next.js standalone server)

Both Dockerfiles:
- Use `node:20-alpine` base images
- Build shared package first (`cd packages/shared && npm run build`)
- Copy workspace config files for proper npm resolution
- Use `--force` flag on `npm install` for native module compatibility
- Expose port 8080 (Google Cloud Run convention)

---

## Build Order

Dependencies require a specific build order:

```
1. @healthcareproviderdb/shared    (no dependencies)
        |
        +---> 2. @healthcareproviderdb/backend   (depends on shared)
        |
        +---> 3. @healthcareproviderdb/frontend   (depends on shared)
```

The root `build` script enforces this order:

```bash
npm run build:shared && npm run build:backend && npm run build:frontend
```

Backend and frontend can be built in parallel after shared is built, but the root script builds them sequentially for simplicity.

The `dev` script also respects this:

```bash
npm run build:shared && concurrently "npm run dev:backend" "npm run dev:frontend"
```

Shared is built first, then backend (tsx watch on port 3001) and frontend (next dev on port 3000) start concurrently.

---

## Key Scripts

### Development

| Command | Description |
|---------|-------------|
| `npm install` | Install all workspace dependencies from root |
| `npm run dev` | Build shared, then start backend + frontend concurrently |
| `npm run dev:backend` | Start backend with tsx watch (port 3001) |
| `npm run dev:frontend` | Start frontend with next dev (port 3000) |

### Build

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages in dependency order |
| `npm run build:shared` | Build shared types to dist/ |
| `npm run build:backend` | Compile backend TypeScript |
| `npm run build:frontend` | Build Next.js production bundle |

### Database

| Command | Description |
|---------|-------------|
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema changes to database |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:seed` | Seed database via tsx |

### Docker

| Command | Description |
|---------|-------------|
| `npm run docker:dev` | Start development database |
| `npm run docker:dev:down` | Stop development database |
| `npm run docker:build` | Build all Docker images |
| `npm run docker:up` | Start full stack (db + backend + frontend) |
| `npm run docker:down` | Stop full stack |

### Testing

| Command | Description |
|---------|-------------|
| `npm run test` | Run backend tests (Jest) |
| `npm run test:backend` | Run backend tests (Jest) |
| `npm run lint` | Run linters across all workspaces |
| `npm run clean` | Clean dist/ in all workspaces |

### Adding Dependencies

```bash
# To a specific workspace
npm install express -w @healthcareproviderdb/backend
npm install lucide-react -w @healthcareproviderdb/frontend

# Dev dependency to a workspace
npm install -D @types/express -w @healthcareproviderdb/backend

# Shared root dependency
npm install -D concurrently
```

---

## Testing Strategy

| Layer | Tool | Config | Test Files |
|-------|------|--------|------------|
| Backend unit | Jest + ts-jest | `packages/backend/jest.config.js` | `src/services/__tests__/*.test.ts` |
| Frontend unit | Jest + babel-jest + @testing-library/react | `packages/frontend/jest.config.js` | `src/**/__tests__/*.test.ts(x)` |
| Frontend E2E | Playwright | `packages/frontend/playwright.config.ts` | `e2e/*.spec.ts` |
| Root (multi-project) | Jest | `jest.config.js` (root) | Runs frontend tests from root |
| Root scripts | Vitest | `vitest.config.ts` | `tests/**/*.test.ts` |

---

## Dependency Graph

```
                    ┌─────────────────────────────────────┐
                    │        Root (healthcareproviderdb)    │
                    │                                       │
                    │  Dependencies:                        │
                    │    @prisma/client, csv-parse, pg,     │
                    │    prisma                             │
                    │  DevDeps:                             │
                    │    concurrently, rimraf               │
                    └──────────┬───────────────┬───────────┘
                               │               │
                ┌──────────────▼──┐    ┌───────▼──────────────┐
                │    frontend     │    │      backend          │
                │  (Next.js 14)   │    │    (Express 4)        │
                │                 │    │                        │
                │  next, react,   │    │  express, prisma,     │
                │  tailwindcss,   │    │  ioredis, zod,        │
                │  @tanstack/     │    │  pino, helmet,        │
                │   react-query,  │    │  cors, dotenv         │
                │  @anthropic-ai/ │    │                        │
                │   sdk, posthog  │    │                        │
                └────────┬────────┘    └──────────┬────────────┘
                         │                        │
                         │   depends on           │  depends on
                         │                        │
                         └────────┬───────────────┘
                                  │
                         ┌────────▼────────┐
                         │     shared       │
                         │    (types)       │
                         │                  │
                         │  Zero runtime    │
                         │  dependencies    │
                         └─────────────────┘
```

### Notable Dependency Choices

- **Prisma** appears in both root and backend `package.json`. Root-level for data scripts; backend for the API.
- **Zod** appears in both backend (`^3.22.4`) and frontend (`^3.25.76`). Different versions -- the frontend has a newer minor version.
- **TypeScript** is a devDependency only in backend and frontend packages (not root or shared), relying on hoisted installation.

---

## Known Issues

### 1. Dual Prisma Schema

There are two `schema.prisma` files:
- `prisma/schema.prisma` (root level)
- `packages/backend/prisma/schema.prisma` (authoritative)

They are nearly identical but have small divergences:
- Root uses `nppes_last_synced` (raw column name); backend uses `nppesLastSynced` with `@map("nppes_last_synced")`
- Root uses `@@unique([providerNpi, planId])` on `ProviderPlanAcceptance`; backend uses SQL comments for partial unique indexes

The backend version should be treated as the source of truth. The root copy is potentially stale.

### 2. Root-Level Source Code

There is a `src/` directory at the root level containing API, matching, sync, and taxonomy code. This appears to be legacy or utility code that predates the monorepo structure. It is not part of any workspace package.

### 3. Empty Controllers Directory

`packages/backend/src/controllers/` exists but is empty. Business logic is split between routes (request handling) and services (data access/business rules).

### 4. Location Service Disabled

`locationService` is commented out in `packages/backend/src/services/index.ts` because `practice_locations` is a flat per-provider table, not a deduplicated locations entity. The location route file still exists.

### 5. Backend tsconfig Exclusions

The backend `tsconfig.json` explicitly excludes three files:
```json
"exclude": ["src/services/locationService.ts", "src/services/locationEnrichment.ts", "src/routes/locations.ts"]
```
These files exist on disk but are excluded from compilation, suggesting incomplete refactoring.

### 6. Temporary Claude Working Directories

Multiple `tmpclaude-*-cwd` directories exist in `packages/backend/src/services/` and other locations. These are artifacts from Claude Code sessions and should be cleaned up.

### 7. Frontend tsconfig Does Not Extend Base

The frontend `tsconfig.json` is standalone and does not extend `tsconfig.base.json`. This means shared compiler options (like `strict: true`) are duplicated rather than inherited. This is by design for Next.js compatibility but means configuration drift is possible.

### 8. Zod Version Mismatch

Backend uses `zod@^3.22.4` while frontend uses `zod@^3.25.76`. While npm workspaces may hoist compatible versions, the divergent ranges could cause inconsistencies in validation behavior.

### 9. SWC Minification Disabled

`swcMinify: false` in `next.config.js` means the frontend is not using SWC for minification, which may result in slightly larger bundles. This is a workaround for Windows ARM64 compatibility.

---

## Recommendations

### 1. Remove or Sync Root Prisma Schema
The root-level `prisma/schema.prisma` should either be removed (if unused) or symlinked to `packages/backend/prisma/schema.prisma` to prevent drift. All Prisma operations should use the backend package's schema.

### 2. Clean Up Temporary Directories
Remove all `tmpclaude-*-cwd` directories scattered through the backend:
```bash
find packages/ -type d -name "tmpclaude-*-cwd" -exec rm -rf {} +
```

### 3. Consolidate Root `src/` into Backend or a New Package
The root-level `src/` directory with sync, matching, and taxonomy code should be migrated into the backend package (or a new `@healthcareproviderdb/data-pipeline` package) for proper workspace isolation.

### 4. Resolve Location Service Status
Either complete the location service refactoring to work with `practice_locations` or remove the excluded files to reduce confusion. The tsconfig exclusions and commented-out exports create ambiguity.

### 5. Align Zod Versions
Standardize on a single Zod version across packages. Consider adding it as a root dependency or using npm workspace protocol to ensure consistency.

### 6. Add CI Build Order Enforcement
The root `build` script correctly sequences builds, but CI pipelines should also enforce this order. Consider adding a `.github/workflows` pipeline that builds shared first, then backend and frontend in parallel.

### 7. Consider Turborepo for Build Caching
As the project grows, Turborepo could provide:
- Build caching (skip rebuilding unchanged packages)
- Parallel builds with correct dependency ordering
- Remote caching for CI
- This would replace the `concurrently` approach with a dependency-aware build orchestrator.

### 8. Add Shared Package to Watch Mode
The `dev` script builds shared once, then starts backend and frontend in watch mode. If shared types change during development, they are not automatically rebuilt. Consider running `tsc --watch` in shared alongside the other dev servers:
```json
"dev": "concurrently \"npm run dev -w @healthcareproviderdb/shared\" \"npm run dev:backend\" \"npm run dev:frontend\""
```

### 9. Document Workspace Conventions
Establish and document conventions for:
- Where new shared types should be added
- How to add a new route (route + service + schema + types)
- How to add a new frontend page (route + component + hook + API call)
- Which dependencies belong at root vs. in packages
