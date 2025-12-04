/**
 * ProductAI Unit Tests
 *
 * Unit tests for productAI.js service functions
 * Tests pure functions that handle AI product management logic
 *
 * Run: npm run test:unit -- productAI
 */

import { describe, it, expect, beforeEach, jest as _jest } from '@jest/globals';

import {
  noteProductContext,
  saveToConversationHistory,
  cleanDeepSeekTokens,
  detectJSONInMessage,
  parseDurationToMs,
  formatDuration,
  detectStockUpdateIntent,
  detectSingleProductDiscountIntent,
  getConversationHistory,
} from '../../src/services/productAI.js';

// ===========================================
// cleanDeepSeekTokens Tests
// ===========================================
describe('cleanDeepSeekTokens', () => {
  // Note: DeepSeek uses special Unicode characters in tokens, not ASCII pipe characters
  // The actual tokens use characters like ｜ (fullwidth vertical bar) and ▁ (lower one eighth block)
  it('should remove tool_calls_begin token (Unicode)', () => {
    const input = '<｜tool▁calls▁begin｜>Some text';
    const result = cleanDeepSeekTokens(input);
    expect(result).toBe('Some text');
  });

  it('should remove tool_calls_end token (Unicode)', () => {
    const input = 'Some text<｜tool▁calls▁end｜>';
    const result = cleanDeepSeekTokens(input);
    expect(result).toBe('Some text');
  });

  it('should remove tool_sep token (Unicode)', () => {
    const input = 'Part1<｜tool▁sep｜>Part2';
    const result = cleanDeepSeekTokens(input);
    expect(result).toBe('Part1Part2');
  });

  it('should remove tool_result_begin token (Unicode)', () => {
    const input = '<｜tool▁result▁begin｜>Result here';
    const result = cleanDeepSeekTokens(input);
    expect(result).toBe('Result here');
  });

  it('should remove tool_result_end token (Unicode)', () => {
    const input = 'Result here<｜tool▁result▁end｜>';
    const result = cleanDeepSeekTokens(input);
    expect(result).toBe('Result here');
  });

  it('should remove end_of_sentence token (Unicode)', () => {
    const input = 'Sentence<｜end▁of▁sentence｜>';
    const result = cleanDeepSeekTokens(input);
    expect(result).toBe('Sentence');
  });

  it('should remove multiple tokens at once (Unicode)', () => {
    const input = '<｜tool▁calls▁begin｜>Hello<｜tool▁sep｜>World<｜tool▁calls▁end｜>';
    const result = cleanDeepSeekTokens(input);
    expect(result).toBe('HelloWorld');
  });

  it('should trim whitespace', () => {
    const input = '  Some text with spaces  ';
    const result = cleanDeepSeekTokens(input);
    expect(result).toBe('Some text with spaces');
  });

  it('should return normal text unchanged', () => {
    const input = 'Normal text without any tokens';
    const result = cleanDeepSeekTokens(input);
    expect(result).toBe('Normal text without any tokens');
  });

  it('should handle empty string', () => {
    expect(cleanDeepSeekTokens('')).toBe('');
  });

  it('should handle null input', () => {
    expect(cleanDeepSeekTokens(null)).toBe(null);
  });

  it('should handle undefined input', () => {
    expect(cleanDeepSeekTokens(undefined)).toBe(undefined);
  });

  it('should handle non-string input', () => {
    expect(cleanDeepSeekTokens(123)).toBe(123);
    expect(cleanDeepSeekTokens({})).toEqual({});
  });
});

