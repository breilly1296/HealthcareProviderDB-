# No HIPAA Compliance Review

**Generated:** 2026-02-18
**Prompt:** 02-no-hipaa-compliance.md
**Status:** VERIFIED -- VerifyMyProvider does NOT require HIPAA compliance. All stored data is public provider information, anonymous verifications, or user-provided insurance card data (encrypted). No Protected Health Information (PHI) is collected, stored, or transmitted.

---

## Files Reviewed

| File | Purpose | Result |
|------|---------|--------|
| `packages/backend/prisma/schema.prisma` | All 21 models reviewed for PHI | No PHI fields found |
| `packages/backend/src/routes/providers.ts` | Provider search/detail endpoints | Returns only public NPI data |
| `packages/backend/src/routes/verify.ts` | Verification submission endpoints | Anonymous submissions, no user identity |
| `packages/backend/src/routes/plans.ts` | Insurance plan search endpoints | Public marketplace data only |
| `packages/backend/src/routes/auth.ts` | Auth endpoints | Email + session management only |
| `packages/backend/src/routes/savedProviders.ts` | Saved provider bookmarks | User-provider link, no health data |
| `packages/backend/src/routes/insuranceCard.ts` | Insurance card CRUD + scan | Encrypted insurance identifiers, no health data |
| `packages/backend/src/middleware/requestLogger.ts` | Request logging | PII explicitly excluded from logs |
| `packages/backend/src/services/authService.ts` | Auth business logic | GDPR export decrypts card PII with audit log |

---

## 1. What VerifyMyProvider Stores (ALL PUBLIC DATA)

- [x] **Provider names -- from public NPI Registry** -- VERIFIED. `Provider` model stores `firstName`, `lastName`, `middleName`, `namePrefix`, `nameSuffix`, `credential`, `organizationName`. All sourced from public NPPES data files (dataSource default 'nppes').

- [x] **Provider addresses -- from public NPI Registry** -- VERIFIED. `PracticeLocation` model stores `addressLine1`, `addressLine2`, `city`, `state`, `zipCode`, `phone`, `fax`. Sourced from public NPPES data with optional enrichment (enrichmentSource field tracks this).

- [x] **Provider specialties -- from public taxonomy codes** -- VERIFIED. `Provider.primaryTaxonomyCode`, `Provider.primarySpecialty`, `Provider.specialtyCategory`. `ProviderTaxonomy` table stores all taxonomy codes. `TaxonomyReference` is a public lookup table.

- [x] **Insurance plan names -- from public marketplace data** -- VERIFIED. `InsurancePlan` model stores `planName`, `issuerName`, `planType`, `state`, `carrier`, `planVariant`. All public data.

- [x] **Acceptance verifications -- anonymous "yes/no" answers** -- VERIFIED. `VerificationLog` model stores verification submissions. The `submittedBy` field is an optional email (not linked to User table). The `sourceIp` is stored for rate limiting and Sybil prevention. There is no `userId` foreign key -- verifications are deliberately anonymous.

- [x] **Verification dates -- when verification occurred** -- VERIFIED. `VerificationLog.createdAt` timestamp.

- [x] **IP addresses -- for rate limiting only** -- VERIFIED. `VerificationLog.sourceIp` (VarChar(50)), `VoteLog.sourceIp` (VarChar(50)), `Session.ipAddress` (VarChar(50)). The `requestLogger` middleware (`middleware/requestLogger.ts`) explicitly excludes IP addresses from log entries -- the `RequestLogEntry` interface only includes `requestId`, `timestamp`, `method`, `path`, `statusCode`, `responseTimeMs`, and `rateLimited`.

## 2. What VerifyMyProvider Does NOT Store (NO PHI)

- [x] **Patient names -- NEVER collected** -- VERIFIED. The `User` model stores only `email` and `emailVerified`. No patient name fields exist anywhere in the schema. The `subscriberName` field on `UserInsuranceCard` is the insurance subscriber name (the cardholder), not a patient name in a clinical context.

- [x] **Patient addresses -- NEVER collected** -- VERIFIED. No user address fields exist in any model. Only provider practice addresses are stored.

- [x] **User health conditions -- NEVER collected** -- VERIFIED. No fields for diagnoses, conditions, symptoms, or health status exist anywhere in the schema or route handlers.

- [x] **Visit reasons -- NEVER collected** -- VERIFIED. No fields for visit reasons, chief complaints, or appointment types exist anywhere.

- [x] **Treatment details -- NEVER collected** -- VERIFIED. No fields for treatments, procedures, medications, or clinical notes exist anywhere.

- [x] **User insurance selections -- NOT linked to identity** -- VERIFIED. Verifications are anonymous (no userId FK on VerificationLog). The `UserInsuranceCard` model does link insurance card data to a user, but it stores plan identification data only -- not claims, EOBs, or any data about services received.

