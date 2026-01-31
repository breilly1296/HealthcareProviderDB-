import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import prisma from './lib/prisma';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { defaultRateLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import requestIdMiddleware from './middleware/requestId';
import httpLogger from './middleware/httpLogger';
import logger from './utils/logger';
import { getCacheStats } from './utils/cache';

// Load environment variables
dotenv.config();

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Admin-Secret'],
  credentials: true,
}));

// Body parsing with size limits to prevent large payload attacks
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Health check endpoint - BEFORE rate limiter so monitoring tools aren't blocked
app.get('/health', async (req: Request, res: Response) => {
  const cacheStats = getCacheStats();

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

// API info endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'HealthcareProviderDB API',
    version: '1.0.0',
    description: 'Healthcare provider database with NPI registry integration and insurance plan matching',
    documentation: '/api/v1',
    endpoints: {
      health: 'GET /health',
      providers: {
        search: 'GET /api/v1/providers/search',
        getByNpi: 'GET /api/v1/providers/:npi',
        getPlans: 'GET /api/v1/providers/:npi/plans',
      },
      plans: {
        search: 'GET /api/v1/plans/search',
        getByPlanId: 'GET /api/v1/plans/:planId',
        issuers: 'GET /api/v1/plans/meta/issuers',
        types: 'GET /api/v1/plans/meta/types',
        years: 'GET /api/v1/plans/meta/years',
      },
      verify: {
        submit: 'POST /api/v1/verify',
        vote: 'POST /api/v1/verify/:verificationId/vote',
        stats: 'GET /api/v1/verify/stats',
        recent: 'GET /api/v1/verify/recent',
        getPair: 'GET /api/v1/verify/:npi/:planId',
      },
    },
  });
});

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
