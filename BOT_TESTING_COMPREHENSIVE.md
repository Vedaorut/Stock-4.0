# Исследование: Комплексные стандарты тестирования для Telegram ботов (Telegraf.js)
**Период исследования**: Октябрь 2024 - Январь 2025
**Версия документа**: 1.0
**Автор**: Claude Code Research Team

---

## SUMMARY

Проведено комплексное исследование инструментов и лучших практик для тестирования Telegram ботов на Telegraf.js. 

### Ключевые выводы:

1. **Jest + telegraf-test** - оптимальная комбинация для Status Stock Bot
2. **axios-mock-adapter** - лучший выбор для mock'ирования Backend API
3. **crypto-address-validator** - стандарт валидации крипто-адресов
4. **ESLint + плагины** - достаточно для static analysis
5. **GitHub Actions** - free и powerful для CI/CD

### Итоговые рекомендуемые пакеты:

```bash
# Unit & Integration Testing
npm install --save-dev jest@29.7.0 telegraf-test sinon

# HTTP Mocking
npm install --save-dev axios-mock-adapter

# Input Validation
npm install validator crypto-address-validator

# Code Quality
npm install --save-dev eslint eslint-plugin-node eslint-plugin-security eslint-plugin-jest

# CI/CD
# GitHub Actions (встроен в GitHub, бесплатно)
```

---

## 1. AUTOMATED TESTING TOOLS (2024-2025)

### Рекомендуемые инструменты:

#### Jest (Unit Testing) - УСТАНОВЛЕН В ПРОЕКТЕ
- **Версия**: 29.7.0+
- **Статус**: Встроен в проект
- **Документация**: https://jestjs.io/docs/getting-started
- **Возможности**:
  - Unit tests
  - Integration tests
  - Mock functions
  - Coverage reporting
  - Snapshot testing

#### telegraf-test (E2E Bot Testing) - ОФИЦИАЛЬНО РЕКОМЕНДУЕТСЯ
- **NPM**: https://www.npmjs.com/package/telegraf-test
- **GitHub**: https://github.com/telegraf/telegraf-test
- **Установка**: `npm install --save-dev telegraf-test`
- **Особенности**:
  - Официальная библиотека Telegraf
  - Полная совместимость с Telegraf API
  - Позволяет тестировать бот как черный ящик
  - Поддерживает callback queries, inline keyboards и т.д.

#### supertest (Backend API Integration) - ДЛЯ BACKEND
- **NPM**: https://www.npmjs.com/package/supertest
- **Для**: Тестирования REST API endpoints
- **Использование**: Не обязательно для бота, но полезно для тестирования Backend

### Альтернативные варианты (НЕ рекомендуются):

- **Mocha + Chai**: Требует больше конфигурации, Jest удобнее
- **Vitest**: Молодой проект, Jest стабильнее
- **ntba**: Не специализирован на Telegraf, устарел

---

## 2. MOCK & STUB STRATEGIES

### Рекомендуемые подходы:

#### Mock Telegraf Context
```javascript
// tests/fixtures/telegraf-contexts.js
export function createMockContext(overrides = {}) {
  return {
    from: { id: 123456, first_name: 'Test' },
    chat: { id: 123456, type: 'private' },
    message: { text: '/start', message_id: 1 },
    reply: jest.fn().mockResolvedValue({}),
    editMessageText: jest.fn().mockResolvedValue({}),
    answerCbQuery: jest.fn().mockResolvedValue({}),
    session: { userId: 123456, role: null, ...overrides.session },
    ...overrides
  };
}

export function createMockCallbackContext(overrides = {}) {
  return createMockContext({
    callbackQuery: { id: 'cb123', data: 'test_action' },
    ...overrides
  });
}
```

