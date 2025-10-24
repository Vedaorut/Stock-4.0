# Channel Migration Feature - Implementation Report

## Обзор

Полностью реализована функция "Channel Migration" для PRO подписчиков - возможность оповестить всех подписчиков магазина о смене Telegram канала при блокировке старого.

**Дата**: 2025-10-24  
**Статус**: ✅ Завершено  
**Версия**: 1.0.0

---

## Реализованные компоненты

### 1. Database (PostgreSQL) ✅

#### Миграции
- **Файл**: `backend/database/migrations.cjs`
- **Функция**: `addChannelMigrationFeature()`
- **Команда**: `node migrations.cjs --add-channel-migration`

#### Изменения схемы:

**1.1 Таблица `subscriptions`** 
- Добавлено поле `telegram_id BIGINT` для хранения Telegram ID подписчиков
- Добавлен индекс `idx_subscriptions_telegram_id`

**1.2 Таблица `shops`**
- Добавлено поле `tier VARCHAR(20) DEFAULT 'free'` с CHECK constraint `('free', 'pro')`
- Добавлен индекс `idx_shops_tier`

**1.3 Новая таблица `channel_migrations`**
```sql
CREATE TABLE channel_migrations (
  id SERIAL PRIMARY KEY,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  old_channel_url TEXT,
  new_channel_url TEXT NOT NULL,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

**Индексы**:
- `idx_channel_migrations_shop`
- `idx_channel_migrations_status`
- `idx_channel_migrations_created`

---

### 2. Backend Services ✅

#### 2.1 Rate Limit Service
**Файл**: `backend/src/services/rateLimit.js`

**Функции**:
- `canMigrate(shopId)` - Проверка лимита 2 рассылки/месяц
- `isProShop(shopId)` - Проверка PRO tier
- `validateMigration(shopId)` - Комплексная валидация (tier + limits)
- `getMigrationHistory(shopId, limit)` - История миграций

**Rate Limits**:
- Максимум 2 миграции в календарный месяц
- Сброс 1-го числа каждого месяца

#### 2.2 Broadcast Service
**Файл**: `backend/src/services/broadcastService.js`

**Функции**:
- `broadcastMigration(bot, shopId, shopName, newChannelUrl, oldChannelUrl, progressCallback)` - Главная функция рассылки
- `getShopSubscribers(shopId)` - Получение подписчиков с telegram_id
- `sendMigrationMessage(bot, telegramId, shopName, newChannelUrl, oldChannelUrl)` - Отправка сообщения одному пользователю
- `updateMigrationStatus(migrationId, status, updates)` - Обновление статуса
- `incrementCounter(migrationId, success)` - Инкремент счетчиков

**Rate Limiting**:
- Задержка 100ms между сообщениями (10 msg/sec)
- Соответствует Telegram limits (30 msg/sec max)
- Queue-based processing

**Error Handling**:
- 403 - Пользователь заблокировал бота (логируется, не ломает процесс)
- 400 - Пользователь не найден (логируется)
- Другие ошибки логируются, broadcast продолжается

---

### 3. Backend Controllers & Routes ✅

#### 3.1 Migration Controller
**Файл**: `backend/src/controllers/migrationController.js`

**Endpoints**:

1. `GET /api/shops/:shopId/migration/check` - Проверка права на миграцию
   - Проверяет: ownership, PRO tier, rate limits
   - Возвращает: eligible, limits, subscriberCount

2. `POST /api/shops/:shopId/migration` - Создание migration record
   - Body: `{ newChannelUrl, oldChannelUrl? }`
   - Создает запись в channel_migrations
   - Возвращает migrationId

3. `GET /api/shops/:shopId/migration/:migrationId` - Статус конкретной миграции
   - Возвращает: sent_count, failed_count, status, timestamps

4. `GET /api/shops/:shopId/migration/history` - История миграций
   - Query param: `limit` (default: 10)
   - Возвращает массив migration records

#### 3.2 Routes
**Файл**: `backend/src/routes/shops.js`
- Все endpoints добавлены в shops router
- Используют `verifyToken` middleware для авторизации

#### 3.3 Subscription Controller Updates
**Файл**: `backend/src/controllers/subscriptionController.js`
- Функция `subscribe()` обновлена для приема `telegramId` из body
- Передает telegram_id в `subscriptionQueries.create()`

#### 3.4 Database Queries Updates
**Файл**: `backend/src/models/db.js`
- `subscriptionQueries.create()` обновлена:
  - Принимает `telegramId` как 3-й параметр
  - INSERT query включает telegram_id
  - ON CONFLICT DO UPDATE для обновления telegram_id при повторной подписке

---

### 4. Bot Implementation ✅

#### 4.1 Keyboards
**Файл**: `bot/src/keyboards/seller.js`

**Изменения в `sellerMenu()`**:
- Теперь принимает 2-й параметр `tier`
- Для PRO пользователей добавляет кнопку: `⚠️ Канал заблокирован` (`seller:migrate_channel`)
- Кнопка показывается только для tier='pro'

#### 4.2 Migration Wizard Scene
**Файл**: `bot/src/scenes/migrateChannel.js`

**3-шаговый wizard**:

**Step 1: Eligibility Check & Confirmation**
- API call: `GET /shops/:shopId/migration/check`
- Показывает статистику: subscriber count, usage limits, reset date
- Проверяет PRO tier
- Кнопки: "✅ Продолжить" / "❌ Отмена"

**Step 2: New Channel URL Input**
- Запрос новой ссылки на канал
- Валидация формата (t.me/ или @username)
- Опционально: старая ссылка
- Кнопки: "⏭ Пропустить" (для старой ссылки) / "❌ Отмена"

**Step 3: Broadcast Execution**
- Создание migration record через API
- Вызов `broadcastService.broadcastMigration()`
- Real-time progress updates (каждые 10 сообщений)
- Финальный отчет: sent/failed/total
- Кнопка: "◀️ В главное меню"

**Progress Tracking**:
```
📡 Рассылка в процессе...
✅ Отправлено: 45/100
❌ Ошибок: 3
📊 Прогресс: 45%
```

#### 4.3 Buyer Handlers Updates
**Файл**: `bot/src/handlers/buyer/index.js`

**Функция `handleSubscribe()`**:
- Обновлена для передачи `ctx.from.id` как telegram_id
- API call: `subscriptionApi.subscribe(shopId, token, ctx.from.id)`

**Файл**: `bot/src/utils/api.js`
**Функция `subscriptionApi.subscribe()`**:
- Обновлена для приема 3-го параметра `telegramId`
- Отправляет telegramId в body запроса

#### 4.4 Seller Handlers
**Файл**: `bot/src/handlers/seller/index.js`

**Новый handler**:
```javascript
bot.action('seller:migrate_channel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter('migrate_channel');
});
```

#### 4.5 Bot Registration
**Файл**: `bot/src/bot.js`
- Import: `import migrateChannelScene from './scenes/migrateChannel.js'`
- Stage registration: добавлен `migrateChannelScene` в `Scenes.Stage`

---

## Архитектурные решения

### 1. Telegram ID Tracking
**Решение**: Сохранение telegram_id при подписке
- Подписчик → bot → subscriptionApi.subscribe() → backend → DB
- Telegram ID сохраняется в subscriptions.telegram_id
- При повторной подписке telegram_id обновляется (ON CONFLICT DO UPDATE)

### 2. PRO Tier System
**Решение**: Поле tier в shops table
- `'free'` (default) - базовая подписка
- `'pro'` (+$10) - расширенные возможности
- PRO features:
  - Безлимитные подписки на магазины (follows)
  - Channel Migration (2 раза/месяц)

### 3. Rate Limiting Strategy
**Решение**: Calendar month-based limits
- Лимит: 2 миграции в календарный месяц
- Сброс: 1-го числа каждого месяца
- Проверка через `rateLimit.canMigrate()`
- Хранение в channel_migrations table (COUNT по created_at)

### 4. Broadcast Architecture
**Решение**: Queue-based processing с Telegram rate limit compliance
- Sequential processing (не параллельно)
- Delay: 100ms между сообщениями
- Error resilience: ошибки не останавливают процесс
- Progress tracking: real-time updates через callback

### 5. Message Format
**Решение**: HTML-formatted notification
```
🔔 Важное обновление от магазина "Shop Name"

