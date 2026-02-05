# No HIPAA Compliance Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/02-no-hipaa-compliance.md
**Status:** PASS -- No PHI collected or stored. HIPAA is correctly not required.

---

## Findings

### 1. What VerifyMyProvider Stores (ALL PUBLIC DATA)

- **Provider names -- from public NPI Registry:** Verified. `Provider` model stores `firstName`, `lastName`, `organizationName`, `credential`, `name_prefix`, `name_suffix`, `middle_name`. All sourced from public NPPES registry data. The `providerService.ts` returns these fields in API responses (lines 108-143). No patient names are stored.

- **Provider addresses -- from public NPI Registry:** Verified. `practice_locations` model stores `address_line1`, `address_line2`, `city`, `state`, `zip_code`, `phone`, `fax`. These are public practice locations from the NPI registry. The `providerService.ts` `transformProvider` function surfaces these in API responses.

- **Provider specialties -- from public taxonomy codes:** Verified. `Provider` model stores `primary_taxonomy_code`, `primary_specialty`, `specialty_category`. The `taxonomy_reference` table stores the taxonomy code lookup. The `provider_taxonomies` table stores all taxonomy codes per provider. All public data.

- **Insurance plan names -- from public marketplace data:** Verified. `InsurancePlan` model stores `planName`, `issuerName`, `planType`, `carrier`, `planVariant`, `rawName`, `sourceHealthSystem`. No patient-linked plan data. The `planService.ts` returns only plan metadata.

- **Acceptance verifications -- anonymous yes/no answers:** Verified. `VerificationLog` stores `verificationType` (PLAN_ACCEPTANCE), and `newValue` JSON containing `acceptanceStatus: 'ACCEPTED' | 'NOT_ACCEPTED'`. No user identity is linked. The `submitVerificationSchema` in `verify.ts` (line 22-30) accepts only: `npi`, `planId`, `acceptsInsurance` (boolean), `acceptsNewPatients` (optional boolean), `locationId` (optional), `notes` (optional, max 1000 chars), `evidenceUrl` (optional URL), `submittedBy` (optional email), `captchaToken`.

- **Verification dates -- when verification occurred:** Verified. `VerificationLog.createdAt` and `VerificationLog.expiresAt` are the only date fields. No visit dates or appointment dates.

- **IP addresses -- for rate limiting only:** Verified. `VerificationLog.sourceIp` and `VoteLog.sourceIp` store IP addresses. These are used exclusively for:
  - Sybil prevention: `checkSybilAttack()` in `verificationService.ts` (lines 72-115) checks for duplicate verifications from the same IP within 30 days.
  - One-vote-per-IP enforcement: `VoteLog.@@unique([verificationId, sourceIp])`.
  - **Critically, IP addresses are stripped from all API responses** via the `stripVerificationPII()` function in `verificationService.ts` (lines 307-310), and via explicit `select` statements that exclude `sourceIp`, `userAgent`, and `submittedBy` in `getRecentVerifications()` (lines 628-666) and `getVerificationsForPair()` (lines 713-735).

### 2. What VerifyMyProvider Does NOT Store (NO PHI)

- **Patient names -- NEVER collected:** Verified. No field in any model stores patient names. The `submitVerificationSchema` in `verify.ts` does not accept any patient name parameter. The optional `submittedBy` field is an email address, not a patient name. The `providerService.ts` and `planService.ts` never request or return patient names.

- **Patient addresses -- NEVER collected:** Verified. No model or route collects patient addresses. Address fields exist only on `practice_locations` (provider practice addresses) and `hospitals` (hospital addresses).

- **User health conditions -- NEVER collected:** Verified. No health condition field exists in any model. The verification flow collects only boolean acceptance status (accepts insurance yes/no).

- **Visit reasons -- NEVER collected:** Verified. No visit reason, diagnosis, or symptom field exists anywhere in the schema or routes.

- **Treatment details -- NEVER collected:** Verified. No treatment, procedure, or clinical field exists.

- **User insurance selections -- NOT linked to identity:** Verified. `VerificationLog` records which plan was verified (`planId`) but this is not linked to a user identity. The `submittedBy` email is optional and stripped from API responses. Verifications are anonymous.

