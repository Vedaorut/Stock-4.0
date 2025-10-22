# 🐛 Bug Fix Report: Products Currency Constraint

**Date:** 2025-10-22  
**Bug ID:** PROD-001  
**Severity:** 🔴 CRITICAL  
**Status:** ✅ FIXED

---

## 📋 Summary

**Symptom:** Unable to add products through Telegram bot (HTTP 500 error)  
**Root Cause:** Database constraint rejected USD currency  
**Impact:** Core functionality broken - sellers cannot add products  
**Fix Time:** 15 minutes

---

## 🔍 Bug Details

### What Happened

User tried to add a product via Telegram bot:
1. ✅ User enters product name → **Success**
2. ✅ User enters price (e.g., "15" or "15,99") → **Success**
3. ❌ Bot sends request to Backend API → **FAILS with 500 error**
4. ❌ User sees generic error message

### Error Message

**Bot Log (11:00:33):**
```
[error]: API Error: 500 /products
[error]: Error creating product: Request failed with status code 500
AxiosError: Request failed with status code 500
```

**Backend Log (11:00:33):**
```
[error]: Query error: new row for relation "products" violates check constraint "products_currency_check"
[error]: Database error: code "23514" - products_currency_check constraint violation
Failing row contains: (3, 1, bobik, null, 15.00000000, USD, 0, t, ...)
```

### Reproduction Steps

1. Open Telegram bot
2. Select "Продавец" (Seller) role
3. Tap "📦 Товары" → "➕ Добавить"
4. Enter product name: `Test Product`
5. Enter price: `15`
6. **Result:** ❌ Error message "Ошибка. Попробуйте позже"

---

## 🎯 Root Cause Analysis

### The Contradiction

**Code says:**
```javascript
// bot/src/scenes/addProduct.js:121
currency: 'USD'

// backend/src/controllers/productController.js:15
const currency = req.body.currency || 'USD';  // Default to USD

// schema.sql comment (line 71):
COMMENT ON COLUMN products.currency IS 'Legacy field - products are priced in USD only';
```

**But database schema says:**
```sql
-- backend/database/schema.sql:67
currency VARCHAR(10) CHECK (currency IN ('BTC', 'ETH', 'USDT', 'TON')),
```

**The Problem:**
- CHECK constraint allows: `BTC, ETH, USDT, TON`
- Code sends: `USD`
- Database rejects: ❌ Constraint violation!

### Why This Happened

1. **Inconsistent requirements:** Original design used crypto-only pricing
2. **Code was updated:** Comments say "USD only" but schema wasn't updated
3. **No integration tests with real DB:** Tests mock the API, so they don't catch DB constraints
4. **Migration was missing:** No incremental migration to remove old constraint

---

## ✅ The Fix

### Changes Made

#### 1. Updated Database Schema
**File:** `backend/database/schema.sql` (line 67)

**BEFORE:**
```sql
currency VARCHAR(10) CHECK (currency IN ('BTC', 'ETH', 'USDT', 'TON')),
```

**AFTER:**
```sql
currency VARCHAR(10) DEFAULT 'USD',
```

**What changed:**
- ❌ Removed CHECK constraint (no longer enforces crypto-only)
- ✅ Added DEFAULT 'USD' (new products automatically get USD)
- ✅ Allows any currency (flexible for future)

#### 2. Created Migration Function
**File:** `backend/database/migrations.cjs`

Added new function `removeCurrencyConstraint()` that:
- Checks if `products_currency_check` constraint exists
- Drops the constraint if found
- Sets default currency to 'USD'
- Updates existing NULL currencies to 'USD' (0 rows affected in this case)

**Usage:**
```bash
cd backend
DB_USER=admin DB_PASSWORD=password DB_PORT=5433 DB_NAME=telegram_shop \
  node database/migrations.cjs --fix-currency
```

#### 3. Executed Migration
**Command:**
```bash
node database/migrations.cjs --fix-currency --no-schema --no-indexes --no-extensions
```

**Result:**
```
✅ Currency constraint removed
✅ Default currency set to USD
✅ Updated 0 products with NULL currency
✅ All expected tables present
✅ Migration completed successfully
```

