/**
 * REAL AI FUNCTIONS TEST
 * Проверяет ВСЕ AI функции через настоящий API + БД (не моки!)
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { processProductCommand } from '../../src/services/productAI.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const API_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const TEST_USER_ID = 999999;
const TEST_TELEGRAM_ID = '999999';

// Создать axios клиент
const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
});

let testToken = null;
let testShop = null;
const createdProductIds = [];

// Утилиты
async function authenticateTestUser() {
  try {
    const { data } = await api.post('/auth/register', {
      telegramId: TEST_TELEGRAM_ID,
      username: 'ai_test_user',
      firstName: 'AI',
      lastName: 'Test',
    });
    testToken = data.data?.token || data.token;
    console.log('✅ Test user authenticated');
    return testToken;
  } catch (error) {
    console.error('❌ Auth failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createTestShop() {
  try {
    // Попробовать получить существующий магазин
    const { data: shopsData } = await api.get('/shops/my', {
      headers: { Authorization: `Bearer ${testToken}` },
    });

    if (shopsData.data && shopsData.data.length > 0) {
      testShop = shopsData.data[0];
      console.log('✅ Using existing shop:', testShop.id);
      return testShop;
    }

    // Если нет магазина, создать новый
    const { data } = await api.post(
      '/shops',
      {
        name: 'AI_Test_Shop',
        description: 'Real integration test shop',
      },
      {
        headers: { Authorization: `Bearer ${testToken}` },
      }
    );
    testShop = data.data || data;
    console.log('✅ Test shop created:', testShop.id);
    return testShop;
  } catch (error) {
    console.error('❌ Shop creation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function getProductsFromDB() {
  try {
    const { data } = await api.get('/products', {
      params: { shopId: testShop.id },
    });
    return data.data || data;
  } catch (error) {
    console.error('❌ Get products failed:', error.response?.data || error.message);
    return [];
  }
}

async function cleanup() {
  try {
    // Удалить все товары тестового магазина
    if (testShop && testToken) {
      await api.post(
        '/products/bulk-delete-all',
        { shopId: testShop.id },
        { headers: { Authorization: `Bearer ${testToken}` } }
      );
    }
    console.log('🧹 Cleanup completed');
  } catch (error) {
    console.log('⚠️ Cleanup warning:', error.message);
  }
}

// Mock context для processProductCommand
function createMockContext() {
  return {
    from: { id: TEST_USER_ID },
    chat: { id: TEST_USER_ID },
    session: {
      shopId: testShop.id,
      token: testToken,
      role: 'seller',
    },
    sendChatAction: () => Promise.resolve(true),
    telegram: {
      editMessageText: () =>
        Promise.resolve({ message_id: 123, chat: { id: TEST_USER_ID }, text: '' }),
      deleteMessage: () => Promise.resolve(true),
    },
  };
}

// Тестовые функции
async function testAddProduct() {
  console.log('\n📂 TEST 1: Add Product');
  const ctx = createMockContext();
  let products = await getProductsFromDB();

  try {
    const _result = await processProductCommand('добавь iPhone 999', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const iphone = products.find((p) => p.name.includes('iPhone'));

    if (iphone && iphone.price === 999) {
      console.log('✅ PASS: iPhone added with price 999');
      createdProductIds.push(iphone.id);
      return { pass: true, productId: iphone.id };
    } else {
      console.log('❌ FAIL: iPhone not found or wrong price');
      console.log(
        '   DB products:',
        products.map((p) => `${p.name}: $${p.price}`)
      );
      return { pass: false, error: 'Product not in DB' };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

async function testUpdatePrice() {
  console.log('\n📂 TEST 2: Update Price');
  const ctx = createMockContext();
  let products = await getProductsFromDB();

  try {
    await processProductCommand('смени цену iPhone на 899', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const iphone = products.find((p) => p.name.includes('iPhone'));

    if (iphone && iphone.price === 899) {
      console.log('✅ PASS: Price changed to 899');
      return { pass: true };
    } else {
      console.log('❌ FAIL: Price not changed');
      console.log('   Current price:', iphone?.price);
      return { pass: false, error: `Expected 899, got ${iphone?.price}` };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

async function testUpdateStock() {
  console.log('\n📂 TEST 3: Update Stock (CRITICAL - твоя ошибка)');
  const ctx = createMockContext();
  let products = await getProductsFromDB();

  try {
    await processProductCommand('установи остаток iPhone в 100', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const iphone = products.find((p) => p.name.includes('iPhone'));

    if (iphone && iphone.stock_quantity === 100) {
      console.log('✅ PASS: Stock changed to 100');
      return { pass: true };
    } else {
      console.log('❌ FAIL: Stock not changed');
      console.log('   Current stock:', iphone?.stock_quantity);
      return { pass: false, error: `Expected 100, got ${iphone?.stock_quantity}` };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

async function testApplyDiscount() {
  console.log('\n📂 TEST 4: Apply Permanent Discount');
  const ctx = createMockContext();

  // Сначала добавить MacBook
  let products = await getProductsFromDB();
  await processProductCommand('добавь MacBook 2499', {
    shopId: testShop.id,
    shopName: testShop.name,
    token: testToken,
    products,
    ctx,
  });

  try {
    products = await getProductsFromDB();
    await processProductCommand('скидка 30% на MacBook', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const macbook = products.find((p) => p.name.includes('MacBook'));

    if (macbook && macbook.discount_percentage === 30 && !macbook.discount_expires_at) {
      console.log('✅ PASS: 30% discount applied, permanent');
      return { pass: true };
    } else {
      console.log('❌ FAIL: Discount not applied correctly');
      console.log('   Discount:', macbook?.discount_percentage);
      console.log('   Expires:', macbook?.discount_expires_at);
      return { pass: false, error: 'Discount incorrect' };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

async function testApplyDiscountWithTimer() {
  console.log('\n📂 TEST 5: Apply Discount With Timer');
  const ctx = createMockContext();

  // Добавить AirPods
  let products = await getProductsFromDB();
  await processProductCommand('добавь AirPods 249', {
    shopId: testShop.id,
    shopName: testShop.name,
    token: testToken,
    products,
    ctx,
  });

  try {
    products = await getProductsFromDB();
    await processProductCommand('скидка 20% на AirPods на 6 часов', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const airpods = products.find((p) => p.name.includes('AirPods'));

    if (airpods && airpods.discount_percentage === 20 && airpods.discount_expires_at) {
      console.log('✅ PASS: 20% discount with timer applied');
      return { pass: true };
    } else {
      console.log('❌ FAIL: Timer discount not applied');
      console.log('   Discount:', airpods?.discount_percentage);
      console.log('   Expires:', airpods?.discount_expires_at);
      return { pass: false, error: 'Timer discount incorrect' };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

async function testRemoveDiscount() {
  console.log('\n📂 TEST 6: Remove Discount');
  const ctx = createMockContext();

  try {
    let products = await getProductsFromDB();
    await processProductCommand('убери скидку с MacBook', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const macbook = products.find((p) => p.name.includes('MacBook'));

    if (macbook && macbook.discount_percentage === 0) {
      console.log('✅ PASS: Discount removed');
      return { pass: true };
    } else {
      console.log('❌ FAIL: Discount still present');
      console.log('   Discount:', macbook?.discount_percentage);
      return { pass: false, error: 'Discount not removed' };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

async function testBulkAdd() {
  console.log('\n📂 TEST 7: Bulk Add Products');
  const ctx = createMockContext();

  try {
    let products = await getProductsFromDB();
    await processProductCommand('добавь: Чехол 20 5шт, Зарядка 30', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const case_item = products.find((p) => p.name.includes('Чехол'));
    const charger = products.find((p) => p.name.includes('Зарядка'));

    if (case_item && charger && case_item.stock_quantity === 5) {
      console.log('✅ PASS: 2 products added with correct stock');
      return { pass: true };
    } else {
      console.log('❌ FAIL: Bulk add failed');
      console.log(
        '   Products:',
        products.map((p) => p.name)
      );
      return { pass: false, error: 'Products not added' };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

async function testBulkDiscount() {
  console.log('\n📂 TEST 8: Bulk Discount (all except iPhone)');
  const ctx = createMockContext();

  try {
    let products = await getProductsFromDB();
    await processProductCommand('скидка 15% на всё кроме iPhone', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const iphone = products.find((p) => p.name.includes('iPhone'));
    const others = products.filter((p) => !p.name.includes('iPhone'));

    const allOthersHaveDiscount = others.every((p) => p.discount_percentage === 15);
    const iphoneNoDiscount = iphone ? iphone.discount_percentage === 0 : true;

    if (allOthersHaveDiscount && iphoneNoDiscount) {
      console.log('✅ PASS: Bulk discount applied except iPhone');
      return { pass: true };
    } else {
      console.log('❌ FAIL: Bulk discount incorrect');
      console.log(
        '   Products:',
        products.map((p) => `${p.name}: ${p.discount_percentage}%`)
      );
      return { pass: false, error: 'Bulk discount failed' };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

async function testBulkDeleteByNames() {
  console.log('\n📂 TEST 9: Bulk Delete By Names (ИСПРАВЛЕНО)');
  const ctx = createMockContext();

  try {
    let products = await getProductsFromDB();
    await processProductCommand('удали MacBook и AirPods', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const macbook = products.find((p) => p.name.includes('MacBook'));
    const airpods = products.find((p) => p.name.includes('AirPods'));

    if (!macbook && !airpods) {
      console.log('✅ PASS: MacBook and AirPods deleted');
      return { pass: true };
    } else {
      console.log('❌ FAIL: Products not deleted');
      console.log(
        '   Remaining:',
        products.map((p) => p.name)
      );
      return { pass: false, error: 'Bulk delete failed' };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

async function testBulkDeleteExcept() {
  console.log('\n📂 TEST 10: Bulk Delete Except (ИСПРАВЛЕНО)');
  const ctx = createMockContext();

  try {
    let products = await getProductsFromDB();
    await processProductCommand('удали всё кроме Чехол', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const onlyCase = products.length === 1 && products[0].name.includes('Чехол');

    if (onlyCase) {
      console.log('✅ PASS: All deleted except Чехол');
      return { pass: true };
    } else {
      console.log('❌ FAIL: Wrong products deleted');
      console.log(
        '   Remaining:',
        products.map((p) => p.name)
      );
      return { pass: false, error: 'Bulk delete except failed' };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

async function testRecordSale() {
  console.log('\n📂 TEST 11: Record Sale');
  const ctx = createMockContext();

  try {
    // Получить текущий stock
    let products = await getProductsFromDB();
    const case_before = products.find((p) => p.name.includes('Чехол'));
    const stockBefore = case_before.stock_quantity;

    await processProductCommand('купили 2 Чехол', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const case_after = products.find((p) => p.name.includes('Чехол'));
    const stockAfter = case_after.stock_quantity;

    if (stockAfter === stockBefore - 2) {
      console.log('✅ PASS: Stock decreased by 2');
      return { pass: true };
    } else {
      console.log('❌ FAIL: Stock not decreased');
      console.log(`   Before: ${stockBefore}, After: ${stockAfter}`);
      return { pass: false, error: 'Sale not recorded' };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

async function testDeleteProduct() {
  console.log('\n📂 TEST 12: Delete Product');
  const ctx = createMockContext();

  try {
    let products = await getProductsFromDB();
    await processProductCommand('удали Чехол', {
      shopId: testShop.id,
      shopName: testShop.name,
      token: testToken,
      products,
      ctx,
    });

    products = await getProductsFromDB();
    const case_item = products.find((p) => p.name.includes('Чехол'));

    if (!case_item) {
      console.log('✅ PASS: Чехол deleted');
      return { pass: true };
    } else {
      console.log('❌ FAIL: Product not deleted');
      return { pass: false, error: 'Delete failed' };
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    return { pass: false, error: error.message };
  }
}

// MAIN TEST RUNNER
async function runAllTests() {
  console.log('🚀 REAL AI FUNCTIONS TEST');
  console.log('Testing with REAL API + Database (not mocks!)\n');

  const results = [];

  try {
    // Setup
    console.log('📋 Setup...');
    await authenticateTestUser();
    await createTestShop();

    // Run tests
    results.push({ name: 'Add Product', ...(await testAddProduct()) });
    results.push({ name: 'Update Price', ...(await testUpdatePrice()) });
    results.push({ name: 'Update Stock', ...(await testUpdateStock()) });
    results.push({ name: 'Apply Discount', ...(await testApplyDiscount()) });
    results.push({ name: 'Apply Discount Timer', ...(await testApplyDiscountWithTimer()) });
    results.push({ name: 'Remove Discount', ...(await testRemoveDiscount()) });
    results.push({ name: 'Bulk Add', ...(await testBulkAdd()) });
    results.push({ name: 'Bulk Discount', ...(await testBulkDiscount()) });
    results.push({ name: 'Bulk Delete Names', ...(await testBulkDeleteByNames()) });
    results.push({ name: 'Bulk Delete Except', ...(await testBulkDeleteExcept()) });
    results.push({ name: 'Record Sale', ...(await testRecordSale()) });
    results.push({ name: 'Delete Product', ...(await testDeleteProduct()) });
  } finally {
    await cleanup();
  }

  // Report
  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(70));

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`✅ PASS: ${passed}/12`);
  console.log(`❌ FAIL: ${failed}/12`);
  console.log(`📈 Success Rate: ${((passed / 12) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results
      .filter((r) => !r.pass)
      .forEach((r) => {
        console.log(`   - ${r.name}: ${r.error}`);
      });
  }

  console.log('='.repeat(70));

  if (passed === 12) {
    console.log('\n🎉 ALL TESTS PASSED! AI functions работают идеально!\n');
    process.exit(0);
  } else {
    console.log('\n⚠️ Some tests failed. Fix needed.\n');
    process.exit(1);
  }
}

runAllTests();
