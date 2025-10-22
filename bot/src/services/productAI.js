import deepseek from './deepseek.js';
import { productTools } from '../tools/productTools.js';
import { generateProductAIPrompt, sanitizeUserInput } from '../utils/systemPrompts.js';
import { productApi } from '../utils/api.js';
import { fuzzySearchProducts } from '../utils/fuzzyMatch.js';
import { autoTransliterateProductName, getTransliterationInfo } from '../utils/transliterate.js';
import logger from '../utils/logger.js';

/**
 * AI Product Management Service
 * Orchestrates AI calls and executes product operations
 */

// Conversation history constants
const MAX_HISTORY_MESSAGES = 20; // Keep last 20 messages (10 exchanges)
const CONVERSATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/**
 * Get conversation history from session
 * @param {Object} ctx - Telegraf context
 * @returns {Array} Conversation history messages
 */
function getConversationHistory(ctx) {
  if (!ctx || !ctx.session || !ctx.session.aiConversation) {
    return [];
  }

  const conversation = ctx.session.aiConversation;

  // Check if conversation expired (30 min timeout)
  if (conversation.lastActivity && Date.now() - conversation.lastActivity > CONVERSATION_TIMEOUT) {
    logger.info('conversation_expired', { userId: ctx.from?.id });
    delete ctx.session.aiConversation;
    return [];
  }

  return conversation.messages || [];
}

/**
 * Save messages to conversation history with sliding window
 * @param {Object} ctx - Telegraf context
 * @param {string} userMessage - User's message
 * @param {string} assistantMessage - AI's response
 */
function saveToConversationHistory(ctx, userMessage, assistantMessage) {
  if (!ctx || !ctx.session) {
    return;
  }

  // Initialize conversation if not exists
  if (!ctx.session.aiConversation) {
    ctx.session.aiConversation = {
      messages: [],
      lastActivity: Date.now(),
      messageCount: 0
    };
  }

  const conversation = ctx.session.aiConversation;

  // Add new messages
  conversation.messages.push(
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantMessage }
  );

  // Implement sliding window - keep only last N messages
  if (conversation.messages.length > MAX_HISTORY_MESSAGES) {
    conversation.messages = conversation.messages.slice(-MAX_HISTORY_MESSAGES);
  }

  // Update metadata
  conversation.lastActivity = Date.now();
  conversation.messageCount = (conversation.messageCount || 0) + 1;

  logger.debug('conversation_history_saved', {
    userId: ctx.from?.id,
    messageCount: conversation.messageCount,
    historyLength: conversation.messages.length
  });
}

/**
 * Process AI command for product management
 * 
 * @param {string} userCommand - User's natural language command
 * @param {Object} context - Context object with shopId, shopName, token, products
 * @returns {Object} Result object with success, message, data, needsClarification
 */
