# План: Надёжная тестовая инфраструктура для Status Stock 4.0

## Анализ текущего состояния

### Backend тесты ✅
- **Статус**: Работают корректно
- **Инфраструктура**: Jest + ESM modules + Supertest
- **Конфигурация**: `backend/jest.config.js`, `env-setup.js`, `setup.js`
- **Окружение**: Использует production DB (`telegram_shop`) с тестовыми данными (telegram_id >= 9000000000)
- **Покрытие**: ~45 тестовых файлов

### Bot тесты ❌
- **Статус**: Частично падают
- **Основная проблема**: `api-mocks.js` не покрывает `/internal/auth/bot-register`
- **Инфраструктура**: Jest + axios-mock-adapter
- **Конфигурация**: `bot/jest.config.js`, `tests/setup.js`

### Проблемы

1. **api-mocks.js не покрывает bot-register endpoint**
   - Эндпоинт: `POST /internal/auth/bot-register`
   - Требует заголовки: `x-internal-secret`, `x-internal-timestamp`, `x-internal-signature`
   - Используется в `authApi.authenticate()` (`bot/src/utils/api.js:219`)
   - Падают тесты: `authMiddleware.test.js`, `auth.flow.test.js`

2. **Нет централизованных .env.test файлов**
   - Backend: hardcoded в `env-setup.js`
   - Bot: переменные устанавливаются в каждом тесте
   - INTERNAL_SECRET дублируется в разных тестах

3. **Production DB используется для тестов**
   - Риск случайного удаления production данных
   - Нет изоляции между dev и test окружениями
   - Миграции применяются к production DB

4. **Нет единой команды для запуска всех тестов**
   - Backend: `cd backend && npm test`
   - Bot: `cd bot && npm test`
   - Нет root-level команды

5. **Отсутствуют тесты для новых фич**
   - Session encryption (не найдено)
   - Logger masking (`maskString`) - логика есть, тестов нет

---

## Цели плана

1. ✅ Bot тесты должны проходить (fix api-mocks)
2. ✅ Тесты запускаются одной командой из корня
3. ✅ Добавить тесты для новых изменений (logger masking)
4. ✅ Документировать как запускать тесты
5. ✅ Рекомендации по test DB

---

## Этап 1: Исправить api-mocks.js (Bot тесты)

### 1.1. Добавить мок для `/internal/auth/bot-register`

**Файл**: `bot/tests/helpers/api-mocks.js`

**Текущий код** (строки 15-65):
```javascript
export function setupApiMocks(axiosInstance = axios) {
  const mock = new MockAdapter(axiosInstance);

  // Auth endpoints
  mock.onPost('/api/auth/login').reply(200, {
    token: testTokens.seller,
    user: testUsers.seller,
  });
  // ... остальные моки
```

**Что добавить** (после строки 24):
```javascript
  // Internal auth endpoint (bot-register)
  mock.onPost('/internal/auth/bot-register').reply((config) => {
    // Verify headers presence (simple check, not full validation)
    const hasSecret = config.headers['x-internal-secret'];
    const hasTimestamp = config.headers['x-internal-timestamp'];
    const hasSignature = config.headers['x-internal-signature'];

    if (!hasSecret || !hasTimestamp || !hasSignature) {
      return [401, { error: 'Missing required headers' }];
    }

    const body = JSON.parse(config.data || '{}');
    const { telegramId, username, firstName, lastName } = body;

    if (!telegramId) {
      return [400, { error: 'telegramId is required' }];
    }

    // Mock successful response
    return [
      200,
      {
        data: {
          token: 'jwt-bot-test-token',
          user: {
            id: 1,
            telegram_id: parseInt(telegramId, 10),
            username: username || 'testuser',
            first_name: firstName || 'Test',
            last_name: lastName || 'User',
            selected_role: 'seller',
            created_at: new Date().toISOString(),
          },
        },
      },
    ];
  });
```

### 1.2. Обновить фикстуры (опционально)

**Файл**: `bot/tests/fixtures/users.js`

Добавить моковый токен для bot-register:
```javascript
export const testTokens = {
  seller: 'mock-seller-token-xyz',
  buyer: 'mock-buyer-token-abc',
  botRegister: 'jwt-bot-test-token', // NEW
};
```

