# Prompt Analysis: 05-audit-logging.md

**Type:** Security/Operations
**Quality Rating:** 4/5

## Intent/Goal
To define the logging strategy, emphasizing the difference between this project (Simple/Debug) and the sister project (HIPAA/Compliance).

## Components
- **Scope Definition:** "Much simpler than OwnMyHealth".
- **Include/Exclude Lists:** Explicitly lists what to log (Verifications, Rate Limits) and what to exclude (Passwords, PII).
- **Current Implementation:** Mentions `requestLogger.ts` is already implemented with JSON structured logging.

## Gaps/Improvements
- **Retention:** The "Retention Policy" section is a placeholder question ("[Duration]") rather than a defined policy (e.g., "30 days in Cloud Logging").
- **Alerting:** Could mention connecting logs to alerts (e.g., "Alert if 500s > 1%").

## Analysis
Good pragmatic guide. It stops over-engineering by explicitly lowering the bar compared to the HIPAA product. Confirms that structured logging is already in place.
