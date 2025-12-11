import logger from '../utils/logger.js';
import { aiUsageQueries } from '../database/queries/aiUsageQueries.js';
import { config } from '../config/env.js';

/**
 * AI Cost Service
 * Tracks AI API usage and enforces daily spending limits per user
 */

// Model pricing per 1M tokens (USD)
// Updated pricing as of 2024
const MODEL_PRICING = {
  'deepseek-chat': {
    input: 0.14,   // $0.14 per 1M input tokens
    output: 0.28,  // $0.28 per 1M output tokens
    cached: 0.014, // $0.014 per 1M cached input tokens
  },
  'deepseek-reasoner': {
    input: 0.55,
    output: 2.19,
    cached: 0.055,
  },
  'gpt-4-turbo': {
    input: 10.0,
    output: 30.0,
  },
  'gpt-3.5-turbo': {
    input: 0.5,
    output: 1.5,
  },
  'claude-3-sonnet': {
    input: 3.0,
    output: 15.0,
  },
};

// Default daily limit from config or fallback to $5
const DEFAULT_DAILY_LIMIT = config.ai?.dailyLimitUsd || 5.0;

/**
 * Calculate cost based on token usage and model
 * @param {string} model - Model name
 * @param {number} promptTokens - Input tokens
 * @param {number} completionTokens - Output tokens
 * @returns {number} Cost in USD
 */
export function calculateCost(model, promptTokens, completionTokens) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['deepseek-chat'];

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Check if user can make AI request (under daily limit)
 * @param {number} userId - User ID
 * @returns {Promise<Object>} { canProceed, currentCost, dailyLimit, remaining }
 */
export async function checkDailyLimit(userId) {
  try {
    // Get user settings (custom limit or default)
    const settings = await aiUsageQueries.getUserSettings(userId);
    const dailyLimit = settings?.is_unlimited ? Infinity : (settings?.daily_limit_usd || DEFAULT_DAILY_LIMIT);

    // Get current daily cost
    const currentCost = await aiUsageQueries.getDailyCost(userId);

    const remaining = dailyLimit - currentCost;
    const canProceed = remaining > 0;

    return {
      canProceed,
      currentCost: parseFloat(currentCost.toFixed(6)),
      dailyLimit: dailyLimit === Infinity ? null : dailyLimit,
      remaining: dailyLimit === Infinity ? null : parseFloat(Math.max(0, remaining).toFixed(6)),
      isUnlimited: dailyLimit === Infinity,
    };
  } catch (error) {
    logger.error('Error checking AI daily limit:', {
      userId,
      error: error.message,
    });
    // On error, allow request but log warning
    return {
      canProceed: true,
      currentCost: 0,
      dailyLimit: DEFAULT_DAILY_LIMIT,
      remaining: DEFAULT_DAILY_LIMIT,
      error: 'Could not verify limit',
    };
  }
}

/**
 * Log AI usage and cost
 * @param {Object} params - Usage parameters
 * @returns {Promise<Object>} Logged entry
 */
export async function logUsage({
  userId,
  shopId = null,
  model = 'deepseek-chat',
  promptTokens,
  completionTokens,
  totalTokens,
  requestType = 'product_ai',
}) {
  try {
    const costUsd = calculateCost(model, promptTokens, completionTokens);

    const entry = await aiUsageQueries.logUsage({
      userId,
      shopId,
      model,
      promptTokens,
      completionTokens,
      totalTokens: totalTokens || (promptTokens + completionTokens),
      costUsd,
      requestType,
    });

    logger.info('AI usage logged', {
      userId,
      shopId,
      model,
      promptTokens,
      completionTokens,
      costUsd: costUsd.toFixed(6),
      requestType,
    });

    return entry;
  } catch (error) {
    logger.error('Error logging AI usage:', {
      userId,
      error: error.message,
    });
    // Don't throw - logging failure shouldn't break the request
    return null;
  }
}

/**
 * Get user's daily usage summary
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Usage summary
 */
export async function getDailyUsage(userId) {
  try {
    const [dailyCost, tokens, settings] = await Promise.all([
      aiUsageQueries.getDailyCost(userId),
      aiUsageQueries.getDailyTokens(userId),
      aiUsageQueries.getUserSettings(userId),
    ]);

    const dailyLimit = settings?.is_unlimited ? null : (settings?.daily_limit_usd || DEFAULT_DAILY_LIMIT);
    const remaining = dailyLimit ? Math.max(0, dailyLimit - dailyCost) : null;

    return {
      cost: parseFloat(dailyCost.toFixed(6)),
      limit: dailyLimit,
      remaining: remaining ? parseFloat(remaining.toFixed(6)) : null,
      isUnlimited: settings?.is_unlimited || false,
      tokens: {
        prompt: tokens.promptTokens,
        completion: tokens.completionTokens,
        total: tokens.totalTokens,
      },
      requests: tokens.requestCount,
      percentUsed: dailyLimit ? Math.min(100, (dailyCost / dailyLimit) * 100).toFixed(1) : 0,
    };
  } catch (error) {
    logger.error('Error getting daily AI usage:', {
      userId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Set custom daily limit for user
 * @param {number} userId - User ID
 * @param {number} limitUsd - New limit in USD
 * @returns {Promise<Object>} Updated settings
 */
export async function setUserDailyLimit(userId, limitUsd) {
  return aiUsageQueries.upsertUserSettings(userId, {
    dailyLimitUsd: limitUsd,
    isUnlimited: false,
  });
}

/**
 * Set user as unlimited (no daily cap)
 * @param {number} userId - User ID
 * @param {boolean} isUnlimited - Whether user has unlimited access
 * @returns {Promise<Object>} Updated settings
 */
export async function setUserUnlimited(userId, isUnlimited = true) {
  return aiUsageQueries.upsertUserSettings(userId, {
    dailyLimitUsd: DEFAULT_DAILY_LIMIT,
    isUnlimited,
  });
}

/**
 * Get usage statistics for user
 * @param {number} userId - User ID
 * @param {number} days - Days to look back
 * @returns {Promise<Array>} Daily stats
 */
export async function getUsageStats(userId, days = 7) {
  return aiUsageQueries.getUsageStats(userId, days);
}

/**
 * AI Cost Limit Error
 */
export class AICostLimitError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AICostLimitError';
    this.code = 'AI_COST_LIMIT_EXCEEDED';
    this.details = details;
  }
}

export const aiCostService = {
  calculateCost,
  checkDailyLimit,
  logUsage,
  getDailyUsage,
  setUserDailyLimit,
  setUserUnlimited,
  getUsageStats,
  AICostLimitError,
  DEFAULT_DAILY_LIMIT,
  MODEL_PRICING,
};

export default aiCostService;