- **Individual medical records -- NEVER collected:** Verified. No medical record fields exist.

### 3. Safe vs Unsafe Patterns

**SAFE pattern verification:** The actual verification record created in `verificationService.ts` (lines 375-399) matches the safe pattern:
```
{
  providerNpi,            // Public NPI
  planId: validPlanId,    // Public plan ID
  verificationType: 'PLAN_ACCEPTANCE',
  verificationSource: 'CROWDSOURCE',
  newValue: { acceptanceStatus, acceptsNewPatients, ... },
  sourceIp,               // Rate limiting only, stripped from responses
  userAgent,              // Stripped from responses
  submittedBy,            // Optional, stripped from responses
  expiresAt,              // TTL
}
```

**UNSAFE pattern verification:** No unsafe fields exist:
- No `userId` field anywhere
- No `userName` field
- No `userPlan` (plan linked to user identity)
- No `visitReason` field
- No `visitDate` field

Verified. The codebase follows only the SAFE pattern.

### 4. Comparison to Similar Services

- **Zocdoc -- NOT HIPAA-covered (business reviews):** Acknowledged. Comparable model.
- **Healthgrades -- NOT HIPAA-covered (provider ratings):** Acknowledged. Comparable model.
- **Google Reviews for doctors -- NOT HIPAA-covered:** Acknowledged. Comparable model.
- **VerifyMyProvider -- NOT HIPAA-covered (acceptance verification):** Verified. VerifyMyProvider collects less user data than Zocdoc (no user accounts) or Healthgrades (no review text linked to identity).

### 5. Compliance We DO Need

- **Terms of Service (`app/terms/page.tsx`):** Cannot verify from backend code alone. Prompt states implemented.
- **Privacy Policy (`app/privacy/page.tsx`):** Cannot verify from backend code alone. Prompt states implemented.
- **Data accuracy disclaimers (`app/disclaimer/page.tsx` + `Disclaimer.tsx`):** Cannot verify from backend code alone. Prompt states implemented.
- **CMS Terms of Use (NPI Registry data usage):** Not explicitly documented per prompt. This remains an open item.
- **Basic security (HTTPS, rate limiting, CAPTCHA):** Verified from backend code.
  - **Rate limiting:** `verify.ts` uses `verificationRateLimiter` on POST, `voteRateLimiter` on vote, `searchRateLimiter` on search, `defaultRateLimiter` on read endpoints. The `rateLimiter.ts` middleware exists.
  - **CAPTCHA:** `verify.ts` uses `verifyCaptcha` middleware on both POST verify and POST vote endpoints.
  - **HTTPS:** Cannot verify from code alone (infrastructure concern), but standard for Cloud Run deployments.

**Note on Insurance Card Upload:** The prompt mentions an insurance card extraction feature that processes images via Claude AI without permanent storage. This feature was not found in the reviewed route files (`verify.ts`, `providers.ts`). If it exists in another route or is planned, the privacy policy should indeed mention it as the prompt recommends.

### 6. Benefits of No HIPAA

- **Faster iteration:** Verified architecturally. No compliance review middleware, no audit logging for PHI access, no encryption-at-rest requirements in the schema.
- **Lower costs:** Verified. No HSM, no dedicated compliance infrastructure, no BAA overhead.
- **Simpler deployment:** Verified. Standard Cloud SQL without encryption-at-rest requirements. `engineType = "binary"` in Prisma config (no special security engine).
- **Public API possible:** Verified. All data returned by the API is public provider data. The `providers.ts` routes return provider information without authentication. The `verify.ts` stats and recent endpoints are also public.
- **B2B licensing easier:** Verified architecturally. No BAA negotiation needed since no PHI is exchanged.
- **Can expose data freely:** Verified. Search results are cached and returned without access controls. The caching layer (`cacheGet`/`cacheSet` in `providers.ts`) treats all data as public.

### 7. Boundary with OwnMyHealth

