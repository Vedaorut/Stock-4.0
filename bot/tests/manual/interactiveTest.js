/**
 * Interactive DeepSeek AI Testing
 *
 * Реальное тестирование с edge cases и попытками запутать AI
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateProductAIPrompt } from '../../src/utils/systemPrompts.js';
import { productTools } from '../../src/tools/productTools.js';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

// Initialize DeepSeek
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
});

// Mock products
const products = [
  { id: 1, name: 'iPhone 15 Pro', price: 999, currency: 'USD', stock_quantity: 10 },
  { id: 2, name: 'MacBook Pro', price: 2499, currency: 'USD', stock_quantity: 5 },
  { id: 3, name: 'AirPods Pro', price: 249, currency: 'USD', stock_quantity: 20 }
];

// Interactive testing
async function interactiveTest() {
  console.log('\n🎮 Interactive DeepSeek AI Testing');
  console.log('=========================================\n');
  console.log('Текущие товары:');
  products.forEach(p => console.log(`  - ${p.name} | $${p.price} | ${p.stock_quantity} шт`));
  console.log('\n💡 Попробуй запутать AI! Примеры:');
  console.log('  • "добавь 5 айфонов за 999" (неоднозначно)');
  console.log('  • "подними все цены на 10%" (нет такой функции)');
  console.log('  • "удали все кроме iPhone" (сложная логика)');
  console.log('  • "продали 1000 iPhone" (больше чем stock)');
  console.log('  • "переименуй iPhone в MacBook" (конфликт)');
  console.log('\nВведи команду (или "exit" для выхода):\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '🤖 Команда: '
  });

  rl.prompt();

  rl.on('line', async (userMessage) => {
    if (userMessage.toLowerCase() === 'exit') {
      console.log('\n👋 Bye!');
      rl.close();
      process.exit(0);
    }

    if (!userMessage.trim()) {
      rl.prompt();
      return;
    }

    try {
      const systemPrompt = generateProductAIPrompt('Test Shop', products);

      const response = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        tools: productTools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 500
      });

      const message = response.choices[0].message;

      console.log('\n' + '='.repeat(60));

      if (message.tool_calls && message.tool_calls.length > 0) {
        const call = message.tool_calls[0];
        console.log('✅ AI вызвал функцию:');
        console.log(`   📌 ${call.function.name}`);

        try {
          const args = JSON.parse(call.function.arguments);
          console.log(`   📦 Аргументы:`, JSON.stringify(args, null, 2));

          // Show what would happen
          console.log('\n💭 Что произойдёт:');
          switch (call.function.name) {
            case 'addProduct':
              console.log(`   → Будет добавлен товар "${args.name}" за $${args.price}`);
              break;
            case 'deleteProduct':
              console.log(`   → Будет удалён товар "${args.productName}"`);
              break;
            case 'updateProduct':
              console.log(`   → Товар "${args.productName}" будет изменён:`);
              console.log(`      ${JSON.stringify(args.updates, null, 2)}`);
              break;
            case 'recordSale':
              console.log(`   → Продажа: ${args.quantity || 1} шт "${args.productName}"`);
              break;
            case 'bulkDeleteByNames':
              console.log(`   → Удаление ${args.productNames.length} товаров: ${args.productNames.join(', ')}`);
              break;
            case 'bulkDeleteAll':
              console.log(`   → Будут удалены ВСЕ ${products.length} товаров!`);
              break;
            default:
              console.log(`   → Функция ${call.function.name}`);
          }
        } catch (e) {
          console.log(`   ⚠️ Ошибка парсинга: ${e.message}`);
        }
      } else if (message.content) {
        console.log('💬 AI ответил текстом:');
        console.log(`   "${message.content}"`);
      } else {
        console.log('⚠️ AI вернул пустой ответ');
      }

      console.log(`\n📊 Токены: ${response.usage.total_tokens} (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens})`);
      console.log('='.repeat(60) + '\n');

    } catch (error) {
      console.error('\n❌ Ошибка:', error.message);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n👋 Bye!');
    process.exit(0);
  });
}

// Check API key
if (!process.env.DEEPSEEK_API_KEY) {
  console.error('❌ DEEPSEEK_API_KEY not found in .env');
  process.exit(1);
}

interactiveTest().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
