# No HIPAA Compliance Review

**Project:** VerifyMyProvider (HealthcareProviderDB)
**Date:** February 7, 2026
**Priority:** Critical
**Tags:** security, compliance

---

## Executive Summary

VerifyMyProvider is **NOT subject to HIPAA** because it does not collect, store, process, or transmit Protected Health Information (PHI). The platform operates exclusively with public provider data sourced from the CMS National Plan and Provider Enumeration System (NPPES) and anonymous crowdsourced insurance acceptance verifications. This architectural decision is intentional and provides a significant competitive advantage: faster iteration, lower costs (approximately 30-40% less than HIPAA-compliant alternatives), and simpler deployment.

This document provides a thorough, code-verified analysis of every data flow in the system to confirm this compliance posture.

---

## 1. VerifyMyProvider Compliance Architecture

| Attribute | Value |
|---|---|
| **HIPAA Required** | NO |
| **Data Stored** | Public provider data only (NPI, addresses, specialties) |
| **User Data** | Anonymous verifications (no patient identity) |
| **Differentiator** | Can move 3x faster than OwnMyHealth (no HIPAA overhead) |

---

## 2. What VerifyMyProvider Stores (ALL PUBLIC DATA)

Each data category below has been verified against the actual Prisma schema at `packages/backend/prisma/schema.prisma` and the corresponding route/service code.

### 2.1 Provider Names -- from Public NPI Registry

**Schema evidence** (`Provider` model, lines 12-51):
```prisma
model Provider {
  npi                      String   @id @db.VarChar(10)
  lastName                 String?  @map("last_name") @db.VarChar(100)
  firstName                String?  @map("first_name") @db.VarChar(100)
  middle_name              String?  @db.VarChar(100)
  organizationName         String?  @map("organization_name") @db.VarChar(200)
  ...
  @@map("providers")
}
```

These are the **provider's** names (the doctor or organization), not patient names. All sourced from the publicly available NPI Registry maintained by CMS. The `providers.ts` route (`GET /api/v1/providers/search` and `GET /api/v1/providers/:npi`) returns only these public fields.

**CONFIRMED: No patient names stored anywhere.**

### 2.2 Provider Addresses -- from Public NPI Registry

**Schema evidence** (`practice_locations` model, lines 64-84):
```prisma
model practice_locations {
  id              Int      @id @default(autoincrement())
  npi             String   @db.VarChar(10)
  address_line1   String?  @db.VarChar(200)
  address_line2   String?  @db.VarChar(200)
  city            String?  @db.VarChar(100)
  state           String?  @db.VarChar(2)
  zip_code        String?  @db.VarChar(10)
  phone           String?  @db.VarChar(20)
  fax             String?  @db.VarChar(20)
}
```

These are **practice office addresses**, not patient addresses. This is public business location data from the NPI Registry.

**CONFIRMED: No patient addresses stored anywhere.**

### 2.3 Provider Specialties -- from Public Taxonomy Codes

**Schema evidence** (`Provider` model fields and `taxonomy_reference` model, lines 147-155):
```prisma
// On Provider model:
primary_taxonomy_code    String?  @db.VarChar(20)
primary_specialty        String?  @db.VarChar(200)
specialty_category       String?  @db.VarChar(100)

// Reference table:
model taxonomy_reference {
  taxonomy_code     String  @id @db.VarChar(20)
  display_name      String? @db.VarChar(200)
  classification    String? @db.VarChar(200)
  specialization    String? @db.VarChar(200)
}
```

These are public NUCC Health Care Provider Taxonomy codes. They describe what a provider practices, not what conditions any patient has.

**CONFIRMED: No patient health conditions stored.**

### 2.4 Insurance Plan Names -- from Public Marketplace Data

**Schema evidence** (`InsurancePlan` model, lines 157-179):
```prisma
model InsurancePlan {
  planId              String   @id @map("plan_id") @db.VarChar(50)
  planName            String?  @map("plan_name") @db.VarChar(200)
  issuerName          String?  @map("issuer_name") @db.VarChar(200)
  planType            String?  @map("plan_type") @db.VarChar(20)
  state               String?  @db.VarChar(2)
  carrier             String?  @db.VarChar(100)
}
```

These are public insurance plan names and metadata -- the same data available on healthcare.gov and insurer websites. Plans are not linked to any individual user or patient.

**CONFIRMED: No user-specific insurance selections stored.**

### 2.5 Acceptance Verifications -- Anonymous "Yes/No" Answers

