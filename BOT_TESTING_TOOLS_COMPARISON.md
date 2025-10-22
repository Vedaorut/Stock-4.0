# Сравнение инструментов тестирования для Telegram ботов (2024-2025)

## 1. E2E ТЕСТИРОВАНИЕ

### telegraf-test (РЕКОМЕНДУЕТСЯ)
```
Автор: официальная библиотека Telegraf
NPM: https://www.npmjs.com/package/telegraf-test
GitHub: https://github.com/telegraf/telegraf-test

Установка: npm install --save-dev telegraf-test

Преимущества:
+ Официальная поддержка
+ Встроенная поддержка Telegraf
+ Полная API совместимость
+ Актуально поддерживается (2024+)

Недостатки:
- Базовая функциональность
- Нужно много настраивать
- Документация скудная

Пример:
const TelegrafTest = require('telegraf-test');
const telegrafTest = new TelegrafTest();
await telegrafTest.sendMessage('Hello');
```

### Telegram Bot Testing Guide (ОФИЦИАЛЬНО)
```
Ссылка: https://core.telegram.org/bots/testing
Рекомендация: От самого Telegram

Особенности:
+ Официальная документация
+ Best practices от Telegram
+ Боевые примеры
+ Протестировано в production

Содержит:
- Тестирование через @BotFather
- Тестирование webhook callbacks
- Примеры обработки ошибок
```

### ntba (node-telegram-bot-api-test)
```
NPM: https://www.npmjs.com/package/ntba
Для: Общего Node.js Telegram API

Минусы:
- Не специализирован на Telegraf
- Менее актуален (2023)
- Хуже документирован
```

## 2. UNIT ТЕСТИРОВАНИЕ

### Jest (УСТАНОВЛЕН)
```
NPM: https://www.npmjs.com/package/jest
Версия: 29.7.0+ (уже в проекте)

Преимущества:
+ Встроен в проект
+ Полная функциональность
+ Отличная документация
+ Мощные mock'и

Документация: https://jestjs.io/docs/getting-started

Основные команды:
npm test
npm test -- --watch
npm test -- --coverage
npm test -- --bail
```

### Vitest (АЛЬТЕРНАТИВА)
```
NPM: https://www.npmjs.com/package/vitest
Версия: 0.34.0+ (2024)

Преимущества:
+ Быстрее Jest (для ESM)
+ Лучше поддержка TypeScript
+ Меньше конфигурации

Минусы:
- Молодой проект
- Меньше сообщества
- Могут быть баги

Рекомендация: Использовать Jest для стабильности
```

### Mocha + Chai (КЛАССИКА)
```
NPM: https://www.npmjs.com/package/mocha
      https://www.npmjs.com/package/chai

Минусы для нашего проекта:
- Требует больше конфигурации
- Jest удобнее для mock'ов
- Jest лучше интегрирован с async/await
```

## 3. MOCK'ИРОВАНИЕ HTTP

### axios-mock-adapter (РЕКОМЕНДУЕТСЯ)
```
NPM: https://www.npmjs.com/package/axios-mock-adapter
Версия: 1.21.0+

Преимущества:
+ Идеально для axios (используется в боте)
+ Простой API
+ Хорошо документирован
+ Активно развивается

Пример:
import MockAdapter from 'axios-mock-adapter';
const mock = new MockAdapter(api);
mock.onPost('/subscriptions').reply(201, { id: 1 });

Документация: https://github.com/ctimmerm/axios-mock-adapter
```

### nock (АЛЬТЕРНАТИВА)
```
NPM: https://www.npmjs.com/package/nock
Версия: 13.0.0+

Преимущества:
+ Работает с любыми HTTP клиентами
+ Перехватывает на уровне ОС
+ Очень мощный

Минусы:
- Сложнее в использовании
- Меньше совместимости с axios
- Нужно больше настраивать

Не рекомендуется для нашего проекта.
```

### MSW - Mock Service Worker
```
NPM: https://www.npmjs.com/package/msw
Версия: 1.3.0+ (2024)

Плюсы:
+ Работает и в Node.js, и в браузере
+ Перехватывает на уровне fetch API
+ Очень мощный

Минусы:
- Больше overhead
- Оverkill для простых mock'ов
- Сложнее настраивать

Для нашего проекта избыточен.
```

## 4. ВАЛИДАЦИЯ АДРЕСОВ

