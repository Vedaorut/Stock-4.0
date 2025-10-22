# Telegram Bot Minimalist Design Guide

## Overview

This guide provides comprehensive minimalist design patterns for the Status Stock Telegram e-commerce bot. The goal is to reduce cognitive load, minimize text, and maximize clarity through strategic use of emojis, inline formatting, and compact layouts.

**Key Principle:** "Say more with less" — every character should earn its place.

---

## Part 1: Design Philosophy & Core Principles

### 1. Text Compression Hierarchy

**Level 1 (Minimal):** 1-2 lines max
- Single action prompts
- Success/error confirmations
- Status indicators

**Level 2 (Compact):** 3-5 lines
- List views (products, orders, subscriptions)
- Shop info cards
- Wallet management

**Level 3 (Detailed):** 6+ lines (rare)
- First-time user onboarding
- Complex wizard instructions
- Multi-section info screens

### 2. How Much Text is Too Much?

**Telegram UX Research (based on @ShopBot, official patterns):**

- **Sweet spot:** 30-50 characters per line
- **Max for legibility:** 60 characters per line  
- **Avoid:** More than 5 short lines without visual breaks
- **Mobile reality:** Most users on 4-5 inch screens = ~40 chars/line max

**Word counts (guidelines):**
- ✅ Status message: 3-8 words
- ✅ List item: 15-25 words total
- ❌ Avoid: Lists with >5 items (pagination instead)
- ❌ Avoid: Mixed emoji + plain text for >1 line

### 3. Emoji Usage Patterns

**Frequency:** 1 emoji per logical "block" or section
- **TOO MUCH:** 🔥 Hot 🌟 Product ✨ Deal 💥 Now ⚡ Buy — visual noise
- **BETTER:** 🔥 Hot Product — single anchor emoji

**Placement Rules:**
- `[EMOJI] Title` — emoji leads, not trailing  
- `Option • Secondary info` — emoji only for main action
- Lists: Emoji per TYPE, not per item

**High-Impact Emojis** (copy these patterns):
```
📦 Products/inventory          🛒 Orders/shopping cart
💰 Sales/money                 🔔 Subscriptions/notifications  
💼 Shop/seller mode            🛍 Buyer mode
✅ Success/completed           ❌ Error/failed
⏳ Pending status              📦 Processing
ℹ️ Info (avoid for main text)  « Back (navigation)
```

### 4. Separator Usage Guidelines

**When to use separators:** To break distinct sections, not within lists

- `—` (em-dash) for inline item fields: `Holo — $25 | In stock`
- `•` (bullet) for secondary metadata: `Shop • 5 products`
- `|` (pipe) for multi-column data: `$25 | In stock | ⭐ 4.2`
- Newlines for distinct blocks (list headers, status, actions)

**Anti-patterns:**
- ❌ `Product --- Price --- Stock` (use single separators)
- ❌ Vertical lines between list items (waste space, reduce readability)

---

## Part 2: Minimalist Formatting by Screen

### 2.1 LISTS (Products, Orders, Subscriptions)

#### CURRENT (Verbose)
```
📦 Мои товары (2):
Магазин: fobos
1. Holo
   $25
   ⚠️ Запас: 0
2. Dobi
   $10
   ⚠️ Запас: 0
```
**Lines:** 8 | **Words:** 20 | **Characters:** 85

#### MINIMALIST TARGET
```
📦 Товары (2) • fobos
1. Holo — $25 | нет
2. Dobi — $10 | нет
```
**Lines:** 3 | **Words:** 11 | **Characters:** 42 | **Improvement:** -73%

#### IMPLEMENTATION RULES

**List Header Format:**
```javascript
// Template: [EMOJI] Type (count) • context_info
`📦 Товары (${products.length}) • ${shopName}`
```

**List Item Format (one-liner):**
```javascript
// Template: N. Name — Price | stock_status
`${i}. ${product.name} — ${formatPrice(product.price)} | ${stockStatus}`

// stockStatus examples:
// "нет" (zero)
// "есть" (some)  
// "${stock} шт" (quantity: only if <5)
```

**Stock Status Logic:**
```javascript
const getStockStatus = (stock) => {
  if (stock === 0) return 'нет';
  if (stock <= 3) return `${stock} шт`;
  return 'есть';
};
```

---

### 2.2 ORDERS LIST (Seller: "Продажи")

#### CURRENT
```
💰 Продажи (3):
Магазин: fobos

1. ✅ @ivan_buyer - $25
2. ⏳ @maria_seller - $10
3. ❌ @alex_dev - $50
```
**Lines:** 9 | **Words:** 20

#### MINIMALIST
```
💰 Продажи (3) • fobos
1. ✅ @ivan — $25
2. ⏳ @maria — $10
3. ❌ @alex — $50
```
**Lines:** 4 | **Words:** 15 | **Improvement:** -60%

