# VerifyMyProvider Strategy

**Last Updated:** 2026-02-18
**Phase:** Pre-Launch (Building)
**Status:** Building toward Q2 2026 NYC launch

## Executive Summary

Provider directories are approximately 50% inaccurate -- a problem known as the "ghost network" crisis. Patients search for in-network providers only to discover that the listed provider has moved, retired, or no longer accepts their insurance. This wastes time, delays care, and erodes trust in the healthcare system.

VerifyMyProvider solves this by combining authoritative data sources (NPPES, CMS, carrier data) with crowdsourced patient verifications to produce transparent confidence scores. Unlike incumbent solutions like Ribbon Health (which raised $59M yet achieves only ~48% accuracy), VerifyMyProvider treats accuracy as a community-driven, continuously improving metric rather than a static data snapshot.

The platform is designed as a consumer-first B2C product (with future B2B API potential) that can stand alone as a utility while also serving as a complementary product to OwnMyHealth. By launching in NYC (5 boroughs, ~50-75K providers) and focusing on tight patient communities, VerifyMyProvider aims to solve the cold start problem and build a defensible crowdsource moat.

---

## Mission Statement

To give every patient confidence that the provider they find online actually accepts their insurance, is still at that address, and is taking new patients -- by combining authoritative data with community verification and presenting it with full transparency.

---

## Core Principles

1. **Transparency over perfection** -- Show confidence scores with full factor breakdowns rather than hiding uncertainty. Patients deserve to know how reliable the data is.
2. **Crowdsource as competitive moat** -- Every patient verification makes the data better, creating a network effect that competitors cannot replicate by throwing money at the problem.
3. **No PHI / No HIPAA** -- All data is publicly available (NPI registry, insurance directories, patient-reported verification of public facts). This enables 3x faster development velocity.
4. **Community first** -- Trust is built through niche communities (r/osteoporosis, patient advocacy groups), not top-down marketing.
5. **Data quality over quantity** -- One verified, high-confidence record is worth more than 10 unverified FHIR imports.

---

## Product Strategy

### The Problem

The "ghost network" problem affects approximately half of all provider directory entries. Insurance companies list providers who have moved, retired, stopped accepting the plan, or are not accepting new patients. Studies show:
- 12% annual provider turnover in primary care (Ndumele et al. 2018, Health Affairs)
- Only 43% of listed mental health providers accept Medicaid
- Existing directory accuracy solutions have failed to solve the problem despite significant funding

### The Solution

VerifyMyProvider combines three data layers:
1. **Authoritative data** -- NPI Registry (NPPES), CMS provider data, carrier network files
2. **Enrichment pipeline** -- Hospital affiliation data, practice location geocoding, URL verification across health systems (Mount Sinai, NYU Langone, NYP, MSK, Northwell, etc.)
3. **Crowdsourced verification** -- Patients report whether providers actually accept their insurance, creating a continuously improving confidence score with research-backed accuracy (3 verifications achieve expert-level accuracy, kappa=0.58 per Mortensen et al. 2015)

### The Differentiator

| Factor | Ribbon Health | VerifyMyProvider |
|--------|--------------|------------------|
| Accuracy model | Static data aggregation | Dynamic crowdsource + authoritative |
| Transparency | Black box | Open confidence scores with factor breakdowns |
| Freshness | Periodic bulk updates | Continuous community verification |
| Focus | B2B API | Consumer-first (B2C with B2B API later) |
| Funding | $59M raised | Bootstrap / lean |
| Specialty awareness | Generic decay | Research-based specialty-specific freshness (30-90 day thresholds) |

### Ecosystem Position

VerifyMyProvider is designed as a **companion product to OwnMyHealth** that can also stand alone:
- **Standalone value**: Any patient can search and verify providers
- **OwnMyHealth integration**: Verified provider data feeds into OwnMyHealth's care coordination
- **Acquisition funnel**: Free provider search drives awareness of OwnMyHealth's premium health management tools

---

## Target Market

### Phase 1: NYC Launch (Q2 2026)
- **Who:** All patients needing provider verification in New York City
- **Where:** NYC (5 boroughs -- Manhattan, Brooklyn, Queens, Bronx, Staten Island)
- **Why:** Dense provider market (~50-75K providers), high demand, tight patient communities, diverse insurance landscape
- **Initial outreach:** r/osteoporosis and related patient advocacy communities
- **Data readiness:** NPI data filtered to NYC zip codes, 15 specialties enriched with practice URLs and hospital affiliations, 2,552 practices re-verified