⚠️ Наш старый канал был заблокирован.

✅ Новый канал: https://t.me/new_channel

Подпишитесь, чтобы не пропустить важные обновления и новые товары!
```

---

## Файловая структура изменений

### Backend
```
backend/
├── database/
│   ├── migrations.cjs          [MODIFIED] +118 lines (addChannelMigrationFeature)
│   └── schema.sql              [MODIFIED] +30 lines (new fields & table)
├── src/
│   ├── controllers/
│   │   ├── migrationController.js    [NEW] 178 lines
│   │   └── subscriptionController.js [MODIFIED] +1 line (telegramId param)
│   ├── models/
│   │   └── db.js               [MODIFIED] +3 lines (telegram_id in query)
│   ├── routes/
│   │   └── shops.js            [MODIFIED] +44 lines (migration routes)
│   └── services/
│       ├── rateLimit.js        [NEW] 149 lines
│       └── broadcastService.js [NEW] 253 lines
```

### Bot
```
bot/
├── src/
│   ├── bot.js                  [MODIFIED] +2 lines (import & register)
│   ├── handlers/
│   │   ├── buyer/
│   │   │   └── index.js        [MODIFIED] +1 line (telegram_id param)
│   │   └── seller/
│   │       └── index.js        [MODIFIED] +10 lines (migrate_channel handler)
│   ├── keyboards/
│   │   └── seller.js           [MODIFIED] +12 lines (PRO button logic)
│   ├── scenes/
│   │   └── migrateChannel.js   [NEW] 262 lines (wizard scene)
│   └── utils/
│       └── api.js              [MODIFIED] +5 lines (telegramId param)
```

---

## API Endpoints Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/shops/:shopId/migration/check` | JWT | Проверка права на миграцию |
| POST | `/api/shops/:shopId/migration` | JWT | Создание migration record |
| GET | `/api/shops/:shopId/migration/:migrationId` | JWT | Статус миграции |
| GET | `/api/shops/:shopId/migration/history` | JWT | История миграций |

