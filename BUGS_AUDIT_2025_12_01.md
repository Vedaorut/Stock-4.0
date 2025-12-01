# Status Stock 4.0 — Full Functional Audit Report

**Date:** 2025-12-01
**Total Bugs Found:** 43

---

## Summary by Severity

| Severity | Backend | Bot | WebApp | **TOTAL** |
|----------|---------|-----|--------|-----------|
| **P0** (critical) | 0 | 0 | 1 | **1** |
| **P1** (high) | 2 | 3 | 3 | **8** |
| **P2** (medium) | 6 | 9 | 9 | **24** |
| **P3** (low) | 4 | 4 | 2 | **10** |

---

## P0 — CRITICAL (fix NOW)

### #1 WebApp: `displayShop` undefined in search
- **File:** `webapp/src/pages/Catalog.jsx:224`
- **Code:**
```jsx
const searchProducts = useCallback(
  (query) => {
    const resultsWithShop = filtered.map((product) => ({
      ...product,
      shop_id: displayShop?.id,        // <-- displayShop not defined yet!
      shop_name: displayShop?.name || 'Shop',
    }));
  },
  [products, displayShop]
);
// displayShop is defined BELOW on line 396:
const displayShop = currentShop || myShop;
```
- **Problem:** Variable used before definition
- **Impact:** Product search broken — shop_id/shop_name will be undefined
- **Fix:** Move `displayShop` definition above `searchProducts` useCallback

---

## P1 — HIGH (fix before release)

### #2 Backend: Double stock deduction
- **Files:**
  - `backend/src/services/invoicePayment/processors/orderProcessor.js:215-228`
  - `backend/src/services/invoicePayment/finalizers/orderFinalizer.js:177-192`
- **Problem:** Stock deducted in BOTH files during payment confirmation
- **Impact:** Stock decreases twice for one order
- **Fix:** Remove stock deduction from one location (keep only in finalizer)

### #3 Backend: reserved_quantity never incremented
- **File:** `backend/src/services/invoiceCleanupService.js:68-78`
- **Problem:** System decrements reserved_quantity on cancel, but never increments it on order creation
- **Impact:** Reservation logic broken, can go negative
- **Fix:** Either remove reserved_quantity logic or add increment in createOrderWithItems

### #4 Bot: Price WITHOUT $ in confirmList
- **File:** `bot/src/texts/messages.js:475`
- **Code:**
```javascript
return `${i + 1}. ${buyer} — ${safe(o.product_name)} (${safe(o.quantity)} шт) — ${safe(o.total_price)}`;
// Shows: "1. @user - iPhone (2 шт) - 250" instead of "$250"
```
- **Fix:** Change to `$${safe(o.total_price)}`

### #5 Bot: Price WITHOUT $ in shopPanelWithStats
- **File:** `bot/src/texts/messages.js:160-163`
- **Code:**
```javascript
const formattedRevenue = revenue > 0
  ? `${Number(revenue).toLocaleString('en-US', {...})}`  // NO $ when revenue > 0!
  : '$0';
```
- **Fix:** Add `$` prefix: `$${Number(revenue).toLocaleString(...)}`

### #6 Bot: seller:mark_shipped callback broken
- **File:** `bot/src/handlers/seller/orders.js:92`
- **Problem:** Button uses `seller:mark_shipped` callback, but handler expects regex with orderId
- **Impact:** Button does nothing or throws error
- **Fix:** Use scene or fix callback pattern

### #7 WebApp: verifyError race condition
- **File:** `webapp/src/components/Payment/PaymentHashModal.jsx:59-62`
- **Code:**
```jsx
await submitPaymentHash(cleanHash);
if (!verifyError) {  // <-- checks OLD state value!
  setTxHash('');
}
```
- **Problem:** State not updated yet after await
- **Fix:** submitPaymentHash should return result

### #8 WebApp: require() in ESM
- **File:** `webapp/src/components/Payment/PaymentFlowManager.jsx:30-31`
- **Code:**
```jsx
const { useStore } = require('../../store/useStore');  // CommonJS in ESM!
```
- **Problem:** May not work in Vite production build
- **Fix:** Import at top of file or use dynamic import()

### #9 WebApp: WebSocket doesn't notify payment confirmation
- **File:** `webapp/src/hooks/useWebSocket.js:127-184`
- **Problem:** No handler for `payment_confirmed` type
- **Impact:** User won't know payment succeeded without refresh
- **Fix:** Add payment_confirmed handler with toast/UI update

---

## P2 — MEDIUM (fix this sprint)

### Backend (6):

#### #10 resetProductMarkup doesn't recalculate price
- **File:** `backend/src/controllers/shopFollowController.js:886`
- **Problem:** After reset to global markup, product price not recalculated
- **Fix:** Add price recalculation after resetCustomMarkup

#### #11 ETH confirmations off by one
- **File:** `backend/src/services/blockchainVerificationService.js:461`
- **Code:** `const confirmations = currentBlock - blockNumber;`
- **Fix:** Should be `currentBlock - blockNumber + 1`

#### #12 Amount tolerance too high (2%)
- **File:** `backend/src/services/blockchainVerificationService.js:68`
- **Problem:** $1000 order accepts $980 payment
- **Fix:** Reduce to 0.5-1% or add absolute limit

#### #13 switchFollowMode doesn't update existing products
- **File:** `backend/src/controllers/shopFollowController.js:630-634`
- **Problem:** New markup not applied to already synced products
- **Fix:** Call updateMarkupForFollow after syncAllProductsForFollow

