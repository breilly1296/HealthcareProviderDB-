# Healthcare Provider Database

A comprehensive database for healthcare providers specializing in osteoporosis-relevant care, with insurance plan matching and crowdsource verification.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Data Sources                                    │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│   CMS NPPES         │   CMS Plan Finder   │     User Uploads                │
│   (NPI Registry)    │   (Insurance Data)  │     (CSV/JSON)                  │
└─────────┬───────────┴──────────┬──────────┴──────────────┬──────────────────┘
          │                      │                         │
          ▼                      ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Import Scripts                                     │
│  ┌──────────────────────────┐  ┌──────────────────────┐  ┌──────────────┐  │
│  │ enrich-providers-        │  │ import-enrichment-   │  │ pre-import-  │  │
│  │   nppes.ts               │  │   csv.ts             │  │   check.ts   │  │
│  │ - NPPES API enrichment   │  │ - Practice CSVs      │  │ - Safety     │  │
│  │ - Fill-not-overwrite     │  │ - Hours, websites    │  │   check      │  │
│  │ - Conflict log           │  │ - Hospital systems   │  │              │  │
│  └──────────────────────────┘  └──────────────────────┘  └──────────────┘  │
│  (Archived bulk-NPI importers live in scripts/archive/. TODO: write a       │
│   replacement that targets providers + practice_locations.)                 │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL Database                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │   providers     │  │ insurance_plans │  │ provider_plan_acceptance    │  │
│  │   - NPI         │  │ - Plan ID       │  │ - Provider ID               │  │
│  │   - Specialty   │  │ - Carrier       │  │ - Plan ID                   │  │
│  │   - Location    │  │ - Type          │  │ - Confidence Score          │  │
│  │   - Contact     │  │ - Coverage      │  │ - Verification Status       │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘  │
│           │                    │                          │                  │
│           └────────────────────┼──────────────────────────┘                  │
│                                │                                             │
│  ┌─────────────────────────────┴─────────────────────────────────────────┐  │
│  │                      Audit & Logging Tables                            │  │
│  │  ┌─────────────────────┐        ┌─────────────────────────────────┐   │  │
│  │  │  verification_log   │        │         sync_log                │   │  │
│  │  │  - Changes          │        │  - Import stats                 │   │  │
│  │  │  - Crowdsource      │        │  - Error tracking               │   │  │
│  │  │  - Votes            │        │  - Source files                 │   │  │
│  │  └─────────────────────┘        └─────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Application Layer                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Confidence Scoring Engine                         │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │   │
│  │  │ Data Source│  │  Recency   │  │Verification│  │  Crowdsource   │  │   │
│  │  │  (0-30)    │  │  (0-25)    │  │  (0-25)    │  │    (0-20)      │  │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘  │   │
│  │                        │                                              │   │
│  │                        ▼                                              │   │
│  │              Combined Score (0-100)                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        REST API (Express)                             │   │
│  │  GET  /api/v1/providers/search?state=FL&specialty=rheumatology        │   │
│  │  GET  /api/v1/providers/:npi                                          │   │
│  │  GET  /api/v1/providers/:npi/plans                                    │   │
│  │  POST /api/v1/verify                                                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Consumers                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  Web Frontend   │  │  Mobile App     │  │  Third-party Integrations   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Features

- **NPI Registry Integration**: Import healthcare provider data from CMS NPPES
- **Insurance Plan Matching**: Track which providers accept which insurance plans
- **Confidence Scoring**: Algorithm-based scoring of data reliability (0-100)
- **Crowdsource Verification**: User-submitted verifications with voting system
- **Audit Trail**: Complete logging of all data changes and imports

## Osteoporosis-Relevant Specialties

This database focuses on specialties relevant to osteoporosis care:

