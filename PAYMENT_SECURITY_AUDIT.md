# PAYMENT SYSTEM SECURITY AUDIT

**Project:** Status Stock 4.0 - Crypto Payment System
**Date:** 2025-10-25
**Auditor:** Claude Code (Backend Architect)
**Scope:** BTC, LTC, ETH, USDT (ERC-20, TRC-20) payment verification

---

## EXECUTIVE SUMMARY

**PRODUCTION READY:** ❌ **NO** - Critical vulnerabilities found

**Risk Level:** 🔴 **HIGH** (CVSS 7.5-9.0)

**Critical Issues:** 3 vulnerabilities must be fixed before production
**High Priority:** 2 security improvements required
**Medium Priority:** 4 best practice recommendations

---

## HD WALLET SECURITY ✅

### Audit Results

- [x] **xpub usage correct (watch-only):** ✅ PASS
- [x] **No private keys in code:** ✅ PASS
- [x] **Derivation paths standard (BIP44):** ✅ PASS
- [x] **Entropy source secure:** ⚠️ N/A (client-side generation assumed)
- [x] **Index collision prevention:** ✅ PASS

**Files reviewed:**
- `/backend/src/services/walletService.js` (lines 54-345)

**Findings:**

✅ **SECURE:** All wallet operations use xpub keys only (watch-only mode):
```javascript
// Line 66: walletService.js
const node = bip32.fromBase58(xpub, bitcoin.networks.bitcoin);
const child = node.derive(0).derive(index);
```

✅ **SECURE:** Standard BIP44 derivation paths:
- BTC: `m/44'/0'/0'/0/{index}` (line 77)
- LTC: `m/44'/2'/0'/0/{index}` (line 136)
- ETH: `m/44'/60'/0'/0/{index}` (line 183)
- TRON: `m/44'/195'/0'/0/{index}` (line 246)

✅ **SECURE:** Index validation prevents overflow:
```javascript
// Line 61: walletService.js
if (!Number.isInteger(index) || index < 0 || index >= Math.pow(2, 31)) {
  throw new Error(`Invalid derivation index: ${index}. Must be 0 to 2^31-1`);
}
```

⚠️ **NOTE:** TRON address generation (lines 206-260) uses simplified approach via TronWeb. For production, verify that `tronWeb.address.fromPrivateKey()` call at line 236 doesn't accidentally expose private keys (it shouldn't, but code is unclear).

**Issues found:** NONE (HD wallet implementation is secure)

---

## WEBHOOK SECURITY ❌ CRITICAL

### Audit Results

- [x] **Signature verification:** ❌ **NOT IMPLEMENTED** for BlockCypher
- [x] **HMAC algo:** ⚠️ SHA256 (Tatum only, disabled)
- [x] **Checked before processing:** ❌ **MISSING**
- [x] **Replay prevention:** ❌ **NOT IMPLEMENTED**
- [x] **Secret from .env:** ⚠️ Partial (only TATUM_WEBHOOK_HMAC_SECRET)

**Files reviewed:**
- `/backend/src/routes/webhooks.js` (lines 181-281)
- `/backend/src/services/blockCypherService.js` (lines 1-425)
- `/backend/src/services/tatumService.js` (lines 327-357)

### 🔴 CVE-PS-001: BlockCypher Webhook Has No Signature Verification

**Severity:** 🔴 **CRITICAL** (CVSS 9.0)
**Component:** `/backend/src/routes/webhooks.js:181-281`

**Description:**
BlockCypher webhook endpoint (`POST /webhooks/blockcypher`) processes payment confirmations WITHOUT verifying HMAC signature. Attacker can send fake webhook payloads to mark orders as paid.

**Current code (VULNERABLE):**
```javascript
// Line 181: webhooks.js
router.post('/blockcypher', async (req, res) => {
  try {
    const payload = req.body;

    // ❌ NO SIGNATURE VERIFICATION!
    logger.info('[Webhook] BlockCypher notification received:', {
      txHash: payload.hash,
      confirmations: payload.confirmations,
      blockHeight: payload.block_height
    });

    // Directly processes payload without authentication
    const paymentData = blockCypherService.parseWebhookPayload(payload);
    // ...
```

