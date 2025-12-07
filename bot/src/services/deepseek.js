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
      timeout: 30000, // 30s timeout (standard for fast models to handle load spikes)
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
   * Supports two call styles:
   * 1. Positional arguments (legacy): chat(systemPrompt, userMessage, tools, history, maxRetries)
   * 2. Options object (new): chat({ system, messages, tools, temperature, toolChoice, stream, maxRetries })
   *
   * @param {string|Object} systemPromptOrOptions - System prompt OR options object
   * @param {string} userMessage - User command (if using positional args)
   * @param {Array} tools - Available tools/functions (if using positional args)
   * @param {Array} conversationHistory - Previous messages (if using positional args)
   * @param {number} maxRetries - Max retry attempts (if using positional args)
   * @returns {Object} API response with tool calls
   */
  async chat(
    systemPromptOrOptions,
    userMessage,
    tools = [],
    conversationHistory = [],
    maxRetries = 3
  ) {
    if (!this.isAvailable()) {
      throw new Error('DeepSeek API not configured');
    }

    // Detect call style
    let systemPrompt;
    let messages;
    let apiTools;
    let temperature;
    let toolChoice;
    let retries;

    if (
      typeof systemPromptOrOptions === 'object' &&
      systemPromptOrOptions !== null &&
      !Array.isArray(systemPromptOrOptions)
    ) {
      // New style: options object
      const options = systemPromptOrOptions;
      systemPrompt = options.system;
      messages = options.messages || [];
      apiTools = options.tools || [];
      temperature = options.temperature;
      toolChoice = options.toolChoice; // Support custom tool_choice
      retries = options.maxRetries || 3;

      // If system prompt provided, ensure it's at the start of messages
      if (systemPrompt && !messages.some((m) => m.role === 'system')) {
        messages = [{ role: 'system', content: systemPrompt }, ...messages];
      }
    } else {
      // Legacy style: positional arguments
      systemPrompt = systemPromptOrOptions;
      apiTools = tools;
      retries = maxRetries;
      // Auto-detect temperature based on tools (backward compatibility)
      temperature = undefined;

      messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage },
      ];
    }

    // Debug logging - see what AI actually receives
    logger.debug('deepseek_api_messages', {
      messagesCount: messages.length,
      historyLength: conversationHistory.length,
      messages: JSON.stringify(messages, null, 2),
    });

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();

        // Determine temperature: explicit > auto-detect based on tools > default
        const finalTemperature =
          temperature !== undefined ? temperature : apiTools.length > 0 ? 0.2 : 0.7;

        // Determine tool_choice: explicit > 'auto' (default when tools present) > undefined
        const finalToolChoice = apiTools.length > 0 ? toolChoice || 'auto' : undefined;

        const response = await this.client.chat.completions.create({
          model: 'deepseek-chat',
          messages,
          tools: apiTools.length > 0 ? apiTools : undefined,
          tool_choice: finalToolChoice, // Support explicit tool_choice: 'auto', 'none', 'required'
          temperature: finalTemperature, // Support explicit temperature override
          max_tokens: 500,
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
          attempt,
        });

        return response;
      } catch (error) {
        logger.error(`DeepSeek API error (attempt ${attempt}/${maxRetries}):`, {
          error: error.message,
          status: error.status,
          code: error.code,
          type: error.type,
        });

        // Retry on 503 (server overload) and 429 (rate limit) with exponential backoff
        if ((error.status === 503 || error.status === 429) && attempt < maxRetries) {
          const delay =
            error.status === 429
              ? Math.pow(2, attempt) * 2000 // Longer delay for rate limits: 4s, 8s, 16s
              : Math.pow(2, attempt) * 1000; // Regular delay for 503: 2s, 4s, 8s

          logger.warn(`DeepSeek API error ${error.status}, retry ${attempt}/${maxRetries}`, {
            delay,
            status: error.status,
            message: error.message,
          });

          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Don't retry on 400 (bad request), 401 (auth)
        if ([400, 401].includes(error.status)) {
          throw error;
        }

        // Retry on network errors and 500 errors
        if (attempt < maxRetries && (error.code === 'ECONNREFUSED' || error.status >= 500)) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw new Error(`DeepSeek API failed after ${maxRetries} attempts`);
  }

  /**
   * Call DeepSeek API with streaming for real-time responses
   *
   * @param {string} systemPrompt - System prompt with context
   * @param {string} userMessage - User command
   * @param {Array} tools - Available tools/functions
   * @param {Array} conversationHistory - Previous messages for context
   * @param {Function} onChunk - Callback called with each text chunk: (chunk: string, fullText: string) => void
   * @returns {Object} Complete response with finish_reason, content, and tool_calls
   */
  async chatStreaming(
    systemPrompt,
    userMessage,
    tools = [],
    conversationHistory = [],
    onChunk = null
  ) {
    if (!this.isAvailable()) {
      throw new Error('DeepSeek API not configured');
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ];

    // Debug logging - see what AI actually receives
    logger.debug('deepseek_api_messages_streaming', {
      messagesCount: messages.length,
      historyLength: conversationHistory.length,
      messages: JSON.stringify(messages, null, 2),
    });

    const startTime = Date.now();
    let fullText = '';
    const toolCalls = [];
    let finishReason = null;

    try {
      const stream = await this.client.chat.completions.create({
        model: 'deepseek-chat',
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined, // 'auto' - AI decides when to use functions
        temperature: tools.length > 0 ? 0.2 : 0.7, // Low temp for function calling, normal for chat
        max_tokens: 500,
        stream: true, // Enable streaming
      });

      // Process stream chunks
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;

        // Handle text content
        if (delta.content) {
          fullText += delta.content;

          // Call onChunk callback if provided
          if (onChunk && typeof onChunk === 'function') {
            await onChunk(delta.content, fullText);
          }
        }

        // Handle tool calls (function calls)
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;

            if (!toolCalls[index]) {
              toolCalls[index] = {
                id: toolCall.id || '',
                type: 'function',
                function: {
                  name: toolCall.function?.name || '',
                  arguments: toolCall.function?.arguments || '',
                },
              };
            } else {
              // Accumulate function arguments
              if (toolCall.function?.arguments) {
                toolCalls[index].function.arguments += toolCall.function.arguments;
              }
            }
          }
        }

        // Capture finish reason
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }

      const latency = Date.now() - startTime;

      logger.info('deepseek_streaming_api_call', {
        latencyMs: latency,
        textLength: fullText.length,
        toolCallsCount: toolCalls.length,
        finishReason,
      });

      // Return response in same format as non-streaming chat()
      return {
        choices: [
          {
            message: {
              role: 'assistant',
              content: fullText || null,
              tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            },
            finish_reason: finishReason,
          },
        ],
        model: 'deepseek-chat',
      };
    } catch (error) {
      logger.error('DeepSeek streaming API error:', {
        error: error.message,
        status: error.status,
        code: error.code,
      });
      throw error;
    }
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
    const inputCostPerM = cacheHit ? 0.068 : 0.27; // $0.068 or $0.27 per 1M tokens
    const outputCostPerM = 1.09; // $1.09 per 1M tokens

    const inputCost = (promptTokens / 1000000) * inputCostPerM;
    const outputCost = (completionTokens / 1000000) * outputCostPerM;

    return inputCost + outputCost;
  }
}

// Export singleton instance
export const deepseek = new DeepSeekClient();
export default deepseek;
