# API Client Architecture

## Обзор архитектуры

```
┌─────────────────────────────────────────────────────────────┐
│                     Telegram Bot                             │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  Handlers  │  │ Keyboards  │  │   Bot.js   │            │
│  └─────┬──────┘  └────────────┘  └────────────┘            │
│        │                                                     │
│        │ Uses API                                           │
│        ▼                                                     │
│  ┌──────────────────────────────────────────────┐          │
│  │           API Integration Layer              │          │
│  │                                              │          │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │          │
│  │  │ Auth API │  │Shops API │  │Prod API  │ │          │
│  │  └──────────┘  └──────────┘  └──────────┘ │          │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │          │
│  │  │Order API │  │ Subs API │  │Pay API   │ │          │
│  │  └──────────┘  └──────────┘  └──────────┘ │          │
│  │                                              │          │
│  │  All use HTTP Client (client.js)            │          │
│  └───────────────────┬──────────────────────────┘          │
│                      │                                      │
│  ┌──────────────────────────────────────────────┐          │
│  │           Utilities Layer                    │          │
│  │                                              │          │
│  │  ┌──────────────┐  ┌──────────────┐         │          │
│  │  │ Token Mgr    │  │ Error Handler│         │          │
│  │  └──────────────┘  └──────────────┘         │          │
│  │  ┌──────────────┐                            │          │
│  │  │   Logger     │                            │          │
│  │  └──────────────┘                            │          │
│  └──────────────────────────────────────────────┘          │
│                      │                                      │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       │ HTTP/HTTPS
                       │ JWT Auth
                       │ Retry Logic
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend API (Express.js)                   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  /auth   │  │ /shops   │  │/products │  │ /orders  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐                                │
│  │  /subs   │  │/payments │                                │
│  └──────────┘  └──────────┘                                │
│                                                              │
│  ┌─────────────────────────────────────┐                   │
│  │      PostgreSQL Database            │                   │
│  └─────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## Структура файлов

```
bot/
├── api/                        # API клиенты
│   ├── client.js              # Базовый HTTP клиент
│   │   ├── Axios instance
│   │   ├── Retry interceptor
│   │   ├── Error handling
│   │   └── Timeout (10s)
│   │
│   ├── auth.js                # Authentication
│   │   ├── login()
│   │   ├── register()
│   │   ├── getProfile()
│   │   └── updateProfile()
│   │
│   ├── shops.js               # Shops
│   │   ├── create()
│   │   ├── getMyShops()
│   │   ├── getById()
│   │   ├── listActive()
│   │   ├── search()
│   │   ├── update()
│   │   └── delete()
│   │
│   ├── products.js            # Products
│   │   ├── create()
│   │   ├── list()
│   │   ├── getById()
│   │   ├── update()
│   │   └── delete()
│   │
│   ├── orders.js              # Orders
│   │   ├── create()
│   │   ├── getMyOrders()
│   │   ├── getById()
│   │   └── updateStatus()
│   │
│   ├── subscriptions.js       # Subscriptions
│   │   ├── subscribe()
│   │   ├── getMySubscriptions()
│   │   ├── getShopSubscribers()
│   │   ├── checkSubscription()
│   │   └── unsubscribe()
│   │
│   ├── payments.js            # Payments
│   │   ├── verify()
│   │   ├── getByOrder()
│   │   └── checkStatus()
│   │
│   ├── index.js               # Exports all APIs
│   └── README.md              # Документация
│
├── utils/                      # Утилиты
│   ├── tokenManager.js        # JWT management
│   │   ├── setToken()
│   │   ├── getToken()
│   │   ├── clearToken()
│   │   ├── isAuthenticated()
│   │   └── requireAuth()
│   │
│   ├── errorHandler.js        # Error handling
│   │   ├── formatError()
│   │   ├── handleApiCall()
│   │   ├── safeReply()
│   │   ├── safeEdit()
│   │   └── retryOperation()
│   │
│   └── logger.js              # Logging
│       ├── error()
│       ├── warn()
│       ├── info()
│       ├── debug()
│       ├── apiRequest()
│       └── userAction()
│
├── handlers/                   # Существующие handlers
│   ├── start.js
│   ├── seller.js
│   ├── buyer.js
│   └── shop.js
│
├── examples/                   # Примеры
│   └── apiUsageExamples.js
│
├── tests/                      # Тесты
│   └── api.test.js
│
├── bot.js                      # Главный файл
├── .env                        # Конфигурация
│
└── Documentation/
    ├── API_INTEGRATION_SUMMARY.md
    ├── MIGRATION_GUIDE.md
    ├── QUICK_REFERENCE.md
    └── ARCHITECTURE.md (этот файл)
