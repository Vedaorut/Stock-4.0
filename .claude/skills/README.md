# Agent SKILLS for Status Stock 4.0

**14 профессиональных SKILLS** для быстрой разработки, дебаггинга, тестирования, дизайна и deployment.

## ✅ ВСЕ SKILLS ОБНОВЛЕНЫ (November 30, 2025)

Все skills были **полностью переписаны** под Cloudflare Tunnel (вместо ngrok):

- ✅ Используют **cloudflared** вместо ngrok (без лимитов!)
- ✅ Используют реальные пути (`/Users/sile/Documents/Status Stock 4.0`)
- ✅ Корректные пути к логам (`logs/cloudflared.log`, `logs/backend.log`, `logs/bot.log`)
- ✅ Правильные npm команды
- ✅ YAML frontmatter во всех skills

---

## 🚀 Быстрый старт

Просто скажи Claude фразу из "Usage" любого skill:

```
"quick start"           → Запустит всё (Backend + Bot + Cloudflare tunnel)
"health check"          → Проверит здоровье системы
"analyze logs"          → Найдет и покажет ошибки
"check ui"              → Валидирует дизайн
"run tests"             → Запустит все тесты
```

Claude автоматически выполнит все необходимые команды.

---

## 📁 Категории SKILLS (14 штук)

### ⚡ Development & Startup (3)

**1. quick-start** - Моментальный запуск всего stack

- ✅ Останавливает существующие процессы
- ✅ Запускает Cloudflare tunnel
- ✅ Обновляет .env файлы с tunnel URL
- ✅ Билдит webapp
- ✅ Стартует Backend + Bot
- Usage: `"quick start"` or `"start project"`

**2. restart-all** - Безопасный перезапуск

- ✅ Останавливает все процессы
- ✅ Проверяет что все процессы остановлены
- ✅ Стартует fresh Cloudflare tunnel
- ✅ Новый tunnel URL каждый раз
- Usage: `"restart all"` or `"restart services"`

**3. health-check** - Комплексная проверка здоровья

- ✅ Backend API health endpoint
- ✅ Bot process status
- ✅ **Cloudflare tunnel status** (критично!)
- ✅ PostgreSQL connection
- ✅ Recent error logs analysis
- Usage: `"health check"` or `"status"`

---

### 🐛 Debug & Monitoring (3)

**4. analyze-logs** - Умный анализ error логов

- ✅ Backend: `logs/backend.log`
- ✅ Bot: `logs/bot.log`
- ✅ Cloudflared: `logs/cloudflared.log`
- ✅ Категоризация ошибок
- ✅ Top 5 most frequent errors
- Usage: `"analyze logs"` or `"what's wrong"`

**5. fix-errors** - Автоматическое исправление ошибок

- ✅ Port conflicts (EADDRINUSE)
- ✅ Database connection (ECONNREFUSED)
- ✅ Missing dependencies
- ✅ **Tunnel disconnected** (критично!)
- ✅ Import/Export errors
- Usage: `"fix errors"` or `"auto fix"`

**6. check-ports** - Управление портами

- ✅ 3000 (Backend)
- ✅ 5173 (WebApp dev)
- ✅ 5432 (PostgreSQL)
- Usage: `"check ports"` or `"port status"`

---

### 🧪 Testing (2)

**7. run-tests** - Запуск всех тестов

- ✅ Backend tests + coverage (`npm run test:coverage`)
- ✅ Bot tests + coverage (`npm run test:coverage`)
- ✅ Coverage summary report
- Usage: `"run tests"` or `"test all"`

**8. test-integration** - Integration тесты бота

- ✅ Проверяет Backend running
- ✅ Автостарт Backend если нужно
- ✅ Full user flow testing
- ✅ Test cleanup
- Usage: `"test bot"` or `"integration tests"`

---

### 🎨 Design & UI/UX (2)

**9. ui-check** - Валидация UI дизайна