### 1.3. Добавить helper для bot-register мока

**Файл**: `bot/tests/helpers/commonMocks.js`

Добавить после `mockValidateCircular` (строка 55):
```javascript
/**
 * Mock internal bot-register endpoint
 * 
 * @param {MockAdapter} mock - axios-mock-adapter instance
 * @param {object} options - Mock options
 * @param {number} options.telegramId - Telegram user ID (default: 123456)
 * @param {string} options.username - Username (default: 'testuser')
 * @param {number} options.status - HTTP status code (default: 200)
 */
export function mockBotRegister(mock, options = {}) {
  const {
    telegramId = 123456,
    username = 'testuser',
    firstName = 'Test',
    lastName = 'User',
    status = 200,
  } = options;

  mock.onPost('/internal/auth/bot-register').reply(status, {
    data: {
      token: 'jwt-bot-test-token',
      user: {
        id: 1,
        telegram_id: telegramId,
        username,
        first_name: firstName,
        last_name: lastName,
        selected_role: 'seller',
        created_at: new Date().toISOString(),
      },
    },
  });
}
```

---

## Этап 2: Централизовать тестовые переменные окружения

### 2.1. Создать `.env.test` для backend

**Файл**: `backend/.env.test` (новый файл)

```bash
# Test Environment Variables
NODE_ENV=test

# JWT
JWT_SECRET=Fc9hpyCshV57FIM/zrqgpw6rtrUl0yFjvP8XVIK2Sa4=
JWT_EXPIRES_IN=7d

# Server
PORT=3001

# Database (отдельная test DB)
DATABASE_URL=postgresql://sile@localhost:5432/telegram_shop_test

# Telegram
TELEGRAM_BOT_TOKEN=test-bot-token

# Shop
SHOP_REGISTRATION_COST=25

# Crypto (test addresses)
CRYPTO_BTC_ADDRESS=bc1test123456789
CRYPTO_ETH_ADDRESS=0xtest1234567890abcdef
CRYPTO_USDT_ADDRESS=0xtest1234567890abcdef
CRYPTO_TON_ADDRESS=EQtest123456789

# Internal API
INTERNAL_SECRET=test-internal-secret-for-unit-tests
```

### 2.2. Обновить `env-setup.js` для использования .env.test

**Файл**: `backend/__tests__/env-setup.js`

**Текущий код** (строки 1-21):
```javascript
// Set test environment variables FIRST
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'Fc9hpyCshV57FIM/zrqgpw6rtrUl0yFjvP8XVIK2Sa4=';
// ... hardcoded values
```

**Новый код**:
```javascript
/**
 * Environment Setup - Runs FIRST before any imports
 * MUST run before config/env.js is loaded
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set NODE_ENV first
process.env.NODE_ENV = 'test';

// Load .env.test file
const envTestPath = join(__dirname, '..', '.env.test');
const result = dotenv.config({ path: envTestPath });

if (result.error) {
  // Fallback to hardcoded values if .env.test doesn't exist
  console.warn('⚠️  .env.test not found, using hardcoded test values');
  process.env.JWT_SECRET = 'Fc9hpyCshV57FIM/zrqgpw6rtrUl0yFjvP8XVIK2Sa4=';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.PORT = '3001';
  process.env.DATABASE_URL = 'postgresql://sile@localhost:5432/telegram_shop';
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  process.env.SHOP_REGISTRATION_COST = '25';
  process.env.CRYPTO_BTC_ADDRESS = 'bc1test123456789';
  process.env.CRYPTO_ETH_ADDRESS = '0xtest1234567890abcdef';
  process.env.CRYPTO_USDT_ADDRESS = '0xtest1234567890abcdef';
  process.env.CRYPTO_TON_ADDRESS = 'EQtest123456789';
  process.env.INTERNAL_SECRET = 'test-internal-secret';
}
```

### 2.3. Создать `.env.test` для bot

**Файл**: `bot/.env.test` (новый файл)

```bash
# Bot Test Environment
NODE_ENV=test

# Backend
BACKEND_URL=http://localhost:3000

# Telegram Bot
TELEGRAM_BOT_TOKEN=test-bot-token

# Internal API
INTERNAL_SECRET=test-internal-secret-for-unit-tests

# Redis (if needed)
REDIS_URL=redis://localhost:6379/1
```