#### Mock HTTP Calls (axios)
```javascript
// tests/fixtures/api-mocks.js
import MockAdapter from 'axios-mock-adapter';
import api from '../../src/utils/api.js';

export function setupApiMocks() {
  const mock = new MockAdapter(api);
  mock.onPost('/subscriptions').reply(201, { id: 1 });
  mock.onPost('/auth/register').reply(200, { token: 'jwt_token' });
  return mock;
}

export function setupApiErrorMock(method, url, statusCode, error) {
  const mock = new MockAdapter(api);
  mock.onAny(new RegExp(url), method).reply(statusCode, { error });
  return mock;
}
```

#### Mock Database (Fixtures)
```javascript
// tests/fixtures/user-data.json
{
  "validBuyer": { "id": 123456, "username": "buyer", "role": "buyer" },
  "validSeller": { "id": 999999, "username": "seller", "role": "seller" }
}
```

---

## 3. INPUT VALIDATION STANDARDS

### Рекомендуемая библиотека: crypto-address-validator

```bash
npm install crypto-address-validator validator
```

### Поддерживаемые адреса:

#### Bitcoin (BTC)
- P2PKH: начинается с `1`, 26-34 символа
- P2SH: начинается с `3`, 26-34 символа
- Segwit: начинается с `bc1`, 39-59 символов

```javascript
const valid_p2pkh = '1A1z7agoat2hSKkarjec3xeSPamPqbstV';
const valid_p2sh = '3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy';
const valid_segwit = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
```

#### Ethereum (ETH) & USDT (ERC-20)
- Формат: `0x` + 40 hex символов
- Case-insensitive
- Опционально: EIP-55 checksum

```javascript
const valid_eth = '0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1';
const valid_eth_lower = '0x742d35cc6634c0532925a3b844bc7e7595f42be1'; // OK
```

#### TON
- Формат: `EQ` или `UQ` + 46 base64url символов
- Поддерживает non-bounceable адреса

```javascript
const valid_ton = 'EQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ';
const valid_ton_bounce = 'UQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_GZRQ';
```

### Реализация валидации

```javascript
// src/utils/validation.js
import validator from 'validator';

export function validateCryptoAddress(address, coin) {
  const validators = {
    btc: validateBTCAddress,
    eth: validateETHAddress,
    usdt: validateETHAddress,  // same as ETH
    ton: validateTONAddress
  };
  
  if (!validators[coin]) throw new Error(`Unknown coin: ${coin}`);
  return validators[coin](address);
}

// Регулярные выражения для быстрой валидации
const BTC_REGEX = {
  p2pkh: /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
  p2sh: /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
  segwit: /^bc1[a-z0-9]{39,59}$/
};

const ETH_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TON_REGEX = /^[EU]Q[A-Za-z0-9_-]{46}$/;
```

### Тестирование валидации

```javascript
// tests/unit/validation.test.js
describe('Crypto Address Validation', () => {
  describe('Bitcoin', () => {
    it('should validate P2PKH address', () => {
      expect(validateCryptoAddress('1A1z7agoat2hSKkarjec3xeSPamPqbstV', 'btc')).toBe(true);
    });
    
    it('should reject invalid address', () => {
      expect(validateCryptoAddress('invalid123', 'btc')).toBe(false);
    });
  });
  
  describe('Ethereum', () => {
    it('should validate ETH address', () => {
      expect(validateCryptoAddress('0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1', 'eth')).toBe(true);
    });
    
    it('should be case-insensitive', () => {
      const lower = '0x742d35cc6634c0532925a3b844bc7e7595f42be1';
      const upper = '0x742D35CC6634C0532925A3B844BC7E7595F42BE1';
      expect(validateCryptoAddress(lower, 'eth')).toBe(true);
      expect(validateCryptoAddress(upper, 'eth')).toBe(true);
    });
  });
});
```

---

## 4. BOT TESTING FRAMEWORKS

### Рекомендуемая структура

