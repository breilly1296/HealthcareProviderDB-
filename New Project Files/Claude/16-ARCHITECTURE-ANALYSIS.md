# VerifyMyProvider Architecture Analysis

**Last Updated:** January 25, 2026
**Type:** Monorepo with Backend + Frontend packages
**Hosting:** Google Cloud Platform

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        VerifyMyProvider                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────┐      ┌────────────────────┐             │
│  │    Frontend        │      │     Backend        │             │
│  │    (Next.js)       │─────►│     (Express)      │             │
│  │                    │ API  │                    │             │
│  │  - React 18        │      │  - TypeScript      │             │
│  │  - Tailwind CSS    │      │  - Prisma ORM      │             │
│  │  - App Router      │      │  - Zod validation  │             │
│  └────────────────────┘      └─────────┬──────────┘             │
│                                        │                         │
│                                        │ SQL                     │
│                                        ▼                         │
│                              ┌────────────────────┐             │
│                              │    PostgreSQL      │             │
│                              │    (Cloud SQL)     │             │
│                              │                    │             │
│                              │  - Providers       │             │
│                              │  - Plans           │             │
│                              │  - Verifications   │             │
│                              └────────────────────┘             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
HealthcareProviderDB/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── routes/         # API endpoints
│   │   │   ├── services/       # Business logic
│   │   │   ├── middleware/     # Express middleware
│   │   │   └── index.ts        # Entry point
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Database schema
│   │   │   └── migrations/     # Migration history
│   │   └── package.json
│   │
│   └── frontend/
│       ├── src/
│       │   ├── app/            # Next.js App Router
│       │   ├── components/     # React components
│       │   ├── context/        # React contexts
│       │   └── lib/            # Utilities, API client
│       ├── public/             # Static assets
│       └── package.json
│
├── scripts/                    # Import & maintenance scripts
├── prisma/                     # Root-level Prisma (shared)
├── docs/                       # Documentation
├── prompts/                    # Analysis prompts
└── package.json                # Root monorepo config
```

---

## Technology Stack

### Backend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Node.js 18+ | JavaScript runtime |
| Framework | Express.js | HTTP server |
| Language | TypeScript | Type safety |
| ORM | Prisma | Database access |
| Validation | Zod | Input validation |
| Security | Helmet | Security headers |

### Frontend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | Next.js 14 | React framework |
| UI | React 18 | UI library |
| Styling | Tailwind CSS | Utility CSS |
| State | React Context | State management |
| Routing | App Router | File-based routing |
| Analytics | PostHog | User analytics |

### Database

| Component | Technology | Purpose |
|-----------|------------|---------|
| Database | PostgreSQL 15 | Relational database |
| Hosting | Cloud SQL | Managed database |
| ORM | Prisma | Type-safe queries |

### Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| Compute | Cloud Run | Serverless containers |
| CI/CD | GitHub Actions | Automated deployment |
| Registry | Container Registry | Docker images |
| DNS | Cloud DNS | Domain management |

---

## Data Flow

### Provider Search Flow

```
User → Frontend → GET /api/v1/providers/search
                          ↓
                    Rate Limiter
                          ↓
                    Zod Validation
                          ↓
                    Prisma Query
                          ↓
                    PostgreSQL
                          ↓
                    Format Response
                          ↓
                    Return JSON
```

### Verification Flow

```
User → Frontend → POST /api/v1/verify
                          ↓
                    Rate Limiter (10/hr)
                          ↓
                    CAPTCHA Verification
                          ↓
                    Zod Validation
                          ↓
                    Sybil Check (IP/email)
                          ↓
                    Create VerificationLog
                          ↓
                    Recalculate Confidence
                          ↓
                    Update Acceptance
                          ↓
                    Return Success