### 2.4. Обновить bot test setup

**Файл**: `bot/tests/setup.js`

**Текущий код** (строки 1-27):
```javascript
/**
 * Jest Setup File
 */
import { jest } from '@jest/globals';
```

**Добавить в начало файла**:
```javascript
/**
 * Jest Setup File
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.test BEFORE imports
const envTestPath = join(__dirname, '..', '.env.test');
dotenv.config({ path: envTestPath });

import { jest } from '@jest/globals';
// ... rest of the file
```

---

## Этап 3: Создать отдельную test database

### 3.1. SQL скрипт для создания test DB

**Файл**: `database/create-test-db.sql` (новый файл)

```sql
-- Create test database
DROP DATABASE IF EXISTS telegram_shop_test;
CREATE DATABASE telegram_shop_test;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE telegram_shop_test TO sile;

-- Connect to test DB
\c telegram_shop_test;

-- Run migrations will be done via migrations.cjs
```

### 3.2. npm скрипт для создания test DB

**Файл**: `backend/package.json`

Добавить в `scripts`:
```json
{
  "scripts": {
    "db:test:create": "psql postgresql://sile@localhost:5432/postgres -f ../database/create-test-db.sql",
    "db:test:migrate": "DATABASE_URL=postgresql://sile@localhost:5432/telegram_shop_test node database/migrations.cjs --apply",
    "db:test:setup": "npm run db:test:create && npm run db:test:migrate",
    "db:test:reset": "npm run db:test:setup"
  }
}
```

### 3.3. Обновить .env.test для использования test DB

**Файл**: `backend/.env.test`

Изменить DATABASE_URL:
```bash
DATABASE_URL=postgresql://sile@localhost:5432/telegram_shop_test
```

---

## Этап 4: Единая команда для запуска всех тестов

### 4.1. Создать root package.json

**Файл**: `package.json` (корень проекта, новый файл)

```json
{
  "name": "telegram-shop-monorepo",
  "version": "1.0.0",
  "description": "Telegram E-Commerce Platform",
  "private": true,
  "scripts": {
    "test": "npm run test:backend && npm run test:bot",
    "test:backend": "cd backend && npm test",
    "test:bot": "cd bot && npm test",
    "test:coverage": "npm run test:coverage:backend && npm run test:coverage:bot",
    "test:coverage:backend": "cd backend && npm run test:coverage",
    "test:coverage:bot": "cd bot && npm run test:coverage",
    "test:watch": "echo 'Choose: npm run test:watch:backend OR npm run test:watch:bot'",
    "test:watch:backend": "cd backend && npm run test:watch",
    "test:watch:bot": "cd bot && npm run test:watch",
    "test:ci": "npm run test:ci:backend && npm run test:ci:bot",
    "test:ci:backend": "cd backend && npm run test:ci",
    "test:ci:bot": "cd bot && npm run test:ci",
    "install:all": "npm install && cd backend && npm install && cd ../bot && npm install && cd ../webapp && npm install",
    "lint": "npm run lint:backend && npm run lint:bot",
    "lint:backend": "cd backend && npm run lint:check",
    "lint:bot": "cd bot && npm run lint:check"
  }
}
```

### 4.2. Альтернатива: Использовать Makefile

**Файл**: `Makefile` (обновить существующий)

Добавить:
```makefile
# Testing
.PHONY: test test-backend test-bot test-coverage test-watch

test:
	@echo "🧪 Running all tests..."
	cd backend && npm test
	cd bot && npm test

test-backend:
	@echo "🧪 Running backend tests..."
	cd backend && npm test

test-bot:
	@echo "🧪 Running bot tests..."
	cd bot && npm test

test-coverage:
	@echo "📊 Running tests with coverage..."
	cd backend && npm run test:coverage
	cd bot && npm run test:coverage

test-watch:
	@echo "👀 Choose: make test-watch-backend OR make test-watch-bot"

test-watch-backend:
	cd backend && npm run test:watch

test-watch-bot:
	cd bot && npm run test:watch

test-ci:
	@echo "🚀 Running CI tests..."
	cd backend && npm run test:ci
	cd bot && npm run test:ci
```

---

## Этап 5: Тесты для новых фич (session encryption, logger masking)

### 5.1. Тесты для logger masking