```
bot/
├── tests/
│   ├── unit/
│   │   ├── handlers.test.js      # Handler-specific tests
│   │   ├── validation.test.js    # Input validation tests
│   │   └── api.test.js           # API integration tests
│   ├── integration/
│   │   ├── workflows.test.js     # Full user workflows
│   │   └── bot.integration.test.js
│   ├── fixtures/
│   │   ├── telegraf-contexts.js  # Mock Telegraf context
│   │   ├── api-mocks.js          # Mock API calls
│   │   └── user-data.json        # Test data
│   └── setup.js                  # Jest configuration
├── jest.config.js
├── .eslintrc.json
└── package.json
```

### Типы тестов (Testing Pyramid)

```
         E2E Tests (5-10%)
           /        \
      Integration (20-30%)
        /            \
   Unit Tests (60-75%)
```

### Примеры тестов

#### Unit Test: Validation
```javascript
describe('Input Validation', () => {
  it('should validate BTC address', () => {
    expect(validateCryptoAddress(
      '1A1z7agoat2hSKkarjec3xeSPamPqbstV', 
      'btc'
    )).toBe(true);
  });
});
```

#### Unit Test: Handler
```javascript
describe('Start Handler', () => {
  it('should show role selection on /start', async () => {
    const ctx = createMockContext();
    await startHandler(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Choose your role'),
      expect.any(Object)
    );
  });
});
```

#### Integration Test: API Call
```javascript
describe('Subscription Handler', () => {
  it('should handle subscription error gracefully', async () => {
    const mock = setupApiErrorMock('POST', '/subscriptions', 409, 'Already subscribed');
    const ctx = createMockCallbackContext();
    
    await handleSubscribe(ctx, 1);
    
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      expect.stringContaining('already'),
      false
    );
  });
});
```

---

## 5. STATIC ANALYSIS & LINTING

### Рекомендуемая конфигурация

#### ESLint (.eslintrc.json)
```json
{
  "env": { "node": true, "es2021": true, "jest": true },
  "extends": [
    "eslint:recommended",
    "plugin:security/recommended",
    "plugin:node/recommended",
    "plugin:jest/recommended"
  ],
  "rules": {
    "no-unused-vars": ["warn", {"argsIgnorePattern": "^_"}],
    "prefer-const": "warn",
    "eqeqeq": ["error", "always"],
    "jest/no-focused-tests": "error"
  }
}
```

#### Установка плагинов
```bash
npm install --save-dev eslint eslint-plugin-node eslint-plugin-security eslint-plugin-jest
```

#### ESLint Rules для Telegraf

Критически важные правила:
- `no-unused-vars` - ловит ошибки опечатки
- `eqeqeq` - строгое сравнение (=== вместо ==)
- `jest/no-focused-tests` - не заливать .only() в production
- `security/detect-unsafe-regex` - регулярные выражения DoS

#### Запуск ESLint
```bash
npm run lint:check       # Проверить
npm run lint             # Исправить автоматически
```

### Альтернативы (не рекомендуются)

- **SonarQube**: Для enterprise проектов, слишком сложно сейчас
- **Snyk**: Для security scanning (можно добавить потом)
- **TypeScript**: Если добавится TypeScript версия

---

## 6. COMPREHENSIVE BEST PRACTICES

### Anti-Pattern 1: Multiple answerCbQuery

ПРОБЛЕМА: Telegram позволяет ответить на callback query ОДИН РАЗ

```javascript
// НЕПРАВИЛЬНО:
try {
  await ctx.answerCbQuery('Loading...');  // First call ✓
  const result = await api.call();
  await ctx.answerCbQuery('Success!');    // Second call ✗ IGNORED!
} catch (error) {
  await ctx.answerCbQuery('Error!');      // Won't work
}

// ПРАВИЛЬНО:
try {
  const result = await api.call();
  await ctx.answerCbQuery('✅ Success!', false);
} catch (error) {
  const msg = error.response?.data?.error || 'Unknown error';
  await ctx.answerCbQuery(`❌ ${msg}`, true);  // true = show alert
}
```

### Anti-Pattern 2: Lost Context Getters on Spread

ПРОБЛЕМА: `...ctx` не копирует getter'ы (from, message, chat)