// ===========================================
// detectJSONInMessage Tests
// ===========================================
describe('detectJSONInMessage', () => {
  it('should detect {"success": true} pattern', () => {
    const input = 'Response: {"success": true, "data": {}}';
    expect(detectJSONInMessage(input)).toBe(true);
  });

  it('should detect {"error": ...} pattern', () => {
    const input = '{"error": "Something went wrong"}';
    expect(detectJSONInMessage(input)).toBe(true);
  });

  it('should detect {"data": ...} pattern', () => {
    const input = '{"data": {"product": "iPhone"}}';
    expect(detectJSONInMessage(input)).toBe(true);
  });

  it('should detect {"product_id": ...} pattern', () => {
    const input = '{"product_id": 123}';
    expect(detectJSONInMessage(input)).toBe(true);
  });

  it('should detect {"message": ...} pattern', () => {
    const input = '{"message": "Product added"}';
    expect(detectJSONInMessage(input)).toBe(true);
  });

  it('should detect full JSON object', () => {
    const input = '{"name": "iPhone", "price": 999}';
    expect(detectJSONInMessage(input)).toBe(true);
  });

  it('should detect JSON array', () => {
    const input = '[{"id": 1}, {"id": 2}]';
    expect(detectJSONInMessage(input)).toBe(true);
  });

  it('should not detect normal text', () => {
    const input = 'Product added successfully!';
    expect(detectJSONInMessage(input)).toBe(false);
  });

  it('should not detect text with curly braces in natural language', () => {
    const input = 'The price is $999 {approximately}';
    expect(detectJSONInMessage(input)).toBe(false);
  });

  it('should handle empty string', () => {
    expect(detectJSONInMessage('')).toBe(false);
  });

  it('should handle null', () => {
    expect(detectJSONInMessage(null)).toBe(false);
  });

  it('should handle undefined', () => {
    expect(detectJSONInMessage(undefined)).toBe(false);
  });
});