**Файл**: `backend/__tests__/unit/helpers.test.js` (новый файл)

```javascript
/**
 * Helpers utility tests
 */

import { describe, it, expect } from '@jest/globals';
import { maskString } from '../../src/utils/helpers.js';

describe('Helpers utility functions', () => {
  describe('maskString', () => {
    it('should mask sensitive data correctly', () => {
      const secret = 'supersecretkey12345';
      const masked = maskString(secret, 4);
      
      expect(masked).toBe('supe**********2345');
      expect(masked).not.toContain('secret');
    });

    it('should handle short strings', () => {
      const short = 'abc';
      const masked = maskString(short, 4);
      
      // String is shorter than visibleChars * 2, return as-is
      expect(masked).toBe('abc');
    });

    it('should handle different visibleChars values', () => {
      const token = 'jwt-token-1234567890';
      
      const masked2 = maskString(token, 2);
      expect(masked2).toBe('jw**********90');
      
      const masked6 = maskString(token, 6);
      expect(masked6).toBe('jwt-to**567890');
    });

    it('should mask passwords in logger', () => {
      const password = 'MyPassword123!';
      const masked = maskString(password, 2);
      
      expect(masked).not.toContain('Password');
      expect(masked.startsWith('My')).toBe(true);
      expect(masked.endsWith('3!')).toBe(true);
    });

    it('should limit mask length to 10 characters', () => {
      const veryLong = 'a'.repeat(100);
      const masked = maskString(veryLong, 4);
      
      // Should have 4 + 10 + 4 = 18 characters
      expect(masked.length).toBe(18);
      expect(masked).toMatch(/^aaaa\*{10}aaaa$/);
    });

    it('should return original if null or undefined', () => {
      expect(maskString(null)).toBeNull();
      expect(maskString(undefined)).toBeUndefined();
      expect(maskString('')).toBe('');
    });
  });
});
```

### 5.2. Тесты для sensitiveDataLogger middleware

**Файл**: `backend/__tests__/unit/requestLogger.test.js` (новый файл)

```javascript
/**
 * Request logger middleware tests
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { sensitiveDataLogger } from '../../src/middleware/requestLogger.js';
import logger from '../../src/utils/logger.js';

describe('Request logger middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'POST',
      originalUrl: '/api/auth/login',
      path: '/api/auth/login',
      body: {},
      query: {},
      params: {},
      ip: '127.0.0.1',
      user: null,
    };

    res = {
      statusCode: 200,
      on: jest.fn(),
    };

    next = jest.fn();

    // Spy on logger
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sensitiveDataLogger', () => {
    it('should mask password field in request body', () => {
      req.body = {
        username: 'testuser',
        password: 'SuperSecret123!',
      };

      sensitiveDataLogger(req, res, next);

      expect(logger.debug).toHaveBeenCalled();
      const logCall = logger.debug.mock.calls[0];
      const loggedBody = logCall[1].body;

      expect(loggedBody.username).toBe('testuser');
      expect(loggedBody.password).not.toBe('SuperSecret123!');
      expect(loggedBody.password).toContain('**');
    });

    it('should mask token field', () => {
      req.body = {
        token: 'jwt-very-long-secret-token-12345',
      };

      sensitiveDataLogger(req, res, next);

      const logCall = logger.debug.mock.calls[0];
      const loggedBody = logCall[1].body;

      expect(loggedBody.token).not.toBe('jwt-very-long-secret-token-12345');
      expect(loggedBody.token).toContain('**');
    });

    it('should mask multiple sensitive fields', () => {
      req.body = {
        username: 'seller',
        password: 'Pass123',
        apiKey: 'api-key-12345',
        secret: 'my-secret',
        publicData: 'not-sensitive',
      };

      sensitiveDataLogger(req, res, next);

      const logCall = logger.debug.mock.calls[0];
      const loggedBody = logCall[1].body;

      expect(loggedBody.username).toBe('seller');
      expect(loggedBody.publicData).toBe('not-sensitive');
      expect(loggedBody.password).not.toBe('Pass123');
      expect(loggedBody.apiKey).not.toBe('api-key-12345');
      expect(loggedBody.secret).not.toBe('my-secret');
    });

    it('should not modify original request body', () => {
      const originalPassword = 'Secret123';
      req.body = { password: originalPassword };

      sensitiveDataLogger(req, res, next);

      // Original body should NOT be mutated
      expect(req.body.password).toBe(originalPassword);
    });

    it('should call next middleware', () => {
      sensitiveDataLogger(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should log warning on failed requests', () => {
      res.statusCode = 404;

      sensitiveDataLogger(req, res, next);

      // Trigger 'finish' event
      const finishCallback = res.on.mock.calls.find(
        (call) => call[0] === 'finish'
      )?.[1];
      
      if (finishCallback) {
        finishCallback();
        expect(logger.warn).toHaveBeenCalledWith(
          'Request failed',
          expect.objectContaining({ statusCode: 404 })
        );
      }
    });
  });
});
```

