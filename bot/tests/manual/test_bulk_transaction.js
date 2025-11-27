/**
 * Manual test for bulkUpdateProducts transaction behavior
 *
 * Tests:
 * 1. Success case - all products updated atomically
 * 2. Failure case - transaction rollback on error
 */

import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

// Test user credentials (adjust based on your dev setup)
const TEST_USER = {
  telegramId: 123456789,
  username: 'test_seller',
};

async function login() {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      telegramId: TEST_USER.telegramId,
      username: TEST_USER.username,
    });
    return response.data.token;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function getProducts(token) {
  try {
    const response = await axios.get(`${API_URL}/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data.data;
  } catch (error) {
    console.error('❌ Get products failed:', error.response?.data || error.message);
    throw error;
  }
}

async function bulkUpdate(token, updates) {
  try {
    const response = await axios.post(
      `${API_URL}/products/bulk-update`,
      { updates },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    console.error('❌ Bulk update failed:', error.response?.data || error.message);
    return error.response?.data;
  }
}

async function testSuccessCase(token, products) {
  console.log('\n📝 TEST 1: Success case - all valid updates');
  console.log('='.repeat(60));

  const updates = products.slice(0, 3).map((p) => ({
    productId: p.id,
    updates: {
      price: parseFloat(p.price) + 10,
      stockQuantity: (p.stock_quantity || 0) + 5,
    },
  }));

  console.log(`Updating ${updates.length} products...`);
  const result = await bulkUpdate(token, updates);

  if (result.success) {
    console.log('✅ SUCCESS: Transaction committed');
    console.log(`   - Updated: ${result.data.updated}`);
    console.log(`   - Failed: ${result.data.failed}`);
  } else {
    console.log('❌ FAILED:', result.error);
  }

  return result;
}

async function testFailureCase(token, products) {
  console.log('\n📝 TEST 2: Failure case - invalid productId (should rollback)');
  console.log('='.repeat(60));

  const updates = [
    {
      productId: products[0].id,
      updates: { price: 100 },
    },
    {
      productId: 999999, // Invalid ID - should trigger rollback
      updates: { price: 200 },
    },
    {
      productId: products[1].id,
      updates: { price: 300 },
    },
  ];

  console.log('Attempting to update 3 products (1 invalid)...');
  const productsBefore = await getProducts(token);
  const product0Before = productsBefore.find((p) => p.id === products[0].id);
  const product1Before = productsBefore.find((p) => p.id === products[1].id);

  const result = await bulkUpdate(token, updates);

  const productsAfter = await getProducts(token);
  const product0After = productsAfter.find((p) => p.id === products[0].id);
  const product1After = productsAfter.find((p) => p.id === products[1].id);

  console.log('\nExpected: Transaction rolled back (no products updated)');
  console.log(`Product ${products[0].id} price: ${product0Before.price} → ${product0After.price}`);
  console.log(`Product ${products[1].id} price: ${product1Before.price} → ${product1After.price}`);

  const noChanges =
    parseFloat(product0Before.price) === parseFloat(product0After.price) &&
    parseFloat(product1Before.price) === parseFloat(product1After.price);

  if (noChanges) {
    console.log('✅ SUCCESS: Transaction rolled back correctly (no partial updates)');
  } else {
    console.log('❌ FAILURE: Partial updates detected! Transaction did NOT rollback');
  }

  if (result.error && result.error.includes('Product not found')) {
    console.log('✅ Error message is informative:', result.error);
  } else {
    console.log('⚠️  Error message:', result.error);
  }

  return { result, noChanges };
}

async function testAccessDenied(token, products) {
  console.log('\n📝 TEST 3: Authorization failure (should rollback)');
  console.log('='.repeat(60));

  // Assuming product belongs to different shop
  const _updates = [
    {
      productId: products[0].id,
      updates: { price: 100 },
    },
  ];

  console.log('Note: This test requires products from different shops');
  console.log('Skipping for now...\n');
}

async function main() {
  console.log('🚀 Testing bulkUpdateProducts transaction behavior\n');

  try {
    // Login
    console.log('🔐 Logging in...');
    const token = await login();
    console.log('✅ Logged in successfully\n');

    // Get products
    console.log('📦 Fetching products...');
    const products = await getProducts(token);
    console.log(`✅ Found ${products.length} products\n`);

    if (products.length < 2) {
      console.error('❌ Need at least 2 products to run tests');
      process.exit(1);
    }

    // Run tests
    await testSuccessCase(token, products);
    await testFailureCase(token, products);
    await testAccessDenied(token, products);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

main();
