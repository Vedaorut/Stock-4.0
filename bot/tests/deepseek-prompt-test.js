/**
 * DeepSeek Prompt Testing Script
 * Tests all command types with real DeepSeek API calls
 *
 * Usage: node tests/deepseek-prompt-test.js
 */

import { deepseek } from '../src/services/deepseek.js';
import { generateProductAIPrompt, sanitizeUserInput } from '../src/utils/systemPrompts.js';
import { productTools } from '../src/tools/productTools.js';

// Mock shop context
const mockShop = {
  name: 'Тестовый Магазин',
  products: [
    { id: 1, name: 'iPhone 14', price: 799, stock_quantity: 5 },
    { id: 2, name: 'iPhone 15', price: 999, stock_quantity: 3 },
    { id: 3, name: 'Samsung Galaxy S23', price: 799, stock_quantity: 8 },
    { id: 4, name: 'MacBook Pro M3', price: 1999, stock_quantity: 2 }
  ]
};

// Test cases organized by category
const testCases = {
  basicCRUD: [
    { cmd: 'добавь iPhone 15 за 50000₽ количество 10', expected: 'addProduct', description: 'Add product with RUB currency and stock' },
    { cmd: 'добавь AirPods Pro за $249', expected: 'addProduct', description: 'Add product with USD symbol' },
    { cmd: 'удали iPhone', expected: 'searchProduct', description: 'Delete ambiguous product (2 iPhones)' },
    { cmd: 'удали MacBook', expected: 'deleteProduct', description: 'Delete unique product' },
    { cmd: 'покажи все товары', expected: 'listProducts', description: 'List all products' }
  ],

  bulkOperations: [
    { cmd: 'добавь 3 товара: iPhone 500$, Samsung 400$, Xiaomi 300$', expected: 'addProduct', description: 'Bulk add (should add first)' },
    { cmd: 'удали iPhone и Samsung', expected: 'deleteProduct', description: 'Bulk delete (should handle first)' }
  ],

  updates: [
    { cmd: 'смени цену iPhone на 45000₽', expected: 'searchProduct', description: 'Update price (no update tool yet)' },
    { cmd: 'смени название iPhone на iPhone 15 Pro', expected: 'searchProduct', description: 'Update name (no update tool yet)' },
    { cmd: 'обнови iPhone: цена 48000₽, количество 5', expected: 'searchProduct', description: 'Multi-field update (no update tool yet)' }
  ],

  queries: [
    { cmd: 'какие товары есть?', expected: 'listProducts', description: 'Natural query for list' },
    { cmd: 'какая цена у iPhone?', expected: 'searchProduct', description: 'Price query' },
    { cmd: 'сколько осталось MacBook?', expected: 'searchProduct', description: 'Stock query' },
    { cmd: 'есть ли Samsung?', expected: 'searchProduct', description: 'Availability query' }
  ],

  salesTracking: [
    { cmd: 'купили 2 штуки iPhone', expected: 'searchProduct', description: 'Sale tracking (no updateStock tool yet)' },
    { cmd: 'продано 5 Samsung Galaxy', expected: 'searchProduct', description: 'Sale tracking by name' }
  ],

  noiseFiltering: [
    { cmd: 'привет ты тут?', expected: 'text_response', description: 'Greeting (should not call tool)' },
    { cmd: 'спасибо', expected: 'text_response', description: 'Thank you (should not call tool)' },
    { cmd: 'как дела?', expected: 'text_response', description: 'Small talk (should not call tool)' }
  ],

  edgeCases: [
    { cmd: 'добавь   ', expected: 'text_response', description: 'Empty command after sanitization' },
    { cmd: 'удали несуществующий товар', expected: 'deleteProduct', description: 'Delete non-existent product' },
    { cmd: 'iPhone', expected: 'searchProduct', description: 'Single word - search intent' },
    { cmd: 'add iphone for $1000 stock 5', expected: 'addProduct', description: 'English command' },
    { cmd: 'list products', expected: 'listProducts', description: 'English list command' }
  ]
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Test result statistics
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: 0,
  totalLatency: 0,
  totalTokens: 0,
  totalCost: 0,
  cacheHits: 0
};

/**
 * Run a single test case
 */
