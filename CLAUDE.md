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

Проект использует **Makefile** для управления всеми операциями:

### Разработка
```bash
make setup                 # Полная установка (env + dependencies)
make install              # Установить зависимости во всех сервисах
make dev                  # Запустить всё в dev режиме
make dev-backend          # Только backend
make dev-bot              # Только bot
make dev-webapp           # Только webapp
```

### Docker
```bash
make build                # Собрать Docker images
make start                # Запустить все сервисы
make stop                 # Остановить сервисы
make restart              # Перезапустить
make logs                 # Показать логи
make logs-backend         # Логи backend
make logs-bot             # Логи bot
make status               # Статус сервисов
```

### База данных
```bash
make migrate              # Выполнить миграции
make seed                 # Добавить тестовые данные
make db-reset             # Сбросить и пересоздать БД
make db-shell             # PostgreSQL shell
make db-backup            # Создать backup
```

### Тестирование
```bash
make test                 # Все тесты
make test-backend         # Backend тесты
make health               # Проверка здоровья сервисов
```

### Production
```bash
make prod-build           # Production build
make prod-start           # Запуск production
```

## Важные правила разработки

### 1. State Management в WebApp
**КРИТИЧЕСКИ ВАЖНО:** WebApp НЕ использует localStorage/sessionStorage!
- Только in-memory state (React state, Zustand без persist)
- Все данные сохраняются через API вызовы
- При перезагрузке страницы состояние сбрасывается

### 2. База данных
- Используются **чистые SQL запросы**, НЕ ORM
- Миграции запускаются через `make migrate`
- Schema находится в `/backend/database/schema.sql`

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
```
server.js              # Express app + WebSocket
config/
  database.js          # PostgreSQL connection
routes/
  auth.js             # Auth endpoints
  shops.js            # Shop endpoints
  products.js         # Product endpoints
  orders.js           # Order endpoints
  payments.js         # Payment endpoints
controllers/          # Business logic
models/db.js          # SQL queries
middleware/
  auth.js             # JWT verification
  validation.js       # Input validation
services/
  crypto.js           # Crypto verification
  telegram.js         # Telegram API
```

### Bot (`/bot/`)
```
bot.js                # Главный файл бота
handlers/
  start.js            # /start, роли
  seller.js           # Флоу продавца
  buyer.js            # Флоу покупателя
  shop.js             # Управление магазином
keyboards/            # Telegram keyboards
utils/api.js          # Backend API client
```

### WebApp (`/webapp/src/`)
```
components/
  Layout/             # Header, TabBar
  Shop/               # ShopCard, ShopList
  Product/            # ProductCard, ProductGrid
  Cart/               # CartSheet, CartItem
  Payment/            # CryptoSelector
pages/                # Страницы приложения
hooks/                # Custom hooks (useApi, useTelegram)
store/                # Zustand store
utils/                # Утилиты
```

## Специализированные субагенты

Проект настроен на использование специализированных субагентов через `.claude/agents/`:

- **design-researcher** - для UI/UX дизайна, visual inspiration
- **backend-architect** - для архитектурных решений, API design
- **frontend-developer** - для React, TailwindCSS, Telegram Mini App
- **telegram-bot-expert** - для Telegram bot, Grammy/Telegraf
- **crypto-integration-specialist** - для крипто-платежей, blockchain APIs
- **database-designer** - для PostgreSQL, схемы, миграции

**Рекомендация:** Используй Task tool с соответствующим субагентом для специализированных задач.

## Security

- JWT аутентификация
- Rate limiting (100 req/15 min)
- Helmet.js security headers
- Input validation (express-validator)
- SQL injection protection
- CORS configuration
- Telegram Web App data verification

## Development Workflow

1. **Настройка:**
   ```bash
   make setup
   # Отредактируй .env файлы
   make migrate
   ```

2. **Разработка:**
   ```bash
   make dev              # Все сервисы
   # ИЛИ
   make dev-backend &
   make dev-bot &
   make dev-webapp &
   ```

3. **Проверка логов:**
   ```bash
   make logs
   # ИЛИ отдельно:
   make logs-backend
   make logs-bot
   ```

4. **База данных:**
   ```bash
   make db-shell         # SQL консоль
   make migrate          # Миграции
   make db-reset         # Пересоздать БД
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

1. **База данных не запускается:**
   ```bash
   make stop
   make start
   make migrate
   ```

2. **Ошибки миграций:**
   ```bash
   make db-reset
   ```

3. **Bot не подключается:**
   - Проверь `BOT_TOKEN` в `.env`
   - Проверь доступность Backend: `make health`

4. **WebApp не загружается:**
   - Проверь `VITE_API_URL` в `webapp/.env`
   - Проверь CORS настройки в backend
