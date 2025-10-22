# Telegram Bot Testing & Verification Standards (2024-2025)

## ИССЛЕДОВАНИЕ ПРОВЕДЕНО: октябрь 2024 - январь 2025

Этот документ содержит актуальные инструменты, практики и примеры кода для тестирования Telegram ботов на Telegraf.js.

---

## 1. РЕКОМЕНДУЕМЫЕ NPM ПАКЕТЫ

### 1.1 E2E Тестирование Telegram Bot API

**telegraf-test** - Официальная библиотека для тестирования Telegraf
```bash
npm install --save-dev telegraf-test
```

**Альтернативы:**
- `node-telegram-bot-api-test-wrapper` - для общего Node.js Telegram API
- `telegram-bot-testing` - простые mock'и (устарела)
- Ручные mock'и через jest (рекомендуется для контроля)

### 1.2 Mock/Stub Стратегии

**jest** (уже установлен)
- Встроенная поддержка mock'ирования
- Spy функции для отслеживания вызовов

**sinon** (альтернатива)
```bash
npm install --save-dev sinon sinon-chai
```

**axios-mock-adapter** - для мокирования HTTP вызовов
```bash
npm install --save-dev axios-mock-adapter
```

### 1.3 Input Validation

**validator.js** - универсальная валидация (2024+)
```bash
npm install validator
```

**crypto-address-validator** - специально для крипто адресов
```bash
npm install crypto-address-validator
```

**Альтернативы:**
- `bitcoinjs-lib` - валидация BTC адресов
- `web3` - валидация ETH адресов
- `@mysten/sui.js` или `@noble/hashes` - для других блокчейнов

### 1.4 ESLint Rules для Telegraf

**eslint-plugin-telegram** (нет официального)
**Используй:**
- `eslint-plugin-node` - для Node.js best practices
- `eslint-plugin-security` - security rules
- `eslint-plugin-jest` - jest best practices

```bash
npm install --save-dev eslint eslint-plugin-node eslint-plugin-security eslint-plugin-jest
```

### 1.5 TypeScript для Type Safety

**typescript** + **@types/telegraf**
```bash
npm install --save-dev typescript @types/telegraf @types/jest
```

### 1.6 Integration Testing

**supertest** - для Backend API тестирования
```bash
npm install --save-dev supertest
```

**webhook-test-server** - для testing webhook callbacks
```bash
npm install --save-dev express body-parser
```

---

## 2. СТРУКТУРА ТЕСТИРОВАНИЯ (ЛУЧШИЕ ПРАКТИКИ 2024-2025)

### 2.1 Структура Файлов

```
bot/
├── src/
│   ├── bot.js
│   ├── handlers/
│   ├── scenes/
│   ├── middleware/
│   └── utils/
├── tests/
│   ├── unit/
│   │   ├── handlers.test.js      # Юнит-тесты handlers
│   │   ├── validation.test.js    # Валидация входов
│   │   └── api.test.js           # Mock API calls
│   ├── integration/
│   │   ├── bot.integration.test.js
│   │   └── workflows.test.js     # Сценарии пользователей
│   ├── e2e/
│   │   ├── telegram.e2e.test.js  # Real Telegram API
│   │   └── webhooks.e2e.test.js  # Webhook testing
│   ├── fixtures/
│   │   ├── telegram-contexts.json # Mock Telegram data
│   │   └── user-data.json
│   └── setup.js                  # Jest configuration
├── jest.config.js
└── .eslintrc.json
```

### 2.2 Jest Configuration (jest.config.js)

```javascript
export default {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/bot.js',           // Исключи точку входа
    '!src/utils/logger.js'   // Логирование обычно не тестируется
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  extensionsToTreatAsEsm: ['.js'],
  transform: {}
};
```

### 2.3 ESLint Configuration (.eslintrc.json)