- ✅ Glassmorphism effects (glass-card, glass-elevated)
- ✅ Color palette (#FF6B00 orange, #181818 dark)
- ✅ Touch-friendly buttons (min 44px)
- ✅ Typography consistency
- Usage: `"check ui"` or `"validate design"`

**10. animation-check** - Проверка анимаций

- ✅ Framer Motion usage
- ✅ Performance anti-patterns detection
- ✅ GPU-accelerated properties check
- ✅ Spring animations
- Usage: `"check animations"` or `"animation review"`

---

### 🗄️ Database (2)

**11. db-migrate** - Безопасные миграции

- ✅ Auto backup before migration
- ✅ Run migrations (`npm run db:migrate`)
- ✅ Verify schema
- ✅ Rollback on errors
- Usage: `"migrate db"` or `"run migrations"`

**12. db-query** - Быстрые SQL запросы

- ✅ Common queries (users, shops, orders)
- ✅ Table schemas
- ✅ Export to CSV/JSON
- ✅ Database statistics
- Usage: `"query db"` or `"check users table"`

---

### 🌐 Tunnel Management (1)

**13. tunnel-management** - Управление Cloudflare tunnel

- ✅ Check cloudflared status and URL
- ✅ Restart disconnected tunnels
- ✅ Update all .env files
- ✅ Rebuild webapp with new URL
- ✅ Verify tunnel working
- Usage: `"check tunnel"` or `"restart tunnel"` or `"cloudflare status"`

**КРИТИЧНО:** Этот проект **ТРЕБУЕТ tunnel** для Telegram Mini App. Without it, Mini App button won't work!

---

### 🚀 Deployment (1)

**14. production-deploy** - Pre-deployment checklist

- ✅ Run all tests
- ✅ Check UI/UX compliance
- ✅ Validate animations
- ✅ Analyze error logs
- ✅ Verify build succeeds
- ✅ Security check (hardcoded secrets)
- ✅ Generate deployment report
- Usage: `"production check"` or `"deploy check"`

---

## 🎯 Типичные рабочие сценарии

### Утренний старт:

```
1. "quick start"           # Запустить всё
2. "health check"          # Проверить что работает
```

### Когда что-то сломалось:

```
1. "analyze logs"          # Найти ошибки
2. "fix errors"            # Автофикс
3. "restart all"           # Перезапустить
4. "health check"          # Проверить что починилось
```

### Перед коммитом:

```
1. "run tests"             # Все тесты
2. "check ui"              # Дизайн
3. "check animations"      # Анимации
4. git add . && git commit
```

### Перед deployment:

```
1. "production check"      # Comprehensive checklist
2. Fix any ❌ failures
3. Deploy to production
```

### После system sleep/wake:

```
1. "check tunnel"          # Tunnel may have died!
2. If dead: "restart tunnel"
3. "health check"          # Verify all OK
```

---

## 💡 Почему Cloudflare вместо ngrok

| Feature | Cloudflare | ngrok (free) |
|---------|------------|--------------|
| Session limit | **None** | 2 hours |
| Request limit | **None** | 40/min |
| Registration | Not required | Required |
| Speed | Fast (global CDN) | Good |

**Вывод:** Cloudflare tunnel лучше для разработки - без лимитов и ограничений.

---

## 📊 Статистика

**Всего:** 14 SKILLS  
**Категорий:** 7 (Development, Debug, Testing, Design, Database, Tunnel, Deployment)

**Охват:**

- ⚡ Development: 100%
- 🐛 Debugging: 100%
- 🧪 Testing: Backend + Bot
- 🎨 Design: UI + Animations
- 🗄️ Database: Migrations + Queries
- 🌐 Tunnel: Cloudflare management
- 🚀 Deployment: Pre-flight checklist

---

**Created:** 2025-10-31  
**Updated:** 2025-11-30  
**Version:** 3.0 (Cloudflare migration)  
**Project:** Status Stock 4.0 - Telegram E-Commerce Platform
