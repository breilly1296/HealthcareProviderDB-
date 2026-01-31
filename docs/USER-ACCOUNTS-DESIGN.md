# User Accounts & Trust Levels Design Document

**Version**: 1.0
**Target Release**: v2.0
**Status**: Draft
**Last Updated**: 2024-01-15

## Table of Contents

1. [Overview](#overview)
2. [User Tiers & Trust Levels](#user-tiers--trust-levels)
3. [Database Schema Changes](#database-schema-changes)
4. [Authentication Flow](#authentication-flow)
5. [Trust Level Progression](#trust-level-progression)
6. [Migration Strategy](#migration-strategy)
7. [API Changes](#api-changes)
8. [Privacy Considerations](#privacy-considerations)
9. [Implementation Checklist](#implementation-checklist)

---

## Overview

### Problem Statement

The current anonymous verification system has limitations:

1. **Abuse Prevention**: No way to identify and ban bad actors
2. **Rate Limiting**: IP-based limits are easily bypassed
3. **CAPTCHA Friction**: Every verification requires CAPTCHA solving
4. **Reputation**: No way to weight verifications by contributor quality
5. **Engagement**: No incentive for users to contribute quality data

### Solution: User Accounts with Trust Levels

Implement a graduated trust system where users earn privileges through demonstrated good behavior:

- Anonymous users can still browse and submit (with friction)
- Registered users get better rate limits and reduced CAPTCHA
- Trusted users who prove accuracy get the best experience
- Bad actors can be identified and banned

### Why User Accounts?

| Benefit | Impact |
|---------|--------|
| Abuse Prevention | Track users across IPs, ban bad actors |
| Quality Control | Weight verifications by user reputation |
| Reduced Friction | Skip CAPTCHA for trusted users |
| Engagement | Gamification through trust levels |
| Audit Trail | Better logging and accountability |

### Authentication Provider Recommendation

**Do NOT build authentication from scratch.** Use a managed auth provider:

| Provider | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **Clerk** | Modern DX, React components, generous free tier | Newer, smaller ecosystem | Best for React/Next.js |
| **Auth0** | Industry standard, extensive features | Complex, can be expensive | Best for enterprise |
| **Supabase Auth** | Integrated with Supabase, PostgreSQL | Ties you to Supabase | Good if using Supabase |
| **Firebase Auth** | Google ecosystem, many providers | Google dependency | Good for mobile |
| **NextAuth.js** | Self-hosted, flexible | More setup work | Good for control |

**Primary Recommendation**: **Clerk** for frontend, **NextAuth.js** for backend API

Rationale:
- Clerk provides excellent React components and UX
- NextAuth.js is battle-tested and flexible
- Both support the same OAuth providers
- Can share session state between frontend and API

### Timeline

| Phase | Milestone | Target |
|-------|-----------|--------|
| Phase 1 | Design approval | Week 1 |
| Phase 2 | Auth provider setup | Week 2 |
| Phase 3 | Database migration | Week 3 |
| Phase 4 | API implementation | Weeks 4-5 |
| Phase 5 | Frontend integration | Weeks 6-7 |
| Phase 6 | Trust system implementation | Week 8 |
| Phase 7 | Testing & QA | Weeks 9-10 |
| Phase 8 | Staged rollout | Weeks 11-12 |

---

## User Tiers & Trust Levels

### Tier Definitions

| Tier | Name | Requirements | Verify Rate | Vote Rate | CAPTCHA | Features |
|------|------|--------------|-------------|-----------|---------|----------|
| 0 | Anonymous | None | 10/hour | 20/hour | Always | Basic access |
| 1 | Registered | Email verified | 25/hour | 50/hour | Low-risk skip | Save preferences |
| 2 | Trusted | 20+ accurate verifications | 100/hour | 200/hour | Never | Verification history |
| 3 | Power User | 100+ accurate, <5% disputed | 500/hour | 1000/hour | Never | Beta features, badge |
| 4 | Admin | Manual assignment | Unlimited | Unlimited | Never | Admin panel, moderation |

### Tier 0: Anonymous

Current behavior - no account required.

**Capabilities**:
- Browse providers and plans
- Search and filter
- View verification status
- Submit verifications (with CAPTCHA)
- Vote on verifications (with CAPTCHA)

**Limitations**:
- Lowest rate limits
- CAPTCHA on every action
- No history or preferences
- IP-based tracking only

### Tier 1: Registered

Basic account with email verification.

**Requirements**:
- Valid email address
- Email verification completed
- Account in good standing

**Capabilities**:
- All Tier 0 features
- Higher rate limits (2.5x)
- CAPTCHA skipped for low-risk actions
- View personal verification history
- Save search preferences
- Notification preferences

**Progression**:
- Auto-promoted to Tier 2 after 20 accurate verifications

### Tier 2: Trusted

Proven contributors with track record.

**Requirements**:
- 20+ verifications submitted
- <15% dispute rate (verifications not heavily downvoted)
- Account age > 7 days
- No policy violations

**Capabilities**:
- All Tier 1 features
- Much higher rate limits (10x baseline)
- No CAPTCHA required
- Verifications weighted higher in confidence
- Access to verification analytics
- Display "Trusted Contributor" badge (optional)

**Progression**:
- Auto-promoted to Tier 3 after 100 accurate verifications

### Tier 3: Power User

Elite contributors with excellent track record.

**Requirements**:
- 100+ verifications submitted
- <5% dispute rate
- Account age > 30 days
- No policy violations
- Consistent activity (≥1 verification/week average)

**Capabilities**:
- All Tier 2 features
- Highest rate limits (50x baseline)
- Early access to new features
- Priority support
- Display "Power Contributor" badge
- Ability to flag suspicious verifications

**Special Notes**:
- Manual review may be triggered for promotion
- Represents top ~1% of contributors

### Tier 4: Admin

Staff and moderators.

**Requirements**:
- Manual assignment only
- Background check (internal)
- Training completed

**Capabilities**:
- All Tier 3 features
- Unlimited rate limits
- Access to admin panel
- User moderation (ban, tier adjustment)
- Verification moderation (remove, edit)
- Access to audit logs
- System configuration

---

## Database Schema Changes

### New Models

```prisma
// =============================================================================
// User Account Model
// =============================================================================

model User {
  id              String    @id @default(cuid())

  // Authentication
  email           String    @unique
  emailVerified   DateTime?
  passwordHash    String?   // Null if using OAuth only

  // Profile
  name            String?
  displayName     String?   @db.VarChar(50)  // Public display name
  avatarUrl       String?

  // Trust & Status
  trustLevel      Int       @default(1)
  status          UserStatus @default(ACTIVE)
  statusReason    String?   // Reason for suspension/ban

  // Metrics (denormalized for performance)
  verificationCount     Int @default(0)
  accurateVerifications Int @default(0)
  disputedVerifications Int @default(0)
  voteCount            Int @default(0)

  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  lastActiveAt    DateTime  @default(now())
  lastLoginAt     DateTime?

  // Relations
  verifications   VerificationLog[]
  votes           VoteLog[]
  sessions        Session[]
  auditLogs       UserAuditLog[]

  @@index([email])
  @@index([trustLevel])
  @@index([status])
  @@index([createdAt])
}

enum UserStatus {
  ACTIVE
  SUSPENDED    // Temporary, can be reinstated
  BANNED       // Permanent
  DELETED      // Soft delete for GDPR
}

// =============================================================================
// Session Management
// =============================================================================

model Session {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  token         String   @unique
  refreshToken  String   @unique

  userAgent     String?
  ipAddress     String?

  expiresAt     DateTime
  createdAt     DateTime @default(now())
  lastUsedAt    DateTime @default(now())

  @@index([userId])
  @@index([token])
  @@index([refreshToken])
  @@index([expiresAt])
}

// =============================================================================
// OAuth Account Linking
// =============================================================================

model OAuthAccount {
  id                String  @id @default(cuid())
  userId            String
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  provider          String  // "google", "github", etc.
  providerAccountId String

  accessToken       String?
  refreshToken      String?
  expiresAt         DateTime?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([provider, providerAccountId])
  @@index([userId])
}

// =============================================================================
// Email Verification Tokens
// =============================================================================

model EmailVerificationToken {
  id        String   @id @default(cuid())
  email     String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([email])
  @@index([token])
}

// =============================================================================
// Password Reset Tokens
// =============================================================================

model PasswordResetToken {
  id        String   @id @default(cuid())
  email     String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  usedAt    DateTime?

  @@index([email])
  @@index([token])
}

// =============================================================================
// User Audit Log
// =============================================================================

model UserAuditLog {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  action    String   // "LOGIN", "LOGOUT", "TIER_CHANGE", "STATUS_CHANGE", etc.
  details   Json?    // Additional context
  ipAddress String?
  userAgent String?

  createdAt DateTime @default(now())

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

### Modified Models

```prisma
// =============================================================================
// Updated VerificationLog
// =============================================================================

model VerificationLog {
  id              Int      @id @default(autoincrement())

  // Existing fields...
  npi             String
  planId          String
  acceptsInsurance Boolean
  acceptsNewPatients Boolean?
  notes           String?
  evidenceUrl     String?

  // User association (nullable for migration)
  userId          String?
  user            User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  // Legacy anonymous tracking (keep for migration)
  submittedBy     String?  // Email (legacy)
  sourceIp        String?
  userAgent       String?

  // Trust weight at time of submission
  userTrustLevel  Int?     // Captured at submission time

  // Voting
  upvotes         Int      @default(0)
  downvotes       Int      @default(0)

  // Status
  status          VerificationStatus @default(ACTIVE)

  createdAt       DateTime @default(now())
  expiresAt       DateTime

  @@index([userId])
  @@index([npi, planId])
}

// =============================================================================
// Updated VoteLog
// =============================================================================

model VoteLog {
  id               Int      @id @default(autoincrement())
  verificationId   Int

  // User association (nullable for migration)
  userId           String?
  user             User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  // Legacy anonymous tracking
  ipHash           String   // Keep for anonymous votes

  vote             VoteType
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([verificationId, userId])  // One vote per user per verification
  @@unique([verificationId, ipHash])  // One vote per IP (for anonymous)
  @@index([userId])
}
```

### Migration SQL

```sql
-- Add new columns to existing tables
ALTER TABLE "VerificationLog" ADD COLUMN "userId" TEXT;
ALTER TABLE "VerificationLog" ADD COLUMN "userTrustLevel" INTEGER;
ALTER TABLE "VoteLog" ADD COLUMN "userId" TEXT;

-- Create indexes
CREATE INDEX "VerificationLog_userId_idx" ON "VerificationLog"("userId");
CREATE INDEX "VoteLog_userId_idx" ON "VoteLog"("userId");

-- Add foreign key constraints
ALTER TABLE "VerificationLog"
  ADD CONSTRAINT "VerificationLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "VoteLog"
  ADD CONSTRAINT "VoteLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;
```

---

## Authentication Flow

### Registration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Registration Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User ─────► Enter Email/Password ─────► Validate Input         │
│                     │                          │                 │
│                     │                          ▼                 │
│                     │                   Check if email exists    │
│                     │                          │                 │
│                     │               ┌──────────┴──────────┐      │
│                     │               │                     │      │
│                     │            Exists              Not Exists  │
│                     │               │                     │      │
│                     │               ▼                     ▼      │
│                     │         Return Error          Hash Password│
│                     │                                     │      │
│                     │                                     ▼      │
│                     │                              Create User   │
│                     │                              (Tier 0)      │
│                     │                                     │      │
│                     │                                     ▼      │
│                     │                          Generate Email    │
│                     │                          Verification Token│
│                     │                                     │      │
│                     │                                     ▼      │
│                     │                           Send Verification│
│                     │                               Email        │
│                     │                                     │      │
│                     │                                     ▼      │
│                     └────────────────────────────► Return Success│
│                                                    (Tier 0)      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Email Verification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Email Verification Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User clicks email link ─────► Extract token from URL           │
│                                        │                         │
│                                        ▼                         │
│                               Find token in database             │
│                                        │                         │
│                         ┌──────────────┴──────────────┐          │
│                         │                             │          │
│                    Not Found                       Found         │
│                         │                             │          │
│                         ▼                             ▼          │
│                  Return Error              Check if expired      │
│                  "Invalid token"                   │             │
│                                         ┌──────────┴──────────┐  │
│                                         │                     │  │
│                                      Expired              Valid  │
│                                         │                     │  │
│                                         ▼                     ▼  │
│                                   Return Error         Update User│
│                                   "Token expired"      emailVerified│
│                                                              │   │
│                                                              ▼   │
│                                                      Delete Token│
│                                                              │   │
│                                                              ▼   │
│                                                   Promote to Tier 1│
│                                                              │   │
│                                                              ▼   │
│                                                      Return Success│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Login Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          Login Flow                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User ─────► Enter Email/Password                               │
│                     │                                            │
│                     ▼                                            │
│              Find user by email                                  │
│                     │                                            │
│         ┌───────────┴───────────┐                                │
│         │                       │                                │
│     Not Found                Found                               │
│         │                       │                                │
│         ▼                       ▼                                │
│   Return Error          Check user status                        │
│                               │                                  │
│              ┌────────────────┼────────────────┐                 │
│              │                │                │                 │
│           BANNED          SUSPENDED         ACTIVE               │
│              │                │                │                 │
│              ▼                ▼                ▼                 │
│        Return Error     Return Error    Verify password          │
│                                               │                  │
│                              ┌────────────────┴────────────────┐ │
│                              │                                 │ │
│                          Invalid                            Valid│
│                              │                                 │ │
│                              ▼                                 ▼ │
│                        Return Error                   Generate JWT│
│                                                              │   │
│                                                              ▼   │
│                                                   Generate Refresh│
│                                                       Token      │
│                                                              │   │
│                                                              ▼   │
│                                                      Create Session│
│                                                              │   │
│                                                              ▼   │
│                                                   Set httpOnly   │
│                                                      cookies     │
│                                                              │   │
│                                                              ▼   │
│                                                      Log audit   │
│                                                              │   │
│                                                              ▼   │
│                                                   Return Success │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### OAuth Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         OAuth Flow                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User ─────► Click "Sign in with Google"                        │
│                     │                                            │
│                     ▼                                            │
│         Redirect to Google OAuth                                 │
│                     │                                            │
│                     ▼                                            │
│         User authenticates with Google                           │
│                     │                                            │
│                     ▼                                            │
│         Google redirects back with code                          │
│                     │                                            │
│                     ▼                                            │
│         Exchange code for tokens                                 │
│                     │                                            │
│                     ▼                                            │
│         Get user info from Google                                │
│                     │                                            │
│                     ▼                                            │
│         Check if OAuth account exists                            │
│                     │                                            │
│         ┌───────────┴───────────┐                                │
│         │                       │                                │
│     Not Found                Found                               │
│         │                       │                                │
│         ▼                       ▼                                │
│  Check if email exists    Load existing user                     │
│         │                       │                                │
│    ┌────┴────┐                  │                                │
│    │         │                  │                                │
│  Exists  Not Exists             │                                │
│    │         │                  │                                │
│    ▼         ▼                  │                                │
│  Link    Create new             │                                │
│  account   user                 │                                │
│    │         │                  │                                │
│    └────┬────┘                  │                                │
│         │                       │                                │
│         └───────────────────────┤                                │
│                                 │                                │
│                                 ▼                                │
│                        Create session                            │
│                                 │                                │
│                                 ▼                                │
│                         Set cookies                              │
│                                 │                                │
│                                 ▼                                │
│                        Redirect to app                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Token Structure

**Access Token (JWT)**:
```json
{
  "sub": "user_cuid_here",
  "email": "user@example.com",
  "trustLevel": 2,
  "status": "ACTIVE",
  "iat": 1705330800,
  "exp": 1705334400
}
```

- **Lifetime**: 1 hour
- **Storage**: httpOnly cookie
- **Refresh**: Silent refresh before expiry

**Refresh Token**:
- **Lifetime**: 7 days
- **Storage**: httpOnly cookie + database
- **Rotation**: New refresh token on each use
- **Revocation**: Delete from database on logout

### Cookie Configuration

```typescript
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  domain: process.env.COOKIE_DOMAIN, // .verifymyprovider.com
};

const accessTokenCookie = {
  ...cookieOptions,
  name: 'vmp_access_token',
  maxAge: 60 * 60, // 1 hour
};

const refreshTokenCookie = {
  ...cookieOptions,
  name: 'vmp_refresh_token',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};
```

---

## Trust Level Progression

### Automatic Promotion

```typescript
interface PromotionCriteria {
  tier: number;
  minVerifications: number;
  maxDisputeRate: number;
  minAccountAgeDays: number;
  additionalChecks?: () => boolean;
}

const promotionCriteria: PromotionCriteria[] = [
  {
    tier: 1,
    minVerifications: 0,
    maxDisputeRate: 1.0, // 100% - just need verified email
    minAccountAgeDays: 0,
  },
  {
    tier: 2,
    minVerifications: 20,
    maxDisputeRate: 0.15, // 15%
    minAccountAgeDays: 7,
  },
  {
    tier: 3,
    minVerifications: 100,
    maxDisputeRate: 0.05, // 5%
    minAccountAgeDays: 30,
    additionalChecks: () => {
      // Check for consistent weekly activity
      return hasWeeklyActivityStreak(4);
    },
  },
];
```

### Promotion Check Algorithm

```typescript
async function checkAndPromoteUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      verifications: {
        where: { status: 'ACTIVE' },
      },
    },
  });

  if (!user || user.status !== 'ACTIVE') return;
  if (user.trustLevel >= 3) return; // Max auto-promotion

  const currentTier = user.trustLevel;
  const nextTier = currentTier + 1;
  const criteria = promotionCriteria.find(c => c.tier === nextTier);

  if (!criteria) return;

  // Check verification count
  if (user.verificationCount < criteria.minVerifications) return;

  // Check dispute rate
  const disputeRate = user.disputedVerifications / user.verificationCount;
  if (disputeRate > criteria.maxDisputeRate) return;

  // Check account age
  const accountAgeDays = daysSince(user.createdAt);
  if (accountAgeDays < criteria.minAccountAgeDays) return;

  // Run additional checks
  if (criteria.additionalChecks && !criteria.additionalChecks()) return;

  // Promote user
  await prisma.user.update({
    where: { id: userId },
    data: { trustLevel: nextTier },
  });

  // Log the promotion
  await prisma.userAuditLog.create({
    data: {
      userId,
      action: 'TIER_PROMOTION',
      details: {
        fromTier: currentTier,
        toTier: nextTier,
        reason: 'Automatic promotion',
      },
    },
  });

  // Send notification
  await sendTierPromotionEmail(user.email, nextTier);
}
```

### Automatic Demotion

```typescript
interface DemotionTrigger {
  condition: string;
  action: 'WARN' | 'DEMOTE' | 'SUSPEND' | 'BAN';
  tierChange?: number; // -1 = demote one level
}

const demotionTriggers: DemotionTrigger[] = [
  {
    condition: 'disputeRateAbove30Percent',
    action: 'DEMOTE',
    tierChange: -1,
  },
  {
    condition: 'rapidFireSubmissions', // 50+ in 1 hour
    action: 'SUSPEND',
  },
  {
    condition: 'multipleIPsVotingSameVerification',
    action: 'WARN',
  },
  {
    condition: 'abusiveContent',
    action: 'SUSPEND',
  },
  {
    condition: 'repeatOffender', // 3+ suspensions
    action: 'BAN',
  },
];
```

### Demotion Check Algorithm

```typescript
async function checkForDemotion(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'ACTIVE') return;

  // Check dispute rate
  if (user.verificationCount >= 10) {
    const disputeRate = user.disputedVerifications / user.verificationCount;

    if (disputeRate > 0.30) {
      // Demote one tier (minimum Tier 1)
      const newTier = Math.max(1, user.trustLevel - 1);

      await prisma.user.update({
        where: { id: userId },
        data: { trustLevel: newTier },
      });

      await prisma.userAuditLog.create({
        data: {
          userId,
          action: 'TIER_DEMOTION',
          details: {
            fromTier: user.trustLevel,
            toTier: newTier,
            reason: 'High dispute rate',
            disputeRate,
          },
        },
      });
    }
  }

  // Check for suspicious patterns
  const recentActivity = await getRecentActivity(userId, '1h');

  if (recentActivity.verifications > 50) {
    await suspendUser(userId, 'Rapid-fire submissions detected');
  }
}
```

### Manual Override

Admins can manually adjust trust levels:

```typescript
async function adminSetTrustLevel(
  adminId: string,
  targetUserId: string,
  newTier: number,
  reason: string
): Promise<void> {
  // Verify admin permissions
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (admin?.trustLevel !== 4) {
    throw new Error('Unauthorized');
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    throw new Error('User not found');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: { trustLevel: newTier },
    }),
    prisma.userAuditLog.create({
      data: {
        userId: targetUserId,
        action: 'TIER_MANUAL_CHANGE',
        details: {
          fromTier: targetUser.trustLevel,
          toTier: newTier,
          reason,
          adminId,
        },
      },
    }),
  ]);
}
```

---

## Migration Strategy

### Phase 1: Add Optional Accounts (Weeks 1-4)

**Goal**: Introduce accounts without disrupting existing users

**Changes**:
- Deploy auth system (Clerk/NextAuth)
- Add User table and related models
- Make userId nullable on VerificationLog/VoteLog
- Add "Sign Up" and "Log In" buttons
- Anonymous usage continues to work exactly as before

**User Experience**:
- Existing flows unchanged
- New "Create Account" CTA on site
- Benefits messaging ("Get better rate limits!")

### Phase 2: Incentivize Accounts (Weeks 5-8)

**Goal**: Encourage account creation through better experience

**Changes**:
- Implement tiered rate limits
- Implement CAPTCHA reduction for Tier 1+
- Add verification history for logged-in users
- Add trust level display and progress indicators

**User Experience**:
- Anonymous: Same as before
- Registered: Noticeably better rate limits
- Display "X verifications until Trusted status"

### Phase 3: Require Accounts for Submissions (Weeks 9-12)

**Goal**: Move verification submissions to authenticated users only

**Changes**:
- Require login for new verifications
- Require login for voting
- Keep anonymous read access

**User Experience**:
- Can browse/search without account
- Must log in to verify or vote
- Clear messaging explaining why

### Migration Timeline

```
Week 1-2:   Auth provider setup, database migrations
Week 3-4:   API implementation, testing
Week 5-6:   Frontend integration
Week 7-8:   Rate limit & CAPTCHA tier integration
Week 9-10:  Soft launch (optional accounts)
Week 11:    Incentivize accounts (announce benefits)
Week 12+:   Monitor, iterate, eventually require accounts
```

### Data Migration

For existing verifications/votes (anonymous):
- Keep all existing data
- userId = null for historical records
- Continue tracking by IP for anonymous actions
- No attempt to link historical data to new accounts

---

## API Changes

### New Auth Routes

```typescript
// =============================================================================
// Authentication Routes
// =============================================================================

