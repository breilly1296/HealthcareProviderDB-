# VerifyMyProvider Architecture Documentation

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

VerifyMyProvider uses a modern monorepo architecture with separate frontend, backend, and shared packages. The system is designed for scalability, maintainability, and clear separation of concerns.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VerifyMyProvider                              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                         Client Layer                            │ │
│  │                                                                 │ │
│  │  ┌─────────────────┐    ┌─────────────────┐                   │ │
│  │  │    Browser      │    │    Mobile       │                   │ │
│  │  │   (Next.js)     │    │   (Future)      │                   │ │
│  │  └─────────────────┘    └─────────────────┘                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                         API Layer                               │ │
│  │                                                                 │ │
│  │  ┌─────────────────┐    ┌─────────────────┐                   │ │
│  │  │   REST API      │    │   Rate Limiter  │                   │ │
│  │  │   (Express)     │    │   + CAPTCHA     │                   │ │
│  │  └─────────────────┘    └─────────────────┘                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                       Service Layer                             │ │
│  │                                                                 │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │ │
│  │  │ Provider │ │ Verify   │ │ Location │ │ Scoring  │         │ │
│  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │         │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                        Data Layer                               │ │
│  │                                                                 │ │
│  │  ┌─────────────────┐    ┌─────────────────┐                   │ │
│  │  │   PostgreSQL    │    │     Redis       │                   │ │
│  │  │   (Prisma ORM)  │    │   (optional)    │                   │ │
│  │  └─────────────────┘    └─────────────────┘                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
HealthcareProviderDB/
├── packages/
│   ├── frontend/          # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/       # App Router pages
│   │   │   ├── components/# React components
│   │   │   ├── hooks/     # Custom hooks
│   │   │   ├── lib/       # Utilities
│   │   │   └── contexts/  # React contexts
│   │   ├── public/        # Static assets
│   │   └── package.json
│   │
│   ├── backend/           # Express.js backend
│   │   ├── src/
│   │   │   ├── routes/    # API routes
│   │   │   ├── services/  # Business logic
│   │   │   ├── middleware/# Express middleware
│   │   │   ├── schemas/   # Zod schemas
│   │   │   ├── utils/     # Utilities
│   │   │   └── etl/       # NPI import pipeline
│   │   ├── prisma/        # Database schema
│   │   └── package.json
│   │
│   └── shared/            # Shared types and utilities
│       ├── src/
│       │   ├── types/     # TypeScript types
│       │   └── utils/     # Shared utilities
│       └── package.json
│
├── package.json           # Root workspace config
├── tsconfig.json          # Root TypeScript config
└── .env.example           # Environment template
```

---

## Package Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                    Dependency Graph                          │
│                                                              │
│      frontend ──────────────────────┐                       │
│          │                          │                       │
│          │                          ▼                       │
│          │                    ┌──────────┐                  │
│          └──────────────────→ │  shared  │                  │
│                               └──────────┘                  │
│                                     ▲                       │
│                                     │                       │
│      backend ───────────────────────┘                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| Next.js 14+ | React framework |
| React 18 | UI library |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| React Query | Data fetching |
| Lucide React | Icons |
| PostHog | Analytics |

### Backend

| Technology | Purpose |
|------------|---------|
| Express.js | HTTP server |
| TypeScript | Type safety |
| Prisma | ORM |
| Zod | Validation |
| ioredis | Redis client |
| node-fetch | HTTP client |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| PostgreSQL 15 | Primary database |
| Redis | Rate limiting cache |
| Cloud Run | Backend hosting |
| Vercel | Frontend hosting |
| Cloud SQL | Managed PostgreSQL |
| Secret Manager | Secrets storage |

---

## Data Flow

### Read Flow (Provider Search)

```
┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
│ Client │ →  │ Next.js│ →  │Express │ →  │Postgres│
└────────┘    └────────┘    └────────┘    └────────┘
     │                           │              │
     │  1. User searches        │              │
     │  2. API request          │              │
     │                          │  3. Query    │
     │                          │              │
     │  5. Render results       │  4. Results  │
     └──────────────────────────┴──────────────┘
```

### Write Flow (Submit Verification)

```
┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
│ Client │ →  │CAPTCHA │ →  │  Rate  │ →  │Express │ →  │Postgres│
└────────┘    └────────┘    │ Limiter│    └────────┘    └────────┘
     │                      └────────┘         │              │
     │  1. User submits                        │              │
     │  2. Get CAPTCHA token                   │              │
     │  3. Validate rate limit                 │              │
     │                                         │  4. Insert   │
     │  6. Confirmation                        │  5. Score    │
     └─────────────────────────────────────────┴──────────────┘
```

---

## Service Layer

### Provider Service

```typescript
// packages/backend/src/services/providerService.ts

export const providerService = {
  async search(query: SearchQuery): Promise<SearchResult> {
    // Build Prisma query from search params
    // Apply pagination
    // Return providers with location data
  },

  async getByNpi(npi: string): Promise<Provider | null> {
    // Find provider by NPI
    // Include related data
  },

  async getPlans(npi: string): Promise<PlanAcceptance[]> {
    // Get all plan acceptance records
    // Include confidence scores
  },

  async getColocated(npi: string): Promise<Provider[]> {
    // Find providers at same location
  }
};
```

### Verification Service

```typescript
// packages/backend/src/services/verificationService.ts

