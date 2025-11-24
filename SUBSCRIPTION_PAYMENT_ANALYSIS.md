# Telegram Shop - Subscription Payment System Analysis

**Проблема:** Система оплаты подписок не работает уже месяц. Последняя ошибка: `canceling statement due to statement timeout` + ранее `FOR UPDATE cannot be applied to the nullable side of an outer join`.

---

## 📊 Технический Стек

### Backend
- **Node.js** (ES Modules)
- **Express.js** REST API
- **PostgreSQL** (без ORM, чистый SQL)
- **JWT** authentication
- **Winston** logging

### Blockchain Integration
- **BTC/LTC:** BlockCypher API + webhooks
- **ETH/USDT_ERC20:** Etherscan API + polling
- **USDT_TRC20:** TronGrid API + polling
- **HD Wallets:** `bitcoinjs-lib`, `@ethereumjs/wallet`

### Pricing
- **CoinGecko API:** USD → Crypto conversion
- **Tolerance:** 1% для учёта комиссий сети

---

## 🔄 Flow Оплаты Подписки (Как Должно Работать)

### Шаг 1: Создание Pending Subscription
**Endpoint:** `POST /api/subscriptions/pending`

**Request:**
```json
{
  "tier": "basic" или "pro"
}
```

**Logic** (`subscriptionController.js:790-850`):
1. Проверить есть ли у пользователя активный магазин
2. Если есть → вернуть существующую подписку
3. Если нет → создать pending подписку:
   - `shop_id = NULL` (магазин создастся после оплаты!)
   - `status = 'pending'`
   - `amount = SUBSCRIPTION_PRICES[tier]` (сейчас $1 для тестирования)
   - `period_end = NOW() + 30 days`
   - `tx_hash = 'pending-{userId}-{timestamp}'` (временный)

**Response:**
```json
{
  "success": true,
  "subscription": { "id": 44, "tier": "pro", "status": "pending" }
}
```

---

### Шаг 2: Генерация Invoice
**Endpoint:** `POST /api/subscriptions/:subscriptionId/invoice`

**Request:**
```json
{
  "chain": "BTC" | "LTC" | "ETH" | "USDT_TRC20"
}
```

**Logic** (`subscriptionInvoiceService.js:57-243`):

1. **Получить subscription из БД:**
   ```sql
   SELECT ss.*, COALESCE(s.tier, ss.tier) as tier
   FROM shop_subscriptions ss
   LEFT JOIN shops s ON ss.shop_id = s.id
   WHERE ss.id = $1
   ```

2. **Определить USD amount:**
   ```javascript
   const usdAmount = SUBSCRIPTION_PRICES[tier]; // $1 для basic и pro
   ```

3. **Конвертировать USD → Crypto:**
   ```javascript
   const conversionResult = await cryptoPriceService.convertAndRound(usdAmount, chain);
   cryptoAmount = parseFloat(conversionResult.cryptoAmount); // ВАЖНО: parseFloat!
   usdRate = parseFloat(conversionResult.usdRate);
   ```

4. **Сгенерировать уникальный адрес:**
   - Получить следующий index из БД
   - Derive адрес из HD wallet xpub
   - Пример: `m/0/{index}` для BTC

5. **Зарегистрировать webhook** (только BTC/LTC):
   ```javascript
   webhookId = await blockCypherService.registerWebhook(chain, address, callbackUrl, 3);
   ```

6. **Создать invoice в БД:**
   ```sql
   INSERT INTO invoices (
     subscription_id, chain, address, address_index,
     expected_amount, crypto_amount, usd_rate, currency,
     expires_at, status, purpose
   ) VALUES (
     $subscriptionId, $chain, $address, $index,
     $usdAmount, $cryptoAmount, $usdRate, $currency,
     NOW() + INTERVAL '30 minutes', 'pending', 'subscription'
   )
   ```

**Response:**
```json
{
  "success": true,
  "invoice": {
    "invoiceId": 50,
    "address": "bc1q...",
    "expectedAmount": 1.0,       // USD для отображения
    "cryptoAmount": 0.0000123,   // ТОЧНАЯ сумма в BTC
    "currency": "BTC",
    "expiresAt": "2025-11-22T14:30:00Z"
  }
}
```

---

### Шаг 3: Пользователь Отправляет Платёж

