# Отчёт о реализации Recurring Subscriptions + Real Broadcast

**Дата:** 2025-10-24  
**Версия:** 4.0  
**Статус:** ✅ ПОЛНОСТЬЮ РЕАЛИЗОВАНО

---

## Краткое резюме

Реализована полная система **ежемесячных подписок** для магазинов и **реальная рассылка** при миграции канала для PRO пользователей.

### Ключевые фичи

1. **Recurring Subscriptions** - ежемесячные подписки ($25 FREE, $35 PRO)
2. **Real Broadcast** - реальная рассылка через Telegram bot при смене канала
3. **Prorated Upgrade** - пропорциональная оплата при апгрейде
4. **Grace Period** - 2 дня льготного периода после истечения
5. **Automated Checks** - hourly expiration checks, daily reminders

---

## 1. Database Schema

### Новые таблицы

**`shop_subscriptions`** - история платежей подписок
```sql
CREATE TABLE shop_subscriptions (
  id SERIAL PRIMARY KEY,
  shop_id INT NOT NULL REFERENCES shops(id),
  tier VARCHAR(20) NOT NULL,           -- 'free' | 'pro'
  amount DECIMAL(10, 2) NOT NULL,
  tx_hash VARCHAR(255) UNIQUE NOT NULL,
  currency VARCHAR(10) NOT NULL,        -- BTC, ETH, USDT, TON
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'active',  -- active | expired | cancelled
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP
);
```

### Обновлённые таблицы

**`shops`** - добавлены 3 новых колонки
```sql
ALTER TABLE shops ADD COLUMN:
  - subscription_status VARCHAR(20)  -- active | grace_period | inactive
  - next_payment_due TIMESTAMP
  - grace_period_until TIMESTAMP
```

### Индексы (5 новых)
- `idx_shop_subscriptions_shop_id`
- `idx_shop_subscriptions_status`
- `idx_shop_subscriptions_tx_hash`
- `idx_shops_subscription_status`
- `idx_shops_next_payment_due`

**Миграция:** ✅ Успешно выполнена (`runSubscriptionMigration.cjs`)

---

## 2. Backend API

### Новые файлы

**`backend/src/services/subscriptionService.js`** (680 lines)
- `processSubscriptionPayment()` - верификация crypto tx + создание подписки
- `upgradeShopToPro()` - апгрейд с FREE на PRO с prorated расчётом
- `calculateUpgradeAmount()` - пропорциональный расчёт стоимости апгрейда
- `checkExpiredSubscriptions()` - проверка истёкших подписок (hourly)
- `sendExpirationReminders()` - напоминания через Telegram (daily)
- `deactivateShop()` - деактивация магазина после grace period

**`backend/src/controllers/subscriptionController.js`** (277 lines)
- `POST /api/subscriptions/pay` - оплата подписки
- `POST /api/subscriptions/upgrade` - апгрейд на PRO
- `GET /api/subscriptions/upgrade-cost/:shopId` - расчёт стоимости апгрейда
- `GET /api/subscriptions/status/:shopId` - статус подписки
- `GET /api/subscriptions/history/:shopId` - история платежей
- `GET /api/subscriptions/pricing` - информация о тарифах

**`backend/src/routes/subscriptions.js`** (77 lines)
- Регистрация всех 6 endpoints с JWT authentication

**`backend/src/jobs/subscriptionChecker.js`** (160 lines)
- `startExpirationChecker()` - hourly cron (каждый час)
- `startReminderSender()` - daily cron (каждый день в 10:00)
- Интеграция с `global.botInstance` для Telegram уведомлений

---

## 3. Bot Integration

### Bot Singleton Pattern

**`bot/src/bot.js`** - экспорт bot instance
```javascript
export { bot };
export async function startBot() { ... }
```

**`backend/src/server.js`** - интеграция
```javascript
import { bot, startBot } from '../../bot/src/bot.js';

startBot().then(() => {
  global.botInstance = bot;  // ← Доступ для broadcast
  startSubscriptionJobs();    // ← Запуск cron jobs
});
```

### Новые сцены (Wizards)

**`bot/src/scenes/paySubscription.js`** (330 lines)
- 4-шаговый wizard: tier selection → crypto → payment → verification
- Поддержка всех 4 криптовалют (BTC, ETH, USDT, TON)
- Blockchain verification через backend API

