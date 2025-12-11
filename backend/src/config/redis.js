/**
 * Shared Redis Configuration
 *
 * Provides a centralized Redis client for:
 * - Bull queues (product sync)
 * - Rate limiting (express-rate-limit)
 * - Future caching needs
 *
 * Uses ioredis for better performance and reliability.
 */

import Redis from 'ioredis';
import logger from '../utils/logger.js';

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  maxRetriesPerRequest: null, // Required for Bull
  enableReadyCheck: false, // Required for Bull
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`[Redis] Reconnecting... attempt ${times}, delay ${delay}ms`);
    return delay;
  },
};

// Create Redis client instance
let redisClient = null;

/**
 * Get or create Redis client (singleton pattern)
 * @returns {Redis} Redis client instance
 */
export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(redisConfig);

    redisClient.on('connect', () => {
      logger.info('[Redis] Connected successfully');
    });

    redisClient.on('error', (err) => {
      logger.error('[Redis] Connection error:', { error: err.message });
    });

    redisClient.on('close', () => {
      logger.warn('[Redis] Connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('[Redis] Reconnecting...');
    });
  }

  return redisClient;
}

/**
 * Get Redis configuration for Bull queues
 * Bull requires raw config object, not client instance
 * @returns {Object} Redis configuration
 */
export function getRedisConfig() {
  return {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    db: redisConfig.db,
  };
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis() {
  if (redisClient) {
    logger.info('[Redis] Closing connection...');
    await redisClient.quit();
    redisClient = null;
    logger.info('[Redis] Connection closed');
  }
}

export default {
  getRedisClient,
  getRedisConfig,
  closeRedis,
};
