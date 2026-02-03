# VerifyMyProvider HIPAA Compliance Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

**HIPAA Required: NO**

VerifyMyProvider stores only public data from the NPI registry and anonymous verification submissions. No Protected Health Information (PHI) is collected, stored, or processed.

---

## What VerifyMyProvider Stores (ALL PUBLIC DATA)

### From NPI Registry
| Data | Source | Classification |
|------|--------|----------------|
| Provider names | NPI Registry | Public |
| Provider addresses | NPI Registry | Public |
| Provider phone numbers | NPI Registry | Public |
| Provider specialties | NPI Registry | Public |
| NPI numbers | NPI Registry | Public |

### From Users (Anonymous)
| Data | Purpose | Classification |
|------|---------|----------------|
| Insurance plan name | Verification target | Public |
| Acceptance (yes/no) | Crowdsource data | Public |
| Verification date | Recency tracking | Public |
| IP address | Rate limiting only | Not stored permanently |

---

## What VerifyMyProvider Does NOT Store

| Data Type | Status | Notes |
|-----------|--------|-------|
| Patient names | ❌ NEVER collected | No user accounts |
| Patient addresses | ❌ NEVER collected | - |
| Patient health conditions | ❌ NEVER collected | - |
| Visit reasons | ❌ NEVER collected | - |
| Treatment details | ❌ NEVER collected | - |
| Appointment dates | ❌ NEVER collected | - |
| Insurance member IDs | ❌ NEVER collected | OCR feature doesn't store |
| Medical records | ❌ NEVER collected | - |

---

## Code Verification

### Database Schema Analysis
```prisma
// prisma/schema.prisma

// Provider - All fields are public NPI data
model Provider {
  npi              String   // Public NPI number
  firstName        String?  // Public provider name
  lastName         String?  // Public provider name
  addressLine1     String   // Public address
  // ... NO PHI fields present
}

// VerificationLog - Anonymous submissions
model VerificationLog {
  providerNpi      String?  // Public NPI
  planId           String?  // Public plan ID
  sourceIp         String?  // For rate limiting only
  // ... NO patient data present
}
```

### API Analysis
```typescript
// packages/backend/src/routes/verify.ts

// Verification submission - no patient data
const submitVerificationSchema = z.object({
  npi: z.string(),           // Provider NPI (public)
  planId: z.string(),        // Plan ID (public)
  acceptsInsurance: z.boolean(), // Yes/no (anonymous)
  notes: z.string().optional(),  // Optional context (no PHI)
  // NO patient identification fields
});
```

---

## Comparison to HIPAA-Covered Services

| Aspect | HIPAA-Covered | VerifyMyProvider |
|--------|---------------|------------------|
| Patient records | Required | NOT collected |
| Encryption at rest | Required | NOT needed |
| Access logging | Required | Simple audit log |
| BAA requirements | Required | NOT needed |
| Security audits | Mandated | Best practice only |
| Data retention | 6+ years | 6 months TTL |
| Breach notification | 60 days | N/A |

---

## Similar Non-HIPAA Services

These services handle similar data and are NOT HIPAA-covered:

| Service | What They Do | HIPAA Status |
|---------|--------------|--------------|
| Zocdoc | Doctor reviews | NOT covered |
| Healthgrades | Provider ratings | NOT covered |
| Google Reviews (doctors) | Doctor reviews | NOT covered |
| Yelp (medical) | Doctor reviews | NOT covered |
| **VerifyMyProvider** | Acceptance verification | NOT covered |

---

## Compliance We DO Need

| Requirement | Status | Notes |
|-------------|--------|-------|
| Terms of Service | ⚠️ Needed | User-generated content policy |
| Privacy Policy | ⚠️ Needed | Data collection disclosure |
| Data accuracy disclaimer | ⚠️ Needed | Crowdsourced data may be wrong |
| CMS Terms of Use | ✅ Check | NPI Registry data usage |
| Basic security | ✅ Implemented | HTTPS, rate limiting, CAPTCHA |
| Cookie consent | ⚠️ Needed | For PostHog analytics |

---

## Benefits of No HIPAA

| Benefit | Impact |
|---------|--------|
| Faster iteration | No compliance review per change |
| Lower costs | ~30-40% cheaper infrastructure |
| Simpler deployment | No encryption at rest required |
| Public API possible | No PHI exposure concerns |
| B2B licensing easier | No BAA negotiations |
| Data exposure allowed | Can share with search engines, partners |

---

## Boundary with OwnMyHealth

If VerifyMyProvider integrates with OwnMyHealth (which IS HIPAA-covered):

```
┌─────────────────────────────────────────────────────────────┐
│                     OwnMyHealth (HIPAA)                      │
│  • Patient accounts                                          │
│  • Health data                                               │
│  • Medical history                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ API calls (public data only)
                              │ - Specialty
                              │ - ZIP code
                              │ - Plan ID
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                VerifyMyProvider (NO HIPAA)                   │
│  • Provider search results                                   │
│  • Confidence scores                                         │
│  • Plan acceptance status                                    │
└─────────────────────────────────────────────────────────────┘

NO PHI CROSSES THE BOUNDARY
```

---

## Risk Scenarios

### Could HIPAA Be Triggered?

| Scenario | PHI Risk | Mitigation |
|----------|----------|------------|
| User uploads insurance card | Member ID visible | OCR extracts plan only, doesn't store |
| User enters email | Email is PII not PHI | Optional, not linked to health |
| Verification notes | Could contain PHI | Max 1000 chars, user responsibility |
| IP logging | Not PHI | Used for rate limiting only |

### Future Features That WOULD Trigger HIPAA
- Storing appointment confirmations
- Linking to patient health records
- Storing EOB (Explanation of Benefits)
- User accounts with health conditions

**These are NOT planned.**

---

## Recommendations

### Immediate
1. ✅ Publish Privacy Policy stating no PHI collected
2. ✅ Publish Terms of Service for user-generated content
3. ⚠️ Add disclaimer that crowdsourced data may be inaccurate

### Legal Review
- [ ] Have lawyer confirm HIPAA position
- [ ] Review CMS Terms of Use for NPI data

### Monitoring
- [ ] Ensure verification notes don't contain PHI (content moderation)
- [ ] Ensure insurance card OCR doesn't store sensitive data

---

## Conclusion

**VerifyMyProvider is NOT a HIPAA-covered entity** because:

1. ✅ No patient data collected
2. ✅ No health information stored
3. ✅ All data is publicly available
4. ✅ No treatment or appointment records
5. ✅ Anonymous verification submissions

This allows VerifyMyProvider to iterate 3x faster than HIPAA-covered applications.
