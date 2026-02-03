---
tags:
  - security
  - anti-spam
  - implemented
type: prompt
priority: 2
---

# Sybil Attack Prevention

## Files to Review
- `prisma/schema.prisma` (indexes and constraints)
- `packages/backend/src/services/verificationService.ts` (prevention logic)
- `packages/backend/src/middleware/rateLimiter.ts` (rate limiting)
- `packages/backend/src/middleware/captcha.ts` (CAPTCHA)

## What is a Sybil Attack?

A Sybil attack is when an attacker creates multiple fake identities to manipulate a system. In VerifyMyProvider, this could mean:

1. **Verification Spam:** Same person submitting many fake verifications
2. **Vote Manipulation:** Same person voting multiple times on a verification
3. **Confidence Score Poisoning:** Artificially inflating/deflating scores

## Prevention Layers

### Layer 1: Rate Limiting (IP-based)
```
┌─────────────────────────────────────────────┐
│  Rate Limiters                              │
│  • Verification: 10/hour per IP            │
│  • Voting: 10/hour per IP                  │
│  • Search: 100/hour per IP                 │
└─────────────────────────────────────────────┘
```

### Layer 2: CAPTCHA (Bot Detection)
```
┌─────────────────────────────────────────────┐
│  Google reCAPTCHA v3                        │
│  • Score >= 0.5 required                   │
│  • Blocks automated scripts                │
│  • Fallback rate limiting if unavailable   │
└─────────────────────────────────────────────┘
```

### Layer 3: Vote Deduplication (Database)
```
┌─────────────────────────────────────────────┐
│  VoteLog Table                              │
│  • Unique constraint: (verificationId, IP) │
│  • One vote per IP per verification        │
│  • Vote can be changed, not duplicated     │
└─────────────────────────────────────────────┘
```

### Layer 4: Verification Windows (Database)
```
┌─────────────────────────────────────────────┐
│  Sybil Prevention Indexes                   │
│  • (npi, planId, sourceIp, createdAt)      │
│  • (npi, planId, submittedBy, createdAt)   │
│  • 30-day window check before accepting    │
└─────────────────────────────────────────────┘
```

## Database Schema

### VoteLog Table
```prisma
model VoteLog {
  id             String   @id @default(cuid())
  verificationId String   @map("verification_id")
  sourceIp       String   @map("source_ip")
  vote           String   // 'up' or 'down'
  createdAt      DateTime @default(now())

  verification   VerificationLog @relation(...)

  @@unique([verificationId, sourceIp])  // One vote per IP
  @@index([verificationId])
  @@index([sourceIp])
}
```

### Sybil Prevention Indexes
```prisma
model VerificationLog {
  // ... other fields

  // Indexes for fast duplicate checking
  @@index([providerNpi, planId, sourceIp, createdAt])
  @@index([providerNpi, planId, submittedBy, createdAt])
}
```

## Implementation

### Vote Deduplication
```typescript
// packages/backend/src/services/verificationService.ts
export async function voteOnVerification(
  verificationId: string,
  vote: 'up' | 'down',
  sourceIp: string
) {
  // Check for existing vote
  const existingVote = await prisma.voteLog.findUnique({
    where: {
      verificationId_sourceIp: { verificationId, sourceIp }
    }
  });

  if (existingVote) {
    // Update existing vote (allows changing vote)
    if (existingVote.vote === vote) {
      throw AppError.conflict('You have already voted this way');
    }

    // Change vote
    await prisma.$transaction([
      prisma.voteLog.update({
        where: { id: existingVote.id },
        data: { vote }
      }),
      prisma.verificationLog.update({
        where: { id: verificationId },
        data: {
          upvotes: { increment: vote === 'up' ? 1 : -1 },
          downvotes: { increment: vote === 'down' ? 1 : -1 }
        }
      })
    ]);

    return { ...result, voteChanged: true };
  }

  // Create new vote
  await prisma.$transaction([
    prisma.voteLog.create({
      data: { verificationId, sourceIp, vote }
    }),
    prisma.verificationLog.update({
      where: { id: verificationId },
      data: {
        [vote === 'up' ? 'upvotes' : 'downvotes']: { increment: 1 }
      }
    })
  ]);

  return { ...result, voteChanged: false };
}
```

