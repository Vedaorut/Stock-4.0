# FOLLOWS FEATURE AUDIT

**Audit Date:** 2025-10-25
**Auditor:** Claude Code (Backend Architect)
**Scope:** Complete Follows functionality review (bot, backend, webapp, database)

> ✅ 2025-10-25: FREE лимит=2 и PRO=∞ реализованы транзакционным контролем (`FOR UPDATE`), фиксация конкурентных запросов и валидация в WebApp/боте.

---

## TIER LIMITS ENFORCEMENT ❌ CRITICAL ISSUE

### FREE Tier (max 2 follows)

**❌ CRITICAL: NO TIER CHECK - Hardcoded FREE limit applies to ALL users**

- **Enforced where:** `backend/src/controllers/shopFollowController.js:140-153`
- **Implementation:**
  ```javascript
  const FREE_TIER_LIMIT = 2; // Line 6
  const activeCount = await shopFollowQueries.countActiveByFollowerShopId(followerId);
  if (activeCount >= FREE_TIER_LIMIT) {
    return res.status(402).json({ error: 'FREE tier limit reached' });
  }
  ```
- **Block message:** HTTP 402 "FREE tier limit reached"
- **Test:**
  - ✅ Create 2 follows: ALLOWED
  - ✅ Try create 3rd: BLOCKED with 402 status
  - ❌ **CRITICAL BUG:** Limit applies to ALL users (even PRO users!)

**TODO Comment Found:**
```javascript
// Line 140: Check FREE tier limit (TODO: Check PRO status from user/shop)
```

### PRO Tier (unlimited)

- **Check implemented:** ❌ NO
- **Bypasses limit:** ❌ NO - PRO users are also limited to 2 follows!
- **Expected behavior:** PRO users (shops.tier = 'pro') should bypass limit
- **Actual behavior:** Hardcoded 2-follow limit for everyone

---

## BUSINESS LOGIC

### Monitor mode ✅

