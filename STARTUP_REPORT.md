# Отчёт о запуске

- **Схема БД**: успешно пересоздана база `telegram_shop` и применён файл `backend/database/schema.sql`; все ожидаемые таблицы присутствуют (`psql \dt` показывает 8 таблиц).
- **Backend**: процесс `node src/server.js` запущен в фоне (PID 41288), health-check `GET http://localhost:3000/health` возвращает `{ success: true }`. В `backend.log` ошибок не обнаружено.
- **Bot**: процесс `node src/bot.js` запущен в фоне (PID 41302), в `bot.log` фиксируется успешный старт. Помимо предупреждения `DeprecationWarning: The punycode module is deprecated` критичных ошибок нет.
- **Логи**: последние записи `backend.log` и `bot.log` не содержат ошибок уровня error/fatal; состояние сервисов штатное.
- **Готовность**: backend и bot готовы к дальнейшему тестированию через Telegram.