### 5.3. Тесты для session encryption (если реализовано)

**Примечание**: Session encryption не найдена в коде. Если планируется добавить - создать тест:

**Файл**: `backend/__tests__/unit/sessionEncryption.test.js` (если будет реализовано)

```javascript
/**
 * Session encryption tests (placeholder)
 */

import { describe, it, expect } from '@jest/globals';

describe('Session encryption', () => {
  it.skip('should encrypt session data', () => {
    // TODO: Implement when session encryption is added
  });

  it.skip('should decrypt session data', () => {
    // TODO: Implement when session encryption is added
  });
});
```

---

## Этап 6: Документация

### 6.1. Обновить README.md

**Файл**: `README.md`

Найти секцию "✅ Проверки перед деплоем" (строка 120) и обновить:

```markdown
### ✅ Тестирование

#### Быстрый старт - все тесты

```bash
# Из корня проекта - запустить все тесты (backend + bot)
npm test

# Или через Makefile
make test
```

#### Отдельно по сервисам

```bash
# Backend тесты
npm run test:backend
# или
cd backend && npm test

# Bot тесты
npm run test:bot
# или
cd bot && npm test
```

#### Тесты с покрытием

```bash
# Все сервисы
npm run test:coverage

# Только backend
cd backend && npm run test:coverage

# Только bot
cd bot && npm run test:coverage
```

#### Watch mode (для разработки)

```bash
# Backend
npm run test:watch:backend

# Bot
npm run test:watch:bot
```

#### CI тесты (с миграциями)

```bash
# Полный CI pipeline
npm run test:ci

# Отдельно
cd backend && npm run test:ci
cd bot && npm run test:ci
```

### 🗄️ Test Database Setup

Тесты используют отдельную БД `telegram_shop_test` для изоляции:

```bash
# Создать test database
cd backend && npm run db:test:create

# Применить миграции к test DB
npm run db:test:migrate

# Полная настройка (создание + миграции)
npm run db:test:setup

# Сбросить test DB
npm run db:test:reset
```

### ⚙️ Переменные окружения для тестов

Тесты используют `.env.test` файлы:
- `backend/.env.test` - переменные для backend тестов
- `bot/.env.test` - переменные для bot тестов

**Не коммитить** `.env.test` в git! Используйте `.env.test.example` как шаблон.

### 📝 Линтер

```bash
# Проверить весь проект
npm run lint

# Только backend
cd backend && npm run lint:check

# Только bot
cd bot && npm run lint:check

# Автофикс
cd backend && npm run lint
cd bot && npm run lint
```
```

### 6.2. Создать TESTING.md

**Файл**: `TESTING.md` (новый файл в корне проекта)

Полное содержание находится в отдельном документе (слишком большой для inline).

**Содержание:**
- Структура тестов
- Быстрый старт
- Запуск тестов
- Конфигурация тестов
- Переменные окружения
- Написание тестов (примеры)
- Best practices
- Troubleshooting
- CI/CD Integration
- Coverage Reports

---

## Этап 7: Рекомендации по test database

### Проблемы текущего подхода

1. **Shared production DB** (`telegram_shop`)
   - Тесты используют `telegram_id >= 9000000000` для изоляции
   - Риск случайного удаления production данных
   - Миграции применяются к production DB
   - Нет полной изоляции

2. **Нет автоматического cleanup**
   - Тестовые данные накапливаются
   - Нужна ручная очистка

### Рекомендации

#### Вариант 1: Отдельная test DB (РЕКОМЕНДУЕТСЯ)

