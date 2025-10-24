# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Проект: Status Stock - Telegram E-Commerce Platform

Это платформа для создания цифровых магазинов в Telegram с поддержкой криптовалютных платежей (BTC, ETH, USDT, TON). Состоит из трёх основных сервисов: Backend API, Telegram Bot и WebApp (Mini App).

## Архитектура проекта

### Многосервисная структура (Multi-service monorepo)
```
.
├── backend/          # Node.js + Express REST API
├── bot/              # Telegram Bot (Telegraf.js)
├── webapp/           # React + Vite Mini App
└── docker-compose.yml
```

### Технологический стек

**Backend:**
- Express.js + PostgreSQL (прямые SQL запросы, без ORM)
- JWT authentication
- WebSocket для real-time уведомлений
- Криптовалютная верификация через blockchain APIs

**Bot:**
- Telegraf.js framework
- Session-based state management
- Интеграция с Backend API

**WebApp:**
- React 18 + Vite
- TailwindCSS (темная тема с оранжевыми акцентами)
- Framer Motion для анимаций
- Zustand для state (без persist - только in-memory!)
- Telegram WebApp SDK (@twa-dev/sdk)

**Infrastructure:**
- Docker Compose для оркестрации
- PostgreSQL 15 для БД
- Redis для кэширования
- Nginx для frontend

### База данных

**Важно:** Проект использует **чистый PostgreSQL** без ORM.

Основные таблицы:
- `users` - пользователи Telegram
- `shops` - магазины (seller = user с магазином)
- `products` - товары
- `orders` + `order_items` - заказы
- `payments` - крипто-платежи
- `shop_payments` - платежи за активацию магазина ($25)
- `subscriptions` - подписки покупателей на магазины

**Миграции:** `/backend/database/migrations.js`
**Schema:** `/backend/database/schema.sql`

## Основные команды

### NPM команды (рекомендуется для разработки)
```bash
# Быстрый старт
npm start                 # Backend + WebApp одновременно (concurrently)
npm run dev               # То же что npm start

# Отдельные сервисы
npm run dev:backend       # Только backend:3000
npm run dev:webapp        # Только webapp:5173
npm run bot               # Запустить бота

# Установка
npm run install:all       # Установить зависимости (root + backend + webapp + bot)
npm run clean             # Удалить все node_modules

# База данных
npm run db:migrate        # Выполнить миграции (backend/database/migrations.js)
npm run db:setup          # createdb + миграции

# Build
npm run build:webapp      # Production build webapp
```

### Makefile команды (альтернатива)
```bash
# Разработка
make setup                # env + dependencies
make install              # Зависимости всех сервисов
make dev                  # Все сервисы (Docker postgres + npm dev)
make dev-backend          # Только backend
make dev-bot              # Только bot
make dev-webapp           # Только webapp

# Docker
make build                # Docker images
make start                # Все сервисы через Docker Compose
make stop                 # Остановить
make logs                 # Логи всех сервисов
make status               # Статус контейнеров

# База данных
make migrate              # Миграции
make seed                 # Тестовые данные
make db-reset             # DROP + CREATE + migrate
make db-shell             # psql shell
make db-backup            # Бэкап в backups/

# Production
make prod-build           # Build
make prod-start           # Production режим
```

## Тестирование Bot (Integration Tests)

**Статус:** ✅ 100% integration tests passing (22/22)
**Локация:** `bot/tests/`

### Запуск тестов
```bash
cd bot
npm run test:integration        # Все integration тесты
npm run test:unit              # Unit тесты
npm test                       # Все тесты + coverage
```

### Структура тестов
```
bot/tests/
├── integration/              # Тесты user flows (ГЛАВНЫЕ!)
│   ├── addProduct.flow.test.js
│   ├── createShop.flow.test.js
│   ├── subscriptions.flow.test.js
│   └── ...
├── unit/                     # Тесты отдельных функций
├── helpers/                  # testBot.js, callsCaptor.js
└── fixtures/                 # Моковые данные
```

