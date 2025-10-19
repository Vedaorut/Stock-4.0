# Bot API Client

Модульная интеграция Telegram бота с Backend API для Status Stock платформы.

## Структура

```
api/
├── client.js          # Базовый HTTP клиент с retry логикой
├── auth.js            # Authentication API
├── shops.js           # Shops API
├── products.js        # Products API
├── orders.js          # Orders API
├── subscriptions.js   # Subscriptions API
├── payments.js        # Payments API
└── index.js           # Экспорт всех API
```

## Возможности

### ✅ Retry Logic
- Автоматические повторные попытки при ошибках сервера (500+)
- Экспоненциальная задержка: 1s, 2s, 4s
- Максимум 3 попытки на запрос

### ✅ Error Handling
- Обработка всех типов HTTP ошибок
- User-friendly сообщения на русском
- Логирование всех ошибок

### ✅ JWT Authentication
- Автоматическое добавление токена в заголовки
- Управление токенами через `tokenManager`

### ✅ Timeout
- 10 секунд на запрос (настраивается через `API_TIMEOUT`)

## Использование

### 1. Базовая настройка

```javascript
import { authApi, shopsApi, productsApi } from './api/index.js';
import { getToken, setToken } from './utils/tokenManager.js';
```

### 2. Authentication

```javascript
// Login пользователя
const result = await authApi.login(ctx.from);
setToken(ctx, result.token); // Сохраняем токен в session

// Получить профиль
const token = getToken(ctx);
const profile = await authApi.getProfile(token);

// Обновить профиль
await authApi.updateProfile(token, {
  firstName: 'Иван',
  lastName: 'Петров'
});
```

### 3. Shops

```javascript
const token = getToken(ctx);

// Создать магазин
const shop = await shopsApi.create(token, {
  name: 'Мой магазин',
  description: 'Описание',
  currency: 'BTC'
});

// Получить мои магазины
const myShops = await shopsApi.getMyShops(token);

// Найти магазин по ID
const shop = await shopsApi.getById(shopId);

// Поиск магазинов
const shops = await shopsApi.search('electronics');

// Обновить магазин
await shopsApi.update(token, shopId, {
  description: 'Новое описание'
});

// Удалить магазин
await shopsApi.delete(token, shopId);
```

### 4. Products

```javascript
const token = getToken(ctx);

// Добавить товар
const product = await productsApi.create(token, {
  shopId: 1,
  name: 'iPhone 15',
  description: 'Latest iPhone',
  price: 999.99,
  stock: 10,
  imageUrl: 'https://...'
});

// Список товаров магазина
const result = await productsApi.list({
  shopId: 1,
  inStock: true,
  page: 1,
  limit: 20
});

// Получить товар
const product = await productsApi.getById(productId);

// Обновить товар
await productsApi.update(token, productId, {
  price: 899.99,
  stock: 15
});

// Удалить товар
await productsApi.delete(token, productId);
```

### 5. Orders

```javascript
const token = getToken(ctx);

// Создать заказ
const order = await ordersApi.create(token, {
  shopId: 1,
  items: [
    { productId: 1, quantity: 2, price: 999.99 }
  ],
  shippingAddress: '123 Main St',
  paymentMethod: 'BTC'
});

// Мои заказы
const result = await ordersApi.getMyOrders(token, {
  status: 'pending',
  page: 1,
  limit: 10
});

// Получить заказ
const order = await ordersApi.getById(token, orderId);

// Обновить статус
await ordersApi.updateStatus(token, orderId, 'processing');
```

### 6. Subscriptions

```javascript
const token = getToken(ctx);

// Подписаться
await subscriptionsApi.subscribe(token, shopId);

// Мои подписки
const result = await subscriptionsApi.getMySubscriptions(token, {
  page: 1,
  limit: 20
});

// Проверить подписку
const status = await subscriptionsApi.checkSubscription(token, shopId);

// Отписаться
await subscriptionsApi.unsubscribe(token, shopId);

// Подписчики магазина (только владелец)
const subscribers = await subscriptionsApi.getShopSubscribers(token, shopId);
```

### 7. Payments

```javascript
const token = getToken(ctx);

// Верифицировать платеж
const result = await paymentsApi.verify(token, orderId, txHash, 'BTC');

// Платежи заказа
const payments = await paymentsApi.getByOrder(token, orderId);

// Статус платежа
const status = await paymentsApi.checkStatus(token, txHash);
```

## Error Handling

### Рекомендуемый подход

```javascript
import { handleApiCall } from '../utils/errorHandler.js';

// Автоматическая обработка ошибок
const result = await handleApiCall(
  ctx,
  async () => await shopsApi.getMyShops(token),
  'Failed to load shops'
);

if (!result) {
  // Ошибка уже показана пользователю
  return;
}

// Работаем с результатом
console.log(result);
```

