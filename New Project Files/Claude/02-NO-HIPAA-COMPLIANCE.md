# No HIPAA Compliance Review

**Last Updated:** 2026-02-06
**HIPAA Required:** NO
**Data Classification:** Public provider data only
**PHI Present:** None found in schema, routes, services, or middleware

---

## Checklist Results (Verified Against Code)

### 1. What VerifyMyProvider Stores (ALL PUBLIC DATA)

- [x] **Provider names** -- `Provider.firstName`, `Provider.lastName`, `Provider.organizationName` sourced from public NPI Registry. Confirmed in `schema.prisma` lines 15-16, 21.
- [x] **Provider addresses** -- `practice_locations.address_line1`, `city`, `state`, `zip_code` from public NPI Registry. Confirmed in `schema.prisma` lines 68-72.
- [x] **Provider specialties** -- `Provider.primary_specialty`, `Provider.primary_taxonomy_code`, `Provider.specialty_category` from public taxonomy codes. Confirmed in `schema.prisma` lines 30-32.
- [x] **Insurance plan names** -- `InsurancePlan.planName`, `InsurancePlan.issuerName`, `InsurancePlan.carrier` from public marketplace data. Confirmed in `schema.prisma` lines 158-163.
- [x] **Acceptance verifications** -- `VerificationLog` stores anonymous binary "accepted/not accepted" responses. Confirmed in `verificationService.ts` lines 383-389 -- `newValue` contains `acceptanceStatus`, `acceptsNewPatients`, etc.
- [x] **Verification dates** -- `VerificationLog.createdAt`, `ProviderPlanAcceptance.lastVerified`. Confirmed in `schema.prisma` lines 227, 188.
- [x] **IP addresses** -- `VerificationLog.sourceIp` (line 217) and `VoteLog.sourceIp` (line 248) for rate limiting and Sybil prevention only. **Critically:** the `stripVerificationPII` function in `verificationService.ts` (lines 307-310) removes `sourceIp`, `userAgent`, and `submittedBy` before returning data in API responses. The `getRecentVerifications` and `getVerificationsForPair` functions use explicit `select` clauses that exclude these fields (lines 632-648, 716-733).

### 2. What VerifyMyProvider Does NOT Store (NO PHI)

- [x] **Patient names** -- NEVER collected. No `userName`, `patientName`, or similar fields in schema. Verified by searching all 15 models.
- [x] **Patient addresses** -- NEVER collected. Address fields exist only for providers (`practice_locations`).
- [x] **User health conditions** -- NEVER collected. No diagnosis, condition, or health status fields.
- [x] **Visit reasons** -- NEVER collected. No `visitReason`, `chiefComplaint`, or similar fields.
- [x] **Treatment details** -- NEVER collected. No treatment, medication, or procedure fields.
- [x] **User insurance selections** -- NOT linked to identity. `VerificationLog` stores `planId` but has no user account linkage. IP addresses are stripped from API responses.
- [x] **Individual medical records** -- NEVER collected. The entire data model is provider-centric, not patient-centric.

### 3. Safe vs Unsafe Pattern Analysis

**Verified SAFE patterns in code:**

The verification submission endpoint (`verify.ts` line 58-87) collects:
```
{
  npi: "1234567890",          // Public provider identifier
  planId: "BCBS_FL_PPO",      // Public plan identifier
  acceptsInsurance: true,      // Binary yes/no (anonymous)
  acceptsNewPatients: true,    // Binary yes/no (anonymous)
  notes: "...",                // Optional free text (max 1000 chars)
  evidenceUrl: "...",          // Optional URL
  submittedBy: "email@...",    // Optional email (for Sybil prevention)
  captchaToken: "..."          // CAPTCHA verification
}
```

**No UNSAFE patterns found.** There are no fields for:
- User identity (no `userId`, `userName`)
- Health data (no `diagnosis`, `condition`, `visitReason`)
- Appointment data (no `visitDate`, `appointmentTime`)
- Financial health data (no `copay`, `deductible`, `outOfPocket`)

### 4. Comparison to Similar Services

- [x] **Zocdoc** -- NOT HIPAA-covered (business reviews model). VerifyMyProvider is similar.
- [x] **Healthgrades** -- NOT HIPAA-covered (provider ratings). VerifyMyProvider is similar.
- [x] **Google Reviews for doctors** -- NOT HIPAA-covered. VerifyMyProvider collects less PII than Google (no user accounts required).
- [x] **VerifyMyProvider** -- NOT HIPAA-covered. Collects only public provider data and anonymous verification answers.

