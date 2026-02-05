# VerifyMyProvider + OwnMyHealth Ecosystem

**Last Updated:** 2026-02-05
**Generated From:** prompts/22-ecosystem-integration.md

---

## The Portfolio Model

```
                    +--------------------------+
                    |     Holding Company /     |
                    |     Parent Entity         |
                    +-----------+--------------+
                                |
              +-----------------+------------------+
              |                                    |
   +----------+----------+          +--------------+----------+
   |  VerifyMyProvider    |          |    OwnMyHealth          |
   |  (Public Directory)  |          |    (Health Management)  |
   +----------+----------+          +--------------+----------+
              |                                    |
   +----------+----------+          +--------------+----------+
   | - Provider search    |          | - Personal health data  |
   | - Insurance verify   |          | - Care coordination     |
   | - Crowdsource data   |          | - Health records mgmt   |
   | - Public, no login   |          | - Premium features      |
   +---------------------+          +-------------------------+
```

---

## Why Partner Products (Not One Platform)

### Different Compliance Requirements

| Dimension | VerifyMyProvider | OwnMyHealth |
|-----------|-----------------|-------------|
| **Data Type** | Public provider data (NPI, specialties, insurance acceptance) | Personal health information (PHI) |
| **HIPAA Required** | No - all data is public or crowdsourced | Yes - handles patient health data |
| **User Accounts** | Not required (anonymous use) | Required (authenticated, identity-verified) |
| **Data Sensitivity** | Low - publicly available NPI registry data | High - protected health information |
| **Regulatory Burden** | Minimal | HIPAA BAA, encryption at rest, audit trails |
| **Development Speed** | Fast - no compliance overhead | Slower - compliance gates on every feature |
| **Liability Profile** | Low - aggregator of public data | High - custodian of health data |
| **Launch Timeline** | Pre-beta (current) | Future phase |

### Benefits of Separation

1. **Risk Isolation:** A security incident in VerifyMyProvider does not expose PHI, because no PHI exists in the system. A vulnerability in OwnMyHealth's compliance posture does not affect VerifyMyProvider's ability to operate.

2. **Development Velocity:** VerifyMyProvider can ship features rapidly without HIPAA compliance review gates. Each feature does not require a privacy impact assessment or BAA review.

3. **Cost Efficiency:** HIPAA-compliant infrastructure (encrypted databases, audit logging, breach notification procedures) is only needed for OwnMyHealth, not for the entire portfolio.

4. **Exit Optionality:** Either product can be sold independently, merged, or sunset without affecting the other.

---

## Symbiotic User Acquisition

### User Journey: Casual User ("Your Sister")

```
Google Search: "does Dr. Smith accept my insurance?"
         |
         v
+--VerifyMyProvider--+
| Search for doctor  |
| See: accepts Blue  |
| Cross, 85% conf.  |
+--------+-----------+
         |
         v
  Books appointment
         |
         v
+--VerifyMyProvider--+
| (Post-visit)       |
| Submits            |
| verification:      |
| "Yes, accepted!"   |
+--------------------+

  [Journey ends here for casual user]
```

**Value to ecosystem:**
- Contributes verification data (crowdsource moat)
- Free organic traffic via SEO
- Top-of-funnel awareness for OwnMyHealth
- Zero customer acquisition cost for data contribution

### User Journey: Power User ("You")

```
+--VerifyMyProvider--+       +--OwnMyHealth---------+
| Search providers   | ----> | Manage health records |
| by insurance plan  |       | Track appointments    |
| Verify acceptance  |       | Coordinate care       |
| Track network      |       | Insurance management  |
| changes            |       | Premium features      |
+--------------------+       +-----------------------+
        |                             |
        +-------- Bidirectional ------+
        |  Provider data flows to     |
        |  OwnMyHealth for context    |
        |  Health context enriches    |
        |  VerifyMyProvider searches  |
        +-----------------------------+
```

**Value to ecosystem:**
- Higher engagement across both products
- Premium subscription revenue (OwnMyHealth)
- Deeper verification data (verified from actual visits)
- Multiple touchpoints increase retention

---

## The Conversion Funnel

```
  +------------------------------------+
  |  VerifyMyProvider Visitors (100%)   |  <-- SEO, word of mouth
  +------------------------------------+
                  |
                  v
  +------------------------------------+
  |  Perform a Search (60%)            |  <-- Active engagement
  +------------------------------------+
                  |
                  v
  +------------------------------------+
  |  Submit a Verification (5-10%)     |  <-- Data contributors
  +------------------------------------+
                  |
                  v
  +------------------------------------+
  |  See OwnMyHealth CTA (100% of     |  <-- Post-verification upsell
  |  verifiers, footer for all)        |
  +------------------------------------+
                  |
                  v
  +------------------------------------+
  |  Click through to OwnMyHealth (2%) |  <-- Cross-product conversion
  +------------------------------------+
                  |
                  v
  +------------------------------------+
  |  OwnMyHealth Signup (0.5-1%)       |  <-- Premium conversion
  +------------------------------------+
```