### Типы ошибок

| Код | Сообщение |
|-----|-----------|
| 401 | 🔐 Ошибка авторизации. Попробуйте войти заново. |
| 403 | 🔐 Доступ запрещен. |
| 404 | 🔍 Ресурс не найден. |
| 429 | ⏱️ Слишком много запросов. Попробуйте позже. |
| 500+ | ⚠️ Ошибка сервера. Попробуйте позже. |
| Network | ⚠️ Ошибка сети. Проверьте подключение. |

## Token Management

```javascript
import {
  getToken,
  setToken,
  clearToken,
  isAuthenticated,
  requireAuth
} from '../utils/tokenManager.js';

// Проверка авторизации
if (!isAuthenticated(ctx)) {
  await ctx.reply('Необходима авторизация');
  return;
}

// Middleware для защиты команд
bot.action('my_shops', requireAuth, async (ctx) => {
  const token = getToken(ctx);
  // ... работа с API
});

// Очистка токена при logout
clearToken(ctx);
```

## Logging

```javascript
import logger from '../utils/logger.js';

// Логирование действий пользователя
logger.userAction('create_shop', userId, { shopName: 'Test' });

// API запросы
logger.apiRequest('POST', '/api/shops', userId);
logger.apiResponse('POST', '/api/shops', 201, userId);

// Ошибки
logger.error('Failed to create shop', { error: error.message });

// Предупреждения
logger.warn('Shop payment pending', { shopId });

// Отладка (только если LOG_LEVEL=DEBUG)
logger.debug('Session data', ctx.session);
```

## Environment Variables

```env
# Backend API
BACKEND_URL=http://localhost:3000
API_TIMEOUT=10000

# Logging
LOG_LEVEL=INFO  # DEBUG, INFO, WARN, ERROR
```

## Best Practices

### 1. Всегда используйте error handling

```javascript
// ❌ Плохо
const shops = await shopsApi.getMyShops(token);

// ✅ Хорошо
const shops = await handleApiCall(
  ctx,
  async () => await shopsApi.getMyShops(token)
);
if (!shops) return;
```

### 2. Проверяйте авторизацию

```javascript
// ✅ Используйте middleware
bot.action('my_shops', requireAuth, handlerFunction);

// ✅ Или проверяйте вручную
if (!isAuthenticated(ctx)) {
  await ctx.reply('Необходима авторизация');
  return;
}
```

### 3. Логируйте важные действия

```javascript
logger.userAction('subscribe', ctx.from.id, { shopId });
logger.error('Payment verification failed', { orderId, error });
```

### 4. Используйте safe reply для критичных сообщений

```javascript
import { safeReply } from '../utils/errorHandler.js';

// Не упадет, если отправка сообщения не удалась
await safeReply(ctx, 'Заказ создан!');
```

## Testing

```javascript
import { authApi } from './api/index.js';

// Мокирование для тестов
jest.mock('./api/client.js', () => ({
  post: jest.fn(),
  get: jest.fn()
}));

test('should login user', async () => {
  const result = await authApi.login({ id: 123, username: 'test' });
  expect(result.token).toBeDefined();
});
```

## Миграция с старого API

### Было (старый `utils/api.js`)

```javascript
import { createUser, getShopByOwner } from '../utils/api.js';

const result = await createUser(telegramId, username, firstName, 'seller');
if (!result.success) {
  await ctx.reply(result.error);
  return;
}
```

### Стало (новый API)

```javascript
import { authApi, shopsApi } from '../api/index.js';
import { handleApiCall, getToken } from '../utils/index.js';

const result = await handleApiCall(
  ctx,
  async () => await authApi.login(ctx.from)
);
if (!result) return;

setToken(ctx, result.token);
```

## Troubleshooting

### Проблема: Timeout ошибки

**Решение:** Увеличьте `API_TIMEOUT` в `.env`

```env
API_TIMEOUT=20000  # 20 секунд
```

### Проблема: 401 Unauthorized

**Решение:** Проверьте токен в session

```javascript
const token = getToken(ctx);
if (!token) {
  // Токен отсутствует - требуется повторный login
  await authApi.login(ctx.from);
}
```

### Проблема: Retry не работает

**Решение:** Retry срабатывает только для статусов 500+

Для других ошибок используйте manual retry:

```javascript
import { retryOperation } from '../utils/errorHandler.js';

const result = await retryOperation(
  async () => await shopsApi.getById(shopId),
  3,  // max retries
  1000 // delay
);
```

## Roadmap

- [ ] WebSocket поддержка для real-time уведомлений
- [ ] Кеширование часто запрашиваемых данных
- [ ] GraphQL поддержка
- [ ] Rate limiting на клиентской стороне
- [ ] Batch requests