// POST /api/v1/auth/register
// Register a new account
interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}
interface RegisterResponse {
  success: true;
  data: {
    user: { id: string; email: string; trustLevel: number };
    message: string; // "Verification email sent"
  };
}

// POST /api/v1/auth/login
// Log in with email/password
interface LoginRequest {
  email: string;
  password: string;
}
interface LoginResponse {
  success: true;
  data: {
    user: { id: string; email: string; trustLevel: number; name?: string };
  };
}
// Sets httpOnly cookies: vmp_access_token, vmp_refresh_token

// POST /api/v1/auth/logout
// Log out and clear session
// Clears cookies, deletes session from database

// POST /api/v1/auth/refresh
// Refresh access token using refresh token
// Uses refresh token from cookie, returns new tokens

// POST /api/v1/auth/verify-email
// Verify email with token
interface VerifyEmailRequest {
  token: string;
}

// POST /api/v1/auth/forgot-password
// Request password reset
interface ForgotPasswordRequest {
  email: string;
}

// POST /api/v1/auth/reset-password
// Reset password with token
interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

// GET /api/v1/auth/me
// Get current user profile
// Requires authentication
interface MeResponse {
  success: true;
  data: {
    user: {
      id: string;
      email: string;
      name?: string;
      displayName?: string;
      trustLevel: number;
      verificationCount: number;
      accurateVerifications: number;
      createdAt: string;
    };
    nextTierProgress?: {
      currentTier: number;
      nextTier: number;
      verificationsNeeded: number;
      currentDisputeRate: number;
      maxDisputeRate: number;
    };
  };
}

