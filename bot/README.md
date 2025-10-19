# Telegram Shop Bot

Минималистичный Telegram бот для e-commerce платформы Status Stock с поддержкой криптовалютных платежей.

## Возможности

### Для продавцов:
- Регистрация магазина ($25 в крипто)
- Добавление товаров через бота
- Управление товарами через WebApp
- Просмотр продаж

### Для покупателей:
- Поиск магазинов
- Подписка на магазины
- Просмотр заказов через WebApp
- Уведомления о новых товарах

### Поддерживаемые валюты:
- Bitcoin (BTC)
- Ethereum (ETH)
- USDT (ERC-20)
- Litecoin (LTC)

## Установка

### 1. Установка зависимостей:
```bash
npm install
```

### 2. Настройка окружения:
```bash
cp .env.example .env
```

Отредактируйте `.env`:
```env
BOT_TOKEN=your_telegram_bot_token
BACKEND_URL=http://localhost:3000
WEBAPP_URL=https://your-domain.com
NODE_ENV=development
```

### 3. Запуск:

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## Структура проекта

```
bot/
├── src/
│   ├── bot.js                  # Главный файл бота
│   ├── config/
│   │   └── index.js            # Конфигурация
│   ├── utils/
│   │   ├── logger.js           # Winston logger
│   │   └── api.js              # Backend API client
│   ├── keyboards/
│   │   ├── main.js             # Главное меню
│   │   ├── seller.js           # Меню продавца
│   │   ├── buyer.js            # Меню покупателя
│   │   └── common.js           # Общие кнопки
│   ├── handlers/
│   │   ├── start.js            # /start команда
│   │   ├── seller/
│   │   │   └── index.js        # Seller handlers
│   │   ├── buyer/
│   │   │   └── index.js        # Buyer handlers
│   │   └── common.js           # Общие handlers
│   ├── scenes/
│   │   ├── createShop.js       # Wizard: создание магазина
│   │   ├── addProduct.js       # Wizard: добавление товара
│   │   └── searchShop.js       # Wizard: поиск магазина
│   └── middleware/
│       ├── auth.js             # Автоматическая авторизация
│       └── error.js            # Обработка ошибок
├── logs/                       # Логи бота
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── DESIGN_PRINCIPLES.md       # UX/UI гайдлайны
```

## Design Principles

Бот следует минималистичным принципам дизайна:

### Сообщения:
- **2-3 строки текста** максимум
- **Без emoji** в тексте (только в кнопках)
- **Краткость** - каждое слово на вес золота
- **Actionable** - фокус на следующий шаг

### Клавиатуры:
- **3-5 кнопок** на экран максимум
- **Inline keyboards** для всех действий
- **Всегда кнопка "Назад"** для выхода
- **Web App buttons** для сложных интерфейсов

### Примеры:

**✓ Хорошо:**
```
Telegram Shop

Выберите роль:
[🛍 Покупатель]
[💼 Продавец]
```

**✗ Плохо:**
```
👋 Привет! Добро пожаловать в наш замечательный бот! 🎉
Мы очень рады что вы здесь! Здесь вы можете создавать
магазины, продавать товары, покупать у других продавцов
и многое другое! Давайте начнём? 🚀
```

Подробнее: [DESIGN_PRINCIPLES.md](./DESIGN_PRINCIPLES.md)

## User Flows

### Seller Flow:

1. **Регистрация магазина:**
   ```
   /start → Продавец → Создать магазин
   → Выбор валюты → Адрес для оплаты
   → Ввод TX hash → Верификация
   → Название магазина → ✓ Создан
   ```

2. **Добавление товара:**
   ```
   Добавить товар → Название
   → Цена → Валюта → ✓ Добавлен
   ```

### Buyer Flow:

1. **Поиск магазина:**
   ```
   /start → Покупатель → Найти магазин
   → Ввод названия → Результат
   → Подписаться / Открыть
   ```

2. **Просмотр подписок:**
   ```
   Покупатель → Подписки
   → Список магазинов
   ```

## API Integration

Бот интегрируется с Backend API:

### Endpoints используемые ботом:
- `POST /api/auth/telegram` - Авторизация
- `GET /api/shops/my` - Получить мой магазин
- `POST /api/shops` - Создать магазин
- `GET /api/shops/search` - Поиск магазинов
- `POST /api/products` - Создать товар
- `POST /api/payments/address` - Сгенерировать адрес
- `POST /api/payments/verify` - Проверить платеж
- `POST /api/subscriptions/:shopId` - Подписаться
- `GET /api/subscriptions/my` - Мои подписки

