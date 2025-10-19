# Пример миграции контроллера на новые утилиты

## Было (authController.js - старая версия)

```javascript
export const authController = {
  login: async (req, res) => {
    try {
      const { telegramId, initData } = req.body;

      const isValid = telegramService.verifyInitData(initData);

      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid Telegram authentication data'
        });
      }

      // ... остальной код

    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({
        success: false,
        error: 'Login failed'
      });
    }
  }
};
```

## Стало (с новыми утилитами)

```javascript
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { userQueries } from '../models/db.js';
import telegramService from '../services/telegram.js';

// Импорт новых утилит
import { asyncHandler, ApiError } from '../middleware/index.js';
import { logger, successResponse, sanitizeInput } from '../utils/index.js';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, HTTP_STATUS } from '../utils/constants.js';

/**
 * Login or register user via Telegram Web App
 */
export const login = asyncHandler(async (req, res) => {
  const { telegramId, initData } = req.body;

  logger.info('Login attempt', { telegramId });

  // Verify Telegram init data
  const isValid = telegramService.verifyInitData(initData);

  if (!isValid) {
    logger.warn('Invalid Telegram auth data', { telegramId });
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      'Invalid Telegram authentication data'
    );
  }

  // Parse user data from init data
  const userData = telegramService.parseInitData(initData);

  // Check if user exists
  let user = await userQueries.findByTelegramId(telegramId);

  if (!user) {
    // Create new user
    logger.info('Creating new user', { telegramId });

    user = await userQueries.create({
      telegramId: userData.id,
      username: sanitizeInput(userData.username),
      firstName: sanitizeInput(userData.firstName),
      lastName: sanitizeInput(userData.lastName)
    });

    logger.info('User created', { userId: user.id, telegramId });
  }

  // Generate JWT token
  const token = jwt.sign(
    {
      id: user.id,
      telegramId: user.telegram_id,
      username: user.username
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  logger.info('User logged in', { userId: user.id, telegramId: user.telegram_id });

  res.status(HTTP_STATUS.OK).json(
    successResponse(
      {
        token,
        user: {
          id: user.id,
          telegramId: user.telegram_id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          createdAt: user.created_at
        }
      },
      SUCCESS_MESSAGES.LOGIN_SUCCESS
    )
  );
});

/**
 * Register new user
 */
export const register = asyncHandler(async (req, res) => {
  const { telegramId, username, firstName, lastName } = req.body;

  logger.info('Registration attempt', { telegramId, username });

  // Check if user already exists
  const existingUser = await userQueries.findByTelegramId(telegramId);

  if (existingUser) {
    logger.warn('Registration failed - user exists', { telegramId });
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      ERROR_MESSAGES.USER_ALREADY_EXISTS
    );
  }

  // Create new user with sanitized input
  const user = await userQueries.create({
    telegramId,
    username: sanitizeInput(username),
    firstName: sanitizeInput(firstName),
    lastName: sanitizeInput(lastName)
  });

  logger.info('User registered', { userId: user.id, telegramId });

  // Generate JWT token
  const token = jwt.sign(
    {
      id: user.id,
      telegramId: user.telegram_id,
      username: user.username
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  res.status(HTTP_STATUS.CREATED).json(
    successResponse(
      {
        token,
        user: {
          id: user.id,
          telegramId: user.telegram_id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          createdAt: user.created_at
        }
      },
      SUCCESS_MESSAGES.REGISTER_SUCCESS
    )
  );
});

/**
 * Get current user profile
 */
export const getProfile = asyncHandler(async (req, res) => {
  const user = await userQueries.findById(req.user.id);

  if (!user) {
    logger.warn('User profile not found', { userId: req.user.id });
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);
  }

  logger.debug('User profile fetched', { userId: user.id });

  res.json(
    successResponse({
      id: user.id,
      telegramId: user.telegram_id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    })
  );
});

/**
 * Update user profile
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const { username, firstName, lastName } = req.body;

  logger.info('Updating user profile', { userId: req.user.id });

  const user = await userQueries.update(req.user.id, {
    username: sanitizeInput(username),
    firstName: sanitizeInput(firstName),
    lastName: sanitizeInput(lastName)
  });

  if (!user) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);
  }

  logger.info('User profile updated', { userId: user.id });

  res.json(
    successResponse(
      {
        id: user.id,
        telegramId: user.telegram_id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        updatedAt: user.updated_at
      },
      'Profile updated successfully'
    )
  );
});

export default {
  login,
  register,
  getProfile,
  updateProfile
};
```

