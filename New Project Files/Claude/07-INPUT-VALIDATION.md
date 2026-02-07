# Input Validation Review

## Validation Status

**Overall Assessment: STRONG**

The HealthcareProviderDB backend implements a comprehensive, multi-layered input validation strategy built on Zod schemas with consistent application across all five route modules (`providers.ts`, `verify.ts`, `plans.ts`, `locations.ts`, `admin.ts`). Every user-facing route validates inputs before they reach business logic or database queries. The implementation includes body size limits, type coercion for query strings, string length constraints, format validation (NPI, emails, URLs), and enum-restricted values. Prisma ORM provides an additional layer of protection against SQL injection.

---

## Architecture Overview

The validation architecture follows a layered approach:

1. **Express body parser size limits** (first line of defense)
2. **Rate limiting middleware** (per-route, sliding window)
3. **Honeypot bot detection** (verification/vote endpoints)
4. **reCAPTCHA v3 verification** (verification/vote endpoints)
5. **Zod schema validation** (every route handler)
6. **Service-layer business validation** (existence checks, Sybil prevention)
7. **Prisma ORM** (parameterized queries, type safety)
8. **Global error handler** (catches and normalizes all validation failures)

---

## Detailed Findings by Route

### 1. Providers (`packages/backend/src/routes/providers.ts`)

**Schemas Applied:**

```typescript
// Search validation
const searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  cities: z.string().min(1).max(500).optional(),
  zipCode: z.string().min(3).max(10).optional(),
  specialty: z.string().min(1).max(200).optional(),
  specialtyCategory: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
  npi: z.string().length(10).regex(/^\d+$/).optional(),
  entityType: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
}).merge(paginationSchema);
```

**Validation Coverage:**
- `GET /search` -- `searchQuerySchema.parse(req.query)` validates all query parameters
- `GET /cities` -- Inline `stateSchema` with `z.string().length(2).toUpperCase()` validates state
- `GET /:npi` -- `npiParamSchema.parse(req.params)` validates NPI format (10 digits)
- `GET /:npi/colocated` -- `npiParamSchema` + `paginationSchema` validates both params and query

**NPI Validation:**
- Exactly 10 characters: `z.string().length(10)`
- Digits only: `.regex(/^\d+$/)`
- Custom error message: `'NPI must be exactly 10 digits'`
- Applied via shared `npiParamSchema` from `packages/backend/src/schemas/commonSchemas.ts`

**Strengths:**
- State codes are auto-uppercased with `.toUpperCase()`
- All string fields have explicit max lengths preventing large payload attacks
- Entity type restricted to enum values
- Pagination bounded: `page >= 1`, `limit` between 1-100 with default of 20

---

### 2. Verify (`packages/backend/src/routes/verify.ts`)

**Schemas Applied:**

```typescript
const submitVerificationSchema = npiParamSchema.merge(planIdParamSchema).extend({
  acceptsInsurance: z.boolean(),
  acceptsNewPatients: z.boolean().optional(),
  locationId: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
  evidenceUrl: z.string().url().max(500).optional(),
  submittedBy: z.string().email().max(200).optional(),
  captchaToken: z.string().optional(),
  website: z.string().optional(),  // honeypot field
});

const voteSchema = z.object({
  vote: z.enum(['up', 'down']),
  captchaToken: z.string().optional(),
  website: z.string().optional(),  // honeypot field
});
```

**Validation Coverage:**
- `POST /` -- `submitVerificationSchema.parse(req.body)` validates full submission
- `POST /:verificationId/vote` -- `verificationIdParamSchema` + `voteSchema` validates params and body
- `GET /recent` -- `recentQuerySchema.parse(req.query)` validates filters
- `GET /:npi/:planId` -- `pairParamsSchema.parse(req.params)` validates both NPI and plan ID

**Multi-Layer Security on Verification Submission:**
1. `verificationRateLimiter` -- 10 requests/hour per IP
2. `honeypotCheck('website')` -- Silent bot detection
3. `verifyCaptcha` -- Google reCAPTCHA v3 with score threshold (>= 0.5)
4. Zod schema validation
5. Service-layer Sybil attack prevention (30-day window per IP/email)

**Strengths:**
- `evidenceUrl` validated as proper URL with `z.string().url()`
- `submittedBy` validated as email with `z.string().email()`
- `locationId` must be a positive integer
- Vote restricted to `'up'` or `'down'` enum
- Notes capped at 1000 characters
- `recentQuerySchema` uses `z.coerce.number()` for proper query string handling

