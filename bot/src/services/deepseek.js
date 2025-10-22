import OpenAI from 'openai';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * DeepSeek API Client
 * Uses OpenAI SDK with DeepSeek API endpoint
 */
class DeepSeekClient {
  constructor() {
    if (!config.deepseekApiKey) {
      logger.warn('DEEPSEEK_API_KEY not configured - AI features will be disabled');
      this.client = null;
      return;
    }

    this.client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: config.deepseekApiKey,
      timeout: 10000 // 10s timeout
    });

    logger.info('DeepSeek client initialized');
  }

  /**
   * Check if DeepSeek API is available
   */
  isAvailable() {
    return this.client !== null;
  }

  /**
   * Call DeepSeek API with function calling (tool use)
   *
   * @param {string} systemPrompt - System prompt with context
   * @param {string} userMessage - User command
   * @param {Array} tools - Available tools/functions
   * @param {Array} conversationHistory - Previous messages for context
   * @param {number} maxRetries - Max retry attempts
   * @returns {Object} API response with tool calls
   */
  async chat(systemPrompt, userMessage, tools = [], conversationHistory = [], maxRetries = 3) {
    if (!this.isAvailable()) {
      throw new Error('DeepSeek API not configured');
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const startTime = Date.now();

        const response = await this.client.chat.completions.create({
          model: 'deepseek-chat',
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          temperature: 0.7,  // 0.3 made it worse - reverting to 0.7
          max_tokens: 500
        });

        const latency = Date.now() - startTime;

        // Log usage metrics
        logger.info('deepseek_api_call', {
          tokensUsed: response.usage?.total_tokens || 0,
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          promptCacheHit: response.usage?.prompt_cache_hit_tokens || 0,
          promptCacheMiss: response.usage?.prompt_cache_miss_tokens || 0,
          latencyMs: latency,
          model: response.model,
          finishReason: response.choices[0]?.finish_reason,
          attempt
        });

        return response;

      } catch (error) {
        logger.error(`DeepSeek API error (attempt ${attempt}/${maxRetries}):`, {
          error: error.message,
          status: error.status,
          code: error.code,
          type: error.type
        });

        // Retry on 503 (server overload) with exponential backoff
        if (error.status === 503 && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          logger.info(`Retrying after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Don't retry on 400 (bad request), 401 (auth), 429 (rate limit)
        if ([400, 401, 429].includes(error.status)) {
          throw error;
        }

        // Retry on network errors and 500 errors
        if (attempt < maxRetries && (error.code === 'ECONNREFUSED' || error.status >= 500)) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw new Error(`DeepSeek API failed after ${maxRetries} attempts`);
  }

  /**
   * Calculate estimated cost for a request
   * Based on DeepSeek API pricing (as of 2025)
   * 
   * @param {number} promptTokens - Input tokens
   * @param {number} completionTokens - Output tokens
   * @param {boolean} cacheHit - Whether prompt was cached
   * @returns {number} Cost in USD
   */
  calculateCost(promptTokens, completionTokens, cacheHit = false) {
    const inputCostPerM = cacheHit ? 0.068 : 0.27;  // $0.068 or $0.27 per 1M tokens
    const outputCostPerM = 1.09;  // $1.09 per 1M tokens

    const inputCost = (promptTokens / 1000000) * inputCostPerM;
    const outputCost = (completionTokens / 1000000) * outputCostPerM;

    return inputCost + outputCost;
  }
}

// Export singleton instance
export const deepseek = new DeepSeekClient();
export default deepseek;