```javascript
// НЕПРАВИЛЬНО:
const fakeCtx = { ...ctx };
console.log(fakeCtx.from);  // undefined! (getter не скопировался)

// ПРАВИЛЬНО:
const fakeCtx = {
  ...ctx,
  from: ctx.from,           // Explicitly copy getter values
  message: ctx.message,
  chat: ctx.chat,
  session: ctx.session
};
```

### Anti-Pattern 3: No Error Handling on API Calls

```javascript
// НЕПРАВИЛЬНО:
async function handleSubscribe(ctx) {
  await ctx.answerCbQuery();
  await api.subscribe(ctx.session.userId, shopId);  // No try-catch!
  await ctx.editMessageText('Subscribed!');
}

// ПРАВИЛЬНО:
async function handleSubscribe(ctx) {
  try {
    const result = await api.subscribe(ctx.session.userId, shopId);
    
    if (result.alreadySubscribed) {
      await ctx.answerCbQuery('ℹ️ Already subscribed', false);
    } else {
      await ctx.answerCbQuery('✅ Subscribed!', false);
    }
  } catch (error) {
    const msg = error.response?.data?.error || 'Subscription failed';
    await ctx.answerCbQuery(`❌ ${msg}`, true);
  }
}
```

### Best Practice 1: Error Parsing for UX

```javascript
// Парсить специфичные ошибки для лучшего UX
const errorMessages = {
  'Cannot subscribe to your own shop': '❌ Нельзя подписаться на свой магазин',
  'Already subscribed': 'ℹ️ Вы уже подписаны',
  'Shop not found': '❌ Магазин не найден',
  'Insufficient funds': '❌ Недостаточно средств'
};

try {
  // ...API call
} catch (error) {
  const errorMsg = error.response?.data?.error;
  const userMsg = errorMessages[errorMsg] || '❌ Ошибка. Попробуйте позже';
  await ctx.answerCbQuery(userMsg, true);
}
```

### Best Practice 2: Idempotency

```javascript
// /start должен быть идемпотентен
export async function startHandler(ctx) {
  // Сохранить существующую роль
  const existingRole = ctx.session.role;
  
  if (existingRole) {
    // Если роль уже выбрана, показать меню этой роли
    return showRoleMenu(ctx, existingRole);
  }
  
  // Иначе показать выбор ролей
  return showRoleSelection(ctx);
}
```

### Best Practice 3: Session Persistence

```javascript
// Убедиться что session правильно сохраняется
export async function selectRoleHandler(ctx) {
  const role = ctx.callbackQuery.data === 'role_buyer' ? 'buyer' : 'seller';
  
  // Сохранить в session
  ctx.session.role = role;
  ctx.session.selectedAt = Date.now();
  
  // При необходимости отправить на Backend
  await api.registerRole(ctx.session.userId, role, ctx.session.token);
  
  await ctx.answerCbQuery(`Role set to ${role}`, false);
}
```

---

## 7. CI/CD INTEGRATION

### GitHub Actions (Рекомендуется)

**Цена**: Бесплатно (2000 минут/месяц)
**Документация**: https://docs.github.com/en/actions

Создать `.github/workflows/test.yml`:

```yaml
name: Bot Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      
      - name: Install dependencies
        run: cd bot && npm ci
      
      - name: Lint
        run: cd bot && npm run lint:check
      
      - name: Tests
        run: cd bot && npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./bot/coverage/lcov.info
```

### NPM Scripts

```json
{
  "scripts": {
    "lint": "eslint src/ tests/ --fix",
    "lint:check": "eslint src/ tests/",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration"
  }
}
```

---

## 8. COVERAGE TARGETS

Рекомендуемые целевые показатели покрытия:

```
Component          Target    Why
─────────────────────────────────────────
Handlers           80%+      Критическая логика
Validation         95%+      Безопасность
Utilities          85%+      Повторное использование
Services           75%+      Интеграция
Overall            70%+      Минимум production-ready
```

Jest configuration для контроля:

```javascript
export default {
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    },
    './src/utils/validation.js': {
      branches: 95,
      functions: 95,
      lines: 95
    }
  }
};
```

