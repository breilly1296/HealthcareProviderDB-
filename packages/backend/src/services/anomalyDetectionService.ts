/**
 * Anomaly detection — subnet-level Sybil signal scanning (F-20)
 *
 * Scans verification_logs for three abuse-shaped patterns:
 *   1. Subnet concentration — many distinct IPs from the same /24
 *      submitting verifications in a short window. Catches attackers
 *      rotating through a residential-proxy pool or cloud VM fleet.
 *   2. Velocity spike — last-hour volume >3x the rolling 24h average.
 *      Catches sudden coordinated bursts.
 *   3. Provider targeting — many verifications against the same
 *      provider-plan pair from different IPs. Catches targeted
 *      reputation attacks (lift or suppress a specific provider's
 *      acceptance signal).
 *
 * Detection only — never blocks or mutates. Outputs a report an operator
 * can consult from the /admin/anomalies endpoint and feed into Cloud
 * Armor rules or temporary IP allowlists manually.
 *
 * PII: subnet prefixes only. Never includes full IPs, even when the
 * underlying row carries one.
 */
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import logger from '../utils/logger';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface SubnetAnomaly {
  subnet: string;            // /24 prefix, e.g. "192.168.1"
  totalVerifications: number;
  uniqueIps: number;
  uniqueProviders: number;
  firstSeen: string;         // ISO-8601
  lastSeen: string;
}

export interface VelocityAnomaly {
  lastHourCount: number;
  avgHourlyCount: number;    // rolling 24h mean
  ratio: number;             // lastHourCount / avgHourlyCount
}