```

## Data Flow

### 1. User Login Flow

```
User → Telegram → Bot
                  │
                  ├─ /start command
                  │
                  ├─ handleStart(ctx)
                  │   │
                  │   ├─ authApi.login(ctx.from)
                  │   │   │
                  │   │   ├─ POST /api/auth/login
                  │   │   │   │
                  │   │   │   └─ Backend validates
                  │   │   │       │
                  │   │   │       ├─ Creates/finds user
                  │   │   │       └─ Returns { token, user }
                  │   │   │
                  │   │   └─ Returns data
                  │   │
                  │   ├─ setToken(ctx, token)
                  │   │   └─ Saves to ctx.session.token
                  │   │
                  │   └─ Shows main menu
                  │
                  └─ User authenticated ✅
```

### 2. Create Shop Flow

```
Seller → Bot → handleCreateShop(ctx)
                │
                ├─ Get token from session
                │   token = getToken(ctx)
                │
                ├─ Call shops API
                │   shopsApi.create(token, shopData)
                │   │
                │   ├─ POST /api/shops
                │   │   Headers: { Authorization: Bearer <token> }
                │   │   Body: { name, description, currency }
                │   │
                │   ├─ Backend validates token
                │   ├─ Creates shop
                │   └─ Returns shop object
                │
                ├─ Log action
                │   logger.userAction('create_shop', userId, { shopId })
                │
                └─ Show success message
```

### 3. Create Order Flow

```
Buyer → Bot → handleCreateOrder(ctx)
                │
                ├─ Get token & cart items
                │
                ├─ ordersApi.create(token, orderData)
                │   │
                │   ├─ POST /api/orders
                │   │   Body: { shopId, items[], shippingAddress }
                │   │
                │   ├─ Backend:
                │   │   ├─ Validates products availability
                │   │   ├─ Calculates total
                │   │   ├─ Creates order
                │   │   └─ Generates payment address
                │   │
                │   └─ Returns order with payment details
                │
                ├─ Show payment info
                │   "Send X BTC to address..."
                │
                └─ Wait for payment verification
```

### 4. Payment Verification Flow

```
User sends payment → Blockchain
                      │
                      ├─ User provides tx hash
                      │
                      ├─ paymentsApi.verify(token, orderId, txHash, 'BTC')
                      │   │
                      │   ├─ POST /api/payments/verify
                      │   │   Body: { orderId, txHash, currency }
                      │   │
                      │   ├─ Backend:
                      │   │   ├─ Queries blockchain API
                      │   │   ├─ Validates transaction
                      │   │   ├─ Checks confirmations
                      │   │   ├─ Updates payment status
                      │   │   └─ Updates order status
                      │   │
                      │   └─ Returns verification result
                      │
                      └─ Show confirmation or pending status