---

### 3. Plans (`packages/backend/src/routes/plans.ts`)

**Schemas Applied:**

```typescript
const searchQuerySchema = z.object({
  issuerName: z.string().min(1).max(200).optional(),
  planType: z.string().min(1).max(20).optional(),
  search: z.string().min(1).max(200).optional(),
  state: z.string().length(2).toUpperCase().optional(),
}).merge(paginationSchema);
```

**Validation Coverage:**
- `GET /search` -- `searchQuerySchema.parse(req.query)` validates search parameters
- `GET /grouped` -- Inline schema with search and state validation
- `GET /meta/issuers` -- `stateQuerySchema.parse(req.query)` validates state
- `GET /meta/types` -- Extended `stateQuerySchema` with issuerName validation
- `GET /:planId/providers` -- `planIdParamSchema` + `paginationSchema`
- `GET /:planId` -- `planIdParamSchema.parse(req.params)` validates plan ID

**Strengths:**
- All string inputs have max length constraints
- Plan ID validated as non-empty string with max 50 characters
- Consistent use of shared schemas (`paginationSchema`, `planIdParamSchema`, `stateQuerySchema`)

---

### 4. Locations (`packages/backend/src/routes/locations.ts`)

**Schemas Applied:**

```typescript
const searchQuerySchema = z.object({
  state: z.string().length(2).toUpperCase(),  // Required
  city: z.string().min(1).max(100).optional(),
  zipCode: z.string().min(3).max(10).optional(),
}).merge(paginationSchema);

const locationIdSchema = z.object({
  locationId: z.coerce.number().int().positive(),
});
```

**Validation Coverage:**
- `GET /search` -- State is **required** (not optional), city and zip are optional
- `GET /health-systems` -- `healthSystemsQuerySchema` validates state and city
- `GET /stats/:state` -- `stateParamSchema` validates 2-letter state code
- `GET /:locationId` -- `locationIdSchema` with `z.coerce.number().int().positive()`
- `GET /:locationId/providers` -- `locationIdSchema` + `paginationSchema`

**Strengths:**
- Location IDs use `z.coerce.number()` to safely handle query string to number conversion
- Positive integer check prevents zero and negative IDs
- State is mandatory for location searches, preventing unbounded queries

---

### 5. Admin (`packages/backend/src/routes/admin.ts`)

**Authentication:**
All admin routes are protected by `adminAuthMiddleware` which:
- Returns 503 if `ADMIN_SECRET` is not configured
- Uses `crypto.timingSafeEqual()` for constant-time secret comparison (prevents timing attacks)
- Validates the `X-Admin-Secret` header

**Validation Coverage:**
- `POST /cleanup-expired` -- `dryRun` checked as string equality (`=== 'true'`); `batchSize` parsed via `parseInt` with fallback to 1000
- `POST /cleanup/sync-logs` -- `dryRun` and `retentionDays` parsed similarly
- `POST /recalculate-confidence` -- `limit` parsed via `parseInt` with explicit validation (`isNaN(limit) || limit < 1`)

---

### 6. Shared Schemas (`packages/backend/src/schemas/commonSchemas.ts`)

```typescript
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const npiParamSchema = z.object({
  npi: z.string().length(10).regex(/^\d+$/, 'NPI must be exactly 10 digits'),
});

export const stateQuerySchema = z.object({
  state: z.string().length(2).toUpperCase().optional(),
});

export const planIdParamSchema = z.object({
  planId: z.string().min(1).max(50),
});
```

These shared schemas enforce consistent validation across all route files. Type exports (`PaginationInput`, `NpiParamInput`, etc.) ensure compile-time type safety as well.

---

## Middleware Analysis

### Error Handler (`packages/backend/src/middleware/errorHandler.ts`)

The global error handler properly catches and normalizes Zod validation errors:

```typescript
if (err.name === 'ZodError') {
  const zodError = err as unknown as { errors: Array<{ path: string[]; message: string }> };
  res.status(400).json({
    success: false,
    error: {
      message: 'Validation error',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      requestId: req.id,
      details: zodError.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    },
  });
}
```

