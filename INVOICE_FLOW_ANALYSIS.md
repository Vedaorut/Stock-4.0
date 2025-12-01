# Invoice Generation Flow Analysis - Status Stock 4.0

## Summary
Проведён полный анализ flow генерации счетов в Status Stock 4.0. Система использует **CrystalPay** для платежей по подпискам (не требует адресов кошельков) и **прямые платежи на адреса** для заказов.

---

## 1. WebApp Flow (Frontend)

### PaymentFlowManager.jsx
**Файл:** `/Users/sile/Documents/Status Stock 4.0/webapp/src/components/Payment/PaymentFlowManager.jsx`

- Простой компонент-оркестратор, управляет всеми модальными окнами:
  - `PaymentMethodModal` — выбор способа оплаты (Crypto)
  - `PaymentDetailsModal` — показывает детали платежа
  - `PaymentHashModal` — ввод хеша транзакции
  - `OrderStatusModal` — статус заказа
  - **Error Boundary** для обработки неожиданных ошибок

### PaymentDetailsModal.jsx (Главное)
**Файл:** `/Users/sile/Documents/Status Stock 4.0/webapp/src/components/Payment/PaymentDetailsModal.jsx`

**Основные данные из state:**
```javascript
{
  paymentStep,           // 'details' — открытые модали
  selectedCrypto,        // 'BTC', 'LTC'
  paymentWallet,         // Адрес для отправки (из store)
  currentOrder,          // { quantity, total_price }
  cryptoAmount,          // Рассчитанная сумма в крипто
  setPaymentStep,        // Переход к следующему шагу
  isGeneratingInvoice    // Loading state
}
```

**Что показывает:**
1. **QR код** (ленивая загрузка с qrcode.react)
2. **Адрес кошелька** (копируемый) 
3. **Сумма в крипто** (копируемая)
4. **Кнопка "Я оплатил"** → переход к `hash` step

**Валидация:**
- Проверяет наличие `cryptoInfo` (криптовалюта существует)
- Проверяет наличие `currentOrder`, `paymentWallet`, `cryptoAmount > 0`
- Показывает ошибку, если данные отсутствуют

---

## 2. Backend API Routes

### Payments Routes
**Файл:** `/Users/sile/Documents/Status Stock 4.0/backend/src/routes/payments.js`

#### POST `/api/payments/subscriptions/:id/invoice/crystalpay`
**Цель:** Создание счета для оплаты подписки через CrystalPay

**Входные данные:**
```javascript
POST /api/payments/subscriptions/:id/invoice/crystalpay
{
  method: 'BITCOIN' | 'LITECOIN',
  purpose: 'subscription_new' | 'subscription_renewal' | 'subscription_upgrade'
}
```

**Валидация:**
1. `method` ∈ ['BITCOIN', 'LITECOIN']
2. `purpose` ∈ ['subscription_new', 'subscription_renewal', 'subscription_upgrade']
3. Subscription существует: `subscriptionQueries.findShopSubscriptionById(subscriptionId)`
4. **SECURITY P1-SEC-004:** Проверка владения подпиской:
   ```javascript
   if (subscription.owner_id !== userId) {
     return 403 'Access denied: not subscription owner'
   }
   ```

**Получение суммы:**
```javascript
const amountUsd = getPrice(subscription.tier); // Из subscriptionPricing.js
// Цены: basic=$25, pro=$35
```

**Ответ:**
```javascript
{
  invoiceId: number,
  paymentUrl: string,        // CrystalPay платежный URL
  crystalPayId: string,      // ID в системе CrystalPay
  amount: number,            // Сумма в USD
  method: 'BITCOIN' | 'LITECOIN'
}
```

#### GET `/api/payments/invoices/:id/status`
**Цель:** Проверка статуса счёта

**Валидация (IDOR Protection P1-SEC-005):**
```javascript
// Пользователь имеет доступ, если:
// 1. Покупатель заказа (для order invoices)
const isBuyer = invoice.buyer_id === userId;

// 2. Владелец магазина (для order invoices)  
const isOrderShopOwner = invoice.order_shop_owner_id === userId;

// 3. Владелец магазина с подпиской (для subscription invoices)
const isSubscriptionOwner = invoice.subscription_owner_id === userId;
```

**Ответ:**
```javascript
{
  status: 'pending' | 'paid' | 'expired'
}
```

---

## 3. Backend Services

