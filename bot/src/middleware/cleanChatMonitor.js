/**
 * Clean Chat Runtime Monitor Middleware
 *
 * Отслеживает количество сообщений в реальном времени и предупреждает
 * о нарушениях clean chat правил во время работы бота.
 *
 * Активируется только в режиме разработки (NODE_ENV=development)
 */

import logger from '../utils/logger.js';

// Message tracking
const chatMessageCount = new Map(); // chatId -> count
const chatHistory = new Map(); // chatId -> [{ type, id, timestamp }]

// Configuration
const CONFIG = {
  MAX_MESSAGES: 4, // Clean chat max
  WARNING_THRESHOLD: 3,
  HISTORY_TTL: 5 * 60 * 1000, // 5 minutes
  ENABLED: process.env.NODE_ENV === 'development'
};

/**
 * Clean up old messages from history
 */
function cleanupOldMessages() {
  const now = Date.now();

  for (const [chatId, history] of chatHistory.entries()) {
    const filtered = history.filter(msg => {
      return now - msg.timestamp < CONFIG.HISTORY_TTL;
    });

    if (filtered.length === 0) {
      chatHistory.delete(chatId);
      chatMessageCount.delete(chatId);
    } else {
      chatHistory.set(chatId, filtered);
      chatMessageCount.set(chatId, filtered.length);
    }
  }
}

// Cleanup interval
if (CONFIG.ENABLED) {
  setInterval(cleanupOldMessages, 60000); // Every minute
}

/**
 * Track message
 */
function trackMessage(chatId, type, messageId) {
  if (!chatHistory.has(chatId)) {
    chatHistory.set(chatId, []);
  }

  const history = chatHistory.get(chatId);
  history.push({
    type,
    id: messageId,
    timestamp: Date.now()
  });

  const count = history.length;
  chatMessageCount.set(chatId, count);

  return count;
}

/**
 * Remove message from tracking
 */
function untrackMessage(chatId, messageId) {
  const history = chatHistory.get(chatId) || [];
  const filtered = history.filter(msg => msg.id !== messageId);

  chatHistory.set(chatId, filtered);
  chatMessageCount.set(chatId, filtered.length);

  return filtered.length;
}

/**
 * Get current message count
 */
function getMessageCount(chatId) {
  return chatMessageCount.get(chatId) || 0;
}

/**
 * Get chat history
 */
function getChatHistory(chatId) {
  return chatHistory.get(chatId) || [];
}

/**
 * Alert about violation
 */
function alertViolation(chatId, count, context) {
  const history = getChatHistory(chatId);
  const messageTypes = history.map(m => m.type).join(', ');

  logger.warn('⚠️  CLEAN CHAT VIOLATION DETECTED', {
    chatId,
    messageCount: count,
    threshold: CONFIG.MAX_MESSAGES,
    messages: messageTypes,
    context: context || 'unknown',
    timestamp: new Date().toISOString()
  });

  // В development показываем историю
  if (CONFIG.ENABLED) {
    console.warn(`\n🚨 CLEAN CHAT VIOLATION 🚨`);
    console.warn(`Chat ID: ${chatId}`);
    console.warn(`Message count: ${count}/${CONFIG.MAX_MESSAGES}`);
    console.warn(`Messages: ${messageTypes}`);
    console.warn(`Context: ${context || 'unknown'}`);
    console.warn(`History:`);
    history.forEach((msg, i) => {
      console.warn(`  ${i + 1}. [${msg.type}] ID: ${msg.id}`);
    });
    console.warn('');
  }
}

/**
 * Clean Chat Monitor Middleware
 */
export function cleanChatMonitor() {
  if (!CONFIG.ENABLED) {
    return async (ctx, next) => next();
  }

  return async (ctx, next) => {
    const chatId = ctx.chat?.id;

    if (!chatId) {
      return next();
    }

    // Track incoming user message
    if (ctx.message) {
      const messageId = ctx.message.message_id;
      const count = trackMessage(chatId, 'user_message', messageId);

      if (count >= CONFIG.WARNING_THRESHOLD) {
        logger.warn(`Clean chat warning: ${count} messages in chat ${chatId}`);
      }
    }

    // Intercept ctx.reply to track bot messages
    const originalReply = ctx.reply.bind(ctx);
    ctx.reply = async (...args) => {
      const result = await originalReply(...args);

      if (result && result.message_id) {
        const count = trackMessage(chatId, 'bot_reply', result.message_id);

        if (count > CONFIG.MAX_MESSAGES) {
          alertViolation(chatId, count, 'ctx.reply');
        }
      }

      return result;
    };

    // Intercept ctx.replyWithHTML
    const originalReplyWithHTML = ctx.replyWithHTML?.bind(ctx);
    if (originalReplyWithHTML) {
      ctx.replyWithHTML = async (...args) => {
        const result = await originalReplyWithHTML(...args);

        if (result && result.message_id) {
          const count = trackMessage(chatId, 'bot_html', result.message_id);

          if (count > CONFIG.MAX_MESSAGES) {
            alertViolation(chatId, count, 'ctx.replyWithHTML');
          }
        }

        return result;
      };
    }

    // Intercept ctx.deleteMessage to untrack
    const originalDeleteMessage = ctx.deleteMessage.bind(ctx);
    ctx.deleteMessage = async (messageId) => {
      const result = await originalDeleteMessage(messageId);
      untrackMessage(chatId, messageId);
      return result;
    };

    // Intercept telegram.deleteMessage
    const originalTelegramDelete = ctx.telegram.deleteMessage.bind(ctx.telegram);
    ctx.telegram.deleteMessage = async (targetChatId, messageId) => {
      const result = await originalTelegramDelete(targetChatId, messageId);
      untrackMessage(targetChatId || chatId, messageId);
      return result;
    };

    // Continue middleware chain
    await next();

    // Check final count after handler
    const finalCount = getMessageCount(chatId);
    if (finalCount > CONFIG.MAX_MESSAGES) {
      alertViolation(chatId, finalCount, 'after_handler');
    }
  };
}

/**
 * Get monitoring stats (for debugging)
 */
export function getMonitoringStats() {
  const stats = {
    enabled: CONFIG.ENABLED,
    trackedChats: chatMessageCount.size,
    totalMessages: 0,
    violations: 0
  };

  for (const count of chatMessageCount.values()) {
    stats.totalMessages += count;
    if (count > CONFIG.MAX_MESSAGES) {
      stats.violations++;
    }
  }

  return stats;
}

/**
 * Reset monitoring (for testing)
 */
export function resetMonitoring() {
  chatMessageCount.clear();
  chatHistory.clear();
}

export default cleanChatMonitor;
