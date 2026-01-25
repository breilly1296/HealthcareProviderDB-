# Prompt Analysis: 11-environment-secrets.md

**Type:** Security Audit
**Quality Rating:** 4/5

## Intent/Goal
To ensure secrets are managed correctly (Secret Manager vs .env) and not hardcoded.

## Components
- **File List:** Checks `.env.example` and `src/index.ts`.
- **Inventory:** Asks for a table of secrets (`DATABASE_URL`, `ADMIN_SECRET`).
- **CI/CD:** Asks how secrets are accessed in the pipeline.

## Gaps/Improvements
- **Detection:** Could include a grep command to hunt for potential hardcoded secrets (like `grep -r "API_KEY" .`).

## Analysis
Solid, standard security check. Essential for preventing credential leaks.
