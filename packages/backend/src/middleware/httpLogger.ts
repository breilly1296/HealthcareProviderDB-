import pinoHttp from 'pino-http';
import logger from '../utils/logger';

/**
 * HTTP request logging middleware using pino-http.
 * - Includes req.id from requestId middleware in every log entry
 * - Logs method, url, statusCode, responseTime
 * - Excludes health check endpoint to reduce noise
 */
const httpLogger = pinoHttp({
  logger,

  // Use req.id from requestId middleware
  genReqId: (req) => req.id,

  // Custom log level based on status code
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  // Customize what gets logged
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed`;
  },

  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed: ${err.message}`;
  },

  // Customize serializers to control what's logged
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },

  // Skip logging for health checks to reduce noise
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
});

export default httpLogger;
