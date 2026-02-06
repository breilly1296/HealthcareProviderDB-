# Authentication Implementation Plan

**Status**: Planning (not yet started)
**Companion doc**: [USER-ACCOUNTS-DESIGN.md](./USER-ACCOUNTS-DESIGN.md) — full design with trust tiers
**Last Updated**: 2025-02-05

---

## Architecture Context

| Component | Technology | Notes |
|-----------|-----------|-------|
| Backend | Express 4.18 on Cloud Run | NOT Next.js API routes |
| Frontend | Next.js 14.2 on Cloud Run | Server components + client components |
| Database | PostgreSQL on Cloud SQL | Via Prisma 5.22 |
| Cache | Redis (ioredis) | Optional; used for rate limiting |
| Session store | None yet | No Redis guarantee in production |

**Key constraint**: Our backend is a standalone Express server, not Next.js API routes. Auth libraries designed for Next.js (Auth.js/NextAuth) expect to own the API layer. This rules out Auth.js as the primary solution unless we add a Next.js API route shim, which adds complexity for no benefit.

---

## Phase 2: Email Verification (Magic Links)

Goal: Optional lightweight accounts. No passwords, no OAuth. Users who want to build reputation can register with an email, click a magic link, and get a persistent session.

### 2.1 Library Evaluation

| Library | Fits our stack? | Pros | Cons | Verdict |
|---------|----------------|------|------|---------|
| **Auth.js (NextAuth)** | Poor | Large ecosystem, many providers | Designed for Next.js API routes; Express adapter is community-maintained and fragile. Assumes it owns the `/api/auth/*` routes. | **Skip for Phase 2** — revisit for Phase 3 OAuth |
| **Lucia** | Deprecated | Clean API, database-agnostic | Officially deprecated (Jan 2025). Author recommends rolling your own with their guide. | **Skip** |
| **Custom JWT** | Good | Full control, no dependencies, matches our Express middleware pattern | Must handle token rotation, cookie security, and email sending ourselves | **Recommended for Phase 2** |
| **Arctic + Oslo** | Good | Lucia author's recommended replacement; Arctic for OAuth, Oslo for tokens/hashing | Lightweight, composable; but Arctic is only needed for Phase 3 OAuth | **Use Oslo for Phase 2, add Arctic for Phase 3** |

**Recommendation**: Custom implementation using **jose** (JWT) + **Oslo** (token generation, hashing) + **Resend** or **SendGrid** (email delivery). This matches our Express middleware pattern, keeps dependencies minimal, and avoids fighting framework-specific auth libraries.

New dependencies for Phase 2:
```
jose          — JWT creation/verification (maintained by Panva, zero deps)
oslo          — Secure token generation, hashing utilities
@node-rs/argon2 — Password hashing (Phase 3, but install now for future)
resend        — Email delivery (magic links, verification emails)
```

### 2.2 Database Changes

#### New `User` model

```prisma
model User {
  id                 String            @id @default(cuid())
  email              String            @unique @db.VarChar(254)
  emailVerified      Boolean           @default(false) @map("email_verified")
  trustLevel         Int               @default(0) @map("trust_level")  // 0=anon, 1=registered, 2=trusted, 3=power, 4=admin
  verificationCount  Int               @default(0) @map("verification_count")
  voteCount          Int               @default(0) @map("vote_count")
  trustScore         Float             @default(0.0) @map("trust_score")
  disputeRate        Float             @default(0.0) @map("dispute_rate")
  status             UserStatus        @default(ACTIVE)
  lastLoginAt        DateTime?         @map("last_login_at") @db.Timestamptz(6)
  createdAt          DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)
  sessions           Session[]
  verificationLogs   VerificationLog[]
  voteLogs           VoteLog[]

  @@index([email], map: "idx_users_email")
  @@index([trustLevel], map: "idx_users_trust_level")
  @@map("users")
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  DELETED
}
```

#### New `Session` model

No Redis requirement — sessions stored in PostgreSQL. This is fine for our scale (< 10K users at launch). If Redis is available, session lookups can be cached there.

```prisma
model Session {
  id         String   @id @default(cuid())
  userId     String   @map("user_id")
  expiresAt  DateTime @map("expires_at") @db.Timestamptz(6)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId], map: "idx_sessions_user_id")
  @@index([expiresAt], map: "idx_sessions_expires_at")
  @@map("sessions")
}
```

