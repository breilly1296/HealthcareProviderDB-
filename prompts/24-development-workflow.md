---
tags:
  - documentation
  - workflow
type: prompt
priority: 1
---

# Generate DEV_WORKFLOW.md

## Purpose
Document the development workflow and golden rule for VerifyMyProvider.

## Questions to Ask

### Golden Rule
1. What's the #1 rule for code changes?
   - Expected: ALL code changes happen in Claude Code → Push to GitHub → Auto-deploys
   - **NEVER edit code in Google Cloud Shell** (it's a dead end)

2. Why is this rule so important?
   - Cloud Shell edits don't persist
   - Won't trigger auto-deploy
   - Can't be version controlled

### Tool Usage

**Claude Code (Local Machine):**
1. What should Claude Code be used for?
   - Writing/editing code
   - Fixing bugs
   - Adding features
   - Running local tests
   - Git commits and pushes

2. What should Claude Code NEVER be used for?
   - (Probably nothing - it's the primary tool)

**Google Cloud Shell / gcloud CLI:**
1. What should gcloud be used for?
   - Database commands
   - Running SQL queries
   - Checking Cloud Run logs
   - GCP infrastructure changes
   - One-off admin tasks

2. What should gcloud NEVER be used for?
   - Editing code
   - Making fixes that need to deploy

### Development Flow

1. What's the typical workflow for fixing a bug?
   - Step-by-step process from discovery to deployed

2. What's the typical workflow for adding a feature?

3. How do you test changes before deploying?
   - Local testing?
   - Staging environment?
   - Test in production?

### Common Tasks

**Fix a Bug:**
1. How do you fix a bug?
2. How long does it take to see changes live?

**Add a Feature:**
1. How do you add a feature?
2. Any special considerations?

**Run Database Queries:**
1. How do you connect to the database?
2. What's the password? (Reference Proton Pass)
3. Common queries you run?

**Check Deployment Status:**
1. How do you know if deployment succeeded?
2. Where to check (GitHub Actions? GCP Console?)

**View Logs:**
1. What command to view backend logs?
2. What command to view frontend logs?
3. How to filter for errors?

### Quick Reference

1. What are the live URLs?
   - Frontend
   - Backend
   - GitHub
   - GCP Console

2. What credentials are needed?
   - Database password location
   - Project ID
   - Database IP

3. What are the most common commands?
   - Connect to DB
   - View logs
   - Check deployment

### Troubleshooting Workflow

1. What do you do when something breaks?
   - Check logs?
   - Roll back?
   - Hot fix?

2. What's the process for emergency fixes?

3. Any war stories or lessons learned about workflow mistakes?

## Output Format

```markdown
# VerifyMyProvider Development Workflow

**Last Updated:** [Date]

## Golden Rule

**ALL code changes happen in Claude Code → Push to GitHub → Auto-deploys**

Never edit code in Google Cloud Shell. It's a dead end.

---

## What Each Tool Is For

### Claude Code (Local Machine)
✅ **USE FOR:**
- [list]

❌ **NEVER USE FOR:**
- [list if any]

### Google Cloud Shell / gcloud CLI
✅ **USE FOR:**
- [list]

❌ **NEVER USE FOR:**
- [list]

---

## Development Flow

```
[ASCII diagram showing flow from Claude Code → GitHub → GCP]
```

---

## Common Tasks

### Fix a Bug
[Step-by-step]

### Add a Feature
[Step-by-step]

### Run Database Queries
[Commands]

### Check Deployment Status
[How to check]

### View Logs
```bash
[commands]
```

---

## Quick Reference

| Task | Tool | Command/Action |
|------|------|----------------|
[table of common tasks]

---

## URLs

- **Frontend:** [url]
- **Backend:** [url]
- **GitHub:** [url]
- **GCP Console:** [url]

---

## Credentials (Proton Pass: "VerifyMyProvider GCP")

- **Database password:** [reference to Proton Pass]
- **Project ID:** [value]
- **Database IP:** [value]

---

## Emergency Procedures

### Something Broke in Production
[What to do]

### Need to Rollback
[How to rollback]

### Database Connection Lost
[How to fix]
```