export async function processProductCommand(userCommand, context) {
  const { shopId, shopName, token, products = [], ctx } = context;

  // Validate context
  if (!shopId || !shopName || !token) {
    return {
      success: false,
      message: '❌ Ошибка: отсутствует информация о магазине'
    };
  }

  // Check if DeepSeek is available
  if (!deepseek.isAvailable()) {
    return {
      success: false,
      message: '❌ AI недоступен. Используйте обычное меню.',
      fallbackToMenu: true
    };
  }

  // Sanitize user input
  const sanitizedCommand = sanitizeUserInput(userCommand);
  if (!sanitizedCommand) {
    return {
      success: false,
      message: '❌ Пустая команда'
    };
  }

  try {
    // Generate system prompt
    const systemPrompt = generateProductAIPrompt(shopName, products);

    // Get conversation history for context
    const conversationHistory = getConversationHistory(ctx);

    logger.debug('ai_processing_with_history', {
      shopId,
      historyLength: conversationHistory.length,
      command: sanitizedCommand.slice(0, 50)
    });

    // Call DeepSeek API with conversation history
    const response = await deepseek.chat(
      systemPrompt,
      sanitizedCommand,
      productTools,
      conversationHistory
    );

    // Calculate cost
    const cost = deepseek.calculateCost(
      response.usage?.prompt_tokens || 0,
      response.usage?.completion_tokens || 0,
      (response.usage?.prompt_cache_hit_tokens || 0) > 0
    );

    logger.info('ai_product_command_processed', {
      shopId,
      command: sanitizedCommand,
      tokensUsed: response.usage?.total_tokens,
      cost: cost.toFixed(6),
      cacheHit: (response.usage?.prompt_cache_hit_tokens || 0) > 0
    });

    const choice = response.choices[0];

    // Check if AI wants to use a tool
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      const toolCall = choice.message.tool_calls[0]; // Take first tool call
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      logger.info('ai_tool_call', {
        shopId,
        function: functionName,
        arguments: args
      });

      // Execute the appropriate function
      const result = await executeToolCall(functionName, args, { shopId, token, products, ctx });

      // Save conversation history (user command + function result)
      if (ctx && result.message) {
        saveToConversationHistory(ctx, sanitizedCommand, result.message);
      }

      return result;
    }

    // No tool call - AI responded with text
    const aiMessage = choice.message.content;

    // Save conversation history (user command + AI text response)
    if (ctx && aiMessage) {
      saveToConversationHistory(ctx, sanitizedCommand, aiMessage);
    }

    return {
      success: true,
      message: aiMessage || '✅ Команда обработана',
      data: null
    };

  } catch (error) {
    logger.error('AI product command error:', {
      error: error.message,
      shopId,
      command: sanitizedCommand
    });

    // Handle specific errors
    if (error.status === 503) {
      return {
        success: false,
        message: '⏳ AI перегружен. Попробуйте через минуту.',
        retry: true
      };
    }

    if (error.status === 401) {
      return {
        success: false,
        message: '❌ Ошибка авторизации AI. Проверьте конфигурацию.',
        fallbackToMenu: true
      };
    }

    return {
      success: false,
      message: '❌ Ошибка AI. Используйте обычное меню.',
      fallbackToMenu: true
    };
  }
}

/**
 * Execute tool call from AI
 * 
 * @param {string} functionName - Function to execute
 * @param {Object} args - Function arguments
 * @param {Object} context - Context with shopId, token, products
 * @returns {Object} Result object
 */
async function executeToolCall(functionName, args, context) {
  const { shopId, token, products, ctx } = context;

  try {
    switch (functionName) {
      case 'addProduct':
        return await handleAddProduct(args, shopId, token);

      case 'deleteProduct':
        return await handleDeleteProduct(args, shopId, token, products);

      case 'listProducts':
        return await handleListProducts(products);

      case 'searchProduct':
        return await handleSearchProduct(args, products);

      case 'updateProduct':
        return await handleUpdateProduct(args, shopId, token, products);

      case 'bulkDeleteAll':
        return await handleBulkDeleteAll(shopId, token, ctx);

      case 'bulkDeleteByNames':
        return await handleBulkDeleteByNames(args, shopId, token, products);

      case 'recordSale':
        return await handleRecordSale(args, shopId, token, products);

      case 'getProductInfo':
        return await handleGetProductInfo(args, products);

      case 'bulkUpdatePrices':
        return await handleBulkUpdatePrices(args, shopId, token, products, ctx);

      default:
        return {
          success: false,
          message: `❌ Неизвестная операция: ${functionName}`
        };
    }
  } catch (error) {
    logger.error(`Tool execution error (${functionName}):`, error);
    return {
      success: false,
      message: `❌ Ошибка выполнения: ${error.message}`
    };
  }
}

/**
 * Add product handler
 */