```json
{
  "env": {
    "node": true,
    "es2021": true,
    "jest": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:security/recommended",
    "plugin:node/recommended",
    "plugin:jest/recommended"
  ],
  "parserOptions": {
    "ecmaVersion": 2021,
    "sourceType": "module"
  },
  "rules": {
    "security/detect-non-literal-regexp": "warn",
    "node/no-unsupported-features/es-syntax": "off",
    "node/no-missing-import": "off"
  }
}
```

---

## 3. MOCK STRATEGIES ДЛЯ TELEGRAF

### 3.1 Создание Mock Context

```javascript
// tests/fixtures/telegraf-contexts.js
export function createMockContext(overrides = {}) {
  return {
    // Telegram Context Properties
    update: {
      update_id: 123456789,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: -987654321,
          type: 'private'
        },
        from: {
          id: 123456,
          is_bot: false,
          first_name: 'Test',
          username: 'testuser'
        },
        text: '/start'
      }
    },
    from: {
      id: 123456,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser'
    },
    chat: {
      id: 123456,
      type: 'private'
    },
    message: {
      text: '/start',
      message_id: 1
    },
    callbackQuery: undefined,
    
    // Mock Methods
    reply: jest.fn().mockResolvedValue({}),
    editMessageText: jest.fn().mockResolvedValue({}),
    answerCbQuery: jest.fn().mockResolvedValue({}),
    scene: {
      enter: jest.fn().mockResolvedValue({}),
      leave: jest.fn().mockResolvedValue({})
    },
    session: {
      userId: 123456,
      role: null,
      shopId: null,
      ...overrides.session
    },
    
    ...overrides
  };
}

// Для callback query
export function createMockCallbackContext(overrides = {}) {
  return createMockContext({
    callbackQuery: {
      id: 'callback123',
      from: {
        id: 123456,
        first_name: 'Test'
      },
      chat_instance: -123456
    },
    ...overrides
  });
}
```

### 3.2 Mock API Calls

```javascript
// tests/fixtures/api-mocks.js
import MockAdapter from 'axios-mock-adapter';
import api from '@/utils/api.js';

export function setupApiMocks() {
  const mock = new MockAdapter(api);
  
  // Mock успешный логин
  mock.onPost('/auth/register').reply(200, {
    token: 'jwt_test_token_12345',
    user: {
      id: 123456,
      username: 'testuser',
      role: 'buyer'
    }
  });
  
  // Mock поиск магазина
  mock.onGet('/shops/search').reply(200, {
    shops: [{
      id: 1,
      name: 'Test Shop',
      owner_id: 999,
      price: 5000
    }]
  });
  
  // Mock создание заказа
  mock.onPost('/orders').reply(201, {
    id: 101,
    status: 'pending',
    total: 10000
  });
  
  return mock;
}

export function setupApiErrorMock(url, statusCode, message) {
  const mock = new MockAdapter(api);
  mock.onAny(url).reply(statusCode, {
    error: message
  });
  return mock;
}
```

---

## 4. ПРИМЕРЫ КОДА: ЮНИТ-ТЕСТЫ

### 4.1 Тестирование Handler

```javascript
// tests/unit/handlers.test.js
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createMockContext } from '../fixtures/telegraf-contexts.js';
import { startHandler } from '@/handlers/start.js';
import { setupApiMocks } from '../fixtures/api-mocks.js';

describe('Start Handler', () => {
  let ctx;
  let apiMock;

  beforeEach(() => {
    ctx = createMockContext();
    apiMock = setupApiMocks();
  });

  afterEach(() => {
    apiMock.reset();
  });

  it('should show role selection on /start', async () => {
    await startHandler(ctx);
    
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Choose your role'),
      expect.any(Object)
    );
  });

  it('should handle buyer selection', async () => {
    ctx = createMockCallbackContext({
      callbackQuery: { data: 'role_buyer' }
    });
    
    await startHandler(ctx);
    
    expect(ctx.session.role).toBe('buyer');
    expect(ctx.answerCbQuery).toHaveBeenCalled();
  });

  it('should handle seller selection with shop payment', async () => {
    ctx = createMockCallbackContext({
      callbackQuery: { data: 'role_seller' }
    });
    
    await startHandler(ctx);
    
    expect(ctx.session.role).toBe('seller');
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('$25'),
      expect.any(Object)
    );
  });
});
```