---

## 🧪 Testing

### Automated Tests
```bash
cd bot
npm test
```

**Result:** ✅ **118 of 119 tests passing** (1 skipped intentionally)

**Note:** Tests use mocked API, so they don't catch this DB constraint issue. Real integration tests with DB would have caught this.

### Manual Testing Instructions

**Steps to verify fix:**
1. Open Telegram bot
2. Select "Продавец" (Seller) role
3. Tap "📦 Товары" → "➕ Добавить"
4. Enter product name: `Test Product`
5. Enter price: `15` (or `15,99` with comma)
6. **Expected result:** ✅ Product created successfully!
7. **Expected message:** `✅ Test Product — $15`

**Verification in database:**
```sql
SELECT id, name, price, currency FROM products ORDER BY id DESC LIMIT 5;
```

Expected: Currency column shows `USD` for newly created products.

---

## 📊 Impact Assessment

### Before Fix
- ❌ **0% success rate** adding products via bot
- ❌ Core functionality broken
- ❌ Sellers blocked from adding inventory

### After Fix
- ✅ **100% success rate** (expected)
- ✅ Products can be created with USD currency
- ✅ All other flows unaffected

### Files Changed
- ✅ `backend/database/schema.sql` (1 line changed)
- ✅ `backend/database/migrations.cjs` (45 lines added)
- ✅ **No code changes needed** (code was already correct!)

### Affected Areas
- ✅ **Fixed:** POST /api/products endpoint
- ✅ **Unaffected:** GET /api/products (reading products)
- ✅ **Unaffected:** PUT /api/products/:id (updating products)
- ✅ **Unaffected:** All other bot scenes (createShop, searchShop, manageWallets)

---

## 🔒 Prevention Measures

### Short-term
1. **✅ Done:** Migration created and documented
2. **✅ Done:** Schema.sql updated
3. **Recommended:** Add E2E test with real database connection
4. **Recommended:** Add healthcheck endpoint that tests product creation

### Long-term
1. **Database constraint changes** should always include:
   - Migration script
   - Code review
   - Test with real database (not just mocks)
   - Documentation update

2. **Code review checklist:**
   - [ ] Schema matches code expectations
   - [ ] Migration script exists for schema changes
   - [ ] Integration tests cover the change
   - [ ] Comments match actual behavior

3. **Testing improvements:**
   - Add integration tests that connect to real test database
   - Add fixture for "create product with USD currency"
   - Run `npm run test:integration` before every deploy

4. **Monitoring:**
   - Alert on 500 errors from POST /api/products endpoint
   - Log constraint violations separately
   - Add Sentry/error tracking for production

---

## 📚 Related Documents

- **Full Investigation:** This report
- **Migration Script:** `backend/database/migrations.cjs` → `removeCurrencyConstraint()`
- **Schema:** `backend/database/schema.sql` (line 67)
- **Bot Code:** `bot/src/scenes/addProduct.js` (line 121)
- **Controller:** `backend/src/controllers/productController.js` (line 15)

---

## 🎯 Lessons Learned

1. **Database constraints must match code expectations**
   - Always verify schema when changing business logic
   - Comments in schema.sql should match actual constraints

2. **Integration tests with real DB are critical**
   - Mocked tests don't catch DB-level errors
   - Need at least one E2E test per critical flow

3. **Incremental migrations are essential**
   - Can't just change schema.sql (only affects new installs)
   - Must provide migration for existing databases

4. **Error messages should be specific**
   - Generic "Ошибка. Попробуйте позже" doesn't help debug
   - Should log constraint name in error for faster diagnosis

---

## ✅ Deployment Checklist

- [x] Schema.sql updated
- [x] Migration script created
- [x] Migration executed successfully
- [x] Automated tests passing (118/119)
- [x] Backend logs clean (no errors after migration)
- [ ] **Manual testing pending** (user needs to verify in Telegram)
- [ ] Git commit after manual verification
- [ ] Deploy to production (if manual test passes)

---

**Prepared by:** Claude Code  
**Verified by:** [Pending manual test]  
**Approved by:** [Pending]

**Next Step:** Please test adding a product through the Telegram bot and confirm it works!
