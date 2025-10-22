# Migration: Add selected_role Column to Users Table

## Описание

Добавляет поле `selected_role` в таблицу `users` для хранения выбранной роли пользователя (buyer или seller).

## Изменения

### 1. Schema Changes (`schema.sql`)

**Таблица users:**
```sql
ALTER TABLE users
ADD COLUMN selected_role VARCHAR(20) CHECK (selected_role IN ('buyer', 'seller'))
```

**Индекс:**
```sql
CREATE INDEX IF NOT EXISTS idx_users_selected_role ON users(selected_role)
```

### 2. Migration Script (`migrations.cjs`)

Добавлена функция `addSelectedRoleColumn()`:
- Проверяет существование колонки (idempotent)
- Добавляет колонку с CHECK constraint
- Создает индекс для оптимизации запросов

## Применение миграции

### Вариант 1: Incremental Migration (рекомендуется для production)

```bash
# Только добавить selected_role без пересоздания таблиц
cd backend
node database/migrations.cjs --add-selected-role --no-schema --no-indexes
```

### Вариант 2: Full Schema Recreation (для dev/test)

```bash
# Пересоздать всю схему (удалит данные!)
make db-reset
```

### Вариант 3: Через Makefile (можно добавить новую команду)

Добавить в `Makefile`:
```makefile
migrate-selected-role: ## Add selected_role column to users table
	@echo "$(CYAN)Running incremental migration: selected_role...$(NC)"
	@cd backend && node database/migrations.cjs --add-selected-role --no-schema
	@echo "$(GREEN)✓ Migration complete$(NC)"
```

Затем:
```bash
make migrate-selected-role
```

## Откат миграции

Если нужно откатить изменения:

```sql
-- Удалить индекс
DROP INDEX IF EXISTS idx_users_selected_role;

-- Удалить колонку
ALTER TABLE users DROP COLUMN IF EXISTS selected_role;
```

Или через psql:
```bash
make db-shell
# Затем выполнить SQL команды выше
```

## Проверка

После миграции проверить:

```bash
# Войти в PostgreSQL
make db-shell

# Проверить структуру таблицы
\d users

# Проверить индексы
\di idx_users_selected_role

# Проверить constraint
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE '%selected_role%';
```

Ожидаемый результат для `\d users`:
```
Column         | Type                     | Nullable | Default
---------------+--------------------------+----------+---------
selected_role  | character varying(20)    | YES      |

Check constraints:
    "users_selected_role_check" CHECK (selected_role::text = ANY (ARRAY['buyer'::character varying, 'seller'::character varying]::text[]))
```

## Совместимость

- Колонка nullable (NULL разрешен) - безопасно для существующих записей
- Индекс поддерживает частичное сканирование
- CHECK constraint работает только при INSERT/UPDATE
- Совместимо с PostgreSQL 12+

## Влияние на код

### Backend

Обновить `models/db.js`:
```javascript
// Добавить selected_role в SELECT queries
async function getUserById(id) {
  const result = await pool.query(
    'SELECT id, telegram_id, username, first_name, last_name, selected_role, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

// Обновить при выборе роли
async function updateUserRole(userId, role) {
  await pool.query(
    'UPDATE users SET selected_role = $1 WHERE id = $2',
    [role, userId]
  );
}
```

### Bot

Обновить `handlers/start.js`:
```javascript
// После выбора роли сохранить в БД
await api.updateUserRole(ctx.from.id, selectedRole);
```

## Тестирование

```sql
-- Тест 1: Добавление пользователя с selected_role
INSERT INTO users (telegram_id, username, selected_role)
VALUES (123456, 'test_user', 'buyer');

-- Тест 2: Обновление selected_role
UPDATE users SET selected_role = 'seller' WHERE telegram_id = 123456;

-- Тест 3: Попытка установить невалидное значение (должна вернуть ошибку)
UPDATE users SET selected_role = 'invalid' WHERE telegram_id = 123456;
-- ERROR: new row for relation "users" violates check constraint

-- Тест 4: NULL разрешен
UPDATE users SET selected_role = NULL WHERE telegram_id = 123456;

-- Тест 5: Запрос с фильтрацией по selected_role (проверка индекса)
EXPLAIN ANALYZE
SELECT * FROM users WHERE selected_role = 'buyer';
```

## Безопасность

- Миграция идемпотентна (можно запускать повторно)
- Не удаляет данные
- Совместима с существующими записями (NULL по умолчанию)
- CHECK constraint защищает от невалидных значений

## Performance Impact

- Minimal: индекс добавляется быстро (O(n log n))
- Добавление колонки не требует полного сканирования таблицы в PostgreSQL
- Индекс улучшает производительность WHERE selected_role = '...'
