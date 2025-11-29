# Security Fixes Implementation Plan

## Overview
Fix 6 security vulnerabilities found by Codex audit.
Priority: #1-#2 (Auth) → #4 (Webhook) → #3,#5 (IDOR) → #6 (Low)

---

## Issue #1: CRITICAL - Register без верификации Telegram

**File:** `backend/src/controllers/authController.js:83`

**Problem:** `/api/auth/register` accepts arbitrary telegramId without HMAC verification.

**Fix:**
1. Require `x-telegram-init-data` header
2. Use `verifyTelegramInitData` middleware pattern (like `telegramValidate` endpoint on line 311)
3. Extract user.id from verified initData, NOT from body
4. Remove client-trusted telegramId from body processing

**Code changes:**
```javascript
// BEFORE (insecure):
const { telegramId, username } = req.body;

// AFTER (secure):
// Middleware already verified initData and set req.telegramUser
const { id: telegramId, username } = req.telegramUser;
```

**Subagent:** `backend-architect`
**Verify:** Try register without initData → should fail 401

---

## Issue #2: HIGH - Login с подменой telegramId

**File:** `backend/src/controllers/authController.js:17`

**Problem:** Login verifies initData but uses body.telegramId instead of parsed user.id.

**Fix:**
1. After verifying initData, extract user.id from parsed data
2. Compare with body.telegramId - reject if mismatch
3. auth_date freshness already checked in middleware (15 min)

**Code changes:**
```javascript
// BEFORE:
const { telegramId } = req.body;
// ... later uses telegramId from body

// AFTER:
const parsedUser = telegramService.parseInitData(initData);
if (parsedUser.id !== req.body.telegramId) {
  return res.status(403).json({ error: 'Telegram ID mismatch' });
}
const telegramId = parsedUser.id; // Use verified ID
```

**Subagent:** `backend-architect`
**Verify:** Try login with valid initData but different telegramId → should fail 403

---

## Issue #3: HIGH - Debug endpoints без auth (IDOR)

**File:** `backend/src/routes/debug.js:36`

**Problem:** Debug endpoints accessible to any authenticated user.

**Fix Options:**
1. **Option A (Recommended):** Disable in production via NODE_ENV check
2. **Option B:** Add admin-only middleware
3. **Option C:** Add ownership check for each resource

**Implementation (Option A + C hybrid):**
```javascript
// At top of debug.js:
if (process.env.NODE_ENV === 'production') {
  router.all('*', (req, res) => {
    res.status(404).json({ error: 'Debug endpoints disabled in production' });
  });
}

// For dev: add ownership checks
router.get('/invoice/:id', authenticateToken, async (req, res) => {
  const invoice = await findById(id);
  // Check ownership via subscription → shop → user
  if (invoice.subscription.shop.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  // ... return data
});
```

**Subagent:** `backend-architect`
**Verify:** In production mode, debug endpoints return 404

---

## Issue #4: HIGH - Webhook без проверки суммы

**File:** `backend/src/routes/webhooks.js:20`

**Problem:** CrystalPay webhook marks invoice paid without amount verification.

**Fix:**
1. After signature verification, compare webhook amount vs invoice expected_amount
2. Compare currency
3. Log anomalies for underpayment
4. Reject if amount mismatch

**Code changes:**
```javascript
// After signature verification:
const invoice = await findInvoiceByPaymentId(payload.id);

// Amount verification
if (parseFloat(payload.amount) < parseFloat(invoice.amount)) {
  logger.warn('Underpayment detected', {
    invoiceId: invoice.id,
    expected: invoice.amount,
    received: payload.amount
  });
  return res.status(400).json({ error: 'Amount mismatch' });
}

// Currency verification
if (payload.currency !== invoice.currency) {
  logger.warn('Currency mismatch', { ... });
  return res.status(400).json({ error: 'Currency mismatch' });
}
```

**Subagent:** `backend-architect`
**Verify:** Send test webhook with wrong amount → should be rejected

---

## Issue #5: MEDIUM - IDOR invoice status

**File:** `backend/src/routes/payments.js:126`

**Problem:** Any user can check any invoice status by ID.

**Fix:**
1. After fetching invoice, verify ownership
2. Check if invoice belongs to user's subscription/shop OR user is the buyer

**Code changes:**
```javascript
router.get('/invoices/:id/status', verifyToken, async (req, res) => {
  const invoice = await invoiceQueries.findById(invoiceId);

  // Check ownership: subscription owner or buyer
  const isOwner = invoice.subscription?.shop?.user_id === req.user.id;
  const isBuyer = invoice.buyer_id === req.user.id;

  if (!isOwner && !isBuyer) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Return status
});
```

**Subagent:** `backend-architect`
**Verify:** Try access other user's invoice → should fail 403

---

## Issue #6: LOW - Hardcoded prices в боте

**File:** `bot/src/scenes/chooseTier.js:34`

**Problem:** Tier prices hardcoded ($25, $35), may drift from backend.

**Fix:**
1. Create shared config or fetch from API
2. Use config values in bot

**Options:**
- A) Shared `packages/shared-config/prices.js` imported by both
- B) Bot fetches prices from Backend API `/api/subscription/tiers`
- C) Move prices to `.env` variables

**Implementation (Option B - API):**
```javascript
// In chooseTier.js
const { data: tiers } = await axios.get(`${BACKEND_URL}/api/subscription/tiers`);
const buttons = tiers.map(tier =>
  Markup.button.callback(`${tier.name} $${tier.price}/month`, `tier_select:${tier.id}`)
);
```

**Subagent:** `telegram-bot-expert`
**Verify:** Change price in backend → bot shows updated price

---

## Execution Order

1. **Phase 1 - Auth (Critical)**
   - Fix #1: Register verification
   - Fix #2: Login ID binding
   - Test: Auth flow works, impersonation blocked

2. **Phase 2 - Webhook**
   - Fix #4: Amount verification
   - Test: Underpayment rejected

3. **Phase 3 - IDOR**
   - Fix #3: Debug endpoints
   - Fix #5: Invoice status
   - Test: Cross-user access blocked

4. **Phase 4 - Low Priority**
   - Fix #6: Dynamic prices
   - Test: Prices sync from backend

---

## Verification Checklist

After all fixes:
- [ ] Run `npm test` in backend
- [ ] Run `npm test` in bot
- [ ] Manual test: register without initData fails
- [ ] Manual test: login with wrong telegramId fails
- [ ] Manual test: debug endpoints 404 in production
- [ ] Manual test: webhook with wrong amount rejected
- [ ] Manual test: invoice status blocked for non-owner
- [ ] Prices in bot match backend config

---

Created: 2024-11-28