### Phase 2: Tri-State Expansion (Months 12-24)
- **Who:** Expand to surrounding metro areas
- **Where:** NJ, CT, Long Island, Westchester
- **Why:** Natural geographic expansion following NYC density

### Phase 3: National (24+ months)
- **Who:** All specialties, all patients
- **Where:** Top 20 US metros
- **Why:** Proven model scales with crowdsource network effects

---

## Business Model

### Pricing Tiers

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Provider search, view confidence scores, submit verifications, insurance card scanning, saved providers |
| Pro | $4.99/mo | Priority search results, verification history, alerts when saved providers change status, advanced filtering, export capability |
| B2B API | $500-5,000/mo | Programmatic access to provider verification data, webhook notifications, bulk queries, SLA guarantees |

### Unit Economics

- **Cost per user:** ~$0.05-0.10/month (Cloud Run scale-to-zero, minimal infrastructure at early stage)
- **Revenue per Pro user:** $4.99/month
- **Margin target:** 85%+ at scale (infrastructure costs scale sub-linearly with users)
- **Break-even volume:** ~200 Pro subscribers ($998/month) covers estimated $150/month infrastructure

### Revenue Projections

| Quarter | Free Users | Pro Users | B2B Clients | Monthly Revenue |
|---------|-----------|-----------|-------------|-----------------|
| Q2 2026 | 50 | 0 | 0 | $0 |
| Q3 2026 | 200 | 10 | 0 | $50 |
| Q4 2026 | 500 | 50 | 0 | $250 |
| Q1 2027 | 1,000 | 100 | 1 | $1,000 |
| Q2 2027 | 2,000 | 200 | 2 | $2,000 |

---

## Competitive Analysis

### Ribbon Health
- **Strengths:** $59M in funding, established B2B relationships, large data partnerships
- **Weaknesses:** ~48% accuracy despite massive investment, opaque scoring, no consumer product, no crowdsource loop
- **Our Advantage:** Transparency (show confidence scores), crowdsource moat (data improves with usage), consumer focus (patients can verify directly), research-backed specialty-specific scoring

### Other Competitors
- **Kyruus** -- Provider search for health systems (B2B only, not consumer-facing)
- **Zocdoc** -- Appointment booking (different value proposition, not focused on insurance verification)
- **Insurance company directories** -- Source of the ghost network problem itself
- **Google Health** -- Broad health search, not focused on insurance acceptance verification

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025 | GCP over AWS | Alignment with OwnMyHealth infrastructure; Cloud Run scale-to-zero for cost efficiency |
| 2025 | Separate from OwnMyHealth | Faster iteration without HIPAA constraints; standalone value proposition |
| 2025 | No HIPAA required | All data is public (NPI, insurance acceptance, addresses); no PHI collected |
| 2025 | On-demand FHIR over bulk import | Bulk FHIR import created stale data problems; on-demand verification is fresher |
| 2026-01 | Crowdsource verification model | Creates competitive moat; research shows 3 verifications achieve expert accuracy |
| 2026-01 | NYC geographic focus | Dense market for cold start; testable in single metro before expansion |
| 2026-01 | Specialty-specific freshness thresholds | Research shows mental health providers churn faster (30-day threshold) vs hospital-based (90-day) |
| 2026-02 | Enrichment protection system | Prevents NPI re-imports from overwriting manually enriched data (URLs, confidence scores, geocoding) |

---

## Milestones

### Q1 2026 (Current)
- [x] Rate limiting and CAPTCHA security hardening
- [x] Sybil attack prevention (4 layers)
- [x] Insurance card scanning with Claude AI
- [x] Docker containerization and CI/CD
- [x] Practice location enrichment (15 specialties, 2,552 practices)
- [x] Enrichment protection system (data_source, import_conflicts)
- [x] User authentication (magic link)
- [x] Saved providers feature
- [x] Provider map view
- [ ] Beta launch to r/osteoporosis

### Q2 2026
- [ ] NYC provider data import (filtered to 5-borough zip codes)
- [ ] Public beta launch
- [ ] 50 users, 100 verifications target
- [ ] Community engagement (Reddit, Facebook groups)
- [ ] Performance monitoring and alerting