#### New `MagicLinkToken` model

```prisma
model MagicLinkToken {
  id        String   @id @default(cuid())
  email     String   @db.VarChar(254)
  tokenHash String   @unique @map("token_hash") @db.VarChar(128)
  expiresAt DateTime @map("expires_at") @db.Timestamptz(6)
  usedAt    DateTime? @map("used_at") @db.Timestamptz(6)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([email], map: "idx_magic_link_email")
  @@index([expiresAt], map: "idx_magic_link_expires")
  @@map("magic_link_tokens")
}
```

#### Modify existing models

Add optional `userId` FK to `VerificationLog`:

```prisma
// In VerificationLog model, add:
  userId  String?  @map("user_id")
  user    User?    @relation(fields: [userId], references: [id], onUpdate: NoAction)

// Add index:
  @@index([userId], map: "idx_vl_user_id")
```

Add optional `userId` FK to `VoteLog`:

```prisma
// In VoteLog model, add:
  userId  String?  @map("user_id")
  user    User?    @relation(fields: [userId], references: [id], onUpdate: NoAction)

// Update unique constraint to allow one vote per user OR per IP:
// Keep existing @@unique([verificationId, sourceIp])
// Add:   @@unique([verificationId, userId])
  @@index([userId], map: "idx_vote_logs_user_id")
```

All new fields are **nullable** — zero impact on existing anonymous flows.

#### Migration SQL (for reference)

```sql
-- Run via: npx prisma migrate dev --name add_user_auth

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "trust_level" INTEGER NOT NULL DEFAULT 0,
  "verification_count" INTEGER NOT NULL DEFAULT 0,
  "vote_count" INTEGER NOT NULL DEFAULT 0,
  "trust_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "dispute_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_login_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "magic_link_tokens" (
  "id" TEXT NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "token_hash" VARCHAR(128) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "magic_link_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "magic_link_tokens_token_hash_key" ON "magic_link_tokens"("token_hash");

-- Add userId to existing tables (nullable, no breaking change)
ALTER TABLE "verification_logs" ADD COLUMN "user_id" TEXT REFERENCES "users"("id");
ALTER TABLE "vote_logs" ADD COLUMN "user_id" TEXT REFERENCES "users"("id");
CREATE INDEX "idx_vl_user_id" ON "verification_logs"("user_id");
CREATE INDEX "idx_vote_logs_user_id" ON "vote_logs"("user_id");
```

### 2.3 Auth Flow: Magic Links

```
1. User clicks "Sign in" → enters email
2. Frontend POST /api/v1/auth/magic-link  { email }
3. Backend:
   a. Generate random token (48 bytes, crypto-safe via oslo)
   b. Hash token with SHA-256, store hash + email + expiry (15 min) in magic_link_tokens
   c. Send email with link: https://verifymyprovider.com/auth/verify?token=<raw_token>
   d. Return 200 { message: "Check your email" }  (same response whether email exists or not)
4. User clicks link in email
5. Frontend GET /auth/verify?token=<raw_token>  (Next.js page)
6. Frontend POST /api/v1/auth/verify-magic-link  { token }
7. Backend:
   a. Hash the incoming token
   b. Look up hash in magic_link_tokens, check not expired, check not used
   c. Mark token as used (set usedAt)
   d. Find or create User by email, set emailVerified=true
   e. Create Session (30-day expiry), generate JWT
   f. Set httpOnly cookie: vmp_session=<jwt>
   g. Return 200 { user: { id, email, trustLevel } }
8. Frontend redirects to previous page or home
```

#### JWT Structure

```json
{
  "sub": "<user_id>",
  "sid": "<session_id>",
  "email": "<email>",
  "tl": 1,
  "iat": 1706000000,
  "exp": 1706086400
}
```

- **Access token**: 24-hour lifetime, stored in httpOnly cookie
- **No refresh token** for Phase 2 — when access token expires, user clicks a new magic link
- **Session**: 30 days in DB. JWT is checked against the session on each request. If session is deleted/expired, JWT is rejected even if not expired itself.

#### Cookie Configuration

```typescript
res.cookie('vmp_session', jwt, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
  domain: process.env.NODE_ENV === 'production' ? '.verifymyprovider.com' : undefined,
});
```