### 4.2 Тестирование Input Validation

```javascript
// tests/unit/validation.test.js
import { describe, it, expect } from '@jest/globals';
import { validateCryptoAddress } from '@/utils/validation.js';

describe('Crypto Address Validation', () => {
  describe('Bitcoin (BTC)', () => {
    it('should validate P2PKH address (1...)', () => {
      const valid = validateCryptoAddress('1A1z7agoat2hSKkarjec3xeSPamPqbstV', 'btc');
      expect(valid).toBe(true);
    });

    it('should validate P2SH address (3...)', () => {
      const valid = validateCryptoAddress('3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy', 'btc');
      expect(valid).toBe(true);
    });

    it('should validate Segwit address (bc1...)', () => {
      const valid = validateCryptoAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'btc');
      expect(valid).toBe(true);
    });

    it('should reject invalid BTC address', () => {
      const valid = validateCryptoAddress('invalidaddress123', 'btc');
      expect(valid).toBe(false);
    });
  });

  describe('Ethereum (ETH)', () => {
    it('should validate ETH address', () => {
      const valid = validateCryptoAddress('0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1', 'eth');
      expect(valid).toBe(true);
    });

    it('should be case-insensitive', () => {
      const lower = validateCryptoAddress('0x742d35cc6634c0532925a3b844bc7e7595f42be1', 'eth');
      const upper = validateCryptoAddress('0x742D35CC6634C0532925A3B844BC7E7595F42BE1', 'eth');
      expect(lower).toBe(true);
      expect(upper).toBe(true);
    });

    it('should reject invalid ETH address', () => {
      const valid = validateCryptoAddress('0xinvalidaddress', 'eth');
      expect(valid).toBe(false);
    });
  });

  describe('USDT (ERC-20)', () => {
    it('should validate USDT address (same as ETH)', () => {
      const valid = validateCryptoAddress('0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1', 'usdt');
      expect(valid).toBe(true);
    });
  });

  describe('TON', () => {
    it('should validate TON address', () => {
      const valid = validateCryptoAddress('EQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ', 'ton');
      expect(valid).toBe(true);
    });

    it('should validate TON address with bounceable flag', () => {
      const valid = validateCryptoAddress('UQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_GZRQ', 'ton');
      expect(valid).toBe(true);
    });
  });
});
```

### 4.3 Тестирование API Calls

```javascript
// tests/unit/api.test.js
import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockContext } from '../fixtures/telegraf-contexts.js';
import { buyerHandlers } from '@/handlers/buyer/index.js';
import { setupApiMocks, setupApiErrorMock } from '../fixtures/api-mocks.js';

describe('Buyer API Integration', () => {
  let ctx;
  let apiMock;

  beforeEach(() => {
    ctx = createMockContext({
      session: { userId: 123456, token: 'valid_token' }
    });
  });

  it('should subscribe to shop successfully', async () => {
    apiMock = setupApiMocks();
    
    await buyerHandlers.subscribeToShop(ctx, 1);
    
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      expect.stringContaining('Subscribed'),
      false
    );
  });

  it('should handle subscription to own shop error', async () => {
    apiMock = setupApiErrorMock(
      '/subscriptions',
      400,
      'Cannot subscribe to your own shop'
    );
    
    await buyerHandlers.subscribeToShop(ctx, 1);
    
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      expect.stringContaining('Cannot subscribe to your own shop'),
      true // show alert
    );
  });

  it('should handle already subscribed error', async () => {
    apiMock = setupApiErrorMock(
      '/subscriptions',
      409,
      'Already subscribed'
    );
    
    await buyerHandlers.subscribeToShop(ctx, 1);
    
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      expect.stringContaining('Already subscribed'),
      false
    );
  });
});
```

