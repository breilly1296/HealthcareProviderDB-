# VerifyMyProvider Deployment Guide

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

VerifyMyProvider is deployed on Google Cloud Platform using Cloud Run for the backend, Cloud SQL for PostgreSQL, and Vercel for the Next.js frontend. This guide covers the complete deployment process.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Production Architecture                   │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Vercel     │    │  Cloud Run   │    │  Cloud SQL   │  │
│  │   Frontend   │ →  │   Backend    │ →  │  PostgreSQL  │  │
│  │   Next.js    │    │   Express    │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                    │                    │         │
│         │            ┌──────────────┐            │         │
│         │            │   Secret     │            │         │
│         └───────────→│   Manager    │←───────────┘         │
│                      └──────────────┘                       │
│                                                              │
│                      ┌──────────────┐                       │
│                      │    Redis     │                       │
│                      │  (optional)  │                       │
│                      └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### GCP Setup

```bash
# Install gcloud CLI
# https://cloud.google.com/sdk/docs/install

# Login and set project
gcloud auth login
gcloud config set project verifymyprovider

# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com
```

### Local Requirements

- Node.js 18+
- Docker (for local testing)
- PostgreSQL 15 (for local development)

---

## Database Setup

### Cloud SQL Instance

```bash
# Create PostgreSQL instance
gcloud sql instances create verifymyprovider-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=YOUR_PASSWORD \
  --storage-type=SSD \
  --storage-size=10GB

# Create database
gcloud sql databases create healthcare_providers \
  --instance=verifymyprovider-db

# Get connection name
gcloud sql instances describe verifymyprovider-db \
  --format="value(connectionName)"
# Output: verifymyprovider:us-central1:verifymyprovider-db
```

### Database Migration

```bash
# Connect via Cloud SQL Proxy
cloud_sql_proxy -instances=verifymyprovider:us-central1:verifymyprovider-db=tcp:5432

# In another terminal, run migrations
cd packages/backend
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/healthcare_providers" \
  npx prisma migrate deploy
```

---

## Secret Manager Setup

```bash
# Create secrets
echo -n "postgresql://postgres:PASSWORD@/healthcare_providers?host=/cloudsql/verifymyprovider:us-central1:verifymyprovider-db" | \
  gcloud secrets create DATABASE_URL --data-file=-

echo -n "your-admin-secret-key" | \
  gcloud secrets create ADMIN_SECRET --data-file=-

echo -n "your-recaptcha-secret-key" | \
  gcloud secrets create RECAPTCHA_SECRET_KEY --data-file=-

# Optional: Anthropic API key
echo -n "sk-ant-api..." | \
  gcloud secrets create ANTHROPIC_API_KEY --data-file=-

# List secrets
gcloud secrets list
```

---

## Backend Deployment

### Dockerfile

```dockerfile
# packages/backend/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci --workspace=packages/backend --workspace=packages/shared

# Copy source
COPY packages/backend ./packages/backend
COPY packages/shared ./packages/shared

# Build
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/backend

# Production image
FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/node_modules ./node_modules
COPY --from=builder /app/packages/backend/package.json ./
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Prisma client
COPY --from=builder /app/packages/backend/prisma ./prisma
RUN npx prisma generate

EXPOSE 8080

CMD ["node", "dist/index.js"]
```

### Cloud Build

```yaml
# cloudbuild.yaml
steps:
  # Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/verifymyprovider-backend:$COMMIT_SHA'
      - '-f'
      - 'packages/backend/Dockerfile'
      - '.'

  # Push to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/verifymyprovider-backend:$COMMIT_SHA'

  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'verifymyprovider-backend'
      - '--image=gcr.io/$PROJECT_ID/verifymyprovider-backend:$COMMIT_SHA'
      - '--region=us-central1'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--add-cloudsql-instances=verifymyprovider:us-central1:verifymyprovider-db'
      - '--set-secrets=DATABASE_URL=DATABASE_URL:latest,ADMIN_SECRET=ADMIN_SECRET:latest,RECAPTCHA_SECRET_KEY=RECAPTCHA_SECRET_KEY:latest'
      - '--memory=512Mi'
      - '--cpu=1'
      - '--min-instances=0'
      - '--max-instances=10'

images:
  - 'gcr.io/$PROJECT_ID/verifymyprovider-backend:$COMMIT_SHA'
```

### Manual Deploy

```bash
# Build and deploy
gcloud builds submit --config=cloudbuild.yaml

# Or deploy directly
gcloud run deploy verifymyprovider-backend \
  --source=. \
  --region=us-central1 \
  --allow-unauthenticated \
  --add-cloudsql-instances=verifymyprovider:us-central1:verifymyprovider-db \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,ADMIN_SECRET=ADMIN_SECRET:latest
```

---

## Frontend Deployment

### Vercel Setup

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
cd packages/frontend
vercel link

