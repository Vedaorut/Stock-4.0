# ПОЛНАЯ РЕАЛИЗАЦИЯ СИСТЕМЫ ОПЛАТЫ ПОДПИСОК

**Проблема:** Система оплаты подписок не работает месяц. Текущая ошибка: `canceling statement due to statement timeout`.

**Цель документа:** Показать DeepThink ВЕСЬ код который участвует в оплате подписок - от создания invoice до финальной активации.

---

## 📚 ОГЛАВЛЕНИЕ

1. [Технический стек](#технический-стек)
2. [Database Schema](#database-schema)
3. [Полный код всех сервисов](#полный-код-всех-сервисов)
4. [Flow оплаты шаг за шагом](#flow-оплаты-шаг-за-шагом)
5. [Текущие проблемы](#текущие-проблемы)
6. [Debugging Info](#debugging-info)

---

## 🔧 Технический Стек

### Backend
- **Runtime:** Node.js v20+ (ES Modules)
- **Framework:** Express.js 4.x
- **Database:** PostgreSQL 15+
  - **NO ORM** - чистый SQL через `pg` driver
  - Connection pooling: `max: 20, idle: 10s`
  - Statement timeout: 30s (default)
- **Auth:** JWT (7 days expiration)
- **Logging:** Winston (daily rotation)

### Blockchain APIs
```javascript
// BTC/LTC
BlockCypher API: https://api.blockcypher.com/v1/{chain}/main
  - Webhooks: да (3 confirmations)
  - Rate limit: 200 req/hour (free tier)

// ETH
Etherscan API: https://api.etherscan.io/api
  - Webhooks: нет (polling only)
  - Rate limit: 5 req/sec

// USDT TRC20
TronGrid API: https://api.trongrid.io
  - Webhooks: нет (polling only)
  - Rate limit: 15000 req/day
```

### Crypto Pricing
```javascript
CoinGecko API: https://api.coingecko.com/api/v3/simple/price
  - Currencies: BTC, LTC, ETH, USDT
  - Cache: 5 min in-memory
  - Fallback: stale cache до 1 hour
```

### HD Wallets
```javascript
// Derivation path: m/0/{index}
BTC: bitcoinjs-lib (P2WPKH addresses - bc1q...)
LTC: bitcoinjs-lib с litecoin network
ETH: @ethereumjs/wallet (0x... addresses)
TRX: tronweb (T... addresses для USDT TRC20)
```

---

## 📊 Database Schema

### Table: shop_subscriptions
```sql
CREATE TABLE shop_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL,  -- ⚠️ NULL для pending!
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('basic', 'pro')),
  amount NUMERIC(10,2),                    -- USD amount ($1 для тестирования)
  tx_hash VARCHAR(255),                    -- Transaction hash после оплаты
  currency VARCHAR(20),                    -- BTC/LTC/ETH/USDT
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shop_subscriptions_user_id ON shop_subscriptions(user_id);
CREATE INDEX idx_shop_subscriptions_shop_id ON shop_subscriptions(shop_id);
CREATE INDEX idx_shop_subscriptions_status ON shop_subscriptions(status);
```

### Table: invoices
```sql
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER REFERENCES shop_subscriptions(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  chain VARCHAR(20) NOT NULL,              -- BTC/LTC/ETH/USDT_TRC20
  address VARCHAR(255) NOT NULL UNIQUE,    -- Уникальный платёжный адрес
  address_index INTEGER NOT NULL,          -- HD wallet derivation index
  expected_amount NUMERIC(20,8),           -- USD amount (deprecated, для совместимости)
  crypto_amount NUMERIC(20,8),             -- ⚠️ CRITICAL: точная сумма в криптовалюте
  usd_rate NUMERIC(20,2),                  -- Курс на момент создания invoice
  currency VARCHAR(20) NOT NULL,           -- BTC/LTC/ETH/USDT
  expires_at TIMESTAMP NOT NULL,           -- NOW() + 30 minutes
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  purpose VARCHAR(50),                     -- 'subscription' | 'subscription_upgrade' | 'order'
  tatum_subscription_id VARCHAR(255),      -- BlockCypher webhook ID
  tx_hash VARCHAR(255),                    -- Заполняется после оплаты
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT check_crypto_amount_positive CHECK (crypto_amount IS NULL OR crypto_amount > 0),
  CONSTRAINT check_exactly_one_parent CHECK (
    (subscription_id IS NOT NULL AND order_id IS NULL) OR
    (subscription_id IS NULL AND order_id IS NOT NULL)
  )
);

CREATE INDEX idx_invoices_subscription_id ON invoices(subscription_id);
CREATE INDEX idx_invoices_address ON invoices(address);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_expires_at ON invoices(expires_at);
CREATE INDEX idx_invoices_purpose ON invoices(purpose);
```

### Table: payments
```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES shop_subscriptions(id) ON DELETE CASCADE,
  tx_hash VARCHAR(255) NOT NULL UNIQUE,    -- ⚠️ UNIQUE! Один tx = один платёж
  amount NUMERIC(20,8) NOT NULL,
  currency VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'failed')),
  confirmations INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT check_exactly_one_parent CHECK (
    (order_id IS NOT NULL AND subscription_id IS NULL) OR
    (order_id IS NULL AND subscription_id IS NOT NULL)
  )
);

CREATE INDEX idx_payments_tx_hash ON payments(tx_hash);
CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);
```

### Table: shops
```sql
CREATE TABLE shops (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(20) DEFAULT 'basic' CHECK (tier IN ('basic', 'pro')),
  subscription_status VARCHAR(20) DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive', 'active', 'grace_period', 'expired')),
  next_payment_due TIMESTAMP,
  grace_period_until TIMESTAMP,
  registration_paid BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shops_owner_id ON shops(owner_id);
```

---

## 💻 ПОЛНЫЙ КОД ВСЕХ СЕРВИСОВ

### 1. subscriptionController.js - Endpoints

```javascript
// ============================================================
// POST /api/subscriptions/pending - Создание pending подписки
// ============================================================

/**
 * Request body: { tier: "basic" | "pro" }
 *
 * Response:
 * {
 *   success: true,
 *   subscription: { id, tier, status: "pending" }
 * }
 */
export async function createPendingSubscription(req, res) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const userId = req.user.id;
    const { tier } = req.body; // "basic" or "pro"

    // Validate tier
    if (!['basic', 'pro'].includes(tier)) {
      throw new ValidationError('Invalid tier. Must be "basic" or "pro"');
    }

    // Check if user already has active shop
    const existingShopResult = await client.query(
      \`SELECT s.id, s.tier, ss.status, ss.id as subscription_id
       FROM shops s
       LEFT JOIN shop_subscriptions ss ON s.id = ss.shop_id
       WHERE s.owner_id = $1 AND s.is_active = true
       LIMIT 1\`,
      [userId]
    );

    if (existingShopResult.rows.length > 0) {
      const shop = existingShopResult.rows[0];

      // Return existing subscription
      await client.query('COMMIT');
      return res.json({
        success: true,
        subscription: {
          id: shop.subscription_id,
          tier: shop.tier,
          status: shop.status || 'active',
          shopId: shop.id,
          message: 'You already have an active shop'
        }
      });
    }

    // No shop exists - create pending subscription WITHOUT shop
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    const tempTxHash = \`pending-\${userId}-\${Date.now()}\`;
    const amount = SUBSCRIPTION_PRICES[tier]; // $1 для тестирования

    // ⚠️ CRITICAL: Validate amount exists
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      throw new ValidationError(\`Invalid subscription amount for tier '\${tier}': \${amount}\`);
    }

    const subscriptionResult = await client.query(
      \`INSERT INTO shop_subscriptions
       (user_id, shop_id, tier, amount, tx_hash, currency, period_start, period_end, status)
       VALUES ($1, NULL, $2, $3, $4, 'USDT', $5, $6, 'pending')
       RETURNING id\`,
      [userId, tier, amount, tempTxHash, now, periodEnd]
    );

    const subscriptionId = subscriptionResult.rows[0].id;

    await client.query('COMMIT');

    logger.info(\`[SubscriptionController] Pending subscription created: \${subscriptionId}\`, {
      userId,
      tier,
      amount,
      subscriptionId
    });

    res.status(201).json({
      success: true,
      subscription: {
        id: subscriptionId,
        tier,
        status: 'pending',
        amount,
        currency: 'USDT'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[SubscriptionController] Error creating pending subscription:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// POST /api/subscriptions/:subscriptionId/invoice
// Генерация платёжного invoice
// ============================================================

/**
 * Request body: { chain: "BTC" | "LTC" | "ETH" | "USDT_TRC20" }
 *
 * Response:
 * {
 *   success: true,
 *   invoice: {
 *     invoiceId: 50,
 *     address: "bc1q...",
 *     expectedAmount: 1.0,       // USD
 *     cryptoAmount: 0.0000123,   // BTC
 *     currency: "BTC",
 *     expiresAt: "2025-11-22T14:30:00Z"
 *   }
 * }
 */
export async function generateInvoice(req, res) {
  const { subscriptionId } = req.params;
  const { chain } = req.body;
  const userId = req.user.id;

  try {
    // Verify subscription belongs to user
    const subscription = await subscriptionQueries.findById(subscriptionId);
    if (!subscription) {
      throw new NotFoundError('Subscription not found');
    }

    if (subscription.user_id !== userId) {
      throw new UnauthorizedError('Not authorized');
    }

    // Check for existing active invoice
    const existingInvoice = await subscriptionInvoiceService.findActiveInvoiceForSubscription(
      subscriptionId,
      subscriptionInvoiceService.INVOICE_PURPOSES.SUBSCRIPTION
    );

    if (existingInvoice) {
      // Return existing invoice
      return res.json({
        success: true,
        invoice: {
          invoiceId: existingInvoice.id,
          address: existingInvoice.address,
          expectedAmount: existingInvoice.expected_amount,
          cryptoAmount: existingInvoice.crypto_amount,
          currency: existingInvoice.currency,
          expiresAt: existingInvoice.expires_at,
          status: existingInvoice.status
        }
      });
    }

    // Generate new invoice
    const invoiceData = await subscriptionInvoiceService.generateSubscriptionInvoice(
      subscriptionId,
      chain.toUpperCase(),
      { purpose: subscriptionInvoiceService.INVOICE_PURPOSES.SUBSCRIPTION }
    );

    logger.info(\`[SubscriptionController] Invoice generated for subscription \${subscriptionId}\`);

    res.status(201).json({
      success: true,
      invoice: {
        invoiceId: invoiceData.invoice.id,
        address: invoiceData.address,
        expectedAmount: invoiceData.expectedAmount,    // USD
        cryptoAmount: invoiceData.cryptoAmount,        // EXACT crypto amount
        currency: invoiceData.currency,
        expiresAt: invoiceData.expiresAt
      }
    });

  } catch (error) {
    logger.error('[SubscriptionController] Error generating invoice:', error);
    throw error;
  }
}

// ============================================================
// POST /api/subscriptions/:subscriptionId/payment/confirm
// Подтверждение оплаты вручную (пользователь вводит tx hash)
// ============================================================

/**
 * Request body: { txHash: "49f412c2..." }
 *
 * Response:
 * {
 *   success: true,
 *   message: "Payment confirmed",
 *   subscription: { id, status: "active", shopId }
 * }
 */
export async function confirmPayment(req, res) {
  const { subscriptionId } = req.params;
  const { txHash } = req.body;
  const userId = req.user.id;

  try {
    // ⚠️ MAIN PROCESSING FUNCTION
    const result = await invoicePaymentService.processSubscriptionPayment({
      subscriptionId: parseInt(subscriptionId),
      txHash,
      actorUserId: userId,
      purpose: 'subscription'
    });

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        error: result.code || 'PAYMENT_FAILED',
        message: result.message || 'Payment verification failed'
      });
    }

    res.json({
      success: true,
      message: 'Payment confirmed',
      subscription: {
        id: subscriptionId,
        status: 'active'
      }
    });

  } catch (error) {
    logger.error('[SubscriptionController] Payment confirmation error:', error);
    throw error;
  }
}
```

---

### 2. subscriptionInvoiceService.js - Генерация Invoice

```javascript
import logger from '../utils/logger.js';
import * as walletService from './walletService.js';
import * as blockCypherService from './blockCypherService.js';
import * as cryptoPriceService from './cryptoPriceService.js';
import { invoiceQueries } from '../database/queries/index.js';
import { query } from '../config/database.js';
import { SUBSCRIPTION_PRICES } from '../config/subscriptionPricing.js';

export const INVOICE_PURPOSES = {
  SUBSCRIPTION: 'subscription',
  UPGRADE: 'subscription_upgrade',
};

const INVOICE_EXPIRATION_MINUTES = 30;

function getXpubs() {
  return {
    BTC: process.env.BTC_XPUB || process.env.HD_XPUB_BTC,
    LTC: process.env.LTC_XPUB || process.env.HD_XPUB_LTC,
    ETH: process.env.ETH_XPUB || process.env.HD_XPUB_ETH,
    USDT_TRC20: process.env.TRX_XPUB || process.env.HD_XPUB_TRON
  };
}

function getWebhookBaseUrl() {
  return process.env.WEBHOOK_BASE_URL || 'https://api.yourplatform.com';
}

/**
 * ⚠️ ГЛАВНАЯ ФУНКЦИЯ - Генерация payment invoice
 */
export async function generateSubscriptionInvoice(subscriptionId, chain, options = {}) {
  const { purpose = INVOICE_PURPOSES.SUBSCRIPTION, usdAmountOverride = null } = options;

  try {
    logger.info(
      \`[SubscriptionInvoice] Generating invoice for subscription \${subscriptionId}, chain: \${chain}\`
    );

    // 1. Get subscription details
    const subscriptionResult = await query(
      \`SELECT ss.*, COALESCE(s.tier, ss.tier) as tier, s.name as shop_name
       FROM shop_subscriptions ss
       LEFT JOIN shops s ON ss.shop_id = s.id
       WHERE ss.id = $1\`,
      [subscriptionId]
    );

    if (subscriptionResult.rows.length === 0) {
      throw new Error(\`Subscription \${subscriptionId} not found\`);
    }

    const subscription = subscriptionResult.rows[0];
    const { tier } = subscription;

    // 2. Determine USD amount from tier
    const usdAmount = usdAmountOverride ?? SUBSCRIPTION_PRICES[tier];

    if (!usdAmount || Number.isNaN(usdAmount) || usdAmount <= 0) {
      throw new Error(\`Invalid subscription amount for tier '\${tier}': \${usdAmount}\`);
    }

    logger.info(\`[SubscriptionInvoice] Tier: \${tier}, USD amount: $\${usdAmount}\`);

    // 3. Normalize chain
    const normalizedChain = normalizeChain(chain); // BTC/LTC/ETH/USDT_TRC20
    const currency = getCurrencyFromChain(normalizedChain);

    // 4. ⚠️ CRITICAL: Convert USD → Crypto
    let cryptoAmount;
    let usdRate;

    try {
      const conversionResult = await cryptoPriceService.convertAndRound(usdAmount, normalizedChain);

      // ⚠️ FIX: Convert string to float to avoid precision issues
      cryptoAmount = parseFloat(conversionResult.cryptoAmount);
      usdRate = parseFloat(conversionResult.usdRate);

      logger.info(
        \`[SubscriptionInvoice] Price conversion: $\${usdAmount} = \${cryptoAmount} \${currency} (rate: $\${usdRate})\`
      );
    } catch (priceError) {
      logger.error('[SubscriptionInvoice] Failed to fetch crypto price:', priceError);
      throw new Error(\`Cannot generate invoice: crypto price unavailable for \${normalizedChain}\`);
    }

    // 5. Validate xpub exists
    const xpubs = getXpubs();
    const xpub = xpubs[normalizedChain];

    if (!xpub) {
      throw new Error(\`No xpub configured for chain: \${normalizedChain}\`);
    }

    // 6. Get next derivation index
    const nextIndex = await invoiceQueries.getNextIndex(normalizedChain);

    // 7. Generate unique payment address
    const walletType = normalizedChain === 'USDT_TRC20' ? 'TRX' : normalizedChain;
    const { address, derivationPath } = await walletService.generateAddress(
      walletType,
      xpub,
      nextIndex
    );

    logger.info(\`[SubscriptionInvoice] Generated address: \${address} (\${derivationPath})\`);

    // 8. Calculate expiration (30 minutes)
    const expiresAt = new Date(Date.now() + INVOICE_EXPIRATION_MINUTES * 60 * 1000);

    // 9. Register webhook for BTC/LTC
    let webhookSubscriptionId = null;

    if (normalizedChain === 'BTC' || normalizedChain === 'LTC') {
      try {
        const callbackUrl = \`\${getWebhookBaseUrl()}/api/webhooks/blockcypher\`;

        webhookSubscriptionId = await blockCypherService.registerWebhook(
          normalizedChain,
          address,
          callbackUrl,
          3 // 3 confirmations
        );

        logger.info(\`[SubscriptionInvoice] Webhook registered: \${webhookSubscriptionId}\`);
      } catch (webhookError) {
        logger.warn('[SubscriptionInvoice] Webhook registration failed (will use polling):', webhookError);
      }
    }

    // 10. ⚠️ CRITICAL: Create invoice with crypto_amount and usd_rate
    const invoiceResult = await query(
      \`INSERT INTO invoices
       (subscription_id, chain, address, address_index, expected_amount, crypto_amount, usd_rate,
        currency, tatum_subscription_id, expires_at, status, purpose)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
       RETURNING *\`,
      [
        subscriptionId,
        normalizedChain,
        address,
        nextIndex,
        usdAmount,         // expected_amount (USD)
        cryptoAmount,      // crypto_amount (BTC/ETH/...)
        usdRate,           // usd_rate (exchange rate)
        currency,
        webhookSubscriptionId,
        expiresAt,
        purpose
      ]
    );

    const invoice = invoiceResult.rows[0];

    logger.info('[SubscriptionInvoice] Invoice created successfully', {
      invoiceId: invoice.id,
      subscriptionId,
      tier,
      address,
      usdAmount,
      cryptoAmount,
      currency,
      expiresAt
    });

    return {
      invoice,
      address,
      expectedAmount: usdAmount,
      cryptoAmount,
      usdRate,
      currency,
      expiresAt,
      derivationPath,
      webhookSubscriptionId
    };

  } catch (error) {
    logger.error('[SubscriptionInvoice] Failed to generate invoice:', error);
    throw error;
  }
}

function normalizeChain(chain) {
  const chainUpper = chain.toUpperCase();

  switch (chainUpper) {
    case 'BTC':
    case 'BITCOIN':
      return 'BTC';
    case 'LTC':
    case 'LITECOIN':
      return 'LTC';
    case 'ETH':
    case 'ETHEREUM':
      return 'ETH';
    case 'USDT':
    case 'USDT_TRC20':
      return 'USDT_TRC20';
    default:
      throw new Error(\`Unsupported chain: \${chain}\`);
  }
}

function getCurrencyFromChain(chain) {
  switch (chain) {
    case 'BTC': return 'BTC';
    case 'LTC': return 'LTC';
    case 'ETH': return 'ETH';
    case 'USDT_TRC20': return 'USDT';
    default: return chain;
  }
}
```

---

### 3. invoicePaymentService.js - Обработка Платежа

```javascript
import { getClient } from '../config/database.js';
import paymentVerificationService from './paymentVerificationService.js';
import logger from '../utils/logger.js';
import { amountsMatchWithTolerance } from '../utils/paymentTolerance.js';
import { SUBSCRIPTION_PERIOD_DAYS } from '../config/subscriptionPricing.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';

const INVOICE_STATES = {
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

const INVOICE_PURPOSES = {
  ORDER: 'order',
  SUBSCRIPTION: 'subscription',
  UPGRADE: 'subscription_upgrade',
};

/**
 * ⚠️ CRITICAL FUNCTION: Build payment context from invoice
 * Extract crypto amount (NOT USD!) for verification
 */
function buildPaymentContext(invoice) {
  // ⚠️ FIX: crypto_amount is REQUIRED - no fallback to USD
  if (!invoice.crypto_amount) {
    throw new ValidationError('Invoice missing crypto_amount - cannot verify payment');
  }

  const amount = parseFloat(invoice.crypto_amount);
  if (!amount || Number.isNaN(amount) || amount <= 0) {
    throw new ValidationError('Invoice has invalid crypto_amount');
  }

  return {
    address: invoice.address,
    amount,  // ⚠️ This is CRYPTO amount (BTC/ETH/...), NOT USD!
    currency: (invoice.currency || invoice.chain || 'USDT').toUpperCase(),
    chain: (invoice.chain || invoice.currency || 'USDT').toUpperCase(),
  };
}

/**
 * Advisory lock on invoice to prevent double-processing
 */
async function lockByInvoice(client, invoiceId) {
  await client.query('SELECT pg_advisory_xact_lock($1)', [invoiceId]);
}

/**
 * Check if invoice is still active (not expired, not paid)
 */
async function ensureInvoiceActive(invoice, client) {
  const now = new Date();
  const expiresAt = new Date(invoice.expires_at);

  if (invoice.status === INVOICE_STATES.PAID) {
    return { active: false, reason: 'already_paid' };
  }

  if (expiresAt < now) {
    await client.query(
      \`UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2\`,
      [INVOICE_STATES.EXPIRED, invoice.id]
    );
    return { active: false, reason: 'expired' };
  }

  return { active: true };
}

/**
 * Guard against transaction reuse (same tx_hash used twice)
 */
async function guardTxReuse(client, txHash, { orderId = null, subscriptionId = null }) {
  if (!txHash) return null;

  const existing = await client.query(
    'SELECT * FROM payments WHERE tx_hash = $1 FOR UPDATE',
    [txHash]
  );

  if (existing.rows.length === 0) {
    return null;
  }

  const payment = existing.rows[0];

  const sameOrder = orderId && payment.order_id === orderId;
  const sameSubscription = subscriptionId && payment.subscription_id === subscriptionId;

  if (!sameOrder && !sameSubscription) {
    throw new ValidationError('This transaction was already used for another payment');
  }

  return payment;
}

/**
 * Create payment record in DB
 */
async function attachPaymentRecord(client, { invoice, verification, orderId = null, subscriptionId = null }) {
  const payment = await client.query(
    \`INSERT INTO payments (order_id, subscription_id, tx_hash, amount, currency, status, confirmations)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *\`,
    [
      orderId,
      subscriptionId,
      verification.txHash,
      verification.amount,
      invoice.currency,
      verification.status,
      verification.confirmations || 0
    ]
  );

  return payment.rows[0];
}

/**
 * Mark invoice as paid
 */
async function markInvoicePaid(client, invoiceId, txHash) {
  await client.query(
    \`UPDATE invoices
     SET status = $1, tx_hash = COALESCE($3, tx_hash), paid_at = NOW(), updated_at = NOW()
     WHERE id = $2\`,
    [INVOICE_STATES.PAID, invoiceId, txHash]
  );
}

/**
 * ⚠️ FIX: Validate and lock subscription (without LEFT JOIN FOR UPDATE)
 */
async function validateAndLockSubscription(client, subscriptionId, actorUserId) {
  // Lock subscription row first (without join to avoid FOR UPDATE on nullable side)
  const subResult = await client.query(
    \`SELECT * FROM shop_subscriptions WHERE id = $1 FOR UPDATE\`,
    [subscriptionId]
  );

  if (subResult.rows.length === 0) {
    throw new NotFoundError('Subscription');
  }

  const subscription = subResult.rows[0];

  // Get owner_id separately (no lock needed)
  let owner_id = subscription.user_id;
  if (subscription.shop_id) {
    const shopResult = await client.query(
      \`SELECT owner_id FROM shops WHERE id = $1\`,
      [subscription.shop_id]
    );
    if (shopResult.rows.length > 0) {
      owner_id = shopResult.rows[0].owner_id;
    }
  }

  subscription.owner_id = owner_id;

  if (actorUserId && subscription.owner_id !== actorUserId) {
    throw new UnauthorizedError('Not authorized to manage this subscription');
  }

  return subscription;
}

/**
 * ⚠️ CRITICAL: Finalize subscription payment
 * - Activate subscription
 * - Create shop if needed
 * - Update period dates
 */
async function finalizeSubscriptionPayment(client, { subscription, invoice, verification, payment, mode }) {
  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  // Mode: 'upgrade' (basic -> pro)
  if (mode === 'upgrade') {
    await client.query(
      \`UPDATE shops SET tier = 'pro', next_payment_due = $1, updated_at = NOW() WHERE id = $2\`,
      [periodEnd, subscription.shop_id]
    );

    await client.query(
      \`UPDATE shop_subscriptions
       SET status = 'active', tier = 'pro', period_start = $1, period_end = $2,
           tx_hash = COALESCE($4, tx_hash), currency = $5, amount = COALESCE($6, amount)
       WHERE id = $3\`,
      [periodStart, periodEnd, subscription.id, verification.txHash, invoice.currency, invoice.expected_amount]
    );

    await markInvoicePaid(client, invoice.id, verification.txHash);

    return { ok: true, state: 'confirmed' };
  }

  // Mode: 'subscription' (new or renewal)

  if (subscription.shop_id) {
    // Shop exists - just update
    await client.query(
      \`UPDATE shops
       SET tier = $1, subscription_status = 'active', next_payment_due = $2,
           registration_paid = true, is_active = true, updated_at = NOW()
       WHERE id = $3\`,
      [subscription.tier, periodEnd, subscription.shop_id]
    );

    await client.query(
      \`UPDATE shop_subscriptions
       SET status = 'active', period_start = $1, period_end = $2,
           tx_hash = COALESCE($4, tx_hash), currency = $5, amount = COALESCE($6, amount)
       WHERE id = $3\`,
      [periodStart, periodEnd, subscription.id, verification.txHash, invoice.currency, invoice.expected_amount]
    );
  } else {
    // ⚠️ NO SHOP - Auto-create to avoid money loss!

    const userResult = await client.query(
      'SELECT telegram_id, username FROM users WHERE id = $1',
      [subscription.user_id]
    );
    const user = userResult.rows[0];

    if (!user) {
      return {
        ok: false,
        state: 'failed',
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      };
    }

    // ⚠️ FIX: Check if user already has shop (race condition prevention)
    const existingShopResult = await client.query(
      \`SELECT id, name FROM shops WHERE owner_id = $1 AND is_active = true LIMIT 1\`,
      [subscription.user_id]
    );

    let newShop;
    if (existingShopResult.rows.length > 0) {
      // Use existing shop
      newShop = existingShopResult.rows[0];
      logger.info(\`[SubscriptionPayment] Using existing shop: \${newShop.id}\`);
    } else {
      // Create new shop
      const shopName = \`Shop_\${user.username || user.telegram_id}_\${Date.now()}\`;
      const shopResult = await client.query(
        \`INSERT INTO shops (name, owner_id, tier, subscription_status, registration_paid, is_active)
         VALUES ($1, $2, $3, 'active', true, true)
         RETURNING id, name\`,
        [shopName, subscription.user_id, subscription.tier]
      );
      newShop = shopResult.rows[0];
      logger.info(\`[SubscriptionPayment] Created shop: \${newShop.id}\`);
    }

    // Link subscription to shop
    await client.query(
      \`UPDATE shop_subscriptions
       SET shop_id = $1, status = 'active', period_start = $2, period_end = $3,
           tx_hash = COALESCE($5, tx_hash), currency = $6, amount = COALESCE($7, amount)
       WHERE id = $4\`,
      [newShop.id, periodStart, periodEnd, subscription.id, verification.txHash, invoice.currency, invoice.expected_amount]
    );

    await client.query(
      \`UPDATE shops SET next_payment_due = $1, updated_at = NOW() WHERE id = $2\`,
      [periodEnd, newShop.id]
    );
  }

  await markInvoicePaid(client, invoice.id, verification.txHash);

  if (payment?.id && payment.status !== 'confirmed') {
    await client.query(
      \`UPDATE payments SET status = 'confirmed', confirmations = $2 WHERE id = $1\`,
      [payment.id, verification.confirmations || 0]
    );
  }

  return { ok: true, state: 'confirmed' };
}

/**
 * ⚠️⚠️⚠️ MAIN FUNCTION - Process subscription payment
 *
 * This is called from:
 * 1. Manual confirm endpoint (user enters tx hash)
 * 2. Webhook handler (BlockCypher callback)
 * 3. Polling service (checks pending invoices)
 */
export async function processSubscriptionPayment({
  subscriptionId,
  txHash,
  paymentLink,
  actorUserId,
  mode = null,
  invoiceId = null,
  purpose = null,
}) {
  const client = await getClient();

  try {
    // ⚠️ SERIALIZABLE isolation to prevent race conditions
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // Step 1: Lock and validate subscription
    const subscription = await validateAndLockSubscription(client, subscriptionId, actorUserId);

    // Step 2: Find invoice
    let invoiceFilter = 'subscription_id = $1';
    const invoiceParams = [subscriptionId];

    if (invoiceId) {
      invoiceFilter += ' AND id = $2';
      invoiceParams.push(invoiceId);
    } else if (purpose) {
      invoiceFilter += ' AND purpose = $2';
      invoiceParams.push(purpose);
    }

    const invoiceResult = await client.query(
      \`SELECT * FROM invoices WHERE \${invoiceFilter} ORDER BY created_at DESC LIMIT 1 FOR UPDATE\`,
      invoiceParams
    );

    if (invoiceResult.rows.length === 0) {
      throw new ValidationError('Invoice not found');
    }

    const invoice = invoiceResult.rows[0];
    const invoicePurpose = invoice.purpose || INVOICE_PURPOSES.SUBSCRIPTION;
    const effectiveMode = mode || (invoicePurpose === INVOICE_PURPOSES.UPGRADE ? 'upgrade' : 'subscription');

    // Step 3: Advisory lock on invoice
    await lockByInvoice(client, invoice.id);

    // Step 4: Check invoice not expired/paid
    const activity = await ensureInvoiceActive(invoice, client);
    if (!activity.active) {
      await client.query('COMMIT');
      return {
        ok: false,
        state: 'expired',
        code: 'INVOICE_EXPIRED',
        message: 'Invoice expired'
      };
    }

    // Step 5: ⚠️ Build payment context (extract crypto amount)
    const paymentContext = buildPaymentContext(invoice);

    // Step 6: Check tx hash not reused
    const guardedPayment = txHash ? await guardTxReuse(client, txHash, { subscriptionId }) : null;

    if (guardedPayment && guardedPayment.status === 'confirmed') {
      // Already processed - idempotent response
      await markInvoicePaid(client, invoice.id, guardedPayment.tx_hash);
      await client.query('COMMIT');
      return { ok: true, state: 'confirmed', idempotent: true };
    }

    // Step 7: ⚠️ VERIFY PAYMENT ON BLOCKCHAIN
    const verification = await paymentVerificationService.verifyIncomingPayment({
      txHash,
      paymentLink,
      address: paymentContext.address,
      amount: paymentContext.amount,   // ⚠️ This is crypto amount!
      currency: paymentContext.currency,
      chain: paymentContext.chain,
    });

    if (!verification.verified) {
      // Payment not found or invalid
      if (txHash) {
        await client.query(
          \`INSERT INTO payments (subscription_id, tx_hash, amount, currency, status)
           VALUES ($1, $2, $3, $4, 'failed')\`,
          [subscriptionId, txHash, paymentContext.amount, paymentContext.currency]
        );
      }

      await client.query('COMMIT');
      return {
        ok: false,
        state: 'failed',
        code: verification.code || 'PAYMENT_NOT_VERIFIED',
        message: verification.error || 'Payment not found on blockchain'
      };
    }

    const verifiedTxHash = verification.txHash || txHash;

    // Step 8: ⚠️ Check amounts match (with 1% tolerance)
    if (!amountsMatchWithTolerance(verification.amount, paymentContext.amount, undefined, paymentContext.currency)) {
      await client.query('COMMIT');
      return {
        ok: false,
        state: 'failed',
        code: 'AMOUNT_MISMATCH',
        message: \`Amount mismatch. Expected \${paymentContext.amount}, got \${verification.amount}\`
      };
    }

    // Step 9: Guard again with normalized hash
    await guardTxReuse(client, verifiedTxHash, { subscriptionId });

    // Step 10: Create payment record
    const payment = await attachPaymentRecord(client, {
      invoice,
      verification: { ...verification, txHash: verifiedTxHash },
      subscriptionId,
      orderId: null
    });

    // Step 11: If not confirmed yet - wait for confirmations
    if (verification.status !== 'confirmed') {
      await client.query(
        \`UPDATE invoices SET tx_hash = COALESCE($2, tx_hash), updated_at = NOW() WHERE id = $1\`,
        [invoice.id, verifiedTxHash]
      );
      await client.query('COMMIT');

      return {
        ok: true,
        state: 'pending',
        payment,
        message: 'Payment received, waiting for confirmations'
      };
    }

    // Step 12: ⚠️ FINALIZE - Activate subscription, create shop
    const finalizeResult = await finalizeSubscriptionPayment(client, {
      subscription,
      invoice: { ...invoice, tx_hash: verifiedTxHash },
      verification: { ...verification, txHash: verifiedTxHash },
      payment,
      mode: effectiveMode
    });

    await client.query('COMMIT');

    return finalizeResult;

  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('[InvoicePayment] Rollback error:', rollbackError);
    }

    logger.error('[InvoicePayment] Subscription payment failed:', {
      subscriptionId,
      error: error.message,
      stack: error.stack
    });

    throw error;
  } finally {
    client.release();
  }
}

export default {
  processSubscriptionPayment,
};
```

---

### 4. paymentVerificationService.js - Проверка в Blockchain

```javascript
import * as etherscanService from './etherscanService.js';
import * as blockCypherService from './blockCypherService.js';
import * as tronGridService from './tronGridService.js';
import logger from '../utils/logger.js';

/**
 * Verify incoming payment on blockchain
 *
 * @param {string} txHash - Transaction hash
 * @param {string} address - Expected recipient address
 * @param {number} amount - Expected crypto amount
 * @param {string} currency - BTC/LTC/ETH/USDT
 * @param {string} chain - BTC/LTC/ETH/USDT_TRC20
 *
 * @returns {object} { verified, txHash, amount, confirmations, status }
 */
export async function verifyIncomingPayment({ txHash, address, amount, currency, chain }) {
  try {
    logger.info(\`[PaymentVerification] Verifying payment: \${txHash} to \${address}\`);

    let verification;

    switch (chain.toUpperCase()) {
      case 'BTC':
        verification = await blockCypherService.verifyBTCTransaction(txHash, address, amount);
        break;

      case 'LTC':
        verification = await blockCypherService.verifyLTCTransaction(txHash, address, amount);
        break;

      case 'ETH':
        verification = await etherscanService.verifyETHTransaction(txHash, address, amount);
        break;

      case 'USDT_TRC20':
        verification = await tronGridService.verifyTRC20Transaction(txHash, address, amount);
        break;

      default:
        throw new Error(\`Unsupported chain: \${chain}\`);
    }

    // Normalize response
    return {
      verified: verification.success || false,
      txHash: verification.txHash || txHash,
      amount: verification.amount || 0,
      confirmations: verification.confirmations || 0,
      status: verification.confirmations >= 3 ? 'confirmed' : 'pending',
      error: verification.error,
      code: verification.code
    };

  } catch (error) {
    logger.error('[PaymentVerification] Verification failed:', error);
    return {
      verified: false,
      error: error.message,
      code: 'VERIFICATION_ERROR'
    };
  }
}

export default {
  verifyIncomingPayment
};
```

---

### 5. cryptoPriceService.js - Конвертация USD → Crypto

```javascript
import Decimal from 'decimal.js';
import logger from '../utils/logger.js';

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const STALE_CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour

const priceCache = new Map();

const COIN_IDS = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  ETH: 'ethereum',
  USDT_TRC20: 'tether',
  USDT: 'tether'
};

/**
 * Get current crypto price from CoinGecko
 */
async function getCurrentPrice(chain) {
  const coinId = COIN_IDS[chain];
  if (!coinId) {
    throw new Error(\`Unknown coin for chain: \${chain}\`);
  }

  const cacheKey = \`price_\${chain}\`;
  const cached = priceCache.get(cacheKey);

  // Return fresh cache
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    logger.debug(\`[CryptoPrice] Using cached price for \${chain}: $\${cached.price}\`);
    return cached.price;
  }

  try {
    const response = await fetch(
      \`\${COINGECKO_API}?ids=\${coinId}&vs_currencies=usd\`
    );

    if (!response.ok) {
      throw new Error(\`CoinGecko API error: \${response.status}\`);
    }

    const data = await response.json();
    const price = data[coinId]?.usd;

    if (!price) {
      throw new Error(\`Price not found for \${coinId}\`);
    }

    // Update cache
    priceCache.set(cacheKey, {
      price,
      timestamp: Date.now()
    });

    logger.info(\`[CryptoPrice] Fetched price for \${chain}: $\${price}\`);

    return price;

  } catch (error) {
    logger.error(\`[CryptoPrice] Failed to fetch price for \${chain}:\`, error);

    // Use stale cache if available
    if (cached && (Date.now() - cached.timestamp) < STALE_CACHE_MAX_AGE) {
      logger.warn(\`[CryptoPrice] Using stale cache for \${chain}: $\${cached.price}\`);
      return cached.price;
    }

    throw new Error(\`Cannot fetch price for \${chain}: \${error.message}\`);
  }
}

/**
 * ⚠️ CRITICAL: Convert USD amount to crypto with proper rounding
 *
 * @param {number} usdAmount - Amount in USD
 * @param {string} chain - BTC/LTC/ETH/USDT_TRC20
 * @returns {object} { cryptoAmount: string, usdRate: number }
 */
export async function convertAndRound(usdAmount, chain) {
  const usdRate = await getCurrentPrice(chain);

  // Use Decimal.js for precision
  const usdDecimal = new Decimal(usdAmount);
  const rateDecimal = new Decimal(usdRate);

  const cryptoDecimal = usdDecimal.dividedBy(rateDecimal);

  // Round to appropriate precision
  let precision;
  switch (chain) {
    case 'BTC':
      precision = 8; // satoshi precision
      break;
    case 'LTC':
      precision = 8;
      break;
    case 'ETH':
      precision = 18; // wei precision
      break;
    case 'USDT_TRC20':
      precision = 6; // USDT has 6 decimals
      break;
    default:
      precision = 8;
  }

  const roundedCrypto = cryptoDecimal.toDecimalPlaces(precision, Decimal.ROUND_UP);

  logger.info(\`[CryptoPrice] Conversion: $\${usdAmount} = \${roundedCrypto.toString()} \${chain}\`, {
    usdAmount,
    usdRate,
    cryptoAmount: roundedCrypto.toString(),
    chain
  });

  return {
    cryptoAmount: roundedCrypto.toString(), // ⚠️ Returns STRING for precision
    usdRate: usdRate
  };
}

export default {
  convertAndRound,
  getCurrentPrice
};
```

---

### 6. paymentTolerance.js - Проверка сумм с допуском

```javascript
import logger from './logger.js';

// Default tolerance: 1% (0.01)
const DEFAULT_TOLERANCE = 0.01;

/**
 * Check if two amounts match within tolerance
 *
 * @param {number} received - Actually received amount
 * @param {number} expected - Expected amount
 * @param {number} tolerance - Tolerance (default 1% = 0.01)
 * @param {string} currency - For logging
 * @returns {boolean}
 */
export function amountsMatchWithTolerance(received, expected, tolerance = DEFAULT_TOLERANCE, currency = '') {
  if (!received || !expected) {
    logger.warn('[PaymentTolerance] Invalid amounts:', { received, expected });
    return false;
  }

  const receivedNum = parseFloat(received);
  const expectedNum = parseFloat(expected);

  const diff = Math.abs(receivedNum - expectedNum);
  const maxDiff = expectedNum * tolerance;

  const match = diff <= maxDiff;

  logger.info(\`[PaymentTolerance] Amount check: \${receivedNum} vs \${expectedNum} \${currency}\`, {
    received: receivedNum,
    expected: expectedNum,
    difference: diff,
    maxAllowedDiff: maxDiff,
    tolerance: \`\${tolerance * 100}%\`,
    match
  });

  return match;
}

export default {
  amountsMatchWithTolerance
};
```

---

## 🔄 Flow Оплаты Подписки (Полный Пример)

### Сценарий: Пользователь оплачивает PRO подписку через BTC

**Шаг 1: Создание pending subscription**
```bash
POST /api/subscriptions/pending
Body: { "tier": "pro" }

# Response:
{
  "success": true,
  "subscription": {
    "id": 44,
    "tier": "pro",
    "status": "pending",
    "amount": 1,        # $1 для тестирования
    "currency": "USDT"
  }
}

# В БД:
shop_subscriptions:
  id: 44
  user_id: 2
  shop_id: NULL        # ⚠️ Магазин ещё не создан!
  tier: 'pro'
  amount: 1.00
  status: 'pending'
  tx_hash: 'pending-2-1732283765432'
```

**Шаг 2: Генерация invoice**
```bash
POST /api/subscriptions/44/invoice
Body: { "chain": "BTC" }

# Internal flow:
1. SUBSCRIPTION_PRICES['pro'] = $1
2. CoinGecko API: BTC price = $95,234
3. Convert: $1 / $95,234 = 0.00001050 BTC
4. HD wallet: derive address from BTC_XPUB at index 42
   → bc1q7xn8k2v9p3h4...
5. BlockCypher: register webhook for bc1q7xn8k2v9p3h4...
6. INSERT INTO invoices:
   - crypto_amount: 0.00001050  (⚠️ as number, not string!)
   - usd_rate: 95234.00
   - expires_at: NOW() + 30 min

# Response:
{
  "success": true,
  "invoice": {
    "invoiceId": 50,
    "address": "bc1q7xn8k2v9p3h4...",
    "expectedAmount": 1.0,           # USD для отображения
    "cryptoAmount": 0.00001050,      # ⚠️ ТОЧНАЯ сумма для отправки!
    "currency": "BTC",
    "expiresAt": "2025-11-22T13:30:00Z"
  }
}
```

**Шаг 3: Пользователь отправляет BTC**
```
User's wallet:
  To: bc1q7xn8k2v9p3h4...
  Amount: 0.00001048 BTC  (немного меньше из-за комиссии)
  Tx: 49f412c21e5ea564febcbc742ade065a0df15d61f3ac8dea4b0547036d489d9f
```

**Шаг 4a: Webhook от BlockCypher (автоматически)**
```bash
POST /api/webhooks/blockcypher
Body: {
  "address": "bc1q7xn8k2v9p3h4...",
  "confirmations": 3,
  "hash": "49f412c2...",
  "total": 1048  # satoshi (0.00001048 BTC)
}

# Внутри:
→ pollingService detects new webhook event
→ calls processSubscriptionPayment()
```

**Шаг 4b: Manual confirm (если webhook не сработал)**
```bash
POST /api/subscriptions/44/payment/confirm
Body: {
  "txHash": "49f412c21e5ea564febcbc742ade065a0df15d61f3ac8dea4b0547036d489d9f"
}

# Вызывается processSubscriptionPayment()
```

**Шаг 5: processSubscriptionPayment() - MAIN LOGIC**
```javascript
async function processSubscriptionPayment() {
  BEGIN TRANSACTION SERIALIZABLE

  // 1. Lock subscription
  SELECT * FROM shop_subscriptions WHERE id = 44 FOR UPDATE
  → subscription: { id: 44, shop_id: NULL, tier: 'pro', user_id: 2 }

  // 2. Get invoice
  SELECT * FROM invoices WHERE subscription_id = 44 FOR UPDATE
  → invoice: {
      id: 50,
      address: 'bc1q7xn8k2v9p3h4...',
      crypto_amount: 0.00001050,  // ⚠️ CRYPTO, not USD!
      currency: 'BTC'
    }

  // 3. Advisory lock
  SELECT pg_advisory_xact_lock(50)

  // 4. Check not expired
  expires_at: 2025-11-22 13:30:00
  NOW(): 2025-11-22 13:15:00
  → ACTIVE ✓

  // 5. Build payment context
  buildPaymentContext(invoice)
  → {
      address: 'bc1q7xn8k2v9p3h4...',
      amount: 0.00001050,  // ⚠️ CRYPTO amount from invoice
      currency: 'BTC',
      chain: 'BTC'
    }

  // 6. Check tx not reused
  SELECT * FROM payments WHERE tx_hash = '49f412c2...' FOR UPDATE
  → No existing payment ✓

  // 7. ⚠️ VERIFY ON BLOCKCHAIN
  blockCypherService.verifyBTCTransaction('49f412c2...', 'bc1q7xn8k2v9p3h4...', 0.00001050)

  → GET https://api.blockcypher.com/v1/btc/main/txs/49f412c2...

  Response: {
    "hash": "49f412c2...",
    "confirmations": 3,
    "outputs": [
      {
        "addresses": ["bc1q7xn8k2v9p3h4..."],
        "value": 1048  // satoshi = 0.00001048 BTC
      }
    ]
  }

  → verification: {
      verified: true,
      txHash: '49f412c2...',
      amount: 0.00001048,  // Actually received
      confirmations: 3,
      status: 'confirmed'
    }

  // 8. ⚠️ Check amounts match (1% tolerance)
  amountsMatchWithTolerance(0.00001048, 0.00001050, 0.01, 'BTC')

  Calculation:
    received: 0.00001048
    expected: 0.00001050
    diff: 0.00000002
    maxDiff: 0.00001050 * 0.01 = 0.000000105

    0.00000002 > 0.000000105? → NO
    → MATCH ✓

  // 9. Create payment record
  INSERT INTO payments (subscription_id, tx_hash, amount, currency, status, confirmations)
  VALUES (44, '49f412c2...', 0.00001048, 'BTC', 'confirmed', 3)
  → payment_id: 123

  // 10. ⚠️ FINALIZE: Activate subscription + create shop

  subscription.shop_id = NULL → No shop exists

  SELECT * FROM users WHERE id = 2
  → user: { telegram_id: 123456789, username: 'testuser' }

  // Check if user already has shop (race condition fix)
  SELECT id FROM shops WHERE owner_id = 2 AND is_active = true
  → No existing shop ✓

  // Create new shop
  INSERT INTO shops (name, owner_id, tier, subscription_status, is_active)
  VALUES ('Shop_testuser_1732283987654', 2, 'pro', 'active', true)
  → shop_id: 201

  // Link subscription to shop
  UPDATE shop_subscriptions
  SET shop_id = 201, status = 'active',
      period_start = NOW(), period_end = NOW() + INTERVAL '30 days',
      tx_hash = '49f412c2...', currency = 'BTC'
  WHERE id = 44

  // Mark invoice as paid
  UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = 50

  COMMIT

  return { ok: true, state: 'confirmed' }
}
```

**Шаг 6: Response**
```json
{
  "success": true,
  "message": "Payment confirmed",
  "subscription": {
    "id": 44,
    "status": "active"
  }
}
```

**Финальное состояние БД:**
```sql
shop_subscriptions:
  id: 44
  user_id: 2
  shop_id: 201          # ✓ Shop created!
  tier: 'pro'
  status: 'active'      # ✓ Activated!
  tx_hash: '49f412c2...'
  period_start: 2025-11-22 13:15:00
  period_end: 2025-12-22 13:15:00

shops:
  id: 201
  name: 'Shop_testuser_1732283987654'
  owner_id: 2
  tier: 'pro'
  subscription_status: 'active'
  is_active: true

invoices:
  id: 50
  status: 'paid'        # ✓ Paid!
  tx_hash: '49f412c2...'
  paid_at: 2025-11-22 13:15:00

payments:
  id: 123
  subscription_id: 44
  tx_hash: '49f412c2...'
  amount: 0.00001048
  currency: 'BTC'
  status: 'confirmed'
  confirmations: 3
```

---

## 🐛 Текущие Проблемы

### ПРОБЛЕМА #1: Statement Timeout (СЕЙЧАС!)

**Ошибка:**
```
error: canceling statement due to statement timeout
at validateAndLockSubscription (invoicePaymentService.js:168)
```

**Где:**
```javascript
async function validateAndLockSubscription(client, subscriptionId, actorUserId) {
  const subResult = await client.query(
    `SELECT * FROM shop_subscriptions WHERE id = $1 FOR UPDATE`,  // ← TIMEOUT HERE!
    [subscriptionId]
  );
}
```

**Когда происходит:**
- User нажал "Confirm payment" → вызов processSubscriptionPayment()
- Параллельно polling service тоже обрабатывает тот же invoice
- Deadlock: оба процесса ждут друг друга

**Гипотеза:**
1. Polling service получил webhook от BlockCypher
2. Начал processSubscriptionPayment(subscription_id=44)
3. Захватил lock на shop_subscriptions.id=44
4. Одновременно user нажал "Confirm" в боте
5. Второй вызов processSubscriptionPayment() ждёт освобождения lock
6. Timeout через 30 секунд

**Доказательства:**
- Ошибка только на `FOR UPDATE` (блокировка)
- Происходит при manual confirm (когда есть конкуренция)
- В логах видно что polling service тоже обрабатывает invoice 50

---

### ПРОБЛЕМА #2: FOR UPDATE на LEFT JOIN (ИСПРАВЛЕНА)

**Было:**
```sql
SELECT ss.*, COALESCE(s.owner_id, ss.user_id) AS owner_id
FROM shop_subscriptions ss
LEFT JOIN shops s ON ss.shop_id = s.id
WHERE ss.id = $1
FOR UPDATE  -- ERROR! PostgreSQL не позволяет блокировать nullable side
```

**Исправлено:**
```sql
-- Lock только subscription
SELECT * FROM shop_subscriptions WHERE id = $1 FOR UPDATE

-- Затем отдельно получить owner_id
SELECT owner_id FROM shops WHERE id = $2
```

---

### ПРОБЛЕМА #3: crypto_amount как строка (ИСПРАВЛЕНА)

**Проблема:**
```javascript
const conversionResult = await cryptoPriceService.convertAndRound(1, 'BTC');
// Returns: { cryptoAmount: "0.00001050", usdRate: 95234 }

cryptoAmount = conversionResult.cryptoAmount;  // STRING!

// В БД сохраняется как NUMERIC
// При чтении: parseFloat("0.00001050") может дать 0.00001049999
```

**Исправление:**
```javascript
cryptoAmount = parseFloat(conversionResult.cryptoAmount);
usdRate = parseFloat(conversionResult.usdRate);
```

---

### ПРОБЛЕМА #4: Fallback на USD (ИСПРАВЛЕНА)

**Проблема:**
```javascript
function buildPaymentContext(invoice) {
  const amount = parseFloat(invoice.crypto_amount || invoice.expected_amount);
  //                                                ^^^ USD!
}

// Если crypto_amount = NULL:
// amount = parseFloat(invoice.expected_amount) = 1 USD
// Сравнение: 0.00001050 BTC vs 1 USD → ВСЕГДА FAIL!
```

**Исправление:**
```javascript
function buildPaymentContext(invoice) {
  if (!invoice.crypto_amount) {
    throw new ValidationError('Invoice missing crypto_amount');
  }
  const amount = parseFloat(invoice.crypto_amount);
}
```

---

### ПРОБЛЕМА #5: Race condition при создании shop (ИСПРАВЛЕНА)

**Проблема:**
- Два parallel processSubscriptionPayment() вызова
- Оба видят subscription.shop_id = NULL
- Оба создают новый shop
- Результат: два магазина для одного пользователя

**Исправление:**
```javascript
// Check if user already has shop
const existingShop = await client.query(
  'SELECT id FROM shops WHERE owner_id = $1 AND is_active = true',
  [user_id]
);

if (existingShop.rows.length > 0) {
  // Use existing shop
  shop = existingShop.rows[0];
} else {
  // Create new shop
  shop = await client.query('INSERT INTO shops...');
}
```

---

## 🔍 Debugging Info

### Текущий тестовый кейс:
```
subscription_id: 44
invoice_id: 50
txHash: 49f412c21e5ea564febcbc742ade065a0df15d61f3ac8dea4b0547036d489d9f
tier: pro
expected_amount: $1 USD
```

### Проверить в БД:
```sql
-- Subscription
SELECT * FROM shop_subscriptions WHERE id = 44;

-- Invoice
SELECT * FROM invoices WHERE id = 50;

-- Payments
SELECT * FROM payments WHERE subscription_id = 44;

-- ⚠️ Проверить locks
SELECT
  l.pid,
  l.mode,
  l.granted,
  a.query,
  a.state,
  a.wait_event_type,
  a.wait_event
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.relation = 'shop_subscriptions'::regclass;

-- ⚠️ Проверить активные транзакции
SELECT
  pid,
  state,
  query,
  wait_event_type,
  wait_event,
  NOW() - query_start AS duration
FROM pg_stat_activity
WHERE datname = 'telegram_shop'
  AND state != 'idle'
ORDER BY query_start;
```

---

## 🎯 Вопросы к DeepThink

1. **Почему statement timeout на FOR UPDATE?**
   - Deadlock между polling + manual confirm?
   - Другой процесс держит lock?
   - Как избежать?

2. **Правильная ли стратегия блокировок?**
   ```
   Сейчас:
   - lockByInvoice(invoice_id) - advisory lock
   - validateAndLockSubscription() - FOR UPDATE

   Может быть:
   - Только advisory locks?
   - Или только FOR UPDATE?
   - Или другая последовательность?
   ```

3. **Polling vs Manual Confirm конфликт?**
   - Нужно ли отключать polling когда user manually confirms?
   - Или сделать idempotent processing?

4. **shop_id = NULL для pending - это проблема?**
   - Может лучше сразу создавать shop при pending?
   - Или оставить как есть (создавать после оплаты)?

5. **SERIALIZABLE isolation level - правильный выбор?**
   - Может READ COMMITTED хватит?
   - Или нужен другой уровень изоляции?

---

## 💡 Возможные Решения

### A. Advisory Locks вместо FOR UPDATE
```javascript
async function validateAndLockSubscription(client, subscriptionId) {
  // Advisory lock (не блокирует обычные SELECT)
  await client.query('SELECT pg_advisory_xact_lock($1)', [subscriptionId + 1000000]);

  // Обычный SELECT
  const sub = await client.query(
    'SELECT * FROM shop_subscriptions WHERE id = $1',
    [subscriptionId]
  );

  return sub.rows[0];
}
```

### B. Idempotent processing
```javascript
// В начале processSubscriptionPayment:
if (subscription.status === 'active' && invoice.status === 'paid') {
  // Уже обработано - просто вернуть success
  return { ok: true, state: 'confirmed', idempotent: true };
}
```

### C. Mutex на уровне приложения
```javascript
const processingLocks = new Map(); // subscription_id → Promise

async function processWithLock(subscriptionId, fn) {
  if (processingLocks.has(subscriptionId)) {
    // Уже обрабатывается - ждём
    return await processingLocks.get(subscriptionId);
  }

  const promise = fn();
  processingLocks.set(subscriptionId, promise);

  try {
    return await promise;
  } finally {
    processingLocks.delete(subscriptionId);
  }
}
```

### D. Отдельная очередь для обработки
```javascript
// Redis-based job queue
await paymentQueue.add('process-subscription-payment', {
  subscriptionId: 44,
  txHash: '49f412c2...'
});

// Worker обрабатывает по одному
```

---

**Автор:** Claude Code
**Дата:** 2025-11-22
**Версия:** FULL STACK
**Статус:** Ждём решения от DeepThink