### crypto-address-validator (РЕКОМЕНДУЕТСЯ)
```
NPM: https://www.npmjs.com/package/crypto-address-validator
Версия: 0.1.0+

Преимущества:
+ Поддерживает все крипто адреса
+ Простой API
+ Современный пакет (2024)
+ Хорошо документирован

Поддерживает:
- Bitcoin (P2PKH, P2SH, Segwit)
- Ethereum (ERC-20)
- TON
- Litecoin
- Dogecoin
- И еще 50+ блокчейнов

Документация: https://github.com/cdecker/crypto-address-validator
```

### validator.js (АЛЬТЕРНАТИВА)
```
NPM: https://www.npmjs.com/package/validator
Версия: 13.9.0+

Преимущества:
+ Универсальная валидация
+ Много функций
+ Очень популярна

Минусы:
- Нет встроенной поддержки крипто
- Нужно писать свои regex'ы
- Сложнее интегрировать

Хорошо использовать вместе с crypto-address-validator
```

### bitcoinjs-lib (СПЕЦИАЛИЗИРОВАННАЯ)
```
NPM: https://www.npmjs.com/package/bitcoinjs-lib
GitHub: https://github.com/bitcoinjs/bitcoinjs-lib

Для: BTC адреса
Преимущества:
+ Супер точная валидация
+ Включает Bitcoin логику
+ Боевая практика

Минусы:
- Только для Bitcoin
- Большой размер пакета
- Оverkill для простой валидации
```

### web3.js (ДЛЯ ETHEREUM)
```
NPM: https://www.npmjs.com/package/web3
Версия: 4.x (2024)

Для: ETH и ERC-20 адреса
Преимущества:
+ Официальная библиотека
+ Очень мощная (может больше)
+ Поддержка контрактов

Минусы:
- Огромный размер (10MB+)
- Оverkill для простой валидации
- Медленнее

Рекомендуется только если нужна работа с блокчейном.
```

## 5. STATIC ANALYSIS & LINTING

### ESLint (БАЗОВЫЙ)
```
NPM: https://www.npmjs.com/package/eslint
Версия: 8.0.0+

Базовые правила:
- no-unused-vars
- prefer-const
- eqeqeq (строгое равенство)
- no-console (с исключениями)

Установка плагинов:
npm install --save-dev eslint-plugin-node
npm install --save-dev eslint-plugin-security
npm install --save-dev eslint-plugin-jest

Документация: https://eslint.org/docs/rules/
```

### SonarQube (ПРОФЕССИОНАЛЬНЫЙ)
```
NPM: https://www.npmjs.com/package/sonarqube-scanner
Для: Production-ready проектов

Возможности:
+ Code smells detection
+ Security vulnerabilities
+ Code complexity analysis
+ Дополнительные метрики

Минусы:
- Нужен SonarQube сервер
- Платная versioning (community бесплатная)
- Сложнее настраивать

Для нашего проекта - не нужна сейчас.
```

### Snyk (SECURITY)
```
NPM: https://www.npmjs.com/package/snyk
Для: Проверки уязвимостей

Преимущества:
+ Находит известные уязвимости
+ Автоматические исправления
+ Интеграция с GitHub

Документация: https://snyk.io/
```

## 6. INTEGRATION TESTING

### supertest (ДЛЯ BACKEND API)
```
NPM: https://www.npmjs.com/package/supertest
Для: Тестирования Express/Node API

Преимущества:
+ Идеально для тестирования Backend
+ Работает с любыми HTTP сервера
+ Простой API

Пример:
const request = require('supertest');
const app = require('./app');

describe('POST /api/orders', () => {
  it('should create order', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [1, 2] })
      .expect(201);
  });
});

Документация: https://github.com/visionmedia/supertest
```

### testcontainers (ДЛЯ DOCKER)
```
NPM: https://www.npmjs.com/package/testcontainers
Для: Тестирования с реальными контейнерами

Может использоваться:
+ Для тестирования с реальной БД
+ Для тестирования с реальным Redis
+ Для полной интеграции

Документация: https://www.testcontainers.org/modules/node/
```

## 7. E2E ТЕСТИРОВАНИЕ (АЛЬТЕРНАТИВЫ)

### Playwright (ДЛЯ FRONTEND)
```
NPM: https://www.npmjs.com/package/playwright
Для: Тестирования WebApp

Может использоваться:
+ Для E2E тестов Mini App
+ Для тестирования взаимодействия UI
+ Скриншоты и видео

Документация: https://playwright.dev/

Не подходит для: Тестирования Bot (нет браузера).
```

