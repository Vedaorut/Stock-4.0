# WORKSPACE FEATURE AUDIT

**Date:** 2025-10-25
**Reviewed by:** Claude Code
**Scope:** Full workspace/workers functionality audit

---

## FILES REVIEWED

### Backend
- `/backend/src/controllers/workerController.js`
- `/backend/src/models/workerQueries.js`
- `/backend/src/routes/workers.js`
- `/backend/src/controllers/productController.js`
- `/backend/src/controllers/shopController.js`
- `/backend/src/server.js`
- `/backend/database/migrations.cjs` (shop_workers table)

### Bot
- `/bot/src/handlers/seller/index.js`
- `/bot/src/handlers/workspace/index.js`
- `/bot/src/scenes/manageWorkers.js`
- `/bot/src/keyboards/workspace.js`

### WebApp
- `/webapp/src/components/Settings/WorkspaceModal.jsx`
- `/webapp/src/pages/Settings.jsx`

---

## BUSINESS LOGIC ✅/❌

| Requirement | Status | Details |
|------------|--------|---------|
| PRO tier check enforced | ❌ **MISSING** | No tier check in workerController.add |
| FREE tier blocked | ❌ **MISSING** | Any shop can add workers (no restrictions) |
| Worker permissions correct | ⚠️ **PARTIAL** | Workers CAN'T modify products (need checkAccess) |
| Sync bot↔backend | ✅ **YES** | Bot uses workerApi, backend has routes |
| Edge case handling | ⚠️ **PARTIAL** | Some cases not handled |

---

## CRITICAL ISSUES FOUND

### 🔴 ISSUE-W1: No PRO Tier Restriction
**Severity:** CRITICAL
**File:** `backend/src/controllers/workerController.js:15-111`
**Description:** ANY shop (including FREE tier) can add workers. There is NO check for `tier === 'pro'` or subscription status.

**Impact:**
- FREE users bypass payment ($25/month BASIC vs $35/month PRO)
- Business model violation: PRO feature available to all

**Current code (lines 15-43):**
```javascript
add: async (req, res) => {
  // ...
  const shop = await shopQueries.findById(shopId);
  if (!shop) { /* ... */ }
  if (shop.owner_id !== req.user.id) { /* ... */ }

  // ❌ NO TIER CHECK HERE!
  // Should check: if (shop.tier !== 'pro') return 403

  // Find user by telegram_id...
```

**Steps to reproduce:**
1. Create FREE tier shop ($25 subscription)
2. POST `/api/shops/:shopId/workers` with telegram_id
3. Worker is added successfully (should be blocked!)

**Suggested fix:**
```javascript
// After line 42 (owner check), add:
if (shop.tier !== 'pro') {
  return res.status(403).json({
    success: false,
    error: 'Workers feature is available only for PRO tier shops. Upgrade to PRO to add workers.'
  });
}
```

---

### 🔴 ISSUE-W2: Worker Can Bypass Product Permissions
**Severity:** CRITICAL
**File:** `backend/src/controllers/productController.js:12-70, 161-218, 223-267`
**Description:** Product CRUD endpoints check ONLY `owner_id`, NOT worker access. Workers are BLOCKED from managing products.

**Impact:**
- Workers CANNOT add/edit/delete products (feature is broken)
- Workspace is useless: workers have no permissions

**Current code (productController.create, line 34-39):**
```javascript
if (shop.owner_id !== req.user.id) {
  return res.status(403).json({
    success: false,
    error: 'You can only add products to your own shops'
  });
}
// ❌ Workers are blocked here!
```

**Steps to reproduce:**
1. Shop owner adds worker via `/api/shops/:shopId/workers`
2. Worker tries to create product: `POST /api/products` with shopId
3. Response: `403 Forbidden - You can only add products to your own shops`
4. Worker CANNOT manage products

**Suggested fix:**
```javascript
// In productController.create (after line 32):
import { workerQueries } from '../models/db.js';

// Check if user is owner OR worker
const access = await workerQueries.checkAccess(shopId, req.user.id);
if (!access.hasAccess) {
  return res.status(403).json({
    success: false,
    error: 'You do not have access to this shop'
  });
}

// Same fix needed for:
// - productController.update
// - productController.delete
// - productController.bulkDeleteAll
// - productController.bulkDeleteByIds
```

---

### 🟡 ISSUE-W3: Worker Removal Not Implemented
**Severity:** MEDIUM
**File:** `bot/src/handlers/seller/index.js:626-645`
**Description:** Worker removal handlers are stubs: `await ctx.answerCbQuery('Функция в разработке')`

**Impact:**
- Shop owner CANNOT remove workers through bot
- Only via webapp or direct API call