```

## HTTP Client Flow

```
API Method Call
    │
    ├─ client.request(method, url, data, token)
    │   │
    │   ├─ Build config
    │   │   ├─ method, url, data
    │   │   └─ Authorization header if token
    │   │
    │   ├─ axios.request(config)
    │   │   │
    │   │   ├─ Network request
    │   │   │
    │   │   ├─ Response interceptor
    │   │   │   │
    │   │   │   ├─ Success? → return response
    │   │   │   │
    │   │   │   └─ Error?
    │   │   │       │
    │   │   │       ├─ Status 500+?
    │   │   │       │   │
    │   │   │       │   ├─ Retry count < 3?
    │   │   │       │   │   │
    │   │   │       │   │   ├─ Wait (exponential backoff)
    │   │   │       │   │   └─ Retry request
    │   │   │       │   │
    │   │   │       │   └─ Throw error
    │   │   │       │
    │   │   │       └─ Other errors → throw
    │   │   │
    │   │   └─ Return response.data
    │   │
    │   └─ Error handling
    │       │
    │       ├─ Format error message
    │       └─ Throw formatted error
    │
    └─ Return data or throw
```

## Error Handling Flow

```
API Call Error
    │
    ├─ handleApiCall(ctx, apiFunction)
    │   │
    │   ├─ try {
    │   │   │
    │   │   └─ Execute apiFunction()
    │   │       │
    │   │       ├─ Success → return data
    │   │       │
    │   │       └─ Error → throw
    │   │
    │   └─ catch (error)
    │       │
    │       ├─ Log error
    │       │   console.error()
    │       │
    │       ├─ Format error
    │       │   formatError(error)
    │       │   │
    │       │   ├─ 401 → 🔐 Ошибка авторизации
    │       │   ├─ 404 → 🔍 Не найдено
    │       │   ├─ 500+ → ⚠️ Ошибка сервера
    │       │   └─ Network → ⚠️ Ошибка сети
    │       │
    │       ├─ Show to user
    │       │   ctx.reply(formattedError)
    │       │
    │       └─ Return null
    │
    └─ Handler checks result
        │
        ├─ if (!result) return;
        │
        └─ Continue with data
```

## Token Management Flow

```
Bot Session
    │
    ├─ User logs in
    │   │
    │   ├─ authApi.login()
    │   │   └─ Returns { token, user }
    │   │
    │   └─ setToken(ctx, token)
    │       │
    │       └─ ctx.session.token = token
    │           (stored in-memory)
    │
    ├─ Subsequent requests
    │   │
    │   ├─ getToken(ctx)
    │   │   └─ Returns ctx.session.token
    │   │
    │   └─ API call with token
    │       Authorization: Bearer <token>
    │
    └─ User logs out
        │
        └─ clearToken(ctx)
            │
            └─ delete ctx.session.token
```

## Retry Logic

```
Request → Backend
    │
    ├─ Response status 500+?
    │   │
    │   ├─ Retry attempt 1
    │   │   │
    │   │   ├─ Wait 1 second
    │   │   └─ Retry request
    │   │       │
    │   │       ├─ Success? → Return
    │   │       └─ Failed?
    │   │           │
    │   │           ├─ Retry attempt 2
    │   │           │   │
    │   │           │   ├─ Wait 2 seconds
    │   │           │   └─ Retry request
    │   │           │       │
    │   │           │       ├─ Success? → Return
    │   │           │       └─ Failed?
    │   │           │           │
    │   │           │           ├─ Retry attempt 3
    │   │           │           │   │
    │   │           │           │   ├─ Wait 4 seconds
    │   │           │           │   └─ Retry request
    │   │           │           │       │
    │   │           │           │       ├─ Success? → Return
    │   │           │           │       └─ Failed? → Throw error
    │   │           │           │
    │   │           │           └─ Total retries: 3
    │   │           │               Total wait: ~7 seconds
    │   │           │
    │   │           └─ Exponential backoff
    │   │
    │   └─ Other errors → Throw immediately
    │
    └─ Success → Return
```

## Module Dependencies

```
bot.js
  ├─ handlers/
  │   ├─ api/
  │   │   ├─ auth.js
  │   │   ├─ shops.js
  │   │   ├─ products.js
  │   │   ├─ orders.js
  │   │   ├─ subscriptions.js
  │   │   └─ payments.js
  │   │       │
  │   │       └─ api/client.js
  │   │           ├─ axios
  │   │           └─ dotenv
  │   │
  │   └─ utils/
  │       ├─ tokenManager.js
  │       ├─ errorHandler.js
  │       └─ logger.js
  │
  ├─ keyboards/
  └─ telegraf
```

## Security Flow

```
User Request
    │
    ├─ Rate Limiting (Bot level)
    │   ├─ Track user messages
    │   ├─ Max 10 per minute
    │   └─ Block if exceeded
    │
    ├─ JWT Token
    │   ├─ Stored in session (in-memory)
    │   ├─ Not persistent
    │   └─ Auto-cleared on bot restart
    │
    ├─ API Request
    │   ├─ HTTPS in production
    │   ├─ Authorization: Bearer <token>
    │   └─ Timeout: 10 seconds
    │
    ├─ Backend Validation
    │   ├─ Verify JWT signature
    │   ├─ Check token expiry
    │   ├─ Validate user permissions
    │   └─ Input validation
    │
    └─ Response
        └─ Error codes if unauthorized
```

## Performance Considerations

### Optimizations
- ✅ HTTP client reuse (single axios instance)
- ✅ Connection pooling (axios default)
- ✅ Request timeout (10s)
- ✅ Retry only for 500+ errors
- ✅ In-memory token storage (fast)

### Bottlenecks
- Network latency to Backend
- Blockchain API calls (payment verification)
- Database queries (Backend side)

### Monitoring
- Logger for all API calls
- Error tracking
- User action logging
- Performance metrics (can be added)

## Scalability

### Current Architecture
- Single bot instance
- In-memory sessions
- Direct API calls

### Future Scaling Options
1. **Horizontal Scaling**
   - Multiple bot instances
   - Shared session storage (Redis)
   - Load balancer

2. **Caching**
   - Cache shop data
   - Cache product lists
   - TTL-based invalidation

3. **WebSocket**
   - Real-time order updates
   - Payment confirmations
   - Shop notifications

4. **Queue System**
   - Background payment checks
   - Async order processing
   - Scheduled tasks

## Testing Strategy

### Unit Tests
```javascript
// Mock axios
jest.mock('axios');

// Test API methods
test('should create shop', async () => {
  const result = await shopsApi.create(token, data);
  expect(result.name).toBe('Test Shop');
});
```

### Integration Tests
```javascript
// Test with real Backend
test('should create and retrieve shop', async () => {
  const shop = await shopsApi.create(token, data);
  const retrieved = await shopsApi.getById(shop.id);
  expect(retrieved.name).toBe(shop.name);
});
```

### E2E Tests
```javascript
// Test full user flow
test('complete order flow', async () => {
  // 1. Login
  // 2. Browse products
  // 3. Create order
  // 4. Verify payment
  // 5. Check order status
});
```

## Deployment

### Development
```bash
npm run dev
# - Bot connects to localhost:3000
# - Auto-restart on changes
# - Debug logging enabled
```

### Production
```bash
npm start
# - Bot connects to production Backend
# - HTTPS required
# - Error-only logging
# - Process manager (PM2)
```

## Monitoring & Logging

### Levels
- ERROR: Critical issues
- WARN: Warnings
- INFO: Important events
- DEBUG: Detailed debugging

### What to Log
- ✅ User actions (create shop, order, etc.)
- ✅ API errors
- ✅ Payment verifications
- ✅ Authentication events
- ❌ Sensitive data (tokens, passwords)

### Log Format
```
[2025-10-18T12:00:00.000Z] INFO: User action: create_shop {"userId":123,"shopId":1}
[2025-10-18T12:00:01.000Z] ERROR: API POST /api/shops failed {"error":"Network error"}
```

## Maintenance

### Regular Tasks
1. Check error logs
2. Monitor API response times
3. Update dependencies
4. Review security patches
5. Backup session data (if persistent)

### Updates
1. Update Backend endpoints → Update API clients
2. New features → Add to API modules
3. Breaking changes → Update handlers

### Troubleshooting
1. Check Backend health
2. Verify environment variables
3. Check token validity
4. Review error logs
5. Test API endpoints manually

---

**Last Updated:** 2025-10-18
**Version:** 1.0.0
