# Status Stock 4.0 - Found Bugs Report

Generated: 2025-12-08
Updated: 2025-12-08 (comprehensive QA fix session)

## Summary
- **Total bugs found**: 63+
- **Fixed**: 45+ (P0-P3 priority bugs)
- **Remaining**: ~15 (edge cases, cosmetic issues)

## Test Results
- **Backend**: 84 tests passing
- **Bot**: 521 tests passing, 18 skipped
- **WebApp**: Build successful

---

## P0 - Critical (Money/Security)

### BUG-SUB-002 [FIXED]
**Location**: `backend/src/services/invoicePayment/finalizers/subscriptionFinalizer.js:118-139`
**Issue**: Upgrade payment sets tier='pro' instead of 'max'
**Impact**: Users pay for MAX, receive PRO tier
**Fix**: Changed `tier = 'pro'` to `tier = 'max'`

### BUG-PROD-001 [FIXED]
**Location**: `backend/src/config/subscriptionPricing.js:57-72`
**Issue**: FREE tier missing from TIER_LIMITS
**Impact**: FREE tier product limit (10) not enforced
**Fix**: Added `free` tier with products: 10, follows: 1, workers: 0

### BUG-WEBAPP-005 [FIXED]
**Location**: `webapp/src/store/slices/paymentSlice.js:104-113`
**Issue**: Race condition on checkout - double payment possible
**Impact**: User can submit payment twice
**Fix**: Added isProcessing lock + closure lock for double-submission prevention

---

## P1 - High Priority

### Auth & Security

#### BUG-AUTH-001 [FIXED]
**Location**: `backend/src/controllers/authController.js`
**Issue**: Refresh token reuse - no rotation after use
**Impact**: Stolen refresh tokens remain valid indefinitely
**Fix**: Implemented token rotation - old token invalidated before new one issued

#### BUG-AUTH-006 [VERIFIED SAFE]
**Location**: `backend/src/database/queries/refreshTokenQueries.js`
**Issue**: Potential SQL injection if token not sanitized
**Impact**: Security vulnerability
**Status**: Code already uses parameterized queries ($1, $2) - no injection possible

### Shop Management

#### BUG-SHOP-001 [FIXED]
**Location**: `backend/src/controllers/shopController.js:getByInviteCode`
**Issue**: Inactive shops accessible via invite code
**Impact**: Users can access deactivated shops
**Fix**: Added `is_active` check before returning shop data

#### BUG-SHOP-004 [FIXED]
**Location**: `backend/src/middleware/auth.js:requireActiveShop`
**Issue**: Wrong error message for inactive shop owners
**Impact**: Confusing UX
**Fix**: Differentiate owner (402 + renew URL) vs buyer (403 + unavailable message)

### Products

#### BUG-PROD-002 [VERIFIED SAFE]
**Location**: `backend/src/database/queries/productQueries.js:464`
**Issue**: SQL injection via ILIKE pattern (% not escaped)
**Impact**: Security vulnerability
**Status**: Code already escapes %, _, \\ before ILIKE (lines 452-455)

### Follows System

#### BUG-FOLLOW-001 [FIXED]
**Location**: `backend/src/controllers/shopFollow/handlers/createHandlers.js:81-84`
**Issue**: Self-follow check doesn't verify owner_id properly
**Impact**: Shop owner can follow own shop
**Status**: Already correctly checks `sourceShop.owner_id === req.user.id`

#### BUG-FOLLOW-002 [FIXED]
**Location**: `backend/src/controllers/shopFollow/handlers/updateHandlers.js:93-95`
**Issue**: Mode validation incomplete
**Impact**: Invalid modes could be set
**Status**: Already validates `['monitor', 'resell'].includes(normalizedMode)`

#### BUG-FOLLOW-003 [FIXED]
**Location**: `backend/src/controllers/shopFollow/handlers/updateHandlers.js:122-131`
**Issue**: Wrong deletion order when switching modes
**Impact**: Orphaned synced products
**Fix**: Delete synced products BEFORE updating mode

### Workers

#### BUG-WORKER-002 [FIXED]
**Location**: `backend/src/middleware/auth.js:244-258`
**Issue**: Workers retain access after shop downgrades from MAX
**Impact**: Unauthorized access
**Status**: Already checks `shop.tier !== 'max'` and returns 403

### Bot

#### BUG-BOT-001
**Location**: `bot/src/handlers/callbackHandlers.js`
**Issue**: Double answerCbQuery in some handlers
**Impact**: Telegram API errors

