---
tags:
  - documentation
  - changelog
type: prompt
priority: 2
updated: 2026-02-05
---

# Changelog Document

## Purpose
Generate a changelog documenting significant changes to VerifyMyProvider, organized by date and category.

## Files to Review
- Git history (`git log --oneline`)
- `packages/backend/src/` (backend changes)
- `packages/frontend/src/` (frontend changes)
- `packages/backend/prisma/schema.prisma` (schema changes)
- `.github/workflows/` (CI/CD changes)

## Major Milestones (Known)

### January 2026
- Rate limiting implemented (Tier 1 — IP-based, dual-mode Redis/in-memory)
- Google reCAPTCHA v3 integrated on verification and vote endpoints
- Admin endpoints expanded (7 total: cleanup, cache, retention)
- Sybil attack prevention (4 layers: rate limiting, CAPTCHA, vote dedup, 30-day windows)
- Structured logging via `requestLogger.ts` (PII-free)
- Confidence scoring algorithm (4-factor: source 25, recency 30, agreement 25, volume 20)
- Insurance plan import pipeline
- Insurance card upload with Claude AI extraction
- Docker containerization (backend + frontend)
- GitHub Actions CI/CD → Cloud Run deployment
- PostHog analytics integration (privacy-preserving)
- Provider comparison feature (max 4 side-by-side)
- Dark/light theme support

### Earlier
- NPI data import for 6 states (FL, AL, AK, AR, AZ, CA) — used for pipeline testing, NOT the launch dataset
- **Note:** Current focus is NYC (5 boroughs) for Q2 2026 launch; NY state import filtered to NYC zip codes (~50-75K providers)
- Initial Prisma schema with Provider, InsurancePlan, VerificationLog
- Express backend with provider search and detail endpoints
- Next.js 14 frontend with App Router
- practice_locations replaced old Location model

## Questions to Ask
1. What is the project start date?
2. Are there any unreleased features currently in development?
3. Should the changelog follow a specific format (e.g., Keep a Changelog)?
4. Should breaking changes be called out separately?
5. What is the versioning strategy (semver, date-based)?

## Checklist
- [ ] Changelog generated from git history
- [ ] Organized by date/version
- [ ] Categories: Added, Changed, Fixed, Removed, Security
- [ ] Breaking changes highlighted
- [ ] Links to relevant PRs/commits
