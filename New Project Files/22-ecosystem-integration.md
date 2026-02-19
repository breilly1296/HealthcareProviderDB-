# VerifyMyProvider + OwnMyHealth Ecosystem

**Last Updated:** 2026-02-18

---

## The Portfolio Model

```
                 ┌─────────────────────────────┐
                 │   Holding Company (Future)   │
                 │   (Portfolio Management)     │
                 └──────────┬──────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
    ┌─────────▼──────────┐   ┌───────────▼──────────┐
    │  VerifyMyProvider   │   │     OwnMyHealth      │
    │  (Provider Data)    │   │  (Personal Health)   │
    │                     │   │                      │
    │  - Public data only │   │  - PHI storage       │
    │  - No HIPAA needed  │   │  - HIPAA required    │
    │  - Crowdsourced     │   │  - User accounts     │
    │  - Free tier + ads  │   │  - Premium features  │
    └─────────────────────┘   └──────────────────────┘
```

---

## Why Partner Products (Not One Platform)

### Different Compliance Requirements

| Dimension | VerifyMyProvider | OwnMyHealth |
|-----------|-----------------|-------------|
| Data Type | Public provider data (NPI, addresses, phone) | Personal health records (PHI) |
| HIPAA | Not required -- no PHI stored | Required -- stores patient data |
| Auth Required | Optional (user accounts for bookmarks) | Mandatory (all data is personal) |
| Risk Profile | Low -- public data only | High -- PHI liability |
| Audit Requirements | Standard security practices | HIPAA audit trail, BAAs |
| Development Speed | Fast -- no compliance overhead | Slower -- compliance gates |
| Infrastructure Cost | Lower -- standard hosting | Higher -- HIPAA-compliant hosting |

### Separation Benefits

1. **Risk Isolation:** A data breach at VerifyMyProvider exposes zero PHI. A breach at OwnMyHealth does not affect provider verification data integrity.

2. **Development Velocity:** VerifyMyProvider can ship features rapidly without HIPAA compliance review. Each product has its own release cycle.

3. **Exit Optionality:** Either product can be sold independently. A health system might acquire just the provider verification tool. A health tech startup might acquire just the personal health platform.

4. **Cost Efficiency:** VerifyMyProvider runs on standard infrastructure (Google Cloud Run, standard PostgreSQL). No BAAs, no HIPAA-compliant hosting costs, no compliance officer required.

---

## Symbiotic User Acquisition

### User Journey: Casual User ("Your Sister")

```
1. Searches Google: "does Dr. Smith accept UnitedHealthcare"
       │
       ▼
2. Lands on VerifyMyProvider (SEO/search result)
       │
       ▼
3. Finds provider → sees confidence score → verifies info
       │
       ▼
4. Books appointment → life goes on
       │
       ▼
5. (Optional) Creates account to save providers
       │
       ▼
6. (Optional) Sees CTA: "Track your health records → OwnMyHealth"
```

**Value to ecosystem:**
- Provides verification data (the core crowdsourcing engine)
- Top-of-funnel traffic for OwnMyHealth conversion
- SEO authority through high engagement and repeat visits
- Word-of-mouth referrals ("I found this site that actually tells you if your doctor takes your insurance")

### User Journey: Power User ("You")

```
1. Starts at OwnMyHealth (manages health records)
       │
       ▼
2. Needs a new specialist → clicks "Find a Provider"
       │
       ▼
3. Deep-linked to VerifyMyProvider with plan pre-filled
       │
       ▼
4. Searches → finds provider → verifies → books appointment
       │
       ▼
5. Returns to OwnMyHealth → logs visit → tracks outcomes
       │
       ▼
6. Repeats cycle for family members
```

**Value to ecosystem:**
- Higher engagement (uses both products regularly)
- Premium subscription candidate (OwnMyHealth paid tier)
- Multiple provider interactions per year
- Family account management (multiplied LTV)

---

## The Conversion Funnel

```
VerifyMyProvider Users (100%)
         │
         ▼
Creates Account (15-20%)  ─── Saved providers, bookmarks
         │
         ▼
Scans Insurance Card (5-10%) ─── AI extraction, plan matching
         │
         ▼
Converts to OwnMyHealth (2-5%) ─── Full health record management
         │
         ▼
Premium Subscription (1-2%) ─── Family plans, advanced features
```

**The math (illustrative):**
- 100,000 monthly VerifyMyProvider visitors
- 15,000 create accounts (15%)
- 5,000 scan insurance cards (5%)
- 2,000 convert to OwnMyHealth (2%)
- 1,000 premium subscribers (1%) at $10/month = $10,000 MRR

---

## Data Synergy

