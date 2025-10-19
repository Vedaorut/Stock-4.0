# 🚀 Quick Start Guide

## Status Stock Backend - Быстрый старт

Этот гайд поможет запустить backend за 5 минут!

---

## 📋 Предварительные требования

- Node.js 18+ установлен
- PostgreSQL 15+ установлен и запущен
- Git установлен

---

## ⚡ Быстрый старт (5 минут)

### 1. Установка зависимостей (1 мин)

```bash
cd backend
npm install
```

### 2. Настройка окружения (1 мин)

```bash
# Копируем пример конфига
cp .env.local .env

# Редактируем .env (минимальные настройки):
# - DATABASE_URL
# - JWT_SECRET  
# - TELEGRAM_BOT_TOKEN (получить у @BotFather)
# - ETHERSCAN_API_KEY (для крипто-платежей)
```

### 3. Создание базы данных (1 мин)

```bash
# Создаем БД
createdb telegram_shop

# Запускаем миграции (из корня проекта)
cd ..
make migrate

# Или напрямую:
cd backend
node database/migrations.js
```

### 4. Запуск сервера (1 мин)

```bash
# Development режим с hot reload
npm run dev
```

### 5. Проверка работы (1 мин)

```bash
# Health check
curl http://localhost:3000/health

# Должен вернуть:
# {
#   "success": true,
#   "message": "Server is running",
#   ...
# }
```

---

## ✅ Готово! Backend работает!

Теперь вы можете:
- Тестировать API (см. `API_TESTING.md`)
- Читать документацию (см. `IMPLEMENTATION_REPORT.md`)
- Интегрировать с Bot и WebApp

---

## 🔧 Основные команды

```bash
# Development
npm run dev              # Запуск с hot reload

# Production
npm start                # Запуск без reload

# Database
make migrate             # Выполнить миграции
make db-shell            # Открыть PostgreSQL консоль
make db-reset            # Сбросить и пересоздать БД

# Logs
tail -f logs/combined-*.log   # Смотреть все логи
tail -f logs/error-*.log      # Только ошибки
```

---

## 🌐 API Endpoints

**Base URL:** `http://localhost:3000/api`

### Основные эндпоинты:

- `POST /auth/register` - Регистрация
- `POST /auth/login` - Вход
- `GET /auth/profile` - Профиль (требует JWT)

- `POST /shops` - Создать магазин
- `GET /shops/active` - Список магазинов
- `GET /shops/my` - Мои магазины

- `POST /products` - Добавить товар
- `GET /products` - Список товаров

- `POST /orders` - Создать заказ
- `GET /orders/my` - Мои заказы

- `POST /payments/verify` - Проверить платеж

- `POST /subscriptions` - Подписаться
- `GET /subscriptions` - Мои подписки

**Полный список:** 31 endpoint (см. `API_TESTING.md`)

---

## 🧪 Быстрый тест

```bash
# 1. Создать пользователя
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "telegramId": 123456789,
    "username": "testuser",
    "firstName": "Test",
    "lastName": "User"
  }'

# Сохраните token из ответа

# 2. Создать магазин
curl -X POST http://localhost:3000/api/shops \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Shop",
    "description": "My first shop"
  }'

# 3. Добавить товар
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shopId": 1,
    "name": "Test Product",
    "description": "Great product",
    "price": 0.01,
    "currency": "BTC",
    "stock": 100
  }'
```

---

## 📚 Документация

- `README.md` - Общее описание
- `IMPLEMENTATION_REPORT.md` - Детальный отчет о реализации
- `API_TESTING.md` - Примеры тестирования всех API
- `QUICKSTART_GUIDE.md` - Этот файл

---

## 🆘 Troubleshooting

### Проблема: "Database connection failed"

```bash
# Проверьте что PostgreSQL запущен
pg_isready

# Проверьте DATABASE_URL в .env
# Формат: postgresql://user:password@localhost:5432/dbname
```

### Проблема: "Port 3000 already in use"

```bash
# Найдите процесс
lsof -i :3000

# Убейте процесс или измените PORT в .env
```

### Проблема: "JWT_SECRET is required"

```bash
# Убедитесь что .env файл существует
ls -la .env

# Проверьте что JWT_SECRET указан
grep JWT_SECRET .env
```

### Проблема: Winston не создает логи

```bash
# Создайте директорию вручную
mkdir -p logs

# Проверьте права
chmod 755 logs
```

---

## 🔐 Security Checklist

Перед production deployment:

- [ ] Измените `JWT_SECRET` на случайную строку
- [ ] Установите `NODE_ENV=production`
- [ ] Настройте `FRONTEND_URL` на реальный домен
- [ ] Добавьте реальные API keys для crypto
- [ ] Настройте SSL/HTTPS
- [ ] Настройте firewall
- [ ] Ограничьте доступ к БД
- [ ] Настройте backup базы данных

---

## 🎯 Следующие шаги

1. **Интеграция с Bot:**
   ```bash
   cd ../bot
   npm install
   npm run dev
   ```

2. **Интеграция с WebApp:**
   ```bash
   cd ../webapp
   npm install
   npm run dev
   ```

3. **Полный stack:**
   ```bash
   # Из корня проекта
   make dev
   ```

---

## 💡 Полезные ссылки

- Telegram Bot API: https://core.telegram.org/bots/api
- Etherscan API: https://docs.etherscan.io/
- Winston Logging: https://github.com/winstonjs/winston
- Express.js: https://expressjs.com/

---

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте логи: `logs/error-*.log`
2. Проверьте .env файл
3. Убедитесь что БД работает
4. Смотрите `IMPLEMENTATION_REPORT.md`

---

**Удачи! 🚀**