#### #14 Subscription upgrade resets period
- **File:** `backend/src/services/invoicePayment/finalizers/subscriptionFinalizer.js:100-103`
- **Problem:** Upgrade sets new 30-day period instead of preserving remaining days
- **Note:** May be intended behavior — verify business requirements

#### #15 Legacy order fallback without items check
- **File:** `backend/src/services/invoicePayment/finalizers/orderFinalizer.js:102-125`
- **Problem:** For multi-item orders with empty orderItems, only checks first product

### Bot (9):

#### #16 markOrdersShipped price may be undefined
- **File:** `bot/src/scenes/markOrdersShipped.js:266`
- **Code:** `Сумма: $${order.total_price}` — can show `$undefined`
- **Fix:** Use `formatPrice(order.total_price ?? 0)`

#### #17 AI selection price without $
- **File:** `bot/src/handlers/seller/aiProducts.js:488`
- **Code:** `text: \`${opt.name} (${opt.price})\``
- **Fix:** Change to `${opt.name} ($${opt.price})`

#### #18 Race condition in editFollowMarkup
- **File:** `bot/src/scenes/editFollowMarkup.js:52-76`
- **Problem:** 5-second lock blocks legitimate operations
- **Fix:** Clear lock on successful completion

#### #19 Escape characters in markup prompt
- **File:** `bot/src/scenes/editFollowMarkup.js:119`
- **Code:** `'...\\n\\n' + prompt` — shows literal `\n\n`
- **Fix:** Use single backslash `\n\n`

#### #20 answerCbQuery called twice in chooseTier
- **File:** `bot/src/scenes/chooseTier.js:64, 109`
- **Fix:** Remove duplicate call on line 109

#### #21 Hardcoded fallback prices
- **File:** `bot/src/utils/api.js:652-658`
- **Problem:** If API fails, shows $25/$35 which may be outdated
- **Fix:** Show error instead or sync with backend

#### #22 Token refresh not implemented
- **File:** `bot/src/utils/api.js`
- **Problem:** No auto-refresh on 401
- **Fix:** Add axios interceptor

#### #23-25 Unhandled callbacks
- **File:** `bot/src/handlers/seller/orders.js:406-428`
- **Callbacks:** seller:order_search, seller:order_stats, seller:order_export
- **Fix:** Register handlers or remove buttons

### WebApp (9):

#### #26-29 Price formatting inconsistent
- **Files:**
  - `webapp/src/components/Cart/CartItem.jsx:149`
  - `webapp/src/components/Product/ProductCard.jsx:301, 313` (uses Math.round!)
  - `webapp/src/pages/FollowDetail.jsx:376, 380`
  - `webapp/src/components/Settings/ProductsModal.jsx:63`
- **Fix:** Create unified `formatPrice()` function

#### #30 useStore.getState() in render
- **File:** `webapp/src/components/Payment/OrderStatusModal.jsx:40-41`
- **Problem:** Doesn't subscribe to changes
- **Fix:** Use `useStore((s) => s.pendingOrders)`

#### #31 cryptoAmount may be NaN
- **File:** `webapp/src/components/Settings/MyOrdersModal.jsx:101-104`
- **Fix:** Check `!isNaN(cryptoAmount) && cryptoAmount > 0`

#### #32 loadMyShop potential loop
- **File:** `webapp/src/pages/Catalog.jsx:145-147`
- **Note:** Already has workaround via eslint-disable

#### #33 formatCryptoAmount crashes on non-number
- **File:** `webapp/src/utils/paymentUtils.js:118-127`
- **Fix:** Add `parseFloat(amount) || 0`

#### #34 No feedback on stock limit in cart
- **File:** `webapp/src/components/Cart/CartItem.jsx:37-40`
- **Fix:** Add toast when limit reached

---

## P3 — LOW (fix when convenient)

### Backend (4):
- #35 Subscription reminder grammar ("5 дня" instead of "5 дней") — `subscriptionService.js:319`
- #36 markupType not validated explicitly — `shopFollowController.js:327`
- #37 TRON address validation edge case — `blockchainVerificationService.js:656`
- #38 Dead code: processSubscriptionPayment throws Error — `subscriptionService.js:64-75`

### Bot (4):
- #39 invoiceGenerated cryptoAmount not formatted — `messages.js:683`
- #40 Back button may fail if session lost — `scenes/createFollow.js`
- #41 Callback data length not checked (64 byte limit)
- #42 getShopSubscribers deprecated but still called — `api.js:704`

### WebApp (2):
- #43 "Browse Catalog" hardcoded English — `CartSheet.jsx:213`
- #44 Toast API inconsistent (object vs positional args) — `useStore.js:542`

---

## Fix Priority Plan

### Day 1 — Critical:
1. Fix displayShop in Catalog.jsx
2. Verify double stock deduction (may be false positive)
3. Add $ to all price displays in bot

### Day 2-3 — Payment/Order flow:
4. Fix PaymentHashModal race condition
5. Fix require() in PaymentFlowManager
6. Add WebSocket payment_confirmed handler
7. Fix mark_shipped callback

### Day 4-5 — Formatting:
8. Create unified formatPrice() for webapp
9. Apply to all components

---

## Notes

- Some bugs may be false positives — verify before fixing
- Double stock deduction needs careful code review
- Amount tolerance (2%) is business decision
- Subscription upgrade period reset may be intended

---

*Generated by Claude Code Functional Audit*
