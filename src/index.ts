/**
 * Healthcare Provider Database API
 *
 * Main entry point for the Express server
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';

import routes from './api/routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Healthcare Provider Database API',
    version: '1.0.0',
    description: 'API for healthcare provider lookup with insurance plan matching',
    endpoints: {
      'GET /api/health': 'Health check',
      'GET /api/stats': 'Database statistics',
      'GET /api/providers': 'Search providers (query params: state, specialty, city, zip, name)',
      'GET /api/providers/:npi': 'Get provider details by NPI',
      'GET /api/providers/:npi/plans': 'Get provider accepted insurance plans',
      'POST /api/providers/:npi/verify': 'Submit crowdsource verification',
      'POST /api/verifications/:id/vote': 'Vote on verification submission',
    },
    specialties: [
      'endocrinology',
      'rheumatology',
      'orthopedics',
      'internal_medicine',
      'family_medicine',
      'geriatrics',
    ],
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  console.error(err.stack);

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║     Healthcare Provider Database API                      ║
  ║     Running on http://localhost:${PORT}                       ║
  ╚═══════════════════════════════════════════════════════════╝

  Endpoints:
    GET  /api/health              - Health check
    GET  /api/stats               - Database statistics
    GET  /api/providers           - Search providers
    GET  /api/providers/:npi      - Provider details
    GET  /api/providers/:npi/plans - Provider's insurance plans
    POST /api/providers/:npi/verify - Submit verification

  Osteoporosis-Relevant Specialties:
    - Endocrinology
    - Rheumatology
    - Orthopedics
    - Internal Medicine
    - Family Medicine
    - Geriatrics
  `);
});

export default app;