**Преимущества:**
- Полная изоляция от production
- Безопасное применение миграций
- Автоматический cleanup (DROP DATABASE)
- Быстрее - можно использовать TRUNCATE вместо DELETE

**Реализация:**
1. Создать `telegram_shop_test` БД (см. Этап 3)
2. Обновить `DATABASE_URL` в `.env.test`
3. Применять миграции к test DB перед CI

**npm скрипты:**
```bash
npm run db:test:setup   # Создание + миграции
npm run db:test:reset   # Полный сброс
```

#### Вариант 2: In-memory SQLite (для быстрых unit тестов)

**Преимущества:**
- Очень быстро
- Не требует PostgreSQL
- Автоматический cleanup

**Недостатки:**
- Не полная совместимость с PostgreSQL
- Требует дополнительной конфигурации

#### Вариант 3: Docker test containers

**Преимущества:**
- Идеальная изоляция
- Можно запускать параллельно
- Работает в CI/CD

### Выбранная стратегия (для Status Stock)

**Hybrid подход:**

1. **Unit тесты** → Используют моки, не требуют DB
2. **Integration тесты** → Используют `telegram_shop_test` DB
3. **E2E тесты** → Используют `telegram_shop_test` DB

**Cleanup strategy:**
- `beforeAll`: Применить миграции
- `beforeEach`: Очистить тестовые данные (telegram_id >= 9000000000)
- `afterAll`: Опционально - DROP DATABASE

### Реализация cleanup helper

**Файл**: `backend/__tests__/helpers/dbCleanup.js` (новый файл)

```javascript
/**
 * Database cleanup helper for tests
 */

import pool from '../../src/config/database.js';

/**
 * Clean all test data (telegram_id >= 9000000000)
 */
export async function cleanTestData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Delete in correct order (respect foreign keys)
    await client.query('DELETE FROM synced_products WHERE id >= 9000000000');
    await client.query('DELETE FROM shop_follows WHERE id >= 9000000000');
    await client.query('DELETE FROM shop_workers WHERE id >= 9000000000');
    await client.query('DELETE FROM orders WHERE id >= 9000000000');
    await client.query('DELETE FROM products WHERE id >= 9000000000');
    await client.query('DELETE FROM shops WHERE id >= 9000000000');
    await client.query('DELETE FROM users WHERE telegram_id >= 9000000000');
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Truncate all tables (use with caution!)
 */
export async function truncateAllTables() {
  const client = await pool.connect();
  
  try {
    await client.query(`
      TRUNCATE TABLE
        synced_products,
        shop_follows,
        shop_workers,
        orders,
        products,
        shops,
        users
      RESTART IDENTITY CASCADE
    `);
  } finally {
    client.release();
  }
}
```

**Использование:**

```javascript
import { cleanTestData } from '../helpers/dbCleanup.js';

beforeEach(async () => {
  await cleanTestData();
});
```

---

## Критические файлы для реализации

### Backend

1. **backend/.env.test** - Тестовые переменные окружения
   - Причина: Централизация конфигурации, изоляция от production

2. **backend/__tests__/env-setup.js** - Загрузка .env.test
   - Причина: Автоматическая инициализация test окружения

3. **backend/__tests__/unit/helpers.test.js** - Тесты для maskString
   - Причина: Покрытие новой фичи logger masking

4. **backend/__tests__/unit/requestLogger.test.js** - Тесты для sensitiveDataLogger
   - Причина: Проверка маскирования sensitive полей

5. **backend/package.json** - npm скрипты для test DB
   - Причина: Упрощение работы с test database

### Bot

1. **bot/.env.test** - Тестовые переменные окружения
   - Причина: Централизация INTERNAL_SECRET и других переменных

2. **bot/tests/helpers/api-mocks.js** - Добавить мок для /internal/auth/bot-register
   - Причина: КРИТИЧНО - тесты падают без этого мока

3. **bot/tests/helpers/commonMocks.js** - Helper для bot-register
   - Причина: Удобная переиспользуемая функция для моков

4. **bot/tests/setup.js** - Загрузка .env.test
   - Причина: Автоматическая инициализация test окружения

### Root

1. **package.json** - Единая точка запуска тестов
   - Причина: `npm test` запускает все тесты из корня