### Q3 2026
- [ ] Pro tier launch ($4.99/month)
- [ ] 200 users, 500 verifications target
- [ ] SEO optimization for provider search
- [ ] Mobile responsiveness improvements
- [ ] Provider claim/update workflow

### Q4 2026
- [ ] B2B API beta
- [ ] Tri-state data expansion (NJ, CT)
- [ ] 500 users target
- [ ] FHIR integration for real-time carrier data

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cold start problem (no verifications) | High | Critical | NYC geographic focus, manual seeding, niche community first (r/osteoporosis), pre-populated with authoritative data |
| Verification spam / Sybil attacks | High | High | 4-layer defense: IP rate limiting (10/hr), reCAPTCHA v3, vote deduplication (1 per IP), 30-day submission windows |
| Competitor with more resources | Medium | High | Crowdsource moat deepens over time; transparency builds trust that money cannot buy |
| Insurance companies block FHIR APIs | Low | Medium | Multiple data sources (NPPES, CMS, crowdsource); not dependent on any single carrier |
| Bad data ruins crowdsource quality | Medium | High | Confidence scoring penalizes conflicting data; 3-verification threshold for HIGH confidence; anomaly detection planned |
| NPI data quality issues | Medium | Medium | Data quality audit system in place; cleanup scripts for city name typos; import conflict resolution workflow |
| Cloud Run cost spikes | Low | Medium | Scale-to-zero configuration; budget alerts; per-service max instances (10 production, 2 staging) |

---

## Crowdsource Strategy

### Cold Start Solution
1. **Geographic focus** -- NYC only at launch, concentrating verification density
2. **Niche community first** -- Launch in r/osteoporosis and related Facebook groups where patients actively seek specialist referrals
3. **Pre-populated data** -- NPI, CMS, and carrier data provide baseline; 15 specialties already enriched with practice URLs and hospital affiliations
4. **Manual seeding** -- Team verifies initial batch of high-traffic providers to demonstrate value
5. **Confidence transparency** -- Even without verifications, show "UNVERIFIED" status honestly to build trust

### Verification Incentives
1. **Altruism / impact tracking** -- "Your verification helped 3 patients find in-network care this week"
2. **Gamification** -- Verification streaks, community contributor badges, leaderboard
3. **Premium features for contributors** -- Pro tier features unlocked for active verifiers
4. **Social proof** -- Highlight recent community verifications on the homepage

### Spam Prevention
1. **Rate limiting** -- 10 verifications per hour per IP (sliding window)
2. **reCAPTCHA v3** -- Score-based bot detection (minimum score 0.5)
3. **Honeypot fields** -- Hidden form fields that bots auto-populate
4. **Vote deduplication** -- One vote per IP per verification (unique constraint in database)
5. **30-day submission windows** -- Same provider-plan pair from same IP/email limited to 30-day intervals
6. **Confidence scoring penalization** -- Conflicting votes reduce confidence score, not increase it

---

## Strategic Reminders

1. **Move fast:** No HIPAA = 3x faster development than OwnMyHealth
2. **Transparency:** Admit uncertainty, show confidence scores with full factor breakdowns
3. **Community first:** Reddit, Facebook groups, word-of-mouth over paid advertising
4. **Data quality:** One good verification worth 10 FHIR records
5. **Ecosystem play:** Feed OwnMyHealth, but stand alone as independently useful
6. **Research-backed:** Every confidence scoring decision cites published research
7. **Privacy-preserving:** PII-free logging, PostHog analytics, no user tracking beyond what is necessary

---

## Success Criteria

**Proof of Concept (Q2 2026 Launch):**
- 50 users, 100 verifications, useful for NYC provider search
- System handles real traffic without rate-limiting false positives
- At least 10 providers reach HIGH confidence (3+ verifications)

**One-City Utility (12 months):**
- 500 users, 2,000 verifications, useful for all NYC specialties
- Pro tier generating revenue ($250+/month)
- Measurably more accurate than competing directories for NYC providers

**Regional Scale (24 months):**
- 5,000 users, 15,000 verifications, tri-state area covered
- B2B API in production with 1+ paying client
- Profitable ($5,000+/month revenue vs $500/month infrastructure)
