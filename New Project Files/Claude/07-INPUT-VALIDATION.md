# Input Validation Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/07-input-validation.md
**Status:** Strong. Zod validation is applied consistently across all active route endpoints. Shared schemas are centralized in `commonSchemas.ts`. Error handler properly formats Zod validation errors with field-level details. Minor gaps in admin route validation.

---

## Findings

### Shared Schema Validation (`schemas/commonSchemas.ts`)

| Schema | Validation Rules | Used By | Status |
|--------|-----------------|---------|--------|
| `paginationSchema` | `page`: coerce to int, min 1, default 1; `limit`: coerce to int, min 1, max 100, default 20 | providers.ts, plans.ts, locations.ts, verify.ts | Verified |
| `npiParamSchema` | `npi`: string, exactly 10 chars, regex `/^\d+$/` ("NPI must be exactly 10 digits") | providers.ts, verify.ts | Verified |
| `stateQuerySchema` | `state`: string, exactly 2 chars, `.toUpperCase()`, optional | plans.ts, locations.ts | Verified |
| `planIdParamSchema` | `planId`: string, min 1, max 50 | plans.ts, verify.ts | Verified |

- Verified: Type exports provided for TypeScript consumers (`PaginationInput`, `NpiParamInput`, `StateQueryInput`, `PlanIdParamInput`).

### Per-Endpoint Validation Analysis

#### Provider Routes (`routes/providers.ts`)

**GET `/search`** -- Verified
```
searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  cities: z.string().min(1).max(500).optional(),
  zipCode: z.string().min(3).max(10).optional(),
  specialty: z.string().min(1).max(200).optional(),
  specialtyCategory: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
  npi: z.string().length(10).regex(/^\d+$/).optional(),
  entityType: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
}).merge(paginationSchema)
```
- All string fields have `min(1)` (prevents empty strings) and `max()` bounds (prevents oversized inputs).
- `state` uses `.toUpperCase()` for normalization.
- `entityType` uses `z.enum()` for strict allow-list.
- `npi` in search has same 10-digit regex as `npiParamSchema`.

**GET `/cities`** -- Verified
```
stateSchema = z.object({
  state: z.string().length(2).toUpperCase(),
})
```
- Inline schema (not from commonSchemas). State is **required** here (no `.optional()`), which is correct since cities need a state filter.

**GET `/:npi`** -- Verified
- Uses `npiParamSchema.parse(req.params)` -- 10-digit regex validation on URL param.

#### Plan Routes (`routes/plans.ts`)

**GET `/search`** -- Verified
```
searchQuerySchema = z.object({
  issuerName: z.string().min(1).max(200).optional(),
  planType: z.string().min(1).max(20).optional(),
  search: z.string().min(1).max(200).optional(),
  state: z.string().length(2).toUpperCase().optional(),
}).merge(paginationSchema)
```

**GET `/grouped`** -- Verified
```
z.object({
  search: z.string().min(1).max(200).optional(),
  state: z.string().length(2).toUpperCase().optional(),
})
```
- Inline schema with appropriate bounds.

**GET `/meta/issuers`** -- Verified
- Uses `stateQuerySchema.parse(req.query)` -- optional 2-char state.

**GET `/meta/types`** -- Verified
```
stateQuerySchema.extend({
  issuerName: z.string().min(1).max(200).optional(),
})
```
- Extends shared schema with additional field.

**GET `/:planId/providers`** -- Verified
- Uses `planIdParamSchema.parse(req.params)` (min 1, max 50) + `paginationSchema.parse(req.query)`.

**GET `/:planId`** -- Verified
- Uses `planIdParamSchema.parse(req.params)` (min 1, max 50).

#### Verification Routes (`routes/verify.ts`)

