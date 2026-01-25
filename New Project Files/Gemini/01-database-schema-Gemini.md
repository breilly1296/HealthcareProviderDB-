# Prompt Analysis: 01-database-schema.md

**Type:** Security Audit
**Quality Rating:** 5/5

## Intent/Goal
To guide a comprehensive security and performance review of the database schema (`schema.prisma`), focusing on the project's specific "No HIPAA" constraint.

## Components
- **Context Header:** Defines architecture (Prisma, Postgres, Cloud SQL).
- **Checklist:** Specific items for Schema Security, RLS (not needed), Core Tables, and Indexes.
- **Specifics:** Lists *exact* existing indexes to verify (e.g., `Provider(state, specialtyCode)`).
- **New Features:** explicitly checks for "Jan 2026" features like `Location` model.
- **Questions:** Strategic questions about soft-deletes and N+1 queries.

## Gaps/Improvements
- **Migration Check:** Could add a specific check for "Down migrations" or rollback plans.
- **Data Integrity:** Could add checks for specific check constraints (e.g., `confidence_score BETWEEN 0 AND 100`).

## Analysis
High-quality, executable prompt. It acts as a "state of the union" for the database. The explicit listing of indexes makes it easy for an agent to verify if the code matches the documentation.
