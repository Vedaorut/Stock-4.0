# ⚡ Быстрый старт - Telegram E-Commerce Platform

> Запустите полную платформу за 5 минут!

## 🚀 Самый быстрый способ (Docker)

```bash
# 1. Перейдите в директорию проекта
cd "/Users/sile/Documents/Status Stock 4.0"

# 2. Создайте .env файлы
make env

# 3. Отредактируйте .env файл
nano .env
# Или используйте ваш любимый редактор
```

**Минимальная конфигурация .env:**
```env
# Обязательные параметры
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11  # От @BotFather
JWT_SECRET=$(openssl rand -base64 32)                          # Генерируем
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY                       # От etherscan.io

# Опциональные (можно оставить по умолчанию)
POSTGRES_PASSWORD=secure_password_here
```

```bash
# 4. Запустите все сервисы
make start

# 5. Подождите 30 секунд пока все запустится
# Проверьте статус:
make status

# 6. Откройте в браузере
# http://localhost - WebApp
# http://localhost:3000/health - Backend API
# http://localhost:5050 - pgAdmin (опционально)
```

## 🎯 Что запустилось?

После `make start` у вас работают:

1. **PostgreSQL** (порт 5432) - База данных
2. **Redis** (порт 6379) - Кэш и сессии
3. **Backend API** (порт 3000) - REST API + WebSocket
4. **Telegram Bot** - Обработка команд
5. **WebApp** (порт 80) - Mini App интерфейс
6. **pgAdmin** (порт 5050) - Админка БД (опционально)

## 📱 Настройка Telegram Bot

### 1. Создайте бота через @BotFather

```
/newbot
Имя: Status Stock Bot
Username: status_stock_bot (уникальное!)
```

Получите токен: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`

### 2. Настройте Mini App

```
/mybots
Выберите вашего бота
Bot Settings → Menu Button
Укажите URL вашего WebApp (после деплоя)
```

### 3. Добавьте команды

```
/setcommands
start - Начать работу
help - Помощь
shop - Управление магазином (для продавцов)
orders - Мои заказы
```

## 🔑 Получение API ключей

### Etherscan API Key (обязательно)

1. Зайдите на https://etherscan.io/
2. Зарегистрируйтесь
3. Перейдите в API Keys
4. Создайте новый ключ (бесплатно)
5. Скопируйте в `.env` → `ETHERSCAN_API_KEY`

### Blockchain.info API Key (опционально, для BTC)

1. https://www.blockchain.com/api
2. Создайте аккаунт
3. Получите API ключ
4. Добавьте в `.env` → `BLOCKCHAIN_INFO_API_KEY`

### TONCenter API Key (опционально, для TON)

1. https://toncenter.com/
2. Получите ключ
3. Добавьте в `.env` → `TONCENTER_API_KEY`

## 🗄️ Инициализация базы данных

База данных автоматически создается при первом запуске Docker Compose.

Для добавления тестовых данных:

```bash
# Вариант 1: Через make
make seed

# Вариант 2: Напрямую
cd backend
node database/migrations.js --seed
```

## 🛠️ Локальная разработка (без Docker)

Если хотите разрабатывать без Docker:

```bash
# 1. Установите зависимости
make install

# 2. Запустите только БД в Docker
docker-compose up -d postgres redis

# 3. Создайте таблицы
make migrate

# 4. Добавьте тестовые данные
make seed

# 5. Запустите сервисы
# Терминал 1: Backend
cd backend
npm run dev

# Терминал 2: Bot
cd bot  
npm run dev

# Терминал 3: WebApp
cd webapp
npm run dev
```

## 📊 Проверка работоспособности

### Автоматическая проверка

```bash
make health
```

### Ручная проверка

```bash
# Backend
curl http://localhost:3000/health
# Ответ: {"status":"ok","database":"connected"}

# WebApp
curl http://localhost/health
# Ответ: healthy

# Database
docker-compose exec postgres pg_isready
# Ответ: postgres:5432 - accepting connections

# Bot логи
make logs-bot
# Должно быть: Bot started successfully
```

## 🎨 Первые шаги после запуска

### 1. Зайдите в Telegram бот

```
/start
Выберите роль: "Я продавец"
```

### 2. Создайте магазин

```
Следуйте инструкциям бота:
1. Оплатите $25 в BTC (тестовая сеть!)
2. Введите хэш транзакции
3. Придумайте название магазина
```

### 3. Добавьте товары

```
В меню бота:
"Добавить товар" →
- Название
- Описание  
- Цена
- Количество
- Фото (опционально)
```

### 4. Откройте WebApp

```
"Открыть приложение" в боте
Или откройте http://localhost в браузере
```

## 🐛 Решение проблем

### Ошибка: "Cannot connect to database"

```bash
# Проверьте что PostgreSQL запущен
docker-compose ps postgres

# Перезапустите
docker-compose restart postgres

# Проверьте логи
make logs-db
```

### Ошибка: "Bot token invalid"

```bash
# Проверьте .env файл
cat bot/.env | grep BOT_TOKEN

# Убедитесь что токен правильный (от @BotFather)
# Нет пробелов, правильный формат: 123456:ABC-DEF...
```

### Ошибка: "Port already in use"

```bash
# Найдите процесс на порту
lsof -i :3000  # Или :5432, :80

# Остановите процесс
kill -9 PID

# Или измените порт в .env
BACKEND_PORT=3001
```

### WebApp не открывается

```bash
# Проверьте что контейнер запущен
docker-compose ps webapp

# Проверьте логи
make logs-webapp

# Пересоберите образ
docker-compose build webapp
docker-compose up -d webapp
```

## 📝 Полезные команды

```bash
# Просмотр логов
make logs              # Все сервисы
make logs-backend      # Только backend
make logs-bot          # Только bot

# Перезапуск
make restart           # Все сервисы
docker-compose restart backend  # Один сервис

# Остановка
make stop              # Все сервисы
make down              # + удаление контейнеров

# Очистка
make clean             # Node modules
make clean-docker      # Docker volumes

# База данных
make db-shell          # PostgreSQL консоль
make db-backup         # Создать бэкап
make db-reset          # Сбросить БД
```

## 🚀 Следующие шаги

1. **Настройте домен** - для production деплоя
2. **Получите SSL сертификат** - Let's Encrypt
3. **Настройте webhook** - для Telegram бота
4. **Добавьте аналитику** - Amplitude, Mixpanel
5. **Настройте мониторинг** - Sentry, Grafana

Подробнее в [DEPLOYMENT.md](backend/DEPLOYMENT.md)

## 📞 Нужна помощь?

- 📚 Полная документация: [README.md](README.md)
- 🔧 Backend API: [backend/README.md](backend/README.md)
- 🤖 Telegram Bot: [bot/README.md](bot/README.md)
- 🎨 WebApp: [webapp/README.md](webapp/README.md)
- 🐛 Issues: GitHub Issues

---

**Готово!** Ваша платформа запущена и готова к работе! 🎉
