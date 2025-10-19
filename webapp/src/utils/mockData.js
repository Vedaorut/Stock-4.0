/**
 * Тестовые данные для демонстрации UI
 */

export const mockShops = [
  {
    id: 1,
    name: 'TechStore Pro',
    description: 'Цифровые товары и софт',
    owner: 'techmaster',
    productsCount: 24,
    isActive: true,
    createdAt: '2024-01-15',
  },
  {
    id: 2,
    name: 'Digital Keys Hub',
    description: 'Лицензии Windows, Office, игры',
    owner: 'keyshop',
    productsCount: 18,
    isActive: true,
    createdAt: '2024-02-20',
  },
  {
    id: 3,
    name: 'GameStore Plus',
    description: 'Steam ключи, игровые аккаунты',
    owner: 'gamer_pro',
    productsCount: 32,
    isActive: true,
    createdAt: '2024-03-10',
  },
];

export const mockProducts = [
  // TechStore Pro (shopId: 1)
  {
    id: 1,
    shopId: 1,
    name: 'Windows 11 Pro',
    price: 2999,
    currency: 'USD',
    isAvailable: true,
    stock: 50,
    description: 'Лицензионный ключ Windows 11 Pro',
  },
  {
    id: 2,
    shopId: 1,
    name: 'Office 2021 Home & Business',
    price: 3499,
    currency: 'USD',
    isAvailable: true,
    stock: 30,
    description: 'Полный пакет Office 2021',
  },
  {
    id: 3,
    shopId: 1,
    name: 'Adobe Creative Cloud',
    price: 4999,
    currency: 'USD',
    isAvailable: true,
    stock: 15,
    description: 'Годовая подписка Creative Cloud',
  },
  {
    id: 4,
    shopId: 1,
    name: 'Windows 10 Home',
    price: 1999,
    currency: 'USD',
    isAvailable: true,
    stock: 100,
    description: 'Лицензионный ключ Windows 10 Home',
  },
  {
    id: 5,
    shopId: 1,
    name: 'Microsoft 365 Personal',
    price: 2499,
    currency: 'USD',
    isAvailable: true,
    stock: 45,
    description: 'Годовая подписка Microsoft 365',
  },
  {
    id: 6,
    shopId: 1,
    name: 'AutoCAD 2024',
    price: 8999,
    currency: 'USD',
    isAvailable: false,
    stock: 0,
    description: 'Профессиональный CAD софт',
  },

  // Digital Keys Hub (shopId: 2)
  {
    id: 7,
    shopId: 2,
    name: 'Spotify Premium 1 год',
    price: 1499,
    currency: 'USD',
    isAvailable: true,
    stock: 80,
    description: 'Премиум подписка Spotify',
  },
  {
    id: 8,
    shopId: 2,
    name: 'Netflix Premium 6 месяцев',
    price: 2999,
    currency: 'USD',
    isAvailable: true,
    stock: 25,
    description: 'Премиум аккаунт Netflix',
  },
  {
    id: 9,
    shopId: 2,
    name: 'YouTube Premium 1 год',
    price: 1799,
    currency: 'USD',
    isAvailable: true,
    stock: 60,
    description: 'Без рекламы и фоновое воспроизведение',
  },
  {
    id: 10,
    shopId: 2,
    name: 'ChatGPT Plus 1 месяц',
    price: 1999,
    currency: 'USD',
    isAvailable: true,
    stock: 40,
    description: 'Подписка ChatGPT Plus',
  },
  {
    id: 11,
    shopId: 2,
    name: 'Midjourney Pro',
    price: 2999,
    currency: 'USD',
    isAvailable: true,
    stock: 20,
    description: 'Генерация изображений AI',
  },
  {
    id: 12,
    shopId: 2,
    name: 'Canva Pro 1 год',
    price: 1299,
    currency: 'USD',
    isAvailable: true,
    stock: 55,
    description: 'Профессиональный дизайн-инструмент',
  },

  // GameStore Plus (shopId: 3)
  {
    id: 13,
    shopId: 3,
    name: 'Cyberpunk 2077',
    price: 1999,
    currency: 'USD',
    isAvailable: true,
    stock: 35,
    description: 'Steam ключ для популярной игры',
  },
  {
    id: 14,
    shopId: 3,
    name: 'Red Dead Redemption 2',
    price: 2499,
    currency: 'USD',
    isAvailable: true,
    stock: 28,
    description: 'Steam ключ RDR2',
  },
  {
    id: 15,
    shopId: 3,
    name: 'GTA V Premium Edition',
    price: 1499,
    currency: 'USD',
    isAvailable: true,
    stock: 50,
    description: 'Премиум издание GTA V',
  },
  {
    id: 16,
    shopId: 3,
    name: 'Elden Ring',
    price: 2999,
    currency: 'USD',
    isAvailable: true,
    stock: 22,
    description: 'Steam ключ Elden Ring',
  },
  {
    id: 17,
    shopId: 3,
    name: 'Hogwarts Legacy',
    price: 2799,
    currency: 'USD',
    isAvailable: true,
    stock: 18,
    description: 'Мир Гарри Поттера',
  },
  {
    id: 18,
    shopId: 3,
    name: 'Baldur\'s Gate 3',
    price: 2999,
    currency: 'USD',
    isAvailable: true,
    stock: 30,
    description: 'Лучшая RPG 2023 года',
  },
  {
    id: 19,
    shopId: 3,
    name: 'Counter-Strike 2 Skins',
    price: 499,
    currency: 'USD',
    isAvailable: true,
    stock: 100,
    description: 'Скины для CS2',
  },
  {
    id: 20,
    shopId: 3,
    name: 'Starfield Premium',
    price: 3499,
    currency: 'USD',
    isAvailable: false,
    stock: 0,
    description: 'Премиум издание Starfield',
  },
];

export const mockSubscriptions = [
  {
    id: 1,
    shopId: 1,
    shop: {
      ...mockShops[0],
      image: null,
    },
    subscribedAt: '2024-10-01',
  },
  {
    id: 2,
    shopId: 2,
    shop: {
      ...mockShops[1],
      image: null,
    },
    subscribedAt: '2024-10-10',
  },
];

export const mockUser = {
  id: 1,
  telegramId: 123456789,
  username: 'demo_user',
  createdAt: '2024-09-15',
};

// Функция для получения товаров магазина
export const getProductsByShopId = (shopId) => {
  return mockProducts.filter(product => product.shopId === shopId);
};

// Функция для получения магазина по ID
export const getShopById = (shopId) => {
  return mockShops.find(shop => shop.id === shopId);
};

// Функция для получения подписанных магазинов
export const getSubscribedShops = () => {
  return mockSubscriptions.map(sub => ({
    ...sub.shop,
    subscribedAt: sub.subscribedAt,
  }));
};