**Current code (lines 626-645):**
```javascript
const handleWorkerRemove = async (ctx) => {
  try {
    await ctx.answerCbQuery('Функция в разработке');
    // TODO: Implement worker removal with confirmation
  } catch (error) {
    logger.error('Error in worker remove handler:', error);
  }
};

const handleWorkerRemoveConfirm = async (ctx) => {
  try {
    await ctx.answerCbQuery('Функция в разработке');
    // TODO: Implement worker removal confirmation
  } catch (error) {
    logger.error('Error in worker remove confirm handler:', error);
  }
};
```

**Suggested fix:**
```javascript
const handleWorkerRemove = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const workerId = parseInt(ctx.match[1]);

    // Show confirmation
    await editOrReply(
      ctx,
      `Удалить работника?\n\nЭто действие нельзя отменить.`,
      confirmWorkerRemoval(workerId)
    );
  } catch (error) {
    logger.error('Error in worker remove handler:', error);
    await ctx.answerCbQuery('❌ Ошибка');
  }
};

const handleWorkerRemoveConfirm = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const workerId = parseInt(ctx.match[1]);

    // Remove worker via API
    await workerApi.removeWorker(ctx.session.shopId, workerId, ctx.session.token);

    // Reload workers list
    await handleWorkersList(ctx);

    logger.info(`User ${ctx.from.id} removed worker ${workerId}`);
  } catch (error) {
    logger.error('Error removing worker:', error);
    await ctx.answerCbQuery('❌ Ошибка удаления');
  }
};
```

---

### 🟡 ISSUE-W4: No PRO Check in Bot Handlers
**Severity:** MEDIUM
**File:** `bot/src/handlers/seller/index.js:527-566`
**Description:** Bot allows entering `manageWorkers` scene without checking shop tier. Backend will reject, but user sees error AFTER entering scene.

**Impact:**
- Poor UX: FREE users can try adding workers, see error later
- Should show upgrade message instead

**Current code (handleWorkers, line 527-545):**
```javascript
const handleWorkers = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await editOrReply(ctx, 'Сначала создайте магазин', sellerMenuNoShop);
      return;
    }

    // ❌ NO TIER CHECK!

    const shopName = ctx.session.shopName || 'Магазин';
    await editOrReply(ctx, `Работники магазина: ${shopName}`, manageWorkersMenu(shopName));

    logger.info(`User ${ctx.from.id} opened workers management`);
  } catch (error) {
    logger.error('Error in workers menu handler:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await editOrReply(ctx, 'Ошибка загрузки', sellerMenu(shopName));
  }
};
```

**Suggested fix:**
```javascript
const handleWorkers = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId || !ctx.session.token) {
      await editOrReply(ctx, 'Сначала создайте магазин', sellerMenuNoShop);
      return;
    }

    // Check shop tier
    const shopResponse = await shopApi.getShop(ctx.session.shopId, ctx.session.token);
    if (shopResponse.tier !== 'pro') {
      await editOrReply(
        ctx,
        `💎 <b>Работники доступны только в PRO</b>\n\nАпгрейд на PRO ($35/мес):\n• ♾ Безлимитные подписчики\n• 👥 Управление работниками\n• 📢 Рассылка при смене канала`,
        Markup.inlineKeyboard([
          [Markup.button.callback('💎 Апгрейд на PRO', 'subscription:upgrade')],
          [Markup.button.callback('◀️ Назад', 'seller:main')]
        ]),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const shopName = ctx.session.shopName || 'Магазин';
    await editOrReply(ctx, `Работники магазина: ${shopName}`, manageWorkersMenu(shopName));

    logger.info(`User ${ctx.from.id} opened workers management`);
  } catch (error) {
    logger.error('Error in workers menu handler:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await editOrReply(ctx, 'Ошибка загрузки', sellerMenu(shopName));
  }
};
```

---

### 🟡 ISSUE-W5: No PRO Check in WebApp Modal
**Severity:** MEDIUM
**File:** `webapp/src/components/Settings/WorkspaceModal.jsx:101-122`
**Description:** WebApp allows adding workers without tier check. Backend will reject with 403, but poor UX.

**Impact:**
- FREE users see "Add worker" form, get error after submission
- Should show upgrade prompt instead

**Current code (handleAddWorker, lines 101-122):**
```javascript
const handleAddWorker = async () => {
  if (!telegramId.trim()) {
    await alert('Введите Telegram ID');
    return;
  }

  try {
    await fetchApi(`/shops/${myShop.id}/workers`, {
      method: 'POST',
      body: JSON.stringify({
        telegram_id: parseInt(telegramId.trim())
      })
    });
    // ...
  } catch (error) {
    await alert(error.message || 'Ошибка добавления сотрудника');
  }
};
```