**The math (illustrative targets):**
- 100,000 monthly VerifyMyProvider visitors
- 60,000 perform searches
- 5,000-10,000 submit verifications
- 2,000 see and engage with OwnMyHealth CTA
- 500-1,000 sign up for OwnMyHealth
- Cost to acquire via VerifyMyProvider: near $0 (organic)
- Cost to acquire OwnMyHealth user directly: $15-50 (paid marketing)

---

## Data Synergy

### VerifyMyProvider --> OwnMyHealth

- **Provider directory data:** OwnMyHealth users can look up providers directly within the health management interface without leaving the platform
- **Insurance acceptance status:** Pre-verified acceptance data helps OwnMyHealth users find in-network providers
- **Confidence scores:** OwnMyHealth can surface data freshness to help users decide whether to call ahead
- **No PHI crosses this boundary:** Only public provider and insurance data flows from VMP to OMH

### OwnMyHealth --> VerifyMyProvider

- **Verified visit data:** When an OwnMyHealth user completes a visit, they can contribute a high-confidence verification back to VerifyMyProvider (data source: `PROVIDER_PORTAL`, score: 20/25)
- **Insurance plan context:** OwnMyHealth knows the user's actual plan, so verifications submitted from OMH include precise plan matching
- **No PHI crosses this boundary:** Only the verification submission (provider NPI, plan ID, accepts Y/N) flows back

### Shared but Independent

- **Separate databases:** No shared database access. API calls only.
- **Separate deployments:** Independent scaling, independent uptime
- **Separate user bases:** VerifyMyProvider has no user accounts; OwnMyHealth requires authentication
- **No PHI in the boundary:** The API contract between products carries only public provider data and anonymous verification submissions

---

## Technical Integration

### Separate but Connected

```
+-- Google Cloud ------------------------------------------+
|                                                          |
|  +--Cloud Run-----------+   +--Cloud Run-----------+    |
|  | VerifyMyProvider API  |   | OwnMyHealth API      |    |
|  | (Express + Prisma)   |   | (TBD stack)          |    |
|  +--------+-------------+   +--------+-------------+    |
|           |                          |                   |
|  +--------v-------------+   +--------v-------------+    |
|  | Cloud SQL PostgreSQL  |   | Cloud SQL PostgreSQL  |    |
|  | verifymyprovider DB   |   | ownmyhealth DB       |    |
|  | (public data only)    |   | (HIPAA-compliant)    |    |
|  +-----------------------+   +-----------------------+    |
|                                                          |
|  +--Cloud Run-----------+                                |
|  | VerifyMyProvider      |                               |
|  | Frontend (Next.js)    |                               |
|  +-----------------------+                               |
+----------------------------------------------------------+

 API Contract (REST):
   OMH --> VMP: GET /api/v1/providers/search?...
   OMH --> VMP: GET /api/v1/providers/:npi/plans
   OMH --> VMP: POST /api/v1/verify (with auth token)
```

### API Contract Between Products

```typescript
// OwnMyHealth fetching provider data from VerifyMyProvider
// No authentication required (public API)
GET /api/v1/providers/search?name=Smith&state=NY&specialty=Cardiology
GET /api/v1/providers/1234567890
GET /api/v1/providers/1234567890/plans

// OwnMyHealth submitting a verification to VerifyMyProvider
// Rate limited + CAPTCHA protected
POST /api/v1/verify
{
  "npi": "1234567890",
  "planId": "12345NY0010001",
  "acceptsInsurance": true,
  "acceptsNewPatients": true,
  "captchaToken": "...",
  "submittedBy": "user@ownmyhealth.com"  // Optional, for dedup
}
```

### User Experience Integration

**On VerifyMyProvider:**
- Footer CTA: "Want to manage your health records? Try OwnMyHealth"
- Post-verification prompt: "Thanks for verifying! Track all your providers in one place with OwnMyHealth"
- Search results sidebar: "Save this provider to your health profile" (links to OwnMyHealth)

**On OwnMyHealth:**
- "Find a doctor" feature powered by VerifyMyProvider API
- Insurance verification status shown inline on provider profiles
- "Verify this provider" button that submits back to VerifyMyProvider
- Deep links to VerifyMyProvider with pre-filled insurance plan from user profile

---

## Why This Strategy Works

1. **Separate Risk Profiles**
   VerifyMyProvider handles only public data with no HIPAA obligations. A security incident is embarrassing but not a regulatory event. OwnMyHealth can take the time to build HIPAA-compliant infrastructure without delaying the VerifyMyProvider launch.

2. **Separate Acquisition Channels**
   VerifyMyProvider grows organically through SEO ("does my doctor accept my insurance?" searches) and word of mouth. OwnMyHealth acquires users through VerifyMyProvider's funnel at near-zero CAC, plus targeted marketing for premium features.

3. **Separate Exit Options**
   VerifyMyProvider could be acquired by a health directory (Zocdoc, Healthgrades) or insurance company. OwnMyHealth could be acquired by a health platform (Apple Health, MyChart). Either product can be sold independently or together.