### subscriptionInvoiceService.js
**Файл:** `/Users/sile/Documents/Status Stock 4.0/backend/src/services/subscriptionInvoiceService.js`

#### `createCrystalPayInvoice()`

**Шаги создания счёта:**

1. **Создание внутреннего счёта**
   ```javascript
   invoiceQueries.createForCrystalPay({
     subscriptionId,
     purpose,              // 'subscription_new', etc.
     currency: 'USD',
     amount: amountUsd
   })
   ```
   
   **SQL:**
   ```sql
   INSERT INTO invoices (
     subscription_id, chain, address, address_index,
     expected_amount, currency, expires_at, status, purpose
   ) VALUES (
     $1, 'CRYSTALPAY', NULL, NULL, $2, $3, 
     NOW() + INTERVAL '1 hour', 'pending', $4
   ) RETURNING *
   ```
   
   **Обязательные поля:**
   - `subscription_id` — ID подписки
   - `chain` = 'CRYSTALPAY' (всегда для CrystalPay)
   - `address` = NULL (не нужен для CrystalPay)
   - `expected_amount` — сумма USD
   - `currency` = 'USD'
   - `expires_at` = NOW() + 1 hour
   - `status` = 'pending'
   - `purpose` — зачем счёт

2. **Запрос в CrystalPay API**
   ```javascript
   const crystalInvoice = await crystalPayService.createInvoice({
     amount: amountUsd,
     method,                                    // 'BITCOIN' | 'LITECOIN'
     description: `Subscription #${subscriptionId} - ${purpose}`,
     extra: String(invoice.id),                // Ссылка обратно на наш счёт
     lifetime: 60                              // 60 минут
   })
   ```

3. **Обновление счёта с CrystalPay ID**
   ```javascript
   invoiceQueries.setCrystalPayId(invoice.id, crystalInvoice.id)
   ```

#### `findActiveInvoiceForSubscription()`

**Логика поиска активного счёта:**
```javascript
// Активный = pending И не истёк ИЛИ paid/confirmed
SELECT * FROM invoices
WHERE subscription_id = $1
AND (
  (status = 'pending' AND expires_at > NOW())
  OR
  status IN ('paid', 'confirmed')
)
ORDER BY created_at DESC
LIMIT 1
```

**Диагностика при отсутствии счёта:**
- Проверяет ВСЕ счета по subscription_id
- Логирует, почему каждый счёт не подходит:
  - `status != 'pending'`
  - `expires_at < NOW()` (истёк)
  - `no invoices created` (счётов вообще нет)

---

## 4. Database Schema

### invoices table

**Обязательные поля для создания:**
| Поле | Тип | Обязателен | Значение |
|------|-----|-----------|---------|
| `subscription_id` | INT | ✅ | ID подписки |
| `order_id` | INT | ❌ | ID заказа (для order invoices) |
| `chain` | VARCHAR | ✅ | 'CRYSTALPAY', 'BTC', 'LTC', etc. |
| `address` | VARCHAR | ❌ | Адрес кошелька (NULL для CrystalPay) |
| `address_index` | INT | ❌ | Индекс адреса (NULL для CrystalPay) |
| `expected_amount` | DECIMAL | ✅ | Сумма платежа |
| `currency` | VARCHAR | ✅ | 'USD' |
| `status` | VARCHAR | ✅ | 'pending' (по умолчанию) |
| `expires_at` | TIMESTAMP | ✅ | NOW() + INTERVAL '1 hour' |
| `purpose` | VARCHAR | ✅ | 'subscription_new', etc. |
| `crystalpay_id` | VARCHAR | ❌ | ID в системе CrystalPay |
| `tx_hash` | VARCHAR | ❌ | Хеш транзакции блокчейна |
| `paid_at` | TIMESTAMP | ❌ | Когда оплачено |
| `created_at` | TIMESTAMP | ✅ | NOW() |
| `updated_at` | TIMESTAMP | ✅ | NOW() |

### shop_subscriptions table

**Для создания подписки магазина:**
| Поле | Тип | Обязателен |
|------|-----|-----------|
| `id` | SERIAL | ✅ PK |
| `user_id` | INT | ✅ FK users |
| `shop_id` | INT | ✅ FK shops |
| `tier` | VARCHAR | ✅ ('basic', 'pro') |
| `amount` | DECIMAL | ✅ (USD) |
| `status` | VARCHAR | ✅ ('active', 'expired', 'cancelled') |
| `period_start` | TIMESTAMP | ✅ |
| `period_end` | TIMESTAMP | ✅ (period_start + 30 дней) |
| `tx_hash` | VARCHAR | ❌ |
| `currency` | VARCHAR | ✅ ('USD') |
| `verified_at` | TIMESTAMP | ❌ |
| `created_at` | TIMESTAMP | ✅ |
| `updated_at` | TIMESTAMP | ✅ |

---

## 5. Ключевые функции в subscriptionQueries.js

**Файл:** `/Users/sile/Documents/Status Stock 4.0/backend/src/database/queries/subscriptionQueries.js`

### `findShopSubscriptionById(id)`
```javascript
SELECT ss.*, s.owner_id
FROM shop_subscriptions ss
JOIN shops s ON ss.shop_id = s.id
WHERE ss.id = $1
```

**Возвращает:**
- Все поля `shop_subscriptions`
- `owner_id` из `shops` (для проверки владения)

---

## 6. Invoice Constants

**Файл:** `/Users/sile/Documents/Status Stock 4.0/backend/src/constants/invoice.js`

```javascript
INVOICE_PURPOSES = {
  ORDER: 'order',
  SUBSCRIPTION: 'subscription',
  UPGRADE: 'subscription_upgrade'
};

