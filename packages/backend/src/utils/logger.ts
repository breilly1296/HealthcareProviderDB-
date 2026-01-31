import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Pino logger instance with structured JSON logging.
 * - Uses LOG_LEVEL env var (default: 'info')
 * - In development, uses pino-pretty for readable output
 * - In production, outputs JSON for cloud logging systems
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        // Production: structured JSON with timestamp
        formatters: {
          level: (label) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});

export default logger;