#### IMPLEMENTATION
```javascript
// Seller orders (sales)
const formatSalesList = (orders, shopName) => {
  let msg = `💰 Продажи (${orders.length}) • ${shopName}\n`;
  
  orders.slice(0, 5).forEach((order, i) => {
    const user = order.buyer_username 
      ? order.buyer_username.replace(/^@/, '').slice(0, 12)  // Trim long usernames
      : order.buyer_first_name || 'Покупатель';
    const status = formatOrderStatus(order.status);  // Returns ✅/⏳/❌/📦
    
    msg += `${i+1}. ${status} @${user} — ${formatPrice(order.total_price)}\n`;
  });
  
  if (orders.length > 5) {
    msg += `\n+${orders.length - 5} ещё`;
  }
  
  return msg;
};
```

---

### 2.3 BUYER ORDERS LIST

#### CURRENT
```
🛒 Мои заказы:

1. ✅ fobos - $25
2. ⏳ laptop_shop - $10
3. ❌ audio_pro - $50
```

#### MINIMALIST
```
🛒 Заказы (3)
1. ✅ fobos — $25
2. ⏳ laptop_shop — $10
3. ❌ audio_pro — $50
```
**Single line header, cleaner separators**

---

### 2.4 SUBSCRIPTIONS LIST

#### CURRENT
```
Мои подписки:

1. fobos
2. laptop_shop
3. audio_pro
```
**Lines:** 5 | **Format:** Verbose header, no count

#### MINIMALIST
```
📚 Подписки (3)
1. fobos
2. laptop_shop
3. audio_pro
```
**Lines:** 4 | **Emoji + count for scanability**

---

### 2.5 SHOP INFO / SEARCH RESULTS

#### CURRENT (Search Result)
```
ℹ️ awesome_shop

Продавец: @seller_name

Описание: Best electronics in telegram

📦 Товары: 15

В магазине:
1. iPhone 13 - $999
2. iPad Pro - $599
3. MacBook Pro - $2299
```
**Lines:** 13 | **Clunky structure**

#### MINIMALIST
```
ℹ️ awesome_shop • @seller_name
Electronics • 15 товаров

1. iPhone 13 — $999
2. iPad Pro — $599
3. MacBook Pro — $2299
+12 ещё

[🔔 Subscribe] [ℹ️ Back]
```
**Lines:** 7 | **Inline metadata, count indicator**

#### IMPLEMENTATION
```javascript
const formatShopInfo = async (shop, products, isSubscribed) => {
  const seller = shop.seller_username 
    ? `@${shop.seller_username}`
    : shop.seller_first_name || 'Seller';
  
  const header = `ℹ️ ${shop.name} • ${seller}`;
  const meta = shop.description 
    ? `${shop.description} • ${products.length} товаров`
    : `${products.length} товаров`;
  
  let msg = `${header}\n${meta}\n\n`;
  
  // Show top 3 products
  products.slice(0, 3).forEach((p, i) => {
    msg += `${i+1}. ${p.name} — ${formatPrice(p.price)}\n`;
  });
  
  if (products.length > 3) {
    msg += `+${products.length - 3} ещё`;
  }
  
  return msg;
};
```

---

### 2.6 WALLET ADDRESSES & CRYPTO PAYMENTS

#### CURRENT (Verbose)
```
💼 Кошельки

1. Bitcoin (BTC)
Адрес: 1A1z7agoat2LWQLZCGYUN75ZV2HHVM7ZiJ
Статус: Активен

2. Ethereum (ETH)
Адрес: 0x32Be343B94f860124dC4fEe278FADBD038e3B39d
Статус: Активен
```
**Lines:** 9 | **Too much whitespace**

#### MINIMALIST
```
💼 Кошельки (2)
1. ₿ BTC — 1A1z7agoat2LW... [✏️ Edit]
2. Ξ ETH — 0x32Be343B94f8... [✏️ Edit]
```
**Lines:** 3 | **Use crypto symbols, truncate addresses**

#### IMPLEMENTATION
```javascript
const truncateAddress = (addr, chars = 12) => {
  return addr.slice(0, chars) + '...';
};

const formatWalletsList = (wallets) => {
  const icons = { BTC: '₿', ETH: 'Ξ', USDT: '₮', TON: '🔷' };
  
  let msg = `💼 Кошельки (${wallets.length})\n`;
  wallets.forEach((w, i) => {
    msg += `${i+1}. ${icons[w.currency]} ${w.currency} — ${truncateAddress(w.address)}\n`;
  });
  
  return msg;
};

// Keyboard: [Edit BTC] [Edit ETH] [+ Add] [Back]
```

---

### 2.7 STATUS MESSAGES

#### Success Confirmation

**VERBOSE:**
```
Товар успешно добавлен!

Название: iPhone 13
Цена: $999
Запас: 100
```

