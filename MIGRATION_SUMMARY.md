# Migration Summary: Add selected_role Column

## Что изменено

### 1. Database Schema (`/Users/sile/Documents/Status Stock 4.0/backend/database/schema.sql`)

**Добавлено поле в таблицу users (после last_name):**
```sql
selected_role VARCHAR(20) CHECK (selected_role IN ('buyer', 'seller'))
```

**Добавлен индекс (в секции Indexes):**
```sql
CREATE INDEX IF NOT EXISTS idx_users_selected_role ON users(selected_role)
```

### 2. Migration Script (`/Users/sile/Documents/Status Stock 4.0/backend/database/migrations.cjs`)

**Добавлена функция для incremental migration:**
```javascript
async function addSelectedRoleColumn() {
  // Проверяет существование колонки
  // Добавляет колонку с CHECK constraint
  // Создает индекс
}
```

**Добавлен CLI параметр:**
```bash
--add-selected-role    # Запустить incremental migration
```

## Как применить миграцию

### Вариант 1: Incremental (без потери данных)

```bash
cd backend
node database/migrations.cjs --add-selected-role --no-schema
```

### Вариант 2: Full Reset (удалит все данные!)

```bash
make db-reset
```

### Вариант 3: Проверить help

```bash
cd backend
node database/migrations.cjs --help
```

## Откат миграции

Если нужно откатить:

```bash
make db-shell
```

Затем в psql:
```sql
DROP INDEX IF EXISTS idx_users_selected_role;
ALTER TABLE users DROP COLUMN IF EXISTS selected_role;
```

## Характеристики

- **Nullable:** Да (NULL разрешен)
- **Default:** NULL
- **CHECK Constraint:** `selected_role IN ('buyer', 'seller')`
- **Indexed:** Да (`idx_users_selected_role`)
- **Idempotent:** Да (можно запускать повторно)
- **Backward Compatible:** Да (существующие записи не затрагиваются)

## Проверка после миграции

```bash
make db-shell
```

В psql:
```sql
-- Проверить структуру
\d users

-- Проверить индекс
\di idx_users_selected_role

-- Тест вставки
INSERT INTO users (telegram_id, username, selected_role)
VALUES (999999, 'test', 'buyer');

-- Тест обновления
UPDATE users SET selected_role = 'seller' WHERE telegram_id = 999999;

-- Тест невалидного значения (должна быть ошибка)
UPDATE users SET selected_role = 'invalid' WHERE telegram_id = 999999;

-- Очистить тестовые данные
DELETE FROM users WHERE telegram_id = 999999;
```

## Файлы с изменениями

1. `/Users/sile/Documents/Status Stock 4.0/backend/database/schema.sql` - обновлена схема
2. `/Users/sile/Documents/Status Stock 4.0/backend/database/migrations.cjs` - добавлена incremental migration
3. `/Users/sile/Documents/Status Stock 4.0/backend/database/MIGRATION_SELECTED_ROLE.md` - подробная документация

## Статус

✅ Schema обновлена
✅ Миграция создана
✅ Документация готова
⏳ **НЕ применено** - нужно запустить вручную

## Следующие шаги

1. **Применить миграцию:**
   ```bash
   cd backend
   node database/migrations.cjs --add-selected-role --no-schema
   ```

2. **Обновить код backend/bot** для использования нового поля

3. **Проверить работоспособность**

## Дополнительная информация

См. `/Users/sile/Documents/Status Stock 4.0/backend/database/MIGRATION_SELECTED_ROLE.md` для:
- Детального описания изменений
- Примеров использования в коде
- Тестовых SQL запросов
- Performance impact анализа