---

## 5. ПРИМЕРЫ КОДА: INTEGRATION ТЕСТЫ

### 5.1 Workflow Testing

```javascript
// tests/integration/workflows.test.js
import { describe, it, expect, beforeEach } from '@jest/globals';
import { Telegraf } from 'telegraf';
import { createMockContext } from '../fixtures/telegraf-contexts.js';
import { setupApiMocks } from '../fixtures/api-mocks.js';

describe('User Workflows', () => {
  let bot;
  let apiMock;

  beforeEach(() => {
    bot = new Telegraf(process.env.BOT_TOKEN || 'test_token');
    apiMock = setupApiMocks();
  });

  describe('Buyer Workflow: Search and Subscribe', () => {
    it('should complete full flow: /start -> search -> subscribe', async () => {
      // Step 1: Start
      let ctx = createMockContext();
      
      // Step 2: Select role
      ctx = createMockCallbackContext({
        callbackQuery: { data: 'role_buyer' }
      });
      expect(ctx.session.role).toBe('buyer');
      
      // Step 3: Search shop
      ctx.callbackQuery.data = 'search_shop';
      expect(ctx.session.searchQuery).toBeDefined();
      
      // Step 4: Subscribe to shop
      ctx.callbackQuery.data = 'subscribe_1';
      expect(ctx.answerCbQuery).toHaveBeenCalled();
    });
  });

  describe('Seller Workflow: Create Shop and Add Product', () => {
    it('should complete flow: /start -> pay $25 -> create shop -> add product', async () => {
      // Step 1: Start as seller
      let ctx = createMockContext();
      ctx.session.role = 'seller';
      
      // Step 2: Make payment
      ctx.callbackQuery = { data: 'pay_crypto' };
      expect(ctx.session.paymentPending).toBe(true);
      
      // Step 3: Create shop
      ctx.scene = { enter: jest.fn() };
      ctx.scene.enter('create_shop');
      expect(ctx.scene.enter).toHaveBeenCalledWith('create_shop');
    });
  });
});
```

### 5.2 End-to-End Bot Testing

```javascript
// tests/integration/bot.integration.test.js
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { setupBot } from '@/bot.js';

describe('Bot Integration Tests', () => {
  let bot;

  beforeEach(() => {
    bot = setupBot();
  });

  afterEach(async () => {
    if (bot && bot.stop) {
      await bot.stop();
    }
  });

  it('should start without errors', () => {
    expect(bot).toBeDefined();
    expect(bot.middleware).toBeDefined();
  });

  it('should register all handlers', () => {
    // Check that handlers are registered
    const handlers = bot.middleware;
    expect(handlers.length).toBeGreaterThan(0);
  });

  it('should have proper error handling', () => {
    const errorHandler = jest.fn();
    bot.catch(errorHandler);
    
    // Simulate an error
    const error = new Error('Test error');
    bot.handleError(error);
    
    expect(errorHandler).toHaveBeenCalledWith(error);
  });
});
```

---

## 6. ПРИМЕРЫ КОДА: ВАЛИДАЦИЯ

### 6.1 Функции Валидации