### Аутентификация:
- Автоматическая через middleware
- JWT токен хранится в session
- Передается в `Authorization: Bearer <token>` header

## FSM (Finite State Machine)

Бот использует Telegraf Scenes для multi-step flows:

### Scenes:
- **createShop** - 6 шагов регистрации магазина
- **addProduct** - 4 шага добавления товара
- **searchShop** - 2 шага поиска магазина

### Преимущества:
- Четкий контроль за прогрессом пользователя
- Возможность отмены на любом шаге
- Сохранение состояния между шагами
- Изоляция логики каждого шага

## Logging

### Winston logger с:
- Console output (цветной)
- File output:
  - `logs/combined.log` - все логи
  - `logs/error.log` - только ошибки

### Log levels:
- `error` - Ошибки (API, scene, handler)
- `warn` - Предупреждения
- `info` - Основные события (start, auth, создание)
- `debug` - Детальная отладка (API requests)

## Error Handling

### Глобальная обработка через middleware:
```javascript
try {
  await next();
} catch (error) {
  logger.error('Error in handler:', error);
  await ctx.reply('Произошла ошибка\n\nПопробуйте позже');
}
```

### User-friendly messages:
- НЕ показываем technical errors пользователю
- Даем понятные объяснения
- Предлагаем альтернативы
- Логируем детали для debugging

## Environment Variables

```env
# Required
BOT_TOKEN=your_bot_token              # От @BotFather
BACKEND_URL=http://localhost:3000     # Backend API URL

# Optional
WEBAPP_URL=https://your-domain.com    # WebApp URL (для кнопок)
NODE_ENV=development                  # development | production
LOG_LEVEL=info                        # debug | info | warn | error
```

## Получение BOT_TOKEN

1. Открыть [@BotFather](https://t.me/BotFather)
2. Отправить `/newbot`
3. Указать название бота
4. Указать username (должен заканчиваться на `bot`)
5. Скопировать токен в `.env`

## Development

### Hot reload:
```bash
npm run dev
```

Использует `nodemon` для автоматического перезапуска при изменениях.

### Debugging:
- Логи в консоль (цветные)
- Логи в `logs/` директорию
- Используй `LOG_LEVEL=debug` для детальных логов

## Production

### Systemd service (рекомендуется):

```ini
[Unit]
Description=Telegram Shop Bot
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/bot
ExecStart=/usr/bin/node src/bot.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Docker (альтернатива):
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "src/bot.js"]
```

## Testing

### Manual testing:
1. Запустить бота локально
2. Открыть бота в Telegram
3. Пройти основные flows:
   - /start
   - Seller registration
   - Add product
   - Buyer search
   - Subscribe

### Checklist:
- [ ] /start работает
- [ ] Роли переключаются
- [ ] Scenes работают (создание магазина, товара, поиск)
- [ ] API calls успешны
- [ ] Error handling корректный
- [ ] Кнопки "Назад" работают
- [ ] Логи пишутся

## Troubleshooting

### Bot не запускается:
```bash
# Проверь BOT_TOKEN
echo $BOT_TOKEN

# Проверь логи
tail -f logs/error.log

# Проверь Backend доступность
curl http://localhost:3000/health
```

### API errors:
```bash
# Проверь BACKEND_URL
echo $BACKEND_URL

# Проверь доступность
curl $BACKEND_URL/api/health
```

### Session issues:
```bash
# Перезапусти бота
npm restart

# Очисти старые sessions (если есть persistence)
```

## Roadmap

- [ ] Добавить notifications о новых товарах
- [ ] Добавить admin команды
- [ ] Добавить analytics (количество пользователей, магазинов)
- [ ] Добавить мультиязычность (i18n)
- [ ] Добавить rate limiting
- [ ] Добавить webhook mode (вместо polling)

## Contributing

1. Следуй [DESIGN_PRINCIPLES.md](./DESIGN_PRINCIPLES.md)
2. Используй ESLint/Prettier (если настроены)
3. Пиши понятные commit messages
4. Тестируй изменения локально

## License

ISC

## Support

- Telegram: [@your_support_bot](https://t.me/your_support_bot)
- Email: support@example.com
- GitHub Issues: [github.com/your-repo/issues](https://github.com/your-repo/issues)
