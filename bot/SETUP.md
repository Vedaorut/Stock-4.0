# Быстрый старт - Telegram Bot

## Создано файлов: 21

### Структура проекта:

```
bot/
├── package.json                      ✓ Создан
├── .env.example                      ✓ Обновлен
├── .gitignore                        ✓ Создан
├── README.md                         ✓ Обновлен
├── DESIGN_PRINCIPLES.md              ✓ Существует
├── SETUP.md                          ✓ Этот файл
│
└── src/
    ├── bot.js                        ✓ Создан (главный файл)
    │
    ├── config/
    │   └── index.js                  ✓ Создан (конфигурация, валюты)
    │
    ├── utils/
    │   ├── logger.js                 ✓ Создан (Winston logger)
    │   └── api.js                    ✓ Создан (Backend API client)
    │
    ├── keyboards/
    │   ├── main.js                   ✓ Создан (главное меню)
    │   ├── seller.js                 ✓ Создан (продавец + валюты)
    │   ├── buyer.js                  ✓ Создан (покупатель)
    │   └── common.js                 ✓ Создан (назад, отмена)
    │
    ├── middleware/
    │   ├── auth.js                   ✓ Создан (авто-логин)
    │   └── error.js                  ✓ Создан (глобальные ошибки)
    │
    ├── handlers/
    │   ├── start.js                  ✓ Создан (/start)
    │   ├── seller/
    │   │   └── index.js              ✓ Создан (seller handlers)
    │   ├── buyer/
    │   │   └── index.js              ✓ Создан (buyer handlers)
    │   └── common.js                 ✓ Создан (навигация)
    │
    └── scenes/
        ├── createShop.js             ✓ Создан (FSM: 6 шагов)
        ├── addProduct.js             ✓ Создан (FSM: 4 шага)
        └── searchShop.js             ✓ Создан (FSM: 2 шага)
```

---

## Реализованные features:

### 1. FSM (Finite State Machine) Scenes:
- **createShop** - 6 шагов регистрации магазина
  - Выбор валюты (BTC/ETH/USDT/LTC)
  - Показ адреса для оплаты
  - Ожидание TX hash
  - Верификация платежа
  - Ввод названия магазина
  - Завершение

- **addProduct** - 4 шага добавления товара
  - Ввод названия
  - Ввод цены
  - Выбор валюты
  - Завершение

- **searchShop** - 2 шага поиска
  - Ввод названия
  - Показ результата

### 2. Минималистичный дизайн:
- Сообщения: 2-3 строки
- Клавиатуры: 3-5 кнопок
- Emoji только в кнопках
- Edit вместо send (smoother UX)
- Всегда кнопка "Назад"

### 3. Backend Integration:
- Автоматическая аутентификация (middleware)
- JWT токен в session
- API client с interceptors
- Graceful error handling

### 4. Logging:
- Winston logger (console + file)
- Цветные логи в консоль
- `logs/combined.log` - все логи
- `logs/error.log` - только ошибки

### 5. Валюты:
- Bitcoin (BTC) ₿
- Ethereum (ETH) Ξ
- USDT (ERC-20) ₮
- Litecoin (LTC) Ł

---

## Установка и запуск:

### 1. Установить зависимости:
```bash
cd /Users/sile/Documents/Status\ Stock\ 4.0/bot
npm install
```

### 2. Настроить .env:
```bash
cp .env.example .env
nano .env
```

Заполнить:
```env
BOT_TOKEN=your_bot_token_from_botfather
BACKEND_URL=http://localhost:3000
WEBAPP_URL=https://your-domain.com
NODE_ENV=development
LOG_LEVEL=info
```

