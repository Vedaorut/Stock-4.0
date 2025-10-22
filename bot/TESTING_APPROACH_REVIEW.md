# Запрос ревью подхода к тестированию Telegram бота

## Контекст

**Проект**: Telegram e-commerce бот (Telegraf.js + Node.js + PostgreSQL)  
**Функционал**: Создание магазинов, добавление товаров, заказы, крипто-платежи  
**Размер кодабазы**: ~2500 строк (bot/)

## Что мы делаем сейчас

### Текущий coverage: 11.56%

**Что покрыто на 100%** (работает хорошо):
- `utils/validation.js` - проверка крипто-адресов (BTC/ETH/USDT/TON)
- `utils/format.js` - форматирование цен ($25.50)
- `keyboards/common.js` - общие кнопки (Cancel, Back)

**Что покрыто частично** (61%):
- `middleware/auth.js` - регистрация через Backend API

**Что НЕ покрыто** (0-2%):
- `handlers/` - обработчики команд и callback queries (914 строк)
- `scenes/` - многошаговые wizards (544 строки)

### Структура бота

```
bot/src/
├── handlers/
│   ├── start.js          # 63 строки  - /start команда, выбор роли (buyer/seller)
│   ├── common.js         # 158 строк - main_menu, change_role, "Открыть приложение"
│   ├── buyer/index.js    # 360 строк - поиск магазинов, подписки, заказы
│   └── seller/index.js   # 323 строки - управление магазином, товары, кошельки
├── scenes/              # Telegraf Wizards (многошаговые диалоги)
│   ├── createShop.js    # 138 строк - 2 шага: название → создать
│   ├── addProduct.js    # 179 строк - 4 шага: название → цена → описание → создать
│   ├── manageWallets.js # 249 строк - выбор крипты → ввод адреса → сохранить
│   └── searchShop.js    # 116 строк - ввод запроса → поиск → показать результаты
├── middleware/
│   ├── auth.js          # 68 строк  - автоматическая регистрация через Backend API
│   └── error.js         # 27 строк  - глобальный error handler
├── utils/
│   ├── api.js           # 260 строк - axios клиент для Backend API
│   ├── validation.js    # 50 строк  - validateCryptoAddress()
│   ├── format.js        # 75 строк  - formatPrice(), formatOrderStatus()
│   └── logger.js        # 55 строк  - winston logger
└── keyboards/           # Inline keyboards для Telegram
    ├── buyer.js         # 43 строки
    ├── seller.js        # 35 строк
    └── common.js        # 4 строки
```

## Наши текущие тесты (166 штук)

### Unit-тесты (147 тестов)

**1. API Client** (`tests/unit/api.test.js` - 19 тестов)
```javascript
// Пример:
it('should create shop', async () => {
  mock.onPost('/api/shops').reply(201, { id: 1, name: 'Test Shop' });
  const response = await api.post('/api/shops', { name: 'Test Shop' });
  expect(response.data.id).toBe(1);
});
```

**2. Validation Utils** (`tests/unit/validation.test.js` - 26 тестов)
```javascript
// Пример:
it('should accept valid BTC address', () => {
  expect(validateCryptoAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'BTC')).toBe(true);
});
```

**3. Format Utils** (`tests/unit/format.test.js` - 32 теста)
```javascript
// Пример:
it('should format price without decimals', () => {
  expect(formatPrice(25)).toBe('$25');
});
```

**4. Auth Middleware** (`tests/unit/authMiddleware.test.js` - 9 тестов)
```javascript
// Пример:
it('should skip if already authenticated', async () => {
  const ctx = { session: { token: 'existing-token' } };
  await authMiddleware(ctx, next);
  expect(next).toHaveBeenCalled();
});
```

**5. Scene Wizards** (61 тест для 4 сцен)
```javascript
// Пример из createShop.test.js:
it('should reject shop name with less than 3 characters', async () => {
  const ctx = createTextMessageContext('AB');
  const shopName = ctx.message.text.trim();
  expect(shopName.length < 3).toBe(true);
});
```

**НО**: Эти тесты проверяют только **validation логику** (длина строки, формат), а НЕ реальное взаимодействие со сценой (wizard.next(), scene.leave()).

### E2E-тесты (1 тест)

```javascript
// tests/e2e/createShop.e2e.test.js
it('should complete full shop creation flow', async () => {
  expect(createShopScene).toBeDefined();
  expect(createShopScene.id).toBe('createShop');
  // Проверяет только структуру, НЕ запускает реальный flow
});
```

## Наши проблемы

### 1. Coverage 11.56% vs цель 80%

