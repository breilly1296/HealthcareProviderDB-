# Insurance Card Upload Feature Review

**Generated:** 2026-02-18
**Prompt:** 29-insurance-card-upload.md
**Status:** Fully Implemented -- Extraction, storage, encryption, dashboard all in place

---

## Summary

The insurance card upload feature is comprehensively implemented across both backend and frontend. It uses Anthropic Claude (Haiku 4.5) for OCR extraction, Sharp for image preprocessing, AES-256-GCM encryption for PII fields at rest, and supports a full CRUD lifecycle with plan matching. The feature is protected by authentication (requireAuth), CSRF protection, and per-user rate limiting. Key rotation is supported via a dual-key decryption strategy with an admin endpoint for re-encryption.

---

## Verified Checklist

### Backend Extraction (`packages/backend/src/services/insuranceCardExtractor.ts`)
- [x] Anthropic SDK integrated (lazy-initialized client)
- [x] Model: `claude-haiku-4-5-20251001` (fast, cost-effective)
- [x] Image size validation: 10MB max (MAX_IMAGE_SIZE_BYTES)
- [x] Base64 format validation with regex check
- [x] Magic byte detection for JPEG, PNG, WebP, GIF
- [x] Image preprocessing with Sharp: resize, contrast enhancement, rotation
- [x] Conditional enhancement: `shouldEnhanceImage()` checks quality first
- [x] Primary extraction prompt with retry logic
- [x] Retry with alternative prompt when confidence < 0.3 (RETRY_CONFIDENCE_THRESHOLD)
- [x] Minimum 2 fields required for success (MIN_FIELDS_FOR_SUCCESS)
- [x] Structured error responses with userMessage and suggestions array
- [x] Processing time tracking and logging
- [x] No sensitive data logged (extraction results not logged, only metadata)

### Backend Storage (`packages/backend/src/services/insuranceCardService.ts`)
- [x] `saveInsuranceCard()` -- encrypts PII, matches plan, upserts by userId
- [x] `getInsuranceCard()` -- decrypts PII for response, audit logging
- [x] `updateInsuranceCard()` -- partial updates with re-encryption of changed PII fields
- [x] `deleteInsuranceCard()` -- removes card with audit logging
- [x] Plan matching with 3-tier strategy: issuer+name, issuer+type, issuer-only (broadest)
- [x] `formatCardResponse()` -- maps encrypted DB fields to decrypted API response
- [x] Audit logging on all operations (scanned, viewed, updated, deleted) with field names only (never values)
- [x] Matched plan FK to InsurancePlan for provider search integration

### Backend Routes (`packages/backend/src/routes/insuranceCard.ts`)
- [x] `POST /api/v1/me/insurance-card/scan` -- AI extraction + save (10/hr per user)
- [x] `POST /api/v1/me/insurance-card/save` -- save pre-extracted data (default rate limit)
- [x] `GET /api/v1/me/insurance-card` -- retrieve saved card with decrypted PII
- [x] `PATCH /api/v1/me/insurance-card` -- partial field updates
- [x] `DELETE /api/v1/me/insurance-card` -- remove saved card
- [x] All routes require `requireAuth` middleware
- [x] CSRF protection applied at router level in `routes/index.ts` (line 22)
- [x] Scan route has dedicated rate limiter (10/hr, keyed by user ID or IP)
- [x] Body size limit: 16MB on scan route (`express.json({ limit: '16mb' })`)
- [x] Zod validation on all request bodies with trimmed nullable optional strings

### Encryption (`packages/backend/src/lib/encryption.ts`)
- [x] AES-256-GCM encryption with 12-byte IV and 16-byte auth tag
- [x] Random IV per encryption (cryptographically secure via `randomBytes`)
- [x] Ciphertext format: `iv:authTag:data` (hex-encoded)
- [x] Key from base64-encoded `INSURANCE_ENCRYPTION_KEY` env var (32 bytes required)
- [x] Key rotation support: `INSURANCE_ENCRYPTION_KEY_PREVIOUS` for fallback decryption
- [x] `encrypt()` / `decrypt()` with null-safe handling
- [x] `encryptCardPii()` / `decryptCardPii()` -- batch encrypt/decrypt 5 PII fields
- [x] Error masking: crypto errors never expose internals ("Decryption failed" only)
- [x] `hasPreviousKey()` helper for admin rotation endpoint

### PII Fields Encrypted at Rest
| Plaintext Field | Encrypted Column | Verified |
|----------------|-----------------|----------|
| subscriber_id | subscriber_id_enc | Yes |
| group_number | group_number_enc | Yes |
| rxbin | rxbin_enc | Yes |
| rxpcn | rxpcn_enc | Yes |
| rxgrp | rxgrp_enc | Yes |

### Database Model (`UserInsuranceCard` in schema.prisma, lines 399-432)
- [x] `@id @default(cuid())` -- application-generated ID
- [x] `@unique` on userId -- one card per user enforced at DB level
- [x] 5 encrypted PII columns (VARCHAR(500) to accommodate ciphertext)
- [x] Plaintext fields: insurance_company, plan_name, plan_type, provider_network, network_notes, subscriber_name, effective_date, copay fields, deductible fields, OOP max fields
- [x] `matched_plan_id` FK to InsurancePlan with index
- [x] `confidence_score` (Int, nullable)
- [x] `card_side` (front/back)
- [x] `scanned_at` with `@default(now())`
- [x] `updated_at` with `@updatedAt`
- [x] Cascade delete: `onDelete: Cascade` from User