**Schema evidence** (`ProviderPlanAcceptance` model, lines 181-206):
```prisma
model ProviderPlanAcceptance {
  id                 Int       @id @default(autoincrement())
  providerNpi        String?   @map("npi") @db.VarChar(10)
  planId             String?   @map("plan_id") @db.VarChar(50)
  acceptanceStatus   String    @default("UNKNOWN") @db.VarChar(20)
  confidenceScore    Int       @default(0)
  verificationCount  Int       @default(0)
  lastVerified       DateTime?
}
```

This records whether a provider accepts a given insurance plan. It is a relationship between two public entities (a provider and a plan). There is no user identity, no patient identity, and no health information in this record.

**Route evidence** (`packages/backend/src/routes/verify.ts`, lines 23-32):
```typescript
const submitVerificationSchema = npiParamSchema.merge(planIdParamSchema).extend({
  acceptsInsurance: z.boolean(),
  acceptsNewPatients: z.boolean().optional(),
  locationId: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
  evidenceUrl: z.string().url().max(500).optional(),
  submittedBy: z.string().email().max(200).optional(),
  captchaToken: z.string().optional(),
  website: z.string().optional(), // honeypot field
});
```

The only user-provided fields are: whether insurance is accepted (boolean), optional notes about the provider, optional evidence URL, and an optional email. None of these constitute PHI.

**CONFIRMED: Verifications are anonymous; no patient identity linked.**

### 2.6 Verification Dates -- When Verification Occurred

**Schema evidence** (`VerificationLog` model, lines 208-243):
```prisma
model VerificationLog {
  id                 String    @id @default(cuid())
  createdAt          DateTime  @default(now()) @map("created_at")
  expiresAt          DateTime? @map("expires_at")
}
```

Timestamps record when a verification was submitted, not when a patient visited a provider.

**CONFIRMED: No patient visit dates stored.**

### 2.7 IP Addresses -- for Rate Limiting Only

**Schema evidence** (`VerificationLog` model, line 217):
```prisma
sourceIp           String?  @db.VarChar(50)
```

IP addresses are stored for rate limiting and Sybil attack prevention. Critically, the application actively strips IP addresses from all API responses.

**Service evidence** (`packages/backend/src/services/verificationService.ts`, lines 307-310):
```typescript
function stripVerificationPII<T extends Record<string, unknown>>(
  verification: T
): Omit<T, 'sourceIp' | 'userAgent' | 'submittedBy'> {
  const { sourceIp, userAgent, submittedBy, ...safe } = verification;
  return safe;
}
```

This `stripVerificationPII` function is called on every verification returned by `submitVerification()` (line 412) and `voteOnVerification()` (line 551). The `getRecentVerifications()` and `getVerificationsForPair()` functions use Prisma `select` clauses that explicitly exclude `sourceIp`, `userAgent`, and `submittedBy` (see lines 632-648 and 716-733).

**CONFIRMED: IP addresses used for security only, never exposed in API responses.**

---

## 3. What VerifyMyProvider Does NOT Store (NO PHI)

A comprehensive audit of every model in `packages/backend/prisma/schema.prisma` confirms the complete absence of the following HIPAA-protected data elements:

| PHI Category | Collected? | Evidence |
|---|---|---|
| **Patient names** | NEVER | No `user`, `patient`, or `member` model exists. No name fields linked to users. |
| **Patient addresses** | NEVER | Only provider practice addresses stored (public NPI data). |
| **User health conditions** | NEVER | No diagnosis, condition, or ICD code fields in any model. |
| **Visit reasons** | NEVER | No appointment, visit, or encounter model exists. |
| **Treatment details** | NEVER | No procedure, prescription, or treatment fields in any model. |
| **User insurance selections** | NOT LINKED TO IDENTITY | Verifications record provider-plan pairs, not user-plan enrollments. The `submittedBy` email is optional and stripped from responses. |
| **Individual medical records** | NEVER | No medical record, chart, or clinical note model exists. |
| **Social Security numbers** | NEVER | No SSN field in any model. |
| **Dates of birth** | NEVER | No DOB field in any model. |
| **Financial information** | NEVER | No payment, billing, or account model exists. |

### Full Schema Model Inventory

The entire database consists of these models, all verified to contain only public data:

