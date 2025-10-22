# План улучшения Test Coverage (11.56% → 50%)

**Дата:** 2025-10-22
**Текущий Coverage:** 11.56%
**Цель:** 50% за 1 месяц
**Приоритет:** P2 (Важно)

---

## Текущее состояние

### Coverage by directory:
```
handlers/         0% ❌ (650+ строк непокрытого кода)
scenes/           2% ❌ (360+ строк непокрытого кода)
middleware/      44% ⚠️ (auth.js покрыт, error.js - нет)
keyboards/       25% ⚠️ (common.js покрыт, остальные - нет)
utils/           52% ✅ (validation, format, logger покрыты)
```

### Существующие тесты:
- ✅ 22 integration теста (основные flows)
- ✅ 166 unit тестов (utils покрыты на 100%)
- ❌ 0 тестов для error.js middleware
- ❌ 0 тестов для keyboard функций

---

## План действий

### Фаза 1: Handlers (0% → 40%)

**Приоритет:** Высокий
**Время:** 2 недели
**Новых тестов:** ~50

#### Файлы для покрытия:

**1. handlers/buyer/index.js (340 строк)**
Добавить тесты для:
- [ ] `handleBuyerRole` - сохранение роли в БД
- [ ] `handleBuyerRole` - проверка shopId для CTA
- [ ] `handleSearchShops` - вход в scene
- [ ] `handleSubscriptions` - пустой список
- [ ] `handleSubscriptions` - 10+ подписок (pagination)
- [ ] `handleSubscribe` - happy path
- [ ] `handleSubscribe` - already subscribed
- [ ] `handleSubscribe` - own shop error
- [ ] `handleSubscribe` - no token error
- [ ] `handleUnsubscribe` - happy path
- [ ] `handleUnsubscribe` - API error
- [ ] `handleOrders` - пустой список
- [ ] `handleOrders` - 10+ заказов
- [ ] `handleOrders` - no token error
- [ ] `handleNoop` - informational callback
- [ ] `handleShopView` - shop details
- [ ] `handleShopView` - shop products
- [ ] `handleShopView` - subscription check

**Шаблон теста:**
```javascript
// tests/integration/buyer.handlers.test.js
describe('Buyer Handlers', () => {
  let testBot, mock;

  beforeEach(() => {
    testBot = new TestBot();
    mock = new MockAdapter(api);
  });

  it('handleBuyerRole - saves role to database', async () => {
    mock.onPatch('/auth/role').reply(200, { data: { role: 'buyer' } });
    mock.onGet('/shops/my').reply(200, { data: [] });

    await testBot.handleUpdate(callbackUpdate('role:buyer'));
    await new Promise(resolve => setImmediate(resolve));

    const text = testBot.getLastReplyText();
    expect(text).toContain('Мои покупки');
    expect(testBot.session.role).toBe('buyer');
  });

  it('handleSubscribe - already subscribed', async () => {
    mock.onGet('/subscriptions/check/123').reply(200, {
      data: { subscribed: true }
    });
    mock.onGet('/shops/123').reply(200, {
      data: { id: 123, name: 'Test Shop' }
    });

    await testBot.handleUpdate(callbackUpdate('subscribe:123'));
    await new Promise(resolve => setImmediate(resolve));

    const calls = testBot.getCalls();
    const answerCall = calls.find(c => c.method === 'answerCbQuery');
    expect(answerCall.args[0]).toContain('уже подписаны');
  });
});
```

**Оценка:** ~18 тестов, 3-4 часа

---

**2. handlers/seller/index.js (318 строк)**
Добавить тесты для:
- [ ] `handleSellerRole` - сохранение роли в БД
- [ ] `handleSellerRole` - shopId из массива shops
- [ ] `handleSellerRole` - no shops → show CTA
- [ ] `handleSellerRole` - no token → show CTA
- [ ] `handleSellerRole` - 404 error → show CTA
- [ ] `handleSellerRole` - network error → generic error
- [ ] `handleCreateShop` - вход в scene
- [ ] `handleAddProduct` - вход в scene
- [ ] `handleAddProduct` - no shopId → error
- [ ] `handleProducts` - пустой список
- [ ] `handleProducts` - 10+ товаров
- [ ] `handleProducts` - no shopId → error
- [ ] `handleProducts` - no token → error
- [ ] `handleSales` - пустой список
- [ ] `handleSales` - 10+ продаж
- [ ] `handleSales` - no token → error
- [ ] `handleWallets` - вход в scene
- [ ] `handleWallets` - no shopId → error

**Оценка:** ~18 тестов, 3-4 часа

---

**3. handlers/common.js (193 строки)**
Добавить тесты для:
- [ ] `handleMainMenu` - redirect to seller dashboard
- [ ] `handleMainMenu` - redirect to buyer dashboard
- [ ] `handleMainMenu` - no role → show selection
- [ ] `handleCancelScene` - leave scene
- [ ] `handleBack` - seller role
- [ ] `handleBack` - buyer role
- [ ] `handleBack` - no role
- [ ] `handleRoleToggle` - seller → buyer
- [ ] `handleRoleToggle` - buyer → seller
- [ ] `handleRoleToggle` - save to database
- [ ] `handleRoleToggle` - no token fallback
- [ ] `handleRoleToggle` - no current role

**Оценка:** ~12 тестов, 2-3 часа

---

**4. handlers/start.js (66 строк)**
Добавить тесты для:
- [ ] `/start` - saved role: seller
- [ ] `/start` - saved role: buyer
- [ ] `/start` - no saved role
- [ ] `/start` - fakeCtx construction

