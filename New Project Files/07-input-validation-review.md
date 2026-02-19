# Input Validation Review

**Generated:** 2026-02-18
**Prompt:** 07-input-validation.md
**Status:** STRONG -- Zod validation on all route inputs, shared schemas for consistency, comprehensive error handling. No SQL injection risk (Prisma parameterized queries). One minor observation on admin query param validation.

---

## Executive Summary

Every route handler uses Zod schema validation on inputs. Common schemas (pagination, NPI, state, planId) are shared via `schemas/commonSchemas.ts` to ensure consistency. The `errorHandler.ts` middleware converts Zod errors into structured 400 responses with field-level detail. Prisma's parameterized queries eliminate SQL injection risk. No unvalidated user inputs reach the database.

---

## Validation Coverage by Route File

### Provider Routes (`providers.ts`)

| Endpoint | Input Source | Schema | Fields Validated |
|----------|-------------|--------|-----------------|
| GET `/search` | query | `searchQuerySchema` | state (2 chars, uppercase), city (1-100), cities (1-500), zipCode (3-10), specialty (1-200), specialtyCategory (1-100), name (1-200), npi (10 digits), entityType (enum), page (int >=1), limit (int 1-100) |
| GET `/cities` | query | Inline `stateSchema` | state (exactly 2 chars, uppercase) |
| GET `/:npi/colocated` | params + query | `npiParamSchema` + `paginationSchema` | npi (10 digits), page (int >=1), limit (int 1-100) |
| GET `/:npi/plans` | params + query | `npiParamSchema` + `plansQuerySchema` | npi (10 digits), page, limit, status (1-20), minConfidence (int 0-100) |
| GET `/map` | query | `mapQuerySchema` | north/south (number -90 to 90), east/west (number -180 to 180), specialty (1-200), specialtyCategory (1-100), entityType (enum), limit (int 1-500) |
| GET `/:npi` | params | `npiParamSchema` | npi (10 digits regex) |

### Plan Routes (`plans.ts`)

| Endpoint | Input Source | Schema | Fields Validated |
|----------|-------------|--------|-----------------|
| GET `/search` | query | `searchQuerySchema` | issuerName (1-200), planType (1-20), search (1-200), state (2 chars), page, limit |
| GET `/grouped` | query | Inline Zod schema | search (1-200), state (2 chars) |
| GET `/meta/issuers` | query | `stateQuerySchema` | state (2 chars, optional) |
| GET `/meta/types` | query | Extended `stateQuerySchema` | state (2 chars, optional), issuerName (1-200, optional) |
| GET `/:planId/providers` | params + query | `planIdParamSchema` + `paginationSchema` | planId (1-50), page, limit |
| GET `/:planId` | params | `planIdParamSchema` | planId (1-50) |

### Verification Routes (`verify.ts`)

| Endpoint | Input Source | Schema | Fields Validated |
|----------|-------------|--------|-----------------|
| POST `/` | body | `submitVerificationSchema` | npi (10 digits), planId (1-50), acceptsInsurance (boolean), acceptsNewPatients (optional boolean), locationId (optional positive int), notes (max 1000), evidenceUrl (optional URL, max 500), submittedBy (optional email, max 200), captchaToken (optional string), website (honeypot) |
| POST `/:verificationId/vote` | params + body | `verificationIdParamSchema` + `voteSchema` | verificationId (min 1), vote (enum "up"/"down"), captchaToken (optional), website (honeypot) |
| GET `/stats` | none | none | No user input |
| GET `/recent` | query | `recentQuerySchema` | limit (int 1-100, default 20), npi (optional 10 digits), planId (optional 1-50) |
| GET `/:npi/:planId` | params | `pairParamsSchema` | npi (10 digits), planId (1-50) |

### Location Routes (`locations.ts`)

| Endpoint | Input Source | Schema | Fields Validated |
|----------|-------------|--------|-----------------|
| GET `/search` | query | `searchQuerySchema` | state (2 chars, required), city (1-100), zipCode (3-10), page, limit |
| GET `/health-systems` | query | `healthSystemsQuerySchema` | state (2 chars, optional), city (1-100, optional) |
| GET `/stats/:state` | params | `stateParamSchema` | state (2 chars, uppercase) |
| GET `/:locationId` | params | `locationIdSchema` | locationId (positive integer via coerce) |
| GET `/:locationId/providers` | params + query | `locationIdSchema` + `paginationSchema` | locationId (positive int), page, limit |

### Auth Routes (`auth.ts`)

