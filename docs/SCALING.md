# Scaling Guide

This document covers horizontal scaling considerations for HealthcareProviderDB.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloud Run                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Single Instance (maxInstances=1)             │  │
│  │                                                           │  │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │  │
│  │   │   Express   │    │  In-Memory  │    │   Prisma    │  │  │
│  │   │   Server    │───▶│ Rate Limit  │───▶│   Client    │  │  │
│  │   └─────────────┘    │   Store     │    └──────┬──────┘  │  │
│  │                      └─────────────┘           │         │  │
│  └───────────────────────────────────────────────│─────────┘  │
└──────────────────────────────────────────────────│─────────────┘
                                                   │
                                                   ▼
                                          ┌───────────────┐
                                          │  Cloud SQL    │
                                          │  PostgreSQL   │
                                          └───────────────┘
```

## Rate Limiting Modes

The application supports **two rate limiting modes** that are automatically selected based on configuration:

### 1. In-Memory Mode (Default)

Used when `REDIS_URL` is **not configured**.

- Rate limit counters are stored in process memory
- Each instance maintains independent counters
- **Only safe for single-instance deployments**

```
With maxInstances=1:    Rate limit = 10/hour ✓
With maxInstances=3:    Rate limit = 30/hour (10 × 3 instances) ✗
```

### 2. Redis Mode (Distributed)

Used when `REDIS_URL` **is configured**.

- Rate limit counters are stored in Redis
- All instances share the same counters
- **Safe for horizontal scaling**

```
With maxInstances=1:    Rate limit = 10/hour ✓
With maxInstances=3:    Rate limit = 10/hour ✓ (shared state)
```

## Quick Start: Enable Redis Rate Limiting

### Step 1: Set up Redis

**Option A: Cloud Memorystore (Production)**
```bash
gcloud redis instances create healthcareproviderdb-ratelimit \
  --size=1 \
  --region=us-central1 \
  --redis-version=redis_7_0 \
  --tier=basic
```

**Option B: Local Redis (Development)**
```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or install locally
brew install redis  # macOS
sudo apt install redis-server  # Ubuntu
```

### Step 2: Configure Environment

Add to your `.env` file:
```bash
REDIS_URL=redis://localhost:6379
```

For Cloud Memorystore, use the instance IP:
```bash
REDIS_URL=redis://10.0.0.3:6379
```

### Step 3: Verify Connection

On startup, you'll see logs indicating which mode is active:

**Redis mode:**
```
[Redis] Initializing connection...
[Redis] TCP connection established
[Redis] Ready - accepting commands
[RateLimit] "default" using Redis (distributed mode)
[RateLimit] "verification" using Redis (distributed mode)
```

**In-memory mode:**
```
[Redis] REDIS_URL not configured - Redis features disabled
[RateLimit] "default" using in-memory (single-instance mode)
[RateLimit] "verification" using in-memory (single-instance mode)
```

## Fail-Open Behavior

If Redis becomes unavailable during operation:

1. Requests are **allowed through** (fail-open)
2. A warning is logged: `[RateLimit:name] Redis unavailable, allowing request (fail-open)`
3. Response includes header: `X-RateLimit-Status: degraded`

This prioritizes **availability over strict rate limiting**. Monitor for these warnings to detect Redis issues.

## Rate Limiters

| Rate Limiter | Limit | Purpose |
|--------------|-------|---------|
| `defaultRateLimiter` | 200/hour | General API endpoints |
| `verificationRateLimiter` | 10/hour | Crowdsource submissions |
| `voteRateLimiter` | 10/hour | Verification votes |
| `searchRateLimiter` | 100/hour | Provider/plan search |

## Scaling to Multiple Instances

### Prerequisites

Before increasing `maxInstances` above 1:

- [ ] Set up Redis (Cloud Memorystore or equivalent)
- [ ] Configure `REDIS_URL` environment variable
- [ ] Set up VPC connector (for Cloud Memorystore)
- [ ] Verify Redis connection in logs
- [ ] Test rate limiting with multiple requests

### Cloud Run Configuration

**Single instance (current):**
```yaml
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "1"
```

**Multiple instances (with Redis):**
```yaml
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "10"
```

### VPC Connector for Cloud Memorystore

Cloud Run needs a VPC connector to reach Cloud Memorystore:

```bash
# Create VPC connector
gcloud compute networks vpc-access connectors create redis-connector \
  --region=us-central1 \
  --network=default \
  --range=10.8.0.0/28

# Deploy with VPC connector
gcloud run deploy healthcareproviderdb-backend \
  --image gcr.io/PROJECT_ID/backend:latest \
  --vpc-connector redis-connector \
  --set-env-vars "REDIS_URL=redis://REDIS_IP:6379" \
  --max-instances 10
```

## Alternative: Cloud Armor Rate Limiting

For infrastructure-level rate limiting without Redis:

```bash
# Create security policy
gcloud compute security-policies create healthcareproviderdb-policy \
  --description="Rate limiting for HealthcareProviderDB"

# Add rate limiting rule
gcloud compute security-policies rules create 1000 \
  --security-policy=healthcareproviderdb-policy \
  --expression="true" \
  --action=rate-based-ban \
  --rate-limit-threshold-count=100 \
  --rate-limit-threshold-interval-sec=3600 \
  --ban-duration-sec=3600
```

**Pros:**
- No code changes required
- DDoS protection included
- Works with any number of instances

**Cons:**
- Requires load balancer (additional cost)
- Less granular control
- Cloud Run must use external load balancer

## Cost Estimates

| Component | Monthly Cost |
|-----------|--------------|
| Cloud Memorystore (Basic, 1GB) | ~$30 |
| VPC Connector | ~$7 |
| Additional Cloud Run instances | Variable (per request) |

## Monitoring

### Check Rate Limit Hits
```bash
# Cloud Logging query for 429 responses
gcloud logging read "resource.type=cloud_run_revision AND httpRequest.status=429" --limit=100
```

### Check Redis Connection Issues
```bash
# Cloud Logging query for Redis errors
gcloud logging read "resource.type=cloud_run_revision AND textPayload:\"[Redis]\"" --limit=100
```

### Redis Metrics (Cloud Memorystore)
```bash
gcloud redis instances describe healthcareproviderdb-ratelimit --region=us-central1
```

### Redis Key Inspection (for debugging)
```bash
# Connect to Redis CLI
redis-cli -h REDIS_IP

# Count rate limit keys
KEYS ratelimit:* | wc -l

# Check specific limiter
ZCARD ratelimit:verification:192.168.1.1
```

## Troubleshooting

### "Redis unavailable" warnings in logs

1. Check `REDIS_URL` is correctly set
2. Verify VPC connector is configured (for Cloud Memorystore)
3. Check Redis instance is running: `gcloud redis instances list`
4. Test connectivity: `redis-cli -h REDIS_IP ping`

### Rate limits not enforced across instances

1. Verify `REDIS_URL` is set in all instances
2. Check logs for "using Redis (distributed mode)" message
3. Ensure all instances can reach Redis (VPC/firewall)

### High Redis latency

1. Use Redis instance in same region as Cloud Run
2. Consider upgrading to Standard tier for better performance
3. Monitor with Cloud Monitoring dashboards

## Related Documentation

- [Cloud Run Scaling](https://cloud.google.com/run/docs/configuring/max-instances)
- [Cloud Memorystore](https://cloud.google.com/memorystore/docs/redis)
- [VPC Connectors](https://cloud.google.com/vpc/docs/configure-serverless-vpc-access)
- [Rate Limiting Best Practices](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)