**POST `/`** -- Verified
```
submitVerificationSchema = npiParamSchema.merge(planIdParamSchema).extend({
  acceptsInsurance: z.boolean(),
  acceptsNewPatients: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
  evidenceUrl: z.string().url().max(500).optional(),
  submittedBy: z.string().email().max(200).optional(),
  captchaToken: z.string().optional(),
})
```
- `acceptsInsurance` is required boolean -- correct.
- `notes` has max 1000 char limit.
- `evidenceUrl` uses `z.string().url()` for URL format validation.
- `submittedBy` uses `z.string().email()` for email format validation.
- Inherits NPI (10-digit) and planId (min 1, max 50) from shared schemas.

**POST `/:verificationId/vote`** -- Verified
```
verificationIdParamSchema = z.object({
  verificationId: z.string().min(1),
})
voteSchema = z.object({
  vote: z.enum(['up', 'down']),
  captchaToken: z.string().optional(),
})
```
- `vote` restricted to enum `['up', 'down']` -- prevents arbitrary values.
- `verificationId` has min 1 but no max length constraint.

**GET `/stats`** -- Verified (no validation needed)
- No query parameters, no body. Calls `getVerificationStats()` directly.

**GET `/recent`** -- Verified
```
recentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  npi: npiParamSchema.shape.npi.optional(),
  planId: planIdParamSchema.shape.planId.optional(),
})
```
- Reuses NPI and planId shapes from shared schemas as optional filters.

**GET `/:npi/:planId`** -- Verified
```
pairParamsSchema = npiParamSchema.merge(planIdParamSchema)
```
- Validates both URL params via shared schemas.

#### Admin Routes (`routes/admin.ts`)

**POST `/cleanup-expired`** -- Warning
- `dryRun` parsed as `req.query.dryRun === 'true'` (simple string comparison, not Zod).
- `batchSize` parsed as `parseInt(req.query.batchSize as string) || 1000` (not Zod validated).
- No bounds checking on batchSize -- a very large value could cause performance issues.

**GET `/expiration-stats`** -- Verified
- No query parameters needed. Auth-only.

**GET `/health`** -- Verified
- No query parameters needed. Auth-only.

**POST `/cache/clear`** -- Verified
- No query parameters needed. Auth-only.

**GET `/cache/stats`** -- Verified
- No query parameters needed. Auth-only.

**POST `/cleanup/sync-logs`** -- Warning
- `dryRun` parsed as `req.query.dryRun === 'true'` (not Zod).
- `retentionDays` parsed as `parseInt(req.query.retentionDays as string) || 90` (not Zod validated).
- No bounds checking on retentionDays -- setting to 0 would delete all records.

**GET `/retention/stats`** -- Verified
- No query parameters needed. Auth-only.

#### Location Routes (`routes/locations.ts`) -- DISABLED

All 5 endpoints in the disabled file have proper Zod validation:
- `searchQuerySchema` with field bounds
- `locationIdSchema` with `z.coerce.number().int().positive()`
- `stateParamSchema` with required 2-char state
- These are currently non-functional since the route is commented out in `index.ts`.

### Validation Infrastructure

#### Error Handler (`middleware/errorHandler.ts`) -- Verified

The global error handler at line 101 catches `ZodError` by name and returns structured 400 responses:
```json
{
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "requestId": "...",
    "details": [
      { "field": "state", "message": "String must contain exactly 2 character(s)" }
    ]
  }
}
```
- Field-level error details are mapped from `zodError.errors` with `path.join('.')` and `message`.
- Request ID included for correlation.

#### Payload Size Limit -- Verified

`express.json({ limit: '100kb' })` at `index.ts` line 88 prevents large payload attacks. The error handler catches `PayloadTooLargeError` and returns a 413 response.

### Prompt Question Responses

**1. Are NPIs validated (10-digit format)?**
- Verified: `npiParamSchema` uses `z.string().length(10).regex(/^\d+$/)`. Applied in `providers.ts` (`:npi` param), `verify.ts` (POST body and `/:npi/:planId` params), and the provider search schema (optional NPI filter).

