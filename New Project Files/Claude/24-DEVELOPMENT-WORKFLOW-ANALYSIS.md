# VerifyMyProvider Development Workflow

**Last Updated:** January 25, 2026

---

## Golden Rule

> **ALL code changes happen in Claude Code → Push to GitHub → Auto-deploys**
>
> **Never edit code in Google Cloud Shell. It's a dead end.**

---

## Why This Rule Matters

| Cloud Shell Edits | Claude Code Edits |
|-------------------|-------------------|
| Don't persist | Saved in git |
| Won't auto-deploy | Triggers CI/CD |
| Not version controlled | Full history |
| Can't be reviewed | PR reviews |
| Will be lost | Permanent |

---

## What Each Tool Is For

### Claude Code (Local Machine)

**USE FOR:**
- Writing/editing code
- Fixing bugs
- Adding features
- Running local tests
- Git commits and pushes
- Reading/understanding code
- Refactoring

**WORKFLOW:**
```
1. Make changes in Claude Code
2. Test locally
3. Commit and push
4. GitHub Actions deploys automatically
5. Verify in production
```

### Google Cloud Shell / gcloud CLI

**USE FOR:**
- Database queries (psql)
- Viewing Cloud Run logs
- GCP infrastructure changes
- One-off admin tasks
- Checking deployment status
- Database migrations (via SSH)

**NEVER USE FOR:**
- Editing application code
- Making fixes that need to deploy

---

## Development Flow

```
┌─────────────────┐
│  Claude Code    │
│  (Local)        │
│                 │
│  Write code     │
│  Run tests      │
│  Git commit     │
└────────┬────────┘
         │ git push
         ▼
┌─────────────────┐
│    GitHub       │
│                 │
│  Triggers       │
│  Actions        │
└────────┬────────┘
         │ Auto-deploy
         ▼
┌─────────────────┐
│   Cloud Run     │
│                 │
│  Backend        │
│  Frontend       │
└─────────────────┘
```

---

## Common Tasks

### Fix a Bug

```
1. Identify bug in logs or testing
2. Find relevant file in Claude Code
3. Make the fix
4. Test locally if possible
5. Commit with descriptive message
6. Push to main
7. Wait for GitHub Actions (~3-5 min)
8. Verify fix in production
```

### Add a Feature

```
1. Plan the feature (files to change)
2. Implement in Claude Code
3. Add tests if appropriate
4. Test locally
5. Commit and push
6. Monitor deployment
7. Test in production
```

### Run Database Queries

```bash
# Connect to Cloud SQL from Cloud Shell
gcloud sql connect verifymyprovider-db --user=postgres

# Password: (from Proton Pass: "VerifyMyProvider GCP")

# Example queries
SELECT COUNT(*) FROM providers;
SELECT state, COUNT(*) FROM providers GROUP BY state;
```

### Check Deployment Status

```bash
# Via gcloud
gcloud run services describe verifymyprovider-backend --region us-central1

# Via GitHub
# Check Actions tab for latest deployment status
```

### View Logs

```bash
# Backend logs (last 50)
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=verifymyprovider-backend" --limit 50

# Errors only
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit 20

# Filter by time
gcloud logging read "timestamp >= \"2026-01-25T00:00:00Z\"" --limit 100
```

---

## Quick Reference

| Task | Tool | Command/Action |
|------|------|----------------|
| Edit code | Claude Code | Direct edit |
| Commit changes | Claude Code | `git commit` |
| Push to deploy | Claude Code | `git push` |
| View logs | gcloud | `gcloud logging read...` |
| Query database | gcloud | `gcloud sql connect...` |
| Check deployment | GitHub | Actions tab |
| Run migrations | gcloud | SSH + `npx prisma migrate` |

---

## URLs

| Resource | URL |
|----------|-----|
| Frontend | https://verifymyprovider.com |
| Backend | https://verifymyprovider-backend-*.run.app |
| GitHub | https://github.com/[repo] |
| GCP Console | https://console.cloud.google.com |

---

## Credentials

### Database (Proton Pass: "VerifyMyProvider GCP")
- **Host:** 35.223.46.51
- **Database:** providerdb
- **User:** postgres
- **Password:** (see Proton Pass)

### GCP
- **Project ID:** [your-project-id]
- **Region:** us-central1

---

## Emergency Procedures

### Something Broke in Production

```
1. Check logs for errors
   gcloud logging read "severity>=ERROR" --limit 20

2. Identify the problematic commit
   git log --oneline -10

3. Option A: Fix forward
   - Make fix in Claude Code
   - Push immediately

4. Option B: Rollback
   gcloud run services update-traffic verifymyprovider-backend \
     --to-revisions=[PREVIOUS_REVISION]=100 \
     --region us-central1
```

### Need to Rollback

```bash
# List recent revisions
gcloud run revisions list --service verifymyprovider-backend --region us-central1

# Route to previous revision
gcloud run services update-traffic verifymyprovider-backend \
  --to-revisions=verifymyprovider-backend-00002-abc=100 \
  --region us-central1
```

### Database Connection Lost

```
1. Check Cloud SQL status
   gcloud sql instances describe verifymyprovider-db

2. Check if instance is running
   - May need to start if stopped

3. Verify connection string
   - Check DATABASE_URL format
   - Verify password hasn't changed

4. Test connection
   gcloud sql connect verifymyprovider-db --user=postgres
```

---

## Local Development Setup

### Prerequisites
- Node.js 18+
- Git
- gcloud CLI

### First Time Setup
```bash
# Clone repository
git clone [repo-url]
cd HealthcareProviderDB

# Install dependencies
npm install

# Copy environment files
cp .env.example .env
# Edit .env with local values

# Start backend
cd packages/backend
npm run dev

# Start frontend (new terminal)
cd packages/frontend
npm run dev
```

### Daily Development
```bash
# Pull latest
git pull

# Start development servers
npm run dev  # from root (if configured)
# or start backend/frontend separately
```

---

## Git Workflow

### Commit Messages
```
Format: <type>: <description>

Types:
- feat: New feature
- fix: Bug fix
- refactor: Code refactoring
- docs: Documentation
- chore: Maintenance

Examples:
- feat: Add rate limiting to verification endpoint
- fix: Correct confidence score calculation
- refactor: Split routes into separate files
```

### Branching (Optional)
```
main: Production (auto-deploys)
feature/x: Development (merge to main when ready)
```

---

## Troubleshooting Workflow Issues

### Changes Not Deploying

1. Check GitHub Actions status
2. Look for build errors
3. Verify push reached GitHub (`git log --oneline`)
4. Re-push if needed

### Local Server Won't Start

1. Check port not in use
2. Verify environment variables
3. Check database connection
4. Clear node_modules and reinstall

---

*Remember: Claude Code → GitHub → Deploy. Never Cloud Shell for code.*