## Основные изменения

### 1. Async Error Handling
**Было:**
```javascript
login: async (req, res) => {
  try {
    // код
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}
```

**Стало:**
```javascript
export const login = asyncHandler(async (req, res) => {
  // код
  // Ошибки автоматически обрабатываются middleware
});
```

### 2. Error Handling
**Было:**
```javascript
if (!isValid) {
  return res.status(401).json({
    success: false,
    error: 'Invalid data'
  });
}
```

**Стало:**
```javascript
if (!isValid) {
  throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid data');
}
```

### 3. Logging
**Было:**
```javascript
console.error('Login error:', error);
console.log('User created:', user);
```

**Стало:**
```javascript
logger.error('Login error', { error: error.message, userId: user.id });
logger.info('User created', { userId: user.id, telegramId });
logger.warn('Invalid attempt', { telegramId });
logger.debug('Debug info', { data });
```

### 4. Response Format
**Было:**
```javascript
return res.status(200).json({
  success: true,
  data: { user, token }
});
```

**Стало:**
```javascript
res.status(HTTP_STATUS.OK).json(
  successResponse(
    { user, token },
    SUCCESS_MESSAGES.LOGIN_SUCCESS
  )
);
```

### 5. Constants Usage
**Было:**
```javascript
return res.status(404).json({
  success: false,
  error: 'User not found'
});
```

**Стало:**
```javascript
throw new ApiError(
  HTTP_STATUS.NOT_FOUND,
  ERROR_MESSAGES.USER_NOT_FOUND
);
```

### 6. Input Sanitization
**Было:**
```javascript
const user = await userQueries.create({
  username: userData.username,
  firstName: userData.firstName
});
```

**Стало:**
```javascript
const user = await userQueries.create({
  username: sanitizeInput(userData.username),
  firstName: sanitizeInput(userData.firstName)
});
```

## Преимущества новой версии

1. **Меньше кода** - asyncHandler убирает try/catch блоки
2. **Структурированное логирование** - Winston с JSON форматом
3. **Централизованная обработка ошибок** - Один error handler на весь app
4. **Стандартизированные ответы** - Единый формат для всех эндпоинтов
5. **Безопасность** - Автоматическая очистка input данных
6. **Константы** - Нет magic strings, все в одном месте
7. **Production-ready** - Логирование, error handling, security

## Чек-лист миграции контроллера

- [ ] Заменить `async (req, res) => { try/catch }` на `asyncHandler(async (req, res) => {})`
- [ ] Заменить `console.log/error` на `logger.info/error/warn/debug`
- [ ] Заменить `return res.status(500).json()` на `throw new ApiError()`
- [ ] Использовать `successResponse()` для всех успешных ответов
- [ ] Использовать константы из `ERROR_MESSAGES`, `HTTP_STATUS`
- [ ] Добавить `sanitizeInput()` для всех пользовательских данных
- [ ] Добавить логирование на важных этапах (login, create, update, delete)
- [ ] Заменить magic numbers (404, 500) на `HTTP_STATUS.NOT_FOUND`

## Пример с валидацией

```javascript
import { body, validationResult } from 'express-validator';
import { validationErrorHandler } from '../middleware/index.js';

export const createProduct = [
  // Validation middleware
  body('name').notEmpty().trim().isLength({ max: 255 }),
  body('price').isNumeric().isFloat({ min: 0 }),
  body('currency').isIn(['BTC', 'ETH', 'USDT', 'TON']),
  body('stock').isInt({ min: 0 }),

  // Handler
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    logger.info('Creating product', {
      userId: req.user.id,
      productName: req.body.name
    });

    const product = await productQueries.create({
      ...req.body,
      name: sanitizeInput(req.body.name),
      description: sanitizeInput(req.body.description),
      ownerId: req.user.id
    });

    logger.info('Product created', {
      productId: product.id,
      userId: req.user.id
    });

    res.status(HTTP_STATUS.CREATED).json(
      successResponse(product, SUCCESS_MESSAGES.PRODUCT_CREATED)
    );
  })
];
```