| Specialty | Taxonomy Codes |
|-----------|----------------|
| Endocrinology | 207RE0101X, 207RI0011X, 261QE0700X |
| Rheumatology | 207RR0500X, 261QR0401X |
| Orthopedics | 207X00000X, 207XS0114X, 207XS0106X, 207XS0117X, 207XX0004X, 207XX0005X, 207XX0801X |
| Internal Medicine | 207R00000X, 207RI0200X |
| Family Medicine | 207Q00000X, 207QA0505X |
| Geriatrics | 207QG0300X, 207RG0300X |

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your database credentials
# DATABASE_URL="postgresql://user:password@localhost:5432/healthcare_providers"

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Start development server
npm run dev
```

### Import NPI Data

> **TODO (2026-04-26):** the original bulk-import scripts (`import-npi.ts`,
> `import-npi-direct.ts`, `import-csv-copy.ts`, `import-csv-simple.ts`,
> `import-filtered-csv.ts`) were written against a pre-split schema where
> `providers` carried address/phone columns directly. Those columns moved
> to `practice_locations` on 2026-01-14 and the bulk-import scripts have
> been archived under `scripts/archive/` (see `scripts/archive/README.md`).
>
> No replacement bulk-import script has been written yet. The active
> data-maintenance path is incremental — there is no `npm run import:npi`
> command anymore:
>
> - `scripts/pre-import-check.ts` — safety check (enriched-record counts,
>   pending conflicts) before any import
> - `scripts/enrich-providers-nppes.ts` — NPPES API enrichment, fill-not-
>   overwrite, conflicts logged to `import_conflicts`
> - `scripts/import-enrichment-csv.ts` — practice-level enrichment CSVs
>   (names, websites, hospital systems, insurance, hours, confidence)
>
> If you need a fresh full NPPES bulk import, a new script targeting the
> current `Provider` + `practice_locations` shape will need to be written
> first. See `prompts/13-npi-data-pipeline.md` for the intended pipeline.

## API Reference

> All endpoints are mounted under `/api/v1`. See `prompts/06-api-routes.md`
> and `prompts/17-api-reference-doc.md` for the full inventory.

### Search Providers

```http
GET /api/v1/providers/search?state=FL&specialty=rheumatology
```

Query Parameters:
- `state` - Two-letter state code (e.g., FL, CA, NY)
- `specialty` - Specialty name (endocrinology, rheumatology, orthopedics, internal_medicine, family_medicine, geriatrics)
- `city` - City name (partial match)
- `zip` - ZIP code (prefix match)
- `name` - Provider name (partial match)
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 20, max: 100)

### Get Provider Details

```http
GET /api/v1/providers/:npi
```

Returns full provider information including top accepted plans.

### Get Provider's Insurance Plans

```http
GET /api/v1/providers/:npi/plans
```

Query Parameters:
- `status` - Filter by acceptance status (ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN)
- `minConfidence` - Minimum confidence score (0-100)

### Submit Verification

```http
POST /api/v1/verify
Content-Type: application/json
X-CAPTCHA-Token: <reCAPTCHA v3 token>

{
  "npi": "1234567890",
  "planId": "H1234-001",
  "acceptsInsurance": true,
  "acceptsNewPatients": true,
  "notes": "Called office on 12/15/2024",
  "evidenceUrl": "https://example.com/screenshot.png",
  "submittedBy": "user@example.com"
}
```

### Vote on Verification

```http
POST /api/v1/verify/:verificationId/vote
Content-Type: application/json
X-CAPTCHA-Token: <reCAPTCHA v3 token>

