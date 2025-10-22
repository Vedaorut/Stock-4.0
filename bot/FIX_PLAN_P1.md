# План исправления P1 проблемы: Race condition в subscribe

**Дата:** 2025-10-22
**Приоритет:** P1 (Важно)
**Файл:** `bot/src/handlers/buyer/index.js:158-216`

---

## Проблема

### Текущий код:
```javascript
const handleSubscribe = async (ctx) => {
  try {
    const shopId = ctx.match[1];

    // 1. Проверяем подписку
    const checkResult = await subscriptionApi.checkSubscription(shopId, ctx.session.token);

    if (checkResult.subscribed) {
      // 2. Показываем "уже подписан"
      await ctx.answerCbQuery('ℹ️ Вы уже подписаны на этот магазин');
      await ctx.editMessageText(...);
      return;
    }

    // 3. ❌ ПРОБЛЕМА: Между шагом 1 и 3 может пройти время
    // Другой процесс/запрос может успеть создать подписку
    await subscriptionApi.subscribe(shopId, ctx.session.token);

    // 4. Показываем "подписались"
    await ctx.answerCbQuery('✅ Подписались!');
  }
};
```

### Почему это проблема:

**Сценарий race condition:**
1. Пользователь дважды быстро нажимает "Подписаться" (двойной клик)
2. Первый запрос: `checkSubscription()` → нет подписки → `subscribe()` → ОК
3. Второй запрос: `checkSubscription()` (параллельно с первым subscribe) → нет подписки → `subscribe()` → **DUPLICATE!**

**Вероятность:** Низкая (~1% в production), но при hi-load может привести к дубликатам в БД

---

## Решение 1: Backend идемпотентность (РЕКОМЕНДУЕТСЯ)

### Изменения в backend:

**Файл:** `backend/src/controllers/subscriptionController.js`

```javascript
// ДО (текущий код):
async subscribeToShop(req, res) {
  const { shopId } = req.body;
  const userId = req.user.id;

  // ❌ INSERT может упасть с UNIQUE constraint error
  const subscription = await db.query(
    'INSERT INTO subscriptions (user_id, shop_id) VALUES ($1, $2) RETURNING *',
    [userId, shopId]
  );

  res.json({ success: true, data: subscription.rows[0] });
}

// ПОСЛЕ (идемпотентный):
async subscribeToShop(req, res) {
  const { shopId } = req.body;
  const userId = req.user.id;

  // ✅ UPSERT вместо INSERT - не падает при duplicate
  const subscription = await db.query(
    `INSERT INTO subscriptions (user_id, shop_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, shop_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId, shopId]
  );

  // Проверяем: была создана или уже существовала?
  const isNew = subscription.rows[0].created_at === subscription.rows[0].updated_at;

  res.json({
    success: true,
    data: subscription.rows[0],
    message: isNew ? 'Subscribed successfully' : 'Already subscribed'
  });
}
```

### Изменения в bot:

**Файл:** `bot/src/handlers/buyer/index.js`

```javascript
const handleSubscribe = async (ctx) => {
  try {
    const shopId = ctx.match[1];

    if (!ctx.session.token) {
      await ctx.answerCbQuery('Нет токена авторизации', { show_alert: true });
      return;
    }

    // ✅ Убираем checkSubscription - просто подписываемся
    const result = await subscriptionApi.subscribe(shopId, ctx.session.token);

    // Backend возвращает message: 'Already subscribed' если уже подписан
    const shop = await shopApi.getShop(shopId);

    if (result.message === 'Already subscribed') {
      await ctx.answerCbQuery('ℹ️ Вы уже подписаны на этот магазин');
      await ctx.editMessageText(
        `✓ Подписка активна: ${shop.name}`,
        shopActionsKeyboard(shopId, true)
      );
    } else {
      await ctx.answerCbQuery('✅ Подписались!');
      await ctx.editMessageText(
        `✓ Подписались: ${shop.name}`,
        shopActionsKeyboard(shopId, true)
      );
    }

    logger.info(`User ${ctx.from.id} subscribed to shop ${shopId}`);
  } catch (error) {
    logger.error('Error subscribing to shop:', error);

    const errorMsg = error.response?.data?.error;

    if (errorMsg === 'Cannot subscribe to your own shop') {
      await ctx.answerCbQuery('❌ Нельзя подписаться на свой магазин', { show_alert: true });
    } else {
      await ctx.answerCbQuery('❌ Ошибка подписки', { show_alert: true });
    }
  }
};
```

### Изменения в API schema:

**Файл:** `backend/database/schema.sql`

```sql
-- Добавить updated_at для отслеживания upsert
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),  -- ✅ ДОБАВИТЬ
  UNIQUE(user_id, shop_id)
);
```

---

## Решение 2: Frontend debounce (ДОПОЛНИТЕЛЬНО)

### Добавить debounce для кнопок:

**Файл:** `bot/src/utils/debounce.js` (новый файл)

```javascript
/**
 * Debounce wrapper для callback query handlers
 * Предотвращает двойные клики на кнопки
 */
