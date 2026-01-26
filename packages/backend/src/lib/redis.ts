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
    console.log('[Redis] REDIS_URL not configured - Redis features disabled');
    return null;
  }

  try {
    console.log('[Redis] Initializing connection...');

    redisClient = new Redis(redisUrl, {
      // Connection settings
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000,

      // Retry strategy with exponential backoff
      retryStrategy: (times) => {
        if (times > 5) {
          console.error(`[Redis] Max reconnection attempts (${times}) reached, giving up`);
          return null; // Stop retrying
        }
        const delay = Math.min(times * 200, 3000);
        console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${times})...`);
        return delay;
      },

      // Don't block startup if Redis is slow
      enableReadyCheck: true,
      lazyConnect: false,
    });

    // Connection event handlers
    redisClient.on('connect', () => {
      console.log('[Redis] TCP connection established');
    });

    redisClient.on('ready', () => {
      isConnected = true;
      console.log('[Redis] Ready - accepting commands');
    });

    redisClient.on('error', (err) => {
      // Only log once per error type to avoid spam
      console.error('[Redis] Error:', err.message);
      isConnected = false;
    });

    redisClient.on('close', () => {
      console.warn('[Redis] Connection closed');
      isConnected = false;
    });

    redisClient.on('reconnecting', (delay: number) => {
      console.log(`[Redis] Reconnecting in ${delay}ms...`);
    });

    redisClient.on('end', () => {
      console.log('[Redis] Connection ended');
      isConnected = false;
    });

    return redisClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Redis] Failed to initialize client:', message);
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
    console.log('[Redis] Closing connection...');
    try {
      await redisClient.quit();
      console.log('[Redis] Connection closed gracefully');
    } catch (error) {
      console.error('[Redis] Error during shutdown, forcing disconnect');
      redisClient.disconnect();
    }
    redisClient = null;
    isConnected = false;
    connectionAttempted = false;
  }
}
