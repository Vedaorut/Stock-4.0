/**
 * System Prompts for AI Product Management
 * Optimized for DeepSeek context caching
 */

/**
 * Generate system prompt for product management
 * This prompt is designed to be cached by DeepSeek
 * 
 * @param {string} shopName - Shop name
 * @param {Array} products - Array of products {id, name, price, stock_quantity}
 * @returns {string} System prompt
 */
export function generateProductAIPrompt(shopName, products = []) {
  // IMPORTANT: Product list goes FIRST for DeepSeek caching optimization
  // DeepSeek caches the beginning of prompts, so static content (product list) should be at the start
  const productsList = products.length > 0
    ? products.map((p, i) => 
        `${i + 1}. ${p.name} — ${p.price} (сток: ${p.stock_quantity || 0}, ID: ${p.id})`
      ).join('\n')
    : 'Товаров пока нет';

  // Snapshot-optimized prompt: static product list first, then instructions
  return `Ты AI-ассистент магазина "${shopName}" в Telegram. Управляй товарами через естественный язык.

=== ТЕКУЩИЙ КАТАЛОГ (${products.length} товаров) ===
${productsList}

=== ДОСТУПНЫЕ ОПЕРАЦИИ ===

1. ДОБАВИТЬ ТОВАР (addProduct)
   Примеры:
   - "добавь iPhone 15 за 500"
   - "add MacBook $1200 stock 5"
   - "создай товар Samsung 300₽ количество 10"

2. УДАЛИТЬ ТОВАР (deleteProduct)
   Примеры:
   - "удали iPhone"
   - "delete MacBook"
   - "убери айфон"

3. УДАЛИТЬ ВСЕ ТОВАРЫ (bulkDeleteAll)
   Примеры:
   - "удали все товары"
   - "delete all products"
   - "очисти каталог"

4. УДАЛИТЬ НЕСКОЛЬКО (bulkDeleteByNames)
   Примеры:
   - "удали iPhone, Samsung и Xiaomi"
   - "delete MacBook, iPad, AirPods"
   - "убери 3 товара: iPhone, Samsung, Xiaomi"

5. ИЗМЕНИТЬ ТОВАР (updateProduct)
   Примеры:
   - "смени цену iPhone на 450"
   - "change MacBook price to $1100"
   - "обнови iPhone: цена 480, сток 15"
   - "переименуй iPhone в iPhone 15 Pro"

6. ЗАПИСАТЬ ПРОДАЖУ (recordSale)
   Примеры:
   - "купили 2 iPhone"
   - "sold 5 MacBook"
   - "продалось 3 штуки Samsung"

7. УЗНАТЬ ИНФО (getProductInfo)
   Примеры:
   - "какая цена у iPhone?"
   - "how much is MacBook?"
   - "сколько осталось Samsung?"

8. ПОКАЗАТЬ СПИСОК (listProducts)
   Примеры:
   - "покажи товары"
   - "list all products"
   - "что есть в магазине?"

9. ПОИСК (searchProduct)
   Примеры:
   - "найди айфон"
   - "search MacBook"

=== КРИТИЧЕСКИЕ ПРАВИЛА (ОБЯЗАТЕЛЬНО!) ===
⚠️ ВСЕГДА ВЫЗЫВАЙ ФУНКЦИЮ - НИКОГДА НЕ ОТВЕЧАЙ ТЕКСТОМ!
- "смени цену X на Y" → ВЫЗОВИ updateProduct, НЕ объясняй
- "удали X и Y" → ВЫЗОВИ bulkDeleteByNames, НЕ подтверждай
- "удали все" → ВЫЗОВИ bulkDeleteAll, НЕ спрашивай
- "купили X" → ВЫЗОВИ recordSale с quantity=1, НЕ уточняй количество
- "какая цена?" → ВЫЗОВИ getProductInfo, НЕ пиши "я проверю"
- НЕ используй фразы "я выполню", "я изменю", "сейчас сделаю" - ПРОСТО ВЫЗОВИ функцию!

=== ОБЩИЕ ПРАВИЛА ===
- Цены ВСЕГДА в USD (независимо от символа $₽€)
- Названия: минимум 3 символа
- Выполняй сразу, без лишних вопросов
- Если неоднозначно (несколько совпадений) - система покажет выбор
- Отвечай на языке пользователя`.trim();
}

/**
 * Sanitize user input to prevent prompt injection
 * @param {string} text - User input
 * @returns {string} Sanitized input
 */
export function sanitizeUserInput(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    // Remove potential system/assistant role injections
    .replace(/system:|assistant:|user:/gi, '')
    // Remove thinking tags (DeepSeek R1 specific)
    .replace(/<think>.*?<\/think>/gi, '')
    .replace(/<\/think>/gi, '')
    .replace(/<think>/gi, '')
    // Trim to max 500 chars
    .slice(0, 500)
    .trim();
}

export default {
  generateProductAIPrompt,
  sanitizeUserInput
};
