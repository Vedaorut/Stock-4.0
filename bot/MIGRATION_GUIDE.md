# API Migration Guide

Руководство по миграции с старого API (`utils/api.js`) на новый модульный API (`api/`).

## Что изменилось

### Старый подход
- Монолитный файл `utils/api.js` со всеми функциями
- Возврат `{ success, data, error }` wrapper объектов
- Ручная обработка ошибок в каждом handler
- Устаревшие endpoints (не соответствуют Backend API)

### Новый подход
- Модульная структура: `api/auth.js`, `api/shops.js`, и т.д.
- Прямой возврат данных или throw Error
- Централизованная обработка ошибок через `handleApiCall`
- Соответствие актуальным Backend endpoints
- JWT token management
- Retry logic из коробки

## Пошаговая миграция

### Шаг 1: Обновите импорты

**Было:**
```javascript
import { createUser, getUser, createShop } from '../utils/api.js';
```

**Стало:**
```javascript
import { authApi, shopsApi } from '../api/index.js';
import { handleApiCall } from '../utils/errorHandler.js';
import { getToken, setToken } from '../utils/tokenManager.js';
```

### Шаг 2: Миграция Authentication

#### Регистрация/Login

**Было:**
```javascript
const result = await createUser(
  ctx.from.id,
  ctx.from.username,
  ctx.from.first_name,
  'seller'
);

if (!result.success) {
  await ctx.reply(result.error);
  return;
}

const user = result.data;
```

**Стало:**
```javascript
const result = await handleApiCall(
  ctx,
  async () => await authApi.login(ctx.from)
);

if (!result) return; // Ошибка уже обработана

// Сохраняем токен для последующих запросов
setToken(ctx, result.token);
const user = result.user;
```

#### Получение профиля

**Было:**
```javascript
const result = await getUser(ctx.from.id);
if (!result.success) {
  if (result.notFound) {
    await ctx.reply('Пользователь не найден');
  } else {
    await ctx.reply(result.error);
  }
  return;
}
```

**Стало:**
```javascript
const token = getToken(ctx);
const result = await handleApiCall(
  ctx,
  async () => await authApi.getProfile(token)
);

if (!result) return;
```

### Шаг 3: Миграция Shops

#### Создание магазина

**Было:**
```javascript
const result = await createShop(
  ctx.from.id,
  shopName,
  paymentHash
);

if (!result.success) {
  await ctx.reply(result.error);
  return;
}
```

**Стало:**
```javascript
const token = getToken(ctx);
const result = await handleApiCall(
  ctx,
  async () => await shopsApi.create(token, {
    name: shopName,
    description: 'Описание магазина',
    currency: 'BTC'
  })
);

if (!result) return;
```

#### Получение магазина владельца

**Было:**
```javascript
const result = await getShopByOwner(ctx.from.id);

if (!result.success) {
  if (result.notFound) {
    await ctx.reply('У вас еще нет магазина');
  }
  return;
}

const shop = result.data;
```

**Стало:**
```javascript
const token = getToken(ctx);
const shops = await handleApiCall(
  ctx,
  async () => await shopsApi.getMyShops(token)
);

if (!shops) return;

if (shops.length === 0) {
  await ctx.reply('У вас еще нет магазина');
  return;
}

const shop = shops[0]; // Первый магазин
```

#### Поиск магазина

**Было:**
```javascript
const result = await getShopByName(shopName);

if (!result.success) {
  if (result.notFound) {
    await ctx.reply('Магазин не найден');
  }
  return;
}
```

**Стало:**
```javascript
const shops = await handleApiCall(
  ctx,
  async () => await shopsApi.search(shopName)
);

if (!shops) return;

if (shops.length === 0) {
  await ctx.reply('Магазин не найден');
  return;
}
```

### Шаг 4: Миграция Products

#### Добавление товара

**Было:**
```javascript
const result = await createProduct(shopId, {
  name: productName,
  description: productDesc,
  price: productPrice,
  stock: productStock
});

if (!result.success) {
  await ctx.reply(result.error);
  return;
}
```

**Стало:**
```javascript
const token = getToken(ctx);
const result = await handleApiCall(
  ctx,
  async () => await productsApi.create(token, {
    shopId,
    name: productName,
    description: productDesc,
    price: parseFloat(productPrice),
    stock: parseInt(productStock)
  })
);

if (!result) return;
```

#### Список товаров

**Было:**
```javascript
const result = await getProducts(shopId);

if (!result.success) {
  await ctx.reply(result.error);
  return;
}

const products = result.data;
```