**Cross-origin note**: The frontend and backend are on different Cloud Run URLs. In production, after the Cloud Armor LB setup (ISSUE-011), both will be behind `verifymyprovider.com` (frontend at `/`, backend at `/api/*`), so cookies with `domain=.verifymyprovider.com` will work. Until then, we need `sameSite: 'none'` + `secure: true` for cross-origin cookies, or proxy API calls through Next.js middleware.

### 2.4 Backend Code Changes

#### New files

```
packages/backend/src/
  middleware/
    auth.ts              — extractUser middleware (reads JWT, attaches user to req)
  routes/
    auth.ts              — POST /magic-link, POST /verify-magic-link, POST /logout, GET /me
  services/
    auth.ts              — createMagicLink, verifyMagicLink, createSession, validateSession
    email.ts             — sendMagicLinkEmail (via Resend SDK)
  config/
    auth.ts              — JWT_SECRET, SESSION_DURATION, MAGIC_LINK_EXPIRY, etc.
```

#### `auth.ts` middleware (the critical piece)

This middleware is **optional** — it extracts the user if a valid session exists but never blocks requests. Route handlers decide whether to require auth.

```typescript
// Pseudocode for packages/backend/src/middleware/auth.ts

export async function extractUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.vmp_session;
  if (!token) {
    req.user = null;  // Anonymous — always allowed
    return next();
  }

  try {
    const payload = await jwtVerify(token, JWT_SECRET);
    const session = await prisma.session.findUnique({ where: { id: payload.sid } });

    if (!session || session.expiresAt < new Date()) {
      req.user = null;  // Expired session
      return next();
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      trustLevel: payload.tl,
      sessionId: payload.sid,
    };
  } catch {
    req.user = null;  // Invalid token — treat as anonymous, don't error
  }

  next();
}

// Helper for routes that REQUIRE auth
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(AppError.unauthorized('Authentication required'));
  }
  next();
}
```

#### Modify existing middleware

**Rate limiter** — add tier-aware limits:

```typescript
// In rateLimiter.ts, modify createRateLimiter to accept a tierOverrides option:
// If req.user exists and has trustLevel >= 1, use higher limits

const TIER_MULTIPLIERS: Record<number, number> = {
  0: 1,     // Anonymous: base limits
  1: 2.5,   // Registered: 25/hr verify (vs 10), 50/hr vote (vs 20)
  2: 10,    // Trusted: 100/hr verify, 200/hr vote
  3: 50,    // Power: 500/hr verify, 1000/hr vote
  4: Infinity, // Admin: unlimited
};
```

**CAPTCHA middleware** — skip for trusted users:

```typescript
// In captcha.ts, add early return:
if (req.user && req.user.trustLevel >= 2) {
  return next(); // Trusted users skip CAPTCHA
}
```

#### Modify verification/vote routes

In `routes/verify.ts`:

```typescript
// POST /verify — link to user if authenticated
router.post('/', verificationRateLimiter, verifyCaptcha, asyncHandler(async (req, res) => {
  const body = submitVerificationSchema.parse(req.body);

  // If user is logged in, attach userId and use email as submittedBy
  const userId = req.user?.id ?? null;
  const submittedBy = req.user?.email ?? body.submittedBy ?? null;

  const result = await submitVerification({ ...body, userId, submittedBy });
  // ... rest unchanged
}));
```

### 2.5 Frontend Code Changes

#### New pages

```
packages/frontend/src/app/
  auth/
    page.tsx            — "Sign in with email" form
    verify/
      page.tsx          — Magic link landing page (reads token from URL, calls API)
```

#### New components

```
packages/frontend/src/components/
  auth/
    SignInForm.tsx       — Email input + submit button
    UserMenu.tsx        — Avatar/email dropdown in header (sign out, my verifications)
```

#### New context

```
packages/frontend/src/context/
  AuthContext.tsx        — React context providing { user, isLoading, signOut }
                          Calls GET /api/v1/auth/me on mount to check session
```

#### Header changes

In the `<Header>` component, add a conditional:
- **Not logged in**: Show "Sign in" link
- **Logged in**: Show user avatar/initial + dropdown menu

#### Verification form changes

In `InsuranceList.tsx` (verification modal): if user is logged in, pre-fill the email field and show "Submitting as [email]" instead of asking for email.

### 2.6 Email Delivery