async function runTest(testCase, categoryName) {
  const { cmd, expected, description } = testCase;
  stats.total++;

  console.log(`\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.cyan}Test:${colors.reset} ${description}`);
  console.log(`${colors.gray}Command:${colors.reset} "${cmd}"`);
  console.log(`${colors.gray}Expected:${colors.reset} ${expected}`);

  try {
    // Sanitize input
    const sanitized = sanitizeUserInput(cmd);

    // Generate prompt
    const systemPrompt = generateProductAIPrompt(mockShop.name, mockShop.products);

    // Call DeepSeek API
    const startTime = Date.now();
    const response = await deepseek.chat(systemPrompt, sanitized, productTools);
    const latency = Date.now() - startTime;

    // Parse response
    const choice = response.choices[0];
    const finishReason = choice.finish_reason;
    const usage = response.usage;

    let actual = 'text_response';
    let functionArgs = null;

    if (finishReason === 'tool_calls' && choice.message.tool_calls) {
      const toolCall = choice.message.tool_calls[0];
      actual = toolCall.function.name;
      functionArgs = JSON.parse(toolCall.function.arguments);
    } else {
      actual = 'text_response';
    }

    // Calculate cost
    const cacheHit = (usage?.prompt_cache_hit_tokens || 0) > 0;
    const cost = deepseek.calculateCost(
      usage?.prompt_tokens || 0,
      usage?.completion_tokens || 0,
      cacheHit
    );

    // Update stats
    stats.totalLatency += latency;
    stats.totalTokens += usage?.total_tokens || 0;
    stats.totalCost += cost;
    if (cacheHit) stats.cacheHits++;

    // Check if test passed
    const passed = actual === expected;
    if (passed) {
      stats.passed++;
      console.log(`${colors.green}✓ PASS${colors.reset}`);
    } else {
      stats.failed++;
      console.log(`${colors.red}✗ FAIL${colors.reset}`);
      console.log(`${colors.red}  Expected: ${expected}, Got: ${actual}${colors.reset}`);
    }

    // Print response details
    console.log(`${colors.gray}Function Called:${colors.reset} ${actual}`);
    if (functionArgs) {
      console.log(`${colors.gray}Arguments:${colors.reset} ${JSON.stringify(functionArgs, null, 2)}`);
    }
    if (choice.message.content) {
      console.log(`${colors.gray}AI Message:${colors.reset} ${choice.message.content}`);
    }

    // Print metrics
    console.log(`${colors.gray}Metrics:${colors.reset}`);
    console.log(`  - Latency: ${latency}ms`);
    console.log(`  - Tokens: ${usage?.total_tokens} (prompt: ${usage?.prompt_tokens}, completion: ${usage?.completion_tokens})`);
    console.log(`  - Cache: ${cacheHit ? colors.green + 'HIT' : 'MISS'}${colors.reset} (hit: ${usage?.prompt_cache_hit_tokens || 0}, miss: ${usage?.prompt_cache_miss_tokens || 0})`);
    console.log(`  - Cost: $${cost.toFixed(6)}`);

    return { passed, actual, functionArgs, latency, usage, cost, cacheHit };

  } catch (error) {
    stats.errors++;
    console.log(`${colors.red}✗ ERROR${colors.reset}`);
    console.log(`${colors.red}Error:${colors.reset} ${error.message}`);
    if (error.status) {
      console.log(`${colors.red}Status:${colors.reset} ${error.status}`);
    }
    return { passed: false, error: error.message };
  }
}

/**
 * Run all tests in a category
 */
