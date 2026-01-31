import { Request, Response, NextFunction } from 'express';

/**
 * Request log entry structure
 * Explicitly excludes PII (no IP, user agent, or identifying information)
 */
interface RequestLogEntry {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  rateLimited: boolean;
  rateLimitInfo?: {
    limit: number;
    remaining: number;
  };
}

/**
 * Structured logger for production environments
 * Outputs JSON logs that Cloud Run/Cloud Logging can parse automatically
 */
const logger = {
  info: (entry: RequestLogEntry) => {
    if (process.env.NODE_ENV === 'production') {
      // Structured JSON for cloud logging (GCP Cloud Logging, etc.)
      console.log(JSON.stringify({
        severity: 'INFO',
        ...entry,
      }));
    } else {
      // Colored console output for development
      const statusColor = entry.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
      const resetColor = '\x1b[0m';
      const rateLimitTag = entry.rateLimited ? ' [RATE LIMITED]' : '';
      console.log(
        `[${entry.requestId.slice(0, 8)}] ${statusColor}${entry.method}${resetColor} ${entry.path} - ${statusColor}${entry.statusCode}${resetColor} (${entry.responseTimeMs}ms)${rateLimitTag}`
      );
    }
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify({ severity: 'WARNING', message, ...data }));
    } else {
      console.warn(`\x1b[33m[WARN]\x1b[0m ${message}`, data || '');
    }
  },
  error: (message: string, error?: unknown, data?: Record<string, unknown>) => {
    const errorDetails = error instanceof Error
      ? { errorMessage: error.message, stack: error.stack }
      : { errorMessage: String(error) };

    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify({ severity: 'ERROR', message, ...errorDetails, ...data }));
    } else {
      console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`, errorDetails, data || '');
    }
  },
};

// Export logger for use in other modules
export { logger };

/**
 * In-memory log buffer for aggregation (development/debugging only)
 * In production, logs go to Cloud Logging via stdout
 */
const logBuffer: RequestLogEntry[] = [];
const MAX_BUFFER_SIZE = 1000;

// Note: req.id is provided by requestId middleware

/**
 * Request logging middleware
 * - Tracks API usage without logging PII
 * - Uses req.id from requestId middleware for correlation
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Use request ID from requestId middleware
  const requestId = req.id;

  const startTime = Date.now();

  // Store original end function
  const originalEnd = res.end;

  // Override res.end to capture response data
  res.end = function (this: Response, ...args: Parameters<Response['end']>): Response {
    const responseTimeMs = Date.now() - startTime;

    // Extract rate limit info from headers (set by rateLimiter middleware)
    const rateLimitHeader = res.getHeader('X-RateLimit-Limit');
    const rateLimitRemaining = res.getHeader('X-RateLimit-Remaining');
    const rateLimited = res.statusCode === 429;

    const logEntry: RequestLogEntry = {
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTimeMs,
      rateLimited,
    };

    // Add rate limit info if present
    if (rateLimitHeader !== undefined) {
      logEntry.rateLimitInfo = {
        limit: Number(rateLimitHeader),
        remaining: Number(rateLimitRemaining) || 0,
      };
    }

    // Add to buffer (for stats endpoint)
    addLogEntry(logEntry);

    // Log to stdout (picked up by Cloud Logging in production)
    logger.info(logEntry);

    // Call original end
    return originalEnd.apply(this, args);
  } as Response['end'];

  next();
}

/**
 * Add log entry to buffer with rotation
 */
function addLogEntry(entry: RequestLogEntry): void {
  logBuffer.push(entry);

  // Rotate buffer if too large
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }
}

/**
 * Get aggregated request statistics
 * Useful for monitoring and debugging
 */
export function getRequestStats(): {
  totalRequests: number;
  rateLimitedRequests: number;
  avgResponseTimeMs: number;
  statusCodeCounts: Record<number, number>;
  endpointCounts: Record<string, number>;
  recentLogs: RequestLogEntry[];
} {
  const totalRequests = logBuffer.length;
  const rateLimitedRequests = logBuffer.filter(l => l.rateLimited).length;
  const avgResponseTimeMs = totalRequests > 0
    ? Math.round(logBuffer.reduce((sum, l) => sum + l.responseTimeMs, 0) / totalRequests)
    : 0;

  const statusCodeCounts: Record<number, number> = {};
  const endpointCounts: Record<string, number> = {};

  for (const log of logBuffer) {
    // Count status codes
    statusCodeCounts[log.statusCode] = (statusCodeCounts[log.statusCode] || 0) + 1;

    // Count endpoints (method + path)
    const endpoint = `${log.method} ${log.path}`;
    endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
  }

  return {
    totalRequests,
    rateLimitedRequests,
    avgResponseTimeMs,
    statusCodeCounts,
    endpointCounts,
    recentLogs: logBuffer.slice(-20), // Last 20 logs
  };
}

/**
 * Clear the log buffer
 * Useful for testing or manual reset
 */
export function clearRequestLogs(): void {
  logBuffer.length = 0;
}
