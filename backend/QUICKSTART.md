# Quick Start Guide

Быстрый старт для локальной разработки.

## Предварительные требования

- Node.js 18+ установлен
- PostgreSQL 14+ установлен и запущен
- npm или yarn

---

## 1. Установка (5 минут)

### Шаг 1: Установите зависимости
```bash
cd backend
npm install
```

### Шаг 2: Создайте базу данных
```bash
# Войдите в PostgreSQL
psql postgres

# Создайте базу и пользователя
CREATE USER telegram_shop_user WITH PASSWORD 'dev_password';
CREATE DATABASE telegram_shop;
GRANT ALL PRIVILEGES ON DATABASE telegram_shop TO telegram_shop_user;
\q
```

### Шаг 3: Выполните миграции
```bash
psql -U telegram_shop_user -d telegram_shop -f database/schema.sql
psql -U telegram_shop_user -d telegram_shop -f database/indexes.sql
```

### Шаг 4: Настройте окружение
```bash
cp .env.example .env
```

Отредактируйте `.env`:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://telegram_shop_user:dev_password@localhost:5432/telegram_shop
JWT_SECRET=dev-secret-key-change-in-production
TELEGRAM_BOT_TOKEN=your-bot-token-here
```

### Шаг 5: Запустите сервер
```bash
npm run dev
```

Сервер запустится на `http://localhost:3000`

---

## 2. Проверка работоспособности (2 минуты)

### Проверьте health endpoint
```bash
curl http://localhost:3000/health
```

Ожидаемый ответ:
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development"
}
```

### Создайте тестового пользователя
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "telegramId": 123456789,
    "username": "test_seller",
    "firstName": "Test",
    "lastName": "Seller",
    "role": "seller"
  }'
```

Сохраните токен из ответа!

### Создайте магазин
```bash
curl -X POST http://localhost:3000/api/shops \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Shop",
    "description": "My first shop"
  }'
```

---

## 3. Тестовые данные (опционально)

### Загрузите тестовые данные
```bash
psql -U telegram_shop_user -d telegram_shop -f database/seed.sql
```

Это создаст:
- 2 тестовых пользователя (buyer и seller)
- 1 магазин
- 3 продукта

---

## 4. Полезные команды

### Development
```bash
# Запуск с auto-reload
npm run dev

# Обычный запуск
npm start
```

### Database
```bash
# Подключиться к БД
psql -U telegram_shop_user -d telegram_shop

# Посмотреть таблицы
\dt

# Посмотреть пользователей
SELECT * FROM users;

# Посмотреть магазины
SELECT * FROM shops;

# Очистить базу (осторожно!)
psql -U telegram_shop_user -d telegram_shop -f database/schema.sql
```

### Logs
```bash
# Смотреть логи в реальном времени (если используете PM2)
pm2 logs telegram-shop-api

# Посмотреть процессы PM2
pm2 list
```

---

## 5. Тестирование API

### Используйте cURL

**Регистрация:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"telegramId": 999, "username": "buyer1", "firstName": "Buyer", "role": "buyer"}'
```

**Список магазинов:**
```bash
curl http://localhost:3000/api/shops/active
```

**Список продуктов:**
```bash
curl http://localhost:3000/api/products
```

### Или используйте Postman/Insomnia

Import: `http://localhost:3000/api`

---

## 6. Структура проекта

```
backend/
├── src/
│   ├── server.js              # Точка входа
│   ├── config/                # Конфигурация
│   ├── routes/                # API routes
│   ├── controllers/           # Business logic
│   ├── models/                # Database queries
│   ├── middleware/            # Auth, validation
│   └── services/              # External services
├── database/                  # SQL migrations
├── package.json
└── .env
```

---

## 7. Основные endpoints

### Authentication
- `POST /api/auth/login` - Вход
- `POST /api/auth/register` - Регистрация
- `GET /api/auth/profile` - Профиль

### Shops
- `GET /api/shops/active` - Список магазинов
- `POST /api/shops` - Создать магазин (seller)
- `GET /api/shops/:id` - Детали магазина

### Products
- `GET /api/products` - Список товаров
- `POST /api/products` - Создать товар (seller)
- `GET /api/products/:id` - Детали товара

### Orders
- `POST /api/orders` - Создать заказ
- `GET /api/orders/my` - Мои заказы

### Payments
- `POST /api/payments/verify` - Верифицировать платеж

Полная документация: `API_EXAMPLES.md`

---

## 8. Troubleshooting

### Порт уже занят
```bash
# Найти процесс на порту 3000
lsof -i :3000

# Убить процесс
kill -9 PID
```

### Ошибка подключения к БД
```bash
# Проверьте, что PostgreSQL запущен
sudo service postgresql status

# Или на macOS
brew services list

# Запустите если не запущен
sudo service postgresql start
# или
brew services start postgresql
```

### Ошибки миграций
```bash
# Пересоздайте базу
dropdb telegram_shop
createdb telegram_shop
psql -U telegram_shop_user -d telegram_shop -f database/schema.sql
```

### JWT ошибки
Проверьте, что `JWT_SECRET` установлен в `.env`

---

## 9. Следующие шаги

1. Изучите API документацию: `API_EXAMPLES.md`
2. Настройте Telegram бота
3. Интегрируйте с frontend
4. Настройте crypto payment APIs
5. Для production: читайте `DEPLOYMENT.md`

---

## 10. Полезные ссылки

- **API Examples**: `API_EXAMPLES.md`
- **Deployment Guide**: `DEPLOYMENT.md`
- **Project Structure**: `STRUCTURE.md`
- **Main README**: `README.md`

---

## Support

Вопросы? Проблемы?
- Проверьте документацию
- Смотрите логи: `pm2 logs` или console output
- GitHub Issues

---

**Happy coding!** 🚀
