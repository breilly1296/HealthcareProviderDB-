# VerifyMyProvider + OwnMyHealth Ecosystem

**Last Updated:** 2026-02-06

## The Portfolio Model

```
                    +-----------------------+
                    |    Holding Company     |
                    |  (Future Structure)    |
                    +-----------+-----------+
                                |
                +---------------+---------------+
                |                               |
    +-----------+-----------+       +-----------+-----------+
    |  VerifyMyProvider     |       |    OwnMyHealth        |
    |  (Provider Directory  |       |  (Personal Health     |
    |   + Verification)     |       |   Records Platform)   |
    +-----------+-----------+       +-----------+-----------+
                |                               |
    +-----------+-----------+       +-----------+-----------+
    | - Public data only    |       | - HIPAA-compliant     |
    | - No auth required    |       | - User accounts       |
    | - Crowdsource model   |       | - PHI storage         |
    | - Free tier           |       | - Premium features    |
    +-----------------------+       +-----------------------+
```

---

## Why Partner Products (Not One Platform)

### Different Compliance Requirements

| Aspect | VerifyMyProvider | OwnMyHealth |
|--------|-----------------|-------------|
| **HIPAA Required** | No - public NPI data only | Yes - stores PHI |
| **User Auth Required** | No - anonymous verification | Yes - accounts mandatory |
| **Data Sensitivity** | Public provider info | Protected health info |
| **Development Speed** | Fast - no compliance overhead | Slower - HIPAA audit trail |
| **Risk Profile** | Low - public data | High - regulated data |
| **Launch Timeline** | Near-term (beta ready) | Medium-term |
| **Liability** | Minimal | Significant |
| **Cost to Build** | Lower | Higher |
| **Regulatory Burden** | None | HIPAA, state privacy laws |

### Strategic Separation Rationale

1. **Risk Isolation** - A security incident on VerifyMyProvider does not expose PHI. A HIPAA breach on OwnMyHealth does not affect VerifyMyProvider's reputation or operations.

2. **Development Speed** - VerifyMyProvider can ship features rapidly without HIPAA compliance review cycles. Evidence: the codebase already has rate limiting, CAPTCHA, Sybil prevention, and a full API deployed to Google Cloud Run.

3. **Exit Optionality** - Either product can be sold independently, or both together at a premium for the synergy.

4. **Cost Savings** - VerifyMyProvider does not need HIPAA-compliant infrastructure (encrypted storage, audit logging, BAAs with vendors), significantly reducing operational costs.

---

## Symbiotic User Acquisition

### User Journey: Casual User ("Your Sister")

```
1. Googles "does Dr. Smith accept Blue Cross"
2. Lands on VerifyMyProvider search results
3. Finds Dr. Smith's verification status
4. Sees: "46% of directories contain errors - verify this!"
5. Maybe submits a verification after appointment
6. Never needs OwnMyHealth
```

**Value to ecosystem:**
- Verification data (crowdsource contribution)
- SEO traffic (long-tail search queries for provider names)
- Top-of-funnel awareness for OwnMyHealth
- Zero acquisition cost if organic search

### User Journey: Power User ("You")

```
1. Searches for in-network provider on VerifyMyProvider
2. Verifies provider accepts their specific plan
3. Sees CTA: "Track your health records across providers"
4. Signs up for OwnMyHealth
5. Uses VerifyMyProvider to find new providers
6. Uses OwnMyHealth to manage records across providers
```

**Value to ecosystem:**
- Higher engagement across both products
- Premium subscription revenue (OwnMyHealth)
- Multiple verification contributions (VerifyMyProvider)
- Network effect: verified providers attract more users

---

## The Conversion Funnel

```
    VerifyMyProvider Users (100%)
            |
    Search for provider (100%)
            |
    View provider details (70%)
            |
    Submit verification (5-10%)
            |
    See OwnMyHealth CTA (5-10%)
            |
    Click through to OwnMyHealth (1-3%)
            |
    Create OwnMyHealth account (0.5-1%)
            |
    Convert to premium (0.1-0.3%)
```

**The math (hypothetical):**
- 10,000 monthly VerifyMyProvider visitors
- 500-1,000 verifications submitted
- 100-300 click through to OwnMyHealth
- 50-100 create accounts
- 10-30 convert to premium ($10/month)
- Revenue: $100-$300/month from cross-product conversion
- **Key insight:** VerifyMyProvider acquisition cost = $0 (organic SEO), vs $20-50 per OwnMyHealth user via direct marketing

---

## Data Synergy

**VerifyMyProvider -> OwnMyHealth:**
- Verified provider acceptance status (no PHI)
- Provider search results (public NPI data)
- Confidence scores for provider-plan pairs
- **NO PHI crosses this boundary**

**OwnMyHealth -> VerifyMyProvider:**
- Verification submissions (users verify their own providers)
- Aggregate usage patterns (which plans are most searched)
- **NO PHI crosses this boundary**

**Shared but independent:**
- Provider NPI data (public, from CMS NPPES)
- Insurance plan reference data (public, from CMS Plan Finder)
- Both products can independently pull from the same public data sources

---

## Technical Integration

### Separate but connected:

