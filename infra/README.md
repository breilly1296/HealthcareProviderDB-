# infra/

Infrastructure-as-code for VerifyMyProvider. Everything GCP-side that can be re-created from the repo lives here.

This is the start of IaC for the project — Cloud Run service definitions, Cloud SQL instances, Secret Manager entries, VPC config, etc. are still click-ops today and will migrate in here incrementally.

## Layout

```
infra/
├── README.md       # (this file)
├── alerts/         # Cloud Monitoring log-based metrics + alert policies (IM-06)
│   ├── cloud-monitoring-alerts.sh
│   ├── README.md
│   └── policies/
│       ├── backend-5xx.json
│       ├── backend-startup-crash.json
│       ├── backend-uptime-failure.json     # IM-32: synthetic-check alert
│       ├── captcha-fail-open.json
│       ├── frontend-uptime-failure.json    # IM-32: synthetic-check alert
│       └── liveness-probe-failures.json
├── scheduler/      # Cloud Scheduler jobs for backend cleanup/retention endpoints (IM-14)
│   ├── cloud-scheduler-jobs.sh
│   └── README.md
└── uptime/         # Cloud Monitoring Uptime Checks against /health and / (IM-32)
    ├── cloud-uptime-checks.sh
    └── README.md
```

## Why shell + JSON, not Terraform?

Right now there's one environment (`verifymyprovider-prod`), one maintainer, and a handful of resources. Terraform's state backend, module layout, and CI integration would be more setup than the current surface area justifies. We'll migrate when:

- a staging project exists with its own stack, **or**
- more than ~10 alert policies / dashboards / service configs accumulate, **or**
- multiple people are editing GCP config concurrently and need state locking.

Until then, idempotent `gcloud` scripts + checked-in JSON policy definitions are the contract. Each subdirectory owns its own README explaining prerequisites and how to apply.

## Conventions

- Scripts must be **idempotent** — safe to re-run. Check-then-create or update-in-place, never blind create.
- Scripts must support **`--dry-run`** — print every mutating command without executing.
- Scripts must accept **`--project=...`** or honor **`GCP_PROJECT_ID`** — no hard-coded project IDs in the mutating path.
- Policy / config files are **JSON** (not YAML) so they're valid input to `gcloud ... --policy-from-file` etc. directly.
- No secrets in this directory. Secret values stay in Secret Manager; scripts reference them by name.

## Related

- Deploy workflows: `.github/workflows/deploy.yml`, `deploy-staging.yml` — these configure Cloud Run probes that the alerts in `alerts/` depend on.
- Migration workflow: `.github/workflows/test.yml` — `prisma migrate diff` job runs on PR; `db:migrate:deploy` runs at deploy time.
