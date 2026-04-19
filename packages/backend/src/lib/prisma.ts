import { Prisma, PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

// Prevent multiple instances of Prisma Client in development
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Log config uses the object form so 'query' events can be `$on`-ed below.
// In dev we also mirror 'warn' to stdout; 'error' always goes to stdout so
// it surfaces even if our slow-query listener throws.
const logConfig: Prisma.LogDefinition[] = [
  { level: 'error', emit: 'stdout' },
  { level: 'query', emit: 'event' },
];
if (process.env.NODE_ENV === 'development') {
  logConfig.push({ level: 'warn', emit: 'stdout' });
}

// Slow-query threshold — log any query running longer than this. Cloud SQL
// tuned for this workload should respond in <50ms for most paths; 500ms is
// slow enough to ignore routine load spikes and surface real problems.
const SLOW_QUERY_MS = 500;

// Module-reload guard: avoid attaching the listener twice when Next/tsx
// hot-reload reuses the global Prisma client in development.
const isFirstInit = !global.prisma;

export const prisma = global.prisma || new PrismaClient({ log: logConfig });

if (isFirstInit) {
  // The `'query' as never` cast is needed because Prisma's $on overload only
  // exposes 'query' when the client's generic captures the log-emit literal.
  // We keep the event payload strongly typed via Prisma.QueryEvent, which is
  // the part that matters for safety.
  (prisma.$on as (event: 'query', cb: (e: Prisma.QueryEvent) => void) => void)(
    'query',
    (e) => {
      if (e.duration > SLOW_QUERY_MS) {
        // IMPORTANT: never log `e.params` — query params may contain emails,
        // tokens, insurance IDs, or other PII. Only the query template and
        // duration are safe to log.
        logger.warn(
          {
            query: e.query,
            duration: e.duration,
            params: '[REDACTED]',
          },
          `Slow query detected (${e.duration}ms)`
        );
      }
    }
  );
}

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