**MINIMALIST:**
```
✅ Товар добавлен
iPhone 13 • $999 • 100 шт
```

**Implementation:**
```javascript
// After product creation:
await ctx.reply(
  `✅ Товар добавлен\n${name} • ${formatPrice(price)} • ${stock} шт`,
  successButtons
);
```

---

#### Error Messages

**CURRENT:**
```
❌ Ошибка добавления товара

Попробуйте позже или свяжитесь с поддержкой
```

**MINIMALIST:**
```
❌ Не удалось добавить товар
Попробуйте позже
```

**Rules:**
- 1 emoji + action
- 2nd line: brief reason (max 30 chars)
- **No apologies** ("Извините" = waste)
- **No links** in Telegram (use keyboard buttons)

---

### 2.8 WIZARD PROMPTS (Multi-step)

#### Current (Add Product Wizard)

**Step 1:**
```
Введите название товара:
Минимум 3 символа
Максимум 100 символов
```

**Step 2:**
```
Введите цену в USD:
Примеры:
- 99
- 99.99
- 99,99
```

#### Minimalist (Add Product)

**Step 1:**
```
Название товара (мин. 3 символа):
[Cancel button]
```

**Step 2:**
```
Цена в USD (пример: 25 или 25.99):
[Cancel button]
```

**Rules:**
- Single-line prompt
- Optional: 1 example inline or on button
- No "maxes" — let backend validate
- Fast flow feel

---

### 2.9 WIZARD CONFIRMATIONS (Multi-step Complete)

#### Verbose
```
✅ Товар успешно создан!

Название: iPhone 13
Цена: $999
Запас: 100

Что дальше?
```

#### Minimalist
```
✅ iPhone 13 • $999 • 100 шт

[+ Ещё товар] [← Назад]
```

**Pattern:** Icon + key info inline, then action buttons.

---

## Part 3: Button Label Best Practices

### 3.1 Button Text Compression

**Rules:**
- Max 15 characters per button label
- Start with emoji (scannable)
- Action-oriented verbs (where applicable)

#### Examples (Product List Context)

**VERBOSE:**
```
[➕ Добавить новый товар]
[← Вернуться в главное меню]
[💰 Посмотреть продажи]
```

**MINIMALIST:**
```
[➕ Добавить]
[« Назад]
[💰 Продажи]
```

#### Examples (Subscription Context)

**VERBOSE:**
```
[🔔 Подписаться на магазин]
[🔕 Отписаться от магазина]
[ℹ️ Информация о магазине]
```

**MINIMALIST:**
```
[🔔 Подписаться]
[🔕 Отписаться]
[ℹ️ Магазин]
```

### 3.2 Button Layout Rules

**1-2 buttons:** 1 per row
```
[🔍 Поиск]
[➕ Создать]
```

**3-4 buttons:** 2 per row
```
[₿ BTC] [Ξ ETH]
[₮ USDT] [🔷 TON]
```

**5+ buttons:** 
- Use 3 per row
- OR collapse into sub-menus

**Navigation buttons:**
- Always last, in their own row
- Consistent format: `[« Back]` or `[🏠 Menu]`

---

## Part 4: How to Make Wizards Feel Faster

### 4.1 Perceived Speed Optimizations

1. **Omit redundant steps**
   - Remove confirmation screens
   - Pre-fill defaults where possible
   - Only ask for essential data

2. **Progressive disclosure**
   - Basic fields first (name, price)
   - Advanced options later (description, images) or not at all
   - Initial MVP: name + price only

3. **Instant feedback**
   - Confirm each step immediately (✅ Name received)
   - Not: "Processing..." without action

4. **Visual progress indicators**
   ```
   Step 1 of 3: Название
   [Continue...]
   
   Step 2 of 3: Цена
   ```

### 4.2 Optimized Wizard Flow

#### Current Add Product (3 steps, verbose)
```
Step 1: Name prompt (explanation + constraints)
Step 2: Price prompt (examples)
Step 3: Confirmation (show all data, ask "continue?")
Step 4: Success message
```
**Feel:** Slow, lots of reading

#### Minimalist Add Product (3 steps, fast)
```
Step 1: Название (мин. 3 символа):
       [✓ Name saved - continue to price]

Step 2: Цена в USD (пример 25.99):
       [✓ Price saved - add to store?]

Step 3: ✅ Товар добавлен • iPhone • $999
       [+ Ещё] [↩ Назад]
```

**Key differences:**
- Inline constraints (not separate line)
- Success feedback per step
- Instant action buttons (not "Are you sure?")
- Back/forward buttons always visible

---

## Part 5: Complete BEFORE→AFTER Examples

### 5.1 Seller Dashboard Header

