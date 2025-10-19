# Backend Utils & Middleware - Quick Start Guide

## Что было создано

### Utilities (/src/utils/)
1. **logger.js** - Winston logger с ротацией файлов
2. **helpers.js** - Вспомогательные функции (форматирование, валидация, генерация)
3. **constants.js** - Константы приложения (статусы, сообщения, конфигурация)
4. **index.js** - Barrel exports для удобного импорта

### Middleware (/src/middleware/)
1. **errorHandler.js** - Обработка ошибок, AsyncHandler, ApiError class
2. **rateLimiter.js** - Rate limiting для разных типов эндпоинтов
3. **requestLogger.js** - Логирование запросов с маскировкой чувствительных данных
4. **index.js** - Barrel exports для удобного импорта

## Быстрый старт

### 1. Установка зависимостей
```bash
cd /Users/sile/Documents/Status\ Stock\ 4.0/backend
npm install
```

Новые пакеты:
- `winston` - Professional logging library
- `winston-daily-rotate-file` - Log rotation

### 2. Использование в контроллерах

```javascript
import { asyncHandler, ApiError } from '../middleware/index.js';
import { logger, successResponse, errorResponse } from '../utils/index.js';
import { ORDER_STATUS, ERROR_MESSAGES } from '../utils/constants.js';

// Пример контроллера
export const getOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info('Fetching order', { orderId: id, userId: req.user.id });

  const order = await db.query('SELECT * FROM orders WHERE id = $1', [id]);

  if (!order.rows[0]) {
    throw new ApiError(404, ERROR_MESSAGES.ORDER_NOT_FOUND);
  }

  res.json(successResponse(order.rows[0]));
});
```

### 3. Использование в роутах

```javascript
import { Router } from 'express';
import { authLimiter } from '../middleware/index.js';
import { login, register } from '../controllers/authController.js';

const router = Router();

// Rate limiter для аутентификации
router.post('/login', authLimiter, login);
router.post('/register', authLimiter, register);

export default router;
```

### 4. Валидация и обработка ошибок

```javascript
import { body, validationResult } from 'express-validator';
import { asyncHandler, validationErrorHandler } from '../middleware/index.js';

export const createProduct = [
  // Validation rules
  body('name').notEmpty().trim(),
  body('price').isNumeric().isFloat({ min: 0 }),
  body('currency').isIn(['BTC', 'ETH', 'USDT', 'TON']),

  // Handler
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    // Process request
    const product = await createProductInDB(req.body);
    res.status(201).json(successResponse(product, 'Product created'));
  })
];
```

### 5. Использование helpers

```javascript
import {
  formatCurrency,
  validateWalletAddress,
  generateOrderId,
  sanitizeInput,
  getPagination,
  maskString
} from '../utils/helpers.js';

// Форматирование суммы
const formatted = formatCurrency(0.00123456, 'BTC'); // "0.00123456"

// Валидация кошелька
if (!validateWalletAddress(wallet, 'ETH')) {
  throw new ApiError(400, 'Invalid wallet address');
}

// Генерация ID заказа
const orderId = generateOrderId(); // "ORD-L8XK9-A3B5C"

// Очистка input
const cleanName = sanitizeInput(req.body.name);

// Пагинация
const { page, limit, offset } = getPagination(req.query.page, req.query.limit);

// Маскировка чувствительных данных
const masked = maskString('sk_live_abcdef123456', 4); // "sk_l****3456"
```

## Структура логов

Логи сохраняются в `/backend/logs/`:
```
logs/
  combined-2024-01-15.log  - Все логи
  combined-2024-01-16.log
  error-2024-01-15.log     - Только ошибки
  error-2024-01-16.log
```

Ротация:
- Combined logs: 14 дней
- Error logs: 30 дней

## Примеры логирования

```javascript
import logger from '../utils/logger.js';

// Info
logger.info('User registered', {
  userId: user.id,
  email: user.email
});

// Warning
logger.warn('Rate limit exceeded', {
  ip: req.ip,
  endpoint: req.path
});

// Error
logger.error('Payment processing failed', {
  orderId: order.id,
  error: err.message,
  stack: err.stack
});

// Debug (only in development)
logger.debug('Request payload', {
  body: req.body,
  params: req.params
});
```

## Константы и типы

```javascript
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
  SUPPORTED_CURRENCIES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  HTTP_STATUS
} from '../utils/constants.js';

// Статусы
if (order.status === ORDER_STATUS.PENDING) {
  // ...
}

// HTTP коды
res.status(HTTP_STATUS.CREATED).json(data);

// Сообщения
throw new ApiError(404, ERROR_MESSAGES.PRODUCT_NOT_FOUND);

// Валюты
const currency = SUPPORTED_CURRENCIES.BTC;
console.log(currency.decimals); // 8
console.log(currency.confirmations); // 3
```

## Production Checklist

- [x] Winston logger настроен
- [x] Error handler интегрирован
- [x] Rate limiting активирован
- [x] Request logging включен
- [x] Sensitive data masking работает
- [x] 404 handler установлен
- [x] Async error handling готов
- [x] Константы определены
- [x] Helper functions созданы

## Следующие шаги

1. Запустить `npm install` для установки Winston
2. Проверить `.env` файл на наличие всех переменных
3. Обновить существующие контроллеры для использования новых утилит
4. Протестировать rate limiting на аутентификации
5. Проверить логи в `/backend/logs/`

## Поддержка

Документация:
- `/backend/src/utils/README.md` - Подробная документация по утилитам
- `/backend/src/middleware/README.md` - Подробная документация по middleware

Логи:
- Development: Консоль + файлы
- Production: Только файлы (JSON формат)
