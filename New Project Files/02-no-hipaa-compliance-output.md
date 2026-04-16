# No HIPAA Compliance Review — Output

**Scope:** `schema.prisma`, `routes/providers.ts`, `routes/verify.ts`, `routes/plans.ts`, `routes/insuranceCard.ts`, `routes/auth.ts`, `services/`, `middleware/requestLogger.ts`.

**Position:** VerifyMyProvider is NOT a HIPAA-covered entity. Review confirms: no PHI fields in schema, no health-condition/diagnosis/visit-reason data collected, encrypted insurance card data is user-voluntary plan-identifier metadata (not clinical). The position holds.

---

## 1. What Is Stored — Verified Against Schema

### Public data (NPPES + CMS)
| Field Category | Storage Location | PHI? |
|---|---|---|
| Provider names, NPI, specialties, credentials | `providers` table (schema.prisma:12-59) | No — public NPI Registry |
| Provider addresses, phones | `practice_locations` (schema.prisma:74-106) | No — public NPPES |
| Provider hospital affiliations, insurance networks, Medicare IDs | `provider_hospitals`, `provider_insurance`, `provider_medicare` | No — public CMS |
| Taxonomy codes | `provider_taxonomies`, `taxonomy_reference` | No — public reference |
| Insurance plans | `insurance_plans` (schema.prisma:187-211) | No — public marketplace |

### User-submitted (anonymous verifications)
| Field | Storage | PHI? |
|---|---|---|
| Acceptance yes/no | `verification_logs.newValue` (JSON) | No |
| Verification source | `verification_logs.verificationSource` enum | No |
| `sourceIp` (VARCHAR 50) | `verification_logs.sourceIp` | No — operational (rate limiting/Sybil) |
| `userAgent` (VARCHAR 500) | `verification_logs.userAgent` | No — operational |
| `submittedBy` (email, optional) | `verification_logs.submittedBy` | Email = user-provided, not health info |
| Vote up/down per IP | `vote_logs` | No — anonymous |

### User accounts (auth + saved bookmarks)
| Field | Storage | PHI? |
|---|---|---|
| Email, cuid() id | `users` | No |
| Refresh token, session IP/UA | `sessions` | No — operational |
| Saved provider NPIs | `saved_providers` | No — bookmarks |

### User insurance card (encrypted at rest)
| Field | Storage | Notes |
|---|---|---|
| `subscriberIdEnc`, `groupNumberEnc`, `rxbinEnc`, `rxpcnEnc`, `rxgrpEnc` | `user_insurance_cards` (schema.prisma:407-411) | AES-256-GCM encrypted (`lib/encryption.ts`) |
| `insuranceCompany`, `planName`, `planType`, `providerNetwork`, `networkNotes` | `user_insurance_cards` | Plaintext — identifies insurance plan, not health condition |
| `subscriberName`, `effectiveDate` | `user_insurance_cards` | Plaintext — user identity, not clinical |
| `copayPcp`, `copaySpecialist`, `copayUrgent`, `copayEr`, `deductibleIndiv`, `deductibleFamily`, `oopMaxIndiv`, `oopMaxFamily` | `user_insurance_cards` | Plaintext — pricing/plan structure |
| `matchedPlanId` (FK to insurance_plans) | `user_insurance_cards` | Plaintext — public plan ID |

**Analysis:** None of these fields constitute PHI under HIPAA (45 CFR §160.103). They are financial / insurance-plan metadata voluntarily uploaded by the user. HIPAA applies to PHI held by Covered Entities or Business Associates; VerifyMyProvider is neither.

---

## 2. What Is NOT Stored — Verified by Field Search

Searched `packages/backend/src` for: `medical`, `diagnos`, `visitReason`, `healthCondition`, `patient.*record`.

Results:
- `medicalSchool` field on `provider_cms_details` — this is the DOCTOR'S medical school, not patient data. Safe.
- `MEDICAL_TITLES` array in `providerService.ts:15` — list of professional suffixes to strip from search ("Dr.", "MD", etc.). Safe.
- `confidence scoring research` references in `CONFIDENCE_SCORING_*.md` — documentation only.

**No diagnosis, visit reason, treatment, symptom, condition, or clinical field exists in the schema.** Confirmed.

---

## 3. Request Logger PII Exclusion — Verified

File: `packages/backend/src/middleware/requestLogger.ts` (144 lines).

The `RequestLogEntry` interface (lines 8-20) explicitly includes only:
- `requestId`, `timestamp`, `method`, `path`, `statusCode`, `responseTimeMs`, `rateLimited`, `rateLimitInfo`.

Search for `req.ip` in `requestLogger.ts` returned **no matches**. Comment line 7 states: "Explicitly excludes PII (no IP, user agent, or identifying information)".

**Verified — application logs do not capture IP or UA.** IP is stored only in the `verification_logs`, `vote_logs`, and `sessions` DB tables for rate limiting / session tracking, matching the prompt's stated architecture.

---

## 4. Endpoints Data Collection — Verified

### `POST /api/v1/verify` (routes/verify.ts:58-87)
Accepts: `npi`, `planId`, `acceptsInsurance` (bool), `acceptsNewPatients` (bool), `locationId`, `notes` (≤1000), `evidenceUrl`, `submittedBy` (email), `captchaToken`, `website` (honeypot).

