# Security Policy

We take the security of VerifyMyProvider seriously. This document explains how to report a vulnerability, what to expect from us in return, and what is in scope.

## Reporting a Vulnerability

<!-- TODO: Replace security@verifymyprovider.com with the actual monitored mailbox before publishing this file. -->

Please report suspected vulnerabilities by email to **security@verifymyprovider.com**. Do not file public GitHub issues for security reports.

When you write to us, please include as much of the following as you can:

- A clear description of the issue
- Steps to reproduce, including any required configuration, payloads, or test accounts
- Affected components (URL, endpoint, file path, version, or commit SHA)
- Your estimate of the severity and the impact you believe an attacker could achieve

We will acknowledge your report within **48 business hours** and keep you updated as we investigate.

## Disclosure Policy

We follow a coordinated disclosure model with a **90-day window** from the date we acknowledge a valid report.

- We will work with you to understand the issue and ship a fix.
- We will not pursue legal action against researchers who follow this policy in good faith.
- Once a fix is deployed, we will credit you in the changelog and the corresponding entry in `prompts/21-security-vulnerabilities.md` unless you ask to remain anonymous.

If a fix requires more than 90 days, we will tell you why and agree on an extended timeline together.

## Scope

### In scope

- The verifymyprovider.com web application (frontend)
- The API at `/api/v1/*` (backend)
- Authentication flows: magic link, JWT access and refresh tokens, CSRF protection, session management
- Insurance card upload, OCR, encryption at rest, and key rotation
- Admin endpoints under `/api/v1/admin/*`

### Out of scope

- Third-party services we depend on (reCAPTCHA, Resend, PostHog, Anthropic, Google Maps, IPQS) — please report directly to those vendors
- Social engineering attacks against employees, contractors, or users
- Physical attacks against infrastructure
- Denial-of-service testing against production environments
- Findings that require already-compromised credentials or already-installed local malware
- Reports generated solely by automated scanners without a working proof of concept

## Security Updates

Resolved security findings are tracked in `prompts/21-security-vulnerabilities.md` and summarized in the project changelog.

The project uses automated security scanning in CI:

- **Gitleaks** — secret scanning on every push
- **CodeQL** — static analysis for common vulnerability patterns

We aim to keep dependencies current and apply security patches promptly when upstream advisories are published.
