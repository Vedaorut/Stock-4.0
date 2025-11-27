/**
 * Comprehensive AI Bot Functions Test
 * Tests ALL operations: add, delete, update, discounts, sales, etc.
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateProductAIPrompt } from '../../src/utils/systemPrompts.js';
import { productTools } from '../../src/tools/productTools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const mockProducts = [
  { id: 1, name: 'iPhone 15 Pro', price: 999, currency: 'USD', stock_quantity: 10 },
  { id: 2, name: 'MacBook Pro', price: 2499, currency: 'USD', stock_quantity: 5 },
  { id: 3, name: 'AirPods Pro', price: 249, currency: 'USD', stock_quantity: 20 },
  { id: 4, name: 'iPad Pro', price: 1299, currency: 'USD', stock_quantity: 8 },
];

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

async function testCommand(userMessage, category) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📂 ${category}`);
  console.log(`📝 USER: "${userMessage}"`);
  console.log(`${'='.repeat(70)}`);

  const systemPrompt = generateProductAIPrompt('Test Shop', mockProducts);

  try {
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      tools: productTools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 500,
    });

    const message = response.choices[0].message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log('✅ RESULT: Function Call');
      message.tool_calls.forEach((call, idx) => {
        console.log(`   [${idx + 1}] Function: ${call.function.name}`);
        try {
          const parsed = JSON.parse(call.function.arguments);
          console.log(
            `       Arguments: ${JSON.stringify(parsed, null, 2).replace(/\n/g, '\n       ')}`
          );
        } catch {
          console.log(`       Arguments: ${call.function.arguments}`);
        }
      });
    } else if (message.content) {
      console.log('❌ RESULT: Text Response (Expected Function Call)');
      console.log(`   "${message.content.substring(0, 150)}..."`);
    }

    console.log(`📊 Tokens: ${response.usage.total_tokens}`);
    return message.tool_calls ? 'PASS' : 'FAIL';
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return 'ERROR';
  }
}

async function runTests() {
  console.log('\n🚀 COMPREHENSIVE AI BOT FUNCTION TEST');
  console.log('Testing ALL operations with DeepSeek API\n');

  const tests = [
    // === ДОБАВЛЕНИЕ ТОВАРОВ ===
    { cmd: 'добавь Samsung Galaxy за 899', category: '1. ADD - Single Product' },
    {
      cmd: 'добавь: Чехол 20 5шт, Наушники 150 10шт, Зарядка 30',
      category: '1. ADD - Bulk (3 items)',
    },

    // === УДАЛЕНИЕ ТОВАРОВ ===
    { cmd: 'удали iPhone', category: '2. DELETE - Single Product' },
    { cmd: 'удали MacBook и AirPods', category: '2. DELETE - Multiple (2 items)' },
    { cmd: 'удали всё кроме iPad', category: '2. DELETE - All Except One' },
    { cmd: 'удали все товары', category: '2. DELETE - All (needs confirmation)' },

    // === ИЗМЕНЕНИЕ ТОВАРОВ ===
    { cmd: 'смени цену iPhone на 899', category: '3. UPDATE - Change Price' },
    { cmd: 'переименуй AirPods в AirPods Max', category: '3. UPDATE - Rename Product' },
    { cmd: 'установи остаток MacBook в 15', category: '3. UPDATE - Set Stock' },
    { cmd: 'увеличь остаток iPhone до 50', category: '3. UPDATE - Increase Stock' },
    { cmd: 'уменьши количество iPad до 3', category: '3. UPDATE - Decrease Stock' },

    // === СКИДКИ НА ОДИН ТОВАР ===
    { cmd: 'сделай скидку 30% на iPhone', category: '4. DISCOUNT - Apply to One' },
    { cmd: 'скидка 20% на MacBook на 6 часов', category: '4. DISCOUNT - With Timer (6h)' },
    { cmd: 'скидка 15% на AirPods на 2 дня', category: '4. DISCOUNT - With Timer (2d)' },
    { cmd: 'убери скидку с iPhone', category: '4. DISCOUNT - Remove from One' },

    // === МАССОВЫЕ СКИДКИ ===
    { cmd: 'скидка 20% на все товары', category: '5. BULK DISCOUNT - All Products' },
    { cmd: 'скидка 15% на всё кроме iPhone', category: '5. BULK DISCOUNT - All Except One' },
    {
      cmd: 'скидка 25% на всё кроме iPhone и MacBook',
      category: '5. BULK DISCOUNT - All Except Two',
    },
    { cmd: 'подними цены на 10%', category: '5. BULK PRICE - Increase 10%' },
    { cmd: 'подними цены на 5% кроме iPad', category: '5. BULK PRICE - Increase Except One' },

    // === ПРОДАЖИ ===
    { cmd: 'купили iPhone', category: '6. SALE - Sold 1 item' },
    { cmd: 'купили 3 AirPods', category: '6. SALE - Sold 3 items' },
    { cmd: 'продали 2 MacBook', category: '6. SALE - Sold 2 items (Russian)' },

    // === ПРОСМОТР КАТАЛОГА ===
    { cmd: 'покажи товары', category: '7. VIEW - List All Products' },
    { cmd: 'найди iPhone', category: '7. VIEW - Search Product' },
    { cmd: 'какая цена у MacBook?', category: '7. VIEW - Get Product Info' },
    { cmd: 'сколько AirPods осталось?', category: '7. VIEW - Check Stock' },
  ];

  const results = {
    PASS: 0,
    FAIL: 0,
    ERROR: 0,
  };

  for (const test of tests) {
    const result = await testCommand(test.cmd, test.category);
    results[result]++;
    await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay between requests
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(70));
  console.log(`✅ PASS:  ${results.PASS}/${tests.length}`);
  console.log(`❌ FAIL:  ${results.FAIL}/${tests.length}`);
  console.log(`🔥 ERROR: ${results.ERROR}/${tests.length}`);
  console.log(`📈 Success Rate: ${((results.PASS / tests.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(70) + '\n');

  if (results.PASS === tests.length) {
    console.log('🎉 ALL TESTS PASSED! AI Bot функции работают идеально!\n');
  } else if (results.PASS / tests.length >= 0.8) {
    console.log('⚠️  Most tests passed, but some functions need attention.\n');
  } else {
    console.log('❌ Multiple failures detected. Review function implementations.\n');
  }
}

runTests();