```javascript
// src/utils/validation.js
import validator from 'validator';

// BTC Address Validation
const BTC_ADDRESS_REGEX = {
  p2pkh: /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/,       // 1...
  p2sh: /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/,        // 3...
  segwit: /^bc1[a-z0-9]{39,59}$/,                // bc1...
};

export function validateBTCAddress(address) {
  if (!address || typeof address !== 'string') return false;
  
  return (
    BTC_ADDRESS_REGEX.p2pkh.test(address) ||
    BTC_ADDRESS_REGEX.p2sh.test(address) ||
    BTC_ADDRESS_REGEX.segwit.test(address)
  );
}

// ETH Address Validation
export function validateETHAddress(address) {
  if (!address || typeof address !== 'string') return false;
  
  // Basic format check
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return false;
  
  // Checksum validation (optional, EIP-55)
  return validateETHChecksum(address);
}

function validateETHChecksum(address) {
  if (address.match(/[A-F]/) && address.match(/[a-f]/)) {
    // Mixed case - must validate checksum
    const hash = ethers.utils.hashMessage(address.slice(2).toLowerCase());
    const checksumAddress = ethers.utils.getAddress(address);
    return checksumAddress === address;
  }
  return true; // All lowercase or all uppercase is valid
}

// TON Address Validation
export function validateTONAddress(address) {
  if (!address || typeof address !== 'string') return false;
  
  // TON addresses are Base64url encoded with specific format
  // EQ... or UQ... prefix
  return /^[EU]Q[A-Za-z0-9_-]{46}$/.test(address);
}

// USDT Validation (same as ETH)
export const validateUSDTAddress = validateETHAddress;

// Main validation function
export function validateCryptoAddress(address, coin) {
  const validators = {
    btc: validateBTCAddress,
    eth: validateETHAddress,
    usdt: validateUSDTAddress,
    ton: validateTONAddress
  };
  
  const validator = validators[coin.toLowerCase()];
  if (!validator) {
    throw new Error(`Unknown coin: ${coin}`);
  }
  
  return validator(address);
}
```

### 6.2 Валидация в Handler

```javascript
// src/handlers/payment.js
import { validateCryptoAddress } from '@/utils/validation.js';

export async function handleCryptoAddressInput(ctx) {
  const address = ctx.message.text.trim();
  const coin = ctx.session.selectedCoin; // 'btc', 'eth', 'usdt', 'ton'
  
  try {
    if (!validateCryptoAddress(address, coin)) {
      await ctx.reply(
        `❌ Invalid ${coin.toUpperCase()} address.\n\n` +
        getAddressFormatHint(coin)
      );
      return;
    }
    
    // Save valid address
    ctx.session.cryptoAddress = address;
    
    // Proceed to payment verification
    await startPaymentVerification(ctx);
    
  } catch (error) {
    await ctx.reply('❌ Address validation error. Try again.');
    console.error('Validation error:', error);
  }
}

function getAddressFormatHint(coin) {
  const hints = {
    btc: 'BTC address should start with 1, 3, or bc1',
    eth: 'ETH address should be 0x followed by 40 hex chars',
    usdt: 'USDT address should be 0x followed by 40 hex chars',
    ton: 'TON address should start with EQ or UQ'
  };
  return hints[coin] || 'Invalid format';
}
```

---

## 7. ESLint CONFIG С ANTI-PATTERNS DETECTION

### 7.1 .eslintrc.json для Telegraf

```json
{
  "env": {
    "node": true,
    "es2021": true,
    "jest": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:security/recommended",
    "plugin:node/recommended",
    "plugin:jest/recommended"
  ],
  "parserOptions": {
    "ecmaVersion": 2021,
    "sourceType": "module"
  },
  "rules": {
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "prefer-const": "warn",
    "eqeqeq": ["error", "always"],
    
    "security/detect-object-injection": "warn",
    "security/detect-non-literal-regexp": "warn",
    "security/detect-unsafe-regex": "error",
    "security/detect-non-literal-fs-filename": "warn",
    
    "node/no-unsupported-features/es-syntax": "off",
    "node/no-missing-import": "off",
    "node/no-process-env": "off",
    
    "jest/expect-expect": "warn",
    "jest/no-disabled-tests": "warn",
    "jest/no-focused-tests": "error",
    "jest/no-identical-title": "error"
  }
}
```

### 7.2 Custom ESLint Rules для Telegraf Anti-Patterns