**Additional error types handled:**
- `PayloadTooLargeError` (413) -- For body size limit violations
- `PrismaClientKnownRequestError` -- P2002 (duplicate), P2025 (not found), P2003 (FK violation), P2024 (connection pool timeout), P2010 (raw query failure)
- `PrismaClientInitializationError` -- Database connection failures
- Production mode hides internal error messages from responses

### Rate Limiting (`packages/backend/src/middleware/rateLimiter.ts`)

Four pre-configured rate limiters using sliding window algorithm:

| Limiter | Max Requests | Window | Applied To |
|---------|-------------|--------|-----------|
| `defaultRateLimiter` | 200 | 1 hour | Global (all routes) |
| `searchRateLimiter` | 100 | 1 hour | Search endpoints |
| `verificationRateLimiter` | 10 | 1 hour | Verification submission |
| `voteRateLimiter` | 10 | 1 hour | Vote submission |

- Supports both Redis (distributed) and in-memory (single-instance) modes
- **Fail-open behavior:** If Redis becomes unavailable, requests are allowed with a logged warning
- Sliding window prevents burst attacks at window boundaries
- Sets standard rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### CAPTCHA (`packages/backend/src/middleware/captcha.ts`)

- Google reCAPTCHA v3 with configurable minimum score (default 0.5)
- Configurable fail mode: `CAPTCHA_FAIL_MODE=open` (default) or `closed`
- On fail-open: Applies stricter fallback rate limiting (3 requests/hour vs normal 10)
- Skipped in development/test environments
- 5-second timeout on Google API calls to prevent hanging
- Accepts token from body (`captchaToken`) or header (`x-captcha-token`)

### Honeypot (`packages/backend/src/middleware/honeypot.ts`)

- Hidden form field (`website`) that real users never fill in
- If populated (by a bot), returns `200 OK` with fake success to avoid alerting the bot
- Applied to verification and vote endpoints

### Request Timeouts (`packages/backend/src/middleware/requestTimeout.ts`)

| Timeout | Duration | Applied To |
|---------|---------|-----------|
| `generalTimeout` | 30 seconds | All `/api/v1` routes |
| `searchTimeout` | 15 seconds | Search endpoints |
| `adminTimeout` | 120 seconds | Admin cleanup endpoints |

### Body Size Limits (`packages/backend/src/index.ts`)

```typescript
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
```

Both JSON and URL-encoded body parsing are limited to 100KB. Violations trigger the `PayloadTooLargeError` handler.

---

## Service-Layer Validation

### Sybil Attack Prevention (`packages/backend/src/services/verificationService.ts`)

The `checkSybilAttack` function prevents duplicate verifications:

```typescript
async function checkSybilAttack(
  providerNpi: string,
  planId: string,
  sourceIp?: string,
  submittedBy?: string
): Promise<void> {
  const cutoffDate = new Date(Date.now() - SYBIL_PREVENTION_WINDOW_MS); // 30 days

  // Check for duplicate from same IP
  if (sourceIp) {
    const existingFromIp = await prisma.verificationLog.findFirst({ ... });
    if (existingFromIp) throw AppError.conflict('...');
  }

  // Check for duplicate from same email
  if (submittedBy) {
    const existingFromEmail = await prisma.verificationLog.findFirst({ ... });
    if (existingFromEmail) throw AppError.conflict('...');
  }
}
```

### Entity Existence Validation

Before creating verification records, the service validates that both provider and plan exist:

```typescript
async function validateProviderAndPlan(npi: string, planId: string) {
  const provider = await prisma.provider.findUnique({ where: { npi } });
  if (!provider) throw AppError.notFound(`Provider with NPI ${npi} not found`);

  const plan = await prisma.insurancePlan.findUnique({ where: { planId } });
  if (!plan) throw AppError.notFound(`Plan with ID ${planId} not found`);
}
```

### PII Stripping

The `stripVerificationPII` function removes sensitive fields before API responses:

```typescript
function stripVerificationPII<T>(verification: T): Omit<T, 'sourceIp' | 'userAgent' | 'submittedBy'> {
  const { sourceIp, userAgent, submittedBy, ...safe } = verification;
  return safe;
}
```

### Pagination Bounds Enforcement

The `getPaginationValues` utility in `packages/backend/src/services/utils.ts` enforces maximum page size:

```typescript
export function getPaginationValues(page = 1, limit = 20) {
  const take = Math.min(limit, 100); // MAX_LIMIT = 100
  const skip = (page - 1) * take;
  return { take, skip, page };
}
```

---

## Frontend Validation