// PATCH /api/v1/auth/me
// Update user profile
interface UpdateProfileRequest {
  name?: string;
  displayName?: string;
}

// DELETE /api/v1/auth/me
// Delete account (GDPR)
// Soft deletes user, anonymizes verifications
```

### OAuth Routes

```typescript
// GET /api/v1/auth/google
// Redirect to Google OAuth

// GET /api/v1/auth/google/callback
// Handle Google OAuth callback

// GET /api/v1/auth/github
// Redirect to GitHub OAuth (if enabled)

// GET /api/v1/auth/github/callback
// Handle GitHub OAuth callback
```

### Modified Existing Routes

```typescript
// POST /api/v1/verify
// Now accepts Authorization header
// If authenticated:
//   - Links verification to user
//   - Uses user's tier for rate limiting
//   - May skip CAPTCHA based on tier
// If anonymous:
//   - Works as before (IP-based rate limiting, CAPTCHA required)

// POST /api/v1/verify/:verificationId/vote
// Same authentication behavior as above
// If authenticated:
//   - Links vote to user
//   - Enforces one vote per user (not IP)
```

### Rate Limiter Modification

```typescript
// Current: IP-based rate limiting
// New: Tier-based rate limiting

interface TierRateLimits {
  [tier: number]: {
    verify: { windowMs: number; max: number };
    vote: { windowMs: number; max: number };
    search: { windowMs: number; max: number };
  };
}

