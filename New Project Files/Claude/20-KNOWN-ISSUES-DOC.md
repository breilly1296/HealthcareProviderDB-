# Known Issues - VerifyMyProvider

## Overview

This document tracks known issues, limitations, and technical debt in the VerifyMyProvider application. Issues are categorized by area and include severity, impact, and any available workarounds.

---

## Architecture Issues

### Location Enrichment Disabled in admin.ts

**Severity:** Low
**Impact:** Admin cannot trigger location enrichment via the API

The location enrichment functionality in `admin.ts` depends on the old `Location` model, which has been replaced by `practice_locations`. The enrichment endpoints are disabled (commented out or guarded) to prevent runtime errors.

**Workaround:** Location data is sourced directly from the NPI registry during import. Manual enrichment can be performed via database scripts if needed.

**Resolution Path:** Rewrite enrichment logic to target `practice_locations` instead of the old `Location` model.

---

## Development Environment Issues

### SWC ARM64 Workaround Needed

**Severity:** Medium
**Impact:** Build fails on Windows ARM64 + Node.js v24+ without the patch

Next.js 14.x native SWC binaries are incompatible with Node.js v24+ on Windows ARM64. The postinstall script at `packages/frontend/scripts/patch-next-swc.js` patches the WASM fallback list, but this must re-run after every `npm install` that updates the `next` package.

**Workaround:** The postinstall hook handles this automatically. If it fails, apply the patch manually (see Troubleshooting Guide).

**Resolution Path:** Upgrading to a future Next.js version that natively supports win32-arm64 in the WASM fallback list.

---

### OneDrive node_modules Corruption

**Severity:** Medium
**Impact:** Intermittent build failures due to corrupted native binaries

OneDrive file synchronization can corrupt `.node` binary files in `node_modules`. This manifests as random `ENOENT` errors or binary loading failures.

**Workaround:** Use WASM fallbacks where available. Exclude `node_modules` from OneDrive sync. Reinstall dependencies (`rm -rf node_modules && npm install`) when corruption is suspected.

**Resolution Path:** Either exclude the project directory from OneDrive entirely, or move to a non-synced local directory for development.

---

### npm Workspace Hoisting Conflicts

**Severity:** High (when triggered)
**Impact:** Wrong dependency versions resolved, causing runtime errors

Adding framework-specific packages (like `next`) to the root `package.json` causes npm hoisting to resolve the wrong version for workspace packages.

**Workaround:** NEVER put `next` in root `package.json`. Only shared dependencies (prisma, csv-parse, pg) belong at root. Run `npm ls <package>` to verify resolution if uncertain.

**Resolution Path:** This is a structural constraint of the monorepo. Documented and enforced by convention.

---

## Data Issues

### NPI Data Partially Imported

**Severity:** Medium
**Impact:** Only 6 states loaded; full national coverage not yet available

The NPI data pipeline has been tested with 6 states targeting the NYC launch market. The full NPPES dataset covers all US states and territories but has not been fully imported.

**Workaround:** The 6-state subset is sufficient for NYC-focused launch. Additional states can be imported using the existing pipeline.

**Resolution Path:** Run full national import before expanding beyond NYC market.

---

### City Name Quality Issues

**Severity:** Low
**Impact:** Some city names have typos, trailing codes, or inconsistent punctuation

NPI registry data contains city names with quality issues: trailing ZIP fragments, inconsistent capitalization, punctuation errors (e.g., "NEW YORK," with trailing comma, "BROOKLYN  " with trailing spaces).

**Workaround:** A cleanup script (`normalize-city-names.ts`) exists and can be run to normalize city names. The provider search endpoint is case-insensitive and trims whitespace.

**Resolution Path:** Run the cleanup script periodically after data imports. Consider adding normalization to the import pipeline itself.

---

### Stale Provider Addresses

**Severity:** Low
**Impact:** Some provider practice addresses may be outdated

Provider addresses are sourced from the NPI registry, which relies on providers to update their own records. Some addresses may be stale, particularly for providers who have moved practices.

