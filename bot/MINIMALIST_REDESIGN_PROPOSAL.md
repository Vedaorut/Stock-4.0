# Minimalist Redesign Proposal — Status Stock Bot

**Date:** 2025-10-22  
**Status:** ⏳ Awaiting Approval  
**Impact:** 🔥 HIGH — 60-70% text reduction across all screens

---

## Executive Summary

Complete minimalist redesign of ALL bot texts, buttons, and notifications based on:
- ✅ Web research (Telegram @ShopBot, mobile UX standards)
- ✅ Full code audit (handlers, scenes, keyboards)
- ✅ Compression patterns (reduce 8 lines → 3 lines)

**Key Results:**
- Product lists: 8 lines → 3 lines (63% reduction)
- Order lists: 9 lines → 4 lines (56% reduction)
- Shop info: 13 lines → 7 lines (46% reduction)
- Wallet view: 9 lines → 3 lines (67% reduction)

---

## 5 Core Principles

### 1. One Emoji Per Section
❌ BEFORE: `🔥 Hot ✨ Deal 💥 Now` (visual noise)  
✅ AFTER: `🔥 Hot deals` (single anchor)

### 2. Single-Line Lists
❌ BEFORE: 4 lines per item (name, price, stock, gap)  
✅ AFTER: 1 line with separators `—`, `•`, `|`

### 3. Remove Redundant Labels
❌ BEFORE: `Магазин: fobos` + `Статус: ✅`  
✅ AFTER: `✅ fobos` (emoji replaces label)

### 4. Inline Metadata
❌ BEFORE: Separate lines  
✅ AFTER: `Item • 5 products • @seller`

### 5. Mobile Reality (40 chars/line)
❌ BEFORE: Lines wrap on iPhone SE  
✅ AFTER: Fits comfortably

---

## Full Screen-by-Screen Proposals

### Priority Level Legend
- ⭐⭐⭐ **P0** = Critical (user sees multiple times per session)
- ⭐⭐ **P1** = High (frequent interactions)
- ⭐ **P2** = Medium (occasional use)

---

## 🔴 P0: CRITICAL SCREENS

### 1. Product List (Seller) ⭐⭐⭐

**File:** `bot/src/handlers/seller/index.js` → `handleProducts()` (lines 209-228)

**❌ BEFORE (8 lines per 2 items):**
```
📦 Мои товары (2):

Магазин: fobos

1. Holo
   $25
   ⚠️ Запас: 0

2. Dobi
   $10
   ⚠️ Запас: 0

...и ещё X товаров
```

**✅ AFTER (3 lines):**
```
📦 Товары (2) • fobos
1. Holo — $25 | нет
2. Dobi — $10 | нет

+X ещё
```

**Changes:**
1. Header: `📦 Мои товары (2):\n\nМагазин: fobos\n\n` → `📦 Товары (2) • fobos\n`
2. Items: 3 lines each → 1 line with `—` and `|` separators
3. Stock: `⚠️ Запас: 0` → `нет` (smart status)
4. Overflow: `...и ещё X товаров` → `+X ещё`

**Implementation:**
```javascript
// Use utility function from BOT_MINIMALIST_CODE_EXAMPLES.js
import { formatProductsList } from '../utils/minimalist.js';

const message = formatProductsList(products, shopName);
```

---

### 2. Sales List (Seller) ⭐⭐⭐

**File:** `bot/src/handlers/seller/index.js` → `handleSales()` (lines 280-299)

**❌ BEFORE (9 lines for 3 orders):**
```
💰 Продажи (3):

Магазин: fobos

1. ✅ @ivan_buyer - $25
2. ⏳ @petr_buyer - $10
3. ❌ @maria_buyer - $15

...и ещё X заказов
```

**✅ AFTER (4 lines):**
```
💰 Продажи (3) • fobos
1. ✅ @ivan — $25
2. ⏳ @petr — $10
3. ❌ @maria — $15

+X ещё
```