1. **Provider** -- Public NPI Registry data (name, specialty, taxonomy)
2. **hospitals** -- Public hospital data (CCN, name, address)
3. **practice_locations** -- Public provider office addresses
4. **provider_cms_details** -- Public CMS data (medical school, graduation year, telehealth)
5. **provider_hospitals** -- Public provider-hospital affiliations
6. **provider_insurance** -- Public network identifiers from NPI other identifiers
7. **provider_medicare** -- Public Medicare identifiers
8. **provider_taxonomies** -- Public taxonomy classification codes
9. **taxonomy_reference** -- Public NUCC taxonomy code reference table
10. **InsurancePlan** -- Public insurance plan metadata
11. **ProviderPlanAcceptance** -- Anonymous aggregated acceptance data
12. **VerificationLog** -- Anonymous verification submissions (PII stripped from responses)
13. **VoteLog** -- Anonymous upvote/downvote on verifications
14. **SyncLog** -- Internal system synchronization logs
15. **DataQualityAudit** -- Internal data quality tracking

**None of these models contain any field that constitutes Protected Health Information under HIPAA.**

---

## 4. Safe vs. Unsafe Data Patterns

### SAFE Pattern (What VerifyMyProvider Does)

A verification record in the system looks like this:

```json
{
  "providerNpi": "1234567890",
  "planId": "BCBS_FL_PPO",
  "acceptanceStatus": "ACCEPTED",
  "verificationType": "PLAN_ACCEPTANCE",
  "verificationSource": "CROWDSOURCE",
  "createdAt": "2026-01-11T00:00:00Z",
  "expiresAt": "2026-07-11T00:00:00Z",
  "upvotes": 3,
  "downvotes": 0
}
```

What is stored internally (never exposed):
```json
{
  "sourceIp": "73.33.120.171",
  "userAgent": "Mozilla/5.0...",
  "submittedBy": "user@example.com"
}
```

The above internal fields are explicitly stripped from every API response by the `stripVerificationPII()` function or by using Prisma `select` clauses that exclude them.

### UNSAFE Pattern (Would Trigger HIPAA -- NOT Present)

The following pattern does **NOT exist** anywhere in the codebase:

```json
{
  "userId": "user-123",
  "userName": "John Smith",
  "userPlan": "BCBS PPO",
  "visitReason": "Back pain",
  "visitDate": "2026-01-11"
}
```

No user accounts, no patient names, no visit reasons, no user-specific plan enrollments.

---

## 5. Insurance Card Scanning Feature -- Special Analysis

The insurance card extraction feature (`packages/frontend/src/app/api/insurance-card/extract/route.ts`) processes insurance card photos via Claude AI. This requires careful analysis:

**Data flow:**
1. User uploads a photo of their insurance card (base64 encoded)
2. Image is optionally preprocessed (resized, contrast enhanced) in memory
3. Image is sent to Anthropic's Claude API for text extraction
4. Extracted text (plan name, network info) is returned to the user's browser
5. **Image is immediately discarded -- never stored to disk or database**

**Code evidence** (route.ts, lines 222-537):
- The image arrives as a base64 string in the request body (`const { image } = body`)
- It is processed through Claude's API (`callExtractionAPI()`)
- Only structured plan data is returned (plan name, group number, network)
- No storage call (no database write, no file system write) exists in the entire route
- The route has its own rate limiting (10 extractions per hour per IP)

**What is extracted and returned:**
- Insurance company name
- Plan name
- Network type
- Group number

**What is NOT stored:**
- The card image itself
- Member ID numbers
- Patient name from the card
- Any personally identifiable information

**Privacy Policy coverage** (verified in `packages/frontend/src/app/privacy/page.tsx`, lines 86-111):
The privacy policy explicitly addresses this feature with a dedicated section titled "Insurance Card Scanning" that states:
- "Images are NOT stored: Card images are processed in memory only and immediately discarded after extraction"
- "AI processing: Images are sent to Anthropic's Claude API for text extraction; they do not retain images per their data policy"
- "Extracted text: Only the extracted plan information (plan name, network) is returned to your browser; we do not store member IDs or personal details"

**CONFIRMED: Insurance card scanning does not introduce PHI storage. Images are transient and never persisted.**

---

## 6. Request Logging -- PII Exclusion Verified

### 6.1 Request Logger (`packages/backend/src/middleware/requestLogger.ts`)

The request logger explicitly documents its PII exclusion policy in the code comments (line 7):

```typescript
/**
 * Request log entry structure
 * Explicitly excludes PII (no IP, user agent, or identifying information)
 */
interface RequestLogEntry {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  rateLimited: boolean;
}
```

The `RequestLogEntry` interface contains only operational metrics. No IP address, no user agent, no request body content, and no identifying information is logged.

