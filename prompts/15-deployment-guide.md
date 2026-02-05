---
tags:
  - documentation
  - infrastructure
  - implemented
type: prompt
priority: 2
updated: 2026-02-05
---

# Deployment Guide

## Purpose
Generate a deployment guide for VerifyMyProvider covering local development setup, Docker containerization, and Google Cloud Platform production deployment.

## Files to Review
- `docker-compose.yml` (full-stack Docker Compose)
- `docker-compose.dev.yml` (dev database only)
- `packages/backend/Dockerfile` (backend container)
- `packages/frontend/Dockerfile` (frontend container)
- `.github/workflows/deploy.yml` (CI/CD pipeline)
- `.env.example` (environment variable reference)
- `package.json` (root workspace scripts)
- `packages/backend/package.json`, `packages/frontend/package.json` (workspace scripts)

## Current Deployment Architecture
- **Local dev:** `docker-compose.dev.yml` (PostgreSQL) + `npm run dev` (backend + frontend natively)
- **CI/CD:** GitHub Actions on push to `main` → Docker build → GCP Artifact Registry → Cloud Run
- **Production:** Google Cloud Run (backend + frontend as separate services) + Cloud SQL PostgreSQL
- **Secrets:** GCP Secret Manager (`DATABASE_URL`, `ANTHROPIC_API_KEY`) + GitHub Actions secrets
- **Auth:** Workload Identity Federation (no long-lived service account keys)

## Questions to Ask
1. What are the prerequisites for local development (Node version, Docker, etc.)?
2. Are there any manual setup steps for a new developer (database seeding, env files)?
3. What is the process for deploying a hotfix vs a normal release?
4. How do you roll back a bad deployment on Cloud Run?
5. Are there any post-deployment verification steps (smoke tests, health checks)?

## Checklist
- [x] Local development with Docker Compose (database)
- [x] Backend Dockerfile (Node 20, non-root user, health check)
- [x] Frontend Dockerfile (Node 20, Next.js standalone, health check)
- [x] GitHub Actions CI/CD pipeline
- [x] Workload Identity Federation (keyless auth)
- [x] Cloud Run deployment with scale-to-zero
- [x] Secret Manager integration
- [ ] Staging environment
- [ ] Rollback automation
- [ ] Post-deploy smoke tests