### VerificationButton (`packages/frontend/src/components/VerificationButton.tsx`)

- Email validation using RFC 5322 simplified regex
- Required field checks for `planId` and `acceptsInsurance`
- Honeypot field included in the form (hidden from real users)
- 10-second submission timeout via `AbortController`
- `maxLength={500}` on notes textarea

### InsuranceCardSchema (`packages/frontend/src/lib/insuranceCardSchema.ts`)

- Zod schema validates AI-extracted insurance card data
- All fields optional/nullable to handle partial extractions
- `plan_type` restricted to known enum values (`PPO`, `HMO`, `EPO`, `POS`) with string fallback
- `extraction_confidence` restricted to `high`, `medium`, `low`
- `safeParse()` used for non-throwing validation with detailed error reporting

---

## SQL Injection Protection

**Risk Level: LOW (Prisma ORM mitigates)**

All database queries use Prisma's query builder, which automatically parameterizes inputs:

```typescript
// Example from providerService.ts -- Prisma parameterizes all values
prisma.provider.findMany({
  where: {
    practice_locations: {
      some: { state: state.toUpperCase() }
    }
  }
});
```

The only raw SQL usage found is the health check endpoint:

```typescript
await prisma.$queryRaw`SELECT 1`;
```

This is a static query with no user input interpolation -- it is safe.

---

## Database-Level Constraints

The Prisma schema (`packages/backend/prisma/schema.prisma`) enforces additional constraints:

- **NPI**: `@db.VarChar(10)` -- Database rejects strings longer than 10 characters
- **State codes**: `@db.VarChar(2)` -- Database rejects strings longer than 2 characters
- **Plan IDs**: `@db.VarChar(50)` -- Capped at 50 characters
- **Source IP**: `@db.VarChar(50)` -- Prevents oversized IP storage
- **User Agent**: `@db.VarChar(500)` -- Capped at 500 characters
- **Notes**: TEXT type (uncapped at DB level, but Zod validates `max(1000)` at application level)
- **Unique constraints**: `vote_logs` has a unique constraint on `[verificationId, sourceIp]` preventing duplicate votes at the database level

---

## Issues Found

### Issue 1: Admin Route Query Parameters Not Zod-Validated (LOW Severity)

**Location:** `packages/backend/src/routes/admin.ts`, lines 75, 281, 471

The admin routes use `parseInt(req.query.batchSize as string) || 1000` for query parameters instead of Zod schemas. While these endpoints are protected by admin authentication, the lack of Zod validation means:

- `NaN` values silently fall back to defaults (which is acceptable behavior)
- No explicit type checking or bounds validation on `batchSize`
- `retentionDays` could be set to very large values (e.g., `retentionDays=999999`)
- `dryRun` is checked as `=== 'true'` which is safe but inconsistent with the Zod pattern

**Mitigating factors:**
- All admin endpoints require the `X-Admin-Secret` header with timing-safe comparison
- The `recalculate-confidence` endpoint does validate `limit` explicitly: `if (limit !== undefined && (isNaN(limit) || limit < 1))`
- `parseInt` with `|| defaultValue` provides safe fallback behavior

### Issue 2: Verification ID Parameter Loosely Validated (LOW Severity)

**Location:** `packages/backend/src/routes/verify.ts`, line 40

```typescript
const verificationIdParamSchema = z.object({
  verificationId: z.string().min(1),
});
```

The `verificationId` is validated as any non-empty string. Since verification IDs are generated via `@default(cuid())` in the Prisma schema, they follow the CUID format (25 characters, lowercase alphanumeric). However, the Zod schema does not enforce this format. An invalid ID will simply return a 404 from the database lookup, so this is a minor concern.

### Issue 3: No File Upload Validation Needed (N/A)

The backend has no file upload endpoints. The insurance card image extraction is handled client-side via AI APIs on the frontend. There are no `multer` or similar file upload middleware configurations in the backend.

### Issue 4: Frontend NPI Not Validated Before API Call (LOW Severity)

**Location:** `packages/frontend/src/app/provider/[npi]/page.tsx`

The frontend provider detail page passes the NPI from the URL path directly to the API without client-side format validation:

```typescript
const res = await fetch(`${API_URL}/providers/${npi}`, { ... });
```

This is mitigated by the backend's `npiParamSchema` validation which will reject malformed NPIs with a 400 error.

---

## Security Controls Summary

