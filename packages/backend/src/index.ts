import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import prisma from './lib/prisma';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { defaultRateLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Health check endpoint - BEFORE rate limiter so monitoring tools aren't blocked
app.get('/health', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'connected',
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
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
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           HealthcareProviderDB API v1.0.0                  ║
╠════════════════════════════════════════════════════════════╣
║  Server:     http://localhost:${PORT}                         ║
║  Health:     http://localhost:${PORT}/health                  ║
║  API Docs:   http://localhost:${PORT}/                        ║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(42)}║
╚════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown with timeout protection
const SHUTDOWN_TIMEOUT_MS = 10000;

const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Set a timeout to force exit if graceful shutdown takes too long
  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
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
    console.log('HTTP server closed');

    // Then disconnect from database
    await prisma.$disconnect();
    console.log('Database disconnected');

    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