{
  "vote": "up"  // or "down"
}
```

## Confidence Scoring

The confidence scoring engine evaluates data reliability using four factors:

| Factor | Max Points | Description |
|--------|------------|-------------|
| Data Source | 30 | CMS data (30), Carrier data (28), Provider portal (25), Phone (22), Automated (15), Crowdsource (10) |
| Recency | 25 | How recently the data was updated or verified |
| Verification | 25 | Quality and quantity of verifications |
| Crowdsource | 20 | User votes and submissions |

**Score Interpretation:**
- 91-100: Very high confidence (verified through multiple sources)
- 76-90: High confidence (verified through one source)
- 51-75: Medium confidence (reasonable but not verified)
- 26-50: Low confidence (needs verification)
- 0-25: Very low confidence (likely inaccurate)

## Database Schema

### providers
Core table for healthcare provider information from NPI registry.

### insurance_plans
Insurance plan information from CMS and user uploads.

### provider_plan_acceptance
Junction table linking providers to plans with acceptance status and confidence scores.

### verification_log
Audit trail for all data changes and crowdsource submissions.

### sync_log
Tracks data imports with statistics and error logs.

## Project Structure

This is an npm-workspaces monorepo. Backend, frontend, and shared types each
live in their own package.

```
HealthcareProviderDB/
├── packages/
│   ├── backend/                  # Express + Prisma API
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # Database schema (22 models)
│   │   │   └── migrations/       # Versioned Prisma migrations
│   │   └── src/
│   │       ├── routes/           # admin, auth, providers, plans, verify,
│   │       │                     #   locations, savedProviders, insuranceCard
│   │       ├── services/         # Business logic (confidence, anomaly, auth, ...)
│   │       ├── middleware/       # auth, csrf, rateLimiter, captcha, errorHandler, ...
│   │       ├── lib/              # prisma, redis, encryption, ...
│   │       ├── utils/            # logger (pino), cache, responseHelpers
│   │       ├── schemas/          # Zod validation schemas
│   │       ├── config/           # Constants
│   │       ├── scripts/          # Backend-local ops scripts (seed, setup-*.sh)
│   │       ├── __tests__/        # Jest tests
│   │       └── index.ts          # App entry point
│   ├── frontend/                 # Next.js 14 (App Router)
│   │   └── src/
│   │       ├── app/              # Route segments + sitemap.ts + robots.ts
│   │       ├── components/       # React components
│   │       ├── hooks/            # React Query hooks
│   │       ├── lib/              # API client (api.ts), queryClient
│   │       └── context/          # React context providers
│   └── shared/                   # Cross-package TypeScript types
├── scripts/                      # Repo-level ops (data import, geocode, etc.)
│   ├── enrich-providers-nppes.ts
│   ├── import-enrichment-csv.ts
│   ├── pre-import-check.ts
│   └── archive/                  # Pre-schema-split importers (do not run)
├── infra/                        # GCP infra-as-code (scheduler, alerts, armor, redis, uptime)
├── prompts/                      # Audit / review / documentation prompts
├── .github/workflows/            # CI/CD
├── .env.example
├── package.json                  # Workspace root
├── tsconfig.base.json
└── README.md
```

## Development

```bash
# Run backend + frontend concurrently with hot reload
npm run dev

# Run tests (backend Jest)
npm test

# Type check / lint across all workspaces
npm run lint

# Build all workspaces (shared → backend → frontend)
npm run build
```

> **TODO:** there is no root `npm start` script — production runs in
> Cloud Run via the per-package Dockerfiles
> (`packages/backend/Dockerfile`, `packages/frontend/Dockerfile`). See
> `prompts/15-deployment-guide.md`.

## Environment Variables

The full inventory lives in `.env.example` (grouped by section: Database,
Server, Authentication, CAPTCHA, Admin, Encryption, Caching/Redis, External
APIs, Frontend, Analytics, CI/CD). The commonly-needed ones:

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | - |
| PORT | API server port (Cloud Run overrides to 8080) | 3001 |
| NODE_ENV | Environment (development/production) | development |
| FRONTEND_URL | Frontend origin; appended to the CORS allowlist | - |

CORS uses a hardcoded allowlist in `packages/backend/src/index.ts` plus
`FRONTEND_URL`; there is no `CORS_ORIGIN` env var.

## License

ISC
