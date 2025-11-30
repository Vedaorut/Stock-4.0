# CLAUDE.md

## Project

**Status Stock** — Telegram E-Commerce платформа.

```
backend/   → Express API + PostgreSQL + WebSocket
bot/       → Telegram Bot (Telegraf.js)
webapp/    → React Mini App (TailwindCSS + Framer Motion)
```

---

## Commands

```bash
# Development
./start.sh              # Start all (ngrok + backend + bot)
./stop.sh               # Stop all
npm run dev             # Backend + WebApp dev mode

# Testing
npm test                # Run tests
npm run test:coverage   # Tests + coverage

# Database
psql telegram_shop      # Connect to DB
```

---

## Tools — Когда что использовать

### Поиск кода

| Задача | Инструмент |
|--------|------------|
| "Как работает X?", "Где логика Y?" | `mcp__morph-mcp__warp_grep` |
| Точный паттерн: `TODO`, `error` | `Grep` |
| Найти файл по имени | `Glob` |

```javascript
// Семантический поиск — понимает контекст, находит связи
mcp__morph-mcp__warp_grep({
  repoPath: "/Users/sile/Documents/Status Stock 4.0",
  query: "payment crypto verification"
})

// Точный поиск — regex, быстро
Grep({ pattern: "handleRoleWorker", path: "bot/src" })
```

### Работа с файлами

| Задача | Инструмент |
|--------|------------|
| Читать файл | `mcp__filesystem__read_text_file` или `Read` |
| Редактировать | `mcp__morph-mcp__edit_file` (быстро) или `Edit` |
| Список файлов | `mcp__filesystem__list_directory` |
| Создать папку | `mcp__filesystem__create_directory` |

```javascript
// Быстрое редактирование — показывай только изменения
mcp__morph-mcp__edit_file({
  path: "/path/to/file.js",
  code_edit: `
// ... existing code ...

function newFunc() {
  return true;
}

// ... existing code ...
  `,
  instruction: "Add newFunc after imports"
})
```

### Bash — ТОЛЬКО для

- `npm run`, `npm test` — запуск/тесты
- `git` команды
- `psql` — SQL запросы
- `./start.sh`, `./stop.sh`

**НЕ используй Bash для:** чтения файлов, поиска, редактирования.

---

## Workflow

**ВАЖНО: В начале работы ВСЕГДА используй `warp_grep` для изучения кодовой базы!**

```
1. warp_grep  → СНАЧАЛА разведка, понять архитектуру
2. Read       → потом прочитать конкретные файлы
3. edit_file  → внести правки
4. Grep       → проверить результат
```

**Не прыгай сразу в файлы** — сначала пойми контекст через warp_grep.

---

## Субагенты

| Агент | Когда |
|-------|-------|
| `telegram-bot-expert` | Telegraf handlers, scenes, keyboards |
| `backend-architect` | API endpoints, архитектура |
| `database-designer` | PostgreSQL, миграции, SQL |
| `frontend-developer` | React, TailwindCSS, Mini App |
| `debug-master` | Баги, тесты, ошибки |
| `Explore` | Быстрый поиск по кодовой базе |

**При делегировании указывай инструменты:**

```javascript
Task({
  subagent_type: 'debug-master',
  prompt: `
    Используй mcp__morph-mcp__warp_grep для поиска.
    Используй mcp__morph-mcp__edit_file для правок.

    ЗАДАЧА: [описание]
  `
})
```

---

## Code Style

- ES modules: `import/export`
- Функции: arrow functions
- Async: `async/await`, не callbacks
- Именование: camelCase (переменные), PascalCase (компоненты)

---

## Важно

- **ngrok обязателен** — Mini App требует HTTPS
- **Логи:** `backend/logs/`, `bot/logs/`
- **НЕ редактируй:** `.env` файлы вручную
- **НЕ создавай:** .md отчёты после задач

---

## Структура БД

```
users → shops → products → orders
              ↘ shop_workers
              ↘ shop_follows → synced_products
```

---

## Skills (триггеры)

- `"quick start"` — запуск всего
- `"health check"` — проверка статуса
- `"analyze logs"` — анализ ошибок
- `"run tests"` — тесты
- `"check ngrok"` — статус tunnel

Полный список: `.claude/skills/README.md`