### 3. Получить BOT_TOKEN:
1. Открыть [@BotFather](https://t.me/BotFather)
2. `/newbot`
3. Указать название и username
4. Скопировать токен в `.env`

### 4. Запустить Backend (обязательно!):
```bash
cd ../backend
npm run dev
# Backend должен работать на http://localhost:3000
```

### 5. Запустить бота:
```bash
# Development (с hot reload):
npm run dev

# Production:
npm start
```

---

## Проверка работоспособности:

### 1. Логи:
После запуска проверь логи:
```bash
tail -f logs/combined.log
# Должно быть:
# Bot started successfully in development mode
# Backend URL: http://localhost:3000
# WebApp URL: https://your-domain.com
```

### 2. Telegram:
1. Открой своего бота в Telegram
2. `/start`
3. Должно появиться:
   ```
   Telegram Shop

   Выберите роль:
   [🛍 Покупатель]
   [💼 Продавец]
   ```

### 3. Проверь Backend:
```bash
curl http://localhost:3000/health
# Должен вернуть: {"status":"ok"}
```

---

## User Flows реализованы:

### Seller Flow:
```
/start
  → Продавец
    → Создать магазин
      → Выбор валюты (BTC/ETH/USDT/LTC)
      → Адрес для оплаты
      → Ввод TX hash
      → Верификация
      → Название магазина
      → ✓ Создан

    → Добавить товар
      → Название
      → Цена
      → Валюта
      → ✓ Добавлен

    → Мои товары (WebApp)
    → Продажи (WebApp)
    → Приложение (WebApp)
```

### Buyer Flow:
```
/start
  → Покупатель
    → Найти магазин
      → Ввод названия
      → Результат
      → Подписаться / Открыть (WebApp)

    → Подписки
      → Список магазинов

    → Заказы (WebApp)
    → Приложение (WebApp)
```

---

## Следующие шаги:

1. **Настроить Backend API:**
   - Убедись что endpoints реализованы:
     - `POST /api/auth/telegram`
     - `GET /api/shops/my`
     - `POST /api/shops`
     - `POST /api/products`
     - `POST /api/payments/address`
     - `POST /api/payments/verify`
     - И другие (см. README.md)

2. **Протестировать flows:**
   - [ ] /start работает
   - [ ] Роли переключаются
   - [ ] createShop scene (6 шагов)
   - [ ] addProduct scene (4 шага)
   - [ ] searchShop scene (2 шага)

3. **Настроить WebApp URLs:**
   - Обновить `WEBAPP_URL` в `.env`
   - Проверить что WebApp открывается через кнопки

4. **Production deployment:**
   - Настроить systemd service (см. README.md)
   - ИЛИ Docker (см. README.md)
   - Настроить логи rotation

---

## Troubleshooting:

### Bot не запускается:
```bash
# Проверь BOT_TOKEN
cat .env | grep BOT_TOKEN

# Проверь логи
cat logs/error.log

# Проверь Node версию (нужна >=18)
node --version
```

### "BOT_TOKEN is not defined":
```bash
# Убедись что .env существует
ls -la .env

# Проверь формат
cat .env
# Должно быть: BOT_TOKEN=123456:ABC-DEF...
# БЕЗ пробелов и кавычек!
```

### "Failed to fetch" / API errors:
```bash
# Проверь Backend
curl http://localhost:3000/health

# Если не работает - запусти Backend
cd ../backend
npm run dev
```

### Session errors:
```bash
# Перезапусти бота
pkill -f "node src/bot.js"
npm run dev
```

---

## Полезные команды:

```bash
# Запуск с debug логами
LOG_LEVEL=debug npm run dev

# Просмотр логов в реальном времени
tail -f logs/combined.log

# Просмотр только ошибок
tail -f logs/error.log

# Проверка процесса
ps aux | grep "node src/bot.js"

# Остановка бота
pkill -f "node src/bot.js"
```

---

## Документация:

- **README.md** - Полная документация
- **DESIGN_PRINCIPLES.md** - UX/UI гайдлайны
- **src/bot.js** - Точка входа (начни отсюда)
- **src/scenes/** - FSM логика (multi-step flows)
- **src/handlers/** - Event handlers
- **src/keyboards/** - Inline keyboards

---

## Контакты:

Если нужна помощь:
1. Проверь логи: `tail -f logs/error.log`
2. Прочитай README.md
3. Прочитай DESIGN_PRINCIPLES.md
4. Проверь Backend API доступность

---

**Статус:** ✓ Готов к запуску

**Следующий шаг:** Установить зависимости (`npm install`)
