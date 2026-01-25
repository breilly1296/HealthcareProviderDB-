# VerifyMyProvider Deployment Guide Analysis

**Last Updated:** January 25, 2026
**Platform:** Google Cloud Platform (GCP)
**Services:** Cloud Run, Cloud SQL, Cloud Storage

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Cloud Platform                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐         ┌─────────────┐                    │
│  │   Cloud     │◄───────►│   Cloud     │                    │
│  │    Run      │         │    SQL      │                    │
│  │  (Backend)  │         │ (PostgreSQL)│                    │
│  └─────────────┘         └─────────────┘                    │
│        ▲                                                     │
│        │ HTTPS                                               │
│        ▼                                                     │
│  ┌─────────────┐                                            │
│  │   Cloud     │                                            │
│  │    Run      │                                            │
│  │ (Frontend)  │                                            │
│  └─────────────┘                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
          ▲
          │ HTTPS
          ▼
    ┌───────────┐
    │   Users   │
    └───────────┘
```

---

## Live URLs

| Service | URL |
|---------|-----|
| Frontend | https://verifymyprovider.com |
| Backend | https://verifymyprovider-backend-*.run.app |
| GitHub | https://github.com/[repo] |
| GCP Console | https://console.cloud.google.com |

---

## Cloud Run Configuration

### Backend
- **Image:** Built from `packages/backend`
- **Region:** us-central1
- **Instances:** min=1, max=1 (for rate limiting)
- **Memory:** 512MB
- **CPU:** 1
- **Port:** 3001

### Frontend
- **Image:** Built from `packages/frontend`
- **Region:** us-central1
- **Memory:** 512MB
- **CPU:** 1
- **Port:** 3000

---

## Database Configuration

### Cloud SQL
- **Instance:** verifymyprovider-db
- **Type:** PostgreSQL 15
- **Region:** us-central1
- **Tier:** db-f1-micro (development)
- **Storage:** 10GB SSD

### Connection
```
DATABASE_URL="postgresql://postgres:[PASSWORD]@[IP]:5432/providerdb"
```

---

## CI/CD Pipeline

### GitHub Actions

```yaml
# On push to main:
1. Run tests
2. Build Docker images
3. Push to Container Registry
4. Deploy to Cloud Run
5. Health check
```

### Deployment Trigger
- Push to `main` branch
- Manual trigger via GitHub Actions

---

## Environment Variables

### Backend (Cloud Run)
```
DATABASE_URL=<from Secret Manager>
NODE_ENV=production
PORT=3001
ADMIN_SECRET=<from Secret Manager>
RECAPTCHA_SECRET_KEY=<from Secret Manager>
FRONTEND_URL=https://verifymyprovider.com
```

### Frontend (Cloud Run)
```
NEXT_PUBLIC_API_URL=https://verifymyprovider-backend-*.run.app/api/v1
NODE_ENV=production
```

---

## Deployment Commands

### Manual Deployment

```bash
# Backend
cd packages/backend
gcloud builds submit --tag gcr.io/[PROJECT]/verifymyprovider-backend
gcloud run deploy verifymyprovider-backend \
  --image gcr.io/[PROJECT]/verifymyprovider-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated

# Frontend
cd packages/frontend
gcloud builds submit --tag gcr.io/[PROJECT]/verifymyprovider-frontend
gcloud run deploy verifymyprovider-frontend \
  --image gcr.io/[PROJECT]/verifymyprovider-frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### View Deployment Status

```bash
gcloud run services describe verifymyprovider-backend --region us-central1
gcloud run services describe verifymyprovider-frontend --region us-central1
```

---

## Database Migrations

### Run Migrations
```bash
# From packages/backend
npx prisma migrate deploy
```

### Check Migration Status
```bash
npx prisma migrate status
```

---

## Monitoring

### View Logs
```bash
# Backend logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=verifymyprovider-backend" --limit 50

# Errors only
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit 50
```

### Health Check
```bash
curl https://verifymyprovider-backend-*.run.app/health
```

---

## Rollback Procedure

### Rollback to Previous Revision
```bash
# List revisions
gcloud run revisions list --service verifymyprovider-backend --region us-central1

# Route traffic to previous revision
gcloud run services update-traffic verifymyprovider-backend \
  --to-revisions=[REVISION_NAME]=100 \
  --region us-central1
```

---

## Scaling Considerations

### Current (Single Instance)
- maxInstances=1 for rate limiting
- Suitable for beta launch

### Scaling Up (Requires Changes)
1. Implement Redis-based rate limiting
2. Configure Cloud Memorystore
3. Update maxInstances
4. Add load balancing

---

## Cost Estimates

### Current (Development)
| Service | Monthly Cost |
|---------|-------------|
| Cloud Run (Backend) | ~$20 |
| Cloud Run (Frontend) | ~$20 |
| Cloud SQL (f1-micro) | ~$10 |
| **Total** | **~$50** |

### Production (Scaled)
| Service | Monthly Cost |
|---------|-------------|
| Cloud Run (2-4 instances) | ~$100 |
| Cloud SQL (db-g1-small) | ~$50 |
| Cloud Memorystore | ~$50 |
| **Total** | **~$200** |

---

## Security Checklist

### Pre-Deployment
- [ ] Secrets in Secret Manager
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] Database migrations run

### Post-Deployment
- [ ] Health check passes
- [ ] SSL certificate active
- [ ] Rate limiting working
- [ ] Error logging configured

---

## Troubleshooting

### Common Issues

**502 Bad Gateway**
- Check Cloud Run logs
- Verify database connection
- Check container startup

**Database Connection Failed**
- Verify DATABASE_URL
- Check Cloud SQL IP whitelist
- Test connection from Cloud Shell

**Deployment Failed**
- Check build logs
- Verify Dockerfile
- Check memory limits

---

*Deployment process is automated via GitHub Actions*
