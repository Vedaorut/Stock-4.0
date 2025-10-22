# Практическое руководство: Внедрение тестирования в Status Stock Bot

## 1. БЫСТРЫЙ СТАРТ (30 минут)

### Установка пакетов
```bash
cd /Users/sile/Documents/Status\ Stock\ 4.0/bot

npm install --save-dev telegraf-test axios-mock-adapter sinon
npm install --save-dev eslint eslint-plugin-node eslint-plugin-security eslint-plugin-jest
npm install validator crypto-address-validator
```

### Создание jest.config.js
```javascript
export default {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/bot.js',
    '!src/utils/logger.js'
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  extensionsToTreatAsEsm: ['.js'],
  transform: {}
};
```

### Создание .eslintrc.json
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
  "rules": {
    "no-unused-vars": ["warn", {"argsIgnorePattern": "^_"}],
    "prefer-const": "warn",
    "eqeqeq": ["error", "always"]
  }
}
```

## 2. ОСНОВНЫЕ ПАКЕТЫ И IHRE USAGE

### Jest (Unit Testing)
- Status: УЖЕ установлен в проекте
- Использование: `npm test`
- Примеры: Юнит-тесты для handlers, validation

### telegraf-test
- Цель: E2E тестирование Telegram bot
- Установка: `npm install --save-dev telegraf-test`
- Пример использования в интеграционных тестах

### axios-mock-adapter
- Цель: Mock HTTP запросы к Backend API
- Установка: `npm install --save-dev axios-mock-adapter`
- Используется во всех API тестах

### validator.js & crypto-address-validator
- Цель: Валидация крипто-адресов
- Установка: `npm install validator crypto-address-validator`
- Поддержка: BTC, ETH, USDT, TON, и 50+ других

### ESLint Plugins
- eslint-plugin-security: Проверка безопасности кода
- eslint-plugin-node: Node.js best practices
- eslint-plugin-jest: Jest-специфичные правила

## 3. СТРУКТУРА ФАЙЛОВ

```
bot/
├── src/
│   ├── handlers/
│   ├── scenes/
│   ├── utils/
│   │   └── validation.js (НОВЫЙ)
│   └── bot.js
├── tests/
│   ├── unit/
│   │   ├── handlers.test.js
│   │   ├── validation.test.js
│   │   └── api.test.js
│   ├── integration/
│   │   ├── workflows.test.js
│   │   └── bot.integration.test.js
│   ├── fixtures/
│   │   ├── telegraf-contexts.js
│   │   └── api-mocks.js
│   └── setup.js
├── jest.config.js
├── .eslintrc.json
└── package.json (ОБНОВЛЕН с скриптами)
```

## 4. ВАЛИДАЦИЯ КРИПТО-АДРЕСОВ

### Реализация (src/utils/validation.js)

Bitcoin адреса:
- P2PKH: начинаются с 1, 26-34 символа
- P2SH: начинаются с 3, 26-34 символа  
- Segwit: начинаются с bc1, 39-59 символов

Ethereum адреса:
- Формат: 0x + 40 hex символов
- Case-insensitive

TON адреса:
- Формат: EQ или UQ + 46 base64url символов

### Тестовые данные
```javascript
// VALID addresses
{
  btc: {
    p2pkh: '1A1z7agoat2hSKkarjec3xeSPamPqbstV',
    p2sh: '3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy',
    segwit: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
  },
  eth: '0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1',
  ton: 'EQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ'
}
```

## 5. ПРИМЕРЫ ТЕСТОВ

### Unit Test: Validation
```javascript
import { validateCryptoAddress } from '../../src/utils/validation.js';

describe('Crypto Address Validation', () => {
  it('should validate BTC address', () => {
    const addr = '1A1z7agoat2hSKkarjec3xeSPamPqbstV';
    expect(validateCryptoAddress(addr, 'btc')).toBe(true);
  });
});
```

### Mock Test: API Call
```javascript
import MockAdapter from 'axios-mock-adapter';
import api from '../../src/utils/api.js';

let mock = new MockAdapter(api);
mock.onPost('/subscriptions').reply(201, { id: 1 });
```

### Telegraf Mock Context
```javascript
import { jest } from '@jest/globals';

function createMockContext() {
  return {
    from: { id: 123456, first_name: 'Test' },
    chat: { id: 123456, type: 'private' },
    reply: jest.fn().mockResolvedValue({}),
    answerCbQuery: jest.fn().mockResolvedValue({}),
    session: { userId: 123456, role: null }
  };
}
```

## 6. NPM SCRIPTS

Добавить в package.json:
```json
{
  "lint": "eslint src/ tests/ --fix",
  "lint:check": "eslint src/ tests/",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage",
  "test:unit": "jest tests/unit",
  "test:integration": "jest tests/integration"
}
```

## 7. ЗАПУСК ТЕСТОВ

```bash
npm test                    # Все тесты
npm run test:watch          # Watch mode
npm run test:coverage       # С покрытием
npm run test:unit           # Только unit
npm run lint:check          # Проверить код
npm run lint                # Исправить код
```

## 8. GITHUB ACTIONS (CI/CD)

Создать .github/workflows/test.yml

```yaml
name: Bot Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: cd bot && npm ci
      - run: cd bot && npm run lint:check
      - run: cd bot && npm run test:coverage
```

## 9. ANTI-PATTERNS ДЛЯ ПРОВЕРКИ

### Problem 1: Multiple answerCbQuery
```javascript
// WRONG:
await ctx.answerCbQuery('Loading');
const result = await api.call();
await ctx.answerCbQuery('Done');  // Ignored!

// RIGHT:
try {
  const result = await api.call();
  await ctx.answerCbQuery('Done', false);
} catch (error) {
  await ctx.answerCbQuery('Error', true);
}
```

### Problem 2: Context Getters Lost in Spread
```javascript
// WRONG:
const fakeCtx = { ...ctx };
console.log(fakeCtx.from);  // undefined!

// RIGHT:
const fakeCtx = {
  ...ctx,
  from: ctx.from,
  message: ctx.message,
  chat: ctx.chat,
  session: ctx.session
};
```

## 10. COVERAGE GOALS

- Overall: 70%+
- Handlers: 80%+
- Validation: 95%+
- Utils: 85%+
- Services: 75%+

## 11. РЕСУРСЫ

- Jest: https://jestjs.io/docs/getting-started
- Telegraf: https://telegraf.js.org/
- ESLint: https://eslint.org/
- Mock Adapter: https://github.com/ctimmerm/axios-mock-adapter
- Validator.js: https://github.com/validatorjs/validator.js

## 12. NEXT STEPS

1. Установить пакеты (15 минут)
2. Создать структуру и конфиги (15 минут)
3. Написать первые 5 unit тестов (30 минут)
4. Настроить GitHub Actions (15 минут)
5. Расширить тесты на все handlers (2 часа)
6. Добавить integration тесты (2 часа)
7. Достичь 70%+ покрытия (по мере разработки)