- [x] **Individual medical records -- NEVER collected** -- VERIFIED. No medical record fields, diagnostic codes (ICD-10), procedure codes (CPT), or clinical data exist anywhere in the schema.

## 3. Insurance Card Data -- Detailed Analysis

The `UserInsuranceCard` model stores user-submitted insurance card data. This requires careful analysis:

**Encrypted fields (AES via INSURANCE_ENCRYPTION_KEY):**
- `subscriberIdEnc` -- Member/subscriber ID
- `groupNumberEnc` -- Group number
- `rxbinEnc` -- Pharmacy BIN
- `rxpcnEnc` -- Pharmacy PCN
- `rxgrpEnc` -- Pharmacy group

**Plain text fields:**
- `insuranceCompany`, `planName`, `planType`, `providerNetwork`, `networkNotes`
- `subscriberName`, `effectiveDate`
- `copayPcp`, `copaySpecialist`, `copayUrgent`, `copayEr`
- `deductibleIndiv`, `deductibleFamily`
- `oopMaxIndiv`, `oopMaxFamily`
- `cardSide`

**Why this is NOT PHI:**
1. Data is voluntarily submitted by the user (not received from a healthcare provider or insurer)
2. It identifies an insurance plan, not a health condition, treatment, or service
3. No diagnosis codes, procedure codes, claim numbers, or EOB data is stored
4. No dates of service, provider visit records, or clinical information
5. The data is functionally equivalent to what is printed on a physical insurance card

**Security measures verified in code:**
- `requireAuth` middleware on all insurance card routes (`routes/insuranceCard.ts` lines 115, 161, 183, 202, 222)
- CSRF protection at router level (`routes/index.ts` line 22)
- Rate limiting on scan endpoint (10/hour per user, `routes/insuranceCard.ts` line 22)
- One card per user enforced by `userId` unique constraint on `UserInsuranceCard`
- GDPR data export includes decrypted card PII with audit logging (`authService.ts` lines 378-421)
- Encryption key rotation endpoint exists (`routes/admin.ts` lines 561-679)

**Card image processing:**
- Insurance card images are submitted to `/me/insurance-card/scan` as base64 (`routes/insuranceCard.ts` line 111)
- Images are processed server-side by Claude AI for data extraction (`insuranceCardExtractor.ts`)
- Images are NOT stored permanently -- they are processed and discarded
- Only the extracted text data is persisted (with encryption for sensitive fields)

## 4. Comparison to Similar Services

- [x] **Zocdoc -- NOT HIPAA-covered** -- Correct. Zocdoc operates as a scheduling platform with patient reviews. Provider search and reviews are not HIPAA-covered activities.

- [x] **Healthgrades -- NOT HIPAA-covered** -- Correct. Healthgrades publishes public provider ratings and reviews.

- [x] **Google Reviews for doctors -- NOT HIPAA-covered** -- Correct. Review aggregation is not a HIPAA-covered activity.

- [x] **VerifyMyProvider -- NOT HIPAA-covered** -- VERIFIED. VerifyMyProvider aggregates public provider data and anonymous crowd-sourced insurance acceptance verifications. This is comparable to the services above.

## 5. Compliance We DO Need

- [x] **Terms of Service** -- Confirmed implemented (referenced as `app/terms/page.tsx`).

- [x] **Privacy Policy** -- Confirmed implemented (referenced as `app/privacy/page.tsx`). **NOTE:** The privacy policy should mention the insurance card scanning feature and that images are processed but not stored.

- [x] **Data accuracy disclaimers** -- Confirmed implemented (referenced as `app/disclaimer/page.tsx` + `Disclaimer.tsx`).

- [ ] **CMS Terms of Use (NPI Registry data usage)** -- NOT explicitly documented. NPI Registry data is used under the CMS Terms of Use, which require attribution and prohibit misrepresentation. Consider adding a visible attribution note.

- [x] **Basic security (HTTPS, rate limiting, CAPTCHA)** -- VERIFIED in code:
  - HTTPS: Cookies marked `secure: true` in production, `upgradeInsecureRequests` CSP directive
  - Rate limiting: Dual-mode (Redis/in-memory) sliding window rate limiters on all endpoints
  - CAPTCHA: reCAPTCHA v3 verification on submit and vote endpoints (`verifyCaptcha` middleware)
  - Honeypot: Bot detection via hidden `website` field on verification and vote endpoints
  - Helmet: Full security headers including strict CSP
  - CORS: Restricted to allowed origins only

- [x] **Insurance card data encrypted at rest** -- VERIFIED. AES encryption via `INSURANCE_ENCRYPTION_KEY` for subscriber ID, group number, and pharmacy identifiers. Key rotation supported via `INSURANCE_ENCRYPTION_KEY_PREVIOUS` fallback with admin re-encryption endpoint.

## 6. Benefits of No HIPAA

