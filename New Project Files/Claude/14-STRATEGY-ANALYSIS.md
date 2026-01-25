# VerifyMyProvider Strategy Analysis

**Last Updated:** January 25, 2026
**Phase:** Pre-Beta
**Validation Status:** Building

---

## Executive Summary

VerifyMyProvider solves the "ghost network" problem - provider directories are ~50% inaccurate. By combining public NPI/FHIR data with crowdsourced verification and transparent confidence scores, the platform provides reliable provider-insurance acceptance information.

---

## Mission Statement

**Make it easy for anyone to verify if a healthcare provider accepts their insurance, with transparent confidence in the data.**

---

## Core Principles

1. **Transparency Over Accuracy** - Show confidence scores, not false certainty
2. **Crowdsource as Competitive Moat** - User verifications compound over time
3. **No PHI / No HIPAA** - Public data only, move fast

---

## The Problem

### Ghost Network Problem
- Provider directories are ~50% inaccurate
- Patients call providers listed as "in-network" only to find they don't accept the insurance
- Competitors like Ribbon Health achieved only 48% accuracy despite $59M funding

### User Pain Points
- Wasted time calling providers
- Surprise bills from out-of-network providers
- Lack of trust in any provider directory

---

## The Solution

### Three-Pillar Approach

1. **Public Data Foundation**
   - NPI Registry (9.2M providers)
   - CMS Plan Finder data
   - FHIR provider directories

2. **Crowdsourced Verification**
   - Users verify acceptance after appointments
   - Upvote/downvote system
   - Build over time (competitive moat)

3. **Transparent Confidence Scores**
   - 0-100 scale
   - Show data freshness
   - Admit uncertainty

---

## The Differentiator

### vs Ribbon Health (48% accuracy, $59M raised)

| Aspect | Ribbon Health | VerifyMyProvider |
|--------|---------------|------------------|
| Approach | B2B data aggregation | Crowdsource + transparency |
| Accuracy | 48% | Unknown (building) |
| Trust Model | Black box | Transparent scores |
| Moat | Data deals | Community verifications |
| Funding | $59M | Bootstrapped |

---

## Target Market

### Phase 1: Niche (Months 0-12)
- **Who:** Osteoporosis patients
- **Where:** Miami, FL
- **Why:** Tight community, word-of-mouth, willing to verify
- **Channel:** r/osteoporosis, Facebook groups

### Phase 2: Regional (Months 12-24)
- **Who:** Expand specialties
- **Where:** Top 5 Florida cities
- **Why:** Density, data quality

### Phase 3: National (24+ months)
- **Who:** All specialties
- **Where:** Top 20 metros
- **Why:** Network effects compound

---

## Business Model

### Pricing Tiers

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Basic search, view scores, limited verifications |
| Pro | $4.99/mo | Unlimited verifications, saved providers, alerts |
| B2B API | $500-5K/mo | API access, bulk queries |

### Unit Economics (Target)
- Cost per user: ~$0.10/month (infrastructure)
- Revenue per user: $0.50-1.00/month (mix)
- Break-even: ~10K active users

---

## Ecosystem Position

### Relationship with OwnMyHealth

```
VerifyMyProvider ←───→ OwnMyHealth
(No HIPAA)           (HIPAA-compliant)
     ↓                     ↓
Public provider data  Personal health data
     ↓                     ↓
Verification moat     Treatment tracking
```

**Integration:**
- OwnMyHealth calls VerifyMyProvider API for provider search
- No PHI crosses the boundary
- Separate products, complementary value

---

## Competitive Landscape

### Direct Competitors

| Competitor | Approach | Weakness |
|------------|----------|----------|
| Ribbon Health | B2B data | 48% accuracy |
| Zocdoc | Appointment booking | Limited insurance data |
| Healthgrades | Ratings | No verification |

### Competitive Advantage
1. **Crowdsource moat** - Verifications compound
2. **Transparency** - Users trust confidence scores
3. **Consumer focus** - B2C product, not B2B

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Dec 2025 | Separate from OwnMyHealth | Different compliance, faster development |
| Jan 2026 | No HIPAA required | Public data only, move 3x faster |
| Jan 2026 | GCP for hosting | Existing infrastructure |
| Jan 2026 | Crowdsource verification | Competitive moat |
| Jan 2026 | State-by-state NPI import | Manageable chunks |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cold start problem | High | Critical | Niche focus, manual seeding |
| Verification spam | High | High | Rate limiting, CAPTCHA |
| Competitor resources | Medium | High | Crowdsource moat |
| Insurance API blocks | Low | Medium | Multiple data sources |
| Low user engagement | Medium | High | Gamification, incentives |

---

## Crowdsource Strategy

### Cold Start Solution
1. **Geographic focus** - Start in Miami only
2. **Niche community** - Osteoporosis patients
3. **Manual seeding** - Verify known providers
4. **Incentivize first users** - Recognition, features

### Verification Incentives
1. **Altruism** - "You helped 3 people!"
2. **Gamification** - Badges, leaderboards
3. **Premium features** - For top contributors
4. **Recognition** - Community status

### Spam Prevention
1. Rate limiting (10 verifications/hour)
2. CAPTCHA on submissions
3. IP-based tracking
4. Anomaly detection (future)

---

## Milestones

### Q1 2026
- [x] Rate limiting implemented
- [x] ~2.1M providers imported
- [ ] Beta launch to r/osteoporosis
- [ ] 50 users, 100 verifications

### Q2 2026
- [ ] 200 users
- [ ] 500 verifications
- [ ] Expand to additional specialties

### Q3 2026
- [ ] 500 users
- [ ] 1,000 verifications
- [ ] Premium tier launch

### Q4 2026
- [ ] 1,000 users
- [ ] 3,000 verifications
- [ ] B2B API beta

---

## Success Criteria

### Phase 1: Proof of Concept (3 months)
- 50 users
- 100 verifications
- Useful for Miami osteoporosis patients

### Phase 2: One-City Utility (12 months)
- 500 users
- 2,000 verifications
- Useful for all Miami specialties

### Phase 3: Regional Scale (24 months)
- 5,000 users
- 15,000 verifications
- 5 cities, profitable

---

## Strategic Reminders

1. **Move fast** - No HIPAA = 3x faster than OwnMyHealth
2. **Transparency wins** - Admit uncertainty, show confidence scores
3. **Community first** - Reddit, Facebook groups, word-of-mouth
4. **Data quality** - One good verification > 10 FHIR records
5. **Ecosystem play** - Feed OwnMyHealth, but stand alone

---

*Strategy subject to revision based on user feedback*