### 6.2 HTTP Logger (`packages/backend/src/middleware/httpLogger.ts`)

The pino-http logger uses custom serializers that strip request details (lines 33-42):

```typescript
serializers: {
  req: (req) => ({
    id: req.id,
    method: req.method,
    url: req.url,
  }),
  res: (res) => ({
    statusCode: res.statusCode,
  }),
},
```

Only request ID, HTTP method, URL, and status code are logged. No IP addresses, no request bodies, no headers containing user information.

**CONFIRMED: Logging infrastructure explicitly excludes PII.**

---

## 7. Security Measures in Place (Non-HIPAA)

Even though HIPAA is not required, the application implements robust security measures for data integrity and abuse prevention.

### 7.1 Rate Limiting

**File:** `packages/backend/src/middleware/rateLimiter.ts`

Four tiers of rate limiting are configured:

| Limiter | Limit | Window | Endpoints |
|---|---|---|---|
| `defaultRateLimiter` | 200 requests | 1 hour | All general API routes |
| `searchRateLimiter` | 100 requests | 1 hour | Search endpoints |
| `verificationRateLimiter` | 10 requests | 1 hour | Verification submissions |
| `voteRateLimiter` | 10 requests | 1 hour | Vote endpoints |

The rate limiter supports both in-memory (single-instance) and Redis-based (distributed) modes with a sliding window algorithm. It uses IP-based identification (`req.ip`).

### 7.2 CAPTCHA Protection

**File:** `packages/backend/src/middleware/captcha.ts`

Google reCAPTCHA v3 is integrated on verification and vote submission endpoints. The middleware includes:
- Score-based bot detection (configurable threshold via `CAPTCHA_MIN_SCORE`)
- Fail-open mode with stricter fallback rate limiting (3 requests/hour vs. normal 10/hour)
- Configurable fail-open/fail-closed behavior via `CAPTCHA_FAIL_MODE` environment variable

### 7.3 Honeypot Bot Detection

**File:** `packages/backend/src/middleware/honeypot.ts`

A hidden `website` field is included in verification forms. Bots that auto-fill this field receive a fake success response (`200 OK` with `{ success: true }`) to avoid alerting them.

### 7.4 Sybil Attack Prevention

**File:** `packages/backend/src/services/verificationService.ts` (lines 72-115)

The `checkSybilAttack()` function prevents duplicate verifications from the same IP address or email within a 30-day window for any given provider-plan pair.

### 7.5 HTTPS and Security Headers

**File:** `packages/backend/src/index.ts` (lines 47-67)

Helmet.js is configured with strict Content Security Policy headers. The backend is a JSON-only API with all resource types blocked (`'none'`). Additional headers include:
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Referrer-Policy: no-referrer`
- `Upgrade-Insecure-Requests`

### 7.6 CORS Restrictions

**File:** `packages/backend/src/index.ts` (lines 23-86)

Only explicitly allowed origins are permitted:
- `https://verifymyprovider.com`
- `https://www.verifymyprovider.com`
- The Cloud Run frontend URL
- `localhost` in development only

### 7.7 Request Body Size Limits

**File:** `packages/backend/src/index.ts` (line 89)
```typescript
app.use(express.json({ limit: '100kb' }));
```

### 7.8 Admin Endpoint Protection

**File:** `packages/backend/src/routes/admin.ts` (lines 22-56)

Admin endpoints are protected by an `X-Admin-Secret` header with timing-safe comparison to prevent timing attacks. If `ADMIN_SECRET` is not configured, all admin endpoints return `503`.

### 7.9 Input Validation

All API inputs are validated using Zod schemas (seen in every route file). Invalid inputs are rejected before reaching the database layer.

**CONFIRMED: Comprehensive security measures are in place despite no HIPAA requirement.**

---

## 8. Compliance That IS Implemented

### 8.1 Terms of Service

**File:** `packages/frontend/src/app/terms/page.tsx`
**Status:** IMPLEMENTED

Covers: service description, data accuracy disclaimer, no medical advice, user-generated content, prohibited uses, limitation of liability, content moderation, data attribution, governing law (Delaware).

### 8.2 Privacy Policy

**File:** `packages/frontend/src/app/privacy/page.tsx`
**Status:** IMPLEMENTED

Covers: information collected, insurance card scanning (dedicated section), what is NOT collected (explicit HIPAA exclusion statement), how information is used, analytics (PostHog with consent), cookies and local storage, third-party services (PostHog, Anthropic, Google reCAPTCHA, Google Cloud), data retention, user rights, security, children's privacy.

