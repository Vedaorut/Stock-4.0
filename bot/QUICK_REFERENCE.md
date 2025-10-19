# Quick Reference Guide

Быстрая шпаргалка по использованию API клиентов в боте.

## Импорты

```javascript
// API клиенты
import {
  authApi,
  shopsApi,
  productsApi,
  ordersApi,
  subscriptionsApi,
  paymentsApi
} from './api/index.js';

// Utilities
import { getToken, setToken, clearToken } from './utils/tokenManager.js';
import { handleApiCall, safeReply } from './utils/errorHandler.js';
import logger from './utils/logger.js';
```

## Базовый шаблон handler

```javascript
import { shopsApi } from './api/index.js';
import { getToken } from './utils/tokenManager.js';
import { handleApiCall } from './utils/errorHandler.js';

export async function myHandler(ctx) {
  const token = getToken(ctx);

  const result = await handleApiCall(
    ctx,
    async () => await shopsApi.getMyShops(token),
    'Custom error prefix' // опционально
  );

  if (!result) return; // Ошибка уже показана

  // Работаем с результатом
  await ctx.reply(`Found ${result.length} shops`);
}
```

## Authentication

```javascript
// Login (регистрация автоматически)
const result = await authApi.login(ctx.from);
setToken(ctx, result.token);

// Профиль
const profile = await authApi.getProfile(token);

// Обновить профиль
await authApi.updateProfile(token, { firstName: 'John' });

// Logout
clearToken(ctx);
```

## Shops

```javascript
const token = getToken(ctx);

// Создать
const shop = await shopsApi.create(token, {
  name: 'Shop Name',
  description: 'Description',
  currency: 'BTC'
});

// Мои магазины
const shops = await shopsApi.getMyShops(token);

// По ID
const shop = await shopsApi.getById(shopId);

// Поиск
const shops = await shopsApi.search('query');

// Обновить
await shopsApi.update(token, shopId, { description: 'New' });

// Удалить
await shopsApi.delete(token, shopId);
```

## Products

```javascript
const token = getToken(ctx);

// Создать
const product = await productsApi.create(token, {
  shopId: 1,
  name: 'Product',
  description: 'Desc',
  price: 99.99,
  stock: 10,
  imageUrl: 'https://...'
});

// Список
const result = await productsApi.list({
  shopId: 1,
  inStock: true,
  page: 1,
  limit: 20
});
// result.products, result.total, result.page

// По ID
const product = await productsApi.getById(productId);

// Обновить
await productsApi.update(token, productId, { price: 89.99 });

// Удалить
await productsApi.delete(token, productId);
```

## Orders

```javascript
const token = getToken(ctx);

// Создать
const order = await ordersApi.create(token, {
  shopId: 1,
  items: [
    { productId: 1, quantity: 2, price: 99.99 }
  ],
  shippingAddress: 'Address',
  paymentMethod: 'BTC'
});

// Мои заказы
const result = await ordersApi.getMyOrders(token, {
  status: 'pending',
  page: 1,
  limit: 10
});

// По ID
const order = await ordersApi.getById(token, orderId);

// Обновить статус
await ordersApi.updateStatus(token, orderId, 'processing');
// Статусы: pending, processing, shipped, completed, cancelled
```

## Subscriptions

```javascript
const token = getToken(ctx);

// Подписаться
await subscriptionsApi.subscribe(token, shopId);

// Мои подписки
const result = await subscriptionsApi.getMySubscriptions(token);

// Проверить подписку
const status = await subscriptionsApi.checkSubscription(token, shopId);
// status.isSubscribed

// Отписаться
await subscriptionsApi.unsubscribe(token, shopId);

// Подписчики (только владелец)
const subs = await subscriptionsApi.getShopSubscribers(token, shopId);
```

## Payments

```javascript
const token = getToken(ctx);

// Верифицировать
const result = await paymentsApi.verify(
  token,
  orderId,
  'tx-hash',
  'BTC' // BTC, ETH, USDT, TON
);
// result.verified, result.confirmations

// Платежи заказа
const payments = await paymentsApi.getByOrder(token, orderId);

// Статус
const status = await paymentsApi.checkStatus(token, 'tx-hash');
```

## Error Handling

```javascript
// Рекомендуемый способ
const result = await handleApiCall(
  ctx,
  async () => await shopsApi.getById(shopId)
);
if (!result) return;

// Manual try-catch
try {
  const result = await shopsApi.getById(shopId);
} catch (error) {
  await safeReply(ctx, formatError(error));
}

// Retry
import { retryOperation } from './utils/errorHandler.js';
const result = await retryOperation(
  async () => await shopsApi.getById(shopId),
  3, // retries
  1000 // delay
);
```

## Token Management

```javascript
// Проверить авторизацию
if (!isAuthenticated(ctx)) {
  await ctx.reply('Login required');
  return;
}

// Middleware
bot.action('protected', requireAuth, async (ctx) => {
  // Только для авторизованных
});

// Получить токен
const token = getToken(ctx);

// Сохранить токен
setToken(ctx, 'jwt-token');

// Удалить токен
clearToken(ctx);
```

## Logging

```javascript
import logger from './utils/logger.js';

// User action
logger.userAction('create_shop', userId, { shopName: 'Test' });

// Error
logger.error('Failed to load', { error: err.message });

// Warning
logger.warn('Payment pending', { orderId });

// Info
logger.info('User registered', { userId });

// Debug (только если LOG_LEVEL=DEBUG)
logger.debug('Session data', ctx.session);
```

