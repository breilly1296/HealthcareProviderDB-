# Input Validation

## Validation Status

**Overall: STRONG** -- All API endpoints use Zod schema validation on inputs. Validation is centralized through shared schemas (`commonSchemas.ts`) and route-specific schemas. The global error handler properly catches and formats Zod validation errors as 400 responses with field-level detail.

## Validation Library

- **Zod** is used consistently across all route files
- Schemas are parsed with `.parse()` which throws `ZodError` on failure
- The global `errorHandler` in `packages/backend/src/middleware/errorHandler.ts` (lines 100-116) catches `ZodError` by name and returns structured 400 responses with per-field error details

## Shared Schemas (`packages/backend/src/schemas/commonSchemas.ts`)

| Schema | Validation Rules | Used In |
|--------|-----------------|---------|
| `paginationSchema` | `page`: coerced int, min 1, default 1; `limit`: coerced int, min 1, max 100, default 20 | providers, plans, locations, verify |
| `npiParamSchema` | `npi`: string, exactly 10 chars, regex `^\d+$` ("NPI must be exactly 10 digits") | providers, verify |
| `stateQuerySchema` | `state`: string, exactly 2 chars, `.toUpperCase()`, optional | plans, locations |
| `planIdParamSchema` | `planId`: string, min 1, max 50 | plans, verify |

## Route-Specific Validation

### `providers.ts` (`packages/backend/src/routes/providers.ts`)

| Endpoint | Schema | Fields Validated |
|----------|--------|-----------------|
| `GET /search` | `searchQuerySchema` merged with `paginationSchema` | `state` (2-char, uppercase, optional), `city` (1-100, optional), `cities` (1-500, optional), `zipCode` (3-10, optional), `specialty` (1-200, optional), `specialtyCategory` (1-100, optional), `name` (1-200, optional), `npi` (10-digit regex, optional), `entityType` (enum INDIVIDUAL/ORGANIZATION, optional) |
| `GET /cities` | inline `stateSchema` | `state` (2-char, uppercase, required) |
| `GET /:npi` | `npiParamSchema` | `npi` (10-digit regex) |

### `verify.ts` (`packages/backend/src/routes/verify.ts`)

| Endpoint | Schema | Fields Validated |
|----------|--------|-----------------|
| `POST /` | `submitVerificationSchema` | `npi` (10-digit), `planId` (1-50), `acceptsInsurance` (boolean, required), `acceptsNewPatients` (boolean, optional), `locationId` (positive int, optional), `notes` (max 1000, optional), `evidenceUrl` (valid URL, max 500, optional), `submittedBy` (email, max 200, optional), `captchaToken` (string, optional), `website` (string, optional -- honeypot) |
| `POST /:verificationId/vote` | `verificationIdParamSchema` + `voteSchema` | `verificationId` (min 1), `vote` (enum up/down), `captchaToken` (optional), `website` (optional -- honeypot) |
| `GET /stats` | none (no params) | N/A |
| `GET /recent` | `recentQuerySchema` | `limit` (coerced int, 1-100, default 20), `npi` (10-digit, optional), `planId` (1-50, optional) |
| `GET /:npi/:planId` | `pairParamsSchema` | `npi` (10-digit), `planId` (1-50) |

### `plans.ts` (`packages/backend/src/routes/plans.ts`)

| Endpoint | Schema | Fields Validated |
|----------|--------|-----------------|
| `GET /search` | `searchQuerySchema` + `paginationSchema` | `issuerName` (1-200, optional), `planType` (1-20, optional), `search` (1-200, optional), `state` (2-char, optional) |
| `GET /grouped` | inline schema | `search` (1-200, optional), `state` (2-char, optional) |
| `GET /meta/issuers` | `stateQuerySchema` | `state` (2-char, optional) |
| `GET /meta/types` | `stateQuerySchema` + inline | `state` (2-char, optional), `issuerName` (1-200, optional) |
| `GET /:planId/providers` | `planIdParamSchema` + `paginationSchema` | `planId` (1-50), `page`, `limit` |
| `GET /:planId` | `planIdParamSchema` | `planId` (1-50) |

### `locations.ts` (`packages/backend/src/routes/locations.ts`)

| Endpoint | Schema | Fields Validated |
|----------|--------|-----------------|
| `GET /search` | `searchQuerySchema` + `paginationSchema` | `state` (2-char, required), `city` (1-100, optional), `zipCode` (3-10, optional) |
| `GET /health-systems` | `healthSystemsQuerySchema` | `state` (2-char, optional), `city` (1-100, optional) |
| `GET /stats/:state` | `stateParamSchema` | `state` (2-char, required) |
| `GET /:locationId` | `locationIdSchema` | `locationId` (coerced positive int) |
| `GET /:locationId/providers` | `locationIdSchema` + `paginationSchema` | `locationId` (coerced positive int), `page`, `limit` |