4. **Separate Development Timelines**
   VerifyMyProvider can ship weekly with fast iteration cycles. OwnMyHealth's development is gated by compliance reviews and privacy assessments, operating on a different (slower) cadence without blocking the other product.

5. **Portfolio Diversification**
   Two products in adjacent markets reduce single-product risk. If one market shifts (e.g., insurance companies build better provider directories), the other product's value proposition remains intact.

---

## Holding Company Structure

### Legal Organization (Recommended)

```
  +-----------------------------+
  |  [Parent LLC / Corp]        |
  |  Holding company            |
  +-------+----------+----------+
          |          |
  +-------v---+  +--v-----------+
  | VMP LLC   |  | OMH LLC      |
  | Operating |  | Operating    |
  | entity    |  | entity       |
  +----------+  | (HIPAA CE)   |
                 +--------------+
```

- Parent entity owns both operating entities
- VMP LLC: Standard operating company, no special compliance
- OMH LLC: HIPAA Covered Entity (or Business Associate), separate insurance, separate liability
- Shared services (billing, HR, cloud accounts) at parent level

### Exit Scenarios

**Scenario A: Sell VerifyMyProvider Only**
- Attractive to health directories, insurance companies, or provider networks
- Value: provider directory + crowdsourced verification data + SEO traffic
- Clean separation from OwnMyHealth since no shared data

**Scenario B: Sell OwnMyHealth Only**
- Attractive to health platforms, EHR vendors, or insurance tech companies
- Value: HIPAA-compliant health management platform + user base
- VerifyMyProvider continues independently as data feed

**Scenario C: Sell Both Together**
- Attractive to larger health tech acquirers who want end-to-end consumer health
- Premium valuation for the integrated ecosystem and data flywheel

**Scenario D: Keep as Portfolio**
- Build both products to profitability
- Cross-subsidize acquisition costs
- Option value preserved for future exit

---

## External Data Sources and Integration Opportunities

### Current Data Sources

| Source | Data | Integration Status |
|--------|------|-------------------|
| CMS NPPES Registry | Provider NPI, name, specialty, address | Imported (6 states, ~2.1M providers) |
| CMS Plan Finder | Insurance plan details, issuer info | Imported |
| Crowdsource (users) | Insurance acceptance verifications | Live |

### Future Integration Opportunities

| Integration | Value | Complexity | Priority |
|-------------|-------|------------|----------|
| **FHIR R4 API** | Standardized provider/insurance data exchange with EHR systems | High | Medium-term |
| **CMS Provider Enrollment API** | Real-time provider enrollment status | Medium | Medium-term |
| **State Medicaid APIs** | Medicaid acceptance data by state | Medium | Medium-term |
| **Insurance Carrier APIs** | Direct carrier network data (Aetna, UHC, etc.) | High (requires partnerships) | Long-term |
| **Zocdoc/Healthgrades** | Appointment availability, patient reviews | Medium (requires partnerships) | Long-term |
| **Google Places API** | Verify provider addresses, hours, phone numbers | Low | Short-term |
| **NPI Registry real-time sync** | Daily/weekly NPPES delta updates | Low | Short-term (partially built) |

### FHIR Integration Strategy

VerifyMyProvider's data model maps well to FHIR R4 resources:

- `Provider` --> `Practitioner` / `Organization`
- `InsurancePlan` --> `InsurancePlan`
- `ProviderPlanAcceptance` --> `PractitionerRole` (with network affiliation)
- `PracticeLocation` --> `Location`

A FHIR facade API could expose VerifyMyProvider data to EHR systems, patient portals, and health information exchanges (HIEs), increasing the product's value in the health IT ecosystem.

---

## Ecosystem Success Metrics

### Cross-Product Engagement
- VMP-to-OMH click-through rate (target: 2-5%)
- VMP-to-OMH signup conversion rate (target: 0.5-1%)
- OMH users who submit VMP verifications (target: 20%+)
- Bidirectional monthly active users (target: growing MoM)

### Product Health
- **VerifyMyProvider:** Monthly searches, verifications submitted, confidence score coverage, SEO ranking
- **OwnMyHealth:** Signups, DAU/MAU ratio, premium conversion, retention at 30/60/90 days
- **Ecosystem:** Combined CAC, cross-product LTV, data completeness improvement rate

---

## Current Status

- **VerifyMyProvider:** Pre-beta. Backend API functional with provider search, insurance plan matching, crowdsourced verification system, rate limiting, and CAPTCHA. Frontend built with Next.js 14.2. Deployed on Google Cloud Run with Cloud SQL PostgreSQL.
- **OwnMyHealth:** Planning phase. No code written. Dependent on VerifyMyProvider establishing a user base and data foundation first.
- **Integration Status:** No cross-product integration yet. VerifyMyProvider operates as a standalone product.
- **Next Steps:**
  1. Launch VerifyMyProvider beta
  2. Establish organic traffic and verification data flywheel
  3. Begin OwnMyHealth architecture and compliance planning
  4. Design cross-product API contract
  5. Implement CTA integration points in VerifyMyProvider UI