**Почему так мало?**
- handlers/scenes = 1458 строк (0-2% покрытия)
- Мы тестируем только utils/validation, а не основную логику бота

### 2. Тесты не покрывают реальные user flows

**Что НЕ тестируется**:
- ❌ Нажатие на кнопку "Создать магазин" → открывается wizard
- ❌ Ввод названия магазина → wizard.next() → API call → session update
- ❌ Ошибка API → показывается сообщение пользователю
- ❌ Callback query handling (ctx.answerCbQuery, ctx.editMessageText)
- ❌ WebSocket broadcasts (global.broadcastUpdate)

**Что тестируется**:
- ✅ Валидация входных данных (длина, формат)
- ✅ Форматирование выходных данных (цены, даты)
- ✅ Крипто-адреса (BTC/ETH/TON)

### 3. Непонятно, что действительно важно тестировать

**Вопросы**:
- Нужно ли unit-тестить каждый handler? (914 строк)
- Или достаточно integration/E2E тестов для основных flows?
- Как тестировать Telegraf wizards эффективно?
- Какой coverage реалистичен для Telegram ботов в продакшене?

## Вопросы к эксперту

### 1. Приоритезация: что тестировать в первую очередь?

**Наша гипотеза**:
```
1. КРИТИЧНО (100% coverage):
   - Платёжная логика (crypto address validation ✅)
   - Аутентификация (auth middleware - 61% ✅)
   - Безопасность (input validation ✅)

2. ВАЖНО (60-80% coverage):
   - Основные user flows (создание магазина, добавление товара)
   - Error handling (что показываем пользователю при ошибке)
   - State management (session mutations)

3. ПОЛЕЗНО (20-40% coverage):
   - UI flows (кнопки, keyboards)
   - Edge cases (что если пользователь нажал "Назад" 3 раза подряд)
   - Форматирование (formatPrice ✅)

4. НЕ НУЖНО (0% coverage):
   - Статичные keyboards (buyer.js, seller.js)
   - Logger wrapper (logger.js - 90% ✅, можно убрать)
   - Тривиальные геттеры
```

**Правильно ли?** Или мы что-то упускаем?

### 2. Unit vs Integration vs E2E: что эффективнее для Telegram ботов?

**Текущий подход** (unit-heavy):
```javascript
// Unit-тест (проверяем только validation)
it('should reject short shop name', () => {
  const name = 'AB';
  expect(name.length < 3).toBe(true);
});
```

**Альтернатива** (integration):
```javascript
// Integration-тест (проверяем реальный wizard flow)
it('should reject short shop name in wizard', async () => {
  const bot = createTestBot();
  await bot.handleUpdate({ message: { text: 'AB' } });
  expect(lastReply).toContain('Минимум 3 символа');
  expect(wizard.state.step).toBe(0); // Остались на том же шаге
});
```

**Вопрос**: Что эффективнее для Telegram ботов?
- Много unit-тестов (быстро, но не тестируют реальные flows)
- Меньше integration-тестов (медленнее, но ближе к реальности)
- Или комбинация? В каких пропорциях?

### 3. Как тестировать Telegraf Scenes/Wizards?

**Проблема**: Wizard = stateful multi-step flow

```javascript
// src/scenes/createShop.js
const createShopScene = new Scenes.WizardScene(
  'createShop',
  // Step 1: prompt for name
  async (ctx) => {
    await ctx.reply('Название магазина:');
    return ctx.wizard.next();
  },
  // Step 2: handle name, call API, save to session
  async (ctx) => {
    const shopName = ctx.message.text.trim();
    const shop = await shopApi.create(ctx.session.token, { name: shopName });
    ctx.session.shopId = shop.id;
    await ctx.scene.leave();
  }
);
```

**Варианты тестирования**:

**A. Mock всё** (текущий подход):
```javascript
const ctx = {
  reply: jest.fn(),
  wizard: { next: jest.fn() },
  scene: { leave: jest.fn() },
  session: {},
  message: { text: 'My Shop' }
};
```
- ✅ Быстро
- ❌ Не тестирует реальный Telegraf machinery (middleware chain, session store)

**B. Использовать telegraf-test**:
```javascript
const { createBot } = require('telegraf-test');
const bot = createBot();
bot.use(createShopScene);
await bot.sendMessage('My Shop');
```
- ✅ Ближе к реальности
- ❌ Сложнее setup (нужен полный bot instance)

**C. E2E через реальный Telegram API** (с тестовым ботом):
- ✅ 100% реальность
- ❌ Очень медленно, нужен test bot token

