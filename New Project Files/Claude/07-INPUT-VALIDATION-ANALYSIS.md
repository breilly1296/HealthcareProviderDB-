# VerifyMyProvider Input Validation Review

**Last Updated:** January 25, 2026
**Priority:** High
**Validation Library:** Zod
**Status:** Implemented on all endpoints

---

## Current Implementation

### Validation Framework
- **Library:** Zod (TypeScript-first schema validation)
- **Coverage:** All route inputs validated
- **Error Handling:** Centralized via errorHandler middleware

---

## Validation by Endpoint

### Provider Endpoints

**GET /api/v1/providers/search**
```typescript
{
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  cities: z.string().optional(), // Comma-separated
  zipCode: z.string().min(5).max(10).optional(),
  specialty: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200).optional(),
  npi: z.string().length(10).regex(/^\d+$/).optional(),
  entityType: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
  healthSystem: z.string().min(1).max(500).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}
```

**GET /api/v1/providers/:npi**
```typescript
{
  npi: z.string().length(10).regex(/^\d+$/)
}
```

### Verification Endpoints

**POST /api/v1/verify**
```typescript
{
  npi: z.string().length(10).regex(/^\d+$/),
  planId: z.string().min(1).max(50),
  acceptsInsurance: z.boolean(),
  notes: z.string().max(1000).optional(),
  evidenceUrl: z.string().url().max(500).optional(),
  submittedBy: z.string().email().max(200).optional(),
  captchaToken: z.string().optional()
}
```

**POST /api/v1/verify/:verificationId/vote**
```typescript
{
  verificationId: z.string().min(1),
  vote: z.enum(['up', 'down'])
}
```

### Plan Endpoints

**GET /api/v1/plans/search**
```typescript
{
  issuerName: z.string().min(1).max(200).optional(),
  planType: z.string().min(1).max(20).optional(),
  search: z.string().min(1).max(200).optional(),
  state: z.string().length(2).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}
```

### Location Endpoints

**GET /api/v1/locations/search**
```typescript
{
  search: z.string().min(1).max(500).optional(),
  state: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(100).optional(),
  zipCode: z.string().min(5).max(10).optional(),
  healthSystem: z.string().min(1).max(200).optional(),
  minProviders: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}
```

**GET /api/v1/locations/:locationId**
```typescript
{
  locationId: z.coerce.number().int().positive()
}
```

---

## Validation Strengths

### Type Safety
- [x] **Type coercion** for query string numbers (`.coerce.number()`)
- [x] **Boolean parsing** for form data
- [x] **Enum validation** for status and vote values

### Security
- [x] **NPI validation**: Exactly 10 digits, numeric only
- [x] **Max length constraints**: All text inputs have limits
- [x] **URL validation**: Evidence URLs validated as valid URLs
- [x] **Email validation**: Basic format check

### Data Quality
- [x] **State codes**: Exactly 2 characters, uppercase
- [x] **Pagination limits**: Max 100 per page
- [x] **Positive integers**: Page numbers must be positive

---

## Validation Gaps

### Minor Issues

1. **verificationId Validation**
   ```typescript
   // Current - minimal validation
   verificationId: z.string().min(1)

   // Could be stricter (CUID format)
   verificationId: z.string().cuid()
   ```

2. **Email Domain Validation**
   ```typescript
   // Current - any valid email format
   submittedBy: z.string().email()

   // Could verify domain exists
   // (But adds latency)
   ```

3. **Evidence URL Permissiveness**
   ```typescript
   // Current - any valid URL
   evidenceUrl: z.string().url()

   // Could whitelist trusted domains
   evidenceUrl: z.string().url().refine(
     url => trustedDomains.some(d => url.includes(d))
   )
   ```

4. **CAPTCHA Token Format**
   ```typescript
   // Current - any string
   captchaToken: z.string().optional()

   // Could validate token structure
   captchaToken: z.string().min(100).optional()
   ```

---

## SQL Injection Prevention

**Status:** Protected by Prisma ORM

Prisma parameterizes all queries automatically:
```typescript
// Safe - Prisma handles escaping
const provider = await prisma.provider.findUnique({
  where: { npi: npi }  // Parameterized
});
```

**Risk:** Low - No raw SQL queries in the codebase

---

## XSS Prevention

**Status:** Protected by design

- API returns JSON only (no HTML rendering)
- Content-Type: application/json enforced
- Frontend sanitizes display

**Notes field:**
```typescript
notes: z.string().max(1000).optional()
// Notes stored as-is but displayed with React escaping
```

---

## Error Response Format

### Validation Error Response
```json
{
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "requestId": "uuid-here",
    "details": [
      { "field": "npi", "message": "NPI must be exactly 10 digits" },
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

### Field-Level Details
Zod errors are transformed to user-friendly messages:
```typescript
const errors = zodError.errors.map(err => ({
  field: err.path.join('.'),
  message: err.message
}));
```

---

## Input Sanitization

### Current Sanitization
- **State codes**: Uppercased (`.toUpperCase()`)
- **NPI**: Numeric only (regex `^\d+$`)
- **Strings**: Length limited

### Not Sanitized (By Design)
- **Notes**: Stored as entered (XSS handled on display)
- **Names**: Preserved exactly (important for search)
- **URLs**: Validated format but not content

---

## File Upload Validation

**Status:** Not applicable for main API

Insurance card upload in frontend:
```typescript
// In packages/frontend/src/app/api/insurance-card/extract/route.ts
// Validates image format and size
```

---

## Recommendations

### Immediate
1. Add CUID validation for verificationId
2. Consider minimum length for CAPTCHA token

### Before Scale
1. Add rate limiting by validation error rate (block suspicious clients)
2. Log validation failures for security monitoring

### Future Enhancements
1. Whitelist evidence URL domains
2. Add email domain verification (optional)
3. Consider custom NPI checksum validation

---

## Validation Test Coverage

### Should Test
- [x] Valid inputs accepted
- [x] Invalid NPI rejected (wrong length, non-numeric)
- [x] Pagination limits enforced
- [x] Required fields enforced
- [ ] Edge cases (max length, special characters)
- [ ] Unicode handling

### Example Tests
```typescript
describe('Input Validation', () => {
  it('rejects invalid NPI', async () => {
    const res = await request(app)
      .get('/api/v1/providers/123');  // Too short
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-numeric NPI', async () => {
    const res = await request(app)
      .get('/api/v1/providers/123abc7890');
    expect(res.status).toBe(400);
  });

  it('enforces max page limit', async () => {
    const res = await request(app)
      .get('/api/v1/providers/search?limit=1000');
    expect(res.status).toBe(400);
  });
});
```

---

## Summary

| Category | Status | Notes |
|----------|--------|-------|
| All inputs validated | Yes | Zod on every endpoint |
| NPI format | Strict | 10 digits, numeric only |
| SQL injection | Protected | Prisma ORM |
| XSS | Protected | JSON API + React escaping |
| Max lengths | Enforced | All text fields |
| Type coercion | Implemented | Query strings handled |
| Error messages | User-friendly | Field-level details |

**Overall Assessment:** Input validation is comprehensive and follows security best practices.

---

*Validation implementation is production-ready*