async function handleAddProduct(args, shopId, token) {
  const { name, price, stock = 0 } = args;

  // Validate
  if (!name || name.length < 3) {
    return {
      success: false,
      message: '❌ Название должно быть минимум 3 символа'
    };
  }

  if (!price || price <= 0) {
    return {
      success: false,
      message: '❌ Цена должна быть больше 0'
    };
  }

  // Auto-transliterate Russian names to English
  const transliteratedName = autoTransliterateProductName(name);
  const translitInfo = getTransliterationInfo(name, transliteratedName);

  // Log transliteration if occurred
  if (translitInfo.changed) {
    logger.info('product_name_transliterated', {
      original: name,
      transliterated: transliteratedName,
      shopId
    });
  }

  try {
    const product = await productApi.createProduct({
      name: transliteratedName,  // Use transliterated name
      price,
      currency: 'USD',
      shopId,
      stockQuantity: stock
    }, token);

    // Show original name in message if transliterated
    const displayName = translitInfo.changed 
      ? `${transliteratedName} (${name})`
      : transliteratedName;

    return {
      success: true,
      message: `✅ Добавлен: ${displayName} — ${price}${stock > 0 ? ` (сток: ${stock})` : ''}`,
      data: product,
      operation: 'add',
      transliterated: translitInfo.changed
    };
  } catch (error) {
    logger.error('Add product via AI failed:', error);
    return {
      success: false,
      message: '❌ Не удалось добавить товар'
    };
  }
}

/**
 * Delete product handler
 */
async function handleDeleteProduct(args, shopId, token, products) {
  const { productName } = args;

  if (!productName) {
    return {
      success: false,
      message: '❌ Укажите название товара'
    };
  }

  // Use fuzzy search for better matching
  const fuzzyMatches = fuzzySearchProducts(productName, products, 0.6);
  const matches = fuzzyMatches.map(m => m.product);

  if (matches.length === 0) {
    return {
      success: false,
      message: `❌ Товар "${productName}" не найден`
    };
  }

  if (matches.length > 1) {
    // Multiple matches - need clarification
    return {
      success: false,
      needsClarification: true,
      message: `Найдено несколько товаров с "${productName}":`,
      options: matches.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price
      })),
      operation: 'delete'
    };
  }

  // Single match - delete it
  const product = matches[0];

  try {
    await productApi.deleteProduct(product.id, token);

    return {
      success: true,
      message: `✅ Удалён: ${product.name} ($${product.price})`,
      data: product,
      operation: 'delete'
    };
  } catch (error) {
    logger.error('Delete product via AI failed:', error);
    return {
      success: false,
      message: '❌ Не удалось удалить товар'
    };
  }
}

/**
 * List products handler
 */
async function handleListProducts(products) {
  if (products.length === 0) {
    return {
      success: true,
      message: '📦 Товаров пока нет',
      data: [],
      operation: 'list'
    };
  }

  const list = products
    .map((p, i) => `${i + 1}. ${p.name} — $${p.price} (сток: ${p.stock_quantity || 0})`)
    .join('\n');

  return {
    success: true,
    message: `📦 Товары (${products.length}):\n\n${list}`,
    data: products,
    operation: 'list'
  };
}

/**
 * Search product handler
 */
async function handleSearchProduct(args, products) {
  const { query } = args;

  if (!query) {
    return {
      success: false,
      message: '❌ Укажите поисковый запрос'
    };
  }

  // Search (case-insensitive, partial match)
  const matches = products.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  if (matches.length === 0) {
    return {
      success: false,
      message: `❌ Товары с "${query}" не найдены`
    };
  }

  const list = matches
    .map((p, i) => `${i + 1}. ${p.name} — ${p.price} (сток: ${p.stock_quantity || 0})`)
    .join('\n');

  return {
    success: true,
    message: `🔍 Найдено (${matches.length}):\n\n${list}`,
    data: matches,
    operation: 'search'
  };
}

/**
 * Update product handler
 */
