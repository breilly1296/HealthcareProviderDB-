# VerifyMyProvider Strategy

**Last Updated:** 2026-02-06
**Phase:** Pre-Beta (Building)
**Status:** Active Development -- Core platform functional, data import in progress

## Executive Summary

VerifyMyProvider addresses the "ghost network" problem in healthcare -- the widespread phenomenon where provider directories maintained by insurance companies contain inaccurate, outdated information. Research shows approximately 50% of provider directory listings are inaccurate, leading patients to waste time calling offices that don't accept their insurance, no longer practice at listed addresses, or aren't accepting new patients.

The solution combines official NPI registry data from CMS with community-driven verification (crowdsourcing) to build a transparent, trust-scored provider directory. Unlike competitors who rely solely on automated data aggregation, VerifyMyProvider openly displays confidence scores that communicate exactly how reliable each piece of information is, based on research-validated scoring algorithms.

VerifyMyProvider is part of the OwnMyHealth ecosystem, designed as a standalone product that feeds into and complements the broader patient empowerment platform. It deliberately avoids handling any Protected Health Information (PHI), operating exclusively with publicly available data, which eliminates HIPAA compliance requirements and enables significantly faster iteration.

---

## Mission Statement

Empower patients to find healthcare providers who actually accept their insurance by combining authoritative CMS data with community verification, transparently showing the confidence level of every claim so patients can make informed decisions about their care.

---

## Core Principles

1. **Transparency over false precision** -- Show confidence scores openly. Admit uncertainty rather than present unverified data as fact. Research shows 3 crowdsourced verifications achieve expert-level accuracy (kappa=0.58, Mortensen et al. 2015).
2. **Crowdsource as competitive moat** -- Every patient verification makes the data better for the next patient. This flywheel effect creates defensibility that aggregation-only competitors cannot replicate.
3. **No PHI / No HIPAA** -- Operate exclusively with public data (NPI registry, insurance plan directories). This enables 3x faster development velocity compared to HIPAA-regulated products.
4. **Community first** -- Launch in niche communities where trust and word-of-mouth are strongest, then expand.

---

## Product Strategy

### The Problem
Insurance provider directories (required by CMS) are approximately 50% inaccurate. This "ghost network" problem means patients routinely encounter:
- Providers listed as in-network who don't actually accept that insurance
- Outdated addresses, phone numbers, and specialties
- Providers no longer accepting new patients
- Research shows 12% annual provider turnover in networks (Ndumele et al. 2018, Health Affairs)
- Mental health providers are worst affected -- only 43% accept Medicaid

### The Solution
1. **NPI Foundation:** Import the full CMS NPPES database (~9.2M providers) as the searchable base layer
2. **On-Demand FHIR:** Enrich individual provider records via FHIR APIs and NPI Registry API (planned)
3. **Crowdsourced Verification:** Patients submit binary verifications ("Does this provider accept this plan?") with transparent confidence scoring
4. **Insurance Card Upload:** Claude AI-powered insurance card OCR to auto-identify plan details

### The Differentiator
Competitors like Ribbon Health ($59M raised) aggregate data but achieve only ~48% accuracy. VerifyMyProvider's transparent confidence scoring combined with crowdsourced verification creates a fundamentally different value proposition: patients know exactly how much to trust the data, and every verification improves accuracy for the next person.

### Ecosystem Position
VerifyMyProvider is positioned as:
- A standalone product accessible at verifymyprovider.com
- Part of the OwnMyHealth ecosystem (linked in footer, shared brand values)
- A potential acquisition funnel for OwnMyHealth's broader health management platform
- Not integrated into OwnMyHealth directly (separate codebase, separate deployment)

---

## Target Market

### Phase 1: Niche (Months 0-12)
- **Who:** Osteoporosis patients and chronic disease communities
- **Where:** Miami / South Florida (FL is the first and most complete imported state with 614k providers)
- **Why:** Tight-knit Reddit/Facebook communities (r/osteoporosis), high medical utilization, strong word-of-mouth potential, personal connection to the problem

### Phase 2: Regional (Months 12-24)
- **Who:** Expand to all specialties, with emphasis on mental health (highest ghost network rates)
- **Where:** Top 5 metros (NYC, LA, Chicago, Houston, Phoenix -- city normalization scripts already built)

### Phase 3: National (24+ months)
- **Who:** All specialties, all patients
- **Where:** All 50 states (requires completing NPI import + building verification volume)

---

## Business Model

### Pricing Tiers
| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Search providers, view community verifications, basic confidence scores |
| Pro | $4.99/mo | Insurance card OCR upload, detailed confidence breakdown, historical verification tracking, priority search |
| B2B API | $500-5k/mo | API access to verification data, bulk provider lookups, network accuracy audits |

### Unit Economics
- **Infrastructure cost per user:** Low -- Cloud Run scale-to-zero, PostgreSQL on Cloud SQL, minimal API costs
- **Key cost drivers:** Cloud SQL (fixed), Cloud Run (per-request), Anthropic API (insurance card OCR)
- **Revenue model:** Freemium B2C + B2B API licensing
- **Break-even:** Depends on Pro conversion rate; target 5-10% of free users converting

### Customer Acquisition Strategy
- Reddit communities (r/osteoporosis, r/healthinsurance, r/chronicpain)
- Facebook patient support groups
- SEO for "[specialty] accepts [insurance plan] [city]" long-tail keywords
- OwnMyHealth cross-promotion

---