**Suggested fix:**
```javascript
// In loadData() after line 87:
const shop = shopsRes.data[0];
setMyShop(shop);

// Check tier BEFORE showing add form
if (shop.tier !== 'pro') {
  // Show upgrade message instead of worker form
  return; // Don't load workers list
}

// Get workers only for PRO shops
const workersRes = await fetchApi(`/shops/${shop.id}/workers`);
setWorkers(workersRes.data || []);
```

---

### 🟢 ISSUE-W6: Missing `removeWorker` API Method
**Severity:** LOW
**File:** `bot/src/utils/api.js` (inferred)
**Description:** `workerApi.removeWorker()` is called in suggested fix for ISSUE-W3, but may not exist in api.js.

**Impact:**
- Removal functionality will fail if API method missing

**Suggested fix:**
Add to `bot/src/utils/api.js`:
```javascript
export const workerApi = {
  // ... existing methods ...

  removeWorker: async (shopId, workerId, token) => {
    const response = await api.delete(
      `/shops/${shopId}/workers/${workerId}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    return response.data;
  }
};
```

---

### 🟢 ISSUE-W7: No Cascade Delete on Shop Deletion
**Severity:** LOW (already handled by SQL)
**File:** `backend/database/migrations.cjs:890-891`
**Description:** Shop deletion cascades to workers via SQL `ON DELETE CASCADE`. This is CORRECT.

**Current implementation (CORRECT):**
```sql
CREATE TABLE shop_workers (
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ...
);
```

**Status:** ✅ No action needed

---

### 🟢 ISSUE-W8: Duplicate Worker Prevention
**Severity:** LOW
**File:** `backend/src/controllers/workerController.js:76-82`
**Description:** Duplicate worker check is CORRECTLY implemented.

**Current code (CORRECT):**
```javascript
const existing = await workerQueries.findByShopAndUser(shopId, workerUser.id);
if (existing) {
  return res.status(409).json({
    success: false,
    error: 'User is already a worker in this shop'
  });
}
```

**Status:** ✅ No action needed

---

## SECURITY CONCERNS

### 🔴 SEC-1: Authorization Bypass - Worker Access
**File:** `backend/src/controllers/productController.js`
**Risk:** HIGH

**Issue:** Product endpoints do NOT check worker access. Workers are BLOCKED instead of being GRANTED access.

**Fix:** Implement `workerQueries.checkAccess()` in ALL product/shop modification endpoints:
- `POST /api/products` - create
- `PUT /api/products/:id` - update
- `DELETE /api/products/:id` - delete
- `POST /api/products/bulk-delete-all` - bulk delete
- `POST /api/products/bulk-delete-by-ids` - bulk delete

---

### 🟡 SEC-2: Missing Input Validation
**File:** `backend/src/controllers/workerController.js:21-26`
**Risk:** MEDIUM

**Issue:** Telegram ID is not validated (could be negative, zero, or string).

**Current code:**
```javascript
if (!telegram_id && !username) {
  return res.status(400).json({ /* ... */ });
}
```

**Suggested fix:**
```javascript
if (!telegram_id && !username) {
  return res.status(400).json({ error: 'Telegram ID or username is required' });
}