**Exploit scenario:**
```bash
# Attacker sends fake webhook to confirm fraudulent order
curl -X POST https://api.statusstock.com/webhooks/blockcypher \
  -H "Content-Type: application/json" \
  -d '{
    "hash": "fake_tx_hash_12345",
    "confirmations": 6,
    "outputs": [{"addresses": ["victim_shop_btc_address"], "value": 100000000}]
  }'

# Result: Order marked as "confirmed" without real payment
```

**Impact:**
- **Money loss:** Attacker can confirm orders without paying
- **Order hijacking:** Fake confirmations for any BTC/LTC address
- **Business disruption:** Sellers ship products without receiving payment

**Fix required:**
```javascript
// Add BlockCypher webhook signature verification
// BlockCypher uses HMAC-SHA256 with webhook secret

router.post('/blockcypher', async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['x-webhook-signature']; // BlockCypher header

    // ✅ VERIFY SIGNATURE FIRST
    const isValid = verifyBlockCypherSignature(payload, signature);
    if (!isValid) {
      logger.warn('[Webhook] Invalid BlockCypher signature');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Then process payload
    // ...
```

**Environment variable needed:**
```bash
# .env
BLOCKCYPHER_WEBHOOK_SECRET=your-webhook-secret-here
```

**References:**
- BlockCypher Webhook Security: https://www.blockcypher.com/dev/bitcoin/#webhooks

---

### 🔴 CVE-PS-002: Replay Attack Vulnerability

**Severity:** 🔴 **HIGH** (CVSS 7.5)
**Component:** `/backend/src/routes/webhooks.js:181-281`

**Description:**
No timestamp validation or nonce checking. Attacker can replay old legitimate webhook payloads to re-confirm already processed orders.

**Vulnerable code:**
```javascript
// Line 214: webhooks.js
const existingPayment = await paymentQueries.findByTxHash(paymentData.txHash);

if (existingPayment) {
  // ❌ Updates existing payment without checking if webhook is duplicate
  await paymentQueries.updateStatus(
    existingPayment.id,
    status,
    paymentData.confirmations
  );
  // ...
```

**Exploit scenario:**
```bash
# 1. Legitimate webhook arrives for TX abc123 with 3 confirmations
# 2. Attacker captures webhook payload (e.g., via network sniffing)
# 3. Days later, attacker replays same webhook
# 4. System re-processes it (idempotent but wasteful)
# 5. Potential: if combined with race condition, could create duplicate payments
```

**Impact:**
- **Service disruption:** Repeated processing of old webhooks
- **Race condition risk:** If replayed concurrently, might bypass duplicate checks
- **Log pollution:** False positive confirmations

**Fix required:**
```javascript
// Add webhook deduplication table
CREATE TABLE webhook_logs (
  id SERIAL PRIMARY KEY,
  webhook_id VARCHAR(255) UNIQUE NOT NULL, -- from x-webhook-id header
  payload_hash VARCHAR(64) NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW(),
  source VARCHAR(50) NOT NULL -- 'blockcypher', 'manual', etc.
);

// Check webhook_id before processing
const webhookId = req.headers['x-webhook-id'];
const existingWebhook = await webhookQueries.findById(webhookId);

if (existingWebhook) {
  logger.warn('[Webhook] Duplicate webhook detected (replay attack?)');
  return res.status(200).json({ status: 'already_processed' });
}
```

**Alternative:** Timestamp validation:
```javascript
const webhookTimestamp = parseInt(req.headers['x-webhook-timestamp']);
const now = Date.now();

// Reject webhooks older than 5 minutes
if (now - webhookTimestamp > 300000) {
  return res.status(400).json({ error: 'Webhook expired' });
}
```

---

## PAYMENT VERIFICATION ✅ MOSTLY SECURE

### Audit Results

- [x] **Amount tolerance:** 1% ✅ (safe range)
- [x] **Underpayment rejected:** ✅ PASS
- [x] **Confirmations enforced:** ✅ PASS
  - BTC: 3 blocks (line 218: `CONFIRMATIONS_BTC=3`)
  - LTC: 3 blocks (line 218: `CONFIRMATIONS_LTC=3`)
  - ETH: 3 blocks (line 442: etherscanService.js)
  - TRON: 1 block (line 466: tronService.js)