---

## Database Schema Summary

### channel_migrations
```sql
id                SERIAL PRIMARY KEY
shop_id           INT NOT NULL (FK: shops.id)
old_channel_url   TEXT
new_channel_url   TEXT NOT NULL
sent_count        INT DEFAULT 0
failed_count      INT DEFAULT 0
status            VARCHAR(20) CHECK IN ('pending', 'processing', 'completed', 'failed')
created_at        TIMESTAMP DEFAULT NOW()
started_at        TIMESTAMP
completed_at      TIMESTAMP
```

### subscriptions (new fields)
```sql
telegram_id       BIGINT
```

### shops (new fields)
```sql
tier              VARCHAR(20) DEFAULT 'free' CHECK IN ('free', 'pro')
```

---

## User Flow

### PRO Seller Migration Flow

1. **Seller открывает меню** → Видит кнопку "⚠️ Канал заблокирован" (только PRO)

2. **Нажимает кнопку** → Входит в wizard scene

3. **Step 1: Confirmation**
   - Видит статистику: 150 подписчиков, использовано 0/2 рассылок
   - Нажимает "✅ Продолжить"

4. **Step 2: New Channel URL**
   - Отправляет: `https://t.me/my_new_channel`
   - Опционально отправляет старую ссылку или нажимает "⏭ Пропустить"

5. **Step 3: Broadcast**
   - Видит progress bar: "✅ Отправлено: 75/150"
   - После завершения: "✅ Рассылка завершена! Отправлено: 147, Не доставлено: 3"

6. **Подписчики получают**:
   ```
   🔔 Важное обновление от магазина "My Shop"
   ⚠️ Наш старый канал был заблокирован.
   ✅ Новый канал: https://t.me/my_new_channel
   
   Подпишитесь, чтобы не пропустить важные обновления!
   ```

### Buyer Subscribe Flow (with telegram_id tracking)

1. **Buyer ищет магазин** → Находит и подписывается

2. **Bot отправляет API request**:
   ```json
   POST /api/subscriptions
   {
     "shopId": 123,
     "telegramId": "987654321"
   }
   ```

3. **Backend сохраняет**:
   ```sql
   INSERT INTO subscriptions (user_id, shop_id, telegram_id)
   VALUES (456, 123, 987654321)
   ON CONFLICT (user_id, shop_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
   ```

4. **Теперь seller может отправить broadcast** этому подписчику

---

## Security & Permissions

### Authorization Checks