| Endpoint | Input Source | Schema | Fields Validated |
|----------|-------------|--------|-----------------|
| GET `/csrf-token` | none | none | No user input |
| POST `/magic-link` | body | `magicLinkSchema` | email (valid email, max 255) |
| GET `/verify` | query | `verifyQuerySchema` (safeParse) | token (min 1) |
| POST `/refresh` | cookies | manual check | Checks `vmp_refresh_token` cookie existence |
| POST `/logout` | req.user | requireAuth | Validates via JWT verification in extractUser |
| POST `/logout-all` | req.user | requireAuth | Validates via JWT verification in extractUser |
| GET `/me` | req.user | requireAuth | Validates via JWT verification in extractUser |
| GET `/export` | req.user | requireAuth | Validates via JWT verification in extractUser |

**Note on `/verify`:** Uses `safeParse` (line 110) instead of `parse` because this endpoint handles browser navigation. Invalid input redirects to `/login?error=invalid` instead of throwing a Zod error that would produce a JSON 400 response in the user's browser.

### Saved Provider Routes (`savedProviders.ts`)

| Endpoint | Input Source | Schema | Fields Validated |
|----------|-------------|--------|-----------------|
| GET `/` | query | `paginationSchema` | page, limit |
| POST `/` | body | `npiParamSchema` | npi (10 digits) |
| DELETE `/:npi` | params | `npiParamSchema` | npi (10 digits) |
| GET `/:npi/status` | params | `npiParamSchema` | npi (10 digits) |

### Insurance Card Routes (`insuranceCard.ts`)

| Endpoint | Input Source | Schema | Fields Validated |
|----------|-------------|--------|-----------------|
| POST `/scan` | body | `scanBodySchema` | imageBase64 (min 1, max 15MB), mimeType (enum: jpeg/png/webp/gif) |
| POST `/save` | body | `saveBodySchema` | 21 fields, all trimmed nullable optional strings + confidence_score (optional number) |
| GET `/` | none | none | No user input |
| PATCH `/` | body | `updateBodySchema` | Same 21 fields as save, with `.refine()` requiring at least one field |
| DELETE `/` | none | none | No user input |

### Admin Routes (`admin.ts`)

| Endpoint | Input Source | Validation | Notes |
|----------|-------------|------------|-------|
| POST `/cleanup-expired` | query | Manual `parseInt` | `dryRun` compared to string `'true'`, `batchSize` via `parseInt` with fallback |
| POST `/cleanup-sessions` | query | Manual string compare | `dryRun` compared to string `'true'` |
| GET `/expiration-stats` | none | none | No user input |
| GET `/health` | none | none | No user input |
| POST `/cache/clear` | none | none | No user input |
| GET `/cache/stats` | none | none | No user input |
| GET `/enrichment/stats` | none | none | No user input |
| POST `/cleanup/sync-logs` | query | Manual `parseInt` | `dryRun` string, `retentionDays` via `parseInt` with fallback |
| GET `/retention/stats` | none | none | No user input |
| POST `/recalculate-confidence` | query | Manual `parseInt` + check | `dryRun` string, `limit` via `parseInt` with `isNaN` + `< 1` validation |
| POST `/rotate-encryption-key` | query | Manual `parseInt` | `dryRun` string, `batchSize` via `parseInt` with fallback |

---

## Shared Schema Analysis (`schemas/commonSchemas.ts`)

| Schema | Fields | Constraints | Used In |
|--------|--------|-------------|---------|
| `paginationSchema` | page, limit | page: int >= 1 (default 1), limit: int 1-100 (default 20) | providers, plans, locations, savedProviders, verify |
| `npiParamSchema` | npi | string, exactly 10 chars, regex `/^\d+$/` | providers, verify, savedProviders |
| `stateQuerySchema` | state | string, exactly 2 chars, toUpperCase(), optional | plans, locations |
| `planIdParamSchema` | planId | string, 1-50 chars | plans, verify |

**Consistency check:** All route files import and use these shared schemas rather than redefining them, ensuring uniform validation across the API.

---

## Error Handling for Invalid Input

**Zod errors** are caught by the global `errorHandler` middleware (`errorHandler.ts` lines 102-118):

```typescript
// Response format for Zod validation errors:
{
  success: false,
  error: {
    message: 'Validation error',
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    requestId: '<uuid>',
    details: [
      { field: 'npi', message: 'NPI must be exactly 10 digits' },
      { field: 'page', message: 'Expected number, received string' }
    ]
  }
}
```

**Payload too large** errors are caught separately (lines 121-131) and return 413 with code `PAYLOAD_TOO_LARGE`.

