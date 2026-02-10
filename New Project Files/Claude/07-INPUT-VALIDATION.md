# Input Validation - VerifyMyProvider

## Overview

All API inputs are validated using **Zod** schemas before reaching any business logic or database queries. Validation is applied at the route handler level, rejecting malformed requests with structured error responses. Prisma provides an additional layer of SQL injection prevention through parameterized queries.

---

## Validation Architecture

```
HTTP Request
  |
  v
Express Route Handler
  |
  v
Zod Schema Validation  <-- Rejects invalid input with 400 + field-level errors
  |
  v
Business Logic (Service Layer)
  |
  v
Prisma ORM  <-- Parameterized queries prevent SQL injection
  |
  v
PostgreSQL Database
```

Every layer validates at its own level:
1. **Zod**: Format, type, length, and business rule validation
2. **Prisma**: Type safety via generated client, parameterized SQL
3. **PostgreSQL**: Column types, constraints, and foreign keys as final safety net

---

## Error Response Format

When validation fails, the API returns a structured error with field-level details:

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      {
        "path": "npi",
        "message": "NPI must be exactly 10 digits"
      },
      {
        "path": "notes",
        "message": "Notes must be 1000 characters or fewer"
      }
    ]
  }
}
```

The `details` array contains one entry per validation failure, allowing the frontend to display field-level error messages. The `path` corresponds to the input field name, and `message` provides a human-readable description of the constraint.

---

## Validated Endpoints

### Provider Search Parameters

**Endpoint**: `GET /api/v1/providers/search`

| Parameter | Type | Validation | Default |
|---|---|---|---|
| `name` | string | Optional, trimmed, max 200 chars | -- |
| `firstName` | string | Optional, trimmed, max 100 chars | -- |
| `lastName` | string | Optional, trimmed, max 100 chars | -- |
| `specialty` | string | Optional, trimmed, max 255 chars | -- |
| `specialtyCategory` | string | Optional, trimmed, max 100 chars | -- |
| `taxonomyCode` | string | Optional, matches `/^\d{3}[A-Z]\d{7}X$/` pattern or similar | -- |
| `city` | string | Optional, trimmed, max 100 chars | -- |
| `state` | string | Optional, exactly 2 uppercase letters | -- |
| `zipCode` | string | Optional, 5-digit string | -- |
| `gender` | string | Optional, enum: "M", "F" | -- |
| `credential` | string | Optional, trimmed, max 50 chars | -- |
| `npi` | string | Optional, exactly 10 digits | -- |
| `page` | number | Optional, integer >= 1, coerced from string | 1 |
| `limit` | number | Optional, integer 1-100, coerced from string | 20 |
| `sortBy` | string | Optional, enum of allowed sort fields | -- |
| `sortOrder` | string | Optional, "asc" or "desc" | "asc" |

**Type coercion**: Query string values arrive as strings. Zod coerces `page` and `limit` to numbers using `z.coerce.number()`, which prevents type mismatch errors while still validating the numeric constraints.

### Plan Search Parameters

**Endpoint**: `GET /api/v1/plans/search`

| Parameter | Type | Validation | Default |
|---|---|---|---|
| `query` | string | Optional, trimmed, max 500 chars | -- |
| `issuer` | string | Optional, trimmed, max 255 chars | -- |
| `state` | string | Optional, exactly 2 uppercase letters | -- |
| `planType` | string | Optional, enum of valid plan types | -- |
| `metalLevel` | string | Optional, enum of valid metal levels | -- |
| `year` | number | Optional, integer, coerced from string | -- |
| `page` | number | Optional, integer >= 1, coerced from string | 1 |
| `limit` | number | Optional, integer 1-100, coerced from string | 20 |

### Verification Submission

**Endpoint**: `POST /api/v1/verify`

| Field | Type | Validation | Required |
|---|---|---|---|
| `npi` | string | Exactly 10 digits (`/^\d{10}$/`) | Yes |
| `planId` | string | Non-empty, trimmed, max 50 chars | Yes |
| `acceptsInsurance` | boolean | Must be boolean true or false | Yes |
| `notes` | string | Optional, trimmed, max 1000 characters | No |
| `evidenceUrl` | string | Optional, valid URL format (z.string().url()) | No |
| `submittedBy` | string | Optional, valid email format (z.string().email()) | No |
| `captchaToken` | string | Non-empty string | Yes |

### Vote Submission

**Endpoint**: `POST /api/v1/verify/:id/vote`

| Field | Type | Validation | Required |
|---|---|---|---|
| `vote` | string | Enum: "up" or "down" | Yes |
| `captchaToken` | string | Non-empty string | Yes |

**URL parameter**: `:id` is validated as a non-empty string (cuid format).

### NPI Path Parameter

Used across multiple endpoints (`/:npi`, `/:npi/colocated`, etc.):

| Parameter | Type | Validation |
|---|---|---|
| `npi` | string | Exactly 10 digits (`/^\d{10}$/`) |

This is the most common validation -- the NPI must be exactly 10 numeric characters, matching the CMS NPI format standard.

---

## NPI Validation Details

The NPI (National Provider Identifier) format is validated in multiple places:

```typescript
const npiSchema = z.string().regex(/^\d{10}$/, {
  message: "NPI must be exactly 10 digits"
});
```

| Check | Implementation |
|---|---|
| Length | Exactly 10 characters |
| Character set | Digits only (0-9) |
| Format | Regex `/^\d{10}$/` |
| Luhn check | Not currently implemented (CMS NPIs use a modified Luhn algorithm, but format check is sufficient for lookup purposes) |

---

## String Length Limits

All string inputs have explicit maximum lengths to prevent large payload attacks:

| Field | Max Length | Rationale |
|---|---|---|
| `name` / `firstName` / `lastName` | 100-200 chars | No real name exceeds this |
| `specialty` / `specialtyCategory` | 255 chars | Matches DB column size |
| `notes` (verification) | 1000 chars | Reasonable comment length |
| `evidenceUrl` | 500 chars | Matches DB column size |
| `submittedBy` (email) | 255 chars | RFC 5321 max email length |
| `city` | 100 chars | Matches DB column size |
| `state` | 2 chars | US state abbreviation |
| `zipCode` | 5-10 chars | 5-digit or ZIP+4 format |
| `planId` | 50 chars | HIOS ID format |
| `query` (plan search) | 500 chars | Reasonable search query |

These limits serve dual purposes:
1. **Security**: Prevent oversized payloads from consuming memory or causing buffer issues
2. **Data integrity**: Ensure inputs fit within database column sizes

---

## Type Coercion for Query Strings

HTTP query string values are always strings. Zod handles coercion for numeric parameters:

```typescript
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

