import logger from '../utils/logger.js';
import { deepseekService } from './deepseekService.js';
import { productTools } from '../ai/productTools.js';
import { generateProductAIPrompt, sanitizeUserInput } from '../ai/systemPrompts.js';
import { productQueries, shopQueries } from '../database/queries/index.js';

function normalizeHistory(history = []) {
  if (!Array.isArray(history)) {
    return [];
  }
  return history
    .filter((item) => item && typeof item.role === 'string' && typeof item.content === 'string')
    .slice(-20);
}

function buildAssistantMessage(text, operations = []) {
  const parts = [];
  if (text && text.trim()) {
    parts.push(text.trim());
  }

  if (operations.length) {
    const summary = operations.map((op) => `• ${op}`).join('\n');
    parts.push(`\n${summary}`.trim());
  }

  return parts.join('\n\n').trim();
}

function findProductByName(products, name) {
  const target = name.toLowerCase();
  let match = products.find((p) => p.name?.toLowerCase() === target);
  if (match) {
    return match;
  }
  match = products.find((p) => p.name?.toLowerCase().includes(target));
  return match || null;
}

async function handleAddProduct(shopId, args = {}) {
  if (!args.name || typeof args.price !== 'number') {
    return { error: 'Нужно указать название и цену товара.' };
  }

  const product = await productQueries.create({
    shopId,
    name: args.name.trim(),
    description: args.description?.trim() || null,
    price: args.price,
    currency: 'USD',
    stockQuantity: Number.isFinite(args.stock) ? args.stock : 0,
  });

  return {
    operation: 'addProduct',
    summary: `Добавлен товар «${product.name}» — $${product.price}`,
    product,
  };
}

async function handleBulkAddProducts(shopId, args = {}) {
  const items = Array.isArray(args.products) ? args.products : [];
  if (!items.length) {
    return { error: 'Не удалось определить товары для добавления.' };
  }

  const results = [];
  for (const item of items) {
    if (!item?.name || typeof item?.price !== 'number') {
      results.push({ error: `Пропущены данные товара: ${JSON.stringify(item)}` });
      continue;
    }
    const product = await productQueries.create({
      shopId,
      name: item.name.trim(),
      description: item.description?.trim() || null,
      price: item.price,
      currency: 'USD',
      stockQuantity: Number.isFinite(item.stock) ? item.stock : 0,
    });
    results.push({
      operation: 'addProduct',
      summary: `Добавлен товар «${product.name}» — $${product.price}`,
      product,
    });
  }

  return {
    operation: 'bulkAddProducts',
    summary: results.map((r) => r.summary).join('\n'),
    products: results.map((r) => r.product).filter(Boolean),
  };
}

async function handleDeleteProduct(shopId, products, args = {}) {
  if (!args.productName) {
    return { error: 'Укажите название товара для удаления.' };
  }
  const match = findProductByName(products, args.productName);
  if (!match) {
    return { error: `Не найден товар «${args.productName}».` };
  }
  await productQueries.delete(match.id);
  return {
    operation: 'deleteProduct',
    summary: `Удалён товар «${match.name}».`,
  };
}

async function handleBulkDeleteByNames(shopId, products, args = {}) {
  const names = Array.isArray(args.productNames) ? args.productNames : [];
  if (!names.length) {
    return { error: 'Не удалось определить товары для удаления.' };
  }
  const removed = [];
  for (const name of names) {
    const match = findProductByName(products, name);
    if (match) {
      await productQueries.delete(match.id);
      removed.push(match.name);
    }
  }
  if (!removed.length) {
    return { error: 'Не найдено ни одного подходящего товара.' };
  }
  return {
    operation: 'bulkDeleteByNames',
    summary: `Удалены товары: ${removed.join(', ')}`,
  };
}

async function handleUpdateProduct(shopId, products, args = {}) {
  const { productName, updates = {} } = args;
  if (!productName) {
    return { error: 'Укажите название товара для обновления.' };
  }
  const match = findProductByName(products, productName);
  if (!match) {
    return { error: `Не найден товар «${productName}».` };
  }

  const payload = {};
  if (typeof updates.price === 'number') {
    payload.price = updates.price;
  }
  if (typeof updates.stock_quantity === 'number') {
    payload.stockQuantity = updates.stock_quantity;
  }
  if (updates.name && updates.name.trim().length >= 3) {
    payload.name = updates.name.trim();
  }

  if (!Object.keys(payload).length) {
    return { error: 'Не указаны изменения для товара.' };
  }

  const updated = await productQueries.update(match.id, payload);
  const summaryParts = [`«${match.name}» обновлён`];
  if (payload.name && payload.name !== match.name) {
    summaryParts.push(`→ «${payload.name}»`);
  }
  if (payload.price !== undefined) {
    summaryParts.push(`цена $${payload.price}`);
  }
  if (payload.stockQuantity !== undefined) {
    summaryParts.push(`остаток ${payload.stockQuantity}`);
  }

  return {
    operation: 'updateProduct',
    summary: summaryParts.join(', '),
    product: updated,
  };
}

