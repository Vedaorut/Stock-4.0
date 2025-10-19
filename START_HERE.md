# 🚀 НАЧНИТЕ ЗДЕСЬ - Status Stock 4.0

> **Проект готов на 95%!** Осталось только заполнить .env и запустить.

---

## ⚡ Быстрый старт (20 минут)

### Шаг 1: Получить Telegram Bot Token (5 мин)

1. Открыть Telegram
2. Найти **@BotFather**
3. Отправить `/newbot`
4. Придумать имя: `Status Stock Bot`
5. Придумать username: `status_stock_bot` (должен быть уникальным!)
6. Скопировать TOKEN (формат: `123456:ABC-DEF1234ghIkl...`)

### Шаг 2: Настроить .env (5 мин)

```bash
cd "/Users/sile/Documents/Status Stock 4.0"

# Открыть .env файл
nano .env

# Добавить минимум:
BOT_TOKEN=ваш_токен_от_BotFather
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ETHERSCAN_API_KEY=  # Опционально, можно оставить пустым
```

**Сохранить:** `Ctrl+X` → `Y` → `Enter`

### Шаг 3: Запустить проект (10 мин)

```bash
# Установить зависимости (первый раз)
make install

# Собрать Docker образы
make build

# Запустить все сервисы
make start

# Мигрировать базу данных
make migrate

# Загрузить тестовые данные
make seed

# Проверить статус
make status
```

### Шаг 4: Проверить работу (2 мин)

```bash
# 1. Backend API
curl http://localhost:3000/health
# Должно вернуть: {"status":"ok"}

# 2. WebApp
open http://localhost

# 3. Telegram Bot
# Откройте Telegram, найдите вашего бота, отправьте /start
```

---

## 📊 Что включено

✅ **Backend API** - Node.js + Express + PostgreSQL
✅ **Telegram Bot** - Полный функционал для продавцов и покупателей
✅ **WebApp** - React + TailwindCSS + Glassmorphism UI
✅ **Database** - 7 таблиц с миграциями
✅ **Docker** - 6 сервисов готовых к запуску
✅ **Makefile** - 40+ команд автоматизации

---

## 🎯 Основные команды

```bash
# Запуск
make start          # Запустить все сервисы
make stop           # Остановить
make restart        # Перезапустить

# Логи
make logs           # Все логи
make logs-backend   # Backend
make logs-bot       # Bot

# База данных
make migrate        # Миграции
make seed           # Тестовые данные
make db-shell       # PostgreSQL консоль

# Разработка
make dev            # Dev режим
make health         # Проверка здоровья

# Помощь
make help           # Все команды
```

---

## 📚 Документация

- **AUDIT_REPORT.md** - Полный аудит проекта ✅
- **QUICKSTART.md** - Детальная инструкция по запуску
- **README.md** - Обзор проекта
- **PROJECT_SUMMARY.md** - Итоговый отчет

---

## ❓ Проблемы?

### "Cannot connect to database"
```bash
# Проверить что PostgreSQL запущен
docker-compose ps postgres
# Если нет, перезапустить
docker-compose restart postgres
```

### "Bot token invalid"
```bash
# Проверить .env файл
cat .env | grep BOT_TOKEN
# Убедиться что токен правильный
```

### "Port already in use"
```bash
# Найти процесс на порту
lsof -i :3000
# Остановить
kill -9 PID
```

---

## 🎉 Готово!

После запуска у вас будет:

- 🌐 **Backend API:** http://localhost:3000
- 🎨 **WebApp:** http://localhost
- 🤖 **Telegram Bot:** работает в фоне
- 🗄️ **Database:** PostgreSQL на порту 5432
- 📊 **pgAdmin:** http://localhost:5050 (опционально)

**Следующие шаги:**
1. Протестируйте создание магазина в боте
2. Добавьте товар
3. Откройте WebApp и проверьте что товар появился
4. Протестируйте добавление в корзину

---

**Удачи с запуском! 🚀**

*Детальная информация в AUDIT_REPORT.md*