```

---

## Key Design Decisions

### 1. Monorepo Structure
**Decision:** Single repo with packages
**Rationale:**
- Shared dependencies
- Atomic commits
- Simpler CI/CD

### 2. Separate Backend/Frontend
**Decision:** Express backend, Next.js frontend
**Rationale:**
- Independent scaling
- API-first design
- Flexibility for mobile app

### 3. Prisma ORM
**Decision:** Use Prisma instead of raw SQL
**Rationale:**
- Type safety
- Migrations
- Developer experience

### 4. In-Memory Rate Limiting
**Decision:** Process-local rate limiting
**Rationale:**
- Simple implementation
- Sufficient for single instance
- Redis planned for scale

### 5. Anonymous Verifications
**Decision:** No authentication required
**Rationale:**
- Lower friction
- Cold start problem
- Rate limiting sufficient

---

## Database Schema (Simplified)

```
┌─────────────┐      ┌──────────────┐      ┌───────────────┐
│  Provider   │      │InsurancePlan │      │   Location    │
│─────────────│      │──────────────│      │───────────────│
│ npi (PK)    │      │ planId (PK)  │      │ id (PK)       │
│ firstName   │      │ planName     │      │ addressLine1  │
│ lastName    │      │ issuerName   │      │ city, state   │
│ specialty   │      │ planType     │      │ zipCode       │
│ locationId  │◄─────│ state        │      │ providerCount │
└──────┬──────┘      └──────┬───────┘      └───────────────┘
       │                    │
       │    ┌───────────────┴───────────────┐
       │    │                               │
       ▼    ▼                               ▼
┌──────────────────────────┐      ┌────────────────────┐
│ProviderPlanAcceptance    │      │  VerificationLog   │
│──────────────────────────│      │────────────────────│
│ id (PK)                  │      │ id (PK)            │
│ providerNpi (FK)         │      │ providerNpi (FK)   │
│ planId (FK)              │      │ planId (FK)        │
│ acceptanceStatus         │      │ verificationType   │
│ confidenceScore          │      │ sourceIp           │
│ verificationCount        │      │ upvotes/downvotes  │
│ expiresAt (TTL)          │      │ expiresAt (TTL)    │
└──────────────────────────┘      └────────────────────┘
```

---

## API Structure

### Route Organization

```
/api/v1/
├── /providers
│   ├── GET /search
│   ├── GET /cities
│   ├── GET /:npi
│   ├── GET /:npi/plans
│   └── GET /:npi/colocated
│
├── /plans
│   ├── GET /search
│   ├── GET /grouped
│   ├── GET /meta/issuers
│   ├── GET /meta/types
│   ├── GET /:planId
│   └── GET /:planId/providers
│
├── /verify
│   ├── POST /
│   ├── POST /:verificationId/vote
│   ├── GET /stats
│   ├── GET /recent
│   └── GET /:npi/:planId
│
├── /locations
│   ├── GET /search
│   ├── GET /health-systems
│   ├── GET /stats/:state
│   ├── GET /:locationId
│   └── GET /:locationId/providers
│
└── /admin
    ├── POST /cleanup-expired
    ├── GET /expiration-stats
    └── GET /health
```

---

## Security Architecture

### Layers

```
Request → CORS → Helmet → Rate Limiter → CAPTCHA → Validation → Handler
```

### Security Features

| Layer | Implementation |
|-------|----------------|
| CORS | Whitelist-based |
| Headers | Helmet.js |
| Rate Limiting | IP-based, per-endpoint |
| Bot Protection | reCAPTCHA v3 |
| Input Validation | Zod schemas |
| SQL Injection | Prisma parameterization |
| Admin Auth | X-Admin-Secret header |

---

## Scalability Considerations

### Current (Single Instance)
- Sufficient for beta (~100 users)
- Rate limiting works correctly
- ~$50/month

### Scaling Path

1. **Vertical** - Increase instance size
2. **Horizontal** - Multiple instances (requires Redis)
3. **Database** - Upgrade Cloud SQL tier
4. **Caching** - Add Cloud Memorystore

### Bottlenecks to Watch
- Database connections
- Rate limiter storage
- Search query performance

---

## Recommendations

### Immediate
- None critical

### Before Scale
1. Redis for rate limiting
2. Database connection pooling
3. Query optimization

### Future
1. CDN for static assets
2. Read replicas
3. Caching layer

---

*Architecture is appropriate for current phase and has clear scaling path*