**BEFORE:**
```
Вы вошли как продавец

Мой магазин: fobos

[➕ Добавить товар]
[📦 Мои товары]
[💰 Продажи]
[💼 Кошельки]
[🔄 Переключиться на покупателя]
```

**AFTER:**
```
💼 fobos (Seller)

[📱 Открыть] [➕ Товар] [💰 Продажи] [💼 Кошели]
[🔄 Buyer]
```

---

### 5.2 Buyer Dashboard

**BEFORE:**
```
Мои покупки

[📱 Открыть приложение]
[🔍 Найти магазин]
[📚 Подписки]
[🛒 Мои заказы]
[🔄 Переключиться на продавца]
```

**AFTER:**
```
🛍 Мои покупки

[📱 App] [🔍 Найти] [📚 Подписки] [🛒 Заказы]
[💼 Seller]
```

---

### 5.3 Shop Search Results

**BEFORE:**
```
Результаты поиска:

1. awesome_shop
Продавец: @seller_name
Описание: Best electronics in telegram
Товаров: 15

2. electronics_pro
Продавец: @electronics_pro
Описание: Pro equipment for professionals
Товаров: 42
```

**AFTER:**
```
🔍 Результаты (2)

1. awesome_shop • @seller_name • 15
2. electronics_pro • @electronics_pro • 42

[Tap to view details]
```

---

### 5.4 Order Confirmation Email-style

**BEFORE:**
```
Заказ успешно создан

Номер заказа: #12345
Магазин: fobos
Товар: iPhone 13
Цена: $999
Статус: Ожидает оплаты

Перейти к оплате?
[✅ Да] [❌ Отмена]
```

**AFTER:**
```
✅ Заказ #12345

fobos • iPhone 13 • $999
Статус: ⏳ Ожидание оплаты

[💳 Оплатить] [← Назад]
```

---

### 5.5 Wallet Management (Complete Flow)

**CURRENT Wallet View:**
```
💼 Управление кошельками

Активные кошельки:
1. Bitcoin (BTC)
   Адрес: 1A1z7agoat2LWQLZCGYUN75ZV2HHVM7ZiJ
   Статус: Активен

2. Ethereum (ETH)
   Адрес: 0x32Be343B94f860124dC4fEe278FADBD038e3B39d
   Статус: Активен

3. USDT (Tether)
   Адрес: 0xdac17f958d2ee523a2206206994597c13d831ec7
   Статус: Активен
```

**MINIMALIST:**
```
💼 Кошельки (3)
1. ₿ BTC: 1A1z7agoat2LW...
2. Ξ ETH: 0x32Be343B94f8...
3. ₮ USDT: 0xdac17f958d2e...

[✏️ Edit BTC] [✏️ Edit ETH]
[✏️ Edit USDT] [+ Add] [← Back]
```

---

## Part 6: Text Formatting Quick Reference

### Formatting Cheatsheet

```javascript
// ✅ GOOD patterns
`📦 Товары (5) • fobos`          // Header
`1. iPhone — $25 | есть`          // List item
`✅ Товар добавлен`               // Status
`@username • 15 товаров`          // Inline metadata

// ❌ BAD patterns
`📦 Мои товары (5 товаров):`      // Redundant count
`Магазин: fobos`                  // Separate line (use inline)
`Статус: ⏳ Ожидание`             // Redundant label
```

### Emoji + Text Pairing

**BEST:**
```
[EMOJI] Text           // Emoji leads
Text • [EMOJI] more    // Inline secondary
```

**AVOID:**
```
Text [EMOJI] more [EMOJI]    // Trailing emojis
[EMOJI] [EMOJI] Text         // Multiple leading emojis
```

---

## Part 7: Implementation Checklist

When adding new screens or updating existing ones:

- [ ] Remove all redundant labels ("Магазин:", "Цена:")
- [ ] Compress multi-line items to single lines (use separators)
- [ ] List headers: emoji + count + context in 1 line
- [ ] Remove "explanations" (min 3 chars, max 100 chars, etc.)
- [ ] Inline metadata with `•` or `—` separators
- [ ] Button labels: max 15 chars
- [ ] Status messages: emoji + key info (max 2 lines)
- [ ] Error messages: icon + reason (max 2 lines)
- [ ] Wizard steps: remove confirmation screen
- [ ] Test on mobile (40-45 chars/line = natural break point)

---

## Part 8: Telegram Mobile Simulation

**40px font @ 375px width (iPhone SE) = ~40 characters/line**

```
This is a test line that is approximately
40 characters in width on a mobile phone.
Longer lines wrap and feel claustrophobic
on small screens. ✅
```

Test all messages with this line length in mind.

---

## References

- **Official Pattern:** Telegram's @ShopBot
- **Design Principle:** "Complexity is hidden, simplicity is shown"
- **Mobile UX:** Touch targets ≥44px, font ≥16px
- **Emoji Frequency:** 1 per section/action (not per item)