const tierRateLimits: TierRateLimits = {
  0: { // Anonymous
    verify: { windowMs: 60 * 60 * 1000, max: 10 },
    vote: { windowMs: 60 * 60 * 1000, max: 20 },
    search: { windowMs: 60 * 1000, max: 60 },
  },
  1: { // Registered
    verify: { windowMs: 60 * 60 * 1000, max: 25 },
    vote: { windowMs: 60 * 60 * 1000, max: 50 },
    search: { windowMs: 60 * 1000, max: 120 },
  },
  2: { // Trusted
    verify: { windowMs: 60 * 60 * 1000, max: 100 },
    vote: { windowMs: 60 * 60 * 1000, max: 200 },
    search: { windowMs: 60 * 1000, max: 300 },
  },
  3: { // Power User
    verify: { windowMs: 60 * 60 * 1000, max: 500 },
    vote: { windowMs: 60 * 60 * 1000, max: 1000 },
    search: { windowMs: 60 * 1000, max: 600 },
  },
  4: { // Admin
    verify: { windowMs: 60 * 1000, max: 9999 },
    vote: { windowMs: 60 * 1000, max: 9999 },
    search: { windowMs: 60 * 1000, max: 9999 },
  },
};
```

### Authorization Header Support

```typescript
// Middleware to extract user from JWT

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Try to get token from cookie first
  let token = req.cookies?.vmp_access_token;

  // Fall back to Authorization header
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    // Anonymous request
    req.user = null;
    req.trustLevel = 0;
    return next();
  }

  try {
    const payload = verifyJWT(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, trustLevel: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      req.user = null;
      req.trustLevel = 0;
      return next();
    }

    req.user = user;
    req.trustLevel = user.trustLevel;
    next();
  } catch (error) {
    // Invalid token - treat as anonymous
    req.user = null;
    req.trustLevel = 0;
    next();
  }
}
```

---

## Privacy Considerations

### Data Minimization

**Required Data**:
- Email address (for authentication and notifications)

**Optional Data**:
- Display name (for public attribution)
- Name (never publicly displayed)

**Never Collected**:
- Phone number
- Address
- Date of birth
- Government IDs

### Data Visibility

| Data | User | Other Users | Admins |
|------|------|-------------|--------|
| Email | ✅ | ❌ | ✅ |
| Display Name | ✅ | ✅ (if set) | ✅ |
| Trust Level | ✅ | ✅ (badge only) | ✅ |
| Verification Count | ✅ | ❌ | ✅ |
| Verification History | ✅ | ❌ | ✅ |
| Account Created | ✅ | ❌ | ✅ |
| Last Login | ❌ | ❌ | ✅ |
| IP Addresses | ❌ | ❌ | ✅ |

### GDPR Compliance

#### Right to Access (Article 15)

```typescript
// GET /api/v1/auth/me/data-export
// Returns all data associated with user account