- [x] **Faster iteration** -- No compliance review required per code change. No security impact assessments for new features.
- [x] **Lower costs** -- No HIPAA compliance officer, no annual audits, no BAA legal costs.
- [x] **Simpler deployment** -- Cloud SQL with application-level encryption is sufficient. No need for HIPAA-eligible Cloud SQL configurations, dedicated VPCs, or audit logging infrastructure.
- [x] **Public API possible** -- Provider search data can be exposed freely. No PHI exposure concerns for API consumers.
- [x] **B2B licensing easier** -- Partners can integrate without signing BAAs.
- [x] **Can expose data freely** -- Search engine indexing, partner data feeds, and public embeds are all possible.

## 7. Boundary with OwnMyHealth

- [x] **OwnMyHealth calls VerifyMyProvider API for provider search** -- Architectural boundary documented.
- [x] **OwnMyHealth sends only: specialty, zip code, plan ID** -- No PHI in the request parameters.
- [x] **OwnMyHealth receives only: public provider information** -- Response contains only public NPI data.
- [x] **NO PHI crosses the API boundary** -- VERIFIED. The VerifyMyProvider API only exposes public provider data, plan data, and anonymous verification data. No user accounts or insurance card data is exposed through public endpoints.
- [x] **NO user identity shared between products** -- VERIFIED. VerifyMyProvider user accounts (email, saved providers, insurance card) are entirely self-contained. No user data export API exists for external services (only the user-facing GDPR export).

## Detailed Route-by-Route Data Collection Analysis

### Public Routes (no auth)

| Route | Data Collected | PHI Risk |
|-------|---------------|----------|
| `GET /providers/search` | Search filters (state, city, specialty, name) | None -- query params only |
| `GET /providers/:npi` | NPI number | None -- public identifier |
| `GET /providers/:npi/plans` | NPI, status filter | None -- public data |
| `GET /providers/:npi/colocated` | NPI | None -- public data |
| `GET /providers/cities` | State code | None |
| `GET /providers/map` | Bounding box coordinates | None |
| `GET /plans/search` | Issuer, plan type, state | None -- public data |
| `GET /plans/grouped` | Search, state | None |
| `GET /plans/:planId` | Plan ID | None -- public identifier |
| `POST /verify` | NPI, planId, boolean, IP, user agent, optional email | None -- anonymous verification |
| `POST /verify/:id/vote` | Verification ID, up/down, IP | None -- anonymous vote |
| `GET /verify/stats` | None | None |
| `GET /verify/recent` | Limit, optional NPI/planId | None |

### Authenticated Routes (requireAuth)

| Route | Data Collected | PHI Risk |
|-------|---------------|----------|
| `POST /auth/magic-link` | Email address | None -- not PHI |
| `GET /auth/verify` | Token, IP, user agent | None -- auth mechanics |
| `POST /auth/refresh` | Refresh token cookie | None -- session management |
| `POST /auth/logout` | Session ID | None |
| `GET /auth/me` | User ID from JWT | None -- returns email + count |
| `GET /auth/export` | User ID | Returns user data including decrypted insurance card -- user-initiated |
| `GET /saved-providers` | User ID, pagination | None -- bookmarks only |
| `POST /saved-providers` | User ID, NPI | None -- bookmark creation |
| `DELETE /saved-providers/:npi` | User ID, NPI | None -- bookmark removal |
| `POST /me/insurance-card/scan` | Base64 image, MIME type | **Low** -- card image processed in-memory, not stored |
| `POST /me/insurance-card/save` | Card fields (encrypted PII) | **Low** -- voluntarily submitted, not PHI |
| `GET /me/insurance-card` | User ID | Returns decrypted card for the user |
| `PATCH /me/insurance-card` | Partial card updates | **Low** -- encrypted PII fields |
| `DELETE /me/insurance-card` | User ID | Card deletion |

### Request Logger PII Exclusion

VERIFIED in `middleware/requestLogger.ts`: The `RequestLogEntry` interface explicitly defines only these fields:
- `requestId`, `timestamp`, `method`, `path`, `statusCode`, `responseTimeMs`, `rateLimited`, `rateLimitInfo`

No IP address, user agent, request body, response body, query parameters, or any user-identifying information is logged. This is a deliberate design choice documented in the code comment: "Tracks API usage without logging PII."

---

## Questions to Ask

1. Have any users, advisors, or partners questioned HIPAA compliance?
2. Are there any planned features that might introduce PHI (appointment confirmations, EOBs, linking verifications to health data)?
3. Should the privacy policy explicitly mention insurance card image processing and non-storage?
4. Has a lawyer reviewed the HIPAA non-applicability position given the insurance card storage feature?
5. Should CMS NPI Registry Terms of Use compliance be documented more formally?
6. Should the `subscriberName` field on `UserInsuranceCard` be encrypted, given it is a personal name linked to a user account?
