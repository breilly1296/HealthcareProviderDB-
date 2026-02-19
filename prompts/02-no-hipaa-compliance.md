---
tags:
  - security
  - compliance
  - critical
type: prompt
priority: 1
---

# No HIPAA Compliance Review

## Files to Review
- `packages/backend/prisma/schema.prisma` (verify no PHI fields)
- `packages/backend/src/routes/` (verify what data is collected)
  - `providers.ts` - provider search/detail endpoints
  - `verify.ts` - verification submission endpoints
  - `plans.ts` - insurance plan endpoints
- `packages/backend/src/services/*` (verify no PHI processing)
- `packages/backend/src/middleware/requestLogger.ts` (verify PII exclusion in logs)

## VerifyMyProvider Compliance Architecture
- **HIPAA Required:** NO
- **Data Stored:** Public provider data only (NPI, addresses, specialties)
- **User Data:** Anonymous verifications (no patient identity)
- **Differentiator:** Can move 3x faster than OwnMyHealth (no HIPAA overhead)

## Checklist

### 1. What VerifyMyProvider Stores (ALL PUBLIC DATA)
- [ ] Provider names - from public NPI Registry
- [ ] Provider addresses - from public NPI Registry
- [ ] Provider specialties - from public taxonomy codes
- [ ] Insurance plan names - from public marketplace data
- [ ] Acceptance verifications - anonymous "yes/no" answers
- [ ] Verification dates - when verification occurred
- [ ] IP addresses - for rate limiting only

### 2. What VerifyMyProvider Does NOT Store (NO PHI)
- [ ] Patient names - NEVER collected
- [ ] Patient addresses - NEVER collected
- [ ] User health conditions - NEVER collected
- [ ] Visit reasons - NEVER collected
- [ ] Treatment details - NEVER collected
- [ ] User insurance selections - NOT linked to identity
- [ ] Individual medical records - NEVER collected

**Note on Insurance Card Storage (Feb 2026):** User insurance card data (subscriber ID, group number, pharmacy IDs) is now stored **encrypted** in the `user_insurance_cards` table. This is user-provided data linked to their account, NOT pulled from medical records. The data is:
- Voluntarily submitted by the user (not from a healthcare provider)
- Encrypted at rest (AES via INSURANCE_ENCRYPTION_KEY)
- Not linked to health conditions, diagnoses, or treatments
- Deletable by the user at any time
This does NOT trigger HIPAA because no Protected Health Information (PHI) is collected — the card data identifies an insurance plan, not a health condition or treatment.

### 3. Safe vs Unsafe Patterns

**SAFE (What We Do):**
```
Verification record:
{
  npi: "1234567890",
  planId: "BCBS_FL_PPO",
  accepted: true,
  verificationDate: "2026-01-11",
  ipAddress: "73.33.120.171" // rate limiting only
}
```

**UNSAFE (Would Trigger HIPAA):**
```
Verification record:
{
  userId: "user-123",
  userName: "John Smith",
  userPlan: "BCBS PPO",
  visitReason: "Back pain",
  visitDate: "2026-01-11"
}
```

### 4. Comparison to Similar Services
- [ ] Zocdoc - NOT HIPAA-covered (business reviews)
- [ ] Healthgrades - NOT HIPAA-covered (provider ratings)
- [ ] Google Reviews for doctors - NOT HIPAA-covered
- [ ] **VerifyMyProvider** - NOT HIPAA-covered (acceptance verification)

### 5. Compliance We DO Need
- [x] Terms of Service — `app/terms/page.tsx` implemented
- [x] Privacy Policy — `app/privacy/page.tsx` implemented
- [x] Data accuracy disclaimers — `app/disclaimer/page.tsx` + `Disclaimer.tsx` component
- [ ] CMS Terms of Use (NPI Registry data usage) — not explicitly documented
- [x] Basic security (HTTPS, rate limiting, CAPTCHA) — all implemented
- [x] Insurance card data encrypted at rest — AES encryption for subscriber IDs, group numbers, pharmacy info

**Note on Insurance Card Upload:** The insurance card extraction feature processes card images via Claude AI but does NOT store them permanently. Images are processed server-side and discarded. This does not introduce PHI since no card data is linked to user identity. However, the privacy policy should mention this feature.

### 6. Benefits of No HIPAA
- [ ] Faster iteration (no compliance review per change)
- [ ] Lower costs (~30-40% cheaper than OwnMyHealth)
- [ ] Simpler deployment (no encryption at rest required)
- [ ] Public API possible (no PHI exposure concerns)
- [ ] B2B licensing easier (no BAA negotiations)
- [ ] Can expose data freely (search engines, partners)

### 7. Boundary with OwnMyHealth
- [ ] OwnMyHealth calls VerifyMyProvider API for provider search
- [ ] OwnMyHealth sends only: specialty, zip code, plan ID
- [ ] OwnMyHealth receives only: public provider information
- [ ] NO PHI crosses the API boundary
- [ ] NO user identity shared between products

## Questions to Ask
1. Have any users, advisors, or partners questioned HIPAA compliance?
2. Are there any planned features that might introduce PHI?
   - Uploading appointment confirmations?
   - Uploading EOB (Explanation of Benefits)?
   - Linking verifications to user accounts with health data?
3. Should we add a disclaimer on the frontend clarifying no PHI is collected?
4. Has a lawyer reviewed this compliance position?
5. Any recent regulatory changes we should be aware of?