1. **Shop Ownership** (все migration endpoints):
   ```javascript
   if (shop.owner_id !== userId) {
     return res.status(403).json({ error: 'Not authorized' });
   }
   ```

2. **PRO Tier** (`rateLimit.validateMigration()`):
   ```javascript
   if (!isPro) {
     return { valid: false, error: 'UPGRADE_REQUIRED' };
   }
   ```

3. **Rate Limits** (`rateLimit.canMigrate()`):
   ```javascript
   if (migrationsThisMonth >= 2) {
     return { allowed: false, remaining: 0 };
   }
   ```

### Input Validation

1. **Channel URL** (bot wizard):
   - Проверка формата: `t.me/` или `@username`
   - HTML escaping в сообщениях

2. **Shop ID** (backend):
   - parseInt() validation
   - Существование магазина проверяется через DB query

---

## Error Handling

### Bot Errors

1. **API Errors**:
   ```javascript
   catch (error) {
     const errorMsg = error.response?.data?.error || error.message;
     await ctx.reply(`❌ Ошибка: ${errorMsg}`);
   }
   ```

2. **Telegram API Errors**:
   - 403 (blocked): Logged, counter++, continue
   - 400 (not found): Logged, counter++, continue
   - Others: Logged, counter++, continue

### Backend Errors

1. **Migration Eligibility**:
   - Not PRO → `{ error: 'UPGRADE_REQUIRED', message: '...' }`
   - Limit exceeded → `{ error: 'LIMIT_EXCEEDED', message: '...' }`

2. **Broadcast Errors**:
   - Logged via `logger.error()`
   - Migration status set to 'failed'
   - Partial success tracked (sent_count / failed_count)

---

## Testing Checklist

### Database
- [x] Миграция выполняется без ошибок
- [x] Индексы создаются корректно
- [x] Таблицы доступны через psql

### Backend
- [ ] GET /migration/check возвращает correct eligibility
- [ ] POST /migration создает migration record
- [ ] broadcastService отправляет сообщения с delay 100ms
- [ ] rateLimit корректно считает migrations this month

### Bot
- [ ] PRO users видят кнопку миграции
- [ ] Free users НЕ видят кнопку миграции
- [ ] Wizard проходит все 3 шага успешно
- [ ] Progress updates показываются в real-time
- [ ] Buyer subscribe сохраняет telegram_id
- [ ] Подписчики получают broadcast сообщения

### Integration
- [ ] End-to-end flow: PRO seller → wizard → broadcast → subscribers receive
- [ ] Rate limit блокирует 3-ю миграцию в месяце
- [ ] Free tier не может использовать миграцию
- [ ] telegram_id сохраняется при подписке

---

## Performance Considerations

### Broadcast Speed
- 100 subscribers: ~10 seconds (100ms delay)
- 1000 subscribers: ~100 seconds (~1.7 minutes)
- 10000 subscribers: ~1000 seconds (~16 minutes)

### Database Queries
- `getShopSubscribers()`: Index on shop_id + telegram_id IS NOT NULL
- `canMigrate()`: Index on shop_id + created_at (month range)
- Efficient для shops с тысячами подписчиков

### Memory
- Broadcast process: Sequential (не загружает всех subscribers в память)
- Progress callback: Minimal overhead (каждые 10 messages)

---

## Future Enhancements

1. **Scheduled Broadcasts**: Отложенная отправка
2. **Custom Messages**: Персонализация текста уведомления
3. **Analytics Dashboard**: Графики миграций, успешность доставки
4. **Multi-channel Support**: Миграция нескольких каналов одновременно
5. **A/B Testing**: Разные тексты для разных групп подписчиков
6. **Email Fallback**: Email уведомления если Telegram недоступен

---

## Conclusion

Функция "Channel Migration" полностью реализована и готова к тестированию. Все компоненты интегрированы:

- ✅ Database schema updated
- ✅ Backend services implemented
- ✅ API endpoints created
- ✅ Bot wizard scene complete
- ✅ Telegram ID tracking active
- ✅ PRO tier system integrated
- ✅ Rate limiting enforced

**Следующий шаг**: Manual testing в dev environment для проверки полного flow.

---

**Автор**: Claude Code  
**Дата**: 2025-10-24  
**Статус**: Implementation Complete ✅
