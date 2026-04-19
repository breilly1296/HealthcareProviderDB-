# Cloud Monitoring alerts (IM-06)

Log-based metrics and alert policies for the `verifymyprovider-backend` Cloud Run service, declared as plain shell + JSON so no Terraform toolchain is required.

## Files

```
infra/alerts/
├── cloud-monitoring-alerts.sh   # idempotent apply script
├── README.md                    # (this file)
└── policies/
    ├── backend-5xx.json
    ├── backend-startup-crash.json
    ├── captcha-fail-open.json
    └── liveness-probe-failures.json
```

## Alerts

| Policy | Signal | Threshold | Source metric |
|---|---|---|---|
| Backend 5xx error rate | `httpRequest.status >= 500` on the backend service | > 5 in any 5-min window | log-based `verifymyprovider_backend_5xx` |
| Backend startup / DB crash | `PrismaClientInitializationError` or `ECONNREFUSED` in logs | any occurrence (> 0 in 1 min) | log-based `verifymyprovider_backend_startup_crash` |
| CAPTCHA / rate-limiter fail-open volume | `"Rate limiter Redis unavailable"`, `CAPTCHA_FAIL_MODE`, or `rateLimitStatus=degraded` in logs | > 50 in any 1-hour window | log-based `verifymyprovider_captcha_fail_open` |
| Cloud Run liveness probe failures | built-in probe failure counter | ≥ 3 failures in 5 min | `run.googleapis.com/container/probe_attempt_count` (filtered to `probe_type=liveness`, `result=failed`) |

The liveness-probe alert depends on the startup/liveness probes configured in `.github/workflows/deploy.yml` (IM-07). Without those, Cloud Run only runs the default TCP probe and `probe_attempt_count` won't populate meaningfully.

## Running the script

```bash
# Prereqs (once per workstation)
gcloud auth login
gcloud components install alpha

# Dry-run — prints every gcloud command it would run, no writes.
bash infra/alerts/cloud-monitoring-alerts.sh --dry-run

# Apply to the default project (verifymyprovider-prod).
bash infra/alerts/cloud-monitoring-alerts.sh

# Apply against a specific project (e.g. staging, once the staging
# Cloud SQL instance in IM-04 is provisioned).
bash infra/alerts/cloud-monitoring-alerts.sh --project=verifymyprovider-staging

# Or via env var.
GCP_PROJECT_ID=verifymyprovider-staging bash infra/alerts/cloud-monitoring-alerts.sh
```

## Idempotency

- **Metrics** are created on first run and `update`d on subsequent runs, so edits to the filter expressions in the script are picked up.
- **Alert policies** are created only if no policy with the same `displayName` already exists. The script intentionally does *not* overwrite an existing policy — notification channels added via the Cloud Console would otherwise be clobbered.

To push a policy change after editing its JSON:

```bash
POLICY_ID=$(gcloud alpha monitoring policies list \
  --project=verifymyprovider-prod \
  --filter='displayName="Backend 5xx error rate (verifymyprovider-backend)"' \
  --format='value(name)')

gcloud alpha monitoring policies update "$POLICY_ID" \
  --policy-from-file=infra/alerts/policies/backend-5xx.json
```

## TODO: notification channels

All four policy JSON files have `"notificationChannels": []` — created alerts will fire but only to the Cloud Monitoring dashboard. Before these alerts are useful, wire at least one channel:

```bash
# Example: email channel
gcloud alpha monitoring channels create \
  --display-name="VerifyMyProvider oncall" \
  --type=email \
  --channel-labels=email_address=oncall@example.com

# Then attach it to each policy
gcloud alpha monitoring channels list --format='value(name)'
gcloud alpha monitoring policies list --format='value(name,displayName)'
gcloud alpha monitoring policies update POLICY_ID \
  --add-notification-channels=CHANNEL_RESOURCE_NAME
```

For Slack, create a webhook channel instead (`--type=webhook_tokenauth`) pointed at an incoming-webhook URL in Secret Manager.

## Metric filter gotchas

- Cloud Run Node.js services emit two log streams: `textPayload` (plain lines written before pino initializes — rare) and `jsonPayload` (pino's structured output). The filters in the script match **both** so logger changes don't silently break the metrics.
- Cloud Run request logs are written by the Cloud Run frontend and carry `httpRequest.status` — that's what the 5xx filter uses. Application-level error logs don't populate `httpRequest`.
- Log-based metrics have a ~2-minute ingestion delay. `duration: "0s"` in the policy JSON fires immediately once the aligned series crosses the threshold; if you want smoothing, bump it (e.g. `"60s"`).

## Verifying after apply

```bash
# Are the metrics present?
gcloud logging metrics list --project=verifymyprovider-prod \
  --filter='name~"verifymyprovider_"'

# Are the policies present?
gcloud alpha monitoring policies list --project=verifymyprovider-prod \
  --format='table(displayName,enabled,conditions.len():label=CONDITIONS)'

# Manually trigger the 5xx counter to smoke-test — curl the backend into
# returning 500 and watch the metric in Metrics Explorer under
# `logging.googleapis.com/user/verifymyprovider_backend_5xx`.
```