### Cypress (ДЛЯ FRONTEND)
```
NPM: https://www.npmjs.com/package/cypress
Для: UI тестирования

Минусы для нашего проекта:
- Не поддерживает Node.js окружение
- Нужен браузер
- Больше overhead'а

Рекомендуется для: WebApp тестирования (отдельно).
```

## 8. CI/CD ИНТЕГРАЦИЯ

### GitHub Actions (РЕКОМЕНДУЕТСЯ)
```
Цена: Бесплатно для open source
Преимущества:
+ Встроен в GitHub
+ Простой YAML синтаксис
+ Хороший документация
+ Бесплатный для 2000 минут/месяц

Пример workflow:
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test

Документация: https://docs.github.com/en/actions
```

### GitLab CI (АЛЬТЕРНАТИВА)
```
Цена: Бесплатно (400 минут/месяц)
Плюсы:
+ Встроен в GitLab
+ Мощнее GitHub Actions
+ Лучше для Docker

Минусы:
- Сложнее синтаксис
- Нам не подходит (используем GitHub)
```

### CircleCI
```
Цена: Бесплатно (6000 минут/месяц)
Плюсы:
+ Мощный
+ Хороший UI
+ Хорошая документация

Минусы:
- Требует отдельной регистрации
- Усложняет workflow
```

## 9. ПОКРЫТИЕ И МЕТРИКИ

### Jest Coverage Report
```
Встроенная функциональность:
npm test -- --coverage

Генерирует:
- Coverage summary
- LCOV report (для Codecov)
- HTML report
```

### Codecov (РЕКОМЕНДУЕТСЯ)
```
Цена: Бесплатно для open source
Интеграция: https://codecov.io/

Преимущества:
+ Визуальное отображение покрытия
+ История покрытия
+ Сравнение PR'ов
+ Интеграция с GitHub

Установка:
npx codecov --files coverage/lcov.info
```

### Coveralls (АЛЬТЕРНАТИВА)
```
Цена: Бесплатно
Сайт: https://coveralls.io/

Минусы:
- Мене популярен
- Хуже UI
- Старше проект
```

## 10. ДОКУМЕНТИРОВАННЫЕ СТАНДАРТЫ

### Jest Best Practices (ОФИЦИАЛЬНО)
```
https://jestjs.io/docs/timer-mocks
https://jestjs.io/docs/mock-functions
https://jestjs.io/docs/asynchronous

Содержит:
- Mock functions
- Async testing
- Timer mocking
- Snapshot testing
```

### Telegraf.js Documentation (ОФИЦИАЛЬНО)
```
https://telegraf.js.org/

Содержит:
- API reference
- Middleware examples
- Scene management
- Error handling
```

### Telegram Bot Testing Guide (ОФИЦИАЛЬНО)
```
https://core.telegram.org/bots/testing

От самого Telegram. Содержит:
- Как тестировать бота
- Webhook testing
- Обработка ошибок
- Production checklist
```

### OWASP Security Testing Guide
```
https://owasp.org/www-project-web-security-testing-guide/

Для проверки:
- Input validation
- SQL injection
- XSS protection
- CSRF tokens
```

## ИТОГОВЫЕ РЕКОМЕНДАЦИИ ДЛЯ STATUS STOCK BOT

### Обязательно установить:
1. jest (уже есть) - unit testing
2. telegraf-test - E2E bot testing
3. axios-mock-adapter - mock API
4. validator + crypto-address-validator - input validation
5. eslint + plugins - code quality
6. codecov - coverage tracking

### Обязательно настроить:
1. jest.config.js
2. .eslintrc.json
3. .github/workflows/test.yml
4. tests/ структура

### Не нужно сейчас:
1. TypeScript (можно потом)
2. Playwright/Cypress (только если добавят frontend тесты)
3. SonarQube (слишком сложно)
4. Docker testcontainers (пока рано)

### Целевое покрытие:
- Handlers: 80%+
- Validation: 95%+
- Utils: 85%+
- Overall: 70%+

### Timeline:
- День 1: Установка пакетов (30 мин)
- День 1-2: Написание first 5 tests (2 часа)
- День 2-3: Расширение до 20 tests (4 часа)
- День 3-4: Интеграция tests в CI/CD (2 часа)
- День 4+: Поддержание и расширение