### Когда писать новые тесты

**ОБЯЗАТЕЛЬНО** при добавлении:
- Новых callback handlers (`bot.action(...)`)
- Wizard scenes (multi-step flows)
- API интеграций
- Валидаций данных

**Минимум для новой фичи:**
```javascript
it('happy path - основной сценарий работает', async () => {
  mock.onGet('/endpoint').reply(200, { data: mockData });
  await testBot.handleUpdate(callbackUpdate('new_button'));
  await new Promise(resolve => setImmediate(resolve)); // async delay

  const text = testBot.getLastReplyText();
  expect(text).toContain('Ожидаемый текст');
});

it('error case - API упал → показать ошибку', async () => {
  mock.onGet('/endpoint').reply(500);
  await testBot.handleUpdate(callbackUpdate('new_button'));
  await new Promise(resolve => setImmediate(resolve));

  const text = testBot.getLastReplyText();
  expect(text).toContain('Ошибка');
});
```

### Важные правила тестов

1. **Всегда импортировать реальный API instance:**
   ```javascript
   import { api } from '../../src/utils/api.js';  // ✅ ПРАВИЛЬНО
   mock = new MockAdapter(api);
   ```

2. **Добавлять delay после async операций:**
   ```javascript
   await testBot.handleUpdate(...);
   await new Promise(resolve => setImmediate(resolve)); // ✅ КРИТИЧНО!
   const text = testBot.getLastReplyText();
   ```

3. **Middleware order критичен** (уже настроен в testBot.js):
   ```
   session → mockSession → lastContext → captor → stage → handlers
   ```

4. **Mock API endpoints точно как в коде:**
   ```javascript
   // Если код делает: api.get('/products', { params: { shopId } })
   mock.onGet('/products').reply(200, { data: [] });  // ✅
   // НЕ: mock.onGet('/products/shop/123')  // ❌
   ```

### Troubleshooting

**Тест падает с `null` или `undefined`:**
- Добавь `await new Promise(resolve => setImmediate(resolve))` после `handleUpdate()`
- Проверь что mock endpoint совпадает с реальным API call

**"Cannot read properties of null":**
- Проверь middleware order в testBot.js
- Убедись что captor.reset() не вызывается слишком рано

**404 в тестах:**
- Mock endpoint не совпадает с реальным
- Проверь `bot/src/utils/api.js` какой endpoint используется

**Подробнее:** `bot/DIAGNOSTIC_REPORT.md`

## Важные правила разработки

### 1. State Management в WebApp
**КРИТИЧЕСКИ ВАЖНО:** WebApp НЕ использует localStorage/sessionStorage!
- Только in-memory state (React state, Zustand без persist)
- Все данные сохраняются через API вызовы
- При перезагрузке страницы состояние сбрасывается

### 2. База данных
- Используются **чистые SQL запросы**, НЕ ORM (pg библиотека напрямую)
- Миграции: `backend/database/migrations.js` (запускается через `npm run db:migrate` или `make migrate`)
- Schema: `backend/database/schema.sql` (определяет таблицы и индексы)
- Важно: при изменении схемы обновляй migrations.js И schema.sql

### 3. Криптовалютные платежи
- Верификация через blockchain APIs (Etherscan, blockchain.info, TONCenter)
- Поддержка: BTC, ETH, USDT (ERC-20), TON
- Все платежи проверяются асинхронно

### 4. Telegram Integration
- Bot использует Telegraf sessions для хранения состояния
- WebApp интегрируется через Telegram WebApp SDK
- Авторизация через `window.Telegram.WebApp.initData`

### 5. Дизайн-система
**Цвета:**
- `#0A0A0A` - основной фон
- `#1A1A1A` - карточки
- `#FF6B00` - primary orange
- `#FF8533` - light orange