**Стало:**
```javascript
const result = await handleApiCall(
  ctx,
  async () => await productsApi.list({ shopId, inStock: true })
);

if (!result) return;

const products = result.products; // С пагинацией
const total = result.total;
```

#### Удаление товара

**Было:**
```javascript
const result = await deleteProduct(productId);

if (!result.success) {
  await ctx.reply(result.error);
  return;
}
```

**Стало:**
```javascript
const token = getToken(ctx);
const result = await handleApiCall(
  ctx,
  async () => await productsApi.delete(token, productId)
);

if (!result) return;
```

### Шаг 5: Миграция Orders

#### Получение заказов

**Было:**
```javascript
// Заказы продавца
const result = await getOrdersByShop(shopId);

// Заказы покупателя
const result = await getOrdersByBuyer(ctx.from.id);

if (!result.success) {
  await ctx.reply(result.error);
  return;
}
```

**Стало:**
```javascript
const token = getToken(ctx);

// Все мои заказы (buyer + seller)
const result = await handleApiCall(
  ctx,
  async () => await ordersApi.getMyOrders(token, { status: 'pending' })
);

if (!result) return;

const orders = result.orders;
```

#### Обновление статуса

**Было:**
```javascript
const result = await updateOrderStatus(orderId, 'processing');

if (!result.success) {
  await ctx.reply(result.error);
  return;
}
```

**Стало:**
```javascript
const token = getToken(ctx);
const result = await handleApiCall(
  ctx,
  async () => await ordersApi.updateStatus(token, orderId, 'processing')
);

if (!result) return;
```

### Шаг 6: Миграция Subscriptions

#### Подписка

**Было:**
```javascript
const result = await subscribeToShop(ctx.from.id, shopId);

if (!result.success) {
  await ctx.reply(result.error);
  return;
}
```

**Стало:**
```javascript
const token = getToken(ctx);
const result = await handleApiCall(
  ctx,
  async () => await subscriptionsApi.subscribe(token, shopId)
);

if (!result) return;
```

#### Мои подписки

**Было:**
```javascript
const result = await getSubscriptions(ctx.from.id);

if (!result.success) {
  await ctx.reply(result.error);
  return;
}

const subscriptions = result.data;
```

**Стало:**
```javascript
const token = getToken(ctx);
const result = await handleApiCall(
  ctx,
  async () => await subscriptionsApi.getMySubscriptions(token)
);

if (!result) return;

const subscriptions = result.subscriptions;
```

### Шаг 7: Миграция Payments

#### Верификация платежа

**Было:**
```javascript
const result = await verifyPayment(paymentHash);

if (!result.success) {
  await ctx.reply(result.error);
  return;
}

if (result.data.verified) {
  await ctx.reply('Платеж подтвержден');
}
```

**Стало:**
```javascript
const token = getToken(ctx);
const result = await handleApiCall(
  ctx,
  async () => await paymentsApi.verify(token, orderId, txHash, 'BTC')
);

if (!result) return;

if (result.verified) {
  await ctx.reply('✅ Платеж подтвержден');
} else {
  await ctx.reply(`⏳ Ожидание подтверждений: ${result.confirmations}/${result.confirmationsRequired}`);
}
```

## Обновление handlers

### Пример: handlers/start.js

**Было:**
```javascript
import { createUser, getUser } from '../utils/api.js';

export async function handleStart(ctx) {
  const telegramId = ctx.from.id;

  // Проверяем существование пользователя
  let result = await getUser(telegramId);

  if (result.notFound) {
    // Регистрируем нового пользователя
    result = await createUser(
      telegramId,
      ctx.from.username,
      ctx.from.first_name,
      'buyer'
    );

    if (!result.success) {
      await ctx.reply(result.error);
      return;
    }
  }

  // Показываем меню
  await ctx.reply('Добро пожаловать!');
}
```

**Стало:**
```javascript
import { authApi } from '../api/index.js';
import { handleApiCall } from '../utils/errorHandler.js';
import { setToken } from '../utils/tokenManager.js';

export async function handleStart(ctx) {
  // Login автоматически регистрирует нового пользователя
  const result = await handleApiCall(
    ctx,
    async () => await authApi.login(ctx.from)
  );

  if (!result) return;

  // Сохраняем токен
  setToken(ctx, result.token);

  // Показываем меню
  await ctx.reply(`Добро пожаловать, ${result.user.firstName || result.user.username}!`);
}
```

