---
tags:
  - documentation
  - api
  - implemented
type: prompt
priority: 2
updated: 2026-02-05
---

# API Reference Document

## Purpose
Generate a complete API reference for the VerifyMyProvider backend, covering all endpoints, request/response formats, rate limits, and error codes.

## Files to Review
- `packages/backend/src/routes/providers.ts` (3 provider endpoints)
- `packages/backend/src/routes/plans.ts` (6 plan endpoints)
- `packages/backend/src/routes/verify.ts` (5 verification endpoints)
- `packages/backend/src/routes/admin.ts` (7 admin endpoints)
- `packages/backend/src/routes/locations.ts` (DISABLED — old Location model)
- `packages/backend/src/routes/index.ts` (route registration + health check)
- `packages/backend/src/middleware/rateLimiter.ts` (rate limits)
- `packages/backend/src/middleware/captcha.ts` (CAPTCHA middleware)
- `packages/backend/src/middleware/errorHandler.ts` (error format)
- `packages/backend/src/schemas/` (Zod validation schemas)
- `packages/shared/src/types/` (shared TypeScript types)

## API Summary

### Public Endpoints
| Method | Endpoint | Rate Limit | CAPTCHA | Purpose |
|--------|----------|------------|---------|---------|
| GET | `/api/v1/providers/search` | 100/hr | No | Search providers |
| GET | `/api/v1/providers/:npi` | 200/hr | No | Provider detail |
| GET | `/api/v1/providers/:npi/colocated` | 200/hr | No | Co-located providers |
| GET | `/api/v1/plans/search` | 100/hr | No | Search plans |
| GET | `/api/v1/plans/grouped` | 200/hr | No | Plans by carrier |
| GET | `/api/v1/plans/meta/issuers` | 200/hr | No | Issuer list |
| GET | `/api/v1/plans/meta/types` | 200/hr | No | Plan type list |
| GET | `/api/v1/plans/:planId` | 200/hr | No | Plan detail |
| GET | `/api/v1/plans/:planId/providers` | 100/hr | No | Providers for plan |
| POST | `/api/v1/verify` | 10/hr | Yes | Submit verification |
| POST | `/api/v1/verify/:id/vote` | 10/hr | Yes | Vote on verification |
| GET | `/api/v1/verify/stats` | 200/hr | No | Verification stats |
| GET | `/api/v1/verify/recent` | 200/hr | No | Recent verifications |
| GET | `/api/v1/verify/:npi/:planId` | 200/hr | No | Pair verifications |
| GET | `/health` | None | No | Health check |

### Admin Endpoints (X-Admin-Secret required)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/admin/cleanup-expired` | Clean expired records |
| GET | `/api/v1/admin/expiration-stats` | Expiration statistics |
| GET | `/api/v1/admin/health` | Admin health with metrics |
| POST | `/api/v1/admin/cache/clear` | Clear cache |
| GET | `/api/v1/admin/cache/stats` | Cache statistics |
| POST | `/api/v1/admin/cleanup/sync-logs` | Clean old sync logs |
| GET | `/api/v1/admin/retention/stats` | Retention statistics |

## Questions to Ask
1. Should the API reference be auto-generated from code (e.g., Swagger/OpenAPI)?
2. Are there any undocumented query parameters or headers?
3. Should we add API versioning headers?
4. Are error codes consistent across all endpoints?
5. Should rate limit information be included in the API docs?

## Checklist
- [x] All public endpoints documented in prompt 06
- [x] All admin endpoints documented in prompt 38
- [x] Rate limits defined for all endpoints
- [x] CAPTCHA requirements documented
- [x] Zod validation on all inputs
- [ ] OpenAPI/Swagger specification
- [ ] API documentation website
- [ ] Response examples for all endpoints