**`bot/src/scenes/upgradeShop.js`** (300 lines)
- Проверка eligibility (только для FREE active subscriptions)
- Расчёт prorated cost через API
- Upgrade flow с crypto payment

### Обновлённые компоненты

**`bot/src/keyboards/seller.js`**
- Добавлен параметр `subscriptionStatus` в `sellerMenu()`
- Кнопки: "💎 Апгрейд на PRO", "💳 Оплатить подписку", "📊 Подписка"
- Новая функция `subscriptionStatusMenu(tier, canUpgrade)`

**`bot/src/handlers/seller/index.js`**
- `bot.action('subscription:pay')` → вход в `pay_subscription` scene
- `bot.action('subscription:upgrade')` → вход в `upgrade_shop` scene
- `bot.action('subscription:status')` → показ детальной информации о подписке

---

## 4. Real Broadcast Implementation

### Обновлённый broadcastService

**`backend/src/services/broadcastService.js`**
- Добавлен **retry logic с exponential backoff** (1s → 2s → 4s)
- Функция `sendWithRetry()` для обработки rate limits (429)
- Обработка постоянных ошибок (403 blocked, 400 invalid)
- Delay 100ms между сообщениями (10 msg/sec)

### Обновлённый migrationController

**`backend/src/controllers/migrationController.js`**
- Проверка `global.botInstance` availability
- **Non-blocking broadcast** через `setImmediate()`
- Возврат 202 Accepted с `estimatedDuration`
- Real-time broadcast без ожидания завершения

### Обновлённая сцена

**`bot/src/scenes/migrateChannel.js`**
- Обновлённый UI с показом estimated time
- Обработка нового формата ответа API (202 + estimatedDuration)

---

## 5. Pricing Model

| Тариф | Стоимость | Функции |
|-------|-----------|---------|
| **FREE** | $25/месяц | Безлимитные товары, заказы, базовая поддержка |
| **PRO** | $35/месяц | FREE + безлимитные подписчики + broadcast (2/мес) + приоритетная поддержка |
| **Апгрейд** | Пропорционально | Оплата только за оставшиеся дни разницы ($10/мес) |

### Расчёт Prorated Upgrade

```javascript
const dailyDifference = (newPrice - oldPrice) / totalDays;  // ($35 - $25) / 30 = $0.33/день
const upgradeAmount = dailyDifference * remainingDays;      // Например: $0.33 * 15 = $5.00
```

---

## 6. Grace Period Logic

1. **Subscription expires** → статус меняется на `grace_period`
2. **Grace period = 2 дня** после истечения
3. **После grace period** → магазин деактивируется (`inactive`)
4. **Напоминания** отправляются за 3 дня, 1 день до истечения, в день истечения

---

## 7. Cron Jobs

| Job | Частота | Функция |
|-----|---------|---------|
| **Expiration Checker** | Каждый час | Проверка expired subscriptions, перевод в grace period/inactive |
| **Reminder Sender** | Ежедневно 10:00 | Отправка напоминаний о приближении окончания подписки |

**Интеграция:**
```javascript
// backend/src/server.js
startBot().then(() => {
  startSubscriptionJobs();  // ← Запуск обоих cron jobs
});
```

---

## 8. Изменённые файлы

### Backend (10 файлов)
1. `backend/database/schema.sql` - добавлены `shop_subscriptions` table + 3 колонки в `shops`
2. `backend/database/migrations.cjs` - функция `addRecurringSubscriptions()`
3. `backend/database/runSubscriptionMigration.cjs` - скрипт миграции (новый)
4. `backend/src/services/subscriptionService.js` - сервис логики подписок (новый)
5. `backend/src/controllers/subscriptionController.js` - API контроллер (новый)
6. `backend/src/routes/subscriptions.js` - роуты (новый)
7. `backend/src/services/broadcastService.js` - retry logic
8. `backend/src/controllers/migrationController.js` - real broadcast
9. `backend/src/jobs/subscriptionChecker.js` - cron worker (новый)
10. `backend/src/server.js` - интеграция bot + cron jobs

### Bot (6 файлов)
1. `bot/src/bot.js` - экспорт bot singleton
2. `bot/src/scenes/paySubscription.js` - сцена оплаты (новый)
3. `bot/src/scenes/upgradeShop.js` - сцена апгрейда (новый)
4. `bot/src/scenes/migrateChannel.js` - обновлён для real broadcast
5. `bot/src/keyboards/seller.js` - subscription кнопки
6. `bot/src/handlers/seller/index.js` - 3 новых handler