**Вопрос**: Какой подход используют в продакшене для Telegraf ботов?

### 4. Реалистичный coverage для Telegram ботов?

**Наблюдение**: Telegram боты = много UI flow кода (handlers, keyboards, wizards)

**Гипотеза**:
- Backend API: можно достичь 80-90% coverage (чистая бизнес-логика)
- Telegram Bot: реалистично 30-50% coverage? (много UI/flow кода)

**Вопрос**: Какой coverage считается хорошим для Telegram ботов в продакшене?

### 5. Что делать с handlers (914 строк, 0% coverage)?

**Пример handler** (`handlers/buyer/index.js`):
```javascript
// Обработчик кнопки "Поиск магазинов"
bot.action('buyer_search_shops', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter('searchShop');
});

// Обработчик кнопки "Мои заказы"
bot.action('buyer_my_orders', async (ctx) => {
  await ctx.answerCbQuery();
  const orders = await orderApi.getMyOrders(ctx.session.token);
  if (orders.length === 0) {
    await ctx.editMessageText('Заказов пока нет');
  } else {
    const text = orders.map(formatOrder).join('\n\n');
    await ctx.editMessageText(text, ordersKeyboard);
  }
});
```

**Варианты**:

**A. Unit-тестить каждый handler**:
```javascript
it('should show orders', async () => {
  mock.onGet('/api/orders/my').reply(200, [mockOrder]);
  const ctx = createMockContext();
  await buyerMyOrdersHandler(ctx);
  expect(ctx.editMessageText).toHaveBeenCalledWith(expect.stringContaining('Заказ #1'));
});
```
- ✅ Высокий coverage
- ❌ 914 строк = ~100-150 тестов, много дублирования

**B. Integration-тесты для key flows**:
```javascript
it('should complete order flow: search → select shop → order → payment', async () => {
  const bot = createTestBot();
  await bot.click('buyer_search_shops');
  await bot.sendMessage('Electronics');
  await bot.click('shop_details:1');
  await bot.click('order_product:5');
  // ... проверить, что заказ создан
});
```
- ✅ Тестирует реальные user journeys
- ❌ Сложнее писать и поддерживать

**C. Smoke tests + manual QA**:
```javascript
// Просто проверяем, что handlers не падают
it('should handle buyer_my_orders without errors', async () => {
  const ctx = createMockContext();
  await expect(buyerMyOrdersHandler(ctx)).resolves.not.toThrow();
});
```
- ✅ Быстро, минимум кода
- ❌ Не гарантирует корректность логики

**Вопрос**: Какой подход практичнее? Или комбинация?

## Что мы хотим узнать

### Главный вопрос:
**Как тестируют Telegram ботов в продакшене? Какие практики работают?**

### Конкретные вопросы:

1. **Приоритеты**: Что тестировать обязательно, а что можно пропустить?

2. **Unit vs Integration**: Какое соотношение эффективно для Telegram ботов?

3. **Wizards**: Как тестировать многошаговые диалоги (Telegraf Scenes)?

4. **Coverage**: Какой % реалистичен для Telegram бота? 30%? 50%? 80%?

5. **Handlers**: Unit-тестить каждый handler или достаточно smoke tests?

6. **UI flows**: Нужно ли тестировать кнопки/keyboards автоматически?

7. **Error handling**: Как тестировать показ сообщений об ошибках?

8. **Sessions**: Как тестировать мутации session state?

9. **API calls**: Мокать axios везде или использовать test backend?

10. **Инструменты**: Какие библиотеки используют? telegraf-test? Другие?

## Наша цель

**НЕ хотим**: 80% coverage ради coverage (бессмысленные тесты)

**Хотим**: Эффективное тестирование, которое:
- ✅ Ловит реальные баги до продакшена
- ✅ Не тормозит разработку (быстрые тесты)
- ✅ Легко поддерживать (минимум mock boilerplate)
- ✅ Даёт уверенность, что бот работает

## Дополнительный контекст

### Stack
- Telegraf.js 4.15
- Node.js 18+
- Jest 29 (ESM mode)
- PostgreSQL (через Backend API)

### Размер команды
- 1 разработчик (соло-проект)
- Нет dedicated QA

### Deployment
- Продакшен: VPS, systemd service
- CI/CD: нет (пока)
- Rollback: manual git checkout

### Текущие проблемы
- searchShop показывает только 1 результат (баг в production)
- 4 npm security vulnerabilities
- Нет rate limiting (можно spam-ить)

---

**Вопрос к эксперту**: Как бы вы тестировали такой Telegram бот? Что изменить в нашем подходе?