Пользователь отправляет **ровно** `cryptoAmount` BTC на адрес `address`.

Пример:
- Invoice требует: `0.0000123 BTC`
- Пользователь отправил: `0.0000122 BTC` (с учётом комиссии сети)
- Tolerance 1%: `0.0000123 ± 0.00000012` → PASS

---

### Шаг 4: Подтверждение Платежа

**Два способа:**

#### 4a. Webhook (BTC/LTC)
BlockCypher отправляет POST на `/api/webhooks/blockcypher`:
```json
{
  "address": "bc1q...",
  "confirmations": 3,
  "hash": "49f412c2...",
  "total": 1230 // satoshi
}
```

Backend обрабатывает webhook → вызывает `processSubscriptionPayment()`.

#### 4b. Manual Confirm (Все chains)
**Endpoint:** `POST /api/subscriptions/:subscriptionId/payment/confirm`

**Request:**
```json
{
  "txHash": "49f412c21e5ea564febcbc742ade065a0df15d61f3ac8dea4b0547036d489d9f"
}
```

**Logic** (`subscriptionController.js:700-750`):
```javascript
const result = await invoicePaymentService.processSubscriptionPayment(
  invoiceId,
  txHash,
  userId
);
```

---

### Шаг 5: processSubscriptionPayment (Главная Функция)

**File:** `backend/src/services/invoicePaymentService.js:750-950`

**Что делает:**

```javascript
export async function processSubscriptionPayment(invoiceId, txHash, actorUserId) {
  const client = await getClient(); // PostgreSQL transaction

  try {
    await client.query('BEGIN');

    // 1. Lock invoice (prevent double-processing)
    await lockByInvoice(client, invoiceId);

    // 2. Get invoice from DB
    const invoice = await client.query(
      'SELECT * FROM invoices WHERE id = $1',
      [invoiceId]
    );

    // 3. Check invoice not expired/paid
    const activeCheck = await ensureInvoiceActive(invoice, client);
    if (!activeCheck.active) {
      throw new Error('Invoice expired or already paid');
    }

    // 4. Get subscription and lock it
    const subscription = await validateAndLockSubscription(
      client,
      invoice.subscription_id,
      actorUserId
    );

    // 5. Build payment context (extract crypto amount from invoice)
    const paymentContext = buildPaymentContext(invoice);
    // Returns: { address, amount (crypto!), currency, chain }

    // 6. Verify transaction on blockchain
    const verification = await paymentVerificationService.verifyPayment({
      chain: paymentContext.chain,
      address: paymentContext.address,
      expectedAmount: paymentContext.amount, // crypto amount!
      txHash,
    });

    if (!verification.success) {
      throw new Error('Payment not found on blockchain');
    }

    // 7. Check amounts match (with 1% tolerance)
    const amountMatch = amountsMatchWithTolerance(
      verification.amount,    // actual paid amount
      paymentContext.amount,  // expected crypto amount
      0.01                     // 1% tolerance
    );

    if (!amountMatch) {
      throw new Error('Payment amount mismatch');
    }

    // 8. Check tx not reused
    await guardTxReuse(client, txHash, { subscriptionId: subscription.id });

    // 9. Create payment record
    await attachPaymentRecord(client, {
      invoice,
      subscription,
      verification,
      paymentContext,
    });

    // 10. Activate subscription
    if (subscription.shop_id) {
      // Subscription already has shop - just update
      await client.query(
        `UPDATE shop_subscriptions
         SET status = 'active', period_start = NOW(), period_end = NOW() + INTERVAL '30 days'
         WHERE id = $1`,
        [subscription.id]
      );
    } else {
      // NO SHOP - auto-create one!
      const user = await client.query('SELECT * FROM users WHERE id = $1', [subscription.user_id]);

      // Check if user already has a shop (race condition prevention)
      const existingShop = await client.query(
        'SELECT id FROM shops WHERE owner_id = $1 AND is_active = true LIMIT 1',
        [subscription.user_id]
      );

      let shop;
      if (existingShop.rows.length > 0) {
        shop = existingShop.rows[0]; // Use existing
      } else {
        // Create new shop
        const shopName = `Shop_${user.username}_${Date.now()}`;
        shop = await client.query(
          `INSERT INTO shops (name, owner_id, tier, subscription_status, is_active)
           VALUES ($1, $2, $3, 'active', true)
           RETURNING id`,
          [shopName, user.id, subscription.tier]
        );
      }

      // Link subscription to shop
      await client.query(
        `UPDATE shop_subscriptions
         SET shop_id = $1, status = 'active', period_start = NOW(), period_end = NOW() + INTERVAL '30 days'
         WHERE id = $2`,
        [shop.id, subscription.id]
      );
    }

    // 11. Mark invoice as paid
    await client.query(
      `UPDATE invoices SET status = 'paid' WHERE id = $1`,
      [invoiceId]
    );

    await client.query('COMMIT');

    return { ok: true, state: 'completed' };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

## 🐛 Текущие Проблемы

### Проблема #1: Statement Timeout (СЕЙЧАС)
**Ошибка:**
```
error: canceling statement due to statement timeout
at validateAndLockSubscription (invoicePaymentService.js:168)
```

**Где происходит:**
```javascript
async function validateAndLockSubscription(client, subscriptionId, actorUserId) {
  // Line 164
  const subResult = await client.query(
    `SELECT * FROM shop_subscriptions WHERE id = $1 FOR UPDATE`,
    [subscriptionId]
  );
  // TIMEOUT HERE! ^^^
}
```

**Почему:**
- Возможно deadlock
- Возможно другой процесс держит lock на этой строке
- PostgreSQL `statement_timeout` = 30s (по умолчанию)

### Проблема #2: FOR UPDATE на LEFT JOIN (ИСПРАВЛЕНА)
**Было:**
```sql
SELECT ss.*, COALESCE(s.owner_id, ss.user_id) AS owner_id
FROM shop_subscriptions ss
LEFT JOIN shops s ON ss.shop_id = s.id
WHERE ss.id = $1
FOR UPDATE  -- ERROR! Can't lock nullable side
```

**Исправлено:**
```sql
-- Lock subscription first
SELECT * FROM shop_subscriptions WHERE id = $1 FOR UPDATE