async function exportUserData(userId: string): Promise<UserDataExport> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      verifications: true,
      votes: true,
      sessions: true,
      auditLogs: true,
    },
  });

  return {
    profile: {
      email: user.email,
      name: user.name,
      displayName: user.displayName,
      trustLevel: user.trustLevel,
      createdAt: user.createdAt,
    },
    verifications: user.verifications.map(v => ({
      id: v.id,
      npi: v.npi,
      planId: v.planId,
      acceptsInsurance: v.acceptsInsurance,
      createdAt: v.createdAt,
    })),
    votes: user.votes.map(v => ({
      verificationId: v.verificationId,
      vote: v.vote,
      createdAt: v.createdAt,
    })),
    loginHistory: user.auditLogs
      .filter(l => l.action === 'LOGIN')
      .map(l => ({
        timestamp: l.createdAt,
        ipAddress: l.ipAddress,
      })),
  };
}
```

#### Right to Erasure (Article 17)

```typescript
// DELETE /api/v1/auth/me
// Deletes user account and anonymizes associated data

async function deleteUserAccount(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Anonymize verifications (keep for data integrity)
    await tx.verificationLog.updateMany({
      where: { userId },
      data: {
        userId: null,
        submittedBy: null,
        notes: null, // Remove potentially identifying notes
      },
    });

    // Remove votes
    await tx.voteLog.deleteMany({
      where: { userId },
    });

    // Remove sessions
    await tx.session.deleteMany({
      where: { userId },
    });

    // Remove OAuth accounts
    await tx.oAuthAccount.deleteMany({
      where: { userId },
    });

    // Soft delete user
    await tx.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        email: `deleted_${userId}@deleted.local`,
        name: null,
        displayName: null,
        passwordHash: null,
      },
    });
  });
}
```

#### Right to Rectification (Article 16)

Users can update their profile via PATCH /api/v1/auth/me

#### Data Portability (Article 20)

Data export endpoint provides JSON export of all user data.

### Cookie Policy

```typescript
// Cookies set by the application:

