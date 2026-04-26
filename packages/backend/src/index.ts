import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import prisma from './lib/prisma';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { extractUser } from './middleware/auth';
import { defaultRateLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import requestIdMiddleware from './middleware/requestId';
import httpLogger from './middleware/httpLogger';
import logger from './utils/logger';
import { getCacheStats } from './utils/cache';
import { getRedisStatus } from './lib/redis';
import { generalTimeout } from './middleware/requestTimeout';

// Load environment variables
dotenv.config();

// ---------------------------------------------------------------------------
// API directory — walks Express's internal router stack to produce an
// up-to-date listing for GET /. Touches private internals (`_router.stack`
// and `regexp.source`), so the result is guarded and falls back to a
// hand-maintained static map when introspection returns nothing.
// ---------------------------------------------------------------------------

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: RouterLayer[] };
  regexp?: { source: string; fast_slash?: boolean };
}

function extractMountPath(layer: RouterLayer): string {
  if (layer.regexp?.fast_slash) return '';
  const src = layer.regexp?.source ?? '';
  // Express 4 compiles `/foo` → /^\/foo\/?(?=\/|$)/i. Recover the literal
  // segment by stripping the surrounding boilerplate. If the regex doesn't
  // match the expected shape (Express upgrade, regex-route, etc.) we drop
  // back to ''. The static fallback below covers that case.
  const match = src.match(/^\^\\\/(.+?)\\\/\?\(\?=\\\/\|\$\)/);
  if (!match) return '';
  return '/' + match[1].replace(/\\\//g, '/');
}

function walkRoutes(stack: RouterLayer[], prefix: string): Array<{ method: string; path: string }> {
  const out: Array<{ method: string; path: string }> = [];
  for (const layer of stack) {
    if (layer.route) {
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (!enabled || method === '_all') continue;
        out.push({ method: method.toUpperCase(), path: prefix + layer.route.path });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      out.push(...walkRoutes(layer.handle.stack, prefix + extractMountPath(layer)));
    }
  }
  return out;
}

function buildApiDirectory(stack: RouterLayer[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const entry of walkRoutes(stack, '')) {
    if (!entry.path.startsWith('/api/v1/')) continue;
    const segs = entry.path.slice('/api/v1'.length).split('/').filter(Boolean);
    if (segs.length === 0) continue;
    const prefix = '/' + segs[0];
    (groups[prefix] ||= []).push(`${entry.method} ${entry.path}`);
  }
  for (const k of Object.keys(groups)) groups[k].sort();
  return groups;
}

// Hand-maintained fallback that mirrors the registered routes. Only used
// when introspection yields nothing (Express internals changed shape, etc.).
const STATIC_API_DIRECTORY: Record<string, string[]> = {
  '/providers': [
    'GET /api/v1/providers/search',
    'GET /api/v1/providers/nearby',
    'GET /api/v1/providers/cities',
    'GET /api/v1/providers/map',
    'GET /api/v1/providers/:npi',
    'GET /api/v1/providers/:npi/colocated',
    'GET /api/v1/providers/:npi/plans',
  ],
  '/plans': [
    'GET /api/v1/plans/search',
    'GET /api/v1/plans/grouped',
    'GET /api/v1/plans/meta/issuers',
    'GET /api/v1/plans/meta/types',
    'GET /api/v1/plans/:planId',
    'GET /api/v1/plans/:planId/providers',
  ],
  '/verify': [
    'POST /api/v1/verify',
    'POST /api/v1/verify/:verificationId/vote',
    'GET /api/v1/verify/stats',
    'GET /api/v1/verify/recent',
    'GET /api/v1/verify/:npi/:planId',
  ],
  '/locations': [
    'GET /api/v1/locations/search',
    'GET /api/v1/locations/health-systems',
    'GET /api/v1/locations/stats/:state',
    'GET /api/v1/locations/:locationId',
    'GET /api/v1/locations/:locationId/providers',
  ],
  '/auth': [
    'GET /api/v1/auth/csrf-token',
    'POST /api/v1/auth/magic-link',
    'GET /api/v1/auth/verify',
    'POST /api/v1/auth/refresh',
    'POST /api/v1/auth/logout',
    'POST /api/v1/auth/logout-all',
    'GET /api/v1/auth/me',
    'GET /api/v1/auth/export',
  ],
  '/admin': [
    'POST /api/v1/admin/cleanup-expired',
    'POST /api/v1/admin/cleanup-sessions',
    'POST /api/v1/admin/cleanup-magic-links',
    'POST /api/v1/admin/cleanup-admin-actions',
    'GET /api/v1/admin/expiration-stats',
    'GET /api/v1/admin/verifications/disputed',
    'GET /api/v1/admin/anomalies',
    'GET /api/v1/admin/health',
    'POST /api/v1/admin/cache/clear',
    'GET /api/v1/admin/cache/stats',
    'GET /api/v1/admin/redis/status',
    'GET /api/v1/admin/enrichment/stats',
    'POST /api/v1/admin/cleanup/sync-logs',
    'GET /api/v1/admin/retention/stats',
    'POST /api/v1/admin/recalculate-confidence',
    'POST /api/v1/admin/rotate-encryption-key',
  ],
  '/saved-providers': [
    'GET /api/v1/saved-providers',
    'POST /api/v1/saved-providers',
    'DELETE /api/v1/saved-providers/:npi',
    'GET /api/v1/saved-providers/:npi/status',
  ],
  '/me': [
    'POST /api/v1/me/insurance-card/scan',
    'POST /api/v1/me/insurance-card/save',
    'GET /api/v1/me/insurance-card',
    'PATCH /api/v1/me/insurance-card',
    'DELETE /api/v1/me/insurance-card',
  ],
};

const app = express();
const PORT = process.env.PORT || 3001;

// Define allowed CORS origins
const ALLOWED_ORIGINS: string[] = [
  'https://verifymyprovider.com',
  'https://www.verifymyprovider.com',
  'https://verifymyprovider-frontend-741434145252.us-central1.run.app',
  process.env.FRONTEND_URL,  // Additional Cloud Run frontend URL from env
].filter((origin): origin is string => Boolean(origin));

// In development, also allow localhost
if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:3001');
}