### Пример: handlers/seller.js

**Было:**
```javascript
import { createShop, getShopByOwner } from '../utils/api.js';

export async function handleCreateShop(ctx) {
  const shopName = ctx.session.shopName;

  const result = await createShop(
    ctx.from.id,
    shopName,
    'payment_hash'
  );

  if (!result.success) {
    await ctx.reply(result.error);
    return;
  }

  await ctx.reply(`Магазин "${result.data.name}" создан!`);
}

export async function handleMyShop(ctx) {
  const result = await getShopByOwner(ctx.from.id);

  if (!result.success) {
    if (result.notFound) {
      await ctx.reply('У вас нет магазина');
    } else {
      await ctx.reply(result.error);
    }
    return;
  }

  const shop = result.data;
  await ctx.reply(`Ваш магазин: ${shop.name}`);
}
```

**Стало:**
```javascript
import { shopsApi } from '../api/index.js';
import { handleApiCall } from '../utils/errorHandler.js';
import { getToken } from '../utils/tokenManager.js';

export async function handleCreateShop(ctx) {
  const token = getToken(ctx);
  const shopName = ctx.session.shopName;

  const result = await handleApiCall(
    ctx,
    async () => await shopsApi.create(token, {
      name: shopName,
      description: 'Новый магазин',
      currency: 'BTC'
    })
  );

  if (!result) return;

  await ctx.reply(`🎉 Магазин "${result.name}" создан!`);
}

export async function handleMyShop(ctx) {
  const token = getToken(ctx);

  const shops = await handleApiCall(
    ctx,
    async () => await shopsApi.getMyShops(token)
  );

  if (!shops) return;

  if (shops.length === 0) {
    await ctx.reply('📭 У вас нет магазина');
    return;
  }

  const shop = shops[0];
  await ctx.reply(
    `🏪 Ваш магазин: ${shop.name}\n` +
    `Статус: ${shop.isActive ? '✅ Активен' : '⏸️ Неактивен'}\n` +
    `Подписчиков: ${shop.subscribersCount || 0}`
  );
}
```

## Checklist миграции

- [ ] Обновлены все импорты с `utils/api.js` на `api/index.js`
- [ ] Добавлена обработка JWT токенов через `tokenManager`
- [ ] Все API вызовы обернуты в `handleApiCall`
- [ ] Удалены проверки `result.success` / `result.notFound`
- [ ] Обновлены endpoint URLs согласно Backend API
- [ ] Добавлены try-catch блоки где необходимо
- [ ] Обновлены типы данных (parseInt, parseFloat)
- [ ] Протестированы все handlers
- [ ] Обновлена документация

## Тестирование

После миграции протестируйте:

1. **Authentication flow**
   - `/start` регистрация нового пользователя
   - Повторный `/start` существующего пользователя
   - Получение профиля

2. **Seller flow**
   - Создание магазина
   - Просмотр магазина
   - Добавление товара
   - Управление заказами

3. **Buyer flow**
   - Поиск магазинов
   - Подписка на магазин
   - Создание заказа
   - Оплата заказа

4. **Error handling**
   - Network errors
   - 401 Unauthorized
   - 404 Not Found
   - Timeout errors

## Удаление старого кода

После успешной миграции и тестирования:

```bash
# Переименуйте старый API файл (на случай отката)
mv utils/api.js utils/api.js.old

# Или удалите полностью
rm utils/api.js
```

## Поддержка

Если возникли проблемы при миграции:

1. Проверьте `/Users/sile/Documents/Status Stock 4.0/bot/api/README.md`
2. Посмотрите примеры в `/Users/sile/Documents/Status Stock 4.0/bot/examples/apiUsageExamples.js`
3. Проверьте Backend endpoints в `/Users/sile/Documents/Status Stock 4.0/backend/src/routes/`

## Преимущества новой архитектуры

✅ **Модульность** - легко найти нужный API метод
✅ **Type Safety** - понятные параметры функций
✅ **Error Handling** - централизованная обработка ошибок
✅ **JWT Auth** - встроенная работа с токенами
✅ **Retry Logic** - автоматические повторы при сбоях
✅ **Logging** - структурированное логирование
✅ **Maintainability** - проще поддерживать и расширять
✅ **Testing** - легче писать unit тесты

## Roadmap

После миграции можно добавить:

- [ ] Request/response caching
- [ ] WebSocket integration
- [ ] Offline queue для запросов
- [ ] Request deduplication
- [ ] GraphQL support