INVOICE_STATES = {
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};
```

---

## 7. Возможные причины ошибок при генерации invoice

### ❌ Ошибка: "Subscription not found"
**Причины:**
1. `subscriptionId` не существует в БД
2. Опечатка в параметре URL
3. Подписка была удалена

**Проверка:**
```bash
SELECT * FROM shop_subscriptions WHERE id = {subscriptionId};
```

### ❌ Ошибка: "Access denied: not subscription owner"
**Причины:**
1. `req.user.id !== subscription.owner_id`
2. Пользователь не владеет магазином с этой подпиской
3. Токен принадлежит другому пользователю

**Проверка:**
```bash
SELECT ss.*, s.owner_id FROM shop_subscriptions ss 
JOIN shops s ON ss.shop_id = s.id 
WHERE ss.id = {subscriptionId};
```

### ❌ Ошибка: "Invalid subscription tier"
**Причины:**
1. `subscription.tier` содержит неверное значение
2. Поле `tier` не заполнено (NULL)
3. Неизвестный tier в `getPrice()`

**Проверка:**
```bash
SELECT tier FROM shop_subscriptions WHERE id = {subscriptionId};
```

**Допустимые значения:** `'basic'`, `'pro'`

### ❌ Ошибка: "Invalid payment method"
**Причины:**
1. `method` не в ['BITCOIN', 'LITECOIN']
2. Опечатка в методе ('BTC' вместо 'BITCOIN')

### ❌ Ошибка: "Invalid purpose"
**Причины:**
1. `purpose` не в ['subscription_new', 'subscription_renewal', 'subscription_upgrade']
2. Опечатка в `purpose`

### ❌ Ошибка: "Failed to create invoice" (500)
**Причины:**
1. Проблема с CrystalPay API (сервис недоступен)
2. Проблема с БД (INSERT fail)
3. Network timeout при запросе в CrystalPay
4. CrystalPay API вернул ошибку (invalid amount, etc.)

**Решение:**
- Проверить логи: `/Users/sile/Documents/Status Stock 4.0/backend/logs/`
- Проверить статус CrystalPay API

---

## 8. Полный flow создания invoice

### DIAGRAM
```
WebApp (PaymentDetailsModal)
    ↓
User clicks "Оплатить подписку"
    ↓
Frontend sends: POST /api/payments/subscriptions/:id/invoice/crystalpay
    {method: 'BITCOIN', purpose: 'subscription_new'}
    ↓