## Safe Messaging

```javascript
import { safeReply, safeEdit, safeAnswerCbQuery } from './utils/errorHandler.js';

// Не упадет, если не удалось отправить
await safeReply(ctx, 'Message');

// Не упадет, если не удалось изменить
await safeEdit(ctx, 'New text', { reply_markup: keyboard });

// Не упадет, если не удалось ответить
await safeAnswerCbQuery(ctx, 'Alert text', true);
```

## Session Data

```javascript
// Сохранить данные
ctx.session.shopName = 'My Shop';
ctx.session.step = 'awaiting_input';

// Получить данные
const shopName = ctx.session.shopName;

// Очистить данные
delete ctx.session.shopName;
ctx.session.step = null;
```

## Pagination

```javascript
// Products
const result = await productsApi.list({
  shopId: 1,
  page: 1,
  limit: 20
});

const products = result.products;
const total = result.total;
const currentPage = result.page;
const totalPages = Math.ceil(total / result.limit);

// Orders
const result = await ordersApi.getMyOrders(token, {
  page: 2,
  limit: 10
});
```

## Filters

```javascript
// Products by shop + in stock
await productsApi.list({
  shopId: 1,
  inStock: true
});

// Orders by status
await ordersApi.getMyOrders(token, {
  status: 'pending'
});

// Search shops
await shopsApi.search('electronics');
```

## Типичные сценарии

### Создание магазина
```javascript
export async function handleCreateShop(ctx) {
  const token = getToken(ctx);
  const shopName = ctx.session.shopName;

  const shop = await handleApiCall(
    ctx,
    async () => await shopsApi.create(token, {
      name: shopName,
      description: 'New shop',
      currency: 'BTC'
    })
  );

  if (!shop) return;

  logger.userAction('create_shop', ctx.from.id, { shopId: shop.id });
  await safeReply(ctx, `✅ Shop "${shop.name}" created!`);
}
```

### Добавление товара
```javascript
export async function handleAddProduct(ctx) {
  const token = getToken(ctx);
  const { shopId, name, price, stock } = ctx.session.productData;

  const product = await handleApiCall(
    ctx,
    async () => await productsApi.create(token, {
      shopId,
      name,
      description: 'Product description',
      price: parseFloat(price),
      stock: parseInt(stock)
    })
  );

  if (!product) return;

  await safeReply(ctx, `✅ Product added: ${product.name}`);
}
```

### Создание заказа
```javascript
export async function handleCreateOrder(ctx) {
  const token = getToken(ctx);
  const cartItems = ctx.session.cart;

  const order = await handleApiCall(
    ctx,
    async () => await ordersApi.create(token, {
      shopId: cartItems[0].shopId,
      items: cartItems.map(item => ({
        productId: item.id,
        quantity: item.quantity,
        price: item.price
      })),
      shippingAddress: ctx.session.address,
      paymentMethod: 'BTC'
    })
  );

  if (!order) return;

  await safeReply(
    ctx,
    `✅ Order #${order.id} created!\n` +
    `Total: ${order.totalAmount} BTC`
  );
}
```

### Подписка на магазин
```javascript
export async function handleSubscribe(ctx, shopId) {
  const token = getToken(ctx);

  await handleApiCall(
    ctx,
    async () => await subscriptionsApi.subscribe(token, shopId)
  );

  logger.userAction('subscribe', ctx.from.id, { shopId });
  await safeReply(ctx, '✅ Subscribed!');
}
```

## Environment Variables

```env
# Backend
BACKEND_URL=http://localhost:3000
API_TIMEOUT=10000

# Logging
LOG_LEVEL=INFO
```

## Shortcuts

```javascript
// Quick login
const login = async (ctx) => {
  const r = await authApi.login(ctx.from);
  setToken(ctx, r.token);
  return r.user;
};

// Quick error wrap
const safe = (ctx, fn) => handleApiCall(ctx, fn);

// Usage
const user = await login(ctx);
const shops = await safe(ctx, () => shopsApi.getMyShops(getToken(ctx)));
```

## Debugging

```javascript
// Enable debug logs
process.env.LOG_LEVEL = 'DEBUG';

// Log session
logger.debug('Session', ctx.session);

// Log token
const token = getToken(ctx);
logger.debug('Token', { token: token?.substring(0, 20) });

// Log API response
const result = await shopsApi.getMyShops(token);
logger.debug('Shops', { count: result.length });
```

## Ошибки

| Код | Причина | Решение |
|-----|---------|---------|
| 401 | Token invalid/expired | `await authApi.login(ctx.from)` |
| 403 | No permission | Проверить ownership |
| 404 | Resource not found | Проверить ID |
| 429 | Rate limit | Подождать |
| 500 | Server error | Retry автоматически |

## Best Practices

✅ Всегда используйте `handleApiCall`
✅ Логируйте важные действия
✅ Проверяйте авторизацию
✅ Используйте `safeReply` для критичных сообщений
✅ Валидируйте пользовательский ввод
✅ Очищайте session после завершения
✅ Используйте logger вместо console.log

❌ Не храните токены в переменных
❌ Не игнорируйте ошибки
❌ Не делайте запросы без token
❌ Не логируйте sensitive данные
