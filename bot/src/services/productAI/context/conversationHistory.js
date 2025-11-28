/**
 * Conversation History Management for ProductAI
 * Handles sliding window conversation history for AI context
 */

import { MAX_HISTORY_MESSAGES, CONVERSATION_TIMEOUT } from '../constants.js';
import logger from '../../../utils/logger.js';

/**
 * Get conversation history from session
 * @param {Object} ctx - Telegraf context
 * @returns {Array} Conversation history messages
 */
export function getConversationHistory(ctx) {
  if (!ctx || !ctx.session || !ctx.session.aiConversation) {
    return [];
  }

  const conversation = ctx.session.aiConversation;

  // Check if conversation expired (30 min timeout)
  if (conversation.lastActivity && Date.now() - conversation.lastActivity > CONVERSATION_TIMEOUT) {
    logger.info('conversation_expired', { userId: ctx.from?.id });
    delete ctx.session.aiConversation;
    delete ctx.session.aiContext;
    return [];
  }

  return conversation.messages || [];
}

/**
 * Save messages to conversation history with automatic sliding window management
 *
 * Supports all OpenAI message formats:
 * - User messages: { role: 'user', content: string }
 * - Assistant text: { role: 'assistant', content: string }
 * - Assistant with function calls: { role: 'assistant', content: null, tool_calls: [...] }
 * - Tool results: { role: 'tool', tool_call_id: string, name: string, content: string }
 *
 * Features:
 * - Sliding window: automatically keeps only last MAX_HISTORY_MESSAGES
 * - Metadata tracking: updates lastActivity and messageCount
 * - Flexible input: accepts single message object or array of messages
 *
 * @param {Object} ctx - Telegraf context with session
 * @param {Object|Array<Object>} newMessages - Message(s) to add to history
 * @param {string} newMessages[].role - Message role: 'user' | 'assistant' | 'tool'
 * @param {string} [newMessages[].content] - Message content (optional for assistant with tool_calls)
 * @param {Array} [newMessages[].tool_calls] - Tool calls array (if assistant calling functions)
 * @param {string} [newMessages[].tool_call_id] - Tool call ID (if role is 'tool')
 * @param {string} [newMessages[].name] - Function name (if role is 'tool')
 *
 * @example
 * // Save simple text exchange
 * saveToConversationHistory(ctx, [
 *   { role: 'user', content: 'Hello' },
 *   { role: 'assistant', content: 'Hi there!' }
 * ]);
 *
 * @example
 * // Save function call exchange
 * saveToConversationHistory(ctx, [
 *   { role: 'user', content: 'Add iPhone' },
 *   { role: 'assistant', content: null, tool_calls: [...] },
 *   { role: 'tool', tool_call_id: 'call_123', name: 'addProduct', content: '{"success":true}' },
 *   { role: 'assistant', content: 'iPhone added!' }
 * ]);
 */
export function saveToConversationHistory(ctx, newMessages) {
  if (!ctx || !ctx.session) {
    return;
  }

  // Initialize conversation if not exists
  if (!ctx.session.aiConversation) {
    ctx.session.aiConversation = {
      messages: [],
      lastActivity: Date.now(),
      messageCount: 0,
    };
  }

  const conversation = ctx.session.aiConversation;

  // Add new messages (support array or single message)
  const messagesToAdd = Array.isArray(newMessages) ? newMessages : [newMessages];
  conversation.messages.push(...messagesToAdd);

  // Implement sliding window - keep only last N messages
  if (conversation.messages.length > MAX_HISTORY_MESSAGES) {
    conversation.messages = conversation.messages.slice(-MAX_HISTORY_MESSAGES);
  }

  // Update metadata
  conversation.lastActivity = Date.now();
  conversation.messageCount = (conversation.messageCount || 0) + messagesToAdd.length;

  logger.debug('conversation_history_saved', {
    userId: ctx.from?.id,
    messageCount: conversation.messageCount,
    historyLength: conversation.messages.length,
    newMessagesCount: messagesToAdd.length,
  });
}