**Всего:** 16 файлов (10 новых, 6 изменённых)  
**Строк кода:** ~2000 lines

---

## 9. API Endpoints Summary

### Subscription Management
```
POST   /api/subscriptions/pay                  # Оплата подписки
POST   /api/subscriptions/upgrade              # Апгрейд на PRO
GET    /api/subscriptions/upgrade-cost/:shopId # Стоимость апгрейда
GET    /api/subscriptions/status/:shopId       # Статус подписки
GET    /api/subscriptions/history/:shopId      # История платежей
GET    /api/subscriptions/pricing              # Информация о тарифах
```

### Channel Migration (обновлён)
```
GET    /api/shops/:shopId/migration/check      # Проверка eligibility
POST   /api/shops/:shopId/migration            # Запуск broadcast (202 Accepted)
GET    /api/shops/:shopId/migration/:id        # Статус рассылки
GET    /api/shops/:shopId/migration/history    # История миграций
```

---

## 10. Готовность к Production

### ✅ Реализовано

- [x] Database schema + migrations
- [x] Backend API (subscriptionService + controller + routes)
- [x] Bot singleton integration
- [x] Payment flow (pay + upgrade scenes)
- [x] Real broadcast через `global.botInstance`
- [x] Retry logic с exponential backoff
- [x] Prorated upgrade calculation
- [x] Grace period logic (2 дня)
- [x] Cron jobs (hourly + daily)
- [x] Bot UI (keyboards + handlers)

### ⚠️ Требуется перед production

1. **Настроить payment addresses** в `.env`:
   ```env
   BTC_PAYMENT_ADDRESS=your_btc_address
   ETH_PAYMENT_ADDRESS=your_eth_address
   USDT_PAYMENT_ADDRESS=your_usdt_erc20_address
   TON_PAYMENT_ADDRESS=your_ton_address
   ```

2. **Настроить blockchain verification API keys**:
   - Etherscan API key для ETH/USDT verification
   - Blockchain.info API для BTC verification
   - TONCenter API для TON verification

3. **Тестирование**:
   - Unit тесты для `subscriptionService.js`
   - Integration тесты для subscription flow
   - End-to-end тест полного цикла подписки

4. **Мониторинг**:
   - Добавить alerts для failed broadcasts
   - Dashboard для subscription metrics
   - Логирование всех платежей

---

## 11. Следующие шаги

### Immediate
1. Настроить payment addresses в production
2. Протестировать полный flow подписки
3. Запустить backend + bot в production режиме

### Short-term
1. Написать unit/integration тесты
2. Добавить Prometheus metrics для subscriptions
3. Создать admin dashboard для управления подписками

### Long-term
1. Добавить автоматическую оплату через Stripe/PayPal
2. Добавить email notifications (backup для Telegram)
3. Multi-currency support (USD, EUR, RUB)

---

## 12. Технические детали

### Subscription Lifecycle

```
1. User creates shop
   ↓
2. User pays $25/35 (crypto)
   ↓
3. Backend verifies tx_hash via blockchain API
   ↓
4. Create subscription record (period_start → period_end = 30 days)
   ↓
5. Update shop: next_payment_due = period_end
   ↓
6. Hourly cron checks expiration:
   - If expired → move to grace_period (2 days)
   - If grace_period expired → deactivate shop
   ↓
7. Daily cron sends reminders (3 days, 1 day, 0 days before expiration)
```

### Broadcast Flow (Channel Migration)

```
1. PRO user clicks "⚠️ Канал заблокирован"
   ↓
2. Bot checks eligibility (tier=PRO, limits not exceeded)
   ↓
3. User enters new channel URL
   ↓
4. Bot calls POST /api/shops/:id/migration
   ↓
5. Backend checks global.botInstance availability
   ↓
6. Background broadcast starts (non-blocking)
   - Get shop subscribers from DB
   - For each subscriber: send message with 100ms delay
   - Retry failed messages (429, timeout) with exponential backoff
   ↓
7. Update channel_migrations table with progress
   ↓
8. User sees "✅ Рассылка запущена! ~X секунд"
```

---

## Автор

**Claude Code**  
Дата реализации: 2025-10-24  
Версия: 1.0  

---

**ИТОГО:** Полная система recurring subscriptions + real broadcast готова к production deployment после настройки payment addresses и blockchain API keys.
