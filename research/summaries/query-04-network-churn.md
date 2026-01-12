# Query #4: Provider Network Participation Changes

## Source
Ndumele, C. et al. (2018). "Network Optimization And The Continuity Of Physicians In Medicaid Managed Care." Health Affairs, 37(6).

## Key Findings

### Overall Turnover Rates
- **12% annual turnover** in primary care (Medicaid networks)
- **34% cumulative exit** over 5 years
- These are baseline rates - actual churn may be higher

### Specialty-Specific Patterns
- **Psychiatrists:** Only 43% accept Medicaid
- **Mental health:** Highest churn rates
- **Solo practices:** Higher turnover than group practices
- **Narrow networks:** 20% higher turnover than broad networks

### Implications for Directory Accuracy
- High churn = directories become stale quickly
- Specialty matters - mental health changes most frequently
- Practice type matters - solo practices less stable

## Product Implications

### Confidence Decay Algorithm
Based on research findings, implement specialty-specific verification freshness:

```typescript
const VERIFICATION_FRESHNESS = {
  // High-churn specialties
  psychiatry: 30,        // Only 43% accept insurance, high turnover
  mentalHealth: 30,      // Grouped with psychiatry

  // Medium-churn specialties
  primaryCare: 60,       // 12% annual turnover
  specialists: 60,       // Similar to primary care

  // Lower-churn specialties
  hospitalists: 90,      // More stable positions
  radiology: 90,         // Hospital-based, stable
};
```

### User Experience
1. **Show verification age prominently**
   - "Last verified 15 days ago"
   - Visual freshness indicator (green/yellow/red)

2. **Specialty-specific warnings**
   - "Mental health providers change networks frequently"
   - "We recommend calling to confirm before your appointment"

3. **Confidence scoring**
   - Decay confidence based on specialty and time
   - Lower confidence = more prominent "verify" call-to-action

### Re-verification Strategy
1. **Mental health:** Re-verify every 30 days
2. **Primary care:** Re-verify every 60 days
3. **Specialists:** Re-verify every 60-90 days
4. **Hospital-based:** Re-verify every 90 days

### Marketing Angles
- "Directory accuracy degrades over time - we solve that"
- "Mental health providers require more frequent verification"
- "Solo practices need continuous monitoring"

## Implementation Notes

### Database Schema
```typescript
interface ProviderVerification {
  providerId: string;
  specialty: string;
  practiceType: 'solo' | 'group' | 'hospital';
  lastVerified: Date;
  confidenceScore: number; // Decays based on specialty
  verificationCount: number;
}
```

### Background Jobs
- Nightly confidence decay calculation
- Weekly re-verification prompts for stale data
- Monthly reports on verification freshness by specialty
