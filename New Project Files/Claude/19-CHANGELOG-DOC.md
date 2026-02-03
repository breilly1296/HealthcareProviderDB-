# VerifyMyProvider Changelog

**Format:** [Keep a Changelog](https://keepachangelog.com/)
**Versioning:** [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

### Planned
- User accounts for trusted verifiers
- Mobile app (iOS/Android)
- API rate limit increases for registered users

---

## [1.0.0] - 2026-01-31

### Added
- **Core Features**
  - Provider search by state, city, specialty, name, ZIP
  - Provider detail pages with NPI data
  - Insurance plan acceptance verification
  - Community voting on verifications
  - Confidence scoring (0-100 scale)

- **Security**
  - Google reCAPTCHA v3 integration
  - Dual-mode rate limiting (Redis/in-memory)
  - IP-based Sybil attack prevention
  - Admin endpoints with secret authentication

- **Data Pipeline**
  - NPI data import from NPPES
  - Monthly full refresh, weekly delta updates
  - Location grouping for co-located providers
  - 6-month TTL for verification data

- **Infrastructure**
  - Next.js 14 frontend on Vercel
  - Express.js backend on Cloud Run
  - PostgreSQL 15 on Cloud SQL
  - GCP Secret Manager integration

- **API Endpoints**
  - `GET /providers/search` - Search providers
  - `GET /providers/:npi` - Provider details
  - `GET /providers/:npi/plans` - Plan acceptance
  - `GET /providers/:npi/colocated` - Co-located providers
  - `POST /verify` - Submit verification
  - `POST /verify/:id/vote` - Vote on verification
  - `GET /locations/:id` - Location details
  - `GET /admin/*` - Admin operations

### Security
- No hardcoded secrets in codebase
- HTTPS enforced on all endpoints
- Input validation with Zod schemas
- SQL injection prevention via Prisma ORM

---

## [0.9.0] - 2026-01-15 (Beta)

### Added
- Location grouping feature
- Provider comparison (up to 4 providers)
- Insurance card OCR (Anthropic Claude)
- PostHog analytics integration

### Changed
- Improved search performance with composite indexes
- Updated confidence scoring algorithm

### Fixed
- Rate limiter memory leak in long-running processes
- CAPTCHA token expiration handling

---

## [0.8.0] - 2025-12-15 (Alpha)

### Added
- Basic provider search functionality
- Verification submission
- Rate limiting (in-memory only)

### Known Issues
- No CAPTCHA protection
- Single-instance rate limiting only
- No data expiration

---

## Release Notes Format

Each release should include:

### Added
New features and capabilities.

### Changed
Changes to existing functionality.

### Deprecated
Features that will be removed in future versions.

### Removed
Features that have been removed.

### Fixed
Bug fixes.

### Security
Security improvements and vulnerability fixes.

---

## Version Numbering

- **MAJOR** (X.0.0): Breaking API changes
- **MINOR** (0.X.0): New features, backward compatible
- **PATCH** (0.0.X): Bug fixes, backward compatible

---

## Upgrade Guide

### From 0.9.x to 1.0.0

No breaking changes. Recommended updates:

1. Update environment variables:
```bash
# New required variables
RECAPTCHA_SECRET_KEY=your-key
ADMIN_SECRET=your-secret
```

2. Run database migrations:
```bash
npx prisma migrate deploy
```

3. Update frontend environment:
```bash
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your-site-key
```

---

## Links

- [API Documentation](./17-API-REFERENCE-DOC.md)
- [Deployment Guide](./15-DEPLOYMENT-GUIDE.md)
- [Troubleshooting](./18-TROUBLESHOOTING-DOC.md)
