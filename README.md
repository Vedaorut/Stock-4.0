# 🛍 Telegram E-Commerce Platform

> Платформа для создания цифровых магазинов в Telegram с Mini App интерфейсом

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg)](https://reactjs.org/)
[![Telegram](https://img.shields.io/badge/Telegram-Bot%20API-blue.svg)](https://core.telegram.org/bots/api)

## 📋 Описание

Создайте свой цифровой магазин в Telegram за 5 минут. Принимайте платежи в криптовалюте (BTC, ETH, USDT), управляйте товарами через бота и продавайте через красивое Mini App.

### Основные возможности

- **Для продавцов:**
  - Создание магазина за $25 в крипте
  - Управление товарами через Telegram бота
  - Получение уведомлений о заказах
  - Статистика продаж
  - Режим «Работники» (только PRO-тариф, права ограничены)

- **Для покупателей:**
  - Поиск и подписка на магазины
  - Современный Mini App интерфейс
  - Оплата криптовалютой
  - История заказов

## 🚀 Быстрый старт

### Требования

- Docker & Docker Compose (рекомендуется)
- Node.js 18+ (для локальной разработки)
- PostgreSQL 15+ (для локальной разработки)

### Установка с Docker (рекомендуется)

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/yourusername/telegram-shop.git
cd telegram-shop

# 2. Создайте .env файлы
make env

# 3. Отредактируйте .env файл
# Добавьте BOT_TOKEN, JWT_SECRET, API_KEYS

# 4. Запустите все сервисы
make start

# 5. Откройте в браузере
# WebApp: http://localhost
# pgAdmin: http://localhost:5050
# Backend API: http://localhost:3000
```

### Локальная разработка

```bash
# 1. Установите зависимости
make install

# 2. Создайте .env файлы
make env

# 3. Запустите PostgreSQL в Docker
docker-compose up -d postgres redis

# 4. Выполните миграции
make migrate

# 5. Запустите в dev режиме
make dev

# Или запускайте сервисы отдельно:
make dev-backend  # Backend на :3000
make dev-bot      # Telegram Bot
make dev-webapp   # React App на :5173
```

### 🎯 Запуск через NPM (рекомендуется для разработки)

**Самый простой способ - одна команда для Backend + WebApp:**

```bash
npm start
```

### 📌 Ограничения тарифов

- **Workspace (Работники)** — доступен только на PRO ($35/мес). Для BASIC в боте и WebApp показывается подсказка об апгрейде.
- **Follows (Подписки на магазины)** — BASIC: максимум 2 активных подписок, PRO: без ограничений. Ограничения проверяются на backend, в боте и WebApp.

### ✅ Проверки перед деплоем

```bash
# Линтер (backend)
cd backend && npm run lint

# Тесты
cd backend && npm test

# CI-сценарий: миграции тестовой БД + тесты
cd backend && npm run test:ci
```

**Или через скрипт с проверками:**

```bash
# macOS/Linux
chmod +x start.sh
./start.sh

# Windows
start.bat
```

#### Первый запуск с NPM

```bash
# 1. Установите все зависимости (backend, webapp, bot)
npm run install:all

# 2. Создайте базу данных и выполните миграции
npm run db:setup

# 3. Настройте .env файл
# Отредактируйте backend/.env с вашими значениями

# 4. Запустите проект
npm start
```

#### NPM команды

```bash
# Запуск
npm start              # 🚀 Backend + WebApp (concurrently)
npm run dev            # То же что npm start
npm run dev:backend    # Только backend на :3000
npm run dev:webapp     # Только webapp на :5173
npm run backend        # Альтернативный способ запуска backend
npm run webapp         # Альтернативный способ запуска webapp
npm run bot            # Запуск Telegram бота

# Установка
npm run install:all    # Установить зависимости во всех проектах
npm run clean          # Удалить все node_modules

# База данных
npm run db:migrate     # Выполнить миграции
npm run db:setup       # Создать БД + миграции

# Build
npm run build:webapp   # Build webapp для production
```

#### URLs при запуске

- **Backend API:** http://localhost:3000
- **WebApp:** http://localhost:5173
- **Health Check:** http://localhost:3000/health
- **API Docs:** http://localhost:3000/api

#### Production с PM2

**Установите PM2 глобально:**
```bash
npm install -g pm2
```

**Запустите в production:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**Управление процессами:**
```bash
pm2 logs              # Логи всех процессов
pm2 monit             # Мониторинг в реальном времени
pm2 restart all       # Перезапустить все
pm2 stop all          # Остановить все
pm2 delete all        # Удалить из списка PM2
```

## 📁 Структура проекта

```
.
├── backend/          # Node.js + Express API
│   ├── src/
│   │   ├── server.js
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   └── middleware/
│   └── database/
│       ├── schema.sql
│       └── migrations.js
│
├── bot/              # Telegram Bot (Telegraf.js)
│   ├── bot.js
│   ├── handlers/
│   ├── keyboards/
│   └── utils/
│
├── webapp/           # React + Vite Mini App
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── styles/
│   └── nginx/
│
└── docker-compose.yml
```

## 🎨 Технологический стек

### Backend
- **Node.js 18+** - Runtime
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **JWT** - Authentication
- **WebSocket** - Real-time updates

### Bot
- **Telegraf.js** - Telegram Bot framework
- **Axios** - HTTP client

### WebApp
- **React 18** - UI framework
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **Framer Motion** - Animations
- **Telegram WebApp SDK** - Mini App integration

### DevOps
- **Docker** - Containerization
- **Nginx** - Web server
- **PM2** - Process manager
- **Redis** - Caching (optional)

## 🔧 Основные команды

```bash
# Разработка
make dev              # Запустить dev окружение
make logs             # Показать логи всех сервисов
make status           # Статус сервисов

# База данных
make migrate          # Выполнить миграции
make seed             # Добавить тестовые данные
make db-reset         # Сбросить и пересоздать БД
make db-backup        # Создать бэкап
make db-shell         # Открыть PostgreSQL shell

# Docker
make build            # Собрать Docker образы
make start            # Запустить все сервисы
make stop             # Остановить сервисы
make restart          # Перезапустить

# Тестирование
make test             # Запустить все тесты
make health           # Проверить здоровье сервисов

# Очистка
make clean            # Удалить node_modules и build
make clean-docker     # Удалить Docker ресурсы

# Помощь
make help             # Показать все команды
```

## 🔐 Настройка переменных окружения

### Backend (.env)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/telegram_shop
JWT_SECRET=your-secret-key
TELEGRAM_BOT_TOKEN=your-bot-token
ETHERSCAN_API_KEY=your-etherscan-api-key
```

### Bot (.env)
```env
BOT_TOKEN=your-telegram-bot-token
BACKEND_URL=http://localhost:3000
WEBAPP_URL=https://your-domain.com
```

### WebApp (.env)
```env
VITE_API_URL=http://localhost:3000
```

## 📚 API Документация

### Основные endpoints

**Authentication:**
- `POST /api/auth/login` - Вход через Telegram
- `POST /api/auth/register` - Регистрация
- `GET /api/auth/profile` - Профиль пользователя

**Shops:**
- `POST /api/shops` - Создать магазин
- `GET /api/shops` - Список магазинов
- `GET /api/shops/:id` - Получить магазин
- `PUT /api/shops/:id` - Обновить магазин
- `DELETE /api/shops/:id` - Удалить магазин

**Products:**
- `POST /api/products` - Добавить товар
- `GET /api/products` - Список товаров
- `PUT /api/products/:id` - Обновить товар
- `DELETE /api/products/:id` - Удалить товар

**Orders:**
- `POST /api/orders` - Создать заказ
- `GET /api/orders/my` - Мои заказы
- `PUT /api/orders/:id/status` - Обновить статус

**Payments:**
- `POST /api/payments/verify` - Проверить платеж

Полная документация: [backend/API_EXAMPLES.md](backend/API_EXAMPLES.md)

## 🎯 Дизайн-система

### Цвета
```css
--dark-bg: #0A0A0A;           /* Основной фон */
--dark-card: #1A1A1A;         /* Карточки */
--orange-primary: #FF6B00;    /* Акценты */
--orange-light: #FF8533;      /* Hover */
```

### Эффекты
- **Glassmorphism:** `backdrop-blur(10px)` + прозрачность
- **Анимации:** Framer Motion для плавных переходов
- **Touch-friendly:** Минимум 44px для кнопок
- **Типографика:** Inter (body) + Satoshi (headings)

## 🚀 Деплой

### Production с Docker

```bash
# 1. Соберите образы
make prod-build

# 2. Запустите в production режиме
make prod-start

# 3. Настройте Nginx reverse proxy
# См. backend/DEPLOYMENT.md
```

### Manual deployment

См. подробное руководство в [backend/DEPLOYMENT.md](backend/DEPLOYMENT.md)

## 🔒 Безопасность

- ✅ JWT аутентификация
- ✅ Rate limiting (100 req/15 min)
- ✅ Helmet.js security headers
- ✅ Input validation
- ✅ SQL injection protection
- ✅ XSS protection
- ✅ CORS configuration

## 🧪 Тестирование

```bash
# Все тесты
make test

# По компонентам
make test-backend
make test-bot
make test-webapp

# Coverage
cd backend && npm run test:coverage
```

## 📊 Мониторинг

```bash
# Логи
make logs              # Все сервисы
make logs-backend      # Backend
make logs-bot          # Bot
make logs-webapp       # WebApp

# Здоровье сервисов
make health

# Статус
make status
```

## 🤝 Contributing

1. Fork репозиторий
2. Создайте feature branch (`git checkout -b feature/amazing`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing`)
5. Создайте Pull Request

## 📝 Лицензия

MIT License - см. [LICENSE](LICENSE)

## 👥 Авторы

- **Your Name** - Initial work

## 🙏 Acknowledgments

- Telegram Bot API
- React Community
- Node.js Community

## 📞 Поддержка

- 📧 Email: support@your-domain.com
- 💬 Telegram: [@yourusername](https://t.me/yourusername)
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/telegram-shop/issues)

---

Made with ❤️ using Claude Code