### `admin.ts` (`packages/backend/src/routes/admin.ts`)

- Admin endpoints validate `X-Admin-Secret` header via `adminAuthMiddleware` with timing-safe comparison (`timingSafeEqual` from `crypto` -- line 48)
- `POST /recalculate-confidence`: validates `limit` as positive integer (line 469)
- Other admin endpoints use inline query param parsing (dryRun, batchSize, retentionDays)

### Insurance Card Extraction (`packages/frontend/src/app/api/insurance-card/extract/route.ts`)

| Check | Validation |
|-------|-----------|
| Image presence | `!image` returns 400 |
| Image type | `typeof image !== 'string'` returns 400 |
| Image size | `image.length > MAX_BASE64_LENGTH` (10MB * 1.37) returns 413 |
| Base64 format | regex `/^[A-Za-z0-9+/]+=*$/` returns 400 |
| Minimum size | `base64Data.length < 100` returns 400 |

## Questions Answered

### 1. Are NPIs validated (10-digit format)?
**YES.** The shared `npiParamSchema` at `packages/backend/src/schemas/commonSchemas.ts` line 22-24 enforces: `z.string().length(10).regex(/^\d+$/, 'NPI must be exactly 10 digits')`. This is used in `providers.ts` (line 306), `verify.ts` (lines 23, 48), and all routes accepting NPI parameters. Note: The Luhn check digit algorithm (which CMS uses for NPI validation) is NOT implemented -- only format validation is performed.

### 2. Are UUIDs validated before database queries?
**PARTIALLY.** Verification IDs use CUID format (from Prisma `@default(cuid())`), and `verificationIdParamSchema` validates them as `z.string().min(1)` at `verify.ts` line 41. Plan IDs are validated as `z.string().min(1).max(50)`. Location IDs are validated as `z.coerce.number().int().positive()`. However, there is no strict UUID/CUID format regex -- just length and presence checks.

### 3. Are strings sanitized?
**PARTIALLY.** String inputs have max length limits enforced (e.g., `name` max 200, `notes` max 1000, `evidenceUrl` max 500). State codes are uppercased with `.toUpperCase()`. However, there is no explicit HTML/XSS sanitization since the API returns JSON only (no HTML rendering on the backend). Prisma's parameterized queries prevent the string content from being interpreted as SQL.

### 4. Are file uploads validated (if any)?
**YES.** The insurance card extraction endpoint (`packages/frontend/src/app/api/insurance-card/extract/route.ts`) validates: type (must be string/base64), size (max 10MB), format (valid base64 characters via regex), minimum size (at least 100 chars), and media type is detected via magic bytes. Rate limited to 10 extractions per hour per IP.

### 5. Are there any SQL injection risks?
**NO.** All database queries use Prisma ORM which generates parameterized queries. No raw SQL is used in the route handlers. The only raw query is `prisma.$queryRaw\`SELECT 1\`` in the health check endpoint (`index.ts` line 121), which takes no user input.

## Issues Found

1. **No NPI Luhn check digit validation** -- The NPI format is validated (10 digits) but the Luhn algorithm check digit is not verified. Invalid NPIs like `0000000000` would pass validation.

2. **Weak verification ID validation** -- `verificationIdParamSchema` only checks `z.string().min(1)`. A CUID format regex would be more appropriate.

3. **No `evidenceUrl` domain restriction** -- The `evidenceUrl` field in verification submissions accepts any valid URL. While it is stored but never fetched server-side (eliminating SSRF), it could be used for phishing links in the UI if displayed as clickable.

4. **Admin `batchSize` parameter** -- In `admin.ts` line 73, `batchSize` is parsed with `parseInt()` without Zod, defaulting to 1000. Similarly, `retentionDays` at line 278. These should use Zod for consistency.

5. **CSP disabled on frontend** -- In `packages/frontend/next.config.js` line 14, the Content-Security-Policy header is commented out ("CSP disabled - was blocking API requests"). This removes a layer of XSS protection.

## Recommendations

1. Add NPI Luhn check digit validation to `npiParamSchema` for stronger data integrity
2. Add CUID format regex to `verificationIdParamSchema` (e.g., `/^c[a-z0-9]{24}$/`)
3. Consider URL domain restrictions or nofollow/noopener rendering for `evidenceUrl` on the frontend
4. Migrate admin endpoint inline parsing to Zod schemas for consistency
5. Re-enable CSP on the frontend with properly configured directives for reCAPTCHA and API domains
6. Add request body size limits to the insurance card extraction endpoint (JSON body limit via Next.js config)