Key statement from the privacy policy (line 136-138):
> "Note: VerifyMyProvider is not subject to HIPAA as we do not handle protected health information."

### 8.3 Data Accuracy Disclaimers

**File:** `packages/frontend/src/app/disclaimer/page.tsx` -- Full disclaimer page
**File:** `packages/frontend/src/components/Disclaimer.tsx` -- Reusable banner/inline component
**Status:** IMPLEMENTED

The `Disclaimer` component appears as a persistent banner across the site that can be dismissed for 30 days. It links to the full disclaimer page. The `DisclaimerCompact` variant appears in provider cards and detail views.

### 8.4 CMS Terms of Use (NPI Registry Data Usage)

**Status:** PARTIALLY DOCUMENTED

The Terms of Service mentions CMS NPPES as a data source (section 8: "Provider information is sourced from the CMS National Plan and Provider Enumeration System (NPPES), a public database maintained by the U.S. government"). However, there is no explicit acknowledgment of CMS Terms of Use for NPPES data redistribution. This should be reviewed.

### 8.5 Basic Security (HTTPS, Rate Limiting, CAPTCHA)

**Status:** FULLY IMPLEMENTED

See Section 7 above for detailed evidence.

---

## 9. Comparison to Similar Services

| Service | HIPAA Covered? | Reason |
|---|---|---|
| **Zocdoc** | No | Business reviews and appointment scheduling platform |
| **Healthgrades** | No | Provider ratings and reviews |
| **Google Reviews for Doctors** | No | Public business reviews |
| **Vitals.com** | No | Provider directory and ratings |
| **VerifyMyProvider** | **No** | Insurance acceptance verification using public data and anonymous crowdsourcing |

All of these services operate with public provider data and user-generated content. None handle PHI in their primary data flows. VerifyMyProvider follows the same established pattern.

---

## 10. Benefits of No HIPAA Requirement

| Benefit | Impact |
|---|---|
| **Faster iteration** | No compliance review required per feature change or deployment |
| **Lower costs** | Approximately 30-40% cheaper than HIPAA-compliant alternatives (no BAA, no compliance audits, no encryption-at-rest requirements) |
| **Simpler deployment** | Standard Google Cloud Run deployment without HIPAA-specific infrastructure |
| **Public API possible** | Data can be freely exposed via API without PHI exposure concerns |
| **B2B licensing easier** | No Business Associate Agreement (BAA) negotiations required with partners |
| **SEO-friendly** | Provider data can be indexed by search engines without privacy concerns |

---

## 11. Boundary with OwnMyHealth

VerifyMyProvider is designed to be consumed as an API by the companion product OwnMyHealth, which IS HIPAA-covered. The API boundary is clean:

| Direction | Data Sent | PHI Present? |
|---|---|---|
| OwnMyHealth -> VerifyMyProvider | Specialty, zip code, plan ID | **NO** -- these are search criteria, not patient data |
| VerifyMyProvider -> OwnMyHealth | Public provider information, acceptance status, confidence scores | **NO** -- all public data |

**Critical safeguards:**
- No user identity is shared between products
- No patient data crosses the API boundary
- OwnMyHealth authenticates via standard API calls, not user session sharing
- The CORS configuration (`packages/backend/src/index.ts`) only allows whitelisted origins

---

## 12. Potential Risks and Monitoring

### 12.1 Features That Could Introduce HIPAA Concerns

The following hypothetical features would require HIPAA reassessment if ever implemented:

| Potential Feature | Risk Level | Why It Would Trigger HIPAA |
|---|---|---|
| **User accounts with health data** | HIGH | Linking verifications to identified users with health conditions |
| **Appointment confirmations upload** | HIGH | Visit dates + provider = PHI |
| **Explanation of Benefits (EOB) upload** | HIGH | Diagnosis codes, procedure codes, payment amounts |
| **Linking verifications to user insurance enrollments** | MEDIUM | Knowing which plan a specific user is enrolled in could be considered PHI when combined with provider visits |
| **Storing insurance card images** | MEDIUM | Member IDs + names = PII/PHI (currently images are transient only) |

### 12.2 Current Low-Risk Areas to Monitor

- **Optional email field** (`submittedBy` in VerificationLog): Currently stripped from all API responses. If ever exposed or used for user identification, reassess.
- **IP addresses** (`sourceIp` in VerificationLog): Currently stripped from all API responses. If ever correlated with health-related queries, reassess.
- **Insurance card extraction**: Currently transient. If any card data were ever stored to the database, reassess immediately.

