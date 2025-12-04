import { Markup } from 'telegraf';
import {
  processProductCommand,
  saveToConversationHistory,
  noteProductContext,
} from '../../services/productAI.js';
import { productApi, shopApi, orderApi } from '../../utils/api.js';
import { sellerMenu } from '../../keyboards/seller.js';
import { isNoiseCommand } from '../../utils/fuzzyMatch.js';
import logger from '../../utils/logger.js';
import { reply as cleanReply } from '../../utils/cleanReply.js';
import * as smartMessage from '../../utils/smartMessage.js';

/**
 * AI Product Management Handler
 * Handles text messages from sellers for AI-powered product management
 */

/**
 * Handle AI product command
 * Called when seller (with shop) sends a text message
 */
export async function handleAIProductCommand(ctx) {
  let userMessage;

  try {
    // FIX BUG #3: Check role FIRST - buyer has NO AI access
    // Buyers don't have access to AI commands
    if (ctx.session.role === 'buyer') {
      return; // Exit handler completely, no processing
    }

    // Check if in a scene
    if (ctx.scene.current) {
      return; // In a scene, let scene handle it
    }

    const isWorker = ctx.session.role === 'worker';
    const shopId = ctx.session.shopId || ctx.session.workspaceShopId;
    const shopName =
      ctx.session.shopName ||
      ctx.session.workspaceShop?.name ||
      ctx.t('general.shopFallbackName');

    // Only process if user is seller/worker with a shop
    if ((!isWorker && ctx.session.role !== 'seller') || !shopId) {
      return; // Ignore, not for AI
    }

    // Get user message
    userMessage = ctx.message?.text;
    if (!userMessage || !userMessage.trim()) {
      return;
    }

    // Handle pending clarification flows
    if (ctx.session.pendingAI) {
      const operationAge = Date.now() - ctx.session.pendingAI.timestamp;
      const TIMEOUT = 5 * 60 * 1000; // 5 minutes

      if (operationAge > TIMEOUT) {
        logger.info('Auto-cancelling expired pendingAI operation', {
          userId: ctx.from?.id,
          operation: ctx.session.pendingAI.operation,
          age: operationAge,
        });

        delete ctx.session.pendingAI;

        await smartMessage.send(ctx, {
          text: ctx.t('ai.operationExpiredCancelled'),
          parseMode: 'HTML',
        });
      } else {
        await smartMessage.send(ctx, {
          text: ctx.t('ai.pendingOperation'),
          keyboard: Markup.inlineKeyboard([
            [Markup.button.callback(ctx.t('ai.cancelAndRestart'), 'ai_cancel')],
            [Markup.button.callback(ctx.t('ai.backToSelection'), 'ai_back_to_selection')],
          ]),
        });
        return;
      }
    }

    // Filter noise commands (greetings, thanks, etc.)
    if (isNoiseCommand(userMessage)) {
      // Ignore silently - don't waste tokens on greetings or thanks
      logger.debug('ai_noise_filtered', {
        userId: ctx.from.id,
        message: userMessage.slice(0, 50),
      });
      return;
    }

    // Race condition guard - prevent concurrent AI calls
    if (ctx.session.aiProcessing) {
      logger.debug('ai_concurrent_blocked', {
        userId: ctx.from.id,
        message: userMessage.slice(0, 50),
      });
      await smartMessage.send(ctx, { text: ctx.t('aiProducts.processing') });
      return;
    }

    // Mark as processing
    ctx.session.aiProcessing = true;

    // Rate limiting - max 10 AI commands per minute
    if (!ctx.session.aiCommands) {
      ctx.session.aiCommands = [];
    }

    // Clean old timestamps (older than 1 minute)
    ctx.session.aiCommands = ctx.session.aiCommands.filter(
      (timestamp) => Date.now() - timestamp < 60000
    );

    // Check rate limit
    if (ctx.session.aiCommands.length >= 10) {
      await smartMessage.send(ctx, { text: ctx.t('aiProducts.rateLimitReached') });
      return;
    }

    // Add current timestamp
    ctx.session.aiCommands.push(Date.now());

    // Show typing indicator
    await ctx.sendChatAction('typing');

    // Fetch current products
    const products =
      (await shopApi
        .getShopProductsSecure(shopId, ctx.session.token)
        .catch(() => productApi.getShopProducts(shopId))) || [];

    // Handle random product selection requests without calling AI
    if (shouldSelectRandomProduct(userMessage)) {
      await handleRandomProductSelection(ctx, userMessage, products);
      return;
    }

    const ordersForContext =
      (await orderApi
        .getShopOrders(shopId, ctx.session.token, { limit: 20 })
        .catch(() => [])) || [];

    // Process AI command
    const result = await processProductCommand(userMessage, {
      shopId,
      shopName,
      token: ctx.session.token,
      products,
      orders: ordersForContext,
      ctx, // Pass ctx for progress updates and confirmation prompts
      isWorker, // Pass worker flag for AI prompt customization
    });

    // Handle result
    if (result.needsConfirmation) {
      // Bulk operation needs confirmation
      await smartMessage.send(ctx, {
        text: result.message,
        keyboard: result.keyboard,
      });
      return;
    }

    if (result.needsClarification) {
      // Multiple matches - show options as buttons
      await handleClarification(ctx, result);
      return;
    }

    if (result.fallbackToMenu) {
      // AI unavailable - show menu
      await smartMessage.send(ctx, {
        text: result.message,
        keyboard: sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, ctx.lang),
      });
      return;
    }

    if (result.retry) {
      // Temporary error - can retry
      await smartMessage.send(ctx, { text: result.message });
      return;
    }

    // ONLY send message for tool call results (they weren't sent via streaming)
    // Text responses were already sent via streaming in processProductCommand
    // ALSO send error messages that weren't sent (missing operation field)
    if (result.operation || (!result.success && result.message)) {
      // Tool call result OR error - send it
      await cleanReply(ctx, result.message);
    }
    // If no operation field and success=true, it's a text response already sent via streaming

    // Log analytics
    logger.info('ai_command_result', {
      userId: ctx.from.id,
      shopId,
      success: result.success,
      operation: result.operation || 'text_response',
      hadToolCalls: !!result.operation,
      hadPendingOperation: !!ctx.session.pendingAI,
      messagePreview: userMessage.slice(0, 100),
      needsConfirmation: result.needsConfirmation || false,
      needsClarification: result.needsClarification || false,
    });
  } catch (error) {
    logger.error('AI product command handler error:', {
      error: error.message,
      stack: error.stack,
      userId: ctx.from?.id,
      shopId: ctx.session?.shopId || ctx.session?.workspaceShopId,
      command: userMessage?.substring(0, 100),
      timestamp: new Date().toISOString(),
    });

    // Determine error type and provide specific message
    let userErrorMessage = ctx.t('ai.errorOccurred');
    let suggestion = ctx.t('ai.trySuggestion');
    let retryButton = null;

    if (error.message?.includes('timeout')) {
      userErrorMessage = ctx.t('ai.timeoutError');
      suggestion = ctx.t('ai.timeoutSuggestion');
      retryButton = Markup.button.callback(ctx.t('ai.retry'), 'ai_retry');
    } else if (error.message?.includes('API') || error.status === 503) {
      userErrorMessage = ctx.t('ai.connectionError');
      suggestion = ctx.t('ai.connectionSuggestion');
      retryButton = Markup.button.callback(ctx.t('ai.retry'), 'ai_retry');
    } else if (error.message?.includes('rate limit') || error.status === 429) {
      userErrorMessage = ctx.t('ai.rateLimitError');
      suggestion = ctx.t('ai.rateLimitSuggestion');
    } else if (error.message?.includes('unauthorized') || error.status === 401) {
      userErrorMessage = ctx.t('ai.authError');
      suggestion = ctx.t('ai.authSuggestion');
    }

    // Graceful error handling
    try {
      const keyboard = retryButton
        ? Markup.inlineKeyboard([
            [retryButton],
            [Markup.button.callback(ctx.t('ai.toMenu'), 'seller:menu')],
          ])
        : sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, ctx.lang);

      await smartMessage.send(ctx, {
        text: `${userErrorMessage}\n\n${suggestion}`,
        keyboard,
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  } finally {
    // Always clear processing flag
    if (ctx.session) {
      ctx.session.aiProcessing = false;
    }
  }
}

/**
 * Handle clarification request (multiple matches)
 */
async function handleClarification(ctx, result) {
  const { message, options, operation } = result;

  // Store pending operation in session
  ctx.session.pendingAI = {
    operation,
    options,
    originalCommand: ctx.message?.text, // Save original user command for re-processing
    timestamp: Date.now(),
  };

  // Create inline keyboard with options
  const keyboard = {
    inline_keyboard: [
      ...options.map((opt) => [
        {
          text: `${opt.name} ($${opt.price})`,
          callback_data: `ai_select:${opt.id}`,
        },
      ]),
      [
        {
          text: ctx.t('ai.backButton'),
          callback_data: 'ai_cancel',
        },
      ],
    ],
  };

  await cleanReply(ctx, message, {
    reply_markup: keyboard,
  });
}

/**
 * Handle product selection from clarification
 */
export async function handleAISelection(ctx) {
  try {
    await ctx.answerCbQuery();

    const productId = parseInt(ctx.match[1]);
    const shopId = ctx.session.shopId || ctx.session.workspaceShopId;
    const shopName =
      ctx.session.shopName ||
      ctx.session.workspaceShop?.name ||
      ctx.t('general.shopFallbackName');

    // Check if pending operation exists
    if (!ctx.session.pendingAI) {
      await ctx.editMessageText(
        ctx.t('ai.operationExpired'),
        Markup.inlineKeyboard([[Markup.button.callback(ctx.t('ai.toMenu'), 'seller:menu')]])
      );
      return;
    }

    const { operation, options, originalCommand } = ctx.session.pendingAI;

    // Find selected product
    const selectedProduct = options.find((p) => p.id === productId);
    if (!selectedProduct) {
      await ctx.editMessageText(
        ctx.t('ai.productNotFound'),
        Markup.inlineKeyboard([[Markup.button.callback(ctx.t('ai.toMenu'), 'seller:menu')]])
      );
      delete ctx.session.pendingAI;
      return;
    }

    // Clear pending operation BEFORE re-processing to avoid loops
    delete ctx.session.pendingAI;

    // Show processing message
    await ctx.editMessageText(ctx.t('ai.processing'));

    // Fetch current products for context
    const products =
      (await shopApi
        .getShopProductsSecure(shopId, ctx.session.token)
        .catch(() => productApi.getShopProducts(shopId))) || [];

    // Re-process original command with clarified product ID
    const result = await processProductCommand(originalCommand || ctx.t('ai.executeOperation'), {
      shopId,
      shopName,
      token: ctx.session.token,
      products,
      ctx,
      clarifiedProductId: productId, // Pass selected product ID
      clarifiedProductName: selectedProduct.name, // Pass selected product name for logging
    });

    // Handle result - delete processing message first
    try {
      await ctx.deleteMessage();
    } catch {
      // Ignore errors - message might be already gone
    }

    // If AI already sent the response via streaming, don't send duplicate
    if (!result.message || result.streamingMessageId) {
      return;
    }

    // Send result message (only if not sent via streaming)
    if (result.needsConfirmation) {
      await smartMessage.send(ctx, {
        text: result.message,
        keyboard: result.keyboard,
      });
    } else if (result.fallbackToMenu) {
      await smartMessage.send(ctx, {
        text: result.message,
        keyboard: sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, ctx.lang),
      });
    } else {
      await cleanReply(ctx, result.message);
    }

  logger.info('ai_clarification_resolved', {
    userId: ctx.from.id,
    shopId,
    operation,
      productId,
      productName: selectedProduct.name,
      success: result.success,
    });
  } catch (error) {
    logger.error('AI selection handler error:', error);
    try {
      await ctx.editMessageText(
        ctx.t('ai.processingError'),
        Markup.inlineKeyboard([[Markup.button.callback(ctx.t('ai.toMenu'), 'seller:menu')]])
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
}

/**
 * Handle cancel clarification
 */
export async function handleAICancel(ctx) {
  try {
    await ctx.answerCbQuery();

    // Clear pending operation
    delete ctx.session.pendingAI;

    // Delete message and show menu
    try {
      await ctx.deleteMessage();
    } catch {
      // Ignore - message might be already deleted
    }

    await smartMessage.send(ctx, {
      text: ctx.t('ai.operationCancelled'),
      keyboard: sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, ctx.lang),
    });

    logger.info('ai_operation_cancelled', {
      userId: ctx.from.id,
      shopId: ctx.session?.shopId,
    });
  } catch (error) {
    logger.error('AI cancel handler error:', error);
  }
}

/**
 * Handle retry button (after error)
 */
export async function handleAIRetry(ctx) {
  try {
    await ctx.answerCbQuery();

    // Delete error message
    try {
      await ctx.deleteMessage();
    } catch {
      // Ignore
    }

    await smartMessage.send(ctx, {
      text: ctx.t('ai.sendCommandAgain'),
      parseMode: 'HTML',
    });

    logger.info('ai_retry_requested', {
      userId: ctx.from.id,
      shopId: ctx.session?.shopId,
    });
  } catch (error) {
    logger.error('AI retry handler error:', error);
  }
}

/**
 * Handle back to selection button
 */
export async function handleAIBackToSelection(ctx) {
  try {
    await ctx.answerCbQuery();

    const pending = ctx.session.pendingAI;
    if (!pending || !pending.options) {
      await ctx.editMessageText(
        ctx.t('ai.operationExpired'),
        Markup.inlineKeyboard([[Markup.button.callback(ctx.t('ai.toMenu'), 'seller:menu')]])
      );
      delete ctx.session.pendingAI;
      return;
    }

    // Recreate selection keyboard
    const keyboard = {
      inline_keyboard: [
        ...pending.options.map((opt) => [
          {
            text: `${opt.name} ($${opt.price})`,
            callback_data: `ai_select:${opt.id}`,
          },
        ]),
        [
          {
            text: ctx.t('ai.backButton'),
            callback_data: 'ai_cancel',
          },
        ],
      ],
    };

    await ctx.editMessageReplyMarkup(keyboard);

    logger.info('ai_back_to_selection', {
      userId: ctx.from.id,
      shopId: ctx.session?.shopId,
      optionsCount: pending.options.length,
    });
  } catch (error) {
    logger.error('AI back to selection handler error:', error);
  }
}

const RANDOM_SELECTION_PATTERNS = [
  /\b\u0432\u044b\u0431\u0435\u0440\u0438\s+\u043b\u044e\u0431\w+/iu,
  /\b\u0432\u044b\u0431\u0435\u0440\u0438\s+(?:\u0440\u0430\u043d\u0434\u043e\u043c\w*|\u0441\u043b\u0443\u0447\u0430\u0439\u043d\w*)/iu,
  /\b\u0440\u0430\u043d\u0434\u043e\u043c\u043d\w*\s+\u0442\u043e\u0432\u0430\u0440/iu,
  /\b\u043b\u044e\u0431\u043e\u0439\s+\u0442\u043e\u0432\u0430\u0440/iu,
  /\bchoose\s+(?:any|one)/i,
  /\bpick\s+(?:any|one|random)/i,
];

function shouldSelectRandomProduct(text) {
  if (!text) {
    return false;
  }

  const normalized = text.trim().toLowerCase();
  return RANDOM_SELECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function formatUsdPrice(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return `$${value % 1 === 0 ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '')}`;
}

async function handleRandomProductSelection(ctx, userMessage, products) {
  const shopId = ctx.session.shopId || ctx.session.workspaceShopId;

  if (!products || products.length === 0) {
    const replyText = ctx.t('ai.shopEmpty');
    await cleanReply(ctx, replyText);
    saveToConversationHistory(ctx, [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: replyText },
    ]);

    logger.info('ai_random_product_selection_empty', {
      userId: ctx.from.id,
      shopId,
    });
    return;
  }

  const randomIndex = Math.floor(Math.random() * products.length);
  const product = products[randomIndex];
  const numericPrice = Number(product.price);
  const priceText = formatUsdPrice(numericPrice);
  const stockRaw = product.stock_quantity ?? product.stockQuantity ?? null;
  const stockInfo = Number.isFinite(stockRaw)
    ? stockRaw > 0
      ? `, ${ctx.t('ai.inStock', { count: stockRaw })}`
      : `, ${ctx.t('ai.outOfStock')}`
    : '';

  const openers = [
    (name) => ctx.t('ai.randomOpener1', { name }),
    (name) => ctx.t('ai.randomOpener2', { name }),
    (name) => ctx.t('ai.randomOpener3', { name }),
  ];
  const opener = openers[Math.floor(Math.random() * openers.length)](product.name);
  const priceConnector = ctx.t('ai.priceConnector');
  const replyText = `${opener}${priceText ? ` ${priceConnector} ${priceText}` : ''}${stockInfo}. ${ctx.t('ai.whatToDo')}`;

  await cleanReply(ctx, replyText);
  saveToConversationHistory(ctx, [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: replyText },
  ]);

  noteProductContext(ctx, product, {
    action: 'random_selection',
    command: userMessage,
  });

  logger.info('ai_random_product_selected', {
    userId: ctx.from.id,
    shopId,
    productId: product.id,
    productName: product.name,
  });
}

/**
 * Handle bulk delete all confirmation button
 */
export async function handleBulkDeleteAllConfirm(ctx) {
  try {
    await ctx.answerCbQuery();

    // Delete confirmation message with buttons
    try {
      await ctx.deleteMessage();
    } catch {
      // Ignore if message already deleted
    }

    // Show processing message
    await smartMessage.send(ctx, {
      text: ctx.t('ai.deletingAll'),
    });

    // Execute deletion via API
    const shopId = ctx.session?.shopId || ctx.session?.workspaceShopId;
    const token = ctx.session?.token;

    if (!shopId || !token) {
      throw new Error('Missing shopId or token in session');
    }

    const result = await productApi.bulkDeleteAll(shopId, token);

    // Show success message
    await smartMessage.send(ctx, {
      text: `✅ ${ctx.t('ai.deletedCount', { count: result.deletedCount })}`,
      keyboard: sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, ctx.lang),
    });

  logger.info('bulk_delete_all_confirmed', {
    userId: ctx.from.id,
    shopId,
    deletedCount: result.deletedCount,
  });
  } catch (error) {
    logger.error('Bulk delete all confirmation error:', error);
    await smartMessage.send(ctx, {
      text: `❌ ${ctx.t('ai.deleteError')}\n\n${error.message || ctx.t('ai.tryLater')}`,
      keyboard: sellerMenu(0, { hasFollows: ctx.session?.hasFollows }, ctx.lang),
    });
  }
}

/**
 * Setup AI product handlers
 */
export function setupAIProductHandlers(bot) {
  // Text message handler (for AI commands)
  // User message deleted immediately after processing
  bot.on('text', handleAIProductCommand);

  // Clarification selection handlers
  bot.action(/^ai_select:(\d+)$/, handleAISelection);
  bot.action('ai_cancel', handleAICancel);
  bot.action('ai_retry', handleAIRetry);
  bot.action('ai_back_to_selection', handleAIBackToSelection);
  bot.action('confirm_bulk_delete_all', handleBulkDeleteAllConfirm);

  logger.info('AI product handlers registered');
}

export default {
  handleAIProductCommand,
  setupAIProductHandlers,
};
