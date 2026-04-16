# Input Validation

## Validation Status

Backend uses **Zod** schemas consistently across 7 route files (providers.ts, verify.ts, plans.ts, locations.ts, auth.ts, savedProviders.ts, insuranceCard.ts). Every user-facing `req.params` / `req.query` / `req.body` extraction flows through `.parse()` or `.safeParse()` — verified via grep across `packages/backend/src/routes` (33 validation calls across the 7 files).

Shared validators live in `packages/backend/src/schemas/commonSchemas.ts`:
- `paginationSchema` — page (int ≥1 default 1), limit (int 1-100 default 20) with `z.coerce.number()` for query-string type handling
- `npiParamSchema` — exact-10-digit NPI with regex `/^\d+$/` (line 23)
- `stateQuerySchema` — 2-letter state code, uppercased
- `planIdParamSchema` — plan ID (1-50 chars)

Zod errors are caught globally at `middleware/errorHandler.ts:102-118` and returned as structured `400 VALIDATION_ERROR` responses with `details: [{field, message}]`.

Prisma ORM handles parameterized queries for all non-raw DB access. Only one `$queryRaw` usage in `src/index.ts:137` (`SELECT 1` healthcheck — no user input). **SQL injection risk is minimal.**

Body size limits: global `express.json({ limit: '100kb' })` (index.ts:97), urlencoded 100kb (line 99), insurance-card scan uses route-level `16mb` limit (insuranceCard.ts:113). Payload-too-large returns 413 via errorHandler.ts:121-131.

---

## Issues Found

### HIGH — none.

### MEDIUM

**1. Admin route uses `parseInt` instead of Zod for multiple query params.**
File: `routes/admin.ts:76-77, 115, 317-318, 507-508, 566-567`.
Examples:
- `const batchSize = parseInt(req.query.batchSize as string) || 1000;` (admin.ts:77)
- `const retentionDays = parseInt(req.query.retentionDays as string) || 90;` (admin.ts:318)
- `const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;` (admin.ts:508)

Impact: no upper bound on `batchSize` or `retentionDays`. A malicious admin (authorized via `X-Admin-Secret`) could pass `batchSize=9999999` causing a very large DB transaction. Lower severity because admin secret is required, but still a validation gap. **Recommend:** add Zod schema similar to `paginationSchema` with `.max(N)`.

Note: admin.ts:510-512 DOES manually validate `limit`:
```typescript
if (limit !== undefined && (isNaN(limit) || limit < 1)) {
  throw AppError.badRequest('limit must be a positive integer');
}
```
But no upper bound. And other admin params skip even this check.

**2. `verify.ts` `notes` field allows 1000-char free text.**
File: `routes/verify.ts:28` — `notes: z.string().max(1000).optional()`.
No sanitization or content validation. Saved to `verification_logs.notes` (Text column, schema.prisma:256). Stored text is not rendered server-side (JSON API) and frontend is expected to sanitize on render. **Recommend:** ensure frontend escapes HTML on display. Consider adding `.trim()` and stripping ASCII control characters.