if (telegram_id) {
  const parsedId = parseInt(telegram_id);
  if (isNaN(parsedId) || parsedId <= 0) {
    return res.status(400).json({ error: 'Invalid Telegram ID format' });
  }
}
```

---

### 🟢 SEC-3: SQL Injection Prevention
**File:** `backend/src/models/workerQueries.js`
**Status:** ✅ SAFE

All queries use parameterized statements:
```javascript
await query('SELECT * FROM shop_workers WHERE shop_id = $1', [shopId]);
```

No raw SQL concatenation detected.

---

## CODE QUALITY ISSUES

### CQ-1: Inconsistent Error Messages
**File:** `backend/src/controllers/workerController.js`
**Severity:** LOW

Different error formats across endpoints:
- Line 24: `'Telegram ID or username is required'`
- Line 33: `'Shop not found'`
- Line 40: `'Only shop owner can add workers'`

**Suggestion:** Standardize error responses (already consistent actually).

---

### CQ-2: TODO Comments Not Implemented
**File:** `bot/src/handlers/seller/index.js:629, 641`
**Severity:** LOW

```javascript
// TODO: Implement worker removal with confirmation
// TODO: Implement worker removal confirmation
```

**Status:** Covered in ISSUE-W3

---

### CQ-3: Dead Code - Username Search
**File:** `backend/src/controllers/workerController.js:48-58`
**Severity:** LOW

```javascript
} else if (username) {
  const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
  const users = await userQueries.findByTelegramId(null); // ❌ This won't work
  return res.status(400).json({
    error: 'Adding by username not yet supported. Please use Telegram ID.'
  });
}
```

**Suggestion:** Either implement `userQueries.findByUsername()` or remove username parameter from docs.

---

## EDGE CASE ANALYSIS

| Edge Case | Handled? | Notes |
|-----------|----------|-------|
| Shop deleted → workers auto-removed | ✅ YES | SQL CASCADE handles this |
| User deleted → worker record removed | ✅ YES | SQL CASCADE handles this |
| PRO → FREE downgrade | ❌ NO | Workers should be removed/disabled |
| Worker tries to add another worker | ⚠️ PARTIAL | Backend blocks (owner check), no friendly message |
| Worker tries to delete shop | ❌ NO | Need to add worker check in shopController.delete |
| Owner removes self as worker | ✅ YES | Line 68-73 prevents owner from being added |
| Concurrent add/remove same worker | ⚠️ RACE | Unique constraint helps, but no transaction lock |

---

## SUMMARY

### Total Issues: 8 Critical + Medium, 3 Low/Info

| Severity | Count | Issues |
|----------|-------|--------|
| 🔴 Critical | 2 | W1, W2 |
| 🟡 Medium | 3 | W3, W4, W5 |
| 🟢 Low | 3 | W6, W7, W8 |
| 🔒 Security | 2 | SEC-1 (critical), SEC-2 (medium) |
| 📝 Code Quality | 3 | CQ-1, CQ-2, CQ-3 |

---

## PRIORITY FIXES (Immediate Action Required)

### 1. Add PRO Tier Check (ISSUE-W1) - CRITICAL
**File:** `backend/src/controllers/workerController.js`
**Line:** After line 42
**Code:**
```javascript
if (shop.tier !== 'pro') {
  return res.status(403).json({
    success: false,
    error: 'Workers feature is available only for PRO tier shops. Upgrade to PRO.'
  });
}
```

### 2. Fix Worker Product Access (ISSUE-W2, SEC-1) - CRITICAL
**Files:**
- `backend/src/controllers/productController.js:12-70` (create)
- `backend/src/controllers/productController.js:161-218` (update)
- `backend/src/controllers/productController.js:223-267` (delete)

**Code (add after shop ownership check in each method):**
```javascript
import { workerQueries } from '../models/db.js';

// Replace owner-only check with owner OR worker check
const access = await workerQueries.checkAccess(shopId, req.user.id);
if (!access.hasAccess) {
  return res.status(403).json({
    success: false,
    error: 'You do not have access to this shop'
  });
}
```

### 3. Implement Worker Removal (ISSUE-W3) - MEDIUM
**File:** `bot/src/handlers/seller/index.js:626-645`
See suggested fix in ISSUE-W3 section above.

---

## TESTING RECOMMENDATIONS

### Unit Tests Needed
1. `workerController.add()` - PRO tier validation
2. `productController.create()` - worker access validation
3. `productController.update()` - worker access validation
4. `productController.delete()` - worker access validation

### Integration Tests Needed
1. End-to-end: Owner adds worker → Worker creates product → Success
2. End-to-end: FREE shop owner tries to add worker → 403 Forbidden
3. Edge case: PRO → FREE downgrade → workers disabled/removed
4. Edge case: Worker tries to add another worker → 403 Forbidden

### Manual Testing Checklist
- [ ] FREE shop cannot add workers (backend + bot + webapp)
- [ ] PRO shop can add workers
- [ ] Worker can create/edit/delete products
- [ ] Worker CANNOT manage shop settings (wallets, subscription, workers)
- [ ] Worker removed when shop deleted (cascade)
- [ ] Worker removal works in bot + webapp

---

## CONCLUSION

**Workspace feature is PARTIALLY IMPLEMENTED but has CRITICAL SECURITY ISSUES:**

1. ❌ **PRO tier restriction is MISSING** → Any shop can add workers (business model broken)
2. ❌ **Worker permissions are INVERTED** → Workers are blocked from managing products (feature broken)
3. ⚠️ **Bot/WebApp UX is poor** → FREE users see errors instead of upgrade prompts

**Next Steps:**
1. Fix ISSUE-W1 (PRO check) immediately
2. Fix ISSUE-W2 (worker access) immediately
3. Implement ISSUE-W3 (removal) for complete feature
4. Add frontend tier checks (W4, W5) for better UX
5. Write integration tests for workspace flows

**Estimated Fix Time:** 2-3 hours for critical issues (W1, W2)

---

**End of Audit**