**Эффекты:**
- Glassmorphism с backdrop-blur
- Touch-friendly (минимум 44px)
- Mobile-first подход

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login через Telegram Web App
- `GET /api/auth/profile` - Профиль пользователя

### Shops
- `POST /api/shops` - Создать магазин
- `GET /api/shops/my` - Мои магазины
- `GET /api/shops/:id` - Получить магазин
- `PUT /api/shops/:id` - Обновить магазин

### Products
- `POST /api/products` - Добавить товар
- `GET /api/products` - Список товаров
- `PUT /api/products/:id` - Обновить товар
- `DELETE /api/products/:id` - Удалить товар

### Orders
- `POST /api/orders` - Создать заказ
- `GET /api/orders/my` - Мои заказы
- `PUT /api/orders/:id/status` - Обновить статус

### Payments
- `POST /api/payments/verify` - Проверить крипто-платеж

## Environment Variables

### Backend (.env)
```env
PORT=3000
DATABASE_URL=postgresql://admin:password@localhost:5432/telegram_shop
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
TELEGRAM_BOT_TOKEN=your-bot-token
ETHERSCAN_API_KEY=your-etherscan-key
```

### Bot (.env)
```env
BOT_TOKEN=your-telegram-bot-token
BACKEND_URL=http://localhost:3000
WEBAPP_URL=https://your-domain.com
```

### WebApp (.env)
```env
VITE_API_URL=http://localhost:3000/api
```

## Структура кода

