# Middleware Documentation

## Overview
Professional middleware for error handling, rate limiting, request logging, and security.

## Files

### 1. errorHandler.js
Centralized error handling with structured logging and environment-aware responses.

**Exports:**

#### ApiError Class
Custom error class for operational errors
```javascript
import { ApiError } from './middleware/errorHandler.js';

// Throw API errors
throw new ApiError(404, 'Product not found');
throw new ApiError(400, 'Validation failed', { field: 'email' });
```

#### errorHandler(err, req, res, next)
Global error handler middleware
```javascript
app.use(errorHandler);
```

#### notFoundHandler(req, res)
404 Not Found handler
```javascript
app.use(notFoundHandler);
```

#### asyncHandler(fn)
Wrapper for async route handlers
```javascript
router.get('/users', asyncHandler(async (req, res) => {
  const users = await db.query('SELECT * FROM users');
  res.json(successResponse(users));
}));
```

#### validationErrorHandler(errors)
Express-validator error formatter
```javascript
const errors = validationResult(req);
if (!errors.isEmpty()) {
  throw validationErrorHandler(errors);
}
```

**Usage Example:**
```javascript
import { asyncHandler, ApiError } from './middleware/errorHandler.js';

router.post('/products', asyncHandler(async (req, res) => {
  const product = await createProduct(req.body);

  if (!product) {
    throw new ApiError(400, 'Failed to create product');
  }

  res.status(201).json(successResponse(product));
}));
```

### 2. rateLimiter.js
Rate limiting middleware to prevent abuse and DDoS attacks.

**Exports:**

#### authLimiter
Rate limiter for authentication endpoints (5 requests per 15 minutes)
```javascript
router.post('/auth/login', authLimiter, login);
router.post('/auth/register', authLimiter, register);
```

#### apiLimiter
General API rate limiter (100 requests per 15 minutes)
```javascript
app.use('/api/', apiLimiter);
```

#### webhookLimiter
Webhook rate limiter (30 requests per minute)
```javascript
router.post('/webhook/payment', webhookLimiter, handlePaymentWebhook);
```

#### customLimiter(options)
Create custom rate limiter
```javascript
const strictLimiter = customLimiter({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 10,                   // 10 requests
  message: 'Too many attempts'
});

router.post('/sensitive-operation', strictLimiter, handler);
```

### 3. requestLogger.js
Request/response logging middleware.

**Exports:**

#### requestLogger
Basic request/response logger
```javascript
// Use in production
if (config.nodeEnv === 'production') {
  app.use(requestLogger);
}
```

#### sensitiveDataLogger
Detailed logger with sensitive data masking
```javascript
// Use in development
if (config.nodeEnv === 'development') {
  app.use(sensitiveDataLogger);
}
```

**Features:**
- Logs all incoming requests
- Logs response status and duration
- Masks sensitive fields (password, token, secret, apiKey)
- Includes user ID if authenticated

## Middleware Stack Order

Proper middleware order in Express app:

```javascript
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import {
  errorHandler,
  notFoundHandler,
  apiLimiter,
  requestLogger
} from './middleware/index.js';

const app = express();

// 1. Security headers
app.use(helmet());

// 2. CORS
app.use(cors());

// 3. Request logging
app.use(requestLogger);

// 4. Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. Rate limiting
app.use('/api/', apiLimiter);

// 6. Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);

// 7. 404 handler
app.use(notFoundHandler);

// 8. Error handler (MUST BE LAST)
app.use(errorHandler);
```

## Error Handling Best Practices

### 1. Use ApiError for Operational Errors
```javascript
// Input validation
if (!email || !password) {
  throw new ApiError(400, 'Email and password required');
}

// Resource not found
const user = await findUser(id);
if (!user) {
  throw new ApiError(404, 'User not found');
}

// Authorization
if (user.id !== req.user.id) {
  throw new ApiError(403, 'Access forbidden');
}
```

### 2. Wrap Async Routes with asyncHandler
```javascript
router.get('/orders/:id', asyncHandler(async (req, res) => {
  const order = await getOrder(req.params.id);
  res.json(successResponse(order));
}));
```

### 3. Handle Database Errors
```javascript
try {
  await db.query('INSERT INTO users...');
} catch (err) {
  throw dbErrorHandler(err);
}
```

### 4. Handle JWT Errors
```javascript
try {
  jwt.verify(token, secret);
} catch (err) {
  throw jwtErrorHandler(err);
}
```

## Rate Limiting Configuration

Rate limits are defined in `/utils/constants.js`:

```javascript
export const RATE_LIMITS = {
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000,  // 15 minutes
    MAX_REQUESTS: 5              // 5 attempts
  },
  API: {
    WINDOW_MS: 15 * 60 * 1000,  // 15 minutes
    MAX_REQUESTS: 100            // 100 requests
  },
  WEBHOOK: {
    WINDOW_MS: 60 * 1000,       // 1 minute
    MAX_REQUESTS: 30             // 30 requests
  }
};
```

Adjust these values based on your application needs and infrastructure capacity.

## Logging Levels

- `error` - Critical errors that need immediate attention
- `warn` - Warning conditions (rate limits, failed validations)
- `info` - General informational messages (requests, responses)
- `debug` - Detailed debugging information (development only)

## Security Features

1. **Sensitive Data Masking** - Passwords, tokens, and keys are masked in logs
2. **Rate Limiting** - Prevents brute force and DDoS attacks
3. **Error Sanitization** - No stack traces leaked in production
4. **Request Tracking** - All requests logged with IP and user ID
5. **Structured Logging** - JSON format for easy parsing and monitoring