# Set environment variables
vercel env add NEXT_PUBLIC_API_URL production
# Enter: https://verifymyprovider-backend-xxxxx.run.app/api/v1

vercel env add NEXT_PUBLIC_POSTHOG_KEY production
vercel env add NEXT_PUBLIC_RECAPTCHA_SITE_KEY production

# Deploy
vercel --prod
```

### vercel.json

```json
{
  "framework": "nextjs",
  "buildCommand": "cd ../.. && npm run build --workspace=packages/frontend",
  "outputDirectory": ".next",
  "regions": ["iad1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

---

## Cloud Scheduler

### TTL Cleanup Job

```bash
gcloud scheduler jobs create http ttl-cleanup \
  --location=us-central1 \
  --schedule="0 * * * *" \
  --uri="https://verifymyprovider-backend-xxxxx.run.app/api/v1/admin/cleanup-expired" \
  --http-method=POST \
  --headers="X-Admin-Secret=YOUR_ADMIN_SECRET"
```

### NPI Import Jobs

```bash
# Monthly full import
gcloud scheduler jobs create http npi-full-import \
  --location=us-central1 \
  --schedule="0 2 1 * *" \
  --uri="https://verifymyprovider-backend-xxxxx.run.app/api/v1/admin/import-npi" \
  --http-method=POST \
  --headers="X-Admin-Secret=YOUR_ADMIN_SECRET" \
  --message-body='{"type":"full"}'

# Weekly delta import
gcloud scheduler jobs create http npi-delta-import \
  --location=us-central1 \
  --schedule="0 2 * * 0" \
  --uri="https://verifymyprovider-backend-xxxxx.run.app/api/v1/admin/import-npi" \
  --http-method=POST \
  --headers="X-Admin-Secret=YOUR_ADMIN_SECRET" \
  --message-body='{"type":"delta"}'
```

---

## Environment Variables Summary

### Backend (Cloud Run)

| Variable | Source | Required |
|----------|--------|----------|
| DATABASE_URL | Secret Manager | Yes |
| ADMIN_SECRET | Secret Manager | Yes |
| RECAPTCHA_SECRET_KEY | Secret Manager | Prod |
| ANTHROPIC_API_KEY | Secret Manager | No |
| PORT | Cloud Run | Auto (8080) |
| NODE_ENV | Cloud Run | Set to production |
| CORS_ORIGIN | Cloud Run | Frontend URL |

### Frontend (Vercel)

| Variable | Source | Required |
|----------|--------|----------|
| NEXT_PUBLIC_API_URL | Vercel Env | Yes |
| NEXT_PUBLIC_POSTHOG_KEY | Vercel Env | No |
| NEXT_PUBLIC_RECAPTCHA_SITE_KEY | Vercel Env | Prod |

---

## Monitoring

### Cloud Run Logs

```bash
# View logs
gcloud logging read "resource.type=cloud_run_revision" \
  --project=verifymyprovider \
  --limit=100

# Stream logs
gcloud logging tail "resource.type=cloud_run_revision"
```

### Health Check

```bash
# Check backend health
curl https://verifymyprovider-backend-xxxxx.run.app/health

# Check admin health (requires secret)
curl -H "X-Admin-Secret: YOUR_SECRET" \
  https://verifymyprovider-backend-xxxxx.run.app/api/v1/admin/health
```

---

## Rollback Procedure

### Cloud Run

```bash
# List revisions
gcloud run revisions list --service=verifymyprovider-backend

# Route traffic to previous revision
gcloud run services update-traffic verifymyprovider-backend \
  --to-revisions=verifymyprovider-backend-00005-abc=100
```

### Vercel

```bash
# List deployments
vercel ls

# Rollback to previous
vercel rollback
```

---

## Cost Optimization

### Cloud Run Settings

```bash
# Use min-instances=0 for cost savings
# Use cpu-throttling for better idle behavior
gcloud run services update verifymyprovider-backend \
  --min-instances=0 \
  --max-instances=10 \
  --cpu-throttling
```

### Cloud SQL

```bash
# Use db-f1-micro for development
# Scale to db-g1-small or higher for production
# Enable automatic storage increase
```

---

## Security Checklist

### Deployment Security
- [x] Secrets in Secret Manager
- [x] HTTPS only (Cloud Run default)
- [x] CORS configured
- [x] Security headers (Vercel)
- [x] No credentials in code
- [x] IAM least privilege

### Network Security
- [x] Cloud SQL private IP (optional)
- [x] VPC connector (optional)
- [x] Cloud Armor (optional)

---

## Conclusion

The deployment process is **straightforward**:

1. Set up Cloud SQL database
2. Create secrets in Secret Manager
3. Deploy backend to Cloud Run
4. Deploy frontend to Vercel
5. Configure Cloud Scheduler jobs
6. Set up monitoring

Total deployment time: ~30 minutes for initial setup.