**Changes:**
1. Header: Merged shop name with count
2. Items: Removed gaps between orders
3. Username: Truncate long names to 15 chars
4. Price separator: `-` → `—` (em dash, cleaner)

**Implementation:**
```javascript
import { formatSalesList } from '../utils/minimalist.js';

const message = formatSalesList(orders, shopName);
```

---

### 3. Shop View (Buyer) ⭐⭐⭐

**File:** `bot/src/handlers/buyer/index.js` → `handleShopView()` (lines 348-368)

**❌ BEFORE (13 lines):**
```
ℹ️ fobos

Продавец: @seller_name

Описание магазина

📦 Товары: 3

В магазине:
1. Product 1 - $25
2. Product 2 - $10
3. Product 3 - $5

...и ещё X товаров
```

**✅ AFTER (7 lines):**
```
ℹ️ fobos • @seller

Описание магазина

📦 3 товара
1. Product 1 — $25
2. Product 2 — $10
3. Product 3 — $5

+X ещё
```

**Changes:**
1. Header: Inline seller with shop name
2. Products section: Removed redundant "В магазине:"
3. Items: Single line, em dash separator
4. Count: `📦 Товары: 3` → `📦 3 товара`

---

### 4. Buyer Orders ⭐⭐⭐

**File:** `bot/src/handlers/buyer/index.js` → `handleOrders()` (lines 292-307)

**❌ BEFORE (9 lines for 3 orders):**
```
🛒 Мои заказы:

1. ✅ Магазин - $25
2. ⏳ Магазин - $10
3. ❌ Магазин - $15

...и ещё X заказов
```

**✅ AFTER (4 lines):**
```
🛒 Заказы (3)
1. ✅ Магазин — $25
2. ⏳ Магазин — $10
3. ❌ Магазин — $15

+X ещё
```

**Changes:**
1. Header: Add count, remove "Мои"
2. Items: Em dash separator, no gaps
3. Overflow: Compact format

---

## 🟡 P1: HIGH PRIORITY SCREENS

### 5. Subscriptions List (Buyer) ⭐⭐

**File:** `bot/src/handlers/buyer/index.js` → `handleSubscriptions()` (lines 149-156)

**❌ BEFORE (8 lines):**
```
Мои подписки:

1. Магазин 1
2. Магазин 2
3. Магазин 3
```

**✅ AFTER (4 lines):**
```
📚 Подписки (3)
1. Магазин 1
2. Магазин 2
3. Магазин 3
```

**Changes:**
1. Add emoji header with count
2. Remove "Мои" prefix
3. Show max 10 items (with "+X ещё")

---

### 6. Wallet Management ⭐⭐

**File:** `bot/src/scenes/manageWallets.js` → `showWallets()` (lines 45-56)

**❌ BEFORE (9 lines):**
```
💼 Кошельки

₿ BTC: не указан
Ξ ETH: не указан
₮ USDT: не указан
🔷 TON: не указан

Выберите криптовалюту:
```

**✅ AFTER (3 lines):**
```
💼 Кошельки
₿ BTC | Ξ ETH | ₮ USDT | 🔷 TON

Выберите:
```

**Changes:**
1. Inline all cryptos on one line
2. Use `|` separators
3. Shorter prompt
4. Show addresses on detail view only

---

## 🟢 P2: MEDIUM PRIORITY (Wizards)

### 7. Add Product Scene ⭐

**File:** `bot/src/scenes/addProduct.js`

**❌ BEFORE:**
```
Step 1: "Название товара:"
Step 2: "Цена ($):"
Step 3: "✓ [name]\n$[price]"
```

**✅ AFTER:**
```
Step 1: "Название (мин 3 символа):"
Step 2: "Цена ($):"
Step 3: "✅ [name] — $[price]"
```

**Changes:**
1. Inline constraint in step 1
2. Use em dash in success message
3. Single emoji instead of checkmark text

---

### 8. Create Shop Scene ⭐

**File:** `bot/src/scenes/createShop.js`