async function handleUpdateProduct(args, shopId, token, products) {
  const { productName, updates } = args;

  if (!productName) {
    return {
      success: false,
      message: '❌ Укажите название товара'
    };
  }

  if (!updates || typeof updates !== 'object') {
    return {
      success: false,
      message: '❌ Укажите что нужно обновить (цену, название или количество)'
    };
  }

  // Check if at least one update field is provided
  const { name: newName, price: newPrice, stock_quantity: newStock } = updates;
  if (!newName && newPrice === undefined && newStock === undefined) {
    return {
      success: false,
      message: '❌ Укажите что нужно обновить (цену, название или количество)'
    };
  }

  // Use fuzzy search for better matching
  const fuzzyMatches = fuzzySearchProducts(productName, products, 0.6);
  const matches = fuzzyMatches.map(m => m.product);

  if (matches.length === 0) {
    return {
      success: false,
      message: `❌ Товар "${productName}" не найден`
    };
  }

  if (matches.length > 1) {
    return {
      success: false,
      needsClarification: true,
      message: `Найдено несколько товаров с "${productName}":`,
      options: matches.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price
      })),
      operation: 'update'
    };
  }

  const product = matches[0];

  // Build update payload
  const updateData = {};
  if (newName) updateData.name = newName;
  if (newPrice !== undefined && newPrice > 0) updateData.price = newPrice;
  if (newStock !== undefined && newStock >= 0) updateData.stockQuantity = newStock;

  try {
    const updated = await productApi.updateProduct(product.id, updateData, token);

    // Build change description
    const changes = [];
    if (newName) changes.push(`название: "${newName}"`);
    if (newPrice !== undefined) changes.push(`цена: ${newPrice}`);
    if (newStock !== undefined) changes.push(`сток: ${newStock}`);

    return {
      success: true,
      message: `✅ Обновлён: ${product.name}\n${changes.join(', ')}`,
      data: updated,
      operation: 'update'
    };
  } catch (error) {
    logger.error('Update product via AI failed:', error);
    return {
      success: false,
      message: '❌ Не удалось обновить товар'
    };
  }
}

/**
 * Bulk delete all products handler
 */
async function handleBulkDeleteAll(shopId, token) {
  try {
    const result = await productApi.bulkDeleteAll(shopId, token);

    return {
      success: true,
      message: `✅ Удалено всех товаров: ${result.deletedCount}`,
      data: result,
      operation: 'bulk_delete_all'
    };
  } catch (error) {
    logger.error('Bulk delete all via AI failed:', error);
    return {
      success: false,
      message: '❌ Не удалось удалить товары'
    };
  }
}

/**
 * Bulk delete by names handler
 */
async function handleBulkDeleteByNames(args, shopId, token, products) {
  const { productNames } = args;

  if (!productNames || !Array.isArray(productNames) || productNames.length === 0) {
    return {
      success: false,
      message: '❌ Укажите названия товаров'
    };
  }

  // Find matching product IDs
  const productIds = [];
  const notFound = [];

  for (const name of productNames) {
    const match = products.find(p =>
      p.name.toLowerCase().includes(name.toLowerCase())
    );

    if (match) {
      productIds.push(match.id);
    } else {
      notFound.push(name);
    }
  }

  if (productIds.length === 0) {
    return {
      success: false,
      message: `❌ Ни один товар не найден: ${productNames.join(', ')}`
    };
  }

  try {
    const result = await productApi.bulkDeleteByIds(shopId, productIds, token);

    let message = `✅ Удалено товаров: ${result.deletedCount}`;
    if (notFound.length > 0) {
      message += `\n⚠️ Не найдены: ${notFound.join(', ')}`;
    }

    return {
      success: true,
      message,
      data: result,
      operation: 'bulk_delete'
    };
  } catch (error) {
    logger.error('Bulk delete by names via AI failed:', error);
    return {
      success: false,
      message: '❌ Не удалось удалить товары'
    };
  }
}

/**
 * Record sale handler (decrease stock)
 */