### Admin Endpoint for Key Rotation (`packages/backend/src/routes/admin.ts`, lines 561-679)
- [x] `POST /api/v1/admin/rotate-encryption-key` -- re-encrypts all cards with current primary key
- [x] Dry run mode support
- [x] Batch processing with cursor-based pagination
- [x] Decrypt with primary key first, fallback to previous key
- [x] Re-encrypt with primary key
- [x] Error handling per-card (continues on failure, reports error count)
- [x] Protected by `adminAuthMiddleware` with timing-safe secret comparison

### Frontend Components
- [x] `InsuranceCardUploader.tsx` -- upload component
- [x] `InsuranceCardScanner.tsx` -- webcam-based scanner
- [x] `useInsuranceCard.ts` hook
- [x] Insurance page at `packages/frontend/src/app/insurance/page.tsx`
- [x] Dashboard at `packages/frontend/src/app/dashboard/insurance/page.tsx`
- [x] `InsuranceCardDashboard.tsx` -- view/edit/delete saved card

### Frontend Support Libraries
- [x] `packages/backend/src/lib/insuranceCardSchema.ts` -- Zod validation, extraction prompts, confidence scoring
- [x] `packages/backend/src/lib/imagePreprocess.ts` -- Sharp preprocessing (resize, enhance, rotate)

### Security
- [x] Images processed server-side only (backend extractor, not frontend API route)
- [x] No card images retained
- [x] Rate limiting: 10 scans/hr per user
- [x] File type validation via magic bytes
- [x] File size limit enforced (10MB for extraction, 16MB for JSON body)
- [x] Authentication required on all endpoints
- [x] CSRF protection on all mutating routes
- [x] PII encrypted at rest with AES-256-GCM
- [x] Decryption audit logging (logs which fields were decrypted, not values)
- [x] Key rotation support without downtime
- [ ] Privacy policy not confirmed as updated for feature

### Testing
- [x] Unit tests for `insuranceCardSchema` (`packages/frontend/src/lib/__tests__/insuranceCardSchema.test.ts`)
- [x] Unit tests for `imagePreprocess` (`packages/frontend/src/lib/__tests__/imagePreprocess.test.ts`)
- [ ] E2E tests for upload flow
- [ ] Various card format testing
- [ ] Mobile upload tested

---

## Architecture Assessment

### Strengths
1. **Defense in depth**: Authentication + CSRF + rate limiting + encryption + audit logging creates a strong security posture for handling PII.
2. **Key rotation without downtime**: The dual-key strategy allows rotating encryption keys without any user-facing disruption. The admin endpoint re-encrypts lazily.
3. **Graceful degradation**: The extraction retries with an alternative prompt on low confidence. Missing ANTHROPIC_API_KEY returns a clear error.
4. **Plan matching**: 3-tier matching (name, type, broadest) provides good coverage for connecting extracted data to database plans.
5. **Audit trail**: Every read/write/delete of insurance card data is logged with field names (never values).

### Gaps
1. **No CAPTCHA on scan endpoint**: The prompt notes this as optional. The rate limiter (10/hr) provides some protection, but a CAPTCHA would add bot resistance.
2. **Frontend extraction route still exists**: `packages/frontend/src/app/api/insurance-card/extract/route.ts` is referenced in the prompt but the backend now has its own extractor. Potential for confusion or duplicate code.
3. **No expiration on saved cards**: Cards persist indefinitely. Consider TTL or periodic re-scan prompts.

---

## Key Files

| File | Path | Purpose |
|------|------|---------|
| Backend Route | `packages/backend/src/routes/insuranceCard.ts` | CRUD + scan endpoints |
| Service | `packages/backend/src/services/insuranceCardService.ts` | Save, get, update, delete with encryption |
| Extractor | `packages/backend/src/services/insuranceCardExtractor.ts` | Claude AI extraction pipeline |
| Encryption | `packages/backend/src/lib/encryption.ts` | AES-256-GCM encrypt/decrypt |
| Schema | `packages/backend/src/lib/insuranceCardSchema.ts` | Zod validation, prompts |
| Image Preprocess | `packages/backend/src/lib/imagePreprocess.ts` | Sharp resize/enhance |
| Prisma Model | `packages/backend/prisma/schema.prisma` (lines 399-432) | UserInsuranceCard |
| Admin Rotation | `packages/backend/src/routes/admin.ts` (lines 561-679) | Key rotation endpoint |
| Frontend Upload | `packages/frontend/src/components/InsuranceCardUploader.tsx` | Upload UI |
| Frontend Scanner | `packages/frontend/src/components/InsuranceCardScanner.tsx` | Webcam scanner |
| Dashboard | `packages/frontend/src/app/dashboard/insurance/InsuranceCardDashboard.tsx` | Card management UI |
