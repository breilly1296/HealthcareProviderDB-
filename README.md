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
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ import-npi.ts   │  │ import-plans.ts │  │ process-uploads.ts          │  │
│  │ - Download      │  │ - Parse CMS     │  │ - Validate                  │  │
│  │ - Parse CSV     │  │ - Map carriers  │  │ - Transform                 │  │
│  │ - Filter specs  │  │ - Update DB     │  │ - Merge                     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
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
│  │  GET  /providers?state=FL&specialty=rheumatology                     │   │
│  │  GET  /providers/:npi                                                 │   │
│  │  GET  /providers/:npi/plans                                           │   │
│  │  POST /providers/:npi/verify                                          │   │
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

Download the NPI data file from [CMS NPPES](https://download.cms.gov/nppes/NPI_Files.html), then:

```bash
# Import all osteoporosis-relevant providers
npm run import:npi -- --file ./data/npidata.csv

# Import only Florida providers
npm run import:npi -- --file ./data/npidata.csv --states FL

# Import all specialties (not just osteoporosis-relevant)
npm run import:npi -- --file ./data/npidata.csv --all-specialties
```

## API Reference

### Search Providers

```http
GET /api/providers?state=FL&specialty=rheumatology
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
GET /api/providers/:npi
```

Returns full provider information including top accepted plans.

### Get Provider's Insurance Plans

```http
GET /api/providers/:npi/plans
```

Query Parameters:
- `status` - Filter by acceptance status (ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN)
- `minConfidence` - Minimum confidence score (0-100)

### Submit Verification

```http
POST /api/providers/:npi/verify
Content-Type: application/json

{
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
POST /api/verifications/:id/vote
Content-Type: application/json

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

```
HealthcareProviderDB/
├── prisma/
│   └── schema.prisma       # Database schema
├── scripts/
│   └── import-npi.ts       # NPI data import script
├── src/
│   ├── api/
│   │   └── routes.ts       # REST API endpoints
│   ├── lib/
│   │   └── prisma.ts       # Prisma client singleton
│   ├── matching/
│   │   └── confidence.ts   # Confidence scoring engine
│   └── index.ts            # Application entry point
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Development

```bash
# Run development server with hot reload
npm run dev

# Run tests
npm test

# Type check
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | - |
| PORT | API server port | 3000 |
| NODE_ENV | Environment (development/production) | development |
| CORS_ORIGIN | Allowed CORS origins | * |

## License

ISC