// ===========================================
// parseDurationToMs Tests
// ===========================================
describe('parseDurationToMs', () => {
  describe('Russian hours', () => {
    it('should parse "6 часов" -> 21600000ms', () => {
      expect(parseDurationToMs('6 часов')).toBe(6 * 60 * 60 * 1000);
    });

    it('should parse "1 час" -> 3600000ms', () => {
      expect(parseDurationToMs('1 час')).toBe(1 * 60 * 60 * 1000);
    });

    it('should parse "2 часа" -> 7200000ms', () => {
      expect(parseDurationToMs('2 часа')).toBe(2 * 60 * 60 * 1000);
    });

    it('should parse "24 часа" -> 86400000ms', () => {
      expect(parseDurationToMs('24 часа')).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('Russian days', () => {
    it('should parse "2 дня" -> 172800000ms', () => {
      expect(parseDurationToMs('2 дня')).toBe(2 * 24 * 60 * 60 * 1000);
    });

    it('should parse "1 день" -> 86400000ms', () => {
      expect(parseDurationToMs('1 день')).toBe(1 * 24 * 60 * 60 * 1000);
    });

    it('should parse "5 дней" -> 432000000ms', () => {
      expect(parseDurationToMs('5 дней')).toBe(5 * 24 * 60 * 60 * 1000);
    });

    it('should parse "7 дней" -> 604800000ms (1 week)', () => {
      expect(parseDurationToMs('7 дней')).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('Russian weeks', () => {
    it('should parse "1 неделя" -> 604800000ms', () => {
      expect(parseDurationToMs('1 неделя')).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should parse "2 недели" -> 1209600000ms', () => {
      expect(parseDurationToMs('2 недели')).toBe(2 * 7 * 24 * 60 * 60 * 1000);
    });

    it('should parse "3 недель" -> 1814400000ms', () => {
      expect(parseDurationToMs('3 недель')).toBe(3 * 7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('English hours', () => {
    it('should parse "6 hours" -> 21600000ms', () => {
      expect(parseDurationToMs('6 hours')).toBe(6 * 60 * 60 * 1000);
    });

    it('should parse "1 hour" -> 3600000ms', () => {
      expect(parseDurationToMs('1 hour')).toBe(1 * 60 * 60 * 1000);
    });

    it('should parse "12h" -> 43200000ms', () => {
      expect(parseDurationToMs('12h')).toBe(12 * 60 * 60 * 1000);
    });

    it('should parse "24hrs" -> 86400000ms', () => {
      expect(parseDurationToMs('24hrs')).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('English days', () => {
    it('should parse "3 days" -> 259200000ms', () => {
      expect(parseDurationToMs('3 days')).toBe(3 * 24 * 60 * 60 * 1000);
    });

    it('should parse "1 day" -> 86400000ms', () => {
      expect(parseDurationToMs('1 day')).toBe(1 * 24 * 60 * 60 * 1000);
    });

    it('should parse "7d" -> 604800000ms', () => {
      expect(parseDurationToMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('English weeks', () => {
    it('should parse "1 week" -> 604800000ms', () => {
      expect(parseDurationToMs('1 week')).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should parse "2 weeks" -> 1209600000ms', () => {
      expect(parseDurationToMs('2 weeks')).toBe(2 * 7 * 24 * 60 * 60 * 1000);
    });

    it('should parse "1w" -> 604800000ms', () => {
      expect(parseDurationToMs('1w')).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('Edge cases', () => {
    it('should return null for empty string', () => {
      expect(parseDurationToMs('')).toBe(null);
    });

    it('should return null for null', () => {
      expect(parseDurationToMs(null)).toBe(null);
    });

    it('should return null for undefined', () => {
      expect(parseDurationToMs(undefined)).toBe(null);
    });

    it('should return null for invalid format', () => {
      expect(parseDurationToMs('invalid')).toBe(null);
    });

    it('should return null for number without unit', () => {
      expect(parseDurationToMs('123')).toBe(null);
    });

    it('should handle case insensitivity', () => {
      expect(parseDurationToMs('6 HOURS')).toBe(6 * 60 * 60 * 1000);
      expect(parseDurationToMs('2 DAYS')).toBe(2 * 24 * 60 * 60 * 1000);
    });

    it('should handle extra whitespace', () => {
      expect(parseDurationToMs('  6 hours  ')).toBe(6 * 60 * 60 * 1000);
    });
  });
});

// ===========================================
// formatDuration Tests
// ===========================================
describe('formatDuration', () => {
  describe('Hours formatting', () => {
    it('should format 1 hour as "1 час"', () => {
      expect(formatDuration(1 * 60 * 60 * 1000)).toBe('1 час');
    });

    it('should format 2 hours as "2 часа"', () => {
      expect(formatDuration(2 * 60 * 60 * 1000)).toBe('2 часа');
    });

    it('should format 3 hours as "3 часа"', () => {
      expect(formatDuration(3 * 60 * 60 * 1000)).toBe('3 часа');
    });

    it('should format 4 hours as "4 часа"', () => {
      expect(formatDuration(4 * 60 * 60 * 1000)).toBe('4 часа');
    });

    it('should format 5 hours as "5 часов"', () => {
      expect(formatDuration(5 * 60 * 60 * 1000)).toBe('5 часов');
    });

    it('should format 6 hours as "6 часов"', () => {
      expect(formatDuration(6 * 60 * 60 * 1000)).toBe('6 часов');
    });

    it('should format 12 hours as "12 часов"', () => {
      expect(formatDuration(12 * 60 * 60 * 1000)).toBe('12 часов');
    });
  });

  describe('Days formatting', () => {
    it('should format 1 day as "1 день"', () => {
      expect(formatDuration(24 * 60 * 60 * 1000)).toBe('1 день');
    });

    it('should format 2 days as "2 дня"', () => {
      expect(formatDuration(2 * 24 * 60 * 60 * 1000)).toBe('2 дня');
    });

    it('should format 3 days as "3 дня"', () => {
      expect(formatDuration(3 * 24 * 60 * 60 * 1000)).toBe('3 дня');
    });

    it('should format 4 days as "4 дня"', () => {
      expect(formatDuration(4 * 24 * 60 * 60 * 1000)).toBe('4 дня');
    });

    it('should format 5 days as "5 дней"', () => {
      expect(formatDuration(5 * 24 * 60 * 60 * 1000)).toBe('5 дней');
    });

    it('should format 7 days as "7 дней"', () => {
      expect(formatDuration(7 * 24 * 60 * 60 * 1000)).toBe('7 дней');
    });
  });

  describe('Edge cases', () => {
    it('should return "постоянная" for null', () => {
      expect(formatDuration(null)).toBe('постоянная');
    });

    it('should return "постоянная" for undefined', () => {
      expect(formatDuration(undefined)).toBe('постоянная');
    });

    it('should return "постоянная" for 0', () => {
      expect(formatDuration(0)).toBe('постоянная');
    });

    it('should return "постоянная" for NaN', () => {
      expect(formatDuration(NaN)).toBe('постоянная');
    });

    it('should handle fractional hours with rounding', () => {
      // 1.5 hours = 5400000ms -> should round to "2 часа"
      const result = formatDuration(1.5 * 60 * 60 * 1000);
      expect(result).toMatch(/часов|часа|час/);
    });
  });
});

// ===========================================
// detectStockUpdateIntent Tests
// ===========================================
describe('detectStockUpdateIntent', () => {
  describe('Should detect stock update intent', () => {
    it('should detect "установи сток iPhone на 10"', () => {
      const result = detectStockUpdateIntent('установи сток iPhone на 10');
      expect(result).not.toBeNull();
      expect(result.productName).toBe('iPhone');
      expect(result.quantity).toBe(10);
    });

    it('should detect "обнови остаток MacBook до 5"', () => {
      const result = detectStockUpdateIntent('обнови остаток MacBook до 5');
      expect(result).not.toBeNull();
      expect(result.productName).toBe('MacBook');
      expect(result.quantity).toBe(5);
    });

    it('should detect "сток AirPods = 20"', () => {
      const result = detectStockUpdateIntent('сток AirPods = 20');
      expect(result).not.toBeNull();
      expect(result.productName).toBe('AirPods');
      expect(result.quantity).toBe(20);
    });

    it('should detect "set stock iPhone = 15"', () => {
      // Note: pattern uses "до|на|=" not "to"
      const result = detectStockUpdateIntent('set stock iPhone = 15');
      expect(result).not.toBeNull();
      expect(result.quantity).toBe(15);
    });

    it('should detect "update quantity MacBook = 8"', () => {
      const result = detectStockUpdateIntent('update quantity MacBook = 8');
      expect(result).not.toBeNull();
      expect(result.quantity).toBe(8);
    });

    it('should detect "выстави наличие iPad на 3"', () => {
      const result = detectStockUpdateIntent('выстави наличие iPad на 3');
      expect(result).not.toBeNull();
      expect(result.productName).toBe('iPad');
      expect(result.quantity).toBe(3);
    });

    it('should detect "поставь остаток Samsung до 12"', () => {
      const result = detectStockUpdateIntent('поставь остаток Samsung до 12');
      expect(result).not.toBeNull();
      expect(result.productName).toBe('Samsung');
      expect(result.quantity).toBe(12);
    });
  });

  describe('Should NOT detect stock update intent', () => {
    it('should return null for "покажи все товары"', () => {
      const result = detectStockUpdateIntent('покажи все товары');
      expect(result).toBeNull();
    });

    it('should return null for "скидка 20% на iPhone"', () => {
      const result = detectStockUpdateIntent('скидка 20% на iPhone');
      expect(result).toBeNull();
    });

    it('should return null for "добавь iPhone за 999"', () => {
      const result = detectStockUpdateIntent('добавь iPhone за 999');
      expect(result).toBeNull();
    });

    it('should return null for "удали iPhone"', () => {
      const result = detectStockUpdateIntent('удали iPhone');
      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = detectStockUpdateIntent(null);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = detectStockUpdateIntent('');
      expect(result).toBeNull();
    });

    it('should return null for "обнови сток все товары на 10"', () => {
      // Should not detect when "все" (all) is mentioned
      const result = detectStockUpdateIntent('обнови сток все товары на 10');
      expect(result).toBeNull();
    });

    it('should return null for multiple products "iPhone и MacBook сток 10"', () => {
      // Should not detect when multiple products mentioned
      const result = detectStockUpdateIntent('iPhone и MacBook сток 10');
      expect(result).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle zero quantity', () => {
      const result = detectStockUpdateIntent('установи сток iPhone на 0');
      expect(result).not.toBeNull();
      expect(result.quantity).toBe(0);
    });

    it('should reject negative quantity', () => {
      // Regex won't match negative numbers
      const result = detectStockUpdateIntent('установи сток iPhone на -5');
      expect(result).toBeNull();
    });

    it('should reject extremely large quantity', () => {
      // > 1,000,000 should be rejected
      const result = detectStockUpdateIntent('установи сток iPhone на 2000000');
      expect(result).toBeNull();
    });
  });
});

// ===========================================
// detectSingleProductDiscountIntent Tests
// ===========================================
describe('detectSingleProductDiscountIntent', () => {
  const mockProducts = [
    { id: 1, name: 'iPhone 15 Pro', price: 999, stock_quantity: 10 },
    { id: 2, name: 'MacBook Pro', price: 2499, stock_quantity: 5 },
    { id: 3, name: 'AirPods Pro', price: 249, stock_quantity: 20 },
  ];

  describe('Should detect discount intent', () => {
    it('should detect "скидка 20% на iPhone 15 Pro"', () => {
      const result = detectSingleProductDiscountIntent('скидка 20% на iPhone 15 Pro', mockProducts);
      expect(result).not.toBeNull();
      expect(result.product.name).toBe('iPhone 15 Pro');
      expect(result.percentage).toBe(20);
    });

    it('should detect "discount 15% MacBook Pro"', () => {
      const result = detectSingleProductDiscountIntent('discount 15% MacBook Pro', mockProducts);
      expect(result).not.toBeNull();
      expect(result.product.name).toBe('MacBook Pro');
      expect(result.percentage).toBe(15);
    });

    it('should detect "50% скидка на AirPods Pro"', () => {
      const result = detectSingleProductDiscountIntent('50% скидка на AirPods Pro', mockProducts);
      expect(result).not.toBeNull();
      expect(result.product.name).toBe('AirPods Pro');
      expect(result.percentage).toBe(50);
    });

    it('should parse duration "скидка 20% на iPhone 15 Pro на 6 часов"', () => {
      const result = detectSingleProductDiscountIntent(
        'скидка 20% на iPhone 15 Pro на 6 часов',
        mockProducts
      );
      expect(result).not.toBeNull();
      expect(result.duration).toBe('6 часов');
    });
  });

  describe('Should NOT detect discount intent', () => {
    it('should return null for "покажи все товары"', () => {
      const result = detectSingleProductDiscountIntent('покажи все товары', mockProducts);
      expect(result).toBeNull();
    });

    it('should return null for "скидка 20% на все товары"', () => {
      // Should return null for bulk discount
      const result = detectSingleProductDiscountIntent('скидка 20% на все товары', mockProducts);
      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = detectSingleProductDiscountIntent(null, mockProducts);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = detectSingleProductDiscountIntent('', mockProducts);
      expect(result).toBeNull();
    });

    it('should return null when product not mentioned', () => {
      const result = detectSingleProductDiscountIntent('скидка 20%', mockProducts);
      expect(result).toBeNull();
    });

    it('should return null for multiple products "iPhone и MacBook скидка 20%"', () => {
      const result = detectSingleProductDiscountIntent(
        'iPhone и MacBook скидка 20%',
        mockProducts
      );
      expect(result).toBeNull();
    });

    it('should return null for multiple discount percentages "iPhone 20% MacBook 30%"', () => {
      const result = detectSingleProductDiscountIntent(
        'iPhone 20% MacBook 30%',
        mockProducts
      );
      expect(result).toBeNull();
    });
  });

  describe('Error cases', () => {
    it('should return error for 0% discount', () => {
      const result = detectSingleProductDiscountIntent('скидка 0% на iPhone 15 Pro', mockProducts);
      expect(result).not.toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.message).toMatch(/больше 0%|greater than 0%/i);
    });

    it('should return error for negative discount', () => {
      const result = detectSingleProductDiscountIntent('скидка -10% на iPhone 15 Pro', mockProducts);
      expect(result).not.toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should return error for >100% discount', () => {
      const result = detectSingleProductDiscountIntent(
        'скидка 150% на iPhone 15 Pro',
        mockProducts
      );
      expect(result).not.toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('100%');
    });
  });

  describe('Context-based detection', () => {
    it('should use lastProductName from context when product not explicitly mentioned', () => {
      const ctx = {
        session: {
          aiContext: {
            lastProductName: 'iPhone 15 Pro',
          },
        },
      };
      const result = detectSingleProductDiscountIntent('скидка 30%', mockProducts, ctx);
      // Should find product via context
      expect(result).not.toBeNull();
      expect(result.product.name).toBe('iPhone 15 Pro');
    });
  });
});

// ===========================================
// noteProductContext Tests
// ===========================================
describe('noteProductContext', () => {
  let mockCtx;

  beforeEach(() => {
    mockCtx = {
      session: {},
    };
  });

  it('should save product context to session', () => {
    const product = { id: 1, name: 'iPhone 15', price: 999 };
    noteProductContext(mockCtx, product);

    expect(mockCtx.session.aiContext).toBeDefined();
    expect(mockCtx.session.aiContext.lastProductId).toBe(1);
    expect(mockCtx.session.aiContext.lastProductName).toBe('iPhone 15');
  });

  it('should merge meta with existing context', () => {
    const product = { id: 1, name: 'iPhone 15', price: 999 };
    noteProductContext(mockCtx, product, { action: 'create', command: 'add' });

    expect(mockCtx.session.aiContext.lastAction).toBe('create');
    expect(mockCtx.session.aiContext.lastCommand).toBe('add');
  });

  it('should handle empty product', () => {
    noteProductContext(mockCtx, null);
    expect(mockCtx.session.aiContext).toBeUndefined();
  });

  it('should handle missing ctx', () => {
    expect(() => noteProductContext(null, { id: 1, name: 'Test' })).not.toThrow();
  });

  it('should handle missing session', () => {
    expect(() => noteProductContext({}, { id: 1, name: 'Test' })).not.toThrow();
  });

  it('should maintain recent products list (max 5)', () => {
    for (let i = 1; i <= 7; i++) {
      noteProductContext(mockCtx, { id: i, name: `Product ${i}`, price: i * 100 });
    }

    expect(mockCtx.session.aiContext.recentProducts.length).toBeLessThanOrEqual(5);
  });

  it('should deduplicate products by name', () => {
    noteProductContext(mockCtx, { id: 1, name: 'iPhone', price: 999 });
    noteProductContext(mockCtx, { id: 2, name: 'MacBook', price: 1999 });
    noteProductContext(mockCtx, { id: 3, name: 'iPhone', price: 1099 }); // Same name, different id

    // Should have only 2 unique product names
    const uniqueNames = new Set(mockCtx.session.aiContext.recentProducts.map((p) => p.name));
    expect(uniqueNames.size).toBe(2);
  });

  it('should store related products when provided', () => {
    const product = { id: 1, name: 'iPhone', price: 999 };
    const related = [
      { id: 2, name: 'MacBook', price: 1999 },
      { id: 3, name: 'AirPods', price: 249 },
    ];
    noteProductContext(mockCtx, product, { relatedProducts: related });

    expect(mockCtx.session.aiContext.relatedProducts).toEqual(related);
  });
});

// ===========================================
// saveToConversationHistory Tests
// ===========================================
describe('saveToConversationHistory', () => {
  let mockCtx;

  beforeEach(() => {
    mockCtx = {
      session: {},
      from: { id: 123456 },
    };
  });

  it('should initialize conversation if not exists', () => {
    const message = { role: 'user', content: 'Hello' };
    saveToConversationHistory(mockCtx, message);

    expect(mockCtx.session.aiConversation).toBeDefined();
    expect(mockCtx.session.aiConversation.messages).toHaveLength(1);
  });

  it('should add single message', () => {
    const message = { role: 'user', content: 'Hello' };
    saveToConversationHistory(mockCtx, message);

    expect(mockCtx.session.aiConversation.messages[0]).toEqual(message);
  });

  it('should add array of messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];
    saveToConversationHistory(mockCtx, messages);

    expect(mockCtx.session.aiConversation.messages).toHaveLength(2);
  });

  it('should handle null ctx', () => {
    expect(() => saveToConversationHistory(null, { role: 'user', content: 'test' })).not.toThrow();
  });

  it('should handle missing session', () => {
    expect(() =>
      saveToConversationHistory({}, { role: 'user', content: 'test' })
    ).not.toThrow();
  });

  it('should implement sliding window (max 40 messages)', () => {
    mockCtx.session.aiConversation = {
      messages: [],
      lastActivity: Date.now(),
      messageCount: 0,
    };

    // Add 50 messages
    for (let i = 0; i < 50; i++) {
      saveToConversationHistory(mockCtx, { role: 'user', content: `Message ${i}` });
    }

    // Should keep only last 40
    expect(mockCtx.session.aiConversation.messages.length).toBeLessThanOrEqual(40);
  });

  it('should update lastActivity timestamp', () => {
    const before = Date.now();
    saveToConversationHistory(mockCtx, { role: 'user', content: 'test' });
    const after = Date.now();

    expect(mockCtx.session.aiConversation.lastActivity).toBeGreaterThanOrEqual(before);
    expect(mockCtx.session.aiConversation.lastActivity).toBeLessThanOrEqual(after);
  });

  it('should increment messageCount', () => {
    saveToConversationHistory(mockCtx, { role: 'user', content: 'test1' });
    saveToConversationHistory(mockCtx, { role: 'user', content: 'test2' });

    expect(mockCtx.session.aiConversation.messageCount).toBe(2);
  });
});

// ===========================================
// getConversationHistory Tests
// ===========================================
describe('getConversationHistory', () => {
  let mockCtx;

  beforeEach(() => {
    mockCtx = {
      session: {},
      from: { id: 123456 },
    };
  });

  it('should return empty array when no conversation', () => {
    const result = getConversationHistory(mockCtx);
    expect(result).toEqual([]);
  });

  it('should return messages from conversation', () => {
    mockCtx.session.aiConversation = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ],
      lastActivity: Date.now(),
    };

    const result = getConversationHistory(mockCtx);
    expect(result).toHaveLength(2);
  });

  it('should clear expired conversation (after 2 hours)', () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000 - 1000; // 2 hours + 1 second ago
    mockCtx.session.aiConversation = {
      messages: [{ role: 'user', content: 'Old message' }],
      lastActivity: twoHoursAgo,
    };

    const result = getConversationHistory(mockCtx);
    expect(result).toEqual([]);
    expect(mockCtx.session.aiConversation).toBeUndefined();
  });

  it('should NOT clear non-expired conversation', () => {
    const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago
    mockCtx.session.aiConversation = {
      messages: [{ role: 'user', content: 'Recent message' }],
      lastActivity: oneHourAgo,
    };

    const result = getConversationHistory(mockCtx);
    expect(result).toHaveLength(1);
  });

  it('should handle null ctx', () => {
    const result = getConversationHistory(null);
    expect(result).toEqual([]);
  });

  it('should handle missing session', () => {
    const result = getConversationHistory({});
    expect(result).toEqual([]);
  });
});
