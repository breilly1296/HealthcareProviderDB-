/**
 * Batch-geocode practice_locations using the Google Maps Geocoding API.
 *
 * Deduplicates by address_hash so each unique address is geocoded once,
 * then updates all rows sharing that hash. Safe to re-run — only queries
 * rows where latitude IS NULL.
 *
 * Usage:
 *   npx tsx scripts/geocode-locations.ts --dry-run                # Preview
 *   npx tsx scripts/geocode-locations.ts --state NY --limit 1000  # Geocode up to 1000 NY addresses
 *   npx tsx scripts/geocode-locations.ts                          # Full run, all states
 *
 * Requires GOOGLE_MAPS_API_KEY and DATABASE_URL in .env or environment.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const USAGE = `
Usage: npx tsx scripts/geocode-locations.ts [options]

Options:
  --state <ST>       Only geocode locations in this state (e.g., NY)
  --batch-size <N>   Rows per DB query batch (default: 500)
  --rps <N>          Max requests per second to Google API (default: 40)
  --limit <N>        Max unique addresses to geocode in this run
  --dry-run          Log what would happen without writing to DB
  --help             Show this message
`.trim();

const argv = process.argv.slice(2);

if (argv.includes('--help')) {
  console.log(USAGE);
  process.exit(0);
}

function getArg(flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

const stateFilter = getArg('--state')?.toUpperCase();
const batchSize = parseInt(getArg('--batch-size') ?? '500', 10);
const rps = parseInt(getArg('--rps') ?? '40', 10);
const limit = getArg('--limit') ? parseInt(getArg('--limit')!, 10) : undefined;
const dryRun = argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!GOOGLE_MAPS_API_KEY) {
  console.error(
    'Error: GOOGLE_MAPS_API_KEY is not set. Set it in .env or your environment.'
  );
  process.exit(1);
}

const prisma = new PrismaClient({ log: ['error'] });

// ---------------------------------------------------------------------------
// Token-bucket rate limiter
// ---------------------------------------------------------------------------
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number,
    private refillRate: number, // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // Wait until at least one token is available
      const waitMs = Math.ceil((1 / this.refillRate) * 1000);
      await sleep(waitMs);
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Address builder
// ---------------------------------------------------------------------------
function buildAddress(
  line1: string | null,
  line2: string | null,
  city: string | null,
  state: string | null,
  zip: string | null,
): string | null {
  const parts = [
    line1?.trim(),
    line2?.trim(),
    city?.trim(),
    state?.trim(),
    zip?.trim().substring(0, 5),
  ].filter((p): p is string => !!p);

  // Need at least street + city + state
  if (parts.length < 3) return null;

  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------
interface GeocodeResult {
  latitude: number;
  longitude: number;
}

type GeocodeOutcome =
  | { status: 'ok'; result: GeocodeResult }
  | { status: 'no_result' }
  | { status: 'error'; message: string };

async function geocodeAddress(
  address: string,
  rateLimiter: TokenBucket,
): Promise<GeocodeOutcome> {
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await rateLimiter.acquire();

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY!);
    url.searchParams.set('components', 'country:US');

    let res: Response;
    try {
      res = await fetch(url.toString());
    } catch (err) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.warn(`  Fetch error (attempt ${attempt + 1}/${maxRetries}), retrying in ${backoff}ms...`);
        await sleep(backoff);
        continue;
      }
      return { status: 'error', message: `Fetch failed: ${(err as Error).message}` };
    }

    const data = await res.json() as {
      status: string;
      results?: Array<{
        geometry: { location: { lat: number; lng: number } };
      }>;
      error_message?: string;
    };

    switch (data.status) {
      case 'OK': {
        const loc = data.results?.[0]?.geometry?.location;
        if (!loc) return { status: 'no_result' };
        return { status: 'ok', result: { latitude: loc.lat, longitude: loc.lng } };
      }

      case 'ZERO_RESULTS':
        return { status: 'no_result' };

      case 'OVER_QUERY_LIMIT': {
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt + 1) * 1000;
          console.warn(`  OVER_QUERY_LIMIT (attempt ${attempt + 1}/${maxRetries}), backing off ${backoff}ms...`);
          await sleep(backoff);
          continue;
        }
        return { status: 'error', message: 'OVER_QUERY_LIMIT after retries' };
      }

      case 'REQUEST_DENIED':
        return { status: 'error', message: `REQUEST_DENIED: ${data.error_message ?? 'check API key'}` };

      case 'INVALID_REQUEST':
        return { status: 'no_result' };

      default:
        return { status: 'error', message: `Unexpected status: ${data.status}` };
    }
  }

  return { status: 'error', message: 'Max retries exceeded' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\nGeocoding Practice Locations\n');
  console.log('='.repeat(60));
  console.log(`Mode:        ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Rate limit:  ${rps} req/s`);
  console.log(`Batch size:  ${batchSize}`);
  if (stateFilter) console.log(`State:       ${stateFilter}`);
  if (limit) console.log(`Limit:       ${limit} unique addresses`);
  console.log('='.repeat(60));

  // Build the WHERE clause for un-geocoded rows with valid address data
  const where = {
    latitude: null,
    address_line1: { not: null },
    city: { not: null },
    state: { not: null },
    address_hash: { not: null },
    ...(stateFilter ? { state: stateFilter } : {}),
  } as const;

  // Count total un-geocoded rows
  const totalRows = await prisma.practice_locations.count({ where });

  // Get distinct address hashes
  const distinctRows = await prisma.practice_locations.findMany({
    where,
    distinct: ['address_hash'],
    select: {
      address_hash: true,
      address_line1: true,
      address_line2: true,
      city: true,
      state: true,
      zip_code: true,
    },
    ...(limit ? { take: limit } : {}),
  });

  const uniqueCount = distinctRows.length;
  const estimatedCost = (uniqueCount / 1000) * 5;

  console.log(`\nUn-geocoded rows:      ${totalRows.toLocaleString()}`);
  console.log(`Unique addresses:      ${uniqueCount.toLocaleString()}`);
  console.log(`Estimated API cost:    $${estimatedCost.toFixed(2)} ($5 per 1,000 requests)`);
  console.log('');

  if (uniqueCount === 0) {
    console.log('Nothing to geocode. All locations are already geocoded.');
    return;
  }

  if (dryRun) {
    console.log('DRY RUN — no API calls or DB writes will be made.');
    console.log('Remove --dry-run to execute.');
    return;
  }

  // Process
  const rateLimiter = new TokenBucket(rps, rps);
  const startTime = Date.now();
  let geocodedCount = 0;
  let noResultCount = 0;
  let errorCount = 0;
  let totalRowsUpdated = 0;

  for (let i = 0; i < distinctRows.length; i++) {
    const row = distinctRows[i];
    const address = buildAddress(
      row.address_line1,
      row.address_line2,
      row.city,
      row.state,
      row.zip_code,
    );

    if (!address) {
      noResultCount++;
      continue;
    }

    const outcome = await geocodeAddress(address, rateLimiter);

    switch (outcome.status) {
      case 'ok': {
        const updated = await prisma.practice_locations.updateMany({
          where: { address_hash: row.address_hash },
          data: {
            latitude: outcome.result.latitude,
            longitude: outcome.result.longitude,
            geocoded_at: new Date(),
          },
        });
        geocodedCount++;
        totalRowsUpdated += updated.count;
        break;
      }

      case 'no_result':
        noResultCount++;
        break;

      case 'error':
        errorCount++;
        if (outcome.message.includes('REQUEST_DENIED')) {
          console.error(`\nFATAL: ${outcome.message}`);
          console.error('Stopping — check your GOOGLE_MAPS_API_KEY.');
          printSummary(startTime, geocodedCount, noResultCount, errorCount, totalRowsUpdated);
          return;
        }
        console.warn(`  Error geocoding "${address}": ${outcome.message}`);
        break;
    }

    // Progress log every 100 addresses
    const processed = i + 1;
    if (processed % 100 === 0 || processed === distinctRows.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = geocodedCount / elapsed;
      const remaining = distinctRows.length - processed;
      const eta = rate > 0 ? remaining / rate : 0;
      console.log(
        `  [${processed.toLocaleString()}/${uniqueCount.toLocaleString()}] ` +
        `geocoded=${geocodedCount} rows_updated=${totalRowsUpdated} ` +
        `rate=${rate.toFixed(1)} addr/s ETA=${formatDuration(eta)}`
      );
    }
  }

  printSummary(startTime, geocodedCount, noResultCount, errorCount, totalRowsUpdated);
}

function printSummary(
  startTime: number,
  geocodedCount: number,
  noResultCount: number,
  errorCount: number,
  totalRowsUpdated: number,
) {
  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Geocoded:        ${geocodedCount.toLocaleString()}`);
  console.log(`No result:       ${noResultCount.toLocaleString()}`);
  console.log(`Errors:          ${errorCount.toLocaleString()}`);
  console.log(`Rows updated:    ${totalRowsUpdated.toLocaleString()}`);
  console.log(`Time elapsed:    ${formatDuration(elapsed)}`);
  console.log('='.repeat(60));
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