**Workaround:** Community verifications can flag incorrect address information. The verification system provides a mechanism for users to report discrepancies.

**Resolution Path:** This is inherent to NPI data. Regular re-imports from the NPPES dataset will capture updates. No complete fix is possible without an external address verification service.

---

## Security Issues

### No Automated Secret Scanning in CI

**Severity:** Medium
**Impact:** Secrets could accidentally be committed to the repository

The GitHub Actions CI/CD pipeline does not include automated secret scanning (e.g., GitLeaks, TruffleHog). Secrets in committed code would not be caught until manual review.

**Workaround:** Manual code review before merging. Use `.gitignore` to exclude `.env` files. Store all secrets in GitHub Secrets for CI/CD.

**Resolution Path:** Add a secret scanning step to the GitHub Actions workflow (e.g., `gitleaks/gitleaks-action`).

---

### No Cloud Armor / DDoS Protection

**Severity:** Medium
**Impact:** Application relies solely on application-layer rate limiting for abuse prevention

Cloud Run does not have Google Cloud Armor configured for Layer 7 DDoS protection. Rate limiting is handled at the application level (Express middleware), which means the application must process each request before rejecting it.

**Workaround:** Application-level rate limiting (dual-mode Redis/in-memory) provides reasonable protection for current traffic levels. Cloud Run's built-in concurrency limits provide some infrastructure-level protection.

**Resolution Path:** Configure Google Cloud Armor with a security policy attached to a Cloud Run load balancer. This requires migrating from Cloud Run's default ingress to a Global External Application Load Balancer.

---

### .env.example Incomplete

**Severity:** Low
**Impact:** New developers may miss required environment variables during setup

The `.env.example` file does not document all environment variables used by the application. Some variables are only documented in deployment scripts or the Cloud Run configuration.

**Workaround:** Check the Cloud Run service configuration and GitHub Secrets for the complete list of environment variables.

**Resolution Path:** Audit all `process.env` references in the codebase and update `.env.example` with all variables, descriptions, and example values.

---

## Frontend Issues

### No Offline Support / PWA

**Severity:** Low
**Impact:** Application requires an active internet connection for all functionality

The application has no service worker, no offline caching, and no Progressive Web App (PWA) manifest. Users cannot access any content when offline.

**Workaround:** None. An internet connection is required.

**Resolution Path:** Implement a service worker with cache-first strategy for static assets and provider data that has been previously viewed. Add a PWA manifest for installability. This is a low priority given the application's data-centric nature.

---

### No Full Accessibility Audit

**Severity:** Medium
**Impact:** Some components may not meet WCAG 2.1 AA compliance

The frontend has not undergone a comprehensive accessibility audit. While TailwindCSS provides reasonable defaults and semantic HTML is used, specific components (modals, comparison tables, theme toggle) may have gaps in keyboard navigation, screen reader support, or color contrast.

**Workaround:** Basic accessibility is in place (semantic HTML, alt text, form labels). Known issues can be reported and addressed individually.

**Resolution Path:** Conduct a full accessibility audit using axe-core or Lighthouse accessibility scoring. Address findings systematically, prioritizing navigation, forms, and data display components.

---

## Issue Summary

| Issue | Severity | Category | Status |
|---|---|---|---|
| Location enrichment disabled | Low | Architecture | Known, deferred |
| SWC ARM64 workaround | Medium | Development | Workaround in place |
| OneDrive corruption | Medium | Development | Workaround in place |
| npm workspace hoisting | High | Development | Documented convention |
| NPI data partial import | Medium | Data | Planned for expansion |
| City name quality | Low | Data | Cleanup script exists |
| Stale provider addresses | Low | Data | Inherent limitation |
| No secret scanning in CI | Medium | Security | Open |
| No Cloud Armor | Medium | Security | Open |
| .env.example incomplete | Low | Security | Open |
| No offline / PWA support | Low | Frontend | Open |
| No accessibility audit | Medium | Frontend | Open |