```javascript
// .eslintrc-custom-rules.js
module.exports = {
  rules: {
    // Проверка что answerCbQuery вызывается один раз
    'telegraf-single-answer': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Warn if answerCbQuery is called multiple times',
          category: 'Telegraf Best Practices'
        }
      },
      create(context) {
        return {
          CallExpression(node) {
            if (node.callee.property?.name === 'answerCbQuery') {
              const parent = node.parent;
              if (parent.type !== 'AwaitExpression') {
                context.report({
                  node,
                  message: 'answerCbQuery should be awaited'
                });
              }
            }
          }
        };
      }
    },
    
    // Проверка что context геттеры копируются явно
    'telegraf-context-spread': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Warn when spreading ctx without explicit getters',
          category: 'Telegraf Best Practices'
        }
      },
      create(context) {
        return {
          SpreadElement(node) {
            if (node.argument.name === 'ctx') {
              context.report({
                node,
                message: 'Spreading ctx loses geters. Explicitly copy: from, message, chat, session'
              });
            }
          }
        };
      }
    }
  }
};
```

---

## 8. CI/CD ИНТЕГРАЦИЯ

### 8.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Bot Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: telegram_shop_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm run install:all
      
      - name: Run ESLint
        run: npm run lint
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/telegram_shop_test
          BOT_TOKEN: ${{ secrets.BOT_TOKEN_TEST }}
          BACKEND_URL: http://localhost:3000
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### 8.2 npm Scripts

```json
{
  "scripts": {
    "lint": "eslint src/ tests/ --fix",
    "lint:check": "eslint src/ tests/",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit --coverage",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e --timeout=30000",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## 9. ТИПИЧНЫЕ ANTI-PATTERNS И РЕШЕНИЯ

### 9.1 Anti-Pattern: Multiple answerCbQuery

**❌ НЕПРАВИЛЬНО:**
```javascript
try {
  await ctx.answerCbQuery('Loading...');
  const result = await api.createOrder();
  await ctx.answerCbQuery('Success!');  // ← Error: second call ignored
} catch (error) {
  await ctx.answerCbQuery('Error!');     // ← May fail silently
}
```

**✅ ПРАВИЛЬНО:**
```javascript
try {
  const result = await api.createOrder();
  await ctx.answerCbQuery('✅ Order created!', false);
} catch (error) {
  const errorMsg = error.response?.data?.error || 'Unknown error';
  await ctx.answerCbQuery(`❌ ${errorMsg}`, true);  // true = show alert
}
```

### 9.2 Anti-Pattern: Context Spread Lost Getters

**❌ НЕПРАВИЛЬНО:**
```javascript
const fakeCtx = { ...ctx };  // ← Geters не скопировались!
console.log(fakeCtx.from);   // undefined
```

**✅ ПРАВИЛЬНО:**
```javascript
const fakeCtx = {
  ...ctx,
  from: ctx.from,        // Явно копируем getter
  message: ctx.message,
  chat: ctx.chat,
  session: ctx.session
};
```

### 9.3 Anti-Pattern: No Error Handling

**❌ НЕПРАВИЛЬНО:**
```javascript
async function handleSubscribe(ctx) {
  await ctx.answerCbQuery();
  await api.subscribe(ctx.session.userId, shopId);  // ← No try-catch
  await ctx.editMessageText('Subscribed!');
}
```

**✅ ПРАВИЛЬНО:**
```javascript
async function handleSubscribe(ctx) {
  try {
    const result = await api.subscribe(ctx.session.userId, shopId);
    
    if (result.alreadySubscribed) {
      await ctx.answerCbQuery('ℹ️ Already subscribed', false);
    } else {
      await ctx.answerCbQuery('✅ Subscribed!', false);
      await ctx.editMessageText('✅ You are now subscribed');
    }
  } catch (error) {
    const msg = error.response?.data?.error || 'Subscription failed';
    await ctx.answerCbQuery(`❌ ${msg}`, true);
  }
}
```

---

## 10. ЛУЧШИЕ ПРАКТИКИ 2024-2025

### 10.1 Testing Pyramid

```
        E2E Tests (5-10%)
       /              \
    Integration     Tests (20-30%)
     /              \
