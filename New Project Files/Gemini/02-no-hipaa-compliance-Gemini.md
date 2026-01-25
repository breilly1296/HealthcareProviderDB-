# Prompt Analysis: 02-no-hipaa-compliance.md

**Type:** Compliance Policy
**Quality Rating:** 5/5

## Intent/Goal
To explicitly define and defend the architectural decision *not* to comply with HIPAA, serving as a reference for legal or architectural questions.

## Components
- **Data Classification:** Detailed lists of "What We Store" (Public) vs "What We Don't" (PHI).
- **Example Patterns:** JSON examples of "Safe" vs "Unsafe" data structures.
- **Comparables:** Lists similar non-HIPAA services (Zocdoc, Google Reviews) as precedent.
- **Boundary Definition:** Clearly defines the API boundary with the HIPAA-compliant sister product (OwnMyHealth).

## Gaps/Improvements
- **GDPR/CCPA:** While HIPAA is the focus, it doesn't mention other privacy laws (CCPA/GDPR) which might still apply to "User Verifications" (IP addresses, email if auth added).

## Analysis
This is a critical "Constitution" document for the project. It prevents AI agents (and developers) from over-engineering security or accidentally introducing PHI. The "Safe vs Unsafe" JSON examples are particularly effective.