**Оценка:** ~4 теста, 1 час

---

### Фаза 2: Scenes (2% → 50%)

**Приоритет:** Средний
**Время:** 1 неделя
**Новых тестов:** ~20

#### Файлы для покрытия:

**1. scenes/manageWallets.js (256 строк)**
Добавить тесты для:
- [ ] Step 1: show wallets - all empty
- [ ] Step 1: show wallets - some filled
- [ ] Step 1: no shopId → exit
- [ ] Step 1: no token → exit
- [ ] Step 2: select BTC
- [ ] Step 2: select ETH
- [ ] Step 2: select USDT
- [ ] Step 2: select TON
- [ ] Step 2: unknown crypto
- [ ] Step 3: save valid BTC address
- [ ] Step 3: save valid ETH address
- [ ] Step 3: invalid address
- [ ] Step 3: too short address
- [ ] Step 3: no crypto in state
- [ ] cancel_scene handler

**Оценка:** ~15 тестов, 3 часа

---

**2. Остальные scenes уже покрыты ✅**
- createShop.js - 4 теста (покрыто)
- addProduct.js - 7 тестов (покрыто)
- searchShop.js - 3 теста (покрыто)

---

### Фаза 3: Middleware & Keyboards (44% → 80%)

**Приоритет:** Низкий
**Время:** 2-3 дня
**Новых тестов:** ~10

#### Файлы для покрытия:

**1. middleware/error.js (27 строк)**
Добавить тесты для:
- [ ] Error с ctx.reply доступен
- [ ] Error без ctx.reply (fallback)
- [ ] Error логируется
- [ ] next() вызывается

**Оценка:** ~4 теста, 1 час

---

**2. keyboards/buyer.js, seller.js, main.js**
Добавить unit тесты для:
- [ ] buyerMenu structure
- [ ] buyerMenuNoShop structure (has CTA)
- [ ] shopActionsKeyboard - not subscribed
- [ ] shopActionsKeyboard - subscribed
- [ ] sellerMenu structure
- [ ] sellerMenuNoShop structure
- [ ] mainMenu structure

**Оценка:** ~7 тестов, 1-2 часа

---

## Summary

### Распределение по фазам:

| Фаза | Файлы | Новых тестов | Время | Coverage цель |
|------|-------|--------------|-------|---------------|
| Фаза 1 | handlers/* | ~50 | 10-12 часов | 0% → 40% |
| Фаза 2 | scenes/manageWallets | ~15 | 3 часа | 2% → 50% |
| Фаза 3 | middleware + keyboards | ~10 | 2-3 часа | 44% → 80% |
| **ИТОГО** | | **~75 тестов** | **~16 часов** | **11.56% → 50%+** |

---

## Приоритетный порядок

### Неделя 1-2: Handlers
1. `handlers/buyer/index.js` (18 тестов)
2. `handlers/seller/index.js` (18 тестов)
3. `handlers/common.js` (12 тестов)
4. `handlers/start.js` (4 теста)

**Результат после 2 недель:** Coverage ~30%

### Неделя 3: Scenes
5. `scenes/manageWallets.js` (15 тестов)

**Результат после 3 недель:** Coverage ~40%

### Неделя 4: Middleware & Keyboards
6. `middleware/error.js` (4 теста)
7. Keyboards (7 тестов)

**Результат после 4 недель:** Coverage **50%+** ✅

---

## Инструменты

### Для быстрого написания тестов:

**1. Test Generator (AI-assisted)**
```bash
# Использовать Claude/GPT для генерации тестов по шаблону
claude "Generate integration test for handleSubscribe handler with 5 edge cases"
```

**2. Coverage Reporter**
```bash
npm test -- --coverage --coverageReporters=text
# Смотреть какие строки не покрыты
```

**3. Watch Mode**
```bash
npm test -- --watch --coverage
# Писать тесты и видеть coverage в real-time
```

---

## Критерии успеха

### Метрики:
- ✅ Overall coverage: **50%+**
- ✅ handlers/: **40%+**
- ✅ scenes/: **50%+**
- ✅ middleware/: **80%+**
- ✅ keyboards/: **80%+**
- ✅ utils/: **100%** (уже достигнуто)

### Качество тестов:
- ✅ Каждый handler имеет happy path test
- ✅ Каждый handler имеет error case test
- ✅ Каждый scene имеет cancel test
- ✅ Все edge cases из аудита покрыты
- ✅ Нет flaky tests (100% success rate)

---

## Rollout план

### Week 1:
- [ ] `handlers/buyer/index.js` - 18 тестов
- [ ] `handlers/seller/index.js` - 18 тестов
- [ ] Coverage check: ~25%

### Week 2:
- [ ] `handlers/common.js` - 12 тестов
- [ ] `handlers/start.js` - 4 теста
- [ ] Coverage check: ~30%

### Week 3:
- [ ] `scenes/manageWallets.js` - 15 тестов
- [ ] Coverage check: ~40%

### Week 4:
- [ ] `middleware/error.js` - 4 теста
- [ ] Keyboards - 7 тестов
- [ ] Final coverage check: **50%+** ✅

---

## Next Steps

1. **Создать branch:** `feature/increase-test-coverage`
2. **Начать с Phase 1 Week 1:** handlers/buyer + handlers/seller
3. **Запускать coverage после каждого блока:** `npm test -- --coverage`
4. **Merge в main:** когда достигнут 50% coverage

---

**Ответственный:** Backend/Bot developer
**Reviewers:** Senior developer + QA
**Дедлайн:** 4 недели от старта