const debounceMap = new Map();

export function debounce(handler, delay = 1000) {
  return async (ctx) => {
    const key = `${ctx.from.id}:${ctx.callbackQuery?.data}`;

    // Проверяем: был ли недавно вызов?
    if (debounceMap.has(key)) {
      const lastCall = debounceMap.get(key);
      const now = Date.now();

      if (now - lastCall < delay) {
        // Слишком рано - игнорируем
        await ctx.answerCbQuery('⏳ Подождите...', { show_alert: false });
        logger.debug(`Debounced duplicate click: ${key}`);
        return;
      }
    }

    // Сохраняем время вызова
    debounceMap.set(key, Date.now());

    // Вызываем handler
    try {
      await handler(ctx);
    } finally {
      // Очищаем через delay
      setTimeout(() => {
        debounceMap.delete(key);
      }, delay);
    }
  };
}
```

**Использование:**

```javascript
import { debounce } from '../../utils/debounce.js';

export const setupBuyerHandlers = (bot) => {
  // ✅ Обернуть в debounce
  bot.action(/^subscribe:(.+)$/, debounce(handleSubscribe, 1000));
  bot.action(/^unsubscribe:(.+)$/, debounce(handleUnsubscribe, 1000));
};
```

---

## Решение 3: Optimistic UI (ОПЦИОНАЛЬНО)

### Обновлять UI сразу, без ожидания API:

```javascript
const handleSubscribe = async (ctx) => {
  try {
    const shopId = ctx.match[1];

    // 1. ✅ Сразу показываем "подписались" (optimistic)
    await ctx.answerCbQuery('✅ Подписались!');

    const shop = await shopApi.getShop(shopId);

    // 2. Обновляем UI с кнопкой "Подписан"
    await ctx.editMessageText(
      `✓ Подписались: ${shop.name}`,
      shopActionsKeyboard(shopId, true)  // ✅ true = subscribed
    );

    // 3. Потом делаем API call (async, в фоне)
    subscriptionApi.subscribe(shopId, ctx.session.token)
      .catch((error) => {
        // Если ошибка - откатываем UI
        logger.error('Failed to subscribe (optimistic rollback):', error);
        ctx.editMessageText(
          `❌ Не удалось подписаться: ${shop.name}`,
          shopActionsKeyboard(shopId, false)  // false = not subscribed
        ).catch(() => {});
      });

  } catch (error) {
    // ...
  }
};
```

**Минусы:**
- Сложнее откатывать при ошибке
- Может показать неверное состояние если API упадет

---

## Рекомендуемый подход

**Комбинация Решений 1 + 2:**

1. ✅ **Backend идемпотентность** (ON CONFLICT DO UPDATE) - решает race condition
2. ✅ **Frontend debounce** (1 секунда) - предотвращает двойные клики
3. ❌ **Optimistic UI** - не нужен, слишком сложно

**Результат:**
- Race condition полностью устранен
- UX улучшен (нет duplicate API calls)
- Код проще и понятнее

---

## Чеклист для реализации

### Backend:
- [ ] Добавить `updated_at` в таблицу `subscriptions`
- [ ] Изменить `INSERT` на `INSERT ... ON CONFLICT DO UPDATE`
- [ ] Вернуть `message` в response (Already subscribed / Subscribed)
- [ ] Добавить тесты для idempotency

### Bot:
- [ ] Удалить `checkSubscription()` перед `subscribe()`
- [ ] Обработать `result.message` для показа правильного сообщения
- [ ] Создать `utils/debounce.js`
- [ ] Обернуть handlers в `debounce()`
- [ ] Добавить integration тест для двойного клика

### Tests:
- [ ] Backend: тест на double subscribe (должен вернуть 200 OK)
- [ ] Bot: тест на debounce (второй клик игнорируется)

---

## Оценка времени

- Backend изменения: **30 минут**
- Bot изменения: **20 минут**
- Debounce utility: **15 минут**
- Тесты: **30 минут**

**Итого: ~1.5 часа**

---

## Rollback план

Если что-то пойдет не так:

1. **Backend:** Откатить миграцию (удалить `updated_at`, вернуть простой INSERT)
2. **Bot:** Вернуть `checkSubscription()` перед `subscribe()`
3. **Debounce:** Убрать wrapper из handlers

**Критерий успеха:** Нет duplicate entries в таблице `subscriptions` после stress test (1000 двойных кликов)

---

**Следующий шаг:** Начать с Backend идемпотентности (наименьший риск, наибольший эффект)