**Service**: Resend (https://resend.com)
- Free tier: 100 emails/day, 3,000/month — more than enough for Phase 2
- Simple SDK: `resend.emails.send({ from, to, subject, html })`
- Supports custom domain sending (configure `noreply@verifymyprovider.com`)
- No self-hosted SMTP needed

**Magic link email template** (plain text + HTML):

```
Subject: Sign in to VerifyMyProvider

Click the link below to sign in. This link expires in 15 minutes.

https://verifymyprovider.com/auth/verify?token=<token>

If you didn't request this, you can safely ignore this email.
```

**GCP Secret Manager**: Add `RESEND_API_KEY` secret.

**Deploy workflow**: Add `RESEND_API_KEY=RESEND_API_KEY:latest` to backend secrets in `deploy.yml` and `deploy-staging.yml`.

### 2.7 Migration Path

1. **All existing anonymous verifications remain valid** — no data loss, no changes to existing records.
2. **userId columns are nullable** — existing records have `NULL` userId, which is correct.
3. **Claiming past verifications**: Users can optionally claim past verifications that were submitted with their email address:
   - After first login, run a query: `UPDATE verification_logs SET user_id = ? WHERE submitted_by = ? AND user_id IS NULL`
   - Show the user: "We found X verifications you submitted previously. Claim them?"
   - Only claim if `submittedBy` matches the verified email exactly.
4. **No forced login** — anonymous usage always available. The sign-in prompt is a soft CTA, not a gate.

### 2.8 Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Magic link interception | Links are single-use + expire in 15 min. Token is hashed in DB. |
| Email enumeration | Same response for existing and non-existing emails |
| Session fixation | New session ID created on every login |
| CSRF | httpOnly + sameSite=lax cookies. State-changing requests require POST. |
| JWT secret rotation | Store `JWT_SECRET` in GCP Secret Manager. Support two active secrets during rotation (verify against both). |
| Session hijacking | Sessions bound to DB. Admin can revoke any session. |
| Rate limiting magic links | Max 5 magic link requests per email per hour |

---

## Phase 3: Full Accounts (Future)

### 3.1 What Gets Added

#### Password support
- Add `passwordHash` (nullable) to User model
- Use `@node-rs/argon2` (already in Phase 2 deps for future-proofing)
- New routes: `POST /auth/register` (email + password), `POST /auth/login` (email + password)
- Password reset flow via email token (same pattern as magic links)
- Argon2id with recommended parameters: `memoryCost: 19456, timeCost: 2, parallelism: 1`

#### OAuth providers
- Use **Arctic** library (from Lucia author) for OAuth flows
- Google: high priority (most users have Google accounts)
- Apple: medium priority (required for iOS app if we build one)
- New model: `OAuthAccount` (provider, providerAccountId, userId)
- Account linking: if OAuth email matches existing user, link accounts

#### Saved providers / favorites
- New model: `SavedProvider` (userId, providerNpi, createdAt)
- Frontend: heart/star icon on provider cards, "My Providers" page
- Simple CRUD, no complex logic

#### Email alerts for plan changes
- New model: `AlertSubscription` (userId, providerNpi, planId?, alertType, createdAt)
- Backend cron job (Cloud Scheduler): when a provider's plan acceptance changes, query subscriptions, send emails
- Alert types: plan status change, new verification, confidence drop

#### Reputation badges
- Frontend-only display based on User.trustLevel
- Badge names: Newcomer (0), Contributor (1), Trusted (2), Expert (3), Admin (4)
- Show on verification cards: "Verified by a Trusted contributor"
- Leaderboard page (optional): top contributors by verification count

#### Pro tier (Stripe integration)
- Not scoped yet — depends on product direction
- Potential features: bulk verification, API access, priority support, ad-free
- Stripe Checkout for payment, webhooks for subscription management
- New model: `Subscription` (userId, stripeCustomerId, plan, status, currentPeriodEnd)

### 3.2 Database additions for Phase 3

```prisma
// Add to User model:
  passwordHash    String?  @map("password_hash")
  oauthAccounts   OAuthAccount[]
  savedProviders  SavedProvider[]
  alertSubs       AlertSubscription[]

model OAuthAccount {
  id                String  @id @default(cuid())
  userId            String  @map("user_id")
  provider          String  @db.VarChar(20)  // "google", "apple"
  providerAccountId String  @map("provider_account_id") @db.VarChar(200)
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("oauth_accounts")
}

model SavedProvider {
  id          Int      @id @default(autoincrement())
  userId      String   @map("user_id")
  providerNpi String   @map("provider_npi") @db.VarChar(10)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, providerNpi])
  @@map("saved_providers")
}

model AlertSubscription {
  id          String   @id @default(cuid())
  userId      String   @map("user_id")
  providerNpi String   @map("provider_npi") @db.VarChar(10)
  planId      String?  @map("plan_id") @db.VarChar(50)
  alertType   String   @db.VarChar(30)  // "status_change", "new_verification", "confidence_drop"
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId], map: "idx_alert_subs_user_id")
  @@index([providerNpi], map: "idx_alert_subs_npi")
  @@map("alert_subscriptions")
}
```

---

## Effort Estimates

### Phase 2: Magic Link Auth

| Task | Files | Effort | Notes |
|------|-------|--------|-------|
| Prisma schema + migration | 1 | 2 hrs | User, Session, MagicLinkToken models; alter VerificationLog/VoteLog |
| Auth service (magic link flow) | 2 | 4 hrs | Token generation, verification, session creation |
| Auth routes | 1 | 3 hrs | /magic-link, /verify-magic-link, /logout, /me |
| Auth middleware (extractUser) | 1 | 2 hrs | JWT verification, session lookup |
| Email service (Resend) | 1 | 2 hrs | Magic link email template + sending |
| Rate limiter tier integration | 1 | 2 hrs | Modify existing rate limiter to check req.user.trustLevel |
| CAPTCHA tier bypass | 1 | 30 min | Skip CAPTCHA for trustLevel >= 2 |
| Modify verify/vote routes | 1 | 1 hr | Attach userId to submissions |
| Frontend: AuthContext | 1 | 2 hrs | Session check on mount, sign out |
| Frontend: Sign in page | 2 | 3 hrs | Email form + magic link landing page |
| Frontend: Header user menu | 1 | 2 hrs | Avatar dropdown, sign out |
| Frontend: Verification form update | 1 | 1 hr | Pre-fill email if logged in |
| GCP secrets + deploy config | 3 | 1 hr | JWT_SECRET, RESEND_API_KEY, workflow updates |
| Cookie/CORS configuration | 1 | 2 hrs | Cross-origin cookies or API proxy setup |
| Testing | - | 4 hrs | Auth flow e2e, edge cases, session expiry |
| **Total Phase 2** | | **~31 hrs** | **~4 working days** |

### Phase 3: Full Accounts

| Task | Effort | Notes |
|------|--------|-------|
| Password auth (register + login + reset) | 6 hrs | Argon2 hashing, reset email flow |
| OAuth (Google + Apple) | 8 hrs | Arctic integration, account linking |
| Saved providers | 4 hrs | CRUD + frontend UI |
| Email alerts | 12 hrs | Subscription model, Cloud Scheduler job, email templates |
| Reputation badges | 4 hrs | Frontend display, trust level progression logic |
| Pro tier (Stripe) | 16 hrs | Checkout, webhooks, subscription model, gating |
| GDPR compliance (data export + deletion) | 6 hrs | /me/data-export, /me (DELETE), anonymization |
| **Total Phase 3** | **~56 hrs** | **~7 working days** |

---

## Dependencies and Prerequisites

### Before starting Phase 2

- [ ] ISSUE-011 (Cloud Armor LB) should be completed first — needed for same-domain cookies between frontend and backend
- [ ] Create Resend account and verify `verifymyprovider.com` sending domain
- [ ] Add GCP secrets: `JWT_SECRET` (generate 256-bit random), `RESEND_API_KEY`
- [ ] Decide: proxy API through Next.js middleware (simpler cookies) vs cross-origin cookies (simpler architecture)

### Infrastructure notes

- **No Redis required** for Phase 2. Sessions stored in PostgreSQL. The existing Redis integration (rate limiting) is optional and unaffected.
- **No new Cloud Run services**. Auth routes are added to the existing backend.
- **Database migration**: Run via `prisma migrate deploy` in CI (add to deploy workflow) or manually via Cloud SQL proxy.
- **Rollback**: All schema changes are additive (nullable columns, new tables). Rolling back means deploying the previous backend version; the new tables/columns are harmless.
