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

=== ЗАДАВАЙ УТОЧНЯЮЩИЕ ВОПРОСЫ (ВАЖНО!) ===
🔍 Если команда НЕПОЛНАЯ или НЕОДНОЗНАЧНА → НЕ вызывай функцию, СПРОСИ!

ПРАВИЛО: Только если информация ПОЛНАЯ и ТОЧНАЯ → вызови функцию.
Иначе → задай 1-2 уточняющих вопроса ТЕКСТОМ (не вызывай функцию).

ПРИМЕРЫ НЕПОЛНЫХ КОМАНД (нужно спросить):

Input: "добавь зелёный"
❓ Ты (ТЕКСТ): "Какой товар добавить и по какой цене? Например: 'зеленый чехол за 25'"

Input: "смени цену"
❓ Ты (ТЕКСТ): "На какой товар и на какую цену? Например: 'смени цену iPhone на 450'"

Input: "купили"
❓ Ты (ТЕКСТ): "Какой товар продался и сколько штук? Например: 'купили 2 iPhone'"

Input: "удали"
❓ Ты (ТЕКСТ): "Какой товар удалить? Например: 'удали iPhone'"

Input: "добавь за 100"
❓ Ты (ТЕКСТ): "Какой товар добавить за $100? Например: 'добавь клавиатуру за 100'"

ПРИМЕРЫ ПОЛНЫХ КОМАНД (можно выполнить):

Input: "добавь зеленый чехол за 25"
✅ Ты (ФУНКЦИЯ): addProduct(name="Green case", price=25, stock_quantity=10)

Input: "смени цену iPhone на 450"
✅ Ты (ФУНКЦИЯ): updateProduct(productName="iPhone", updates={price: 450})

Input: "купили 2 iPhone"
✅ Ты (ФУНКЦИЯ): recordSale(productName="iPhone", quantity=2)

Input: "удали Samsung"
✅ Ты (ФУНКЦИЯ): deleteProduct(productName="Samsung")

=== КРИТИЧЕСКИЕ ПРАВИЛА (ОБЯЗАТЕЛЬНО!) ===
⚠️ Если команда ПОЛНАЯ → ВСЕГДА ВЫЗЫВАЙ ФУНКЦИЮ, НЕ отвечай текстом!
⚠️ Если команда НЕПОЛНАЯ → ВСЕГДА ОТВЕЧАЙ ТЕКСТОМ, НЕ вызывай функцию!

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
