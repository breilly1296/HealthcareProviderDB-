# 25 - Progress Status

## Current Phase: Pre-launch (NYC Q2 2026)

## Infrastructure Readiness

| Area           | Progress | Notes                                      |
|----------------|----------|--------------------------------------------|
| Infrastructure | 95%      | Docker, CI/CD, staging pipeline, rollback  |
| Database       | 85%      | Schema stable, NPI imported, TTL in place  |
| API            | 90%      | All core endpoints, rate limiting, CAPTCHA |
| Frontend       | 85%      | Search, detail, comparison, dark mode, SEO |
| Security       | 80%      | Auth, rate limiting, Sybil prevention      |

## Recently Completed

- Rate limiting (Redis + in-memory fallback, 4-tier)
- CAPTCHA integration (reCAPTCHA v3 on verify/vote)
- Admin endpoints (cleanup, expiration stats, health checks)
- Confidence scoring system for verifications
- Insurance plans schema and API
- Docker containerization and CI/CD pipeline
- PostHog analytics integration
- Provider comparison feature
- Dark mode support
- SEO enhancements and sitemap generation
- Staging deployment pipeline
- Rollback workflow

## In Progress

- NYC provider data enrichment (5 boroughs, ~50-75K providers)
- Insurance plan data for NYC carriers
- City name cleanup across practice_locations

## Next Up

- Complete NYC data enrichment for all 5 boroughs
- City name normalization and cleanup
- Populate insurance plans for major NYC carriers:
  - UnitedHealthcare
  - Aetna
  - Cigna
  - MetroPlus
  - 1199

## Blockers

- **Cold start problem**: No verifications exist yet. The platform launches with zero community-contributed data. Early growth depends on seeding useful provider information and encouraging first verifications.

## NPI Data Status

- 6 states imported for pipeline testing and schema validation
- NYC (Manhattan, Brooklyn, Queens, Bronx, Staten Island) is the launch dataset
- Estimated ~50-75K providers across the 5 boroughs

## Success Metrics by Phase

| Phase              | Target Users | Target Verifications | Timeline      |
|--------------------|--------------|----------------------|---------------|
| Phase 1 - POC      | 50           | 100                  | Launch        |
| Phase 2 - One-City | 500          | 2,000                | Post-launch   |
| Phase 3 - Regional | 5,000        | 15,000               | Growth phase  |