// Trust proxy for Cloud Run (required for correct client IP in rate limiting)
// Set to 1 to trust only the first proxy (Cloud Run's load balancer)
app.set('trust proxy', 1);

// Request ID middleware for log correlation (must be early in the chain)
app.use(requestIdMiddleware);

// HTTP request logging with pino
app.use(httpLogger);

// Security middleware with strict CSP for JSON API
// This backend serves only JSON responses (no HTML), so we use a restrictive policy
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],      // Deny all by default
      scriptSrc: ["'none'"],       // No scripts needed for JSON API
      styleSrc: ["'none'"],        // No styles needed for JSON API
      imgSrc: ["'none'"],          // No images served
      connectSrc: ["'self'"],      // Allow API calls to self
      fontSrc: ["'none'"],         // No fonts served
      objectSrc: ["'none'"],       // No plugins/objects
      frameAncestors: ["'none'"],  // Cannot be embedded in iframes
      formAction: ["'none'"],      // No form submissions
      upgradeInsecureRequests: [], // Upgrade HTTP to HTTPS
    },
  },
  // Additional security headers
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      // Log blocked CORS attempts for monitoring
      logger.warn({ origin }, 'CORS blocked request from origin');
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Admin-Secret', 'X-CSRF-Token'],
  credentials: true,
}));

