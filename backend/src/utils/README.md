# Backend Utilities Documentation

## Overview
Professional utility functions and helpers for the Telegram E-Commerce Platform backend.

## Files

### 1. logger.js
Winston-based logger with file rotation and environment-aware logging.

**Features:**
- Daily log file rotation
- Separate error logs (30 days retention)
- Combined logs (14 days retention)
- Colored console output in development
- JSON format for production logs

**Usage:**
```javascript
import logger from './utils/logger.js';

logger.info('Server started', { port: 3000 });
logger.error('Database error', { error: err.message });
logger.warn('Rate limit exceeded', { ip: req.ip });
logger.debug('Request payload', { data });
```

### 2. helpers.js
Common utility functions for data formatting, validation, and manipulation.

**Functions:**

#### formatCurrency(amount, currency)
Format cryptocurrency amounts with proper decimals
```javascript
formatCurrency(0.00123456, 'BTC') // "0.00123456"
formatCurrency(1234.5, 'USDT')    // "1234.50"
```

#### validateWalletAddress(address, currency)
Validate cryptocurrency wallet addresses
```javascript
validateWalletAddress('0x742d35Cc6634C0532925a3b8...', 'ETH') // true
validateWalletAddress('invalid', 'BTC') // false
```

#### generateOrderId()
Generate unique order identifiers
```javascript
generateOrderId() // "ORD-L8XK9-A3B5C"
```

#### sanitizeInput(str)
Clean and sanitize user input
```javascript
sanitizeInput('  <script>alert("xss")</script>  ') // "scriptalert(xss)/script"
```

#### getPagination(page, limit)
Calculate pagination parameters
```javascript
getPagination(2, 20) // { page: 2, limit: 20, offset: 20 }
```

#### successResponse(data, message)
Create standardized success responses
```javascript
successResponse({ id: 1, name: 'Product' }, 'Created')
// { success: true, message: 'Created', data: { id: 1, name: 'Product' } }
```

#### errorResponse(error, details)
Create standardized error responses
```javascript
errorResponse('Not found', { id: 123 })
// { success: false, error: 'Not found', details: { id: 123 } }
```

### 3. constants.js
Application-wide constants and enumerations.

**Exports:**
- `ORDER_STATUS` - Order lifecycle states
- `PAYMENT_STATUS` - Payment states
- `SUPPORTED_CURRENCIES` - Cryptocurrency configurations
- `USER_ROLES` - User permission levels
- `HTTP_STATUS` - HTTP status codes
- `ERROR_MESSAGES` - Standardized error messages
- `SUCCESS_MESSAGES` - Standardized success messages

**Usage:**
```javascript
import { ORDER_STATUS, HTTP_STATUS, ERROR_MESSAGES } from './utils/constants.js';

if (order.status === ORDER_STATUS.PENDING) {
  return res.status(HTTP_STATUS.OK).json({
    error: ERROR_MESSAGES.ORDER_NOT_PAID
  });
}
```

## Best Practices

1. **Always use logger instead of console.log**
   ```javascript
   // Bad
   console.log('User registered:', user);

   // Good
   logger.info('User registered', { userId: user.id });
   ```

2. **Validate wallet addresses before processing**
   ```javascript
   if (!validateWalletAddress(address, currency)) {
     throw new ApiError(400, ERROR_MESSAGES.INVALID_WALLET_ADDRESS);
   }
   ```

3. **Sanitize all user inputs**
   ```javascript
   const cleanName = sanitizeInput(req.body.name);
   const cleanDesc = sanitizeInput(req.body.description);
   ```

4. **Use consistent response formats**
   ```javascript
   // Success
   res.json(successResponse(data, 'Operation successful'));

   // Error
   res.status(400).json(errorResponse('Validation failed', errors));
   ```

## Environment Variables

Logger configuration is controlled by:
- `NODE_ENV` - Determines log level and format
  - `development` - Debug level, colored console output
  - `production` - Info level, JSON format only

## Log Files

Logs are stored in `/backend/logs/`:
- `combined-YYYY-MM-DD.log` - All logs (info and above)
- `error-YYYY-MM-DD.log` - Error logs only

Files are automatically rotated daily and cleaned up after retention period.
