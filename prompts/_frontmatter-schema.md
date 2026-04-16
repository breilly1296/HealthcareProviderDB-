---
tags:
  - meta
  - convention
type: reference
priority: 2
updated: 2026-04-16
---

# Prompt Frontmatter Schema

Every prompt in this directory should start with YAML frontmatter using the schema below. Shared reference docs (files prefixed with `_`) follow the same schema with `type: reference`.

## Required fields

| Field | Values | Purpose |
|---|---|---|
| `tags` | list of strings | Semantic categorization (e.g. `security`, `feature`, `documentation`, `implemented`, `critical`). Used for grouping in the index and filtering. |
| `type` | `prompt` \| `reference` \| `template` \| `meta` | What kind of file this is. `prompt` = intended to be fed to an AI. `reference` = shared context docs referenced by prompts. `template` = Q&A templates for business docs. `meta` = indexes, schemas, collection-level docs. |
| `priority` | `1` \| `2` \| `3` | `1` = critical (security, schema, secrets). `2` = high (features, architecture). `3` = medium (analytics, nice-to-have reviews). |
| `updated` | `YYYY-MM-DD` | Date of last substantive change. Bump when the file is edited for anything other than a typo. |

## Optional fields

| Field | Values | Purpose |
|---|---|---|
| `created` | `YYYY-MM-DD` | Date the file was first created. |
| `role` | `auditor` \| `architect` \| `new-contributor` \| `doc-writer` \| `researcher` | Primary intended audience. Helps users discover relevant prompts. |
| `output_format` | `checklist` \| `document` \| `diff` \| `code` \| `analysis` | Shape of output the prompt expects Claude to produce. |
| `depends_on` | list of prompt filenames | Other prompts / reference docs this one references. |

## Example

```yaml
---
tags:
  - security
  - rate-limiting
  - implemented
type: prompt
priority: 1
updated: 2026-04-16
role: auditor
output_format: checklist
depends_on:
  - _env-vars-reference.md
  - 08-rate-limiting.md
---
```

## Conventions

- Dates: always `YYYY-MM-DD` absolute. Never relative ("last week", "Q1").
- Tags: lowercase, hyphen-separated. Prefer existing tags before inventing new ones.
- Bump `updated:` when: content changes, checklist items flip, files-to-review list changes. Don't bump for pure typo fixes.
- Frontmatter is required. A missing frontmatter block is treated as stale.
