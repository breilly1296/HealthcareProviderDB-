# Docker and CI/CD Pipeline

## Docker

### docker-compose.yml

Production-like configuration with three services:

| Service | Image | Ports | Description |
|---------|-------|-------|-------------|
| `db` | `postgres:15-alpine` | `5432:5432` | PostgreSQL database |
| `backend` | Built from Dockerfile | `3001:8080` | Express API server |
| `frontend` | Built from Dockerfile | `3000:8080` | Next.js application |

### docker-compose.dev.yml

Development override that runs only PostgreSQL for local development. Backend and frontend run directly on the host via `npm run dev`.

### Backend Dockerfile

```dockerfile
FROM node:20

# Create non-root user for security
RUN addgroup --system app && adduser --system --ingroup app app

# Copy and install dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY . .

# Switch to non-root user
USER app

# Health check
HEALTHCHECK CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

EXPOSE 8080
CMD ["node", "dist/index.js"]
```

### Frontend Dockerfile

```dockerfile
FROM node:20

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Next.js standalone output
HEALTHCHECK CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

EXPOSE 8080
CMD ["node", "server.js"]
```

## CI/CD Workflows

### deploy.yml (Production)

**Trigger:** Push to `main` branch.

**Steps:**

1. **Authenticate with GCP** using Workload Identity Federation (no service account keys stored in repository)
2. **Build Docker images** for backend and frontend
3. **Push images** to Google Artifact Registry (`us-central1`)
4. **Deploy backend** to Cloud Run
5. **Deploy frontend** to Cloud Run (depends on backend URL being available)

#### Backend Cloud Run Configuration

| Setting | Value |
|---------|-------|
| Memory | 512Mi |
| CPU | 1 vCPU |
| Min instances | 0 |
| Max instances | 10 |
| Concurrency | 80 requests per instance |

#### Frontend Cloud Run Configuration

Deployed after backend, configured with the backend's URL as an environment variable.

### deploy-staging.yml (Staging)

**Trigger:** Push to `staging` branch.

Same pipeline as production with the following differences:

- Deploys to staging Cloud Run services
- **Max instances: 2** (cost control)
- Uses staging environment variables

### Other Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `playwright.yml` | PR / Push | End-to-end browser tests using Playwright |
| `security-scan.yml` | PR / Scheduled | Static Application Security Testing (SAST) |
| `rollback.yml` | Manual | Rollback Cloud Run to a previous revision |
| `test.yml` | PR | Jest unit and integration tests |

## GCP Infrastructure

### Services Used

| Service | Resource | Description |
|---------|----------|-------------|
| Artifact Registry | `us-central1` | Docker image storage |
| Cloud Run | Backend + Frontend | Serverless container hosting |
| Cloud SQL | `verifymyprovider-db` | Managed PostgreSQL instance |
| Secret Manager | Multiple secrets | Secure credential storage |

### Secret Manager Keys

| Secret | Used By | Description |
|--------|---------|-------------|
| `DATABASE_URL` | Backend | PostgreSQL connection string for Cloud SQL |
| `ANTHROPIC_API_KEY` | Backend | API key for Claude (insurance card analysis) |

### Authentication

Workload Identity Federation is used for CI/CD authentication with GCP. This eliminates the need to store long-lived service account keys in GitHub Secrets, instead using short-lived OIDC tokens issued by GitHub Actions.