export interface TargetingAnomaly {
  providerNpi: string;
  planId: string;
  verifications: number;
  uniqueIps: number;
  uniqueUsers: number;
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface AnomalyReport {
  generatedAt: string;
  window: string;            // e.g. "24h"
  anomalies: {
    subnetConcentration: SubnetAnomaly[];
    velocitySpike: VelocityAnomaly | null;
    providerTargeting: TargetingAnomaly[];
  };
  summary: {
    totalAnomalies: number;
    riskLevel: RiskLevel;
  };
}

// ----------------------------------------------------------------------------
// Thresholds
// ----------------------------------------------------------------------------

// Subnet concentration: 5+ distinct IPs AND 10+ total verifications in
// the window. Tuned conservatively — a large shared NAT (college dorm,
// corporate office) can legitimately produce 3-4 IPs on the same /24.
const SUBNET_MIN_DISTINCT_IPS = 5;
const SUBNET_MIN_TOTAL_VERIFICATIONS = 10;

// Provider targeting: 5+ verifications AND 3+ distinct IPs on the same
// (npi, plan_id) pair. Catches coordinated lift/suppress attacks without
// flagging legitimate consensus (3 IPs verifying independently).
const TARGETING_MIN_VERIFICATIONS = 5;
const TARGETING_MIN_UNIQUE_IPS = 3;

// Velocity spike: last-hour count >3x the 24h rolling mean. Requires a
// minimum volume so single-digit organic spikes don't trip it.
const VELOCITY_SPIKE_RATIO = 3;
const VELOCITY_SPIKE_MIN_COUNT = 10;

// windowHours cap — a >7-day scan against verification_logs with no
// time-bounded index would hurt. Callers pre-clamp, but we guard here too.
const MAX_WINDOW_HOURS = 168;

// ----------------------------------------------------------------------------
// Raw-SQL row types (what $queryRaw returns before massaging)
// ----------------------------------------------------------------------------

interface SubnetRow {
  subnet: string;
  total_verifications: bigint;
  unique_ips: bigint;
  unique_providers: bigint;
  first_seen: Date;
  last_seen: Date;
}

interface VelocityRow {
  last_hour: bigint;
  total_window: bigint;
}

interface TargetingRow {
  provider_npi: string;
  plan_id: string;
  verifications: bigint;
  unique_ips: bigint;
  unique_users: bigint;
}

// ----------------------------------------------------------------------------
// Detectors (exported for targeted tests)
// ----------------------------------------------------------------------------

/**
 * Subnet concentration. Groups on the /24 prefix via a Postgres regex
 * substring so IPv4 "1.2.3.4" maps to "1.2.3". IPv6 addresses and rows
 * with NULL source_ip are excluded by the WHERE clause.
 *
 * Uses `NOW() - (interval '1 hour' * $n)` instead of a raw interval
 * literal so the window is parameterized.
 */
export async function detectSubnetConcentration(windowHours: number): Promise<SubnetAnomaly[]> {
  const rows = await prisma.$queryRaw<SubnetRow[]>(Prisma.sql`
    SELECT
      SUBSTRING(vl."sourceIp" FROM '^(\\d+\\.\\d+\\.\\d+)') AS subnet,
      COUNT(*)                        AS total_verifications,
      COUNT(DISTINCT vl."sourceIp")   AS unique_ips,
      COUNT(DISTINCT vl.provider_npi) AS unique_providers,
      MIN(vl.created_at)              AS first_seen,
      MAX(vl.created_at)              AS last_seen
    FROM verification_logs vl
    WHERE vl.created_at > NOW() - (INTERVAL '1 hour' * ${windowHours})
      AND vl."sourceIp" IS NOT NULL
      AND SUBSTRING(vl."sourceIp" FROM '^(\\d+\\.\\d+\\.\\d+)') IS NOT NULL
    GROUP BY subnet
    HAVING COUNT(DISTINCT vl."sourceIp") >= ${SUBNET_MIN_DISTINCT_IPS}
       AND COUNT(*) >= ${SUBNET_MIN_TOTAL_VERIFICATIONS}
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `);

  return rows.map(row => ({
    subnet: row.subnet,
    totalVerifications: Number(row.total_verifications),
    uniqueIps: Number(row.unique_ips),
    uniqueProviders: Number(row.unique_providers),
    firstSeen: row.first_seen.toISOString(),
    lastSeen: row.last_seen.toISOString(),
  }));
}

/**
 * Velocity spike — compares last-hour count to the rolling 24h average.
 * Returns null when the ratio is below VELOCITY_SPIKE_RATIO or the
 * absolute count is below VELOCITY_SPIKE_MIN_COUNT (to avoid flagging
 * "1 last hour vs 0.2 avg" as a spike).
 */
export async function detectVelocitySpike(): Promise<VelocityAnomaly | null> {
  const rows = await prisma.$queryRaw<VelocityRow[]>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')   AS last_hour,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS total_window
    FROM verification_logs
  `);

  const row = rows[0];
  if (!row) return null;

  const lastHour = Number(row.last_hour);
  const total24h = Number(row.total_window);
  const avgHourly = total24h / 24;

  if (lastHour < VELOCITY_SPIKE_MIN_COUNT) return null;
  if (avgHourly === 0) return null;

  const ratio = lastHour / avgHourly;
  if (ratio < VELOCITY_SPIKE_RATIO) return null;

  return {
    lastHourCount: lastHour,
    avgHourlyCount: Math.round(avgHourly * 10) / 10,
    ratio: Math.round(ratio * 10) / 10,
  };
}

/**
 * Provider-plan targeting. Same structure as the disputed-verifications
 * query (src/services/verificationService.ts) but with a stricter floor
 * on unique_ips so genuine consensus doesn't surface as an "anomaly".
 */
export async function detectProviderTargeting(windowHours: number): Promise<TargetingAnomaly[]> {
  const rows = await prisma.$queryRaw<TargetingRow[]>(Prisma.sql`
    SELECT
      vl.provider_npi,
      vl.plan_id,
      COUNT(*)                        AS verifications,
      COUNT(DISTINCT vl."sourceIp")   AS unique_ips,
      COUNT(DISTINCT vl.user_id)      AS unique_users
    FROM verification_logs vl
    WHERE vl.created_at > NOW() - (INTERVAL '1 hour' * ${windowHours})
      AND vl.provider_npi IS NOT NULL
      AND vl.plan_id IS NOT NULL
    GROUP BY vl.provider_npi, vl.plan_id
    HAVING COUNT(*) >= ${TARGETING_MIN_VERIFICATIONS}
       AND COUNT(DISTINCT vl."sourceIp") >= ${TARGETING_MIN_UNIQUE_IPS}
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `);

  return rows.map(row => ({
    providerNpi: row.provider_npi,
    planId: row.plan_id,
    verifications: Number(row.verifications),
    uniqueIps: Number(row.unique_ips),
    uniqueUsers: Number(row.unique_users),
  }));
}

// ----------------------------------------------------------------------------
// Aggregation
// ----------------------------------------------------------------------------

function computeRiskLevel(totalAnomalies: number): RiskLevel {
  if (totalAnomalies === 0) return 'none';
  if (totalAnomalies <= 2) return 'low';
  if (totalAnomalies <= 5) return 'medium';
  return 'high';
}

/**
 * Run all three detectors in parallel and fold the results into a single
 * report. Per-detector failures are isolated — if one query errors, the
 * other two still contribute, and the failing detector is logged rather
 * than swallowed silently.
 *
 * `windowHours` is clamped to [1, 168] (7 days) so a malformed query
 * param can't trigger a full-table scan.
 */
export async function detectAnomalies(windowHours: number = 24): Promise<AnomalyReport> {
  const clamped = Math.max(1, Math.min(MAX_WINDOW_HOURS, Math.floor(windowHours) || 24));

  const results = await Promise.allSettled([
    detectSubnetConcentration(clamped),
    detectVelocitySpike(),
    detectProviderTargeting(clamped),
  ]);

  const subnetConcentration = results[0].status === 'fulfilled' ? results[0].value : [];
  const velocitySpike = results[1].status === 'fulfilled' ? results[1].value : null;
  const providerTargeting = results[2].status === 'fulfilled' ? results[2].value : [];

  // Log any partial failures but keep returning whatever succeeded —
  // operators still get actionable signal even if one query times out.
  for (const [idx, name] of [
    [0, 'subnetConcentration'],
    [1, 'velocitySpike'],
    [2, 'providerTargeting'],
  ] as const) {
    const r = results[idx];
    if (r.status === 'rejected') {
      logger.error(
        { detector: name, err: r.reason instanceof Error ? r.reason.message : String(r.reason) },
        'Anomaly detector failed; partial report returned',
      );
    }
  }

  const totalAnomalies = subnetConcentration.length + (velocitySpike ? 1 : 0) + providerTargeting.length;

  return {
    generatedAt: new Date().toISOString(),
    window: `${clamped}h`,
    anomalies: {
      subnetConcentration,
      velocitySpike,
      providerTargeting,
    },
    summary: {
      totalAnomalies,
      riskLevel: computeRiskLevel(totalAnomalies),
    },
  };
}

// Exported for test targeting only.
export const __internals = { computeRiskLevel };