**❌ BEFORE:**
```
Step 1: "Название магазина:"
Step 2: "✓ Магазин создан!\n\n[shopName]"
```

**✅ AFTER:**
```
Step 1: "Название (3-100 символов):"
Step 2: "✅ [shopName]"
```

**Changes:**
1. Inline constraints
2. Remove redundant "Магазин создан!" (emoji says it)
3. Single line success

---

### 9. Search Shop Scene ⭐

**File:** `bot/src/scenes/searchShop.js`

**❌ BEFORE:**
```
Step 1: "Введите название магазина"
Results: "[shop.name]\nПродавец: @username\n\n"
```

**✅ AFTER:**
```
Step 1: "Название (мин 2 символа):"
Results: "[shop.name] • @username"
```

**Changes:**
1. Inline constraint
2. Single line per result
3. Use `•` separator

---

### 10. Manage Wallets Scene ⭐

**File:** `bot/src/scenes/manageWallets.js`

**❌ BEFORE:**
```
Step 2: "₿ BTC адрес:"
Step 3: "✓ ₿ BTC\n[address]"
```

**✅ AFTER:**
```
Step 2: "₿ BTC адрес:"
Step 3: "✅ ₿ [address]"
```

**Changes:**
1. Remove redundant "BTC" in success (emoji shows it)
2. Single line

---

## Error Messages & Notifications

### Generic Error Template

**❌ BEFORE:**
```
Произошла ошибка

Попробуйте позже
```

**✅ AFTER:**
```
❌ Ошибка
Попробуйте позже
```

**Changes:**
1. Add emoji
2. Remove empty line
3. Shorter header

---

### Success Messages

**❌ BEFORE:**
```
✓ Товар сохранён!

[product name]
$[price]
```

**✅ AFTER:**
```
✅ [name] — $[price]
```

**Changes:**
1. Emoji instead of text checkmark
2. Remove redundant confirmation text
3. Single line with data

---

### Empty States

**❌ BEFORE:**
```
📦 Товары

Пусто
```

**✅ AFTER:**
```
📦 Товары
Пусто
```

**Changes:**
1. Remove empty line between header and "Пусто"

---

## Button Labels Redesign

### Buyer Menu

**❌ BEFORE:**
```
[📱 Открыть приложение]
[🔍 Найти магазин]
[📚 Подписки]
[🛒 Заказы]
[🔄 Переключить на Продавца]
```

**✅ AFTER:**
```
[📱 Открыть]
[🔍 Найти]
[📚 Подписки]
[🛒 Заказы]
[🔄 Продавец]
```

**Changes:**
1. "Открыть приложение" → "Открыть" (context clear)
2. "Найти магазин" → "Найти" (shorter)
3. "Переключить на Продавца" → "Продавец" (max 15 chars)

---

### Seller Menu

**❌ BEFORE:**
```
[📱 Открыть приложение]
[📦 Мои товары]
[💰 Продажи]
[💼 Кошельки]
[🔄 Переключить на Покупателя]
```

**✅ AFTER:**
```
[📱 Открыть]
[📦 Товары]
[💰 Продажи]
[💼 Кошельки]
[🔄 Покупатель]
```

**Changes:**
1. "Открыть приложение" → "Открыть"
2. "Мои товары" → "Товары" (redundant "Мои")
3. "Переключить на Покупателя" → "Покупатель"

---

### Products Menu (NEW - already implemented)

**Current (already minimalist):**
```
[➕ Добавить товар]
[« Назад в главное меню]
```

**Optimization:**
```
[➕ Добавить]
[« Назад]
```

---

### Cancel Buttons

**❌ BEFORE:**
```
[« Отменить]
```

**✅ AFTER:**
```
[« Отмена]
```

**Changes:**
1. "Отменить" → "Отмена" (noun = faster scan)

---

## Start Screen (Role Selection)

**File:** `bot/src/handlers/start.js` (line 58)

**❌ BEFORE:**
```
Telegram Shop

Выберите роль:
[🛍 Покупатель] [💼 Продавец]
```