async function runCategory(categoryName, tests) {
  console.log(`\n${colors.yellow}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.yellow}Category: ${categoryName.toUpperCase()}${colors.reset}`);
  console.log(`${colors.yellow}${'='.repeat(60)}${colors.reset}`);

  const results = [];
  for (const testCase of tests) {
    const result = await runTest(testCase, categoryName);
    results.push({ testCase, result });

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}

/**
 * Print final summary
 */
function printSummary(allResults) {
  console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}FINAL SUMMARY${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);

  // Overall stats
  const passRate = ((stats.passed / stats.total) * 100).toFixed(1);
  const avgLatency = (stats.totalLatency / stats.total).toFixed(0);
  const avgTokens = Math.round(stats.totalTokens / stats.total);
  const cacheHitRate = ((stats.cacheHits / stats.total) * 100).toFixed(1);

  console.log(`${colors.cyan}Tests Run:${colors.reset} ${stats.total}`);
  console.log(`${colors.green}Passed:${colors.reset} ${stats.passed} (${passRate}%)`);
  console.log(`${colors.red}Failed:${colors.reset} ${stats.failed}`);
  console.log(`${colors.red}Errors:${colors.reset} ${stats.errors}`);
  console.log();
  console.log(`${colors.cyan}Performance:${colors.reset}`);
  console.log(`  - Avg Latency: ${avgLatency}ms`);
  console.log(`  - Avg Tokens: ${avgTokens}`);
  console.log(`  - Total Cost: $${stats.totalCost.toFixed(4)}`);
  console.log(`  - Cache Hit Rate: ${cacheHitRate}%`);

  // Category breakdown
  console.log(`\n${colors.cyan}Category Breakdown:${colors.reset}`);
  const categoryStats = {};

  for (const [categoryName, results] of Object.entries(allResults)) {
    const passed = results.filter(r => r.result.passed).length;
    const total = results.length;
    const rate = ((passed / total) * 100).toFixed(0);

    categoryStats[categoryName] = { passed, total, rate };

    const statusColor = rate >= 80 ? colors.green : rate >= 50 ? colors.yellow : colors.red;
    console.log(`  ${categoryName}: ${statusColor}${passed}/${total} (${rate}%)${colors.reset}`);
  }

  // Failed tests details
  const failedTests = [];
  for (const [categoryName, results] of Object.entries(allResults)) {
    for (const { testCase, result } of results) {
      if (!result.passed) {
        failedTests.push({ categoryName, testCase, result });
      }
    }
  }

  if (failedTests.length > 0) {
    console.log(`\n${colors.red}Failed/Error Tests:${colors.reset}`);
    failedTests.forEach(({ categoryName, testCase, result }) => {
      console.log(`  ${colors.red}✗${colors.reset} [${categoryName}] ${testCase.description}`);
      console.log(`    Command: "${testCase.cmd}"`);
      console.log(`    Expected: ${testCase.expected}, Got: ${result.actual || 'ERROR'}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
    });
  }

  // Recommendations
  console.log(`\n${colors.cyan}Recommendations:${colors.reset}`);

  if (categoryStats.updates.rate < 50) {
    console.log(`  ${colors.yellow}!${colors.reset} Add updateProduct and updateStock tools for better update handling`);
  }

  if (categoryStats.bulkOperations.rate < 50) {
    console.log(`  ${colors.yellow}!${colors.reset} Add bulk operation tools (deleteMultiple, addMultiple)`);
  }

  if (categoryStats.salesTracking.rate < 50) {
    console.log(`  ${colors.yellow}!${colors.reset} Add recordSale tool for sales tracking`);
  }

  if (avgLatency > 2000) {
    console.log(`  ${colors.yellow}!${colors.reset} Latency is high (>${avgLatency}ms). Consider optimizing prompts or model.`);
  }

  if (cacheHitRate < 50) {
    console.log(`  ${colors.yellow}!${colors.reset} Low cache hit rate (${cacheHitRate}%). Ensure system prompts are consistent.`);
  }

  if (passRate >= 80) {
    console.log(`  ${colors.green}✓${colors.reset} Overall performance is good (${passRate}% pass rate)`);
  } else if (passRate >= 60) {
    console.log(`  ${colors.yellow}!${colors.reset} Performance is moderate (${passRate}% pass rate). Review failed tests.`);
  } else {
    console.log(`  ${colors.red}✗${colors.reset} Performance is poor (${passRate}% pass rate). Prompts need major improvements.`);
  }

  console.log();
}

/**
 * Main test runner
 */
async function main() {
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}DeepSeek Prompt Testing Suite${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.gray}Testing AI product management with real DeepSeek API${colors.reset}`);
  console.log(`${colors.gray}Shop: ${mockShop.name}${colors.reset}`);
  console.log(`${colors.gray}Products: ${mockShop.products.length}${colors.reset}\n`);

  // Check if API is available
  if (!deepseek.isAvailable()) {
    console.log(`${colors.red}✗ DeepSeek API not configured!${colors.reset}`);
    console.log(`${colors.red}Set DEEPSEEK_API_KEY in .env file${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.green}✓ DeepSeek API is configured${colors.reset}`);

  // Run all test categories
  const allResults = {};

  for (const [categoryName, tests] of Object.entries(testCases)) {
    const results = await runCategory(categoryName, tests);
    allResults[categoryName] = results;
  }

  // Print summary
  printSummary(allResults);

  // Exit with appropriate code
  const exitCode = stats.failed === 0 && stats.errors === 0 ? 0 : 1;
  process.exit(exitCode);
}

// Run tests
main().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
