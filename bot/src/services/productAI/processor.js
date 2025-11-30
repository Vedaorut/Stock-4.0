/**
 * Product AI Processor - Main command processing logic
 */

import deepseek from '../deepseek.js';
import { productTools } from '../../tools/productTools.js';
import { generateProductAIPrompt, sanitizeUserInput } from '../../utils/systemPrompts.js';
import logger from '../../utils/logger.js';
import { reply as cleanReply } from '../../utils/cleanReply.js';
import { generateDeterministicResponse } from '../../utils/responseGenerator.js';

// Internal modules
import { cleanDeepSeekTokens, detectJSONInMessage } from './utils/index.js';
import {
  getConversationHistory,
  saveToConversationHistory,
  updateContextFromResult,
} from './context/index.js';
import { detectStockUpdateIntent, detectSingleProductDiscountIntent } from './detection/index.js';
import { executeToolCall } from './routing/index.js';
import { handleUpdateProduct } from './handlers/index.js';

/**
 * Process AI command for product management
 *
 * @param {string} userCommand - User's natural language command
 * @param {Object} context - Context object with shopId, shopName, token, products
 * @returns {Object} Result object with success, message, data, needsClarification
 */
export async function processProductCommand(userCommand, context) {
  const {
    shopId,
    shopName,
    token,
    products = [],
    orders = [],
    ctx,
    clarifiedProductId,
    clarifiedProductName,
    isWorker = false,
  } = context;
  const startTime = Date.now();

  // Validate context
  if (!shopId || !shopName || !token) {
    return {
      success: false,
      message: 'Error: missing shop information',
    };
  }

  // Check if DeepSeek is available
  if (!deepseek.isAvailable()) {
    return {
      success: false,
      message: 'AI unavailable. Use the regular menu.',
      fallbackToMenu: true,
    };
  }

  // Sanitize user input
  const sanitizedCommand = sanitizeUserInput(userCommand);
  if (!sanitizedCommand) {
    return {
      success: false,
      message: 'Empty command',
    };
  }

  try {
    // Attempt fast-path discount detection before calling AI
    const quickDiscount = detectSingleProductDiscountIntent(sanitizedCommand, products, ctx);
    if (quickDiscount) {
      if (quickDiscount.error) {
        return {
          success: false,
          message: quickDiscount.error.message,
        };
      }

      const updates = {
        discount_percentage: quickDiscount.percentage,
      };

      if (quickDiscount.duration) {
        updates.discount_expires_at = quickDiscount.duration;
      }

      const result = await handleUpdateProduct(
        {
          productName: quickDiscount.product.name,
          updates,
        },
        shopId,
        token,
        products
      );

      if (ctx && result.success) {
        updateContextFromResult(ctx, result, sanitizedCommand);
      }

      if (result.success) {
        // AI generates natural response for discount
        const messages = [
          { role: 'user', content: sanitizedCommand },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'quick_discount',
                type: 'function',
                function: {
                  name: 'updateProduct',
                  arguments: JSON.stringify({
                    productName: quickDiscount.product.name,
                    updates: { discount_percentage: quickDiscount.percentage },
                  }),
                },
              },
            ],
          },
          {
            role: 'tool',
            tool_call_id: 'quick_discount',
            content: JSON.stringify(result),
          },
        ];

        try {
          const systemPrompt = generateProductAIPrompt(shopName, products, {
            sessionContext: ctx?.session?.aiContext,
            orders,
            isWorker,
          });
          const aiResponse = await deepseek.chat({ system: systemPrompt, messages, stream: false });
          const message =
            aiResponse.choices[0].message.content ||
            `Applied ${quickDiscount.percentage}% discount to ${quickDiscount.product.name}.`;

          if (ctx) {
            saveToConversationHistory(ctx, [
              { role: 'user', content: sanitizedCommand },
              { role: 'assistant', content: message },
            ]);
          }

          return {
            ...result,
            message,
            operation: 'quick_discount_update',
          };
        } catch (err) {
          logger.warn('AI response generation failed, using fallback:', err.message);
          const suffix = quickDiscount.duration ? ` for ${quickDiscount.duration}` : '';
          const message = `Applied ${quickDiscount.percentage}% discount to ${quickDiscount.product.name}${suffix}.`;
          return {
            ...result,
            message,
            operation: 'quick_discount_update',
          };
        }
      }

      return result;
    }

    // Attempt fast-path stock update detection
    const quickStockUpdate = detectStockUpdateIntent(sanitizedCommand);
    if (quickStockUpdate) {
      logger.info('stock_update_intent_detected', {
        shopId,
        productName: quickStockUpdate.productName,
        quantity: quickStockUpdate.quantity,
      });

      const result = await handleUpdateProduct(
        {
          productName: quickStockUpdate.productName,
          updates: { stock_quantity: quickStockUpdate.quantity },
        },
        shopId,
        token,
        products
      );

      // Legacy format - save only text messages for backward compatibility
      if (ctx && result.message) {
        saveToConversationHistory(ctx, [
          { role: 'user', content: sanitizedCommand },
          { role: 'assistant', content: result.message },
        ]);
      }

      if (ctx && result.success) {
        updateContextFromResult(ctx, result, sanitizedCommand);
      }

      if (result.success && result.data?.product) {
        // AI generates natural response for stock update
        const messages = [
          { role: 'user', content: sanitizedCommand },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'quick_stock',
                type: 'function',
                function: {
                  name: 'updateProduct',
                  arguments: JSON.stringify({
                    productName: quickStockUpdate.productName,
                    updates: { stock_quantity: quickStockUpdate.quantity },
                  }),
                },
              },
            ],
          },
          {
            role: 'tool',
            tool_call_id: 'quick_stock',
            content: JSON.stringify(result),
          },
        ];

        try {
          const systemPrompt = generateProductAIPrompt(shopName, products, {
            sessionContext: ctx?.session?.aiContext,
            orders,
            isWorker,
          });
          const aiResponse = await deepseek.chat({ system: systemPrompt, messages, stream: false });
          const message =
            aiResponse.choices[0].message.content ||
            `Done, ${result.data.product.name}: stock ${quickStockUpdate.quantity}.`;

          if (ctx) {
            saveToConversationHistory(ctx, [
              { role: 'user', content: sanitizedCommand },
              { role: 'assistant', content: message },
            ]);
          }

          return {
            ...result,
            message,
            operation: 'quick_stock_update',
          };
        } catch (err) {
          logger.warn('AI response generation failed, using fallback:', err.message);
          const message = `Done, ${result.data.product.name}: stock ${quickStockUpdate.quantity}.`;
          return {
            ...result,
            message,
            operation: 'quick_stock_update',
          };
        }
      }

      return result;
    }

  // Generate system prompt
  const systemPrompt = generateProductAIPrompt(shopName, products, {
    sessionContext: ctx?.session?.aiContext,
    orders,
    isWorker,
  });

    // Get conversation history for context
    const conversationHistory = getConversationHistory(ctx);

    logger.debug('ai_processing_with_history', {
      shopId,
      historyLength: conversationHistory.length,
      command: sanitizedCommand.slice(0, 50),
    });

    // Typing indicator - keep showing "typing..." during AI processing
    let typingInterval = null;
    if (ctx) {
      await ctx.sendChatAction('typing').catch(() => {});
      typingInterval = setInterval(() => {
        ctx.sendChatAction('typing').catch(() => {});
      }, 4000); // Every 4 seconds
    }

    // Streaming state for Telegram message updates
    let streamingMessage = null;
    let lastUpdateTime = 0;
    let wordCount = 0;
    const UPDATE_THROTTLE_MS = 500; // Update max once per 500ms
    const WORDS_PER_UPDATE = 15; // Or every 15 words

    // onChunk callback for streaming updates (currently unused but kept for future)
    const _onChunk = async (chunk, fullText) => {
      if (!ctx) return;

      wordCount++;

      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTime;

      if (wordCount >= WORDS_PER_UPDATE || timeSinceLastUpdate >= UPDATE_THROTTLE_MS) {
        try {
          if (!streamingMessage) {
            streamingMessage = await cleanReply(ctx, fullText);
          } else {
            await ctx.telegram.editMessageText(
              streamingMessage.chat.id,
              streamingMessage.message_id,
              undefined,
              fullText
            );
          }
          lastUpdateTime = now;
          wordCount = 0;
        } catch (err) {
          if (err.response?.error_code !== 400) {
            logger.warn('Streaming edit error:', err.message);
          }
        }
      }
    };

    // Call DeepSeek API (NON-streaming for reliability - guaranteed complete JSON)
    let response;
    try {
      response = await deepseek.chat(
        systemPrompt,
        sanitizedCommand,
        productTools,
        conversationHistory
      );
    } finally {
      // Stop typing indicator
      if (typingInterval) {
        clearInterval(typingInterval);
      }
    }

    const processingTime = Date.now() - startTime;
    logger.info('ai_product_command_processed', {
      shopId,
      userId: ctx?.from?.id,
      command: sanitizedCommand.substring(0, 100),
      streaming: true,
      processingTimeMs: processingTime,
      hadHistory: conversationHistory.length > 0,
    });

    const choice = response.choices[0];

    // Check if AI wants to use a tool
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      const toolCall = choice.message.tool_calls[0]; // Take first tool call
      const functionName = toolCall.function.name;

      // Safe JSON parsing
      let args;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        logger.error('Failed to parse AI function arguments:', e);
        await cleanReply(ctx, 'Error: could not parse command parameters.');
        return { success: false, message: 'AI JSON parse error' };
      }

      const toolCallStartTime = Date.now();
      logger.info('ai_tool_call', {
        shopId,
        userId: ctx?.from?.id,
        function: functionName,
        arguments: JSON.stringify(args),
        clarified: !!clarifiedProductId,
      });

      // Delete streaming message since function result will be in a new message
      if (streamingMessage && ctx) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 100));
          await ctx.telegram.deleteMessage(streamingMessage.chat.id, streamingMessage.message_id);
        } catch (err) {
          if (err.response?.error_code !== 400) {
            logger.warn('Failed to delete streaming message:', err.message);
          }
        }
      }

      // Execute the appropriate function
      const result = await executeToolCall(functionName, args, {
        shopId,
        token,
        products,
        ctx,
        clarifiedProductId,
        clarifiedProductName,
      });

      const toolCallTime = Date.now() - toolCallStartTime;
      logger.info('ai_tool_call_completed', {
        shopId,
        userId: ctx?.from?.id,
        function: functionName,
        success: result.success,
        executionTimeMs: toolCallTime,
      });

      if (ctx && result.success) {
        updateContextFromResult(ctx, result, sanitizedCommand);
      }

      if (result.message && !result.data) {
        if (ctx && result.message) {
          saveToConversationHistory(ctx, [
            { role: 'user', content: sanitizedCommand },
            { role: 'assistant', content: result.message },
          ]);
        }
        return result;
      }

      const totalTime = Date.now() - startTime;

      // Build conversation for AI to generate natural response
      const messages = conversationHistory.slice();
      messages.push({ role: 'user', content: sanitizedCommand });
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [toolCall],
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });

      // Initialize with deterministic fallback
      let finalMessage = cleanDeepSeekTokens(generateDeterministicResponse(result));

      // Try to improve response with AI ONLY if operation succeeded
      if (result.success) {
        try {
          messages.push({
            role: 'system',
            content:
              'CRITICAL: Function executed successfully. Simply communicate the result to the user in natural language. Do NOT try to analyze or fix what the Backend already did.',
          });

          const aiResponse = await deepseek.chat({
            system: systemPrompt,
            messages,
            temperature: 0.7,
            maxRetries: 2,
          });

          if (aiResponse.choices[0].message.content) {
            const aiGeneratedMessage = cleanDeepSeekTokens(aiResponse.choices[0].message.content);

            // ANTI-JSON PROTECTION: Check for JSON patterns in AI response
            if (detectJSONInMessage(aiGeneratedMessage)) {
              logger.warn('Detected JSON in AI response, reverting to deterministic fallback', {
                aiResponse: aiGeneratedMessage.substring(0, 100),
              });
              // Keep deterministic fallback
            } else {
              finalMessage = aiGeneratedMessage;
            }
          }
        } catch (err) {
          logger.warn('AI response generation failed, using deterministic fallback:', err.message);
        }
      }

      // Save to conversation history
      if (ctx && finalMessage) {
        saveToConversationHistory(ctx, [
          { role: 'user', content: sanitizedCommand },
          { role: 'assistant', content: null, tool_calls: [toolCall] },
          { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) },
          { role: 'assistant', content: finalMessage },
        ]);
      }

      logger.info('ai_command_with_tool_completed', {
        shopId,
        userId: ctx?.from?.id,
        function: functionName,
        totalTimeMs: totalTime,
        success: result.success,
      });

      return {
        ...result,
        message: finalMessage,
        operation: result.operation || result.data?.action || functionName,
      };
    }

    // No tool call - AI responded with text
    const aiMessage = choice.message.content;

    // ALWAYS do final update to ensure complete message is sent
    if (streamingMessage && ctx && aiMessage) {
      try {
        await ctx.telegram.editMessageText(
          streamingMessage.chat.id,
          streamingMessage.message_id,
          undefined,
          aiMessage
        );
      } catch (err) {
        if (err.response?.description !== 'Bad Request: message is not modified') {
          logger.warn('Failed to send final AI message:', err.message);
        }
      }
    } else if (!streamingMessage && ctx && aiMessage) {
      try {
        await cleanReply(ctx, aiMessage);
      } catch (err) {
        logger.warn('Failed to send AI message:', err.message);
      }
    }

    const totalTime = Date.now() - startTime;

    // Save text conversation (no tool calls)
    if (ctx && aiMessage) {
      saveToConversationHistory(ctx, [
        { role: 'user', content: sanitizedCommand },
        { role: 'assistant', content: aiMessage },
      ]);
    }

    logger.info('ai_text_response_completed', {
      shopId,
      userId: ctx?.from?.id,
      totalTimeMs: totalTime,
      responseLength: aiMessage?.length || 0,
    });

    return {
      success: true,
      message: aiMessage || 'Command processed',
      data: null,
      streamingMessageId: streamingMessage?.message_id,
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error('AI product command error:', {
      totalTimeMs: totalTime,
      error: error.message,
      stack: error.stack,
      shopId,
      command: sanitizedCommand.substring(0, 100),
      status: error.status,
      code: error.code,
      timestamp: new Date().toISOString(),
    });

    // Handle specific errors with user-friendly messages
    if (error.status === 503) {
      return {
        success: false,
        message: 'Service temporarily overloaded. Try again in a minute.',
        retry: true,
      };
    }

    if (error.status === 429) {
      return {
        success: false,
        message: 'Too many requests. Wait a minute and try again.',
        retry: true,
      };
    }

    if (error.status === 401) {
      return {
        success: false,
        message: 'Authorization issue. Restart the bot with /start',
        fallbackToMenu: true,
      };
    }

    if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
      return {
        success: false,
        message: 'Request timeout. Try simplifying your request or try again later.',
        retry: true,
      };
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return {
        success: false,
        message: 'Connection issue. Try again in a few seconds.',
        retry: true,
      };
    }

    return {
      success: false,
      message: 'Could not process command. Use the menu or try rephrasing.',
      fallbackToMenu: true,
    };
  }
}
