# CLAUDE.md

> Инструкции для Claude Code при работе с проектом

## Проект

**Status Stock** - Telegram E-Commerce платформа для цифровых магазинов с криптовалютными платежами (BTC, ETH, USDT, TON).

**Структура:**
- `backend/` - Express API + PostgreSQL + WebSocket
- `bot/` - Telegram Bot (Telegraf.js)
- `webapp/` - React Mini App (TailwindCSS + Framer Motion)

**Технологии:**
- Backend: Express, PostgreSQL (без ORM), JWT, WebSocket
- Bot: Telegraf.js, session-based state
- Frontend: React 18, Vite, Zustand (in-memory only), Telegram WebApp SDK
- Payments: Blockchain APIs (Etherscan, TONCenter)

---

## Правила работы Claude Code

### 1. Роль Оркестратора

**Claude Code работает как оркестратор** - делегирует задачи субагентам вместо самостоятельного выполнения.

**Рабочий процесс:**
1. **Plan Mode** - анализ через MCP File System → план → ExitPlanMode
2. **Approval** - ждать подтверждения плана от пользователя
3. **Delegate** - использовать Task tool для запуска субагентов
4. **Verify** - проверка логов сервисов + тесты
5. **Report** - краткий отчёт в чат (НЕ создавать .md файлы)

**КРИТИЧНО:** НЕ создавать отчёты-документы после каждой задачи. Только устное резюме в чат.

### 2. MCP File System обязателен

Использовать MCP FS для **всех** файловых операций:

```javascript
// ✅ ПРАВИЛЬНО
Read(file_path: "/path/to/file")
Grep(pattern: "search", path: "/path")
Glob(pattern: "**/*.js")

// ❌ НЕПРАВИЛЬНО
Bash("cat /path/to/file")
Bash("grep 'search' /path")
Bash("find . -name '*.js'")
```

**Bash разрешён только для:**
- `npm run dev`, `npm test` - запуск проекта/тестов
- `psql -c "SELECT ..."` - read-only SQL запросы
- Проверка логов (`tail -f`, `docker-compose logs`)

### 3. Субагенты - проактивно использовать

**Когда использовать Task tool:**

| Субагент | Когда использовать |
|----------|-------------------|
| `telegram-bot-expert` | Работа с Telegraf.js: handlers, scenes, keyboards, sessions |
| `backend-architect` | API design, endpoint создание, идемпотентность, архитектура |
| `database-designer` | PostgreSQL: schema, миграции, индексы, SQL запросы |
| `frontend-developer` | React компоненты, TailwindCSS, Telegram Mini App UI/UX |
| `debug-master` | Debugging, ошибки, тесты, исправления багов |
| `Explore` | Анализ кодовой базы, поиск файлов/паттернов, research |

**Примеры делегирования:**

```javascript
// Разработка бота
Task({
  subagent_type: "telegram-bot-expert",
  description: "Add new button handler",
  prompt: "Add callback handler for 'delete_product' button in seller menu"
})

// Работа с БД
Task({
  subagent_type: "database-designer",
  description: "Create migration",
  prompt: "Add index on products.shop_id for faster lookups"
})

// Дебаг
Task({
  subagent_type: "debug-master",
  description: "Fix failing tests",
  prompt: "Fix 3 failing integration tests in bot/tests/integration/"
})
```

**Важно:** Субагенты тоже используют MCP File System.

### 4. После запуска - проверка логов

**ВСЕГДА** после запуска любого сервиса проверять логи:

```bash
# Backend
tail -f backend/logs/combined.log

# Bot
tail -f bot/logs/bot.log

# Или через терминал
npm run dev  # Смотреть вывод
```

**Критерии здоровья:**
- ✅ Нет `[error]` после старта
- ✅ "Server started" / "Bot started"
- ✅ "Database: Connected ✓"
- ❌ Если ошибки → остановить, исправить, перезапустить

---

## Критичные технические детали

### Zustand Store (Frontend)
**КРИТИЧНО:** НЕ использует persist!
- Только in-memory state
- При перезагрузке страницы состояние сбрасывается
- Все данные сохраняются через API вызовы

### PostgreSQL без ORM
- Прямые SQL запросы через `pg` библиотеку
- Миграции: `backend/database/migrations.js`
- Schema: `backend/database/schema.sql`
- При изменении схемы обновлять ОБА файла

### Telegraf.js особенности

**Context геттеры:**
```javascript
// ❌ НЕПРАВИЛЬНО
const fakeCtx = { ...ctx };  // геттеры не копируются!

// ✅ ПРАВИЛЬНО
const fakeCtx = {
  ...ctx,
  from: ctx.from,
  message: ctx.message,
  chat: ctx.chat,
  session: ctx.session
};
```

**answerCbQuery():**
- Можно вызвать ОДИН РАЗ на callback query
- Второй вызов игнорируется → infinite spinner

**Error parsing:**
```javascript
// ✅ Парсить backend ошибки
const errorMsg = error.response?.data?.error;
if (errorMsg === 'Already subscribed') {
  await ctx.answerCbQuery('ℹ️ Вы уже подписаны');
}
```

### Дизайн-система (Frontend)
- Цвета: `#0A0A0A` (фон), `#FF6B00` (orange primary), `#1A1A1A` (карточки)
- Glassmorphism: `backdrop-blur-12px` + `rgba(23, 33, 43, 0.6)`
- Touch-friendly: минимум 44px для кнопок
- Mobile-first подход

---

## Быстрый старт

```bash
# 1. Установить зависимости
npm run install:all

# 2. Создать .env файлы
cp backend/.env.example backend/.env
cp bot/.env.example bot/.env
cp webapp/.env.example webapp/.env
# Отредактировать: BOT_TOKEN, JWT_SECRET, DATABASE_URL

# 3. БД
npm run db:setup  # createdb + миграции

# 4. Запуск
npm start  # Backend + WebApp
npm run bot  # В отдельном терминале

# URLs:
# Backend: http://localhost:3000
# WebApp: http://localhost:5173
# Health: http://localhost:3000/health
```

**Тестирование бота:**
```bash
cd bot
npm run test:integration  # Все integration тесты
npm test                  # Все тесты + coverage
```

---

## Safety Rules

- ❌ НЕ редактировать `.env` файлы
- ❌ НЕ ломать API контракты (backward compatible)
- ❌ НЕ создавать .md отчёты после задач
- ❌ НЕ использовать Bash для файловых операций
- ✅ Минимальные diffs (точные строки)
- ✅ MCP File System для всего
- ✅ Task tool для делегирования
- ✅ Проверка логов после запуска

---

## Полезные ссылки

- Детальная документация: `README.md` (корень проекта)
- Backend API: `backend/README.md`
- Bot guide: `bot/README.md`
- WebApp guide: `webapp/README.md`
- Database schema: `backend/database/schema.sql`
- Субагенты: `.claude/agents/*.md`