// Body parsing with size limits to prevent large payload attacks.
//
// Insurance card scan needs a higher limit because the request body carries
// a base64-encoded card image (typically 2-8 MB after base64 expansion;
// capped at 15 MB by the route's Zod schema). Mounting the 16 MB parser
// FIRST at a path prefix lets Express's built-in path matching pick the
// right parser for that request — once express.json() has populated
// req.body, the global 100 kb parser below sees req._body === true and
// short-circuits to next(), so the request never hits the 100 kb cap.
//
// Replaces the previous JavaScript path-string skip; that check broke
// silently if the route ever moved or if a method-override header was used.
app.use('/api/v1/me/insurance-card/scan', express.json({ limit: '16mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Cookie parsing (required for auth token extraction)
app.use(cookieParser());

// Auth: extract user from JWT cookie (sets req.user for all downstream handlers)
app.use(extractUser);

// ---------------------------------------------------------------------------
// Health endpoints — there are two:
//
//   GET /health
//     Public, unauthenticated. Returns database + Redis connectivity, cache
//     stats, memory, and uptime. Consumed by Cloud Run startup/liveness
//     probes and the multi-region uptime checks (infra/uptime/). Mounted
//     BEFORE the rate limiter so probes aren't 429'd. Returns 503 when
//     status is `degraded` (DB unhealthy, or Redis configured-but-broken).
//
//   GET /api/v1/admin/health  (see routes/admin.ts:415)
//     Admin-protected via X-Admin-Secret. Returns retention metrics,
//     secret-presence booleans, DB liveness, and Redis details for
//     operational dashboards. Not for liveness probes.
// ---------------------------------------------------------------------------
app.get('/health', async (req: Request, res: Response) => {
  const cacheStats = getCacheStats();

  // Normalize Redis status into a small enum the health response commits to.
  // - not-configured: REDIS_URL is unset; Redis is optional so this is fine
  // - connected:      ready and accepting commands
  // - disconnected:   transient state (connecting / reconnecting) — not fatal
  // - error:          configured but in a broken state — degrades health
  const redisRaw = getRedisStatus();
  const redisHealth: 'connected' | 'disconnected' | 'not-configured' | 'error' =
    !redisRaw.configured
      ? 'not-configured'
      : redisRaw.connected && redisRaw.status === 'ready'
        ? 'connected'
        : redisRaw.status === 'connecting' || redisRaw.status === 'reconnecting'
          ? 'disconnected'
          : 'error';

  const health = {
    status: 'ok' as 'ok' | 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB',
    },
    checks: {
      database: 'unknown' as 'healthy' | 'unhealthy' | 'unknown',
      redis: redisHealth,
    },
    cache: {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      size: cacheStats.size,
      mode: cacheStats.mode,
      hitRate: cacheStats.hits + cacheStats.misses > 0
        ? `${((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1)}%`
        : '0%',
    },
  };

  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - startTime;

    health.checks.database = 'healthy';
    (health as Record<string, unknown>).databaseResponseTime = `${responseTime}ms`;

    // Only a configured-but-broken Redis degrades us. `not-configured` is
    // deliberately fine: Redis is optional, the app falls back to in-memory
    // cache and rate limiting. Transient `disconnected` is self-healing.
    if (redisHealth === 'error') {
      health.status = 'degraded';
      res.status(503).json(health);
      return;
    }

    res.json(health);
  } catch (error) {
    health.status = 'degraded';
    health.checks.database = 'unhealthy';
    (health as Record<string, unknown>).error = error instanceof Error ? error.message : 'Database connection failed';

    res.status(503).json(health);
  }
});

// Default rate limiter (200 req/hour)
app.use(defaultRateLimiter);

// Request logging (tracks usage without PII)
app.use(requestLogger);

// API info endpoint — directory generated dynamically from the registered
// route stack at request time. Falls back to STATIC_API_DIRECTORY if
// introspection of Express internals returns nothing (private API guard).
app.get('/', (req: Request, res: Response) => {
  let routes: Record<string, string[]>;
  try {
    const stack = (app as unknown as { _router?: { stack: RouterLayer[] } })._router?.stack;
    const dynamic = stack ? buildApiDirectory(stack) : {};
    if (Object.keys(dynamic).length === 0) {
      logger.warn('Route introspection returned no entries; serving static fallback');
      routes = STATIC_API_DIRECTORY;
    } else {
      routes = dynamic;
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) },
      'Route introspection threw; serving static fallback');
    routes = STATIC_API_DIRECTORY;
  }

  res.json({
    name: 'VerifyMyProvider API',
    version: '1.0.0',
    routes,
  });
});

// Request timeout (30s default for all API routes)
app.use('/api/v1', generalTimeout);

// API routes
app.use('/api/v1', routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info({
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    urls: {
      server: `http://localhost:${PORT}`,
      health: `http://localhost:${PORT}/health`,
      docs: `http://localhost:${PORT}/`,
    },
  }, 'HealthcareProviderDB API v1.0.0 started');
});

// Graceful shutdown with timeout protection
const SHUTDOWN_TIMEOUT_MS = 10000;

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received, shutting down gracefully');

  // Set a timeout to force exit if graceful shutdown takes too long
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    // First, stop accepting new connections
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info('HTTP server closed');

    // Then disconnect from database
    await prisma.$disconnect();
    logger.info('Database disconnected');

    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