function handleListProducts(products) {
  if (!products.length) {
    return {
      operation: 'listProducts',
      summary: 'Каталог пуст. Добавьте товары, чтобы они появились в магазине.',
    };
  }
  const top = products
    .slice(-10)
    .map((p) => `• ${p.name} — $${formatPrice(p.price)} (остаток ${p.stock_quantity ?? 0})`)
    .join('\n');
  return {
    operation: 'listProducts',
    summary: `Каталог (последние ${Math.min(products.length, 10)}):\n${top}`,
  };
}

function handleSearchProducts(products, args = {}) {
  const query = args.query?.toLowerCase();
  if (!query) {
    return { error: 'Укажите запрос для поиска.' };
  }
  const matches = products.filter((p) => p.name?.toLowerCase().includes(query));
  if (!matches.length) {
    return {
      operation: 'searchProduct',
      summary: `Товары по запросу «${args.query}» не найдены.`,
    };
  }
  const list = matches
    .slice(0, 10)
    .map((p) => `• ${p.name} — $${formatPrice(p.price)} (остаток ${p.stock_quantity ?? 0})`)
    .join('\n');
  return {
    operation: 'searchProduct',
    summary: `Найдено (${matches.length}):\n${list}`,
  };
}

function formatPrice(price) {
  const num = parseFloat(price);
  if (Number.isNaN(num)) {
    return '0';
  }
  return num % 1 === 0 ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');
}

async function executeToolCall(shopId, products, toolCall) {
  const name = toolCall?.function?.name;
  if (!name) {
    return { error: 'Неизвестная операция.' };
  }

  let args = {};
  try {
    args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch (error) {
    logger.error('Failed to parse tool call arguments', { error: error.message, name });
    return { error: 'Не удалось обработать аргументы операции.' };
  }

  switch (name) {
    case 'addProduct':
      return handleAddProduct(shopId, args);
    case 'bulkAddProducts':
      return handleBulkAddProducts(shopId, args);
    case 'updateProduct':
      return handleUpdateProduct(shopId, products, args);
    case 'deleteProduct':
      return handleDeleteProduct(shopId, products, args);
    case 'bulkDeleteByNames':
      return handleBulkDeleteByNames(shopId, products, args);
    case 'listProducts':
      return handleListProducts(products);
    case 'searchProduct':
      return handleSearchProducts(products, args);
    default:
      return { error: `Операция ${name} пока не поддерживается в веб-версии.` };
  }
}

export async function handleProductAI({ shop, message, history = [] }) {
  if (!deepseekService.isAvailable()) {
    throw new Error('AI сервис недоступен. Проверьте ключ DeepSeek.');
  }

  const sanitizedMessage = sanitizeUserInput(message);
  if (!sanitizedMessage) {
    return { reply: 'Введите команду для управления товарами.' };
  }

  const normalizedHistory = normalizeHistory(history);
  const { rows: products } = await productQueries.list({ shopId: shop.id, limit: 100 });
  const prompt = generateProductAIPrompt(shop.name, products);

  const response = await deepseekService.chat({
    systemPrompt: prompt,
    userMessage: sanitizedMessage,
    history: normalizedHistory,
    tools: productTools,
  });

  const choice = response.choices?.[0];
  const assistantText = choice?.message?.content?.trim() || '';
  const toolCalls = choice?.message?.tool_calls || [];

  const operations = [];
  let productsChanged = false;
  let updatedProductsCache = products;

  for (const toolCall of toolCalls) {
    const result = await executeToolCall(shop.id, updatedProductsCache, toolCall);
    if (result.error) {
      operations.push(`⚠️ ${result.error}`);
      continue;
    }

    operations.push(result.summary);
    productsChanged = true;

    if (result.product) {
      updatedProductsCache = updatedProductsCache
        .filter((p) => p.id !== result.product.id)
        .concat(result.product);
    }

    if (result.products) {
      // For bulk add
      const ids = new Set(result.products.map((p) => p.id));
      updatedProductsCache = updatedProductsCache
        .filter((p) => !ids.has(p.id))
        .concat(result.products);
    }

    if (result.operation === 'deleteProduct' || result.operation === 'bulkDeleteByNames') {
      // Reload product list after deletions
      const { rows: reloadedProducts } = await productQueries.list({ shopId: shop.id, limit: 100 });
      updatedProductsCache = reloadedProducts;
    }
  }

  const replyText = buildAssistantMessage(assistantText, operations);

  const newHistory = [
    ...normalizedHistory,
    { role: 'user', content: sanitizedMessage },
    { role: 'assistant', content: replyText },
  ].slice(-20);

  return {
    reply: replyText,
    history: newHistory,
    operations,
    productsChanged,
  };
}

export async function resolveUserShop(userId, requestedShopId = null) {
  if (requestedShopId) {
    const shop = await shopQueries.findById(requestedShopId);
    if (shop && shop.owner_id === userId) {
      return shop;
    }
  }

  const shops = await shopQueries.findByOwnerId(userId);
  return Array.isArray(shops) && shops.length > 0 ? shops[0] : null;
}