-- Then get owner_id separately
SELECT owner_id FROM shops WHERE id = $2
```

### Проблема #3: crypto_amount как строка (ИСПРАВЛЕНА)
**Было:**
```javascript
cryptoAmount = conversionResult.cryptoAmount; // "0.0000123" (string)
```

**Исправлено:**
```javascript
cryptoAmount = parseFloat(conversionResult.cryptoAmount); // 0.0000123 (number)
```

### Проблема #4: Fallback на USD (ИСПРАВЛЕНА)
**Было:**
```javascript
const amount = parseFloat(invoice.crypto_amount || invoice.expected_amount);
// Если crypto_amount = null, используется expected_amount (USD!)
// Сравнение: 0.0000123 BTC vs 1 USD → FAIL
```

**Исправлено:**
```javascript
if (!invoice.crypto_amount) {
  throw new ValidationError('Invoice missing crypto_amount');
}
const amount = parseFloat(invoice.crypto_amount);
```

---

## 📁 Database Schema (Важные Таблицы)

### shop_subscriptions
```sql
CREATE TABLE shop_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  shop_id INTEGER REFERENCES shops(id),  -- NULL для pending!
  tier VARCHAR(20) CHECK (tier IN ('basic', 'pro')),
  amount NUMERIC(10,2),                   -- USD amount
  tx_hash VARCHAR(255),
  currency VARCHAR(20),
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  status VARCHAR(20) CHECK (status IN ('pending', 'active', 'expired', 'cancelled'))
);
```

### invoices
```sql
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER REFERENCES shop_subscriptions(id),
  order_id INTEGER REFERENCES orders(id),
  chain VARCHAR(20),
  address VARCHAR(255) UNIQUE,
  address_index INTEGER,
  expected_amount NUMERIC(20,8),    -- USD amount
  crypto_amount NUMERIC(20,8),       -- EXACT crypto amount
  usd_rate NUMERIC(20,2),            -- Exchange rate
  currency VARCHAR(20),
  expires_at TIMESTAMP,
  status VARCHAR(20),
  purpose VARCHAR(50),
  tatum_subscription_id VARCHAR(255)
);
```

### payments
```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  subscription_id INTEGER REFERENCES shop_subscriptions(id),
  tx_hash VARCHAR(255) UNIQUE,
  amount NUMERIC(20,8),
  currency VARCHAR(20),
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔍 Debugging Info