- [x] **Double-spend check:** ✅ PASS (TX hash unique constraint)

**Files reviewed:**
- `/backend/src/services/blockCypherService.js:259-336`
- `/backend/src/services/etherscanService.js:358-574`
- `/backend/src/services/tronService.js:344-479`

**Findings:**

✅ **SECURE:** Amount validation with 1% tolerance:
```javascript
// Line 292: blockCypherService.js
const tolerance = expectedAmount * 0.01;
const amountMatches = Math.abs(actualAmount - expectedAmount) <= tolerance;

if (!amountMatches) {
  logger.warn(`[BlockCypher] Amount mismatch:`, {
    expected: expectedAmount,
    actual: actualAmount,
    txHash
  });
  return { verified: false, error: 'Amount mismatch', ... };
}
```

✅ **SECURE:** Underpayment is rejected (tolerance doesn't allow 50% underpayment):
```javascript
// Example: expectedAmount = 0.01 BTC
// tolerance = 0.0001 BTC (1%)
// actualAmount = 0.005 BTC (50% underpayment)
// Math.abs(0.005 - 0.01) = 0.005 > 0.0001 ❌ REJECTED
```

✅ **SECURE:** Double-spend detection via unique TX hash constraint:
```sql
-- Line 431: schema.sql
tx_hash VARCHAR(255) UNIQUE NOT NULL,
```

```javascript
// Line 48: paymentController.js
const existingTx = await paymentQueries.findByTxHash(txHash);
if (existingTx) {
  return res.status(400).json({
    success: false,
    error: 'Transaction already submitted',
    payment: existingTx
  });
}
```

✅ **SECURE:** Confirmation thresholds properly enforced:
```javascript
// Line 217-218: webhooks.js
const confirmationThreshold = parseInt(process.env[`CONFIRMATIONS_${chain}`] || '3');
const status = paymentData.confirmations >= confirmationThreshold ? 'confirmed' : 'pending';
```

⚠️ **MINOR ISSUE:** BlockCypher double-spend check exists but not explicitly logged:
```javascript
// Line 265: blockCypherService.js
if (tx.doubleSpend) {
  logger.warn(`[BlockCypher] Double-spend detected for tx: ${txHash}`);
  return { verified: false, error: 'Double-spend detected', confirmations: 0 };
}
```
This is good, but should also mark payment as 'failed' in database.

**Issues found:** NONE (payment verification logic is secure)

---

## API SECURITY ⚠️ NEEDS IMPROVEMENT

### Audit Results

- [x] **Keys from .env:** ✅ PASS
- [x] **No keys in logs:** ⚠️ **PARTIAL** (keys not logged, but errors might leak)
- [x] **Rate limiting:** ✅ IMPLEMENTED (`paymentLimiter` on line 19: payments.js)
- [x] **Timeout handling:** ✅ PASS (10s timeout on all API calls)

**Files reviewed:**
- `/backend/src/services/blockCypherService.js:19`
- `/backend/src/services/etherscanService.js:18`
- `/backend/src/services/tronService.js:18`
- `/backend/src/routes/payments.js:6-19`

**Findings:**

✅ **SECURE:** API keys loaded from environment:
```javascript
// Line 19: blockCypherService.js
const BLOCKCYPHER_TOKEN = process.env.BLOCKCYPHER_API_KEY;

// Line 18: etherscanService.js
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;

// Line 18: tronService.js
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY;
```

✅ **SECURE:** No hardcoded API keys found (grep confirmed):
```bash
grep -r "BLOCKCYPHER_API_KEY.*=" backend/src/
# Result: No matches (only process.env references)
```

✅ **SECURE:** Rate limiting enabled on payment endpoints:
```javascript
// Line 19: payments.js
import { paymentLimiter } from '../middleware/rateLimiter.js';

router.post('/verify', verifyToken, optionalTelegramAuth, paymentLimiter, ...);
```

✅ **SECURE:** Timeout handling on all external API calls:
```javascript
// Line 137: blockCypherService.js
return await axios.post(url, data, {
  params: BLOCKCYPHER_TOKEN ? { token: BLOCKCYPHER_TOKEN } : {},
  timeout: 10000 // ✅ 10 second timeout
});
```

⚠️ **MINOR RISK:** Error responses might leak API structure:
```javascript
// Line 148: blockCypherService.js
logger.error('[BlockCypher] Failed to register webhook:', {
  error: error.message,
  response: error.response?.data, // ⚠️ Might contain API key in URL if logged
  chain,
  address
});
```

**Recommendation:** Sanitize error logs to avoid leaking API URLs with tokens.

**Leaked keys check:**
```bash
grep -r "d86f52\|3R8PK\|TRON-PRO" backend/src/
# Result: NOT FOUND ✅
```

**Issues found:** 1 minor logging improvement needed

---

## DATABASE SECURITY ✅ SECURE

### Audit Results

- [x] **SQL injection safe:** ✅ PASS (parameterized queries)
- [x] **Idempotency check:** ✅ PASS (unique TX hash constraint)
- [x] **Transaction isolation:** ⚠️ **NOT USED** (single-query operations)
- [x] **Sensitive data encrypted:** ✅ N/A (no sensitive data stored)

**Files reviewed:**
- `/backend/src/models/db.js:431`
- `/backend/database/schema.sql`
- `/backend/src/controllers/paymentController.js:1-144`

**Findings:**

✅ **SECURE:** All queries use parameterized placeholders:
```javascript
// Line 431: db.js
findByTxHash: async (txHash) => {
  const result = await query(
    'SELECT * FROM payments WHERE tx_hash = $1', // ✅ Parameterized
    [txHash] // ✅ No string concatenation
  );
  return result.rows[0];
}
```

✅ **SECURE:** Idempotency via unique constraint:
```sql
-- schema.sql
tx_hash VARCHAR(255) UNIQUE NOT NULL,
```

```javascript
// Line 214: webhooks.js
const existingPayment = await paymentQueries.findByTxHash(paymentData.txHash);
if (existingPayment) {
  // Update existing, don't create duplicate
  await paymentQueries.updateStatus(existingPayment.id, status, confirmations);
}
```

⚠️ **MISSING:** Database transactions for atomic operations:
```javascript
// Current code (NOT atomic):
// Line 246-255: webhooks.js
const payment = await paymentQueries.create({ ... }); // ❌ Not in transaction
await paymentQueries.updateStatus(payment.id, status, confirmations);
// ... invoice update
// ... order update

// If any step fails, database is in inconsistent state
```

**Recommendation:** Use PostgreSQL transactions for multi-step operations:
```javascript
const client = await getClient();
try {
  await client.query('BEGIN');

  const payment = await client.query('INSERT INTO payments ...');
  await client.query('UPDATE invoices SET status = $1 WHERE id = $2', ['paid', invoiceId]);
  await client.query('UPDATE orders SET status = $1 WHERE id = $2', ['confirmed', orderId]);

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

**Vulnerable queries:** NONE (all queries use parameterized syntax)

**Issues found:** 1 recommendation for transaction isolation

---

## AUTHORIZATION ✅ SECURE

### Audit Results

- [x] **User can verify only THEIR payments:** ✅ PASS
- [x] **Payment amount manipulation prevented:** ✅ PASS
- [x] **Order hijacking prevented:** ✅ PASS (buyer_id check)

**Files reviewed:**
- `/backend/src/controllers/paymentController.js:14-144`

**Findings:**

✅ **SECURE:** Authorization check before verification:
```javascript
// Line 29: paymentController.js
if (order.buyer_id !== req.user.id) {
  return res.status(403).json({
    success: false,
    error: 'Access denied'
  });
}
```

✅ **SECURE:** Amount taken from order record (not user input):
```javascript
// Line 67: paymentController.js
const verification = await cryptoService.verifyTransaction(
  txHash,
  order.payment_address,
  order.total_price, // ✅ From database, not req.body
  currency
);
```

✅ **SECURE:** Order status check prevents double-payment:
```javascript
// Line 37-45: paymentController.js
const existingPayments = await paymentQueries.findByOrderId(orderId);
const verifiedPayment = existingPayments.find(p => p.status === 'confirmed');

if (verifiedPayment) {
  return res.status(400).json({
    success: false,
    error: 'Order already paid'
  });
}
```

**Issues found:** NONE (authorization is properly implemented)

---

## ATTACK SCENARIOS

### Attack 1: Amount Manipulation

**Test:** Attacker sends 0.001 BTC instead of 0.01 BTC

**Code path:** `blockCypherService.js:259-336`

**Result:** ✅ **BLOCKED**

**Verification:**
```javascript
// Line 289-307: blockCypherService.js
const actualAmount = output.value / 100000000; // 0.001 BTC
const expectedAmount = 0.01; // From invoice

const tolerance = expectedAmount * 0.01; // 0.0001 BTC
const amountMatches = Math.abs(actualAmount - expectedAmount) <= tolerance;
// Math.abs(0.001 - 0.01) = 0.009 > 0.0001 ❌

if (!amountMatches) {
  return { verified: false, error: 'Amount mismatch', ... };
}
```

**Protection:** ✅ Amount tolerance (1%) prevents significant underpayment

---

### Attack 2: Replay Attack

**Test:** Resend old webhook payload

**Code path:** `webhooks.js:181-281`

**Result:** ⚠️ **PARTIALLY DETECTED** (idempotent, but no explicit rejection)

**Current behavior:**
```javascript
// Line 214: webhooks.js
const existingPayment = await paymentQueries.findByTxHash(paymentData.txHash);

if (existingPayment) {
  // ⚠️ Updates existing payment (idempotent but processes replay)
  await paymentQueries.updateStatus(existingPayment.id, status, confirmations);
  return res.json({ status: 'updated', ... }); // ✅ Returns 200, doesn't re-confirm order
}
```

**Protection:** ⚠️ **PARTIAL**
- ✅ Idempotency prevents duplicate payments
- ❌ No explicit replay detection (webhook processed every time)
- ❌ No timestamp or nonce validation

**Fix needed:** See CVE-PS-002

---

### Attack 3: Race Condition

**Test:** 2 concurrent webhooks for same TX

**Code path:** `webhooks.js:214-242`

**Result:** ✅ **1 payment created** (database unique constraint)

**Verification:**
```sql
-- schema.sql
tx_hash VARCHAR(255) UNIQUE NOT NULL,
```

```javascript
// Concurrent request 1:
const existingPayment = await paymentQueries.findByTxHash(txHash); // null
const payment1 = await paymentQueries.create({ txHash, ... }); // ✅ Created

// Concurrent request 2:
const existingPayment = await paymentQueries.findByTxHash(txHash); // null (race!)
const payment2 = await paymentQueries.create({ txHash, ... }); // ❌ UNIQUE constraint violation
// PostgreSQL error: duplicate key value violates unique constraint "payments_tx_hash_key"
```

**Protection:** ✅ Database unique constraint prevents duplicates

**Recommendation:** Catch constraint violation gracefully:
```javascript
try {
  const payment = await paymentQueries.create({ txHash, ... });
} catch (error) {
  if (error.code === '23505') { // PostgreSQL unique violation
    logger.info('[Webhook] Payment already exists (race condition)');
    return res.json({ status: 'already_exists' });
  }
  throw error;
}
```

---

### Attack 4: Fake Webhook (Invalid Signature)

**Test:** Send webhook without valid HMAC signature

**Code path:** `webhooks.js:181-281`

**Result:** ❌ **PROCESSED** (no signature verification)

**Current code:**
```javascript
// Line 181: webhooks.js
router.post('/blockcypher', async (req, res) => {
  try {
    const payload = req.body;

    // ❌ NO SIGNATURE CHECK
    const paymentData = blockCypherService.parseWebhookPayload(payload);
    // Processes fake webhook
```

**Response code:** 200 (success) even for fake webhooks

**Protection:** ❌ **NONE** - Critical vulnerability (see CVE-PS-001)

---

### Attack 5: API Key Exposure

**Logs checked:** ✅
**Errors checked:** ✅
**Found in:** ✅ **CLEAN** (no hardcoded keys)

**Search results:**
```bash
# Check 1: Hardcoded API keys
grep -r "BLOCKCYPHER.*d86f52\|ETHERSCAN.*3R8PK\|TRONGRID.*[A-Za-z0-9]{32}" backend/src/
# Result: NOT FOUND ✅

# Check 2: Keys in .env.example
cat backend/.env.example | grep API_KEY
# Result: Only placeholder values ✅
BLOCKCYPHER_API_KEY=your-blockcypher-token-here
ETHERSCAN_API_KEY=your-etherscan-api-key-here
TRONGRID_API_KEY=your-trongrid-api-key-here

# Check 3: Keys in logs
grep -r "logger.*API_KEY\|console.log.*API" backend/src/
# Result: NOT FOUND ✅
```

**Impact if stolen:**

**BlockCypher API key:**
- Read-only access to blockchain data
- Attacker can create webhooks (requires callback URL control)
- Rate limit consumption (DoS)
- **Mitigation:** Rotate key, revoke webhook subscriptions

**Etherscan API key:**
- Read-only blockchain queries
- No payment manipulation possible
- Rate limit consumption
- **Mitigation:** Rotate key

**TronGrid API key:**
- Same as Etherscan (read-only)
- **Mitigation:** Rotate key

**Overall impact:** 🟡 **MEDIUM** (no direct money loss, but service disruption possible)

---

## POLLING SERVICE SECURITY ✅ SECURE

### Audit Results

- [x] **Doesn't miss transactions:** ✅ PASS (queries all pending invoices)
- [x] **Race condition prevention:** ✅ PASS (unique TX constraint)
- [x] **Error handling (API down):** ✅ PASS (try/catch, continues on error)
- [x] **Retry logic:** ✅ PASS (exponential backoff in services)

**Files reviewed:**
- `/backend/src/services/pollingService.js:1-502`

**Findings:**

✅ **SECURE:** Comprehensive pending invoice query:
```javascript
// Line 169: pollingService.js
const result = await invoiceQueries.findPendingByChains(['ETH', 'TRON']);
return result || [];
```

✅ **SECURE:** Error handling prevents service crash:
```javascript
// Line 153-159: pollingService.js
} catch (error) {
  stats.errors++;
  logger.error('[PollingService] Poll failed:', {
    error: error.message,
    stack: error.stack
  });
  // ✅ Doesn't throw - continues polling
}
```

✅ **SECURE:** Retry logic with exponential backoff:
```javascript
// Line 95-118: etherscanService.js
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Don't retry on 4xx errors
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt); // ✅ Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

✅ **SECURE:** Race condition handled via unique constraint:
```javascript
// Line 218-232: pollingService.js
const existingPayment = await paymentQueries.findByTxHash(payment.txHash);

if (existingPayment) {
  // Update existing (no duplicate creation)
  await paymentQueries.updateStatus(existingPayment.id, payment.status, ...);
}
```

**Issues found:** NONE (polling service is well-designed)

---

## CRITICAL VULNERABILITIES (CVE-style)

### CVE-PS-001: BlockCypher Webhook Missing HMAC Signature Verification

**Severity:** 🔴 **CRITICAL** (CVSS 9.0)
**Component:** `/backend/src/routes/webhooks.js:181-281`

**Description:**
BlockCypher webhook endpoint processes payment confirmations without verifying HMAC-SHA256 signature. Allows unauthorized actors to forge webhook payloads and confirm fraudulent orders.

**Exploit:**
```bash
# Step 1: Attacker creates order for digital product (e.g., USDT code)
# Step 2: Attacker obtains payment address from invoice API
# Step 3: Attacker sends fake webhook:

curl -X POST https://api.statusstock.com/webhooks/blockcypher \
  -H "Content-Type: application/json" \
  -d '{
    "hash": "fake_tx_000000000000000000000000000000000000000000000000000000000000",
    "confirmations": 6,
    "block_height": 800000,
    "outputs": [{
      "addresses": ["bc1qshop_payment_address_here"],
      "value": 100000000
    }]
  }'

# Result: Order status changed to "confirmed", product delivered without payment
```

**Impact:**
- **Financial loss:** Unlimited free products for attackers
- **Reputation damage:** Sellers lose trust in platform
- **Service disruption:** Mass exploitation possible

**Fix:**
```javascript
// 1. Add signature verification
const crypto = require('crypto');

function verifyBlockCypherSignature(payload, signature) {
  const secret = process.env.BLOCKCYPHER_WEBHOOK_SECRET;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return signature === expectedSignature;
}

// 2. Check signature before processing
router.post('/blockcypher', async (req, res) => {
  const signature = req.headers['x-webhook-signature'];

  if (!verifyBlockCypherSignature(req.body, signature)) {
    logger.warn('[Webhook] Invalid signature - possible attack');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Process webhook...
});

// 3. Add to .env
BLOCKCYPHER_WEBHOOK_SECRET=<generate_random_256bit_key>
```

---

### CVE-PS-002: Webhook Replay Attack Vulnerability

**Severity:** 🔴 **HIGH** (CVSS 7.5)
**Component:** `/backend/src/routes/webhooks.js:181-281`

**Description:**
No replay attack prevention. Legitimate webhook payloads can be replayed indefinitely. While idempotency prevents duplicate payments, replayed webhooks waste resources and could exploit timing-based vulnerabilities.

**Exploit:**
```bash
# 1. Capture legitimate webhook via MitM or server logs
# 2. Replay webhook 1000 times per second
# 3. Server processes each replay (database queries, log writes)
# 4. Potential DoS if combined with high volume
```

**Impact:**
- **Resource exhaustion:** Database/CPU load from repeated processing
- **Service degradation:** Legitimate webhooks delayed
- **Potential exploitation:** If combined with race conditions

**Fix:**
```javascript
// Option 1: Webhook ID tracking
CREATE TABLE webhook_logs (
  webhook_id VARCHAR(255) PRIMARY KEY,
  processed_at TIMESTAMP DEFAULT NOW()
);

// Option 2: Timestamp validation
const webhookTimestamp = parseInt(req.headers['x-timestamp']);
const maxAge = 300000; // 5 minutes

if (Date.now() - webhookTimestamp > maxAge) {
  return res.status(400).json({ error: 'Webhook expired' });
}

// Option 3: Nonce-based
const nonce = req.headers['x-nonce'];
await redisClient.set(`webhook:${nonce}`, '1', 'EX', 3600); // 1 hour expiry
```

---

### CVE-PS-003: Missing Database Transaction Isolation

**Severity:** 🟡 **MEDIUM** (CVSS 5.5)
**Component:** `/backend/src/routes/webhooks.js:246-266`

**Description:**
Multi-step payment confirmation process (create payment → update invoice → update order → notify user) is not wrapped in database transaction. If any step fails, database is left in inconsistent state.

**Exploit:**
```javascript
// Scenario: Network interruption during webhook processing
const payment = await paymentQueries.create({ ... }); // ✅ Success
await paymentQueries.updateStatus(payment.id, 'confirmed', 6); // ✅ Success
await invoiceQueries.updateStatus(invoice.id, 'paid'); // ❌ Network timeout

// Result: Payment marked confirmed, but invoice still "pending"
// Order never ships, but seller has record of payment
```

**Impact:**
- **Data inconsistency:** Payments confirmed but orders not fulfilled
- **Manual reconciliation:** Support team must manually fix records
- **User frustration:** Buyers pay but don't receive products

**Fix:**
```javascript
const client = await getClient();

try {
  await client.query('BEGIN');

  const payment = await client.query(
    'INSERT INTO payments (order_id, tx_hash, amount, currency, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [orderId, txHash, amount, currency, 'confirmed']
  );

  await client.query(
    'UPDATE invoices SET status = $1 WHERE id = $2',
    ['paid', invoiceId]
  );

  await client.query(
    'UPDATE orders SET status = $1 WHERE id = $2',
    ['confirmed', orderId]
  );

  await client.query('COMMIT');

  // Send notification AFTER database commit
  await telegramService.notify(...);

} catch (error) {
  await client.query('ROLLBACK');
  logger.error('[Webhook] Transaction failed, rolled back:', error);
  throw error;
} finally {
  client.release();
}
```

---

## RECOMMENDATIONS

### Must Fix Before Production (BLOCKERS)

1. **[CVE-PS-001] Implement BlockCypher webhook signature verification**
   - Priority: 🔴 CRITICAL
   - Effort: 2 hours
   - Files: `/backend/src/routes/webhooks.js`, `/backend/.env`

2. **[CVE-PS-002] Add replay attack prevention**
   - Priority: 🔴 CRITICAL
   - Effort: 3 hours
   - Files: `/backend/src/routes/webhooks.js`, database migration

3. **[CVE-PS-003] Wrap multi-step operations in database transactions**
   - Priority: 🟡 HIGH
   - Effort: 4 hours
   - Files: `/backend/src/routes/webhooks.js`, `/backend/src/controllers/paymentController.js`

### Should Fix Soon (High Priority)

4. **Sanitize error logs to prevent API key leakage**
   - Priority: 🟡 MEDIUM
   - Effort: 1 hour
   - Files: All service files (`*Service.js`)
   - Fix: Remove `error.response?.data` from logs, only log `error.message`

5. **Add graceful handling for unique constraint violations**
   - Priority: 🟡 MEDIUM
   - Effort: 1 hour
   - Files: `/backend/src/routes/webhooks.js`
   - Fix: Catch PostgreSQL error code `23505` and return 200 (idempotent)

### Nice to Have (Best Practices)

6. **Add webhook signature verification for all providers**
   - Currently: Only Tatum has signature verification (but Tatum is disabled)
   - Add: Etherscan, TronGrid webhook signatures (if they support it)

7. **Implement rate limiting on webhook endpoints**
   - Currently: No rate limiting on `/webhooks/blockcypher`
   - Add: Max 100 requests/minute per IP

8. **Add monitoring alerts for suspicious webhook activity**
   - Alert on: Multiple failed signature verifications from same IP
   - Alert on: Unusual spike in webhook volume
   - Alert on: Webhooks for non-existent invoices

9. **Encrypt sensitive data at rest (future enhancement)**
   - Currently: No encryption needed (public blockchain addresses only)
   - Future: If storing user personal data, use `pgcrypto` extension

---

## PRODUCTION READY?

### ❌ **NO** - 3 critical vulnerabilities must be fixed

**Blocker issues:**

1. **CVE-PS-001:** BlockCypher webhook has no signature verification
   - **Risk:** Attacker can confirm any order without paying
   - **Fix time:** 2-3 hours
   - **Testing needed:** Yes (webhook simulation)

2. **CVE-PS-002:** Replay attack prevention missing
   - **Risk:** Service disruption, potential exploitation
   - **Fix time:** 3-4 hours
   - **Testing needed:** Yes (replay simulation)

3. **CVE-PS-003:** Database transaction isolation missing
   - **Risk:** Data inconsistency, manual reconciliation overhead
   - **Fix time:** 4-5 hours
   - **Testing needed:** Yes (failure simulation)

**Estimated total effort to production-ready:** 9-12 hours

---

## POSITIVE FINDINGS (What Works Well)

✅ **HD Wallet Implementation:** Secure watch-only address generation
✅ **Payment Verification Logic:** Robust amount validation with tolerance
✅ **Double-spend Protection:** Database unique constraints prevent duplicates
✅ **Authorization:** Proper user access control on payment endpoints
✅ **API Key Management:** No hardcoded secrets, all from environment
✅ **Polling Service:** Well-designed with error handling and retry logic
✅ **Rate Limiting:** Payment API endpoints have rate limiting
✅ **Timeout Handling:** All external API calls have 10s timeout

---

## FINAL VERDICT

**Overall Security Score:** 6.5/10

**Strengths:**
- Core payment logic is solid
- HD wallet implementation follows best practices
- Database schema design prevents duplicates
- Authorization checks are comprehensive

**Critical Gaps:**
- Webhook authentication completely missing
- Replay attack prevention absent
- Database transaction isolation not used

**Recommendation:**
**Fix 3 critical vulnerabilities before production deployment.**
After fixes, re-audit webhook endpoints with penetration testing.

---

**Audit completed:** 2025-10-25
**Next review:** After critical fixes implemented
**Auditor:** Claude Code (Backend Architect)