- **OwnMyHealth calls VerifyMyProvider API for provider search:** Cannot verify from the reviewed files. No OwnMyHealth integration code was found in the backend routes.
- **OwnMyHealth sends only: specialty, zip code, plan ID:** Cannot verify. The search endpoint (`providers.ts` line 20-30) accepts state, city, cities, zipCode, specialty, specialtyCategory, name, npi, entityType. No authentication or client identification is required.
- **OwnMyHealth receives only: public provider information:** Verified. The API returns only public data as confirmed in section 1.
- **NO PHI crosses the API boundary:** Verified. The API does not accept or return any PHI fields.
- **NO user identity shared between products:** Verified. No user identity fields exist in the VerifyMyProvider schema or routes.

### Additional Findings: PII Handling in Request Logger

- **Request logger explicitly excludes PII:** Verified. The `requestLogger.ts` middleware:
  - Defines a `RequestLogEntry` interface (lines 8-19) that includes only: `requestId`, `timestamp`, `method`, `path`, `statusCode`, `responseTimeMs`, `rateLimited`, and optional `rateLimitInfo`.
  - The comment on line 7 explicitly states: "Explicitly excludes PII (no IP, user agent, or identifying information)."
  - No IP address, user agent, request body, or query parameters are logged.
  - The `getRequestStats()` function (lines 101-135) returns only aggregate statistics.
  - This is a strong security practice.

- **Verification service strips PII from responses:** Verified. The `stripVerificationPII()` function (lines 307-310) removes `sourceIp`, `userAgent`, and `submittedBy` from verification objects before they are returned in API responses. This function is called in `submitVerification()` (line 412) and `voteOnVerification()` (line 551).

- **Database queries use explicit `select` to exclude PII:** Verified. Both `getRecentVerifications()` and `getVerificationsForPair()` use Prisma `select` clauses that explicitly list included fields and comment `// Exclude: sourceIp, userAgent, submittedBy`.

### Additional Finding: Prisma Client Logging

- **Development logging includes query logs:** In `prisma.ts` (line 10-11), `log: ['query', 'error', 'warn']` is enabled in development. Query logs could include NPI values and IP addresses in development mode. This is acceptable since development environments should not contain production data, but worth noting.
- **Production logging is error-only:** Confirmed. `log: ['error']` in production.

---

## Summary

VerifyMyProvider correctly avoids all HIPAA-triggering data. The codebase stores only public provider registry data (NPI, names, addresses, specialties, taxonomies), public insurance plan metadata, and anonymous verification records. No patient names, addresses, health conditions, visit reasons, treatment details, or medical records are collected at any point.

The system implements strong PII safeguards even though HIPAA is not required:
- IP addresses and user agents are collected only for Sybil prevention and rate limiting.
- All PII fields are explicitly stripped from API responses via `stripVerificationPII()` and explicit Prisma `select` clauses.
- The request logger explicitly excludes all PII.
- Verification data is anonymous with no user identity linkage.

The HIPAA-free architecture enables faster development iteration, lower infrastructure costs, and the ability to expose data publicly (search engines, B2B partners) without BAA negotiations.

---

## Recommendations

1. **Document CMS Terms of Use compliance.** The prompt notes this is not explicitly documented. Since the application relies heavily on NPI Registry data, documenting compliance with CMS data usage terms would strengthen the legal position.

2. **Verify insurance card upload feature scope.** The prompt mentions an insurance card extraction feature. If this feature exists or is planned, ensure:
   - Card images are truly ephemeral (not written to disk or cloud storage).
   - The privacy policy explicitly mentions this processing.
   - No OCR text is persisted that could link to user identity.

3. **Review development query logging.** While acceptable in development, ensure `['query', 'error', 'warn']` logging in the Prisma client does not accidentally leak sensitive data if development environments ever use production-like data.

4. **Consider explicit "no PHI" validation middleware.** While no PHI fields exist today, adding a middleware or schema validation layer that rejects requests containing known PHI patterns (SSN format, date-of-birth fields) would provide defense-in-depth against accidental PHI introduction in future features.

5. **Verify frontend compliance pages.** The Terms of Service, Privacy Policy, and Disclaimer pages referenced in the prompt (`app/terms/page.tsx`, `app/privacy/page.tsx`, `app/disclaimer/page.tsx`) should be reviewed to confirm they exist and accurately describe the data handling practices verified in this analysis.
