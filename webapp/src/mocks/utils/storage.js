// In-memory storage for mutations in mock mode
let mockStorage = {
  shops: [],
  products: [],
  orders: [],
  wallets: [],
  workers: [],
  follows: [],
};

// ===== AUTH =====
export const getAuthUserId = () => {
  // Mock Telegram user ID (buyer_test1)
  return 2;
};

// ===== SHOPS =====
export const addShop = (shop) => {
  mockStorage.shops.push(shop);
  return shop;
};

export const updateShop = (shop) => {
  const index = mockStorage.shops.findIndex((s) => s.id === shop.id);
  if (index !== -1) {
    mockStorage.shops[index] = shop;
  }
  return shop;
};

export const getShops = () => mockStorage.shops;

// ===== PRODUCTS =====
export const addProduct = (product) => {
  mockStorage.products.push(product);
  return product;
};

export const updateProduct = (product) => {
  const index = mockStorage.products.findIndex((p) => p.id === product.id);
  if (index !== -1) {
    mockStorage.products[index] = product;
  }
  return product;
};

export const deleteProduct = (productId) => {
  const index = mockStorage.products.findIndex((p) => p.id === productId);
  if (index !== -1) {
    mockStorage.products[index] = {
      ...mockStorage.products[index],
      is_active: false,
    };
  }
};

export const getProducts = () => mockStorage.products;

// ===== ORDERS =====
export const addOrder = (order) => {
  mockStorage.orders.push(order);
  return order;
};

export const updateOrder = (order) => {
  const index = mockStorage.orders.findIndex((o) => o.id === order.id);
  if (index !== -1) {
    mockStorage.orders[index] = order;
  }
  return order;
};

export const getOrders = () => mockStorage.orders;

// ===== WALLETS =====
export const getWallets = () => mockStorage.wallets;

export const addWallet = (wallet) => {
  mockStorage.wallets.push(wallet);
  return wallet;
};

export const updateWallet = (wallet) => {
  const index = mockStorage.wallets.findIndex((w) => w.id === wallet.id);
  if (index !== -1) {
    mockStorage.wallets[index] = wallet;
  }
  return wallet;
};

export const removeWallet = (address) => {
  mockStorage.wallets = mockStorage.wallets.filter((w) => w.address !== address);
};

// ===== WORKERS =====
export const getWorkers = () => mockStorage.workers;

export const addWorker = (worker) => {
  mockStorage.workers.push(worker);
  return worker;
};

export const removeWorker = (id) => {
  mockStorage.workers = mockStorage.workers.filter((w) => w.id !== id);
};

// ===== FOLLOWS =====
export const addFollow = (follow) => {
  mockStorage.follows.push(follow);
  return follow;
};

export const updateFollow = (follow) => {
  const index = mockStorage.follows.findIndex((f) => f.id === follow.id);
  if (index !== -1) {
    mockStorage.follows[index] = follow;
  }
  return follow;
};

export const deleteFollow = (followId) => {
  mockStorage.follows = mockStorage.follows.filter((f) => f.id !== followId);
};

export const deleteFollowById = (id) => {
  mockStorage.follows = mockStorage.follows.filter((f) => f.id !== id);
};

export const getFollows = () => mockStorage.follows;

// ===== RESET =====
export const resetStorage = () => {
  mockStorage = {
    shops: [],
    products: [],
    orders: [],
    wallets: [],
    workers: [],
    follows: [],
  };
};

// ===== EXPORT STORAGE (for direct access in handlers) =====
export const storage = {
  addShop,
  updateShop,
  getShops,
  addProduct,
  updateProduct,
  deleteProduct,
  getProducts,
  addOrder,
  updateOrder,
  getOrders,
  addWallet,
  updateWallet,
  removeWallet,
  getWallets,
  addWorker,
  removeWorker,
  getWorkers,
  addFollow,
  updateFollow,
  deleteFollow,
  deleteFollowById,
  getFollows,
  resetStorage,
  getAuthUserId,
};