This means:
- `?page=2` is coerced from string "2" to number 2
- `?page=abc` fails validation with a clear error message
- `?page=-1` fails validation (min 1)
- `?page=1.5` fails validation (must be integer)
- `?limit=999` fails validation (max 100)

---

## SQL Injection Prevention

VerifyMyProvider is protected from SQL injection at multiple levels:

### Prisma ORM (Primary Defense)

Prisma generates parameterized queries for all database operations:

```typescript
// This Prisma query:
const provider = await prisma.provider.findUnique({
  where: { npi: userInput }
});

// Generates parameterized SQL:
// SELECT * FROM providers WHERE npi = $1
// Parameters: [userInput]
```

The user input is never interpolated into the SQL string. Even if a user submits `'; DROP TABLE providers; --` as an NPI value, it is treated as a literal string parameter, not SQL code.

### Zod Validation (Additional Layer)

Zod validation rejects inputs that don't match expected patterns before they even reach Prisma. For example, an NPI that contains SQL injection characters (`'; DROP TABLE`) would fail the `/^\d{10}$/` regex check long before reaching the database layer.

### No Raw SQL

The application does not use `prisma.$queryRaw` or `prisma.$executeRaw` with user-supplied input. All queries go through Prisma's type-safe query builder.

---

## Request Body Size Limit

Express is configured with a 100kb body size limit:

```typescript
app.use(express.json({ limit: '100kb' }));
```

This prevents:
- Memory exhaustion from oversized payloads
- Denial-of-service via large request bodies
- Excessive processing time on parsing

Requests exceeding 100kb receive a `413 Payload Too Large` response.

---

## Validation Examples

### Valid Verification Submission

```json
{
  "npi": "1234567890",
  "planId": "12345NY0010001",
  "acceptsInsurance": true,
  "notes": "Called the office and confirmed they accept this plan as of January 2026",
  "captchaToken": "03AGdBq24..."
}
```

### Invalid Verification (Multiple Errors)

```json
{
  "npi": "123",
  "planId": "",
  "acceptsInsurance": "yes",
  "notes": "..."
}
```

Response:
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      { "path": "npi", "message": "NPI must be exactly 10 digits" },
      { "path": "planId", "message": "Plan ID is required" },
      { "path": "acceptsInsurance", "message": "Expected boolean, received string" },
      { "path": "captchaToken", "message": "CAPTCHA token is required" }
    ]
  }
}
```

### Invalid Search (Coercion Failure)

```
GET /api/v1/providers/search?page=abc&limit=999
```

Response:
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      { "path": "page", "message": "Expected number, received nan" },
      { "path": "limit", "message": "Number must be less than or equal to 100" }
    ]
  }
}
```

---

## Validation Placement

Validation occurs at the **route handler level**, immediately after Express parses the request and before any service/business logic executes:

```typescript
// Example route with validation
router.post('/', async (req, res, next) => {
  try {
    // 1. Validate input
    const validated = verificationSchema.parse(req.body);

    // 2. Business logic (only runs if validation passes)
    const result = await verificationService.create(validated, req.ip, req.headers['user-agent']);

    // 3. Return response
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
      });
    }
    next(error);
  }
});
```

This pattern ensures that invalid inputs are rejected early, minimizing unnecessary processing and database queries.
