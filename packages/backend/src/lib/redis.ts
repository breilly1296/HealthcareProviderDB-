/**
 * Redis Client Module
 *
 * Provides a singleton Redis client for distributed rate limiting.
 *
 * Features:
 * - Singleton pattern (one connection per process)
 * - Graceful connection handling with retry logic
 * - Connection state tracking
 * - Structured error logging
 *
 * Usage:
 *   Set REDIS_URL environment variable to enable Redis.
 *   If not set, getRedisClient() returns null and callers should use fallback.
 *
 * Environment Variables:
 *   REDIS_URL - Redis connection string (e.g., redis://10.0.0.3:6379)
 */

import Redis from 'ioredis';
import logger from '../utils/logger';

// Singleton state
let redisClient: Redis | null = null;
let isConnected = false;
let connectionAttempted = false;

/**
 * Get or create the Redis client singleton.
 *
 * @returns Redis client if REDIS_URL is configured and connection succeeds, null otherwise
 */
export function getRedisClient(): Redis | null {
  // Only attempt connection once per process
  if (connectionAttempted) {
    return redisClient;
  }
  connectionAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info('REDIS_URL not configured - Redis features disabled');
    return null;
  }

  try {
    logger.info('Initializing Redis connection');

    redisClient = new Redis(redisUrl, {
      // Connection settings
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000,

      // Retry strategy with exponential backoff
      retryStrategy: (times) => {
        if (times > 5) {
          logger.error({ attempts: times }, 'Redis max reconnection attempts reached, giving up');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 200, 3000);
        logger.info({ delay, attempt: times }, 'Redis reconnecting');
        return delay;
      },

      // Don't block startup if Redis is slow
      enableReadyCheck: true,
      lazyConnect: false,
    });

    // Connection event handlers
    redisClient.on('connect', () => {
      logger.info('Redis TCP connection established');
    });

    redisClient.on('ready', () => {
      isConnected = true;
      logger.info('Redis ready - accepting commands');
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, 'Redis error');
      isConnected = false;
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
      isConnected = false;
    });

    redisClient.on('reconnecting', (delay: number) => {
      logger.info({ delay }, 'Redis reconnecting');
    });

    redisClient.on('end', () => {
      logger.info('Redis connection ended');
      isConnected = false;
    });

    return redisClient;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Redis client');
    redisClient = null;
    return null;
  }
}

/**
 * Check if Redis is currently connected and ready for commands.
 */
export function isRedisConnected(): boolean {
  return isConnected && redisClient !== null && redisClient.status === 'ready';
}

/**
 * Get the current Redis connection status.
 */
export function getRedisStatus(): {
  configured: boolean;
  connected: boolean;
  status: string;
} {
  return {
    configured: !!process.env.REDIS_URL,
    connected: isConnected,
    status: redisClient?.status || 'not initialized',
  };
}

/**
 * Gracefully close the Redis connection.
 * Call this during application shutdown.
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    logger.info('Closing Redis connection');
    try {
      await redisClient.quit();
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error({ error }, 'Redis error during shutdown, forcing disconnect');
      redisClient.disconnect();
    }
    redisClient = null;
    isConnected = false;
    connectionAttempted = false;
  }
}
