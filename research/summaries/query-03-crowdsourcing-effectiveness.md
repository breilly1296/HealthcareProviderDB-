# Query #3: Effectiveness of Crowdsourcing in Healthcare Verification

## Source
Mortensen, J. et al. (2015). "Using the Wisdom of the Crowds to Find Critical Errors in Biomedical Ontologies: A Study of SNOMED CT." JAMIA, 22(3).

## Key Findings

### Accuracy
- **Crowd-expert agreement: κ=0.58** (moderate agreement)
- **Expert-expert agreement: κ=0.59** (moderate agreement)
- Crowdsourcing achieves **expert-level accuracy**

### Efficiency
- **5-150x faster** than expert review
- **75% cheaper** ($0.50 vs $2.00 per verification)

### Optimal Design
- **3 verifications optimal** - diminishing returns after 3
- **Simple yes/no tasks work best** - self-contained, binary decisions
- **Qualification tests important** - 10-15 items to filter quality workers

## Product Implications

### Verification System Design
1. **Require 3 verifications minimum** per provider
   - Backed by research showing optimal balance
   - Can claim "research-validated accuracy"

2. **Keep verification form extremely simple**
   - Binary yes/no questions only
   - One question per screen
   - No complex rating scales or open-ended text

3. **Implement qualification system**
   - 10-15 question test before first verification
   - Filters low-quality contributors
   - Maintains expert-level accuracy

### Marketing Claims
- "Expert-level accuracy through crowdsourcing"
- "Validated by peer-reviewed research"
- "κ=0.58 agreement with expert verification"

### Competitive Advantage
- **Speed:** Real-time updates vs weeks/months for expert review
- **Cost:** 75% cheaper enables sustainable business model
- **Scale:** Can verify entire provider directories

## Implementation Notes

### Verification Form Requirements
**DO:**
- Binary choices (Yes/No, Accepts/Doesn't Accept)
- Clear, simple instructions
- Single task per screen
- Immediate feedback

**DON'T:**
- Complex rating scales (1-5 stars, etc.)
- Open-ended text fields
- Multiple questions on one page
- Tasks requiring >5 minutes

### Quality Control
- Pre-qualification test (10-15 items)
- 3 verifications per provider
- Flag disagreements for expert review
- Track individual contributor accuracy over time