```
    +------------------+         +------------------+
    | VerifyMyProvider  |         |   OwnMyHealth    |
    |                   |         |                  |
    | Frontend (Next.js)|         | Frontend (TBD)   |
    | Backend (Express) |   API   | Backend (TBD)    |
    | DB (PostgreSQL)   |<------->| DB (PostgreSQL)  |
    |                   |         |                  |
    | Google Cloud Run  |         | HIPAA-compliant  |
    | No HIPAA needed   |         | infrastructure   |
    +------------------+         +------------------+
```

### Current VerifyMyProvider Architecture (from codebase):
- **Frontend:** Next.js 14.2 deployed on Google Cloud Run
- **Backend:** Express + Prisma + PostgreSQL (Google Cloud SQL)
- **Database:** `verifymyprovider` on Google Cloud SQL PostgreSQL
- **Deployment:** GitHub Actions -> Docker -> Cloud Run (auto-deploy on push to main)
- **Monorepo:** npm workspaces with packages/backend, packages/frontend, packages/shared

### API contract between products (future):

```typescript
// VerifyMyProvider exposes public API for OwnMyHealth:
GET /api/v1/providers/search?state=NY&city=New+York&specialty=Cardiology
GET /api/v1/providers/:npi
GET /api/v1/verify/:npi/:planId

// OwnMyHealth could submit verifications via:
POST /api/v1/verify
  { npi, planId, acceptsInsurance, captchaToken }
```

### User experience integration:

**On VerifyMyProvider (current frontend):**
- Post-verification success screen could show OwnMyHealth CTA
- Footer link to OwnMyHealth
- "Track your health records" banner on provider detail pages

**On OwnMyHealth (future):**
- "Find a doctor" button deep-links to VerifyMyProvider search
- Embedded provider search widget
- Pre-filled plan information from user profile

---

## Why This Strategy Works

1. **Separate Risk Profiles**
   VerifyMyProvider handles only public NPI data - no HIPAA, no PHI, no regulated data. A security incident is embarrassing but not legally catastrophic. OwnMyHealth's HIPAA risk is fully isolated.

2. **Separate Acquisition Channels**
   VerifyMyProvider grows via SEO (people searching "does my doctor accept my insurance"). OwnMyHealth grows via VerifyMyProvider conversion + direct health-conscious user marketing. Different channels, different costs.

3. **Separate Exit Options**
   VerifyMyProvider could be acquired by a health tech company wanting crowdsourced directory data. OwnMyHealth could be acquired by a health records company. Together they command a premium. Separately they still have value.

4. **Separate Development Timelines**
   VerifyMyProvider is near beta-ready (API deployed, frontend live, security hardened). OwnMyHealth can be developed in parallel without blocking VerifyMyProvider's launch.

5. **Portfolio Diversification**
   If the crowdsourced verification model doesn't achieve traction, OwnMyHealth still has independent value. If OwnMyHealth's HIPAA compliance takes longer than expected, VerifyMyProvider still generates traffic and data.

---

## Holding Company Structure

### Legal Organization (Recommended)

```
    +---------------------------+
    |     [Holding Company]     |
    |     Parent LLC            |
    +---------------------------+
                |
    +-----------+-----------+
    |                       |
    +-------------+  +-----+-------+
    | VMP LLC     |  | OMH LLC     |
    | (Operating) |  | (Operating) |
    +-------------+  +-------------+
```

- Separate LLCs for liability isolation
- Holding company owns both
- Shared services (founder, infrastructure) billed via inter-company agreements

### Exit Scenarios

**Scenario A: Sell VerifyMyProvider alone**
- Buyer: Health tech company wanting crowdsourced provider directory data
- Value drivers: NPI database, verification data moat, SEO traffic
- OwnMyHealth continues independently

**Scenario B: Sell OwnMyHealth alone**
- Buyer: EHR/PHR company wanting personal health records platform
- Value drivers: HIPAA-compliant platform, user base
- VerifyMyProvider continues independently

**Scenario C: Sell both together**
- Buyer: Large health tech company wanting end-to-end patient platform
- Value drivers: Full patient journey from finding provider to managing records
- Premium valuation for integrated ecosystem

**Scenario D: Keep both as portfolio**
- Build each to profitability independently
- Maximize cross-product synergies over time
- Reinvest revenue from one into the other

---

## Ecosystem Success Metrics

**Cross-Product Engagement:**
- Conversion rate from VerifyMyProvider to OwnMyHealth signups
- Verification submissions from OwnMyHealth users
- Average sessions per user across both products

**Product Health:**
- VerifyMyProvider: Monthly active users, verifications submitted, search queries, SEO rankings
- OwnMyHealth: Registered users, premium conversion rate, records stored
- Combined: Total ecosystem users, cross-product users, LTV by user type

---

## Current Status

- **VerifyMyProvider:** Near beta-ready. Backend API deployed to Cloud Run. Frontend live. Security hardened (rate limiting, CAPTCHA, Sybil prevention). ~2.1M providers across 6 states imported.
- **OwnMyHealth:** Not yet started. Conceptual stage.
- **Integration Status:** No integration exists yet. Products are fully independent.
- **Next Steps:**
  1. Launch VerifyMyProvider beta
  2. Build initial traffic and verification data
  3. Begin OwnMyHealth development
  4. Add cross-product CTAs once both are live
