/**
 * Test Shop Data Fixtures
 */

export const testShops = {
  active: {
    id: 1,
    name: 'Test Electronics',
    description: 'Test electronics shop',
    ownerId: 222222,
    isActive: true,
    wallet_btc: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    wallet_eth: '0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1',
    wallet_usdt: null,
    wallet_ton: null,
    seller_username: 'test_seller',
    seller_first_name: 'Test'
  },

  inactive: {
    id: 2,
    name: 'Pending Shop',
    description: 'Not yet activated',
    ownerId: 222222,
    isActive: false,
    wallet_btc: null,
    wallet_eth: null,
    wallet_usdt: null,
    wallet_ton: null
  }
};

export const testProducts = {
  inStock: {
    id: 1,
    shopId: 1,
    name: 'iPhone 15 Pro',
    description: 'Latest iPhone',
    price: 999.99,
    stock: 10,
    isActive: true
  },

  outOfStock: {
    id: 2,
    shopId: 1,
    name: 'MacBook Pro',
    description: 'Out of stock',
    price: 2499.99,
    stock: 0,
    isActive: true
  }
};

export const testOrders = {
  pending: {
    id: 1,
    shopId: 1,
    buyerId: 111111,
    totalAmount: 999.99,
    status: 'pending',
    items: [
      {
        productId: 1,
        quantity: 1,
        price: 999.99
      }
    ]
  }
};