### 5. Compliance We DO Need

- [x] **Terms of Service** -- `packages/frontend/src/app/terms/page.tsx` exists and is deployed.
- [x] **Privacy Policy** -- `packages/frontend/src/app/privacy/page.tsx` exists and is deployed.
- [x] **Data accuracy disclaimers** -- `packages/frontend/src/app/disclaimer/page.tsx` exists and is deployed.
- [ ] **CMS Terms of Use** -- Not explicitly documented in code. The schema uses CMS/NPPES data (`nppesLastSynced`, `provider_cms_details.source = "cms_national"`) but no CMS data use attribution found.
- [x] **Basic security** -- HTTPS (Helmet with `upgradeInsecureRequests` in `index.ts` line 58), rate limiting (4 tiers in `rateLimiter.ts`), CAPTCHA (`captcha.ts` on verify/vote endpoints).

### 6. Benefits of No HIPAA -- Verified in Architecture

- [x] **Faster iteration** -- No compliance review needed. Routes are simple Express handlers with Zod validation.
- [x] **Lower costs** -- No encryption at rest requirements. Standard Cloud SQL PostgreSQL.
- [x] **Simpler deployment** -- Standard Docker/Cloud Run deployment. No VPC, no audit log requirements.
- [x] **Public API possible** -- All endpoints are publicly accessible (no auth required for read operations).
- [x] **B2B licensing easier** -- No BAA (Business Associate Agreement) needed.
- [x] **Data exposed freely** -- Search results cached and served without access control (`providers.ts` lines 231-241).

### 7. Boundary with OwnMyHealth

- [ ] **Not verified** -- No OwnMyHealth integration code found in the reviewed codebase. The API is structured to support external consumers (CORS whitelist, rate limiting, public endpoints), but no explicit OwnMyHealth API calls or shared data boundaries are implemented yet.

---

## Questions Answered

### 1. Have any users, advisors, or partners questioned HIPAA compliance?

**Finding:** Cannot be determined from code review alone. However, the architecture is defensibly non-HIPAA: no patient data fields exist in the schema, PII is actively stripped from API responses via `stripVerificationPII()`, and the application logs explicitly exclude IP addresses (`requestLogger.ts` lines 7-19 show the `RequestLogEntry` interface has no IP or user agent fields).

### 2. Are there any planned features that might introduce PHI?

**Finding from code review:**
- The `SubmitVerificationInput` interface in `verificationService.ts` (lines 273-293) includes `phoneReached`, `phoneCorrect`, and `scheduledAppointment` fields. These are provider-contact verification fields (not patient health data), so they remain safe.
- The `submittedBy` field (optional email) is the closest thing to PII. It is stored for Sybil prevention but stripped from API responses.
- **Potential risk area:** If `notes` field (max 1000 chars, free text) is used by users to describe personal health situations, that could inadvertently create PHI. However, the field is optional and not linked to a user identity.

### 3. Should we add a disclaimer on the frontend clarifying no PHI is collected?

**Finding:** The disclaimer page exists (`packages/frontend/src/app/disclaimer/page.tsx`). The privacy policy page also exists. Both should explicitly state that no patient health information is collected, processed, or stored.

### 4. Has a lawyer reviewed this compliance position?

**Finding:** Cannot be determined from code review. No legal review documentation found in the codebase.

### 5. Any recent regulatory changes we should be aware of?

**Finding:** Cannot be determined from code review alone. However, the architecture's clean separation from PHI provides a strong compliance posture. The key risk would be if future features (insurance card upload, appointment booking, user health profiles) cross the PHI boundary.

---

## PII Handling Summary

| Data Element | Stored | Exposed in API | Logged |
|---|---|---|---|
| Provider NPI | Yes (PK) | Yes (public) | No |
| Provider name | Yes | Yes (public) | No |
| Provider address | Yes | Yes (public) | No |
| Submitter IP | Yes (VerificationLog, VoteLog) | **No** (stripped) | **No** (requestLogger excludes) |
| Submitter email | Yes (optional, VerificationLog) | **No** (stripped) | **No** |
| User agent | Yes (VerificationLog) | **No** (stripped) | **No** (httpLogger serializer excludes) |

The PII protection is implemented at three levels:
1. **Database layer:** IPs stored only for anti-abuse (Sybil prevention indexes)
2. **Service layer:** `stripVerificationPII()` removes IP/UA/email before API return
3. **Logging layer:** `requestLogger.ts` and `httpLogger.ts` serializers exclude PII fields