**✅ AFTER:**
```
Status Stock

Роль:
[🛍 Покупатель] [💼 Продавец]
```

**Changes:**
1. "Telegram Shop" → "Status Stock" (actual product name)
2. "Выберите роль:" → "Роль:" (shorter)

---

## Implementation Plan

### Phase 1: Create Utilities (15 minutes)
1. ✅ Copy `BOT_MINIMALIST_CODE_EXAMPLES.js`
2. ✅ Create `bot/src/utils/minimalist.js`
3. ✅ Import in handlers

### Phase 2: Update Handlers (1 hour)
**Priority order:**
1. `seller/index.js` → handleProducts() (P0)
2. `seller/index.js` → handleSales() (P0)
3. `buyer/index.js` → handleOrders() (P0)
4. `buyer/index.js` → handleShopView() (P0)
5. `buyer/index.js` → handleSubscriptions() (P1)

### Phase 3: Update Keyboards (30 minutes)
1. `keyboards/buyer.js` → button labels
2. `keyboards/seller.js` → button labels
3. `keyboards/common.js` → cancel buttons

### Phase 4: Update Scenes (45 minutes)
1. `scenes/addProduct.js` → prompts + success
2. `scenes/createShop.js` → prompts + success
3. `scenes/searchShop.js` → prompts + results
4. `scenes/manageWallets.js` → wallet display

### Phase 5: Update Tests (30 minutes)
1. Update snapshots with `npm run test:integration -- -u`
2. Verify all 22 tests pass
3. Check mobile display manually

**Total Estimated Time:** 3-4 hours

---

## Testing Checklist

After implementation:

- [ ] Product list: 3 lines instead of 8 ✓
- [ ] Order list: 4 lines instead of 9 ✓
- [ ] No horizontal scrolling on iPhone SE ✓
- [ ] Headers scan in <1 second ✓
- [ ] All buttons max 15 chars ✓
- [ ] No empty lines between sections ✓
- [ ] Emojis used consistently (1 per section) ✓
- [ ] All lists show "+X ещё" for overflow ✓
- [ ] Success messages single line ✓
- [ ] Error messages 2 lines max ✓
- [ ] All 22 integration tests pass ✓

---

## Rollback Plan

If users report confusion or bugs:

1. **Git revert** commits (single commit for whole redesign)
2. **Restore snapshots** from backup
3. **A/B test** (keep minimalist for 50% users)

All changes are in isolated functions (`formatProductsList`, etc.), so easy to revert individual screens.

---

## Success Metrics (Post-Launch)

**Week 1:**
- User session length (expect -20% = faster tasks)
- Button click rate (expect +15% = clearer CTAs)
- Error rate (expect no change)

**Week 2:**
- Retention (expect +5% = better UX)
- Complaints about text length (expect 0)

---

## User Feedback Template

After launch, ask users:
```
Мы обновили дизайн бота!

Стало удобнее? [👍 Да] [👎 Нет] [💬 Комментарий]
```

---

## References

- **Research:** `MINIMALIST_SUMMARY.md` (key findings)
- **Full Guide:** `BOT_MINIMALIST_DESIGN_GUIDE.md` (comprehensive)
- **Code Examples:** `BOT_MINIMALIST_CODE_EXAMPLES.js` (ready-to-use)
- **Web Sources:** Telegram @ShopBot, Smashing Magazine, Nielsen UX

---

## Approval Required

⚠️ **BEFORE implementing, user must approve:**

1. ✅ Core 5 principles (emoji, single-line, no redundancy, inline, mobile)
2. ✅ P0 screens redesign (products, sales, orders, shop view)
3. ✅ Button label changes (all menus)
4. ✅ Wizard prompt changes (all scenes)
5. ✅ Error/success message templates

**Once approved, proceed with Phase 1-5 implementation.**

---

**Prepared by:** Claude Code  
**Date:** 2025-10-22  
**Version:** 1.0  
**Status:** ⏳ AWAITING USER APPROVAL
