import logger from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';
import {
  CANCELLATION_COOLDOWN_THRESHOLD,
  CANCELLATION_COOLDOWN_MINUTES,
  CANCELLATION_WINDOW_SECONDS,
} from '../config/payments.js';

const CANCEL_COUNT_PREFIX = 'order_cancel_count:';
const CANCEL_BLOCK_PREFIX = 'order_cancel_block:';

const getCountKey = (userId) => `${CANCEL_COUNT_PREFIX}${userId}`;
const getBlockKey = (userId) => `${CANCEL_BLOCK_PREFIX}${userId}`;

export async function getCancellationCooldown(userId) {
  try {
    const redis = getRedisClient();
    const blockKey = getBlockKey(userId);
    const ttl = await redis.ttl(blockKey);

    if (ttl > 0) {
      return {
        blocked: true,
        remainingSeconds: ttl,
        remainingMinutes: Math.ceil(ttl / 60),
      };
    }
  } catch (error) {
    logger.warn('[OrderAbuse] Failed to read cancellation cooldown', {
      userId,
      error: error.message,
    });
  }

  return { blocked: false, remainingSeconds: 0, remainingMinutes: 0 };
}

export async function recordCancellation(userId) {
  try {
    const redis = getRedisClient();
    const countKey = getCountKey(userId);

    const count = await redis.incr(countKey);
    if (count === 1) {
      await redis.expire(countKey, CANCELLATION_WINDOW_SECONDS);
    }

    if (count >= CANCELLATION_COOLDOWN_THRESHOLD) {
      const blockSeconds = CANCELLATION_COOLDOWN_MINUTES * 60;
      const blockKey = getBlockKey(userId);
      await redis.set(blockKey, '1', 'EX', blockSeconds);
      return {
        count,
        blocked: true,
        remainingSeconds: blockSeconds,
        remainingMinutes: CANCELLATION_COOLDOWN_MINUTES,
      };
    }

    return {
      count,
      blocked: false,
      remainingSeconds: 0,
      remainingMinutes: 0,
    };
  } catch (error) {
    logger.warn('[OrderAbuse] Failed to record cancellation', {
      userId,
      error: error.message,
    });
    return { count: 0, blocked: false, remainingSeconds: 0, remainingMinutes: 0 };
  }
}

export default {
  getCancellationCooldown,
  recordCancellation,
};
