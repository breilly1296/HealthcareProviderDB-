---
tags:
  - documentation
  - api
  - implemented
type: prompt
priority: 2
updated: 2026-04-26
---

# API Reference Document

## Purpose
Generate a complete API reference for the VerifyMyProvider backend, covering all endpoints, request/response formats, rate limits, and error codes.

## Files to Review
- `packages/backend/src/routes/providers.ts` (3 provider endpoints)
- `packages/backend/src/routes/plans.ts` (6 plan endpoints)
- `packages/backend/src/routes/verify.ts` (5 verification endpoints)
- `packages/backend/src/routes/admin.ts` (16 admin endpoints — see also `prompts/38-admin-endpoints.md` for the full inventory)
- `packages/backend/src/routes/locations.ts` (5 location endpoints — active)
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
| GET | `/api/v1/providers/cities` | 200/hr | No | Cities for state |
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
| GET | `/api/v1/locations/search` | 200/hr | No | Search locations |
| GET | `/api/v1/locations/health-systems` | 200/hr | No | Health systems |
| GET | `/api/v1/locations/stats/:state` | 200/hr | No | Location stats by state |
| GET | `/api/v1/locations/:locationId` | 200/hr | No | Location details |
| GET | `/api/v1/locations/:locationId/providers` | 200/hr | No | Providers at location |
| GET | `/health` | None | No | Health check |

### Admin Endpoints (X-Admin-Secret required)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/admin/cleanup-expired` | Clean expired records |
| GET | `/api/v1/admin/expiration-stats` | Expiration statistics |
| GET | `/api/v1/admin/health` | Admin health with metrics |
| POST | `/api/v1/admin/cache/clear` | Clear cache |
| GET | `/api/v1/admin/cache/stats` | Cache statistics |
| GET | `/api/v1/admin/enrichment/stats` | Enrichment statistics |
| POST | `/api/v1/admin/cleanup/sync-logs` | Clean old sync logs |
| GET | `/api/v1/admin/retention/stats` | Retention statistics |
| POST | `/api/v1/admin/recalculate-confidence` | Confidence decay recalculation |

### Error Codes
All error responses share the shape `{ success: false, error: { message, code, statusCode, requestId } }`. The `code` field is stable across releases; `message` is human-readable and may change. Sorted by HTTP status.

| Code | HTTP | Source |
|------|------|--------|
| `VALIDATION_ERROR` | 400 | Zod schema parse failure. `error.details` carries the field-level Zod issues. Emitted by `errorHandler` when `err.name === 'ZodError'`. |
| `EXTRACTION_FAILED` | 400 | Insurance card OCR scan failure. `routes/insuranceCard.ts:130`. |
| `FOREIGN_KEY_VIOLATION` | 400 | Prisma `P2003` foreign-key constraint. `errorHandler.ts:163`. |
| `UNAUTHORIZED` | 401 | Missing or invalid auth credentials (`X-Admin-Secret` mismatch, expired/missing JWT, etc.). `AppError.unauthorized`. |
| `FORBIDDEN` | 403 | `csrf-csrf` `EBADCSRFTOKEN` (CSRF mismatch); `ADMIN_IP_ALLOWLIST` rejection (`routes/admin.ts:57`); `AppError.forbidden`. |
| `NOT_FOUND` | 404 | Prisma `P2025` (`errorHandler.ts:150`) and `AppError.notFound`. Used when a queried record doesn't exist. |
| `ROUTE_NOT_FOUND` | 404 | `notFoundHandler` for HTTP requests that don't match any registered route. |
| `DUPLICATE_ENTRY` | 409 | Prisma `P2002` unique-constraint violation. `errorHandler.ts:137`. |
| `CONFLICT` | 409 | `AppError.conflict` — Sybil dedup rejections, vote double-submit, generic state conflicts. |
| `PAYLOAD_TOO_LARGE` | 413 | Body exceeds the configured limit. 16 MB on `POST /me/insurance-card/scan`; 100 KB on every other route. `errorHandler.ts:121`. |
| `TOO_MANY_REQUESTS` | 429 | Rate limiter exceeded. Response also carries `Retry-After` (seconds) header and `retryAfter` (seconds) body field. `middleware/rateLimiter.ts:165`. |
| `INTERNAL_ERROR` | 500 | Default fallback for any unhandled error. Stack trace and message are redacted in production. |
| `QUERY_ERROR` | 500 | Prisma `P2010` raw-query error. `errorHandler.ts:194`. |
| `DATABASE_ERROR` | 500 | Catch-all for unhandled Prisma errors — `PrismaClientKnownRequestError` codes other than the above five (P2014/P2026/P2034/...), plus `PrismaClientUnknownRequestError`, `PrismaClientValidationError`, `PrismaClientRustPanicError`. Full Prisma context (code, meta, errorName) is logged for debugging; clients see only the generic message. Added 2026-04-26. |
| `ADMIN_NOT_CONFIGURED` | 503 | `ADMIN_SECRET` env var unset on the backend — admin router returns this so the deploy can boot without secrets configured yet. `routes/admin.ts` `adminAuthMiddleware`. |
| `DATABASE_TIMEOUT` | 503 | Prisma `P2024` connection-pool timeout. `errorHandler.ts:176`. |
| `DATABASE_UNAVAILABLE` | 503 | `PrismaClientInitializationError` — the pool couldn't connect to Cloud SQL at all. `errorHandler.ts:218`. |

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
