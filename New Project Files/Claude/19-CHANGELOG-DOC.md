# Changelog - VerifyMyProvider

## Overview

This document tracks significant milestones, features, and changes to the VerifyMyProvider application in reverse chronological order.

---

## February 2026

### Prompt Audit and Update
- Audited and updated all 44 AI prompts used across the application
- Standardized prompt formatting, context injection, and error handling
- Improved clarity and consistency of prompt instructions

### SEO and Sitemap Implementation
- Added sitemap generation for provider and plan pages
- Implemented meta tags, structured data, and Open Graph tags
- Improved search engine discoverability for provider profiles

### Co-located Providers Endpoint
- Added `GET /api/providers/:npi/colocated` endpoint
- Returns providers who share a practice location with the given NPI
- Rate limited at 200 requests/hour per IP

### Staging Pipeline
- Added staging environment in the CI/CD pipeline
- GitHub Actions deploys to staging on push to `staging` branch
- Allows testing in a Cloud Run environment before production

### Rollback Workflow
- Added GitHub Actions workflow for production rollbacks
- Enables reverting to a previous Cloud Run revision with a single workflow dispatch
- Includes confirmation step and post-rollback health check

---

## January 2026

### Rate Limiting
- Implemented Tier 1 IP-based rate limiting across all public endpoints
- Dual-mode architecture: Redis when available, automatic fallback to in-memory store
- Configurable limits per endpoint category (search: 100/hr, reads: 200/hr, writes: 10/hr)
- Standard rate limit headers on all responses (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)

### reCAPTCHA v3 Integration
- Added reCAPTCHA v3 on verification submission (`POST /api/verifications`)
- Added reCAPTCHA v3 on vote submission (`POST /api/verifications/:id/vote`)
- Server-side score validation with configurable threshold
- Graceful degradation if reCAPTCHA service is unreachable

### Admin Endpoints Expanded
- Expanded admin API to 9 total endpoints
- Added: `cleanup-expired`, `expiration-stats`, `health`, `cache/clear`, `cache/stats`, `enrichment/stats`, `cleanup/sync-logs`, `retention/stats`, `recalculate-confidence`
- All protected by `X-Admin-Secret` header with timing-safe comparison
- Returns 503 when `ADMIN_SECRET` is not configured (intentional security design)

### Sybil Attack Prevention
- Implemented 4-layer defense against verification manipulation:
  1. IP-based rate limiting (10 verifications/hour)
  2. reCAPTCHA v3 bot detection
  3. Duplicate submission detection (same IP + NPI + plan within window)
  4. Vote weight decay for repeated votes from same IP

### Structured Logging
- Replaced console.log with structured JSON logging
- PII-free log output -- no patient data, no full IP addresses
- Log levels: error, warn, info, debug
- Correlation IDs for request tracing

### Confidence Scoring
- Implemented 4-factor confidence scoring algorithm:
  1. Verification count (more verifications = higher confidence)
  2. Agreement ratio (percentage of "accepts" vs "rejects")
  3. Recency weighting (newer verifications weighted more heavily)
  4. Source diversity (verifications from different IPs weighted more)
- Scores normalized to 0.0-1.0 range
- Recalculable via admin endpoint

### Insurance Plan Import Pipeline
- Built import pipeline for CMS QHP Landscape data
- Parses plan metadata: name, issuer, type, metal level, state, county
- Deduplication and normalization of plan names
- Links plans to providers via `ProviderPlanAcceptance` junction table

### Insurance Card Upload with Claude AI
- Users can upload a photo of their insurance card
- Claude AI extracts plan name, issuer, member ID prefix, and plan type
- Matched against the plan database to identify the user's plan
- No card image is stored -- processed in-memory and discarded (no PHI retention)

### Docker Containerization
- Created multi-stage Dockerfile for backend
- Created multi-stage Dockerfile for frontend
- Optimized image sizes with Alpine base and layer caching
- Docker Compose for local development with PostgreSQL and Redis

### GitHub Actions CI/CD to Cloud Run
- Automated build and deployment pipeline
- On push to `main`: lint, test, build Docker image, push to Artifact Registry, deploy to Cloud Run
- Environment variables and secrets managed via GitHub Secrets
- Health check verification after deployment

### PostHog Analytics
- Integrated PostHog for product analytics
- Event tracking: search queries, provider views, verification submissions, plan lookups
- No PII captured in analytics events
- Feature flags support for gradual rollouts

### Provider Comparison Feature
- Users can compare up to 4 providers side by side
- Comparison dimensions: specialty, location, insurance acceptance, confidence score, verification count
- Persistent comparison selection via URL parameters

### Dark/Light Theme
- Added theme toggle supporting dark and light modes
- Respects system preference via `prefers-color-scheme`
- User preference persisted in localStorage
- All components and pages styled for both themes

---

## Earlier Development (2025)

### NPI Data Import
- Imported NPI provider data for 6 states (testing subset targeting NYC launch)
- Built import pipeline for NPPES CSV data
- Approximately 2.1 million provider records imported
- Specialty mapping from taxonomy codes to human-readable categories

### Initial Prisma Schema
- Designed 15-model schema for PostgreSQL
- PascalCase models with `@@map` to snake_case PostgreSQL tables
- CamelCase fields with `@map` to snake_case columns
- Provider as central model with NPI as primary key

### Express Backend
- Set up Express server with TypeScript
- Zod validation on all inputs
- Helmet for security headers
- CORS whitelist configuration

### Next.js 14 Frontend
- Initialized Next.js 14.2 with App Router
- React 18 with Server Components
- TailwindCSS for styling
- Responsive design for mobile and desktop

### practice_locations Replaced Old Location Model
- Migrated from a standalone `Location` model to `practice_locations` linked directly to providers
- Location data sourced from NPI registry practice location fields
- 5 public API endpoints built against the new model
- Old Location model references remain in some disabled admin code
