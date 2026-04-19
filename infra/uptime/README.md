# Cloud Monitoring uptime checks (IM-32)

External synthetic HTTPS probes against the backend `/health` endpoint and the frontend root, plus the alert policies that fire when 2+ regions fail. Same shell-script-+-JSON IaC pattern as `infra/alerts/` and `infra/scheduler/`.

## Files

```
infra/uptime/
├── cloud-uptime-checks.sh   # idempotent apply script
└── README.md                # (this file)

infra/alerts/policies/
├── backend-uptime-failure.json    # fires when backend check fails 2+ regions for 2m
└── frontend-uptime-failure.json   # fires when frontend check fails 2+ regions for 5m
```

## Checks

| Check | Scope | Cadence | Match | Alert threshold |
|---|---|---|---|---|
| `verifymyprovider-backend-health` | HTTPS GET on `<backend>/health` | every 60s, 10s timeout, 3 regions | status 200 + body contains `"status":"ok"` | failing from ≥2 regions for 2 min |
| `verifymyprovider-frontend-root` | HTTPS GET on `<frontend>/` | every 300s, 10s timeout, 3 regions | status 200 | failing from ≥2 regions for 5 min |

Regions: `USA_OREGON`, `USA_IOWA`, `USA_VIRGINIA`. Pinning to three US regions is intentional — multi-region failures distinguish "real outage" from "single-region GCP hiccup", and the traffic footprint is US-only.

**Why `"status":"ok"` content match on backend** — a 200 alone doesn't prove the service is healthy; a misrouted reverse-proxy landing page also returns 200. The match confirms the backend's structured `/health` JSON is actually being emitted.

**Why 5 min on frontend vs 1 min on backend** — the frontend is stateless Next.js. Its outages are always downstream of something else (backend, DNS, LB). Cheaper-to-check cadence is fine; the backend is the meaningful signal.

## Relationship to existing alerts

The uptime alerts complement `liveness-probe-failures.json` (IM-07):
- **Liveness probe** = Cloud Run's internal check. Fires when the container is unhealthy from inside the cluster.
- **Uptime check** = external synthetic probe. Fires when the service is unreachable from outside (DNS, LB, TLS cert, routing).

If both fire → the container itself is down. If only the uptime check fires → the container is fine but traffic isn't reaching it (look at LB/DNS first).

## Running the script

```bash
# Prereqs (once per project)
gcloud services enable monitoring.googleapis.com
gcloud components install alpha   # for monitoring policies

# Dry-run — prints every gcloud command, no writes.
bash infra/uptime/cloud-uptime-checks.sh --dry-run

# Apply — resolves backend URL from the running Cloud Run service, uses
# https://verifymyprovider.com for the frontend by default.
bash infra/uptime/cloud-uptime-checks.sh

# Override knobs:
BACKEND_URL=https://custom-backend.run.app FRONTEND_URL=https://staging.example.com \
  bash infra/uptime/cloud-uptime-checks.sh

bash infra/uptime/cloud-uptime-checks.sh --project=verifymyprovider-staging
```

## Idempotency

- Uptime checks are detected via `gcloud monitoring uptime list-configs --filter="displayName=..."`. Missing → `uptime create`, present → `uptime update` with the same flag set. Check IDs (`verifymyprovider-backend-health`, `verifymyprovider-frontend-root`) are stable — the alert-policy JSON filters reference them verbatim, so renaming one means updating `infra/alerts/policies/*-uptime-failure.json` to match.
- Alert policies use the same skip-if-present logic as `infra/alerts/`: missing → create, present → leave alone. This preserves any notification channels added via the Cloud Console. To push an edited policy JSON, run `gcloud alpha monitoring policies update POLICY_ID --policy-from-file=...` manually.

## Notification channels

Like the IM-06 alerts, `notificationChannels` is left empty on the new policies. Wiring instructions live in `infra/alerts/README.md` under "TODO: notification channels" — run the same `gcloud alpha monitoring channels create` + `policies update --add-notification-channels` flow.

## Verifying after apply

```bash
gcloud monitoring uptime list-configs --project=verifymyprovider-prod
gcloud alpha monitoring policies list --project=verifymyprovider-prod \
  --filter='displayName~".*uptime.*"' \
  --format='table(displayName,enabled)'

# Smoke test: force the backend check to fail by temporarily scaling Cloud
# Run to 0 min-instances and sending a request during cold-start. Or just
# watch Metrics Explorer: monitoring.googleapis.com/uptime_check/check_passed
# with a 60-second alignment window.
```

## Google Search Console verification (F-18)

Separate from uptime checks but thematically adjacent: `layout.tsx` now emits a `google-site-verification` meta tag when `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` is set in the Cloud Run frontend env. Combined with the sitemap (IM-37) and robots.txt (IM-36), Search Console should be able to verify ownership on first crawl. To activate:

1. In Search Console, choose HTML-tag verification and copy the `content="..."` value.
2. Add `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<value>` to the frontend Cloud Run env (via `--set-env-vars` or Secret Manager binding).
3. Redeploy. The tag appears in every page's `<head>`.
4. Click "Verify" in Search Console.
