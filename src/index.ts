/**
 * Healthcare Provider Database API
 *
 * Main entry point for the Express server
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import 'dotenv/config';

// Use mock routes for demo (no database required)
import routes from './api/mock-routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));
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

// Serve static frontend
app.use(express.static(path.join(__dirname, '../../public')));

// Root endpoint - serve frontend
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// API info endpoint
app.get('/api-info', (_req: Request, res: Response) => {
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
  ║     Healthcare Provider Database (Demo Mode)              ║
  ║     Running on http://localhost:${PORT}                       ║
  ╚═══════════════════════════════════════════════════════════╝

  Open in browser:  http://localhost:${PORT}

  Using mock data - no database required.
  For production use, see packages/backend/
  `);
});

export default app;