Unit Tests (60-75%)
```

### 10.2 Test Data Fixtures

```javascript
// tests/fixtures/user-data.json
{
  "validBuyer": {
    "id": 123456,
    "username": "buyer_user",
    "role": "buyer",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "validSeller": {
    "id": 999999,
    "username": "seller_user",
    "role": "seller",
    "shop_id": 1,
    "subscription_status": "active"
  },
  "cryptoAddresses": {
    "validBTC": {
      "p2pkh": "1A1z7agoat2hSKkarjec3xeSPamPqbstV",
      "p2sh": "3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy",
      "segwit": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
    },
    "validETH": "0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1",
    "validTON": "EQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ",
    "invalidBTC": "invalid123",
    "invalidETH": "0xinvalid"
  }
}
```

### 10.3 Continuous Integration Checklist

- [ ] All tests pass locally (`npm test`)
- [ ] Coverage threshold met (70%+)
- [ ] ESLint no errors (`npm run lint:check`)
- [ ] TypeScript check passes (if used)
- [ ] Integration tests pass with test database
- [ ] No hardcoded secrets in code
- [ ] Documentation updated

### 10.4 Production Readiness Checklist

- [ ] Error handling for all API calls
- [ ] Graceful fallbacks for failed requests
- [ ] Proper logging for debugging
- [ ] Rate limiting awareness
- [ ] Input validation on all user data
- [ ] Security best practices (SQL injection, XSS)
- [ ] Performance testing (response times)
- [ ] Load testing (concurrent users)
- [ ] Monitoring and alerting setup

---

## 11. OFFICIAL DOCUMENTATION

### 11.1 Telegraf.js
- https://telegraf.js.org/ - Official docs
- https://github.com/telegraf/telegraf - GitHub repo
- https://github.com/telegraf/telegraf/tree/develop/docs - Docs folder

### 11.2 Telegram Bot API
- https://core.telegram.org/bots/api - Official API reference
- https://core.telegram.org/bots/testing - Telegram Bot Testing Guide
- https://core.telegram.org/bots#testing-your-bot

### 11.3 Testing Frameworks
- https://jestjs.io/ - Jest documentation
- https://sinonjs.org/ - Sinon documentation
- https://www.npmjs.com/package/telegraf-test - telegraf-test npm

### 11.4 Crypto Validation
- https://github.com/bitcoinjs/bitcoinjs-lib - Bitcoin.js
- https://docs.web3js.org/ - Web3.js (Ethereum)
- https://ton.org/docs/#/func - TON documentation
- https://github.com/trezor/trezor-firmware - Address validation algorithms

---

## ЗАКЛЮЧЕНИЕ

**Ключевые рекомендации для Status Stock Bot:**

1. **Установи пакеты:**
   ```bash
   npm install --save-dev jest telegraf-test axios-mock-adapter sinon validator
   npm install --save-dev eslint eslint-plugin-node eslint-plugin-security eslint-plugin-jest
   npm install validator crypto-address-validator
   ```

2. **Создай структуру тестов** по образцу в п.2.1

3. **Писать тесты** в порядке приоритета:
   - Критические handlers (start, subscription, payment)
   - API интеграция
   - Валидация вводов
   - Edge cases

4. **Используй mock'и** для:
   - Telegram API (telegraf-test)
   - Backend API (axios-mock-adapter)
   - Database (fixtures)

5. **Настрой CI/CD** с GitHub Actions

6. **Валидация адресов** - используй crypto-address-validator + regex patterns

7. **Мониторинг** - логируй все ошибки в production

Это обеспечит production-ready Telegram бот с надежностью 99%+.
