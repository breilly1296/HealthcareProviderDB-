---
tags:
  - documentation
  - strategy
type: prompt
priority: 2
---

# Generate STRATEGY.md

## Purpose
Create or update the strategic direction document for VerifyMyProvider.

## Questions to Ask

### Mission & Vision
1. What problem is VerifyMyProvider solving?
   - Expected: Provider directories are ~50% inaccurate ("ghost network" problem)

2. Who is the target user (be specific)?
   - Initial: Osteoporosis patients?
   - Long-term: All patients needing provider search?

3. What makes VerifyMyProvider different from competitors?
   - Expected: Crowdsourced verification + transparent confidence scores

4. What is the long-term vision?

### Product Strategy
1. How does VerifyMyProvider fit into the ecosystem?
   - Partner product with OwnMyHealth?
   - Standalone product?
   - Acquisition funnel for OwnMyHealth?

2. What's the validation status?
   - Hypothesis?
   - Building?
   - Testing?
   - Validated?

3. What's the launch sequence?
   - Geographic focus? (Miami?)
   - Specialty focus? (Osteoporosis first?)
   - Broader expansion plan?

### Business Model
1. What are the pricing tiers?
   - Free tier: Features?
   - Pro tier: Price and features? ($4.99/month?)
   - B2B API: Pricing?

2. What's the unit economics?
   - Cost per user (infrastructure, API calls)
   - Target margin
   - Break-even volume

3. What's the customer acquisition strategy?
   - Reddit communities? (r/osteoporosis)
   - Facebook groups?
   - SEO?
   - OwnMyHealth integration?

### Key Decisions
1. What major technical decisions have been made?
   - Cloud provider: GCP
   - On-demand FHIR (vs bulk import)
   - Crowdsource verification (competitive moat)
   - No HIPAA (public data only)

2. What alternatives were considered and rejected?
   - Bulk FHIR import?
   - B2B focus (vs B2C)?
   - Integration into OwnMyHealth (vs separate)?

3. Any pivots or major strategy changes?
   - From bulk import to on-demand?
   - From osteoporosis-only to all specialties?

### Competitive Landscape
1. Who are the competitors?
   - Expected: Ribbon Health (acquired $59M, 48% accuracy)

2. What's VerifyMyProvider's competitive advantage?
   - Crowdsource moat?
   - Transparency?
   - Consumer focus?

3. What could competitors do to copy you?
   - How defensible is the moat?

### Timeline & Milestones
1. What are the quarterly goals?
   - Q1 2026: Beta launch?
   - Q2 2026: ?

2. What's the target date for beta launch to r/osteoporosis?

3. What's the target date for profitability?

4. What financial milestones are being tracked?

### Risks
1. What could kill this business?
   - Expected answers:
     - Cold start problem (no verifications)
     - Competitor with more resources
     - Spam/bad data ruins crowdsource
     - Insurance companies block FHIR APIs

2. What are the top 3-5 risks?

3. What are the mitigations for each?

### Crowdsource Strategy
1. How do you solve the cold start problem?
   - Manual seeding?
   - Geographic focus?
   - Niche community first?

2. What incentivizes verifications?
   - Altruism ("You helped 3 people!")?
   - Gamification?
   - Premium features for contributors?

3. How do you prevent spam/manipulation?
   - Rate limiting?
   - Authentication?
   - Pattern detection?

## Output Format

```markdown
# VerifyMyProvider Strategy

**Last Updated:** [Date]
**Phase:** [current phase]
**Status:** [validation status]

## Executive Summary
[2-3 paragraphs covering problem, solution, differentiator]

---

## Mission Statement
[One paragraph]

---

## Core Principles
1. [Principle 1 - e.g., Transparency over accuracy]
2. [Principle 2 - e.g., Crowdsource as competitive moat]
3. [Principle 3 - e.g., No PHI / No HIPAA]

---

## Product Strategy

### The Problem
[Ghost network problem explanation]

### The Solution
[FHIR + crowdsource explanation]

### The Differentiator
[What makes us different from Ribbon Health]

### Ecosystem Position
[Relationship with OwnMyHealth]

---

## Target Market

### Phase 1: Niche (Months 0-12)
- **Who:** [osteoporosis patients?]
- **Where:** [Miami?]
- **Why:** [tight community, word-of-mouth]

### Phase 2: Regional (Months 12-24)
- **Who:** [expand specialties]
- **Where:** [top 5 cities]

### Phase 3: National (24+ months)
- **Who:** [all specialties]
- **Where:** [top 20 metros]

---

## Business Model

### Pricing Tiers
| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | [features] |
| Pro | $4.99/mo | [features] |
| B2B API | $500-5k/mo | [features] |

### Unit Economics
- **Cost per user:** $X/month
- **Revenue per user:** $Y/month
- **Margin:** Z%
- **Break-even:** N users

### Revenue Projections
[Table or chart showing growth]

---

## Competitive Analysis

### Ribbon Health
- **Strengths:** [list]
- **Weaknesses:** [list - 48% accuracy despite $59M]
- **Our Advantage:** [crowdsource moat]

### Other Competitors
[List and analyze]

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| [date] | On-demand FHIR vs bulk | [rationale] |
| [date] | Separate from OwnMyHealth | [rationale] |
| [date] | No HIPAA required | [rationale] |

---

## Milestones

### Q1 2026
- [ ] Security hardening (rate limiting)
- [ ] Beta launch to r/osteoporosis
- [ ] 50 users, 100 verifications

### Q2 2026
- [ ] [goals]

### Q3 2026
- [ ] [goals]

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cold start problem | High | Critical | Manual seeding, niche focus |
| Verification spam | High | High | Rate limiting, CAPTCHA |
| [other risks] | | | |

---

## Crowdsource Strategy

### Cold Start Solution
[Geographic focus, niche community, manual seeding]

### Verification Incentives
[Altruism, gamification, premium features]

### Spam Prevention
[Rate limiting, auth, anomaly detection]

---

## Strategic Reminders

1. **Move fast:** No HIPAA = 3x faster than OwnMyHealth
2. **Transparency:** Admit uncertainty, show confidence scores
3. **Community first:** Reddit, Facebook groups, word-of-mouth
4. **Data quality:** One good verification worth 10 FHIR records
5. **Ecosystem play:** Feed OwnMyHealth, but stand alone

---

## Success Criteria

**Proof of Concept (3 months):**
- 50 users, 100 verifications, useful for Miami osteoporosis

**One-City Utility (12 months):**
- 500 users, 2k verifications, useful for all Miami specialties

**Regional Scale (24 months):**
- 5k users, 15k verifications, 5 cities, profitable
```