2. **TESTING.md** - Документация по тестированию
   - Причина: Полное руководство для разработчиков

3. **README.md** - Обновление секции тестирования
   - Причина: Быстрый старт для новых разработчиков

### Database

1. **database/create-test-db.sql** - Скрипт создания test DB
   - Причина: Автоматизация создания изолированной БД

2. **backend/__tests__/helpers/dbCleanup.js** - Cleanup helper
   - Причина: Автоматическая очистка между тестами

---

## Приоритеты реализации

### High Priority (P0)

1. ✅ **Fix api-mocks.js** - bot тесты должны проходить
   - Файл: `bot/tests/helpers/api-mocks.js`
   - Время: 15 минут

2. ✅ **Единая команда запуска** - `npm test` из корня
   - Файл: `package.json` (root)
   - Время: 10 минут

### Medium Priority (P1)

3. ✅ **Централизовать .env.test** - backend + bot
   - Файлы: `backend/.env.test`, `bot/.env.test`
   - Время: 20 минут

4. ✅ **Документация TESTING.md**
   - Файл: `TESTING.md`
   - Время: 30 минут

### Low Priority (P2)

5. ✅ **Тесты для logger masking**
   - Файлы: `backend/__tests__/unit/helpers.test.js`, `requestLogger.test.js`
   - Время: 30 минут

6. ✅ **Test database setup**
   - Файлы: `database/create-test-db.sql`, `package.json` scripts
   - Время: 20 минут

---

## Ожидаемые результаты

После реализации плана:

1. ✅ **Bot тесты проходят** - 0 failed tests
2. ✅ **Единая команда** - `npm test` запускает backend + bot
3. ✅ **Изолированная test DB** - безопасное тестирование
4. ✅ **Покрытие новых фич** - maskString, sensitiveDataLogger
5. ✅ **Документация** - TESTING.md + обновлённый README
6. ✅ **CI-ready** - `npm run test:ci` для GitHub Actions

---

## Чеклист реализации

- [ ] **Этап 1**: Fix api-mocks.js
  - [ ] Добавить мок `/internal/auth/bot-register`
  - [ ] Добавить helper `mockBotRegister`
  - [ ] Обновить фикстуры

- [ ] **Этап 2**: Централизовать .env.test
  - [ ] Создать `backend/.env.test`
  - [ ] Создать `bot/.env.test`
  - [ ] Обновить `env-setup.js`
  - [ ] Обновить `bot/tests/setup.js`

- [ ] **Этап 3**: Test database
  - [ ] Создать `database/create-test-db.sql`
  - [ ] Добавить npm скрипты в `backend/package.json`
  - [ ] Создать cleanup helper
  - [ ] Обновить `DATABASE_URL` в `.env.test`

- [ ] **Этап 4**: Единая команда
  - [ ] Создать root `package.json`
  - [ ] Добавить test скрипты
  - [ ] Обновить Makefile (опционально)

- [ ] **Этап 5**: Тесты для новых фич
  - [ ] Создать `helpers.test.js`
  - [ ] Создать `requestLogger.test.js`
  - [ ] Запустить и проверить

- [ ] **Этап 6**: Документация
  - [ ] Создать `TESTING.md`
  - [ ] Обновить `README.md`
  - [ ] Добавить примеры использования

- [ ] **Верификация**
  - [ ] Запустить `npm test` - все проходит
  - [ ] Запустить `npm run test:coverage` - coverage > 50%
  - [ ] Проверить документацию - всё понятно

---

## Примечания

### Session encryption

В коде не найдена реализация session encryption. Если планируется добавить:
- Создать `src/utils/sessionEncryption.js`
- Добавить тесты `__tests__/unit/sessionEncryption.test.js`
- Использовать crypto.createCipheriv/createDecipheriv

### Production vs Test DB

**ВАЖНО**: Текущая стратегия (shared DB с `telegram_id >= 9000000000`) работает, но не идеальна. Рекомендуется мигрировать на отдельную test DB для:
- Безопасности
- Скорости (TRUNCATE вместо DELETE)
- Независимости от production схемы

### Coverage thresholds

Текущие пороги (50%) реалистичны для E-commerce платформы:
- Backend: много логики работы с БД
- Bot: много Telegram-специфичного кода

Можно постепенно повышать до 60-70% по мере добавления тестов.
