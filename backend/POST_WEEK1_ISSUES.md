# Post Week 1 Roadmap - Найденные проблемы и решения

**Дата:** 2025-10-22
**Статус:** В процессе исправления

---

## 🔴 Критические проблемы

### 1. API Naming Convention Inconsistency

**Проблема:**
- Backend API ожидает: `telegramId, firstName, lastName` (camelCase)
- База данных использует: `telegram_id, first_name, last_name` (snake_case)
- Тесты отправляли: смесь обоих форматов
- **Результат:** 15 из 30 тестов падали

**Решение:**
- ✅ Backend уже правильно настроен (models/db.js преобразует camelCase → snake_case)
- ✅ Валидация (validation.js) ожидает camelCase
- 🔄 Исправление всех тестов использовать camelCase

**Затронутые файлы:**
- `__tests__/auth.test.js` (5 тестов)
- `__tests__/orders.test.js` (12 тестов)
- `__tests__/payments.test.js` (3 теста)

---

## ⚠️ Второстепенные проблемы

### 2. Отсутствие линтера

**Проблема:**
- Нет автоматической проверки качества кода
- Могут быть скрытые ошибки

**Решение:**
- Добавить ESLint для backend
- Добавить ESLint для bot
- Создать npm scripts: `lint`, `lint:fix`

### 3. Deprecation Warnings

**Проблема:**
```
DeprecationWarning: The `punycode` module is deprecated
```

**Решение:**
- Обновить зависимости (validator, другие пакеты)

---

## 📊 Текущий статус

**Тесты:** 15 passing / 15 failing (50%)
**Backend:** ✅ Работает стабильно на :3000
**Bot:** ✅ Работает стабильно
**Database:** ✅ Подключена

---

## 🎯 План действий

1. **Исправить все тесты** (приоритет) ⏳ В ПРОЦЕССЕ
   - auth.test.js: использовать camelCase
   - orders.test.js: использовать camelCase
   - payments.test.js: проверить и исправить

2. **Добавить ESLint**
   - backend: eslint + airbnb-base config
   - bot: eslint + config

3. **Обновить зависимости**
   - Устранить deprecation warnings

4. **Финальная проверка**
   - 30/30 тестов проходят
   - Линтер без ошибок
   - Чистые логи

5. **Git commit**
   - Закоммитить все исправления
   - Обновить документацию

---

## ✅ Ожидаемый результат

После исправления:
- ✅ 30/30 backend тестов проходят
- ✅ Единая naming convention (camelCase API, snake_case DB)
- ✅ ESLint настроен и работает
- ✅ Нет warnings в логах
- ✅ Код готов к production

**Оценка времени:** ~2-3 часа