## Competitive Analysis

### Ribbon Health
- **Strengths:** $59M funding, enterprise relationships, broad data aggregation
- **Weaknesses:** ~48% accuracy (per their own admissions), B2B only (no consumer product), no crowdsource feedback loop
- **Our Advantage:** Transparent confidence scoring, crowdsource verification moat, consumer-facing product, specialty-specific freshness thresholds based on research

### Other Competitors
- **Zocdoc:** Appointment booking focus, limited insurance verification depth
- **Healthgrades / Vitals:** Provider reviews, not insurance verification
- **Insurance company directories:** The source of the problem (50% inaccuracy)

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025 | GCP over AWS/Azure | Team familiarity, Cloud Run simplicity, Cloud SQL managed Postgres |
| 2025 | On-demand FHIR vs bulk import | Bulk FHIR is impractical at scale; on-demand enrichment is more targeted |
| 2025 | Separate from OwnMyHealth | No PHI = no HIPAA = 3x faster development; separate product can stand alone |
| 2025 | Crowdsource verification | Creates defensive moat; research shows 3 verifications = expert accuracy |
| 2025 | No HIPAA required | Only public data (NPI, plan directories, crowdsourced verifications) |
| Jan 2026 | Specialty-specific freshness thresholds | Research shows mental health has 43% acceptance vs primary care 88% |
| Jan 2026 | 4-factor confidence scoring | Source (25), recency (30), verification count (25), agreement (20) |
| Jan 2026 | Scale-to-zero deployment | Cost control during pre-revenue phase |

---

## Milestones

### Q1 2026
- [x] Security hardening (rate limiting, CAPTCHA, honeypot, Sybil prevention)
- [x] Confidence scoring algorithm (research-based, 4-factor)
- [x] Docker containerization + CI/CD pipeline
- [x] Insurance plan import pipeline
- [x] Insurance card OCR upload (Claude AI)
- [x] PostHog analytics integration
- [x] Provider comparison feature
- [x] Dark/light theme
- [ ] Complete NPI import for all 50 states
- [ ] Beta launch to r/osteoporosis
- [ ] 50 users, 100 verifications

### Q2 2026
- [ ] Complete data cleanup (city normalization across all states)
- [ ] FHIR API integration for provider detail enrichment
- [ ] Monthly NPI delta update automation
- [ ] B2B API documentation and access portal
- [ ] 200 users, 500 verifications

### Q3 2026
- [ ] Expand to 5 metro areas
- [ ] Mental health specialty focus (highest need)
- [ ] Pro tier launch ($4.99/mo)
- [ ] 500 users, 2k verifications

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cold start problem (no verifications) | High | Critical | Manual seeding in Miami, niche community launch, geographic focus |
| Verification spam / manipulation | High | High | 4-layer Sybil prevention (rate limiting, CAPTCHA, IP/email dedup, 30-day windows), honeypot fields |
| Competitor with more resources copies approach | Medium | High | Build verification volume first (data moat), specialty-specific algorithms |
| Insurance companies block FHIR APIs | Medium | Medium | NPI bulk data as fallback, carrier scraping capabilities exist |
| Data quality erodes user trust | Medium | High | Transparent confidence scores, "always call to confirm" messaging, expiration TTLs |
| Cloud SQL costs scale faster than revenue | Low | Medium | Scale-to-zero Cloud Run, query optimization, caching layer |

---

## Crowdsource Strategy

### Cold Start Solution
1. **Geographic focus:** Miami/South Florida first (FL has 614k providers already imported)
2. **Niche community:** r/osteoporosis and related Facebook groups
3. **Manual seeding:** Developer/team personally verify a core set of providers in target specialties
4. **Transparency:** Show "0 verifications" honestly rather than hiding lack of data

### Verification Incentives
- **Altruism messaging:** "Your verification helped 3 people find care this week"
- **Gamification potential:** Verification badges, leaderboards (future)
- **Premium features for contributors:** Possible Pro tier discount for active verifiers (future)
- **Simple binary questions:** Research shows simple yes/no questions achieve highest accuracy

### Spam Prevention (Implemented)
1. **Rate limiting:** 10 verifications/hour, 10 votes/hour per IP (sliding window, Redis or in-memory)
2. **Google reCAPTCHA v3:** Score-based bot detection with fail-open fallback rate limiting
3. **Honeypot fields:** Hidden "website" field that bots auto-fill, returning fake 200 OK to not alert them
4. **Sybil attack prevention:** IP-based and email-based deduplication within 30-day windows
5. **Vote deduplication:** Unique constraint on (verificationId, sourceIp) prevents duplicate votes
6. **Consensus threshold:** Requires 3+ verifications AND 2:1 majority ratio AND confidence >= 60 before changing acceptance status

---

## Strategic Reminders

1. **Move fast:** No HIPAA = 3x faster than OwnMyHealth
2. **Transparency:** Admit uncertainty, show confidence scores with research citations
3. **Community first:** Reddit, Facebook groups, word-of-mouth
4. **Data quality:** One good verification worth 10 FHIR records
5. **Ecosystem play:** Feed OwnMyHealth, but stand alone

---

## Success Criteria

**Proof of Concept (3 months):**
- 50 users, 100 verifications, useful for Miami osteoporosis patients

**One-City Utility (12 months):**
- 500 users, 2k verifications, useful for all Miami specialties

**Regional Scale (24 months):**
- 5k users, 15k verifications, 5 cities, profitable