async function handleRecordSale(args, shopId, token, products) {
  const { productName, quantity = 1 } = args; // Default quantity to 1 if not specified

  if (!productName) {
    return {
      success: false,
      message: '❌ Укажите название товара'
    };
  }

  if (quantity <= 0) {
    return {
      success: false,
      message: '❌ Количество должно быть больше 0'
    };
  }

  // Use fuzzy search for better matching
  const fuzzyMatches = fuzzySearchProducts(productName, products, 0.6);
  const matches = fuzzyMatches.map(m => m.product);

  if (matches.length === 0) {
    return {
      success: false,
      message: `❌ Товар "${productName}" не найден`
    };
  }

  if (matches.length > 1) {
    return {
      success: false,
      needsClarification: true,
      message: `Найдено несколько товаров с "${productName}":`,
      options: matches.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price
      })),
      operation: 'record_sale'
    };
  }

  const product = matches[0];
  const currentStock = product.stock_quantity || 0;
  
  // Check if enough stock
  if (currentStock < quantity) {
    return {
      success: false,
      message: `❌ Недостаточно товара на складе\nЗапрошено: ${quantity} шт.\nДоступно: ${currentStock} шт.`
    };
  }

  const newStock = currentStock - quantity;

  try {
    const updated = await productApi.updateProduct(product.id, {
      stockQuantity: newStock
    }, token);

    return {
      success: true,
      message: `✅ Продажа записана: ${product.name}\nПродано: ${quantity} шт.\nОсталось: ${newStock} шт.`,
      data: updated,
      operation: 'record_sale'
    };
  } catch (error) {
    logger.error('Record sale via AI failed:', error);
    return {
      success: false,
      message: '❌ Не удалось записать продажу'
    };
  }
}

/**
 * Get product info handler
 */
async function handleGetProductInfo(args, products) {
  const { productName } = args;

  if (!productName) {
    return {
      success: false,
      message: '❌ Укажите название товара'
    };
  }

  // Search for product
  const matches = products.filter(p =>
    p.name.toLowerCase().includes(productName.toLowerCase())
  );

  if (matches.length === 0) {
    return {
      success: false,
      message: `❌ Товар "${productName}" не найден`
    };
  }

  if (matches.length > 1) {
    return {
      success: false,
      needsClarification: true,
      message: `Найдено несколько товаров с "${productName}":`,
      options: matches.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price
      })),
      operation: 'info'
    };
  }

  const product = matches[0];

  return {
    success: true,
    message: `📊 ${product.name}\nЦена: ${product.price}\nНа складе: ${product.stock_quantity || 0} шт.`,
    data: product,
    operation: 'info'
  };
}

/**
 * Bulk update prices handler (discount/increase all products)
 */
async function handleBulkUpdatePrices(args, shopId, token, products, ctx) {
  const { percentage, operation } = args;

  if (!percentage || percentage < 0.1 || percentage > 100) {
    return {
      success: false,
      message: '❌ Процент должен быть от 0.1 до 100'
    };
  }

  if (!operation || !['increase', 'decrease'].includes(operation)) {
    return {
      success: false,
      message: '❌ Операция должна быть "increase" или "decrease"'
    };
  }

  if (!products || products.length === 0) {
    return {
      success: false,
      message: '❌ Нет товаров для изменения цен'
    };
  }

  // Calculate multiplier
  const multiplier = operation === 'decrease' 
    ? (1 - percentage / 100)
    : (1 + percentage / 100);

  const operationText = operation === 'decrease' ? 'Скидка' : 'Повышение';
  const operationSymbol = operation === 'decrease' ? '-' : '+';

  // Build preview
  const previewUpdates = products.slice(0, 3).map(p => {
    const newPrice = Math.round(p.price * multiplier * 100) / 100;
    return `• ${p.name}: ${p.price} → ${newPrice}`;
  });
  const previewText = previewUpdates.join('\n');

  // Store pending operation in session for confirmation
  if (ctx && ctx.session) {
    ctx.session.pendingBulkUpdate = {
      percentage,
      operation,
      multiplier,
      operationText,
      operationSymbol,
      shopId,
      token,
      productCount: products.length,
      timestamp: Date.now()
    };
  }

  // Return confirmation prompt
  return {
    success: true,
    needsConfirmation: true,
    message: `⚠️ Применить ${operationText.toLowerCase()} ${operationSymbol}${percentage}% ко всем ${products.length} товарам?\n\nПримеры изменений:\n${previewText}${products.length > 3 ? '\n... и ещё ' + (products.length - 3) + ' товаров' : ''}`,
    keyboard: {
      inline_keyboard: [[
        { text: '✅ Применить', callback_data: 'bulk_prices_confirm' },
        { text: '❌ Отмена', callback_data: 'bulk_prices_cancel' }
      ]]
    },
    operation: 'bulk_update_prices'
  };
}

