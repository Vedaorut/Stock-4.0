/**
 * Manual DeepSeek AI Testing Script
 * 
 * Реальные вызовы DeepSeek API для тестирования всех 9 операций
 * 
 * Usage:
 *   node tests/manual/testDeepSeekAI.js
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateProductAIPrompt } from '../../src/utils/systemPrompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from bot root
dotenv.config({ path: join(__dirname, '../../.env') });

// Mock products для тестирования
const mockProducts = [
  { id: 1, name: 'iPhone 15 Pro', price: 999, currency: 'USD', stock_quantity: 10 },
  { id: 2, name: 'MacBook Pro', price: 2499, currency: 'USD', stock_quantity: 5 },
  { id: 3, name: 'AirPods Pro', price: 249, currency: 'USD', stock_quantity: 20 }
];

// Initialize DeepSeek client
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
});

// Product tools definition (from productTools.js)
const tools = [
  {
    type: 'function',
    function: {
      name: 'addProduct',
      description: 'Добавить новый товар в каталог',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Название товара' },
          price: { type: 'number', description: 'Цена товара (положительное число)' },
          currency: { type: 'string', enum: ['USD', 'EUR', 'RUB'], description: 'Валюта' },
          description: { type: 'string', description: 'Описание товара (опционально)' },
          stock_quantity: { type: 'integer', description: 'Количество на складе (опционально, по умолчанию 0)' }
        },
        required: ['name', 'price']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteProduct',
      description: 'Удалить товар из каталога по названию',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Название товара для удаления' }
        },
        required: ['productName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listProducts',
      description: 'Показать все товары в каталоге',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchProduct',
      description: 'Найти товары по запросу (название, описание)',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Поисковый запрос' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateProduct',
      description: 'Изменить товар: цену, название, остаток',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Название товара для изменения' },
          updates: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              price: { type: 'number' },
              stock_quantity: { type: 'integer' }
            }
          }
        },
        required: ['productName', 'updates']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bulkDeleteAll',
      description: 'Удалить ВСЕ товары из каталога (очистить полностью)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bulkDeleteByNames',
      description: 'Удалить несколько товаров по списку названий',
      parameters: {
        type: 'object',
        properties: {
          productNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Массив названий товаров для удаления'
          }
        },
        required: ['productNames']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recordSale',
      description: 'Записать продажу товара (уменьшить остаток на складе)',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Название проданного товара' },
          quantity: { type: 'integer', description: 'Количество проданных единиц (по умолчанию 1)' }
        },
        required: ['productName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getProductInfo',
      description: 'Получить информацию о товаре (цена, остаток, описание)',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Название товара' }
        },
        required: ['productName']
      }
    }
  }
];

// Create system prompt
function createSystemPrompt(products) {
  const productsList = products.length > 0
    ? products.map(p => `- ${p.name} | $${p.price} | ${p.stock_quantity} шт`).join('\n')
    : '(пусто)';

  return `Ты — AI помощник для управления товарами в Telegram-магазине.

=== ТЕКУЩИЙ КАТАЛОГ (${products.length} товаров) ===
${productsList}

=== ТВОЯ ЗАДАЧА ===
Анализируй команды пользователя и вызывай соответствующую функцию.

=== ВАЖНЫЕ ПРАВИЛА ===
1. Если товара нет в каталоге — НЕ вызывай функцию, вернись с текстом "Товар не найден"
2. При частичном совпадении (например "айфон" вместо "iPhone 15 Pro") — используй ТОЧНОЕ название из каталога
3. Если цена не указана явно — НЕ добавляй товар, попроси указать цену
4. При удалении ВСЕ товары — используй bulkDeleteAll (не deleteProduct в цикле!)
5. Валюта по умолчанию: USD

=== ПРИМЕРЫ ===
Input: "добавь iPhone 15 за 999"
→ addProduct(name="iPhone 15", price=999, currency="USD")

Input: "удали айфон" (в каталоге "iPhone 15 Pro")
→ deleteProduct(productName="iPhone 15 Pro")

Input: "купили 2 макбука" (в каталоге "MacBook Pro")
→ recordSale(productName="MacBook Pro", quantity=2)

Input: "какая цена у AirPods?"
→ getProductInfo(productName="AirPods Pro")`;
}

// Test single command
async function testCommand(userMessage, products = mockProducts) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📝 USER: "${userMessage}"`);
  console.log(`${'='.repeat(60)}`);

  // Use REAL production prompt from systemPrompts.js
  const systemPrompt = generateProductAIPrompt('Test Shop', products);

  try {
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      tools,
      tool_choice: 'auto',
      temperature: 0.7,  // Match production settings
      max_tokens: 500
    });

    const message = response.choices[0].message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log('✅ AI RESPONSE: Function Call');
      message.tool_calls.forEach(call => {
        console.log(`   Function: ${call.function.name}`);
        console.log(`   Arguments: ${call.function.arguments}`);
        
        try {
          const args = JSON.parse(call.function.arguments);
          console.log(`   Parsed:`, JSON.stringify(args, null, 2));
        } catch (e) {
          console.log(`   ⚠️ Failed to parse arguments`);
        }
      });
    } else if (message.content) {
      console.log(`✅ AI RESPONSE: Text`);
      console.log(`   "${message.content}"`);
    } else {
      console.log('⚠️ AI RESPONSE: Empty');
    }

    // Usage stats
    console.log(`\n📊 Tokens: ${response.usage.total_tokens} (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens})`);

    return response;
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n🚀 DeepSeek AI Product Management - Manual Testing\n');
  console.log(`API Key: ${process.env.DEEPSEEK_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`Model: deepseek-chat`);
  console.log(`\nMock Catalog: ${mockProducts.length} products\n`);

  const tests = [
    // 1. Add Product
    { command: 'добавь iPhone 15 за 999', category: 'ADD PRODUCT (Russian)' },
    { command: 'add MacBook for $1200', category: 'ADD PRODUCT (English)' },
    { command: 'добавь товар без цены', category: 'ADD PRODUCT (Missing Price)' },

    // 2. Delete Product
    { command: 'удали iPhone 15 Pro', category: 'DELETE PRODUCT (Exact Match)' },
    { command: 'удали айфон про', category: 'DELETE PRODUCT (Fuzzy Match)' },
    { command: 'удали несуществующий товар', category: 'DELETE PRODUCT (Not Found)' },

    // 3. List Products
    { command: 'покажи товары', category: 'LIST PRODUCTS (Russian)' },
    { command: 'list products', category: 'LIST PRODUCTS (English)' },
    { command: 'покажи товары', category: 'LIST PRODUCTS (Empty)', products: [] },

    // 4. Search Product
    { command: 'найди макбук', category: 'SEARCH PRODUCT (Found)' },
    { command: 'найди samsung', category: 'SEARCH PRODUCT (Not Found)' },

    // 5. Update Product
    { command: 'смени цену iPhone на 899', category: 'UPDATE PRODUCT (Price)' },
    { command: 'переименуй AirPods в AirPods Max', category: 'UPDATE PRODUCT (Name)' },
    { command: 'установи остаток MacBook в 15', category: 'UPDATE PRODUCT (Stock)' },

    // 6. Bulk Delete All
    { command: 'удали все товары', category: 'BULK DELETE ALL' },
    { command: 'очисти каталог', category: 'BULK DELETE ALL (Alternative)' },

    // 7. Bulk Delete By Names
    { command: 'удали iPhone и AirPods', category: 'BULK DELETE BY NAMES (2 items)' },
    { command: 'удали iPhone, MacBook и AirPods', category: 'BULK DELETE BY NAMES (3 items)' },

    // 8. Record Sale
    { command: 'купили iPhone', category: 'RECORD SALE (1 item)' },
    { command: 'купили 3 AirPods', category: 'RECORD SALE (Multiple)' },
    { command: 'продали 2 макбука', category: 'RECORD SALE (Russian)' },

    // 9. Get Product Info
    { command: 'какая цена у iPhone?', category: 'GET PRODUCT INFO (Price)' },
    { command: 'сколько MacBook осталось?', category: 'GET PRODUCT INFO (Stock)' },
    { command: 'расскажи про AirPods', category: 'GET PRODUCT INFO (Full Info)' },

    // Edge Cases
    { command: 'привет', category: 'NOISE (Greeting)' },
    { command: 'спасибо', category: 'NOISE (Thanks)' },
    { command: 'hello', category: 'NOISE (English Greeting)' }
  ];

  let successCount = 0;
  let failCount = 0;

  for (const test of tests) {
    try {
      await testCommand(test.command, test.products || mockProducts);
      successCount++;
      
      // Sleep 1s между запросами (rate limit)
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      failCount++;
      console.error(`\n❌ Test failed: ${test.category}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successCount}/${tests.length}`);
  console.log(`❌ Failed: ${failCount}/${tests.length}`);
  console.log(`Success Rate: ${((successCount / tests.length) * 100).toFixed(1)}%`);
}

// Run tests
if (!process.env.DEEPSEEK_API_KEY) {
  console.error('❌ DEEPSEEK_API_KEY not found in .env');
  process.exit(1);
}

runAllTests()
  .then(() => {
    console.log('\n✅ All tests completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  });