### Verification Window Check
```typescript
export async function submitVerification(data: VerificationInput) {
  // Check for recent submission from same IP for same NPI/plan
  const recentFromSameIp = await prisma.verificationLog.findFirst({
    where: {
      providerNpi: data.npi,
      planId: data.planId,
      sourceIp: data.sourceIp,
      createdAt: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    }
  });

  if (recentFromSameIp) {
    throw AppError.conflict(
      'You have already submitted a verification for this provider-plan pair recently'
    );
  }

  // Proceed with verification
  // ...
}
```

## Attack Scenarios & Mitigations

### Scenario 1: Bot Spam
**Attack:** Script sends 1000 verifications per minute
**Mitigation:**
- Rate limit: 10/hour per IP
- CAPTCHA blocks bots
- Result: Max 10 verifications even with VPN rotation

### Scenario 2: Vote Manipulation
**Attack:** Same user votes 100 times on their verification
**Mitigation:**
- VoteLog unique constraint
- One vote per IP per verification
- Result: Only 1 vote counted

### Scenario 3: VPN/Proxy Rotation
**Attack:** User rotates through 100 VPN IPs
**Mitigation:**
- Each IP still limited to 10/hour
- CAPTCHA score detects suspicious behavior
- Result: Max 1000 verifications/hour (still costly)

### Scenario 4: Coordinated Attack
**Attack:** Multiple real users coordinating false verifications
**Mitigation:**
- Conflicting verifications = low confidence
- Manual review for disputed providers
- Result: Attacks visible in data, can be moderated

## Monitoring

### Suspicious Patterns
```sql
-- IPs with many verifications
SELECT source_ip, COUNT(*) as count
FROM verification_logs
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY source_ip
HAVING COUNT(*) > 20
ORDER BY count DESC;

-- Provider-plans with conflicting verifications
SELECT provider_npi, plan_id,
       SUM(CASE WHEN new_value->>'accepted' = 'true' THEN 1 ELSE 0 END) as accepts,
       SUM(CASE WHEN new_value->>'accepted' = 'false' THEN 1 ELSE 0 END) as rejects
FROM verification_logs
GROUP BY provider_npi, plan_id
HAVING SUM(CASE WHEN new_value->>'accepted' = 'true' THEN 1 ELSE 0 END) > 0
   AND SUM(CASE WHEN new_value->>'accepted' = 'false' THEN 1 ELSE 0 END) > 0;
```

## Checklist

### Rate Limiting
- [x] Verification: 10/hour per IP
- [x] Voting: 10/hour per IP
- [x] Search: 100/hour per IP
- [x] Rate limit headers returned
- [x] Retry-After on 429

### CAPTCHA
- [x] reCAPTCHA v3 on verification
- [x] reCAPTCHA v3 on voting
- [x] Score threshold: 0.5
- [x] Fallback rate limiting

### Vote Deduplication
- [x] VoteLog table
- [x] Unique constraint on (verificationId, sourceIp)
- [x] Vote change allowed
- [x] Duplicate prevention

### Verification Windows
- [x] Sybil prevention indexes
- [ ] 30-day window check implemented
- [ ] Duplicate IP check
- [ ] Duplicate email check

### Monitoring
- [ ] Suspicious pattern queries
- [ ] Alerting on high volumes
- [ ] Admin review queue

## Questions to Ask

1. **Is the 30-day window check implemented?**
   - In verificationService.ts?
   - Enforced consistently?

2. **What happens with VPN/proxy usage?**
   - Detect proxy IPs?
   - Block known VPN ranges?

3. **Should we require email for verification?**
   - Reduces spam
   - Adds friction

4. **Is there a manual review process?**
   - For disputed verifications?
   - For flagged IPs?

5. **Should we implement reputation scoring?**
   - Trust long-term users more?
   - Weight their verifications higher?

## Output Format

```markdown
# Sybil Attack Prevention

**Last Updated:** [Date]

## Protection Layers
| Layer | Status | Notes |
|-------|--------|-------|
| Rate Limiting | ✅ | 10/hr verify, 10/hr vote |
| CAPTCHA | ✅ | reCAPTCHA v3 |
| Vote Dedup | ✅ | 1 vote per IP |
| Verification Window | ⚠️ | 30-day check |

## Metrics (Last 24h)
- Verifications blocked (rate limit): X
- Votes blocked (duplicate): X
- CAPTCHA failures: X

## Suspicious Activity
[Any flagged patterns]

## Issues
[List any issues]

## Recommendations
[List recommendations]
```
