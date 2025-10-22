# Problem Index

**Статус аудита:** ✅ Completed (2025-01-XX)

Таблица известных проблем и их статуса покрытия тестами.

| Category | File:Line | Symptom | Test Coverage | Status | Priority |
|----------|-----------|---------|---------------|--------|----------|
| **UX Bug** | `src/scenes/searchShop.js:66` | Показывает только первый результат вместо всех N | `tests/integration/searchShop.bug.test.js:51` (failing test) | ❌ **KNOWN BUG** | P1 |
| **Callback ACK** | All handlers | All 30 action handlers имеют `answerCbQuery()` | `tools/lint-callbacks-ack.js` (0 violations) | ✅ OK | - |
| **WebApp Security** | All files | All WebApp buttons centralized in `keyboards/` | `tools/lint-webapp-links.js` (0 violations) | ✅ OK | - |
| **Subscriptions** | `src/handlers/buyer/index.js` | Subscribe/unsubscribe idempotency | `tests/integration/subscriptions.flow.test.js` | ✅ Covered | - |
| **Shop Creation** | `src/scenes/createShop.js` | Name validation, session.shopId persistence | `tests/integration/createShop.flow.test.js` | ✅ Covered | - |
| **Product Creation** | `src/scenes/addProduct.js` | Price comma→dot, duplicate prevention | `tests/integration/addProduct.flow.test.js` | ✅ Covered | - |
| **Main Menu** | `src/keyboards/` | Exactly 1 WebApp button at top | `tests/integration/mainMenu.snapshot.test.js` | ✅ Covered | - |

---

## Известные баги (требуют исправления)

### 1. searchShop показывает только первый результат ❌ P1

**Файл:** `src/scenes/searchShop.js:66`

**Симптом:**
Когда API возвращает 3 магазина, показывается только первый.

**Текущий код:**
```javascript
// Show first result
const shop = shops[0];  // ← BUG
await ctx.reply(
  `${shop.name}\nПродавец: ${sellerUsername}\n\n`,
  shopActionsKeyboard(shop.id, Boolean(shop.is_subscribed))
);
```

**Исправление:**
```javascript
// Show all results
for (const shop of shops) {
  const sellerUsername = shop.seller_username
    ? `@${shop.seller_username}`
    : (shop.seller_first_name || 'Продавец');

  await ctx.reply(
    `${shop.name}\nПродавец: ${sellerUsername}\n\n`,
    shopActionsKeyboard(shop.id, Boolean(shop.is_subscribed))
  );
}
```

**Тест:** `tests/integration/searchShop.bug.test.js:51` (failing test, ждёт фикса)

**Приоритет:** P1 (высокий) - UX проблема, пользователи не видят результаты поиска

---

## Проверенные области (нет проблем) ✅

### Callback Query Acknowledgement
- **Файлы:** All handlers (30 action handlers)
- **Статус:** ✅ Все имеют `answerCbQuery()`
- **Проверка:** `npm run test:lint:bot` → `tools/lint-callbacks-ack.js`
- **Детали:**
  - buyer/index.js: 9 handlers ✅
  - seller/index.js: 7 handlers ✅
  - common.js: 4 handlers ✅
  - scenes: 4 cancel_scene handlers ✅
  - scenes/manageWallets.js: wallet selection ✅

### WebApp Button Security
- **Файлы:** All files
- **Статус:** ✅ Все WebApp кнопки в `keyboards/`
- **Проверка:** `npm run test:lint:bot` → `tools/lint-webapp-links.js`
- **Детали:**
  - `keyboards/seller.js:6` ✅
  - `keyboards/buyer.js:6` ✅
  - `keyboards/buyer.js:16` (buyerMenuNoShop) ✅
  - Нет WebApp кнопок в handlers/scenes ✅

### Subscriptions Flow
- **Файл:** `src/handlers/buyer/index.js`
- **Тест:** `tests/integration/subscriptions.flow.test.js`
- **Покрытие:**
  - ✅ Subscribe → success
  - ✅ Repeat subscribe → idempotency ("уже подписан")
  - ✅ Button flip (Подписаться → Подписан → Отписаться)
  - ✅ Unsubscribe → button flip back
  - ✅ Own shop → error

### Shop Creation Flow
- **Файл:** `src/scenes/createShop.js`
- **Тест:** `tests/integration/createShop.flow.test.js`
- **Покрытие:**
  - ✅ Short name (<3 chars) → error
  - ✅ Long name (>100 chars) → error
  - ✅ Valid name → session.shopId set
  - ✅ No duplicate POST on repeat confirm
  - ✅ No token → error

### Product Creation Flow
- **Файл:** `src/scenes/addProduct.js`
- **Тест:** `tests/integration/addProduct.flow.test.js`
- **Покрытие:**
  - ✅ Price comma → dot conversion (99,99 → 99.99)
  - ✅ Invalid price → error
  - ✅ No shopId → error
  - ✅ No duplicate POST on repeat confirm

### Main Menu WebApp Button
- **Файл:** `src/keyboards/buyer.js`, `src/keyboards/seller.js`
- **Тест:** `tests/integration/mainMenu.snapshot.test.js`
- **Покрытие:**
  - ✅ Buyer menu: exactly 1 WebApp button at top
  - ✅ Seller menu: exactly 1 WebApp button at top
  - ✅ No other URL buttons
  - ✅ Snapshots for regression

---

## Команды для проверки

```bash
# Запустить все integration тесты (4 passing + 1 failing)
npm run test:integration

# Запустить статические линтеры
npm run test:lint:bot

# Запустить всё (linters + tests)
npm run test:ci

# Запустить только failing test (searchShop bug)
npm test searchShop.bug
```

---

## Метрики

- **Total action handlers:** 30
- **Missing answerCbQuery:** 0 ✅
- **WebApp buttons outside keyboards/:** 0 ✅
- **Known UX bugs:** 1 ❌ (searchShop)
- **Integration tests:** 5 (4 passing, 1 failing)
- **Test coverage:** ~50-55% (expected for Telegram bot)

---

## История

- **2025-01-XX:** Initial audit completed
  - Created 5 integration tests
  - Created 2 static linters
  - Identified 1 known bug (searchShop)
  - Verified all answerCbQuery present
  - Verified all WebApp buttons centralized