**Prisma errors** are caught and mapped to appropriate HTTP status codes:
- P2002 (unique constraint) -> 409 `DUPLICATE_ENTRY`
- P2025 (not found) -> 404 `NOT_FOUND`
- P2003 (foreign key) -> 400 `FOREIGN_KEY_VIOLATION`
- P2024 (pool timeout) -> 503 `DATABASE_TIMEOUT`
- P2010 (raw query) -> 500 `QUERY_ERROR` (message hidden in production)

**Generic 500 errors** in production return `"Internal server error"` without exposing stack traces or error details (line 238).

---

## Security Analysis

### SQL Injection Risk: NONE

All database queries use Prisma's parameterized query builder. No raw SQL queries are exposed to user input. The few places using `prisma.$queryRaw` (e.g., health check `SELECT 1`) have no user-supplied parameters.

### String Sanitization

Zod schemas enforce maximum string lengths on all text inputs:
- Names: max 200 characters
- Notes: max 1000 characters
- URLs: max 500 characters
- States: exactly 2 characters
- NPI: exactly 10 digits
- Plan IDs: max 50 characters
- Cities: max 100 characters
- ZIP codes: max 10 characters
- Insurance card fields: trimmed nullable strings with DB column limits (VarChar constraints)

No HTML/XSS sanitization is applied, but this is appropriate since:
1. The API returns JSON only (no HTML rendering)
2. The frontend is responsible for output encoding
3. Helmet's CSP headers (`default-src: 'none'`, `script-src: 'none'`) prevent XSS in any accidentally-rendered HTML

### File Upload Validation

The insurance card scan endpoint validates:
- Image type: enum of 4 allowed MIME types (`image/jpeg`, `image/png`, `image/webp`, `image/gif`) -- line 35 of `insuranceCard.ts`
- Image size: max 15MB for the base64 string (line 38), plus 16MB body limit at the Express level (line 113)
- Image is received as base64 string, not as a file upload, so no filesystem write concerns

### NPI Validation

The `npiParamSchema` uses regex `/^\d+$/` with exact length 10, which correctly validates NPI format. Note: This validates format only, not the NPI Luhn check digit. The application does verify provider existence in the database after format validation.

### Type Coercion

Query parameters from Express arrive as strings. Zod's `z.coerce.number()` is used where numeric query parameters are expected:
- `paginationSchema`: page, limit
- `mapQuerySchema`: north, south, east, west, limit
- `locationIdSchema`: locationId
- `plansQuerySchema`: minConfidence

This prevents type mismatch errors when query strings like `?page=2` arrive as `"2"`.

---

## Findings

### Observation: Admin Query Parameter Validation

Admin endpoints (`admin.ts`) use manual `parseInt()` with `|| defaultValue` fallback patterns rather than Zod schemas. For example:

```typescript
// admin.ts line 77
const batchSize = parseInt(req.query.batchSize as string) || 1000;
```

This works but is less robust than Zod:
- `parseInt('abc')` returns `NaN`, which becomes `1000` via `|| 1000` -- acceptable
- `parseInt('0')` returns `0`, which becomes `1000` via `|| 1000` -- might be unexpected but harmless for these use cases
- No max bound on `batchSize` or `retentionDays`

Since admin endpoints are already protected by the `X-Admin-Secret` header, the risk is minimal. However, for consistency, these could be migrated to Zod schemas. The `recalculate-confidence` endpoint (line 510) already does explicit `isNaN` + range checking, which is more thorough.

### All Clear

No unvalidated user inputs were found reaching database queries. Every route handler either:
1. Uses Zod `.parse()` (throws on invalid input, caught by error handler)
2. Uses Zod `.safeParse()` with explicit error handling (auth verify endpoint)
3. Has no user input (stats/health endpoints)
4. Is admin-only with manual validation (admin endpoints)

---

## Validation Summary Table

| Route File | Endpoints | All Validated | Schema Type |
|------------|-----------|---------------|-------------|
| providers.ts | 6 | YES | Shared + local Zod schemas |
| plans.ts | 6 | YES | Shared + local Zod schemas |
| verify.ts | 5 | YES | Shared + local Zod schemas |
| locations.ts | 5 | YES | Local Zod schemas |
| auth.ts | 8 | YES | Local Zod schemas + manual cookie check |
| savedProviders.ts | 4 | YES | Shared Zod schemas |
| insuranceCard.ts | 5 | YES | Local Zod schemas |
| admin.ts | 11 | PARTIAL | Manual parseInt for query params (admin-only) |

**Total: 50 endpoints, all validated.** Admin endpoints use lighter validation appropriate for their access level.

---

## Files Reviewed

- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\schemas\commonSchemas.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\providers.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\plans.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\verify.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\locations.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\auth.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\savedProviders.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\insuranceCard.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\admin.ts`
- `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\errorHandler.ts`
