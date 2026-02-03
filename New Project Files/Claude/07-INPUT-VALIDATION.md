# VerifyMyProvider Input Validation Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

Input validation is comprehensively implemented using **Zod schemas** on all API endpoints. The validation layer prevents injection attacks, enforces data integrity, and provides clear error messages.

---

## Validation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Request Flow                              │
│                                                              │
│  Request → Rate Limit → CAPTCHA → Zod Validation → Handler  │
│                                            │                 │
│                                            ▼                 │
│                                   ┌─────────────────┐       │
│                                   │ Validated Data  │       │
│                                   │ (type-safe)     │       │
│                                   └─────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## Zod Schemas

### NPI Validation

```typescript
// packages/backend/src/schemas/provider.schema.ts

export const npiSchema = z.string()
  .length(10, 'NPI must be exactly 10 digits')
  .regex(/^\d{10}$/, 'NPI must contain only digits');

export const npiParamSchema = z.object({
  npi: npiSchema
});
```

**Validates:**
- Exactly 10 characters
- Digits only
- No special characters

### Search Query Validation

```typescript
// packages/backend/src/schemas/search.schema.ts

export const searchQuerySchema = z.object({
  state: z.string()
    .length(2, 'State must be 2-letter code')
    .toUpperCase()
    .optional(),

  city: z.string()
    .min(1, 'City cannot be empty')
    .max(100, 'City name too long')
    .optional(),

  specialty: z.string()
    .min(1)
    .max(200, 'Specialty name too long')
    .optional(),

  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100)
    .optional(),

  zipCode: z.string()
    .regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format')
    .optional(),

  page: z.coerce.number()
    .int('Page must be integer')
    .min(1, 'Page must be at least 1')
    .default(1),

  limit: z.coerce.number()
    .int()
    .min(1)
    .max(100, 'Maximum 100 results per page')
    .default(20)
});
```

**Validates:**
- State: 2-letter uppercase code
- City: 1-100 characters
- Specialty: 1-200 characters
- ZIP: 5 digits or 5+4 format
- Pagination: Bounded integers

### Verification Submission

```typescript
// packages/backend/src/schemas/verification.schema.ts

export const submitVerificationSchema = z.object({
  npi: npiSchema,

  planId: z.string()
    .min(1, 'Plan ID required')
    .max(100, 'Plan ID too long'),

  acceptsInsurance: z.boolean(),

  notes: z.string()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional(),

  captchaToken: z.string()
    .min(1, 'CAPTCHA token required')
    .optional()  // Required in production, optional in dev
});
```

**Validates:**
- NPI: 10 digits
- Plan ID: 1-100 characters
- Accept/Reject: Boolean
- Notes: Max 1000 characters

### Vote Submission

```typescript
// packages/backend/src/schemas/vote.schema.ts

export const voteParamSchema = z.object({
  verificationId: z.string()
    .cuid('Invalid verification ID format')
});

export const voteBodySchema = z.object({
  vote: z.enum(['up', 'down'], {
    errorMap: () => ({ message: "Vote must be 'up' or 'down'" })
  }),

  captchaToken: z.string().optional()
});
```

**Validates:**
- Verification ID: Valid CUID format
- Vote: Exactly 'up' or 'down'

---

## Usage in Routes

```typescript
// packages/backend/src/routes/providers.ts

router.get('/search', searchRateLimiter, asyncHandler(async (req, res) => {
  // Zod validates and transforms query params
  const query = searchQuerySchema.parse(req.query);

  // query is now type-safe with defaults applied
  const result = await searchProviders(query);

  res.json({ success: true, data: result });
}));

router.get('/:npi', defaultRateLimiter, asyncHandler(async (req, res) => {
  const { npi } = npiParamSchema.parse(req.params);

  const provider = await getProviderByNpi(npi);

  if (!provider) {
    throw AppError.notFound('Provider not found');
  }

  res.json({ success: true, data: provider });
}));
```

---

## Error Handling

### Zod Error Response

```typescript
// packages/backend/src/middleware/errorHandler.ts

if (error instanceof z.ZodError) {
  return res.status(400).json({
    success: false,
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    }
  });
}
```

### Example Error Response

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "npi",
        "message": "NPI must be exactly 10 digits"
      },
      {
        "field": "limit",
        "message": "Maximum 100 results per page"
      }
    ]
  }
}
```

---

## SQL Injection Prevention

### Prisma ORM Protection

```typescript
// All queries use parameterized Prisma methods
const provider = await prisma.provider.findUnique({
  where: { npi: validatedNpi }  // Parameterized, safe
});

// Search with validated input
const providers = await prisma.provider.findMany({
  where: {
    state: query.state,        // Parameterized
    city: query.city,          // Parameterized
    specialty: {
      contains: query.specialty,
      mode: 'insensitive'
    }
  }
});
```

**Protections:**
- Prisma uses parameterized queries
- No raw SQL with user input
- Type-safe query building

---

## XSS Prevention

### Output Encoding

```typescript
// Frontend uses React which auto-escapes
// Backend returns JSON (no HTML)

// API response (safe)
res.json({
  success: true,
  data: {
    name: provider.firstName,  // React will escape when rendered
    notes: verification.notes  // React will escape
  }
});
```

### Notes Field Sanitization

```typescript
// Optional: Additional sanitization for notes
import { sanitize } from 'isomorphic-dompurify';

const sanitizedNotes = notes ? sanitize(notes, {
  ALLOWED_TAGS: [],  // Strip all HTML
  ALLOWED_ATTR: []
}) : undefined;
```

---

## Validation Summary by Endpoint

| Endpoint | Schema | Key Validations |
|----------|--------|-----------------|
| GET /providers/search | searchQuerySchema | State, city, pagination |
| GET /providers/:npi | npiParamSchema | NPI format |
| GET /providers/:npi/plans | npiParamSchema | NPI format |
| POST /verify | submitVerificationSchema | NPI, planId, boolean |
| POST /verify/:id/vote | voteSchema | CUID, up/down enum |
| GET /plans/search | planSearchSchema | Plan name, carrier |

---

## Security Checklist

### Input Validation
- [x] Zod schemas on all endpoints
- [x] NPI format validation (10 digits)
- [x] Pagination limits enforced (max 100)
- [x] String length limits
- [x] Enum validation for fixed values
- [x] Type coercion for numbers

### Injection Prevention
- [x] Prisma ORM (parameterized queries)
- [x] No raw SQL with user input
- [x] JSON output (no HTML injection)
- [x] React auto-escaping (frontend)

### Error Handling
- [x] Consistent error format
- [x] Field-level error details
- [x] No stack traces in production

---

## Recommendations

### Immediate
- ✅ Current validation is comprehensive

### Enhancements
1. **Add sanitization for notes field**
   ```typescript
   notes: z.string()
     .max(1000)
     .transform(s => sanitize(s, { ALLOWED_TAGS: [] }))
     .optional()
   ```

2. **Add request size limits**
   ```typescript
   app.use(express.json({ limit: '10kb' }));
   ```

3. **Add URL encoding validation**
   ```typescript
   // Validate decoded URL params
   const decodedCity = decodeURIComponent(req.query.city);
   ```

---

## Conclusion

Input validation is **production-ready**:

- ✅ Zod schemas on all endpoints
- ✅ SQL injection prevented (Prisma)
- ✅ XSS prevented (JSON + React)
- ✅ Clear error messages
- ✅ Type-safe validated data

No immediate security concerns identified.