**3. `evidenceUrl` in verify.ts is validated as URL but not schema-restricted.**
File: `routes/verify.ts:28` — `z.string().url().max(500).optional()`. Accepts any URL including `javascript:` or `file://` (Zod's `.url()` rejects those in recent versions, but worth explicit allow-list of `http(s):`). **Recommend:** add `.startsWith('http')` or a URL-protocol whitelist.

### LOW

**4. `insuranceCard.ts` scan accepts base64 up to 15MB in body schema (line 38), but express parser set to 16MB (line 113).**
Mismatch: Zod says max 15MB, parser says 16MB. Consistent enough but worth aligning.

**5. `locationId` parsing uses `z.coerce.number().int().positive()` (locations.ts:28).** Good — but this accepts both `"42"` and `42`. Works correctly; no issue.

**6. `recentQuerySchema` in verify.ts:46-50** reuses `npiParamSchema.shape.npi.optional()` and `planIdParamSchema.shape.planId.optional()` — correct composition pattern.

**7. `verificationIdParamSchema` in verify.ts:40-42** validates only `z.string().min(1)` — this is a CUID-generated ID (schema.prisma:240). Consider `.regex(/^c[a-z0-9]{24}$/)` to validate CUID format and reject malformed IDs earlier. Low priority — invalid IDs will just miss in DB lookup.

**8. `stateQuerySchema` applies `.toUpperCase()` transform** (commonSchemas.ts:31). Good for normalization. Callers should be aware of the transform.

**9. Honeypot field `website` is `z.string().optional()`** (verify.ts:31, 37) — honeypotCheck middleware validates it separately (honeypot.ts). Architecturally fine.

**10. `insuranceCard.ts` field names use snake_case (`insurance_company`, `plan_name`, etc.)** while the rest of the backend uses camelCase. The schemas (insuranceCard.ts:47-70) accept snake_case from the frontend. This is an intentional schema decision but breaks the convention — worth aligning.

**11. `searchQuerySchema.cities`** in providers.ts:32 accepts comma-separated string (max 500). Split happens in handler (providers.ts:286). No upper bound on number of cities — a 500-char string of 1-char cities could be 250+ entries passed to an `IN (...)` clause. Bounded by query size but could be further restricted.

---

## Recommendations

1. **Add Zod schemas to `routes/admin.ts`** — all admin query params should flow through `z.coerce.number().int().min(1).max(N)` validators. Example schema:
   ```typescript
   const cleanupQuerySchema = z.object({
     dryRun: z.enum(['true', 'false']).optional(),
     batchSize: z.coerce.number().int().min(1).max(10000).default(1000),
     retentionDays: z.coerce.number().int().min(1).max(3650).default(90),
   });
   ```
2. **Restrict `evidenceUrl` to http(s)** — `.url().regex(/^https?:\/\//i)`.
3. **Trim / sanitize `notes`** — add `.transform(s => s.trim())` and strip ASCII control chars.
4. **Align insurance-card scan size limits** — make Zod max and express parser limit identical.
5. **Consider CUID regex** on `verificationId` param for faster rejection of malformed IDs.
6. **Add upper bound on `cities` count** after the comma-split in providers.ts:286 (e.g., limit to ≤20 cities).
7. **Align `insuranceCard.ts` snake_case → camelCase** (or keep snake_case as explicit frontend-contract and document).

---

## Questions to Ask — Answers

1. **NPI validated as 10-digit?** Yes — `commonSchemas.ts:23`: `z.string().length(10).regex(/^\d+$/, 'NPI must be exactly 10 digits')`.
2. **UUIDs validated before DB queries?** The app uses CUIDs (not UUIDs) for auth-related string PKs. VerificationId is validated as `z.string().min(1)` — permissive. `userId` is not user-supplied (taken from `req.user.id`). Risk is low.
3. **Strings sanitized?** Length-limited via Zod `.max()`. No HTML-escaping in backend (intentional — JSON API; sanitation at render-time on frontend). Control-char stripping not applied.
4. **File uploads validated?** Yes — `insuranceCard.ts:37-42`: `imageBase64` length bounded (≤15MB), MIME type whitelisted to `image/jpeg | image/png | image/webp | image/gif`.
5. **SQL injection risks?** Prisma parameterizes all queries. One raw-SQL call (`SELECT 1` healthcheck) uses no user input. **No exposure.**

---

## Checklist Marking Summary

| Area | Verified | Partial | Gaps |
|---|---|---|---|
| Zod on all public route inputs | Yes | — | admin.ts bypasses Zod |
| NPI 10-digit check | Yes (commonSchemas.ts:23) | — | — |
| String length limits | Yes — every `z.string()` has `.max(N)` | — | — |
| Type coercion for query strings | Yes — `z.coerce.number()` used (pagination, mapQuery, minConfidence, locationId) | — | — |
| Error responses structured | Yes — errorHandler.ts:102-118 | — | — |
| Payload size limits | Yes — 100kb default, 16mb for card scan | — | small mismatch 15mb vs 16mb |
| File upload validation | Yes — size + MIME whitelist | — | — |
| SQL injection protection | Yes — Prisma + no raw user input | — | — |