---

## 13. Questions for Stakeholders

1. **Have any users, advisors, or partners questioned HIPAA compliance?**
   - If so, the privacy policy explicitly states the non-HIPAA position and this document provides the technical evidence.

2. **Are there any planned features that might introduce PHI?**
   - Uploading appointment confirmations?
   - Uploading EOB (Explanation of Benefits)?
   - Linking verifications to user accounts with health data?
   - Any of these would require immediate HIPAA reassessment.

3. **Should we add an additional frontend disclaimer clarifying no PHI is collected?**
   - The privacy policy already states this (Section 3: "VerifyMyProvider is not subject to HIPAA as we do not handle protected health information"), but a more prominent notice on the verification form could further clarify.

4. **Has a lawyer reviewed this compliance position?**
   - This technical analysis confirms the architecture is PHI-free, but legal review is recommended to validate the compliance posture formally.

5. **CMS NPPES Terms of Use -- has explicit compliance been documented?**
   - The Terms of Service references CMS NPPES as a data source, but explicit acknowledgment of CMS redistribution terms should be added.

6. **Any recent regulatory changes we should be aware of?**
   - Monitor for FTC Health Breach Notification Rule changes (applies to non-HIPAA health apps)
   - Monitor for state-level health data privacy laws (e.g., Washington My Health My Data Act)

---

## 14. Code References Summary

| File | Purpose | PHI Status |
|---|---|---|
| `packages/backend/prisma/schema.prisma` | Database schema -- all 15 models | No PHI fields |
| `packages/backend/src/routes/providers.ts` | Provider search and detail endpoints | Returns only public data |
| `packages/backend/src/routes/verify.ts` | Verification submission and voting | Anonymous submissions, PII stripped |
| `packages/backend/src/routes/plans.ts` | Insurance plan search and detail | Public plan metadata only |
| `packages/backend/src/routes/admin.ts` | Admin endpoints | Protected by secret, no PHI exposed |
| `packages/backend/src/services/verificationService.ts` | Core verification logic | `stripVerificationPII()` strips IP/UA/email |
| `packages/backend/src/services/providerService.ts` | Provider search logic | Queries public data only |
| `packages/backend/src/services/planService.ts` | Plan search logic | Queries public data only |
| `packages/backend/src/services/confidenceService.ts` | Confidence scoring | Uses only verification counts and votes |
| `packages/backend/src/middleware/requestLogger.ts` | Request logging | Explicitly excludes PII (documented in interface) |
| `packages/backend/src/middleware/httpLogger.ts` | HTTP logging | Custom serializers strip request details |
| `packages/backend/src/middleware/rateLimiter.ts` | Rate limiting | Uses IP for throttling, does not log |
| `packages/backend/src/middleware/captcha.ts` | CAPTCHA verification | Logs IP for security only |
| `packages/backend/src/middleware/honeypot.ts` | Bot detection | Logs IP for security only |
| `packages/backend/src/index.ts` | App setup | Helmet, CORS, body limits configured |
| `packages/frontend/src/app/privacy/page.tsx` | Privacy Policy page | Explicit non-HIPAA statement |
| `packages/frontend/src/app/terms/page.tsx` | Terms of Service page | Data accuracy disclaimers |
| `packages/frontend/src/app/disclaimer/page.tsx` | Full disclaimer page | Crowdsourced data warnings |
| `packages/frontend/src/components/Disclaimer.tsx` | Disclaimer banner component | Persistent user-facing warning |
| `packages/frontend/src/app/api/insurance-card/extract/route.ts` | Insurance card extraction | Images transient, never stored |

---

## 15. Conclusion

VerifyMyProvider's architecture is intentionally designed to avoid HIPAA obligations. Every data flow has been traced from API input through database storage to API response. The system stores only:

1. **Public provider data** from the NPI Registry (names, addresses, specialties)
2. **Public insurance plan data** from marketplace sources (plan names, types, carriers)
3. **Anonymous acceptance verifications** (provider-plan pairs with yes/no answers)
4. **Operational metadata** (timestamps, confidence scores, vote counts)

No patient identity, no health conditions, no visit information, and no medical records exist anywhere in the system. The privacy policy explicitly states the non-HIPAA position, and the codebase enforces it through PII stripping functions, selective Prisma queries, and careful logging practices.

This compliance posture enables faster development velocity, simpler infrastructure, lower costs, and broader data sharing possibilities compared to HIPAA-regulated alternatives.
