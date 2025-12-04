/**
 * Handler for showCapabilities - returns pre-formatted capabilities list
 */

/**
 * Returns formatted list of AI capabilities
 * @param {Object} context - Context with lang
 * @returns {Object} Result with capabilities message
 */
export async function handleShowCapabilities(context = {}) {
  const lang = context.lang || 'ru';

  const capabilities =
    lang === 'ru'
      ? `
**Управление товарами:**
• Добавить товар: "Добавь iPhone 15 за $999"
• Несколько товаров: "Добавь 5 футболок по $15 и 3 кепки по $10"
• Удалить: "Удали iPhone" или "Удали всё кроме MacBook"
• Посмотреть: "Какие товары есть?" или "Покажи всё"

**Цены и скидки:**
• Изменить цену: "Цена iPhone 899"
• Скидка: "20% скидка на iPhone на 24 часа"
• На всё: "Скидка 15% на весь каталог"
• Убрать скидку: "Убери скидку с iPhone"

**Склад:**
• Остатки: "Сколько iPhone?"
• Изменить: "Остаток iPhone 5 штук"
• Продажа: "Продал 3 iPhone"

**Подсказки:**
• Говори естественно - я пойму
• Можно комбинировать: "Добавь 10 чехлов по $20 и сделай скидку 10%"
`
      : `
**Product Management:**
• Add product: "Add iPhone 15 for $999"
• Multiple: "Add 5 t-shirts for $15 and 3 caps for $10"
• Delete: "Delete iPhone" or "Delete all except MacBook"
• View: "What products?" or "Show all"

**Prices & Discounts:**
• Change price: "Price iPhone 899"
• Discount: "20% discount on iPhone for 24 hours"
• All products: "15% discount on everything"
• Remove: "Remove discount from iPhone"

**Inventory:**
• Check stock: "How many iPhones?"
• Update: "Stock iPhone 5 pieces"
• Sale: "Sold 3 iPhones"

**Tips:**
• Speak naturally - I'll understand
• Combine actions: "Add 10 cases for $20 and apply 10% discount"
`;

  return {
    success: true,
    message: capabilities.trim(),
    data: { action: 'showCapabilities' },
    skipAIResponse: true, // Tell processor to use this message directly
  };
}