### Последний тестовый запрос:
- **subscription_id:** 44
- **invoice_id:** 50
- **txHash:** `49f412c21e5ea564febcbc742ade065a0df15d61f3ac8dea4b0547036d489d9f`
- **tier:** pro
- **expected amount:** $1 USD
- **chain:** (неизвестно, но скорее всего BTC/ETH)

### Логи показывают:
1. Создание pending subscription → OK
2. Создание invoice → OK
3. Подтверждение платежа → **TIMEOUT на validateAndLockSubscription**

### Проверить в БД:
```sql
-- Subscription
SELECT * FROM shop_subscriptions WHERE id = 44;

-- Invoice
SELECT * FROM invoices WHERE id = 50;

-- Есть ли зависшие locks?
SELECT * FROM pg_locks WHERE relation = 'shop_subscriptions'::regclass;

-- Какие процессы держат locks?
SELECT pid, state, query, wait_event_type, wait_event
FROM pg_stat_activity
WHERE datname = 'telegram_shop'
AND state != 'idle';
```

---

## 🎯 Вопросы к DeepThink

1. **Почему происходит statement timeout на `FOR UPDATE`?**
   - Deadlock между polling service и manual confirm?
   - Другой процесс держит lock?
   - Нужно ли изменить стратегию блокировок?

2. **Правильная ли логика с `shop_id = NULL`?**
   - Pending subscription без магазина
   - Магазин создаётся после оплаты
   - Может это создаёт проблемы?

3. **Есть ли race conditions?**
   - Webhook + manual confirm одновременно
   - Polling service + user request
   - Нужны ли advisory locks?

4. **Правильная ли последовательность блокировок?**
   ```javascript
   // Сейчас:
   lockByInvoice(invoiceId)              // advisory lock
   validateAndLockSubscription(subId)     // FOR UPDATE

   // Может нужно:
   lockBySubscription(subId)              // advisory lock
   getInvoice(invoiceId)                  // no lock needed
   ```

5. **Нужно ли убрать polling во время manual confirm?**
   - Polling service может обрабатывать тот же invoice
   - Конфликт locks?

---

## 💡 Возможные Решения (Гипотезы)

### Решение A: Advisory Locks вместо FOR UPDATE
```javascript
async function validateAndLockSubscription(client, subscriptionId) {
  // Advisory lock на subscription_id (не блокирует SELECT)
  await client.query('SELECT pg_advisory_xact_lock($1)', [subscriptionId]);

  // Обычный SELECT без FOR UPDATE
  const sub = await client.query(
    'SELECT * FROM shop_subscriptions WHERE id = $1',
    [subscriptionId]
  );

  return sub.rows[0];
}
```

### Решение B: Отдельная таблица payment_locks
```sql
CREATE TABLE payment_locks (
  subscription_id INTEGER PRIMARY KEY,
  locked_at TIMESTAMP DEFAULT NOW(),
  locked_by VARCHAR(50) -- 'webhook' | 'manual' | 'polling'
);
```

### Решение C: Убрать дублирование блокировок
Сейчас:
1. `lockByInvoice()` - advisory lock на invoice_id
2. `validateAndLockSubscription()` - FOR UPDATE на subscription

Может хватит только одного?

### Решение D: Идемпотентность
Если подписка уже активна и оплачена - просто возвращать success:
```javascript
if (subscription.status === 'active' && invoice.status === 'paid') {
  return { ok: true, state: 'completed', message: 'Already processed' };
}
```

---

## 🚨 Критичные Моменты

1. **Нельзя терять деньги!** Если пользователь оплатил, но система упала - деньги должны зачислиться.
2. **Нельзя дублировать подписки!** Один платёж = одна подписка.
3. **TX hash уникален!** Один tx_hash нельзя использовать дважды.
4. **30 минут на оплату!** Invoice expiration.

---

## 📝 Следующие Шаги

1. **DeepThink анализирует документ**
2. **DeepThink предлагает решение**
3. **Реализуем по его инструкциям**
4. **Тестируем оплату end-to-end**

---

**Автор:** Claude Code
**Дата:** 2025-11-22
**Статус:** Ждём решения от DeepThink