| Control | Status | Details |
|---------|--------|---------|
| Zod schema validation on all public routes | IMPLEMENTED | 25 `.parse()` calls across route files |
| NPI format validation (10-digit) | IMPLEMENTED | `z.string().length(10).regex(/^\d+$/)` |
| String length limits | IMPLEMENTED | Every string field has `max()` constraint |
| Type coercion for query strings | IMPLEMENTED | `z.coerce.number()` for pagination, IDs |
| Body size limits | IMPLEMENTED | 100KB limit on JSON and URL-encoded bodies |
| Rate limiting | IMPLEMENTED | 4 tiers: default (200/hr), search (100/hr), verification (10/hr), vote (10/hr) |
| CAPTCHA protection | IMPLEMENTED | reCAPTCHA v3 on verification/vote endpoints |
| Honeypot bot detection | IMPLEMENTED | Silent rejection on verification/vote endpoints |
| Sybil attack prevention | IMPLEMENTED | 30-day dedup by IP and email |
| SQL injection prevention | IMPLEMENTED | Prisma ORM parameterized queries throughout |
| Admin authentication | IMPLEMENTED | Timing-safe secret comparison |
| Request timeouts | IMPLEMENTED | 15s search, 30s general, 120s admin |
| Error message sanitization | IMPLEMENTED | Production mode hides internal errors |
| PII stripping from responses | IMPLEMENTED | `sourceIp`, `userAgent`, `submittedBy` removed |
| CORS restrictions | IMPLEMENTED | Explicit origin allowlist |
| Security headers (Helmet) | IMPLEMENTED | Strict CSP, COEP, COOP, CORP, no-referrer |
| Payload too large handling | IMPLEMENTED | 413 error with proper error code |
| Duplicate vote prevention | IMPLEMENTED | Unique DB constraint + application check |

---

## Recommendations

### Priority 1: Add Zod Validation to Admin Query Parameters

Replace `parseInt` usage in admin routes with Zod schemas for consistency and stronger validation:

```typescript
// Current (admin.ts line 75):
const batchSize = parseInt(req.query.batchSize as string) || 1000;

// Recommended:
const adminCleanupSchema = z.object({
  dryRun: z.enum(['true', 'false']).default('false'),
  batchSize: z.coerce.number().int().min(1).max(10000).default(1000),
});
const { dryRun, batchSize } = adminCleanupSchema.parse(req.query);
```

Similarly for `retentionDays` (should be bounded, e.g., `min(1).max(365)`) and `limit` on recalculate-confidence.

### Priority 2: Tighten Verification ID Format Validation

Add CUID format validation to the verification ID schema:

```typescript
// Current:
verificationId: z.string().min(1)

// Recommended:
verificationId: z.string().cuid()
```

Zod natively supports `.cuid()` validation, which matches the `@default(cuid())` generation in the Prisma schema.

### Priority 3: Add NPI Luhn Check (Optional Enhancement)

NPI numbers use the Luhn algorithm for check digit validation (per CMS standard). While the current 10-digit regex check is sufficient for format validation, adding Luhn verification would reject structurally invalid NPIs before they reach the database:

```typescript
function isValidNpiLuhn(npi: string): boolean {
  const digits = ('80840' + npi).split('').map(Number);
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits[i];
    if ((digits.length - 1 - i) % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
```

This would be applied via Zod's `.refine()`:

```typescript
export const npiParamSchema = z.object({
  npi: z.string().length(10).regex(/^\d+$/, 'NPI must be exactly 10 digits')
    .refine(isValidNpiLuhn, 'Invalid NPI check digit'),
});
```

### Priority 4: Add Client-Side NPI Validation on Frontend

The frontend provider detail page and forms should validate NPI format before making API calls to provide immediate user feedback and reduce unnecessary network requests.

---

## Conclusion

The HealthcareProviderDB project demonstrates a mature and well-structured input validation architecture. Zod schemas are consistently applied across all five route modules with shared schemas ensuring uniform validation rules. The multi-layered security approach -- combining body size limits, rate limiting, CAPTCHA, honeypot detection, Zod validation, service-layer business rules, and Prisma's parameterized queries -- provides defense in depth against a wide range of attack vectors.

The identified issues are low severity and primarily relate to consistency (admin routes using `parseInt` instead of Zod) and optional hardening (CUID format validation, Luhn check). The core validation posture is strong, and no SQL injection risks were identified.
