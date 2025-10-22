/**
 * Test User Data Fixtures
 */

export const testUsers = {
  buyer: {
    id: 111111,
    telegramId: '111111',
    username: 'test_buyer',
    firstName: 'Test',
    lastName: 'Buyer',
    role: 'buyer'
  },

  seller: {
    id: 222222,
    telegramId: '222222',
    username: 'test_seller',
    firstName: 'Test',
    lastName: 'Seller',
    role: 'seller',
    shopId: 1,
    shopName: 'Test Shop'
  },

  admin: {
    id: 333333,
    telegramId: '333333',
    username: 'test_admin',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin'
  }
};

export const testTokens = {
  buyer: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTExMTExfQ.buyer_token',
  seller: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjIyMjIyfQ.seller_token',
  admin: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MzMzMzMzfQ.admin_token'
};