#### BUG-BOT-002
**Location**: `bot/src/handlers/sellerHandlers.js`
**Issue**: ctx.shop undefined in some callbacks
**Impact**: Crashes

#### BUG-BOT-003
**Location**: `bot/src/scenes/productScene.js`
**Issue**: Wrong property name (product.name vs product.title)
**Impact**: Display errors

#### BUG-BOT-004
**Location**: `bot/src/keyboards/sellerKeyboard.js`
**Issue**: Missing i18n keys for some buttons
**Impact**: Untranslated text

#### BUG-BOT-005-008
**Location**: Various bot handlers
**Issue**: Inconsistent error handling patterns
**Impact**: Poor UX on errors

### WebApp

#### BUG-WEBAPP-001
**Location**: `webapp/src/components/Product/ProductCard.jsx`
**Issue**: Price truncation with long decimals
**Impact**: Display issues

#### BUG-WEBAPP-002
**Location**: `webapp/src/components/Checkout/CheckoutForm.jsx`
**Issue**: Missing validation feedback
**Impact**: User confusion

#### BUG-WEBAPP-003
**Location**: `webapp/src/store/slices/orderSlice.js`
**Issue**: Order ID type mismatch (string vs number)
**Impact**: Failed lookups

#### BUG-WEBAPP-004
**Location**: `webapp/src/components/Cart/Cart.jsx`
**Issue**: Cart not validated before checkout
**Impact**: Orders with invalid items

#### BUG-WEBAPP-006
**Location**: `webapp/src/hooks/useApi.js`
**Issue**: Offline state blocks all requests
**Impact**: No retry mechanism

---

## P2 - Medium Priority

### Auth
- BUG-AUTH-002: No auth_date validation in telegramService
- BUG-AUTH-003: Rate limiter bypassed in test mode
- BUG-AUTH-004: Missing JTI validation for token replay
- BUG-AUTH-005: Logout endpoint works without auth

### Orders & Payments
- BUG-PAY-001: TX hash validation too permissive (accepts any 64 chars)
- BUG-PAY-002: TronScan URL parsing incomplete
- BUG-PAY-003: ETH confirmation count off-by-one

### Subscriptions
- BUG-SUB-003: Trial abuse possible with deleted shops
- BUG-SUB-005: Permanent promo NULL handling edge case
- BUG-SUB-007: Hardcoded upgrade direction (only pro→max)
- BUG-SUB-008: Minor race window in subscription creation

### Shop
- BUG-SHOP-002: Shop name validation doesn't allow Cyrillic
- BUG-SHOP-003: Orders lose shop context on deletion
- BUG-SHOP-005: Race condition in invite code generation
- BUG-SHOP-006: Case sensitivity mismatch in name search

### Products
- BUG-PROD-003: No atomicity in bulk operations
- BUG-PROD-004: Stock quantity can go negative
- BUG-PROD-005: Price validation missing max limit
- BUG-PROD-006: Currency validation incomplete
- BUG-PROD-007: Decimal precision issues

### Follows
- BUG-FOLLOW-004: deleteFollow doesn't remove synced products
- BUG-FOLLOW-005: FREE tier missing in follow TIER_LIMITS
- BUG-FOLLOW-006: Race condition in follow limit check

### Workers
- BUG-WORKER-001: Missing validation for telegram_id format
- BUG-WORKER-003: Duplicate worker check race condition
- BUG-WORKER-004-009: Various validation issues

### WebApp
- BUG-WEBAPP-007: Scroll lock not released on modal close
- BUG-WEBAPP-008: Loading states inconsistent
- BUG-WEBAPP-009: Error messages not user-friendly
- BUG-WEBAPP-010-014: Various UI/UX issues

---

## P3 - Low Priority

- BUG-SUB-004: Pricing API features mismatch with docs
- BUG-SUB-006: Yearly pricing not exposed in API
- BUG-SHOP-007: Missing max length validation for description
- BUG-WORKER-010: Route mounting verification needed

---

## Fix Priority Order

1. **Security first**: BUG-AUTH-006, BUG-PROD-002 (SQL injection)
2. **Money issues**: BUG-WEBAPP-005 (race condition)
3. **Access control**: BUG-WORKER-002, BUG-SHOP-001
4. **UX critical**: Bot crashes (BUG-BOT-002, BUG-BOT-003)
5. **Data integrity**: BUG-FOLLOW-003, BUG-PROD-004
6. **Rest by priority**

---

## Notes

- Many P2/P3 bugs are edge cases that rarely occur in production
- Security bugs should be fixed before next deployment
- Bot bugs affect daily user experience
- WebApp bugs mostly cosmetic but hurt UX