Backend Route Handler (/api/payments/subscriptions/:id/invoice/crystalpay)
    ├─ Parse params: subscriptionId = parseInt(req.params.id)
    ├─ Validate method ∈ ['BITCOIN', 'LITECOIN']
    ├─ Validate purpose ∈ ['subscription_new', ...]
    ├─ Get subscription: subscriptionQueries.findShopSubscriptionById(subscriptionId)
    ├─ Check ownership: subscription.owner_id === req.user.id
    ├─ Get amount: getPrice(subscription.tier) → amountUsd
    └─ Call createCrystalPayInvoice(...)
          ↓
          createCrystalPayInvoice()
          ├─ Create internal invoice:
          │  └─ invoiceQueries.createForCrystalPay({
          │      subscriptionId, purpose, currency: 'USD', amount: amountUsd
          │    })
          │    └─ INSERT INTO invoices (...)
          │       ├─ subscription_id = subscriptionId
          │       ├─ chain = 'CRYSTALPAY'
          │       ├─ address = NULL
          │       ├─ expected_amount = amountUsd
          │       ├─ expires_at = NOW() + 1 hour
          │       └─ status = 'pending'
          │       RETURNING *  ← получаем invoice с id
          │
          ├─ Create CrystalPay invoice:
          │  └─ crystalPayService.createInvoice({
          │      amount: amountUsd,
          │      method: 'BITCOIN',
          │      lifetime: 60 (minutes)
          │    })
          │    RETURNS → {id: crystalPayId, url: paymentUrl, ...}
          │
          ├─ Update internal invoice with CrystalPay ID:
          │  └─ invoiceQueries.setCrystalPayId(invoiceId, crystalPayId)
          │     UPDATE invoices SET crystalpay_id = ? WHERE id = ?
          │
          └─ RETURN {
              invoiceId,
              paymentUrl,
              crystalPayId,
              amount,
              method
            }
    ↓
Backend Response (200)
    {
      invoiceId: 42,
      paymentUrl: "https://crystalpay.com/invoice/...",
      crystalPayId: "cp_xyz123",
      amount: 25,
      method: "BITCOIN"
    }
    ↓
Frontend updates store:
    - paymentWallet = (получается откуда-то, не из этого endpoint!)
    - cryptoAmount = (рассчитано на frontend)
    - currentOrder = (из state)
    ↓
WebApp shows PaymentDetailsModal:
    - QR code (paymentWallet)
    - Wallet address (paymentWallet)
    - Amount to send (cryptoAmount)
    - "I Paid" button
```

---

## 9. Ключевые файлы для исследования

**Backend:**
- `/backend/src/routes/payments.js` — API endpoints (lines 80-127)
- `/backend/src/services/subscriptionInvoiceService.js` — создание счётов
- `/backend/src/database/queries/invoiceQueries.js` — DB операции
- `/backend/src/database/queries/subscriptionQueries.js` — findShopSubscriptionById()
- `/backend/src/config/subscriptionPricing.js` — getPrice()

**Frontend:**
- `/webapp/src/components/Payment/PaymentFlowManager.jsx` — оркестратор
- `/webapp/src/components/Payment/PaymentDetailsModal.jsx` — UI платежа
- `/webapp/src/store/useStore.js` — state (paymentWallet, cryptoAmount)
- `/webapp/src/hooks/useApi.js` — API calls

**Database:**
- `invoices` table — счета (обязательные: subscription_id, expected_amount, expires_at, status, purpose)
- `shop_subscriptions` table — подписки магазинов (обязательные: tier, shop_id)

---

## 10. Summary & Checklist

**Invoice generation для подписок работает так:**

1. ✅ Frontend → `POST /api/payments/subscriptions/:id/invoice/crystalpay`
2. ✅ Backend валидирует subscription, ownership, method, purpose
3. ✅ Backend получает цену: `getPrice(subscription.tier)`
4. ✅ Backend создаёт счёт: `INSERT INTO invoices (subscription_id, ...)`
5. ✅ Backend запрашивает CrystalPay API
6. ✅ Backend сохраняет CrystalPay ID: `UPDATE invoices SET crystalpay_id`
7. ✅ Backend возвращает: `{invoiceId, paymentUrl, crystalPayId, amount, method}`
8. ✅ Frontend показывает детали платежа

**Обязательные поля в БД:**
- `invoices.subscription_id` ← ОБЯЗАТЕЛЕН
- `invoices.expected_amount` ← ОБЯЗАТЕЛЕН (USD)
- `invoices.expires_at` ← ОБЯЗАТЕЛЕН (NOW() + 1 hour)
- `invoices.status` ← ОБЯЗАТЕЛЕН ('pending')
- `invoices.purpose` ← ОБЯЗАТЕЛЕН
- `shop_subscriptions.tier` ← ОБЯЗАТЕЛЕН ('basic' | 'pro')

**Частые ошибки:**
- ❌ Subscription не найдена
- ❌ Пользователь не владеет подпиской (ownership check)
- ❌ Неверный tier/method/purpose
- ❌ CrystalPay API недоступен
- ❌ Некорректные данные в DB (NULL вместо значения)