**2. Are UUIDs validated before database queries?**
- Partially: `verificationId` is validated as `z.string().min(1)` but does not enforce UUID format specifically. Since verification IDs use `@default(cuid())` (not UUID format), this is acceptable -- CUIDs are string-based and `min(1)` prevents empty values. However, there is no `max()` length constraint.

**3. Are strings sanitized?**
- All string inputs have `max()` length constraints (100-1000 chars depending on field).
- Prisma ORM handles SQL parameterization, preventing injection.
- There is no explicit HTML/XSS sanitization of string values (e.g., `notes`, `name`). Since this is a JSON API (no HTML rendering on the backend), the risk is limited to stored XSS if values are rendered unsanitized on the frontend.

**4. Are file uploads validated (if any)?**
- No file upload endpoints exist in the codebase. Not applicable.

**5. Are there any SQL injection risks? (Prisma should prevent)**
- Verified: All database access goes through Prisma, which uses parameterized queries. The only raw SQL is the health check `prisma.$queryRaw\`SELECT 1\`` which has no user input. No SQL injection risk found.

### Type Coercion Handling

- Verified: `z.coerce.number()` is used for pagination params (`page`, `limit`) and `recentQuerySchema.limit`, correctly handling query string-to-number conversion.
- Verified: `z.string().toUpperCase()` normalizes state codes.
- Verified: `locationIdSchema` uses `z.coerce.number().int().positive()` for numeric URL params.

---

## Summary

Input validation is implemented thoroughly across the codebase using Zod. Every active public-facing endpoint validates its inputs through Zod's `.parse()` method, which throws `ZodError` on failure. The global error handler catches these errors and returns structured 400 responses with field-level details. Shared schemas (`commonSchemas.ts`) ensure consistent validation of NPI numbers (10-digit regex), pagination bounds (page min 1, limit 1-100), plan IDs (1-50 chars), and state codes (2-char uppercase). String length limits are applied to all text fields. Prisma ORM provides parameterized queries, eliminating SQL injection risk. The only gaps are in admin route query parameters (`batchSize`, `retentionDays`, `dryRun`) which use `parseInt` instead of Zod, and the missing max-length constraint on `verificationId`.

## Recommendations

1. **Add Zod validation to admin query parameters.** Replace `parseInt()` and string comparison with Zod schemas for `batchSize`, `retentionDays`, and `dryRun`. Example:
   ```typescript
   const cleanupQuerySchema = z.object({
     dryRun: z.enum(['true', 'false']).default('false'),
     batchSize: z.coerce.number().int().min(1).max(10000).default(1000),
   });
   ```
   This adds bounds checking (preventing `batchSize=999999999` or `retentionDays=0`).

2. **Add a max-length constraint to `verificationId`** in `verify.ts`. CUIDs are 25 characters, so `z.string().min(1).max(30)` would be appropriate. This prevents an attacker from sending an excessively long string as the verification ID.

3. **Consider adding XSS sanitization for stored text fields** (`notes`, `evidenceUrl`, `submittedBy`). While the backend serves only JSON and Prisma prevents SQL injection, a stored XSS attack could execute if the frontend renders these values without escaping. A library like `xss` or `DOMPurify` (server-side) could strip malicious content.

4. **Consider adding Luhn check digit validation to NPI numbers.** The current validation checks format (10 digits) but not the NPI check digit algorithm. An invalid check digit indicates a typo or fabricated NPI. This would catch bad data before it hits the database.

5. **Add a `captchaToken` min-length constraint.** Currently `captchaToken: z.string().optional()` accepts any string including an empty one (though the CAPTCHA middleware would reject it). Adding `.min(1)` would provide defense-in-depth.

6. **Document validation patterns for future contributors.** The current approach (Zod `.parse()` in route handlers with shared schemas in `commonSchemas.ts`) is consistent but not documented. Consider adding a brief comment in the schemas file explaining the convention.