/**
 * Execute bulk price update after confirmation
 */
export async function executeBulkPriceUpdate(shopId, token, ctx) {
  const pending = ctx.session?.pendingBulkUpdate;
  
  if (!pending) {
    return {
      success: false,
      message: '❌ Операция устарела. Попробуйте снова.'
    };
  }

  const { percentage, operation, multiplier, operationText, operationSymbol } = pending;

  try {
    // Fetch current products
    const products = await productApi.getShopProducts(shopId);

    if (!products || products.length === 0) {
      return {
        success: false,
        message: '❌ Нет товаров для изменения цен'
      };
    }

    // Send initial progress message
    let progressMsg = null;
    if (ctx) {
      progressMsg = await ctx.reply(`⏳ Начинаю изменение цен...\nТоваров: ${products.length}`);
    }

    let successCount = 0;
    let failCount = 0;
    const updates = [];

    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      batches.push(products.slice(i, i + BATCH_SIZE));
    }

    // Process batches
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Update progress every batch
      if (ctx && progressMsg && batchIndex > 0) {
        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            null,
            `⏳ Обрабатываю цены...\nОбработано: ${batchIndex * BATCH_SIZE}/${products.length} товаров`
          );
        } catch (error) {
          // Ignore edit errors (message not modified)
        }
      }

      // Process batch in parallel
      const batchPromises = batch.map(async (product) => {
        try {
          const newPrice = Math.round(product.price * multiplier * 100) / 100;
          
          if (newPrice <= 0) {
            failCount++;
            return null;
          }

          const updated = await productApi.updateProduct(product.id, {
            price: newPrice
          }, token);

          return {
            name: product.name,
            oldPrice: product.price,
            newPrice: newPrice
          };
        } catch (error) {
          logger.error(`Failed to update product ${product.id}:`, error);
          failCount++;
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(result => {
        if (result) {
          updates.push(result);
          successCount++;
        }
      });
    }

    // Clear pending operation
    delete ctx.session.pendingBulkUpdate;

    if (successCount === 0) {
      // Update progress message with error
      if (ctx && progressMsg) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          progressMsg.message_id,
          null,
          '❌ Не удалось обновить ни одного товара'
        );
      }
      return {
        success: false,
        message: '❌ Не удалось обновить ни одного товара'
      };
    }

    // Build success message
    let message = `✅ ${operationText} ${operationSymbol}${percentage}% применена\n`;
    message += `Обновлено товаров: ${successCount}/${products.length}\n\n`;
    
    // Show first 5 updates as examples
    const exampleUpdates = updates.slice(0, 5);
    exampleUpdates.forEach(u => {
      const displayName = u.name.length > 40 ? u.name.slice(0, 37) + '...' : u.name;
      message += `• ${displayName}: ${u.oldPrice} → ${u.newPrice}\n`;
    });

    if (updates.length > 5) {
      message += `... и ещё ${updates.length - 5} товаров`;
    }

    if (failCount > 0) {
      message += `\n\n⚠️ Не удалось обновить: ${failCount} товаров`;
    }

    // Update progress message with final result
    if (ctx && progressMsg) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMsg.message_id,
        null,
        message
      );
    }

    return {
      success: true,
      message,
      data: {
        updatedCount: successCount,
        failedCount: failCount,
        percentage,
        operation,
        updates
      },
      operation: 'bulk_update_prices'
    };
  } catch (error) {
    logger.error('Bulk update prices execution failed:', error);
    
    // Clear pending operation
    delete ctx.session?.pendingBulkUpdate;
    
    return {
      success: false,
      message: '❌ Не удалось обновить цены'
    };
  }
}

export default {
  processProductCommand,
  executeBulkPriceUpdate
};