### Backend (`/backend/src/`)
- **server.js** - Express app + WebSocket сервер, точка входа
- **config/** - database.js (pg pool), env.js (переменные окружения)
- **routes/** - Express роуты для API endpoints (auth, shops, products, orders, payments, subscriptions)
- **controllers/** - Бизнес-логика обработки запросов
- **models/db.js** - SQL queries (прямые запросы к PostgreSQL)
- **middleware/** - auth.js (JWT), validation.js (express-validator), error.js
- **services/** - crypto.js (blockchain verification), telegram.js (Telegram API)
- **utils/** - logger.js (winston), constants.js

### Bot (`/bot/src/`)
- **bot.js** - Telegraf инициализация, регистрация handlers и scenes
- **handlers/** - start.js (роли), seller/ (управление магазином), buyer/ (покупки), common.js
- **scenes/** - createShop.js, addProduct.js, searchShop.js (Telegraf Scenes для многошаговых диалогов)
- **keyboards/** - seller.js, buyer.js (Telegram inline keyboards)
- **middleware/** - auth.js (регистрация пользователя через Backend API), error.js
- **utils/api.js** - axios клиент для Backend API

### WebApp (`/webapp/src/`)
- **App.jsx** - Главный компонент, роутинг страниц через activeTab
- **components/** - Layout/ (TabBar), Shop/, Product/, Cart/ (CartSheet), Payment/ (CryptoSelector, PaymentFlowManager)
- **pages/** - Subscriptions.jsx, Catalog.jsx, Settings.jsx
- **hooks/** - useApi.js (fetch wrapper), useTelegram.js (Telegram WebApp SDK)
- **store/useStore.js** - Zustand store (НЕ ПЕРСИСТЕНТНЫЙ, только in-memory!)
- **styles/globals.css** - TailwindCSS + кастомные стили
- **i18n/** - Мультиязычность (ru/en)

## Архитектурные особенности

### Backend
- **WebSocket сервер** интегрирован в server.js для real-time уведомлений
- **global.broadcastUpdate()** - функция для отправки обновлений всем WebSocket клиентам
- **Graceful shutdown** - обработка SIGTERM/SIGINT с закрытием соединений
- **Winston logger** - структурированное логирование (см. backend/src/utils/logger.js)
- **Rate limiting** - 100 req/15 min на /api/* endpoints

### Bot
- **Telegraf Scenes** - многошаговые диалоги (createShop, addProduct, searchShop)
- **Session middleware** - хранит состояние пользователя (роль, shopId, token)
- **Backend API интеграция** - все данные через axios calls к Backend API
- **Двойная авторизация** - auth middleware регистрирует пользователя и получает JWT

### WebApp
- **Telegram WebApp SDK** - интеграция через @twa-dev/sdk
- **Zustand store** - КРИТИЧНО: без persist, только in-memory state
- **Роутинг через state** - activeTab в store определяет текущую страницу
- **Framer Motion** - AnimatePresence для плавных переходов страниц
- **Payment flow** - многошаговый процесс (выбор крипты -> QR -> верификация)

## Security

- JWT аутентификация
- Rate limiting (100 req/15 min)
- Helmet.js security headers
- Input validation (express-validator)
- SQL injection protection
- CORS configuration
- Telegram Web App data verification

## Development Workflow

### Первый запуск
```bash
# 1. Установить зависимости
npm run install:all

# 2. Создать .env файлы (или make env)
cp backend/.env.example backend/.env
cp bot/.env.example bot/.env
cp webapp/.env.example webapp/.env
# Отредактируй .env файлы (BOT_TOKEN, JWT_SECRET, etc.)

# 3. Создать БД и выполнить миграции
npm run db:setup
# ИЛИ вручную:
# createdb telegram_shop
# npm run db:migrate

# 4. Запустить проект
npm start
```

### Ежедневная разработка
```bash
# Запустить backend + webapp
npm start

# В отдельном терминале запустить бота (опционально)
npm run bot

# URLs:
# - Backend API: http://localhost:3000
# - WebApp: http://localhost:5173
# - Health: http://localhost:3000/health
```

### Проверка логов после запуска
После запуска ВСЕГДА проверяй логи на ошибки:
- Backend: смотри вывод в терминале или `backend/logs/`
- Bot: смотри вывод или `bot/logs/`
- Docker: `make logs` или `docker-compose logs`

### Работа с БД
```bash
npm run db:migrate        # Выполнить миграции
make db-shell             # PostgreSQL shell (если через Docker)
make db-reset             # Сбросить и пересоздать (ОСТОРОЖНО!)
```

## Debugging

### Backend
- Логи: `backend/logs/` или `make logs-backend`
- Health check: `curl http://localhost:3000/health`
- PostgreSQL: `make db-shell`

### Bot
- Логи: `bot/logs/` или `make logs-bot`
- Telegram Bot API: https://core.telegram.org/bots/api

### WebApp
- Dev server: `http://localhost:5173`
- Telegram WebApp: `window.Telegram.WebApp`

## Production Deployment

```bash
make prod-build       # Build для production
make prod-start       # Запуск в production режиме
```

**Docker Compose** управляет:
- PostgreSQL (порт 5432)
- Backend API (порт 3000)
- Telegram Bot
- WebApp/Nginx (порт 80/443)
- Redis (порт 6379)
- pgAdmin (порт 5050, profile: dev)

## Полезные ссылки

- Main README: `/README.md`
- Backend docs: `/backend/README.md`
- Bot docs: `/bot/README.md`
- WebApp docs: `/webapp/README.md`
- API Examples: `/backend/API_EXAMPLES.md` (если существует)
- Database Schema: `/backend/database/schema.sql`

## Troubleshooting

### База данных
```bash
# Проверить подключение
psql -U admin -d telegram_shop

# Пересоздать БД (ОСТОРОЖНО - удалит данные!)
make db-reset

# Если миграции падают
npm run db:migrate
# Если не помогло - проверь backend/database/migrations.js
```

### Backend не стартует
- Проверь `backend/.env` (DATABASE_URL, JWT_SECRET)
- Проверь подключение к PostgreSQL
- Смотри логи: `backend/logs/error.log` или вывод в терминале
- Health check: `curl http://localhost:3000/health`

### Bot не работает
- Проверь `BOT_TOKEN` в `bot/.env`
- Проверь `BACKEND_URL` (должен быть доступен)
- Проверь логи: `bot/logs/` или терминал
- Тест Backend API: `curl http://localhost:3000/health`

### WebApp
- Проверь `VITE_API_URL` в `webapp/.env`
- CORS должен разрешать frontend URL в backend config
- Dev server: `http://localhost:5173`
- Telegram WebApp требует HTTPS для production

### Docker
```bash
make status           # Статус контейнеров
make logs             # Логи всех сервисов
make restart          # Перезапуск
docker-compose down -v && docker-compose up -d  # Полный рестарт
```

---

## Claude Code — Правила работы (ОБЯЗАТЕЛЬНО)

### Режим работы
- **PLAN MODE** по умолчанию → анализ через MCP FS (Read/Grep/Glob) → план → ExitPlanMode → ждать approval
- **IMPLEMENT** только после "APPROVED" → минимальные дiffs (точные файлы + строки)
- После реализации → проверка логов + тесты + отчёт

### Инструменты (MUST)
**MCP File System обязателен** для всех операций с файлами:
- `mcp__filesystem__read_text_file` - чтение файлов
- `mcp__filesystem__write_file` - запись (только после approval)
- `mcp__filesystem__edit_file` - редактирование (только после approval)
- `mcp__filesystem__search_files` - поиск файлов
- Grep/Glob - для поиска в коде

**Bash ограничен**:
- ✅ Разрешено: `npm run test:*`, `npm run dev`, проверка логов
- ✅ Разрешено: Read-only SQL (`psql -c "SELECT ..."`)
- ❌ Запрещено: Деструктивные команды, изменение .env

### Субагенты (проактивно использовать)
- **telegram-bot-expert** - Telegraf, handlers, scenes, keyboards
- **backend-architect** - API design, идемпотентность, endpoints
- **database-designer** - схема, миграции, индексы
- **frontend-developer** - React, TailwindCSS, Telegram Mini App
- **debug-master** - тесты, логи, SQL snapshots, debugging
- **Explorer** - глубокий анализ кода, web_search при необходимости

### Процесс (non-negotiable)
1. **Map code** через MCP FS → sequence diagrams → гипотезы → minimal patch plan (files+lines)
2. **Implement** минимальные diffs после approval
3. **Verify**: тесты ✅ + логи ✅ + SQL snapshots ✅
4. **Deliverables**: `PROJECT_AUDIT.md` + `DIFF_SUMMARY.md` + rollback plan

### Evidence (доказательства)
**Любое "fixed" требует подтверждения:**
- ✅ Зелёные тесты (юнит/интеграция/E2E)
- ✅ Релевантные логи без ошибок
- ✅ SQL-снимок (если затронута БД)
- ❌ Без доказательств = считать невыполненным

### UX Acceptance Criteria
- **Единая верхняя кнопка "Открыть приложение"** у обеих ролей всегда первой
- **Память роли**: /start идемпотентен; роль персистентна (БД); одна кнопка-тоггл для смены
- **Подписки**: upsert `(user_id, shop_id)`, явные сообщения (успех/уже подписан), мгновенное обновление markup
- **Buyer без магазина**: CTA "Создать магазин ($25)" → оплата → seller доступ

### Safety Rules
- ❌ НЕ редактировать `.env` и секреты
- ❌ НЕ ломать API контракты (backward compatible)
- ❌ НЕ деструктивные bash команды
- ✅ Минимальные diffs (точные строки)

---

## Telegraf.js — Критические особенности (ВАЖНО!)

### 1. Context геттеры НЕ копируются через spread
**Проблема**: `...ctx` НЕ копирует геттеры (`ctx.from`, `ctx.message`, `ctx.chat`)

```javascript
// ❌ НЕПРАВИЛЬНО
const fakeCtx = { ...ctx };
// fakeCtx.from = undefined (getter не скопировался!)

// ✅ ПРАВИЛЬНО
const fakeCtx = {
  ...ctx,
  from: ctx.from,        // Явно копируем значение геттера
  message: ctx.message,
  chat: ctx.chat,
  session: ctx.session
};
```

### 2. answerCbQuery() можно вызвать ОДИН РАЗ
**Проблема**: Telegram разрешает только один `answerCbQuery()` на callback query

```javascript
// ❌ НЕПРАВИЛЬНО - infinite spinner
await ctx.answerCbQuery('Loading...');  // ← First call
await api.doSomething();  // throws error
await ctx.answerCbQuery('Error');  // ← Ignored! Spinner не остановится

// ✅ ПРАВИЛЬНО
try {
  await api.doSomething();
  await ctx.answerCbQuery('Success!');  // ← Only one call
} catch (error) {
  await ctx.answerCbQuery('Error!');   // ← Only one call
}
```

### 3. Backend error parsing обязателен
**Проблема**: Generic errors не информативны для пользователя

```javascript
// ❌ НЕПРАВИЛЬНО
} catch (error) {
  await ctx.answerCbQuery('Ошибка');  // Что за ошибка?
}

// ✅ ПРАВИЛЬНО
} catch (error) {
  const errorMsg = error.response?.data?.error;

  if (errorMsg === 'Cannot subscribe to your own shop') {
    await ctx.answerCbQuery('❌ Нельзя подписаться на свой магазин');
  } else if (errorMsg === 'Already subscribed') {
    await ctx.answerCbQuery('ℹ️ Вы уже подписаны');
  } else {
    await ctx.answerCbQuery('❌ Ошибка подписки');
  }
}
```

### 4. Callback query vs Text command
**Различие**: `/start` это TEXT, кнопка это CALLBACK

```javascript
// Callback query (inline button click)
bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();           // ✅ Обязательно
  await ctx.editMessageText(...);      // ✅ Редактирует существующее сообщение
});

// Text command (/start)
bot.start(async (ctx) => {
  // await ctx.answerCbQuery();        // ❌ НЕТ callback query!
  await ctx.reply(...);                // ✅ Отправляет новое сообщение
});
```

### 5. fakeCtx для redirect из /start
**Когда нужно**: Перенаправить из `/start` в role handler (который ожидает callback query)

```javascript
// ✅ Полный fakeCtx шаблон
const fakeCtx = {
  ...ctx,
  from: ctx.from,          // CRITICAL: геттеры явно
  message: ctx.message,
  chat: ctx.chat,
  session: ctx.session,    // CRITICAL: сессия
  answerCbQuery: async () => {},  // Mock callback query
  editMessageText: async (text, keyboard) => {
    return await ctx.reply(text, keyboard);  // → reply вместо edit
  }
};
```

---

## Проверка логов — После любого запуска (MUST)

**После запуска ЛЮБОГО сервиса проверь логи:**

```bash
# Backend
tail -f backend/logs/combined.log
# Ищи: [error], [warn], "Failed", "Connection refused"

# Bot
tail -f bot/logs/bot.log
# Ищи: [error], "Error in handler", "Cannot read properties"

# Или через npm/make
npm run dev         # Смотри вывод в терминале
make logs-backend   # Docker logs
```

**Критерии здоровья**:
- ✅ Нет `[error]` после старта
- ✅ "Server started successfully" / "Bot started successfully"
- ✅ "Database connected" / "Database: Connected ✓"
- ❌ Если есть ошибки → НЕ ПРОДОЛЖАЙ, сначала исправь

---

## Если застрял
1. Используй **Explorer subagent** с `thorughness: very thorough`
2. Используй **WebSearch** для поиска решений
3. Верни краткий cited-summary в `PROJECT_AUDIT.md`
4. Продолжай по плану с найденным решением
- Cуб-агенты должны использовать mcp file system, для изучения поисков в интернете и кодовой базы используйте суб агента explorer.