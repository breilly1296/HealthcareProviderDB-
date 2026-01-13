---
tags:
  - documentation
  - ecosystem
  - strategy
type: prompt
priority: 2
---

# Generate ECOSYSTEM.md

## Purpose
Document the VerifyMyProvider + OwnMyHealth ecosystem integration strategy.

## Questions to Ask

### Product Relationship
1. How would you describe the relationship between VerifyMyProvider and OwnMyHealth?
   - Separate products? Feature of one? Partner products?

2. Why are they separate products instead of one combined platform?
   - Compliance reasons?
   - Different risk profiles?
   - Development speed?
   - Exit optionality?

### User Journeys

**Casual User (e.g., "Your Sister"):**
1. What's the typical journey for a casual user?
   - Starts at VerifyMyProvider?
   - Finds a doctor?
   - Verifies after appointment?
   - Never needs OwnMyHealth?

2. What value does a casual user provide to the ecosystem?
   - Verification data?
   - Revenue potential?
   - Top-of-funnel traffic?

**Power User (e.g., "You"):**
1. What's the typical journey for a power user?
   - Starts at VerifyMyProvider or OwnMyHealth?
   - Uses both products?
   - How do they transition between products?

2. What value does a power user provide?
   - Higher engagement?
   - Premium subscriptions?
   - Multiple touchpoints?

### Conversion Funnel
1. What's the conversion funnel strategy?
   - VerifyMyProvider → OwnMyHealth?
   - OwnMyHealth → VerifyMyProvider?
   - Bidirectional?

2. What's the target conversion rate?
   - 5%? 10%? 20%?

3. What's the expected lifetime value difference?
   - Casual user LTV
   - Power user LTV

### Technical Integration

1. How do the products integrate technically?
   - Separate databases?
   - Separate deployments?
   - API calls between them?

2. What data flows between the products?
   - VerifyMyProvider → OwnMyHealth: Provider search results?
   - OwnMyHealth → VerifyMyProvider: Verification submissions?
   - Does any PHI cross the boundary? (Answer should be NO)

3. What's the API contract?
   - Example API calls?
   - Authentication method?
   - Rate limiting?

### User Experience Integration

**On VerifyMyProvider:**
1. How do you promote OwnMyHealth to VerifyMyProvider users?
   - Footer CTA?
   - Post-verification upsell?
   - Email campaigns?

**On OwnMyHealth:**
1. How do you promote VerifyMyProvider to OwnMyHealth users?
   - "Find a doctor" feature?
   - Embedded search?
   - Deep link with pre-filled plan?

### Compliance Boundary

1. What's the compliance separation?
   - VerifyMyProvider: No HIPAA?
   - OwnMyHealth: HIPAA-compliant?

2. Why is this separation critical?
   - Risk isolation?
   - Development speed?
   - Cost savings?

### Holding Company Structure

1. What's the legal organization?
   - Separate LLCs?
   - Same company, different products?
   - Holding company structure?

2. What are the exit scenarios?
   - Sell VerifyMyProvider only?
   - Sell OwnMyHealth only?
   - Sell both together?
   - Keep both as portfolio?

### Revenue Model

1. What's the revenue split across the ecosystem?
   - VerifyMyProvider revenue?
   - OwnMyHealth revenue?
   - Combined revenue target?

2. What's the customer acquisition economics?
   - Cost to acquire VerifyMyProvider user?
   - Cost to convert to OwnMyHealth?
   - Compared to acquiring OwnMyHealth user directly?

### Strategic Rationale

1. What are the top 3 benefits of the ecosystem approach?
   - Separate risk profiles?
   - Portfolio diversification?
   - Symbiotic user acquisition?

2. What could kill this strategy?
   - Integration complexity?
   - Confused positioning?
   - Resource dilution?

## Output Format

```markdown
# VerifyMyProvider + OwnMyHealth Ecosystem

**Last Updated:** [Date]

## The Portfolio Model

```
[ASCII diagram of holding company structure]
```

---

## Why Partner Products (Not One Platform)

### Different Compliance Requirements
| VerifyMyProvider | OwnMyHealth |
|-----------------|-------------|
[comparison table]

---

## Symbiotic User Acquisition

### User Journey: Casual User
[Step-by-step journey]

Value to ecosystem:
- [benefits]

### User Journey: Power User
[Step-by-step journey]

Value to ecosystem:
- [benefits]

---

## The Conversion Funnel

```
[ASCII diagram of funnel]
```

**The math:**
- [calculations]

---

## Data Synergy

**VerifyMyProvider → OwnMyHealth:**
- [what data flows]

**OwnMyHealth → VerifyMyProvider:**
- [what data flows]

**Shared but independent:**
- [benefits]

---

## Technical Integration

### Separate but connected:
```
[ASCII diagram]
```

### API contract between products:
```typescript
[example API calls]
```

### User experience integration:

**On VerifyMyProvider:**
```
[mockup or description]
```

**On OwnMyHealth:**
```
[mockup or description]
```

---

## Why This Strategy Works

1. **Separate Risk Profiles**
   [explanation]

2. **Separate Acquisition Channels**
   [explanation]

3. **Separate Exit Options**
   [explanation]

4. **Separate Development Timelines**
   [explanation]

5. **Portfolio Diversification**
   [explanation]

---

## Holding Company Structure

### Legal Organization
```
[structure diagram]
```

### Exit Scenarios

**Scenario A:** [description]

**Scenario B:** [description]

---

## Ecosystem Success Metrics

**Cross-Product Engagement:**
- [metrics]

**Product Health:**
- [metrics]

---

## Current Status

- **Integration Status:** [current state]
- **Next Steps:** [what's next]
```