---

## 9. OFFICIAL DOCUMENTATION & LINKS

### Официальные источники

1. **Jest Documentation**
   - https://jestjs.io/docs/getting-started
   - https://jestjs.io/docs/mock-functions
   - https://jestjs.io/docs/asynchronous

2. **Telegraf.js**
   - https://telegraf.js.org/ - Main docs
   - https://github.com/telegraf/telegraf - GitHub
   - https://telegraf.js.org/#/?id=middleware - Middleware docs

3. **Telegram Bot API**
   - https://core.telegram.org/bots/api - Official API reference
   - https://core.telegram.org/bots/testing - Testing guide
   - https://core.telegram.org/bots#testing-your-bot - Best practices

4. **Testing Libraries**
   - https://www.npmjs.com/package/telegraf-test - telegraf-test
   - https://www.npmjs.com/package/axios-mock-adapter - HTTP mocking
   - https://www.npmjs.com/package/crypto-address-validator - Crypto validation

5. **Security**
   - https://owasp.org/www-project-web-security-testing-guide/ - Security testing
   - https://eslint.org/docs/rules/security - Security rules
   - https://snyk.io/ - Vulnerability scanning

### Вспомогательные ресурсы

- **Node.js Best Practices**: https://github.com/goldbergyoni/nodebestpractices
- **Async/Await**: https://javascript.info/async-await
- **Testing Best Practices**: https://testingjavascript.com/

---

## 10. IMPLEMENTATION ROADMAP

### Фаза 1: Setup (1 день)
- Установка пакетов (30 мин)
- Создание jest.config.js и .eslintrc.json (15 мин)
- Создание структуры tests/ (15 мин)

### Фаза 2: First Tests (1-2 дня)
- Написание 5 unit тестов (2 часа)
- Валидация crypto адресов (1 час)
- Mock'ирование API (1 час)

### Фаза 3: Expansion (2-3 дня)
- Расширение до 20+ тестов
- Интеграционные тесты (workflows)
- Достижение 60%+ покрытия

### Фаза 4: CI/CD (1 день)
- Настройка GitHub Actions
- Codecov интеграция
- Pre-commit hooks (опционально)

### Фаза 5: Production (Ongoing)
- Поддержание тестов при разработке
- Расширение до 70%+ покрытия
- Документирование сценариев

---

## ФИНАЛЬНЫЕ РЕКОМЕНДАЦИИ

### Для Status Stock Bot

**Установить сейчас:**
```bash
npm install --save-dev telegraf-test axios-mock-adapter sinon \
  eslint eslint-plugin-node eslint-plugin-security eslint-plugin-jest

npm install validator crypto-address-validator
```

**Конфигурировать:**
1. jest.config.js
2. .eslintrc.json
3. tests/ структура
4. .github/workflows/test.yml
5. npm scripts в package.json

**Написать тесты по приоритету:**
1. Handlers (start, subscription, payment)
2. Валидация входов
3. API интеграция
4. Edge cases

**Целевые метрики:**
- Coverage: 70%+
- Tests: 20+ unit tests
- CI/CD: GitHub Actions автоматизация
- Quality: ESLint без ошибок

### Что пока не нужно:
- TypeScript (можно потом)
- Playwright/Cypress (для frontend)
- SonarQube (слишком сложно)
- Docker testcontainers (рано)

---

## CONCLUSION

Исследование показало, что **Jest + telegraf-test + axios-mock-adapter** образуют идеальный стек для тестирования Telegram ботов на Telegraf.js. Все инструменты:
- Хорошо документированы
- Активно поддерживаются (2024-2025)
- Имеют бесплатные версии
- Легко интегрируются в существующий проект

Рекомендуется начать внедрение с простых unit тестов (валидация, handlers) и постепенно расширяться.

---

**Документ подготовлен**: Claude Code Research Team
**Дата**: Декабрь 2024
**Версия**: 1.0 Final
**Статус**: Ready for Implementation