export const verificationService = {
  async submit(data: VerificationInput): Promise<Verification> {
    // Check for duplicate (Sybil prevention)
    // Create verification log
    // Update or create plan acceptance
    // Recalculate confidence score
  },

  async vote(verificationId: string, vote: 'up' | 'down', ip: string) {
    // Check for existing vote
    // Update vote counts
    // Recalculate confidence score
  },

  async getStats(): Promise<VerificationStats> {
    // Aggregate verification metrics
  }
};
```

### Scoring Service

```typescript
// packages/backend/src/services/scoringService.ts

export const scoringService = {
  calculateConfidence(input: ConfidenceInput): number {
    // Count component (0-40)
    // Recency component (0-30)
    // Voting component (0-20)
    // Source component (0-10)
    // Return 0-100 score
  },

  async updateScore(providerNpi: string, planId: string): Promise<void> {
    // Aggregate all verifications
    // Calculate new score
    // Update plan acceptance record
  }
};
```

---

## Middleware Pipeline

```
Request
   │
   ▼
┌──────────────────┐
│   CORS           │  Allow configured origins
└──────────────────┘
   │
   ▼
┌──────────────────┐
│   Rate Limiter   │  Check IP-based limits
└──────────────────┘
   │
   ▼
┌──────────────────┐
│   CAPTCHA        │  Verify on write endpoints
└──────────────────┘
   │
   ▼
┌──────────────────┐
│   Validation     │  Zod schema validation
└──────────────────┘
   │
   ▼
┌──────────────────┐
│   Route Handler  │  Business logic
└──────────────────┘
   │
   ▼
┌──────────────────┐
│   Error Handler  │  Consistent error responses
└──────────────────┘
   │
   ▼
Response
```

---

## Database Schema

### Core Entities

```
┌──────────────────┐     ┌──────────────────┐
│     Provider     │     │    Location      │
├──────────────────┤     ├──────────────────┤
│ npi (PK)         │────→│ id (PK)          │
│ entityType       │     │ addressLine1     │
│ firstName        │     │ city             │
│ lastName         │     │ state            │
│ specialty        │     │ zipCode          │
│ address...       │     │ healthSystem     │
│ locationId (FK)  │     │ providerCount    │
└──────────────────┘     └──────────────────┘
        │
        │
        ▼
┌──────────────────┐     ┌──────────────────┐
│ PlanAcceptance   │     │ VerificationLog  │
├──────────────────┤     ├──────────────────┤
│ id (PK)          │←────│ id (PK)          │
│ providerNpi (FK) │     │ providerNpi (FK) │
│ planId           │     │ planId           │
│ acceptanceStatus │     │ verificationType │
│ confidenceScore  │     │ sourceIp         │
│ lastVerified     │     │ upvotes          │
│ expiresAt        │     │ downvotes        │
└──────────────────┘     │ expiresAt        │
                         └──────────────────┘
                                 │
                                 │
                                 ▼
                         ┌──────────────────┐
                         │    VoteLog       │
                         ├──────────────────┤
                         │ id (PK)          │
                         │ verificationId   │
                         │ sourceIp         │
                         │ vote             │
                         └──────────────────┘
```

---

## Key Design Decisions

### 1. No User Authentication (MVP)

**Decision:** Anonymous crowdsourcing without user accounts
**Rationale:**
- Lower friction = more verifications
- CAPTCHA + rate limiting prevents abuse
- Public data doesn't require auth

### 2. NPI as Primary Key

**Decision:** Use NPI number as provider primary key
**Rationale:**
- NPI is unique national identifier
- No synthetic key needed
- Direct lookups by NPI

### 3. TTL-Based Expiration

**Decision:** 6-month TTL on verification data
**Rationale:**
- ~12% annual provider turnover
- Encourages fresh verifications
- Reduces stale data

### 4. Dual-Mode Rate Limiting

**Decision:** Redis preferred, in-memory fallback
**Rationale:**
- Redis for multi-instance deployments
- In-memory for single instance/development
- Graceful degradation

---

## Scalability Considerations

### Horizontal Scaling

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    └─────────────────┘
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
    ┌──────────┐     ┌──────────┐     ┌──────────┐
    │ Cloud Run│     │ Cloud Run│     │ Cloud Run│
    │ Instance │     │ Instance │     │ Instance │
    └──────────┘     └──────────┘     └──────────┘
           │                │                │
           └────────────────┼────────────────┘
                            ▼
                    ┌─────────────────┐
                    │     Redis       │
                    │ (Rate Limiting) │
                    └─────────────────┘
                            │
                            ▼
                    ┌─────────────────┐
                    │   Cloud SQL     │
                    │   (PostgreSQL)  │
                    └─────────────────┘
```

### Performance Targets

| Metric | Target |
|--------|--------|
| API response time (p95) | < 200ms |
| Search results | < 500ms |
| Verification submission | < 1s |
| Concurrent users | 1,000+ |

---

## Conclusion

The architecture is **well-designed for the MVP**:

- ✅ Clean separation of concerns
- ✅ Type-safe with TypeScript
- ✅ Scalable with Cloud Run
- ✅ Maintainable monorepo structure
- ✅ Clear data flow patterns
- ✅ Appropriate technology choices

The system is ready for production deployment.
