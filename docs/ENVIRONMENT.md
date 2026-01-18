# Environment Variables

This document describes all environment variables used by VerifyMyProvider.

## Backend (packages/backend)

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `NODE_ENV` | Environment mode | `development` or `production` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` (dev), `8080` (Cloud Run) |
| `FRONTEND_URL` | Additional CORS origin (Cloud Run URL) | None (only production domains allowed) |
| `ADMIN_SECRET` | Secret for admin endpoints (cleanup jobs) | None (admin endpoints disabled) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | `60000` (1 minute) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |

### CORS Configuration

The backend allows requests from:
- `https://verifymyprovider.com`
- `https://www.verifymyprovider.com`
- Value of `FRONTEND_URL` (if set)
- `http://localhost:3000` and `http://localhost:3001` (development only)

## Frontend (packages/frontend)

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `https://api.verifymyprovider.com/api/v1` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics project key | None (analytics disabled) |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | Enable/disable analytics | `true` if PostHog key is set |
| `ANTHROPIC_API_KEY` | Claude API key for insurance card OCR | None (OCR feature disabled) |

> **Note:** Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Never put secrets in `NEXT_PUBLIC_` variables.

## GCP Secret Manager

These secrets are stored in Google Cloud Secret Manager and injected into Cloud Run services:

| Secret Name | Used By | Description |
|-------------|---------|-------------|
| `DATABASE_URL` | Backend | PostgreSQL connection string (Cloud SQL) |
| `ANTHROPIC_API_KEY` | Frontend | Claude API key for insurance card OCR |

### Creating Secrets

```bash
# Create DATABASE_URL secret
echo -n "postgresql://user:pass@/db?host=/cloudsql/project:region:instance" | \
  gcloud secrets create DATABASE_URL --data-file=-

# Create ANTHROPIC_API_KEY secret
echo -n "sk-ant-..." | \
  gcloud secrets create ANTHROPIC_API_KEY --data-file=-
```

## GitHub Actions Secrets

These secrets are configured in GitHub repository settings for CI/CD:

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation provider |
| `GCP_SERVICE_ACCOUNT` | Service account email for deployments |
| `FRONTEND_URL` | Cloud Run frontend URL (for backend CORS) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics key |

## Local Development Setup

### 1. Backend Setup

```bash
# Copy example file
cp packages/backend/.env.example packages/backend/.env

# Edit with your values
# Required: DATABASE_URL (local PostgreSQL or Cloud SQL proxy)
```

**packages/backend/.env:**
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/healthcare_providers"
PORT=3001
NODE_ENV=development

# Optional: Enable admin endpoints locally
ADMIN_SECRET=local-dev-secret
```

### 2. Frontend Setup

```bash
# Copy example file
cp packages/frontend/.env.example packages/frontend/.env.local

# Edit with your values
```

**packages/frontend/.env.local:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1

# Optional: Analytics (usually not needed for local dev)
# NEXT_PUBLIC_POSTHOG_KEY=phc_...

# Optional: Insurance card OCR
# ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Using Docker Compose

If using docker-compose for local development, environment variables are configured in `docker-compose.yml`. No `.env` files needed.

```bash
docker-compose up
```

## Production Deployment

### Cloud Run Environment Variables

Set via `deploy.yml` workflow:

**Backend:**
- `NODE_ENV=production`
- `FRONTEND_URL` (from GitHub secret)
- `DATABASE_URL` (from GCP Secret Manager)

**Frontend:**
- `NODE_ENV=production`
- `NEXT_PUBLIC_API_URL` (built into image at build time)
- `ANTHROPIC_API_KEY` (from GCP Secret Manager)

### Build-Time vs Runtime Variables

| Type | When Set | Example |
|------|----------|---------|
| Build-time | During `docker build` | `NEXT_PUBLIC_API_URL` |
| Runtime | When container starts | `DATABASE_URL`, `ANTHROPIC_API_KEY` |

> **Important:** `NEXT_PUBLIC_*` variables must be set at build time for Next.js. They are baked into the JavaScript bundle.

## Generating Secrets

### ADMIN_SECRET

```bash
# Generate a secure random secret
openssl rand -hex 32
```

### Database Password

```bash
# Generate a secure database password
openssl rand -base64 24
```

## Troubleshooting

### Backend won't start

1. Check `DATABASE_URL` format:
   ```
   postgresql://USER:PASSWORD@HOST:PORT/DATABASE
   ```

2. For Cloud SQL with Unix socket:
   ```
   postgresql://USER:PASSWORD@/DATABASE?host=/cloudsql/PROJECT:REGION:INSTANCE
   ```

### CORS errors

1. Verify `FRONTEND_URL` matches your frontend's origin exactly
2. Check the backend logs for `[CORS] Blocked request from origin:`
3. In development, ensure `NODE_ENV=development` is set

### Admin endpoints return 503

This is expected if `ADMIN_SECRET` is not configured. Set the secret to enable admin endpoints:

```bash
# In GCP Secret Manager
gcloud secrets create ADMIN_SECRET --data-file=- <<< "your-secret"

# Update Cloud Run to use it
gcloud run services update verifymyprovider-backend \
  --update-secrets=ADMIN_SECRET=ADMIN_SECRET:latest
```

### PostHog analytics not working

1. Verify `NEXT_PUBLIC_POSTHOG_KEY` is set at build time
2. Check browser console for PostHog initialization errors
3. Ensure ad blockers aren't blocking PostHog requests