**No PHI fields.** `notes` is free-text (≤1000 chars) — there is a theoretical risk users paste clinical info, but the field is not PHI-designed and the terms/disclaimer should cover this. `evidenceUrl` is a URL, not content.

### `POST /api/v1/me/insurance-card/scan` (routes/insuranceCard.ts:111-150)
Accepts: `imageBase64` (≤15MB), `mimeType`. The image is processed by Claude vision API (`extractInsuranceCard`), extracted fields are saved, **image itself is not persisted** (prompt claim: "processed server-side and discarded"). Only the text-extracted card fields are saved, with sensitive ones encrypted.

**Confirmed non-PHI.**

### `GET /api/v1/providers/*`, `GET /api/v1/plans/*`, `GET /api/v1/locations/*`
All return public directory data. No user input = no PHI ingestion risk.

### `POST /api/v1/auth/magic-link`
Accepts email only; magic link flow. Email is user contact info, not PHI.

### `GET /api/v1/auth/export` (routes/auth.ts:212-222)
GDPR data portability endpoint. Exports user data linked to their account. Does NOT include any clinical data (none is stored).

---

## 5. Checklist Marking

### Section 1 — What VerifyMyProvider Stores (PUBLIC DATA)
All 7 items verified from schema + routes.

### Section 2 — What VerifyMyProvider Does NOT Store (NO PHI)
All 7 items verified by negative field search. Confirmed.

### Section 3 — Safe vs Unsafe Patterns
SAFE pattern matches `verification_logs` actual columns. UNSAFE pattern columns do not exist in schema. Verified.

### Section 4 — Comparison Services
Not directly verifiable from code; documentation/legal framing.

### Section 5 — Compliance We DO Need
| Item | Status | Evidence |
|---|---|---|
| Terms of Service (`app/terms/page.tsx`) | Cannot verify in this scope | Frontend scope |
| Privacy Policy (`app/privacy/page.tsx`) | Cannot verify in this scope | Frontend scope |
| Disclaimer (`app/disclaimer/page.tsx`, `Disclaimer.tsx`) | Cannot verify in this scope | Frontend scope |
| CMS Terms of Use documentation | **MISSING** per prompt | Not verified present |
| HTTPS, rate limiting, CAPTCHA | Verified — rateLimiter.ts, captcha.ts, honeypot.ts | |
| Insurance card encryption at rest | Verified — `lib/encryption.ts` uses AES-256-GCM with IV+tag | |

### Section 6 — Benefits of No HIPAA
Strategic claims; not verifiable from code.

### Section 7 — Boundary with OwnMyHealth
Not verifiable — would need to inspect OwnMyHealth codebase. API design supports it (public-data-only endpoints).

---

## 6. Findings & Rankings

### HIGH — none.

### MEDIUM
1. **`VerificationLog.notes` is free-text (≤1000 chars)** (verify.ts:28). While intended for verification context, users could theoretically paste health info. Mitigation: disclaimer on the submission form stating "do not include personal health information." Not verified present.
2. **`VerificationLog.submittedBy` stores emails in plaintext** (schema.prisma:250). Used for Sybil prevention via `idx_vl_sybil_email`. Not PHI, but is PII. Retention policy on verification_logs (TTL via `expiresAt`) mitigates long-term storage risk.
3. **Insurance card `subscriberName` and `effectiveDate` are stored plaintext** (schema.prisma:412-413). Subscriber name = user identity (already in `users.email`). Effective date is benefit-plan metadata, not clinical. Acceptable but worth noting — these could be moved under the encrypted-field umbrella for defense-in-depth.

### LOW
1. **No `CMS Terms of Use` documentation** visible in code — prompt flags this. Recommend adding a CMS attribution note to the privacy policy.
2. **`sessions.ipAddress` / `sessions.userAgent`** stored for session tracking (schema.prisma:361-362). Reasonable for abuse detection; retention bounded by session expiry.
3. **Frontend disclaimer coverage** could not be verified in this backend-focused review.

---

## 7. Answers to Prompt's Questions

1. **Have any users/advisors/partners questioned HIPAA compliance?** — Not answerable from code.
2. **Planned features that might introduce PHI?**
   - Current insurance-card upload does NOT introduce PHI (verified).
   - Future risk: if EOB upload or appointment-confirmation upload were added, those contain PHI. Not present today.
3. **Disclaimer on frontend re: no PHI?** — Cannot verify from backend scope; prompt says `Disclaimer.tsx` exists.
4. **Lawyer review of position?** — Not answerable from code.
5. **Recent regulatory changes?** — Not answerable from code. HIPAA rules for insurance-card data unchanged as of knowledge cutoff.

---

## 8. Conclusion

**The NO HIPAA compliance position is verified by the code.** No PHI fields, no clinical data collection, app logs exclude PII, encrypted PII-like card fields, anonymous verifications. The only items I could not verify are:
- Frontend Terms/Privacy/Disclaimer pages (out of backend review scope).
- CMS Terms of Use documentation (noted as missing in the prompt).

No critical or high-severity findings.