**VerifyMyProvider to OwnMyHealth:**
- Provider search results (pre-filtered by user's plan)
- Confidence scores (helps users choose reliable providers)
- Insurance plan metadata (carrier names, plan types)
- No PHI crosses this boundary

**OwnMyHealth to VerifyMyProvider:**
- Verification submissions (authenticated, higher trust)
- Insurance plan context (pre-fills plan selection in verification form)
- Visit outcomes (can inform confidence scores over time)
- No PHI crosses this boundary (only aggregated signals)

**Shared but independent:**
- Provider database (VerifyMyProvider is the source of truth)
- Insurance plan database (shared reference data)
- User accounts (separate auth systems, linked by email if user opts in)

---

## Technical Integration

### Separate but Connected

```
┌──────────────────────┐          ┌──────────────────────┐
│   VerifyMyProvider    │          │      OwnMyHealth     │
│                       │          │                      │
│  Next.js Frontend ────┼── API ──►│  React Frontend     │
│  Express Backend  ◄───┼── API ──┤  Node.js Backend    │
│  PostgreSQL DB        │          │  PostgreSQL DB       │
│  (Cloud SQL)          │          │  (HIPAA-compliant)   │
│                       │          │                      │
│  No PHI stored        │          │  PHI encrypted at    │
│                       │          │  rest + in transit   │
└──────────────────────┘          └──────────────────────┘
         │                                  │
         └──────── Shared API ──────────────┘
              (Provider search, plan lookup)
              (No PHI in shared API calls)
```

### API Contract Between Products (Future)

```typescript
// OwnMyHealth calls VerifyMyProvider API
// Pre-fills search with user's insurance plan

GET /api/v1/providers/search
  ?state=NY
  &city=New+York
  &specialty=Cardiology
  &planId=H3312-001-00  // From user's scanned insurance card

// Returns provider list with confidence scores
// No user data included in request or response
```

### User Experience Integration

**On VerifyMyProvider:**
- Footer CTA: "Manage your health records at OwnMyHealth"
- Post-verification: "Track your provider visits with OwnMyHealth"
- Insurance card scan: "Want to save this card? Create an OwnMyHealth account"
- Account settings: "Link to your OwnMyHealth account"

**On OwnMyHealth:**
- "Find a Provider" button deep-links to VerifyMyProvider search
- Provider search embedded via iframe or API integration
- Plan automatically pre-filled from user's stored insurance card
- Visit logging includes link back to provider's VerifyMyProvider page

---

## Why This Strategy Works

1. **Separate Risk Profiles**
   VerifyMyProvider handles only public NPI data. If there is ever a security incident, zero PHI is at risk. OwnMyHealth can focus its security budget on protecting actual patient data.

2. **Separate Acquisition Channels**
   VerifyMyProvider acquires users through SEO (health insurance queries). OwnMyHealth acquires through healthcare provider referrals and employer partnerships. Different channels reduce concentration risk.

3. **Separate Exit Options**
   A hospital system or insurer might want just the provider verification engine. A health tech company might want just the patient engagement platform. Portfolio structure enables clean M&A.

4. **Separate Development Timelines**
   VerifyMyProvider is launching Q2 2026 (NYC focus). OwnMyHealth can start development later without slowing down the first product. Each product ships when ready.

5. **Portfolio Diversification**
   If the consumer health record market gets crowded, VerifyMyProvider still has standalone value. If provider directories get commoditized, OwnMyHealth differentiates on patient engagement.

---

## Holding Company Structure

### Legal Organization (Recommended)

```
              ┌────────────────────────┐
              │    [Parent LLC]        │
              │  Health Data Holdings  │
              └─────────┬──────────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
  ┌─────────▼──────────┐  ┌────────▼──────────┐
  │ VerifyMyProvider LLC│  │  OwnMyHealth LLC  │
  │ (Product 1)        │  │  (Product 2)      │
  └────────────────────┘  └───────────────────┘
```

### Exit Scenarios

**Scenario A: Sell VerifyMyProvider**
- Target acquirer: Health insurer (want to embed provider verification), health system (want to improve directory accuracy), or data company (want provider intelligence)
- Clean separation: no PHI entanglement
- Estimated timeline: viable after reaching NYC market traction

**Scenario B: Sell OwnMyHealth**
- Target acquirer: Digital health startup (patient engagement), EHR company (consumer-facing layer), or employer benefits platform
- Requires HIPAA compliance documentation
- Longer development timeline

**Scenario C: Sell Both Together**
- Higher valuation as integrated platform
- "Full-stack healthcare consumer experience"
- Best outcome if both products achieve traction

**Scenario D: Keep as Portfolio**
- Cross-sell and upsell between products indefinitely
- Compound growth through ecosystem effects
- Build moat through integrated data network

---

## Ecosystem Success Metrics

**Cross-Product Engagement:**
- Conversion rate: VerifyMyProvider account to OwnMyHealth user
- Cross-product DAU: users active on both products in same week
- Deeplink click-through: "Find a Provider" from OwnMyHealth

**Product Health (VerifyMyProvider):**
- Monthly unique visitors
- Verification submissions per month
- Provider coverage: percentage of NYC providers with 3+ verifications
- Average confidence score across verified providers
- SEO: organic search traffic growth

**Product Health (OwnMyHealth):**
- Registered users
- Monthly active users
- Insurance card scans
- Premium conversion rate
- Retention: 30-day and 90-day

---

## Current Status

- **VerifyMyProvider:** Active development. Backend and frontend deployed to Google Cloud Run. NYC provider data loaded (~50-75K providers). Authentication system complete (magic link login). Insurance card AI scanning implemented. Targeting Q2 2026 beta launch.
- **OwnMyHealth:** Not yet started. VerifyMyProvider must achieve product-market fit first.
- **Integration:** No cross-product integration built yet. VerifyMyProvider accounts and insurance card scanning provide the foundation for future OwnMyHealth conversion.
- **Next Steps:**
  1. Launch VerifyMyProvider beta in NYC (Q2 2026)
  2. Build verification volume to validate crowdsourcing model
  3. Begin OwnMyHealth design/planning (Q3-Q4 2026)
  4. Build cross-product deeplinks and conversion CTAs