const cookies = {
  vmp_access_token: {
    purpose: 'Authentication',
    duration: '1 hour',
    type: 'Strictly Necessary',
  },
  vmp_refresh_token: {
    purpose: 'Session persistence',
    duration: '7 days',
    type: 'Strictly Necessary',
  },
};

// Note: No tracking or analytics cookies
// Rate limiting uses server-side storage, not cookies
```

---

## Implementation Checklist

### Phase 1: Foundation

- [ ] Choose and configure auth provider (Clerk/NextAuth)
- [ ] Design and review database schema
- [ ] Create Prisma migrations
- [ ] Set up testing environment

### Phase 2: Backend

- [ ] Implement User model and service
- [ ] Implement Session management
- [ ] Implement JWT token generation/validation
- [ ] Create auth routes (register, login, logout)
- [ ] Create email verification flow
- [ ] Create password reset flow
- [ ] Implement OAuth (Google)
- [ ] Modify rate limiter for tier-based limits
- [ ] Modify CAPTCHA middleware for tier-based skip
- [ ] Add userId to verification and vote flows
- [ ] Write unit tests for auth flows
- [ ] Write integration tests for auth flows

### Phase 3: Frontend

- [ ] Create login/register pages
- [ ] Create email verification page
- [ ] Create password reset pages
- [ ] Add auth state management
- [ ] Create user profile page
- [ ] Add trust level display
- [ ] Create account settings page
- [ ] Add login/logout to navigation
- [ ] Implement "Sign in to verify" prompts

### Phase 4: Trust System

- [ ] Implement promotion check algorithm
- [ ] Implement demotion check algorithm
- [ ] Create trust level cron job
- [ ] Add admin tools for manual tier adjustment
- [ ] Create notification emails for tier changes

### Phase 5: Admin Features

- [ ] Create admin user management page
- [ ] Create audit log viewer
- [ ] Add user search functionality
- [ ] Add ban/suspend functionality
- [ ] Create moderation queue

### Phase 6: Documentation

- [ ] Update API documentation
- [ ] Create user-facing help articles
- [ ] Update privacy policy
- [ ] Update terms of service
- [ ] Create internal runbooks

### Phase 7: Deployment

- [ ] Deploy to staging
- [ ] Conduct security review
- [ ] Conduct penetration testing
- [ ] Load testing for auth endpoints
- [ ] Deploy to production (soft launch)
- [ ] Monitor and iterate

---

## Appendix: Security Considerations

### Password Requirements

```typescript
const passwordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false, // Reduced friction
  maxLength: 128,
  preventCommon: true, // Check against common password list
};
```

### Rate Limiting Auth Endpoints

```typescript
const authRateLimits = {
  login: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 per 15 min
  register: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 per hour
  forgotPassword: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 per hour
  verifyEmail: { windowMs: 60 * 60 * 1000, max: 5 }, // 5 per hour
};
```

### Brute Force Protection

- Account lockout after 5 failed attempts (15 min)
- CAPTCHA required after 3 failed attempts
- Progressive delays between attempts
- Alert admins on suspicious patterns

### Session Security

- Refresh token rotation on every use
- Session invalidation on password change
- Maximum 5 active sessions per user
- Session timeout after 7 days of inactivity