- [x] Products copied correctly: NO (monitor mode doesn't copy products)
- [x] No markup added: YES (markup_percentage = 0 for monitor)
- [x] Sync frequency: Monitor mode has NO sync (only resell mode syncs)
- **Purpose:** Monitor mode is for tracking only, no product copying

### Resell mode ✅

- [x] Markup calculation: `price * (1 + markup/100)` ✅ CORRECT
  - **Location:** `backend/src/services/productSyncService.js:17-19`
  - **Formula:** `Math.round(parseFloat(sourcePrice) * (1 + markupPercentage / 100) * 100) / 100`
  - **Rounding:** Rounds to 2 decimal places
- [x] Negative markup blocked: ✅ YES (constraint: `markup_percentage >= 0`)
  - **Database:** `schema.sql:96` - CHECK constraint
  - **Backend:** `shopFollowController.js:115-117` - Validates 1-500%
- [x] Edge case: 0% markup
  - Monitor mode sets markup to 0
  - Resell mode requires 1-500%

### Protection ✅

- [x] Self-follow blocked: ✅ YES
  - **Database:** `schema.sql:101` - `CHECK (follower_shop_id != source_shop_id)`
  - **Backend:** `shopFollowController.js:106-108` - Validates before DB insert
  - **Bot:** `bot/src/scenes/createFollow.js:87-91` - Frontend validation
- [x] Circular follows handled: ✅ YES (advanced protection)
  - **Location:** `backend/src/models/shopFollowQueries.js:219-241`
  - **Method:** Recursive CTE (Common Table Expression) with depth limit (10)
  - **Algorithm:** Detects A→B→C→A cycles
  - **Validated:** `shopFollowController.js:156-159`
- [x] Duplicate prevention: ✅ YES
  - **Database:** `schema.sql:100` - `UNIQUE(follower_shop_id, source_shop_id)`
  - **Backend:** `shopFollowController.js:135-138` - Checks before insert
  - **Response:** HTTP 409 "Already following this shop"

---

## CRITICAL ISSUES

### ISSUE-F1: PRO Users Limited to 2 Follows (CRITICAL)

- **Severity:** CRITICAL
- **File:** `backend/src/controllers/shopFollowController.js:140-153`
- **Description:**
  - Hardcoded `FREE_TIER_LIMIT = 2` applies to ALL users
  - No check for `shops.tier` column
  - PRO users ($35/mo) cannot create more than 2 follows
  - TODO comment indicates this was known but not implemented
- **Exploit scenario:**
  1. User pays $35 for PRO tier
  2. Tier is set in database: `shops.tier = 'pro'`
  3. User tries to create 3rd follow
  4. System blocks with "FREE tier limit reached" (false claim)
  5. User is paying for PRO but getting FREE limits
- **Business Impact:**
  - PRO feature not functional
  - Revenue loss (users won't upgrade if limits don't work)
  - False advertising (PRO advertised as unlimited)
- **Fix:**
  ```javascript
  // Get shop tier
  const followerShop = await shopQueries.findById(followerId);
  const isPro = followerShop.tier === 'pro';

  // Check limit only for non-PRO users
  if (!isPro) {
    const activeCount = await shopFollowQueries.countActiveByFollowerShopId(followerId);
    if (activeCount >= FREE_TIER_LIMIT) {
      return res.status(402).json({ error: 'FREE tier limit reached' });
    }
  }
  ```

### ISSUE-F2: checkFollowLimit Ignores Tier (HIGH)

- **Severity:** HIGH
- **File:** `backend/src/controllers/shopFollowController.js:343-373`
- **Description:**
  - `/follows/check-limit` endpoint doesn't check shop tier
  - Returns same limit (2) for both FREE and PRO users
  - Bot shows incorrect "2/2 limit reached" to PRO users
- **Current behavior:**
  ```javascript
  const limitData = {
    limit: FREE_TIER_LIMIT,  // Always 2
    count: activeCount,
    remaining: Math.max(0, FREE_TIER_LIMIT - activeCount),
    reached: activeCount >= FREE_TIER_LIMIT,
    canFollow: activeCount < FREE_TIER_LIMIT
  };
  ```
- **Expected behavior:**
  - PRO users: `{ limit: Infinity, canFollow: true }`
  - FREE users: `{ limit: 2, canFollow: count < 2 }`
- **Fix:** Add tier check similar to ISSUE-F1

### ISSUE-F3: No Downgrade Handling (MEDIUM)

- **Severity:** MEDIUM
- **File:** Not implemented
- **Description:**
  - No logic to handle PRO → FREE downgrade
  - If user has 5 follows and downgrades to FREE:
    - Existing 5 follows remain active
    - User cannot create new follows
    - No automatic deletion of excess follows
- **Current behavior:** "Graceful degradation" - keeps existing, blocks new
- **Expected:** Either:
  1. Block downgrade if follows > 2, OR
  2. Auto-deactivate excess follows (keep oldest 2)
- **Recommendation:** Option 1 (safer, no data loss)

---

## SQL INJECTION CHECK ✅

**Total queries reviewed:** 19 queries in shopFollowQueries.js + shopFollowController.js

**Vulnerable queries:** 0

**Details:**
- ✅ All queries use parameterized statements ($1, $2, etc.)
- ✅ No string interpolation in SQL
- ✅ Input validation before DB queries

**Examples:**
```javascript
// ✅ SAFE - Parameterized
query('SELECT * FROM shop_follows WHERE follower_shop_id = $1', [followerId])

// ✅ SAFE - Validated input
const followerId = Number.parseInt(followerShopId, 10);
if (!Number.isInteger(followerId) || followerId <= 0) {
  return res.status(400).json({ error: 'Invalid ID' });
}
```

**Query locations:**
1. `shopFollowQueries.create()` - Line 16-23 ✅
2. `shopFollowQueries.findById()` - Line 31-51 ✅
3. `shopFollowQueries.findByFollowerShopId()` - Line 60-84 ✅
4. `shopFollowQueries.findByRelationship()` - Line 125-132 ✅
5. `shopFollowQueries.countActiveByFollowerShopId()` - Line 139-146 ✅
6. `shopFollowQueries.checkCircularFollow()` - Line 219-241 ✅ (CTE)
7. All controller queries - Validated & parameterized ✅

---

## RACE CONDITIONS

### Create Follow Transaction Safety: ⚠️ PARTIAL

- [x] Count check atomic: ❌ NO (race condition possible)
- [x] Unique constraint exists: ✅ YES (`UNIQUE(follower_shop_id, source_shop_id)`)
- **Vulnerability:**
  ```
  Request 1: Check count (2) → Pass → INSERT
  Request 2: Check count (2) → Pass → INSERT (at same time)
  Result: Both requests create follow → total 4 follows (bypasses limit!)
  ```
- **Mitigation:** Database UNIQUE constraint prevents duplicate follows, but doesn't enforce count limit

**Race Condition Scenario:**
1. User has 1 follow
2. User sends 2 concurrent requests to create different follows
3. Both requests check count = 1 (< 2) at same time
4. Both pass validation
5. Both insert successfully → total 3 follows (bypasses FREE limit)

**Severity:** MEDIUM (requires exact timing, database prevents duplicates)

**Fix:** Use database-level transaction with row lock:
```javascript
await query('BEGIN');
const count = await query(
  'SELECT COUNT(*) FROM shop_follows WHERE follower_shop_id = $1 FOR UPDATE',
  [followerId]
);
if (count >= limit) {
  await query('ROLLBACK');
  return error;
}
await query('INSERT INTO shop_follows ...');
await query('COMMIT');
```

### Double-click Protection ✅

- [x] Duplicate prevention: YES (`findByRelationship()` check + UNIQUE constraint)
- **Location:** `shopFollowController.js:135-138`
- **Behavior:** HTTP 409 if relationship already exists

---

## DOWNGRADE HANDLING

### PRO → FREE with 5 follows:

**Current behavior:**
- No explicit downgrade logic found
- Existing follows remain active (no cascade delete)
- `countActiveByFollowerShopId()` returns 5
- Limit check fails: `5 >= 2` → blocks new follows
- User cannot create new follows until deletes 3 existing ones

**Expected:**
- Subscription service should handle tier changes
- Options:
  1. Prevent downgrade if follows > 2
  2. Force user to delete excess before downgrade
  3. Auto-pause excess follows (keep metadata, deactivate)

**Issues:**
- No downgrade webhook/handler found
- No logic to sync tier changes with follow limits
- Subscription service updates `shops.tier` but doesn't check dependencies

**Recommendation:**
Add to `backend/src/services/subscriptionService.js`:
```javascript
async function canDowngradeToBasic(shopId) {
  const followCount = await shopFollowQueries.countActiveByFollowerShopId(shopId);
  if (followCount > 2) {
    return {
      canDowngrade: false,
      reason: `You have ${followCount} follows. Delete ${followCount - 2} follows first.`
    };
  }
  return { canDowngrade: true };
}
```

---

## ADDITIONAL FINDINGS

### Markup Validation ✅

- **Range:** 1-500% enforced
- **Locations:**
  - Backend: `shopFollowController.js:115-117` (create)
  - Backend: `shopFollowController.js:218-220` (update)
  - Bot: `bot/src/scenes/createFollow.js:219` (frontend validation)
  - Database: `schema.sql:96` - CHECK constraint `0-500` (allows 0 for monitor)

### Product Sync Service ✅

- **Idempotency:** YES - checks `syncedProductQueries.findBySourceAndFollow()` before copy
- **Rollback on failure:** YES - deletes follow if sync fails (line 180)
- **Conflict detection:** YES - tracks manual edits vs auto-sync
- **Price calculation:** ✅ Correct formula with rounding

### WebApp Integration ⚠️

- **File:** `webapp/src/components/Settings/FollowsModal.jsx`
- **Issue:** Lines 222-228 check `limitInfo.canAdd` but backend returns `canFollow`
  ```javascript
  // Frontend expects: limitInfo.canAdd
  // Backend returns: limitInfo.canFollow
  ```
- **Impact:** May cause UI bugs (limit check fails)
- **Severity:** LOW (graceful degradation, backend validates anyway)

### Bot Clean Chat Compliance ✅

- **User messages deleted:** YES - `createFollow.js:320-328` (scene.leave())
- **Tracks message IDs:** YES - `ctx.wizard.state.userMessageIds`
- **Error handling:** Catches delete failures

---

## SUMMARY

### Critical Issues: 2
1. **ISSUE-F1:** PRO users limited to 2 follows (CRITICAL)
2. **ISSUE-F2:** checkFollowLimit ignores tier (HIGH)

### Medium Issues: 2
3. **ISSUE-F3:** No downgrade handling (MEDIUM)
4. Race condition in concurrent follow creation (MEDIUM)

### Low Issues: 1
5. WebApp limitInfo field mismatch (LOW)

### Security: ✅ EXCELLENT
- No SQL injection vulnerabilities
- Parameterized queries throughout
- Input validation on all endpoints
- Circular follow detection (advanced)

### Business Logic: ⚠️ MOSTLY CORRECT
- ✅ Markup calculations correct
- ✅ Self-follow prevention
- ✅ Duplicate prevention
- ✅ Circular follow detection
- ❌ Tier limits NOT WORKING (main feature broken)

### Production Ready: ❌ NO

**Blockers:**
1. PRO tier feature completely non-functional
2. False advertising (PRO promises unlimited, delivers FREE limits)
3. Potential revenue impact (users won't upgrade)

**Estimated fix time:** 2-4 hours
- Fix ISSUE-F1 and F2: 1 hour
- Add downgrade prevention: 1 hour
- Add transaction for race condition: 1 hour
- Testing: 1 hour

---

## RECOMMENDED FIXES (Priority Order)

### 1. Fix PRO Tier Limits (URGENT)
**File:** `backend/src/controllers/shopFollowController.js`

Add tier check to `createFollow()` and `checkFollowLimit()`:
```javascript
// After line 132 in createFollow()
const followerShop = await shopQueries.findById(followerId);
const isPro = followerShop.tier === 'pro';

// Replace lines 140-153 with:
if (!isPro) {
  const activeCount = await shopFollowQueries.countActiveByFollowerShopId(followerId);
  if (activeCount >= FREE_TIER_LIMIT) {
    return res.status(402).json({
      error: 'FREE tier limit reached. Upgrade to PRO for unlimited follows.',
      data: { limit: FREE_TIER_LIMIT, count: activeCount, tier: 'basic' }
    });
  }
}
```

### 2. Update checkFollowLimit Endpoint
**File:** `backend/src/controllers/shopFollowController.js:343-373`

```javascript
export const checkFollowLimit = async (req, res) => {
  const shopId = Number.parseInt(req.query.shopId, 10);
  // ... validation ...

  const shop = await shopQueries.findById(shopId);
  const isPro = shop.tier === 'pro';
  const activeCount = await shopFollowQueries.countActiveByFollowerShopId(shopId);

  const limitData = isPro
    ? {
        limit: Infinity,
        count: activeCount,
        remaining: Infinity,
        reached: false,
        canFollow: true,
        tier: 'pro'
      }
    : {
        limit: FREE_TIER_LIMIT,
        count: activeCount,
        remaining: Math.max(0, FREE_TIER_LIMIT - activeCount),
        reached: activeCount >= FREE_TIER_LIMIT,
        canFollow: activeCount < FREE_TIER_LIMIT,
        tier: 'basic'
      };

  res.json({ data: limitData });
};
```

### 3. Add Downgrade Prevention
**File:** `backend/src/services/subscriptionService.js`

Add validation before tier change from PRO to BASIC.

### 4. Add Transaction for Race Condition
**File:** `backend/src/controllers/shopFollowController.js`

Wrap count check + insert in database transaction.

---

## TEST COVERAGE NEEDED

1. **Tier limit tests:**
   - FREE user creates 3rd follow → 402
   - PRO user creates 10 follows → all succeed
   - checkFollowLimit returns correct data for both tiers

2. **Race condition test:**
   - Concurrent requests to create 2nd and 3rd follow
   - Verify only one succeeds for FREE tier

3. **Downgrade test:**
   - PRO user with 5 follows attempts downgrade
   - System blocks or handles gracefully

4. **Edge cases:**
   - Tier change mid-request
   - Limit check → INSERT delay (simulate race)
   - Circular follow with 10+ hops

---

**END OF AUDIT**
