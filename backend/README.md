# Telegram Shop Backend API

Production-ready backend API для Telegram E-Commerce платформы с поддержкой крипто-платежей.

## Особенности

- RESTful API с Express.js
- PostgreSQL база данных
- JWT аутентификация
- Верификация крипто-платежей (BTC, ETH, USDT, TON)
- WebSocket для real-time обновлений
- Rate limiting и security headers
- Валидация входных данных
- Telegram Web App интеграция

## Требования

- Node.js 18+
- PostgreSQL 14+
- npm или yarn

## Установка

1. Установите зависимости:
```bash
cd backend
npm install
```

2. Создайте файл `.env`:
```bash
cp .env.example .env
```

3. Настройте переменные окружения в `.env`:
```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/telegram_shop
JWT_SECRET=your-secret-key-here
TELEGRAM_BOT_TOKEN=your-bot-token
```

4. Создайте базу данных:
```bash
createdb telegram_shop
```

5. Выполните SQL миграцию:
```bash
psql -d telegram_shop -f database/schema.sql
```

6. Запустите сервер:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/login` - Login via Telegram Web App
- `POST /api/auth/register` - Register new user
- `GET /api/auth/profile` - Get current user profile
- `PUT /api/auth/profile` - Update user profile

### Shops

- `POST /api/shops` - Create shop (seller only)
- `GET /api/shops/my` - Get my shops (seller only)
- `GET /api/shops/active` - List active shops
- `GET /api/shops/:id` - Get shop by ID
- `PUT /api/shops/:id` - Update shop (seller only)
- `DELETE /api/shops/:id` - Delete shop (seller only)

### Products

- `POST /api/products` - Create product (seller only)
- `GET /api/products` - List products (with filters)
- `GET /api/products/:id` - Get product by ID
- `PUT /api/products/:id` - Update product (seller only)
- `DELETE /api/products/:id` - Delete product (seller only)

### Orders

- `POST /api/orders` - Create order
- `GET /api/orders/my` - Get my orders
- `GET /api/orders/:id` - Get order by ID
- `PUT /api/orders/:id/status` - Update order status

### Payments

- `POST /api/payments/verify` - Verify crypto payment
- `GET /api/payments/order/:orderId` - Get payments by order
- `GET /api/payments/status` - Check payment status

## WebSocket

WebSocket доступен на том же порту что и HTTP сервер.

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3000');
```

### Events
```javascript
// Connected
{ type: 'connected', message: 'Connected to Telegram Shop WebSocket' }

// Ping/Pong
{ type: 'ping' } -> { type: 'pong', timestamp: 1234567890 }

// Real-time updates
{ type: 'order_update', data: {...} }
{ type: 'payment_confirmed', data: {...} }
```

## Структура проекта

```
backend/
├── src/
│   ├── server.js              # Express server
│   ├── config/
│   │   ├── database.js        # PostgreSQL connection
│   │   └── env.js             # Environment config
│   ├── routes/
│   │   ├── auth.js            # Auth routes
│   │   ├── shops.js           # Shop routes
│   │   ├── products.js        # Product routes
│   │   ├── orders.js          # Order routes
│   │   └── payments.js        # Payment routes
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── shopController.js
│   │   ├── productController.js
│   │   ├── orderController.js
│   │   └── paymentController.js
│   ├── models/
│   │   └── db.js              # Database queries
│   ├── middleware/
│   │   ├── auth.js            # JWT verification
│   │   └── validation.js      # Input validation
│   └── services/
│       ├── crypto.js          # Crypto verification
│       └── telegram.js        # Telegram API
├── database/
│   └── schema.sql             # Database schema
├── package.json
├── .env.example
└── README.md
```

## Security

- Helmet.js для security headers
- Rate limiting (100 requests / 15 минут по умолчанию)
- CORS настроен для frontend URL
- JWT для аутентификации
- Input validation с express-validator
- Telegram Web App data verification

## Error Handling

Все ошибки возвращаются в формате:
```json
{
  "success": false,
  "error": "Error message",
  "details": [] // Optional validation errors
}
```

HTTP статус коды:
- 200 - Success
- 201 - Created
- 400 - Bad Request
- 401 - Unauthorized
- 403 - Forbidden
- 404 - Not Found
- 500 - Internal Server Error

## Криптовалюты

Поддерживаемые валюты:
- BTC (Bitcoin)
- ETH (Ethereum)
- USDT (Tether ERC-20)
- TON (The Open Network)

Верификация транзакций происходит через blockchain APIs:
- Bitcoin: blockchain.info API
- Ethereum/USDT: Etherscan API
- TON: TONCenter API

## Development

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Run in production mode
npm start
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| PORT | Server port | Yes |
| DATABASE_URL | PostgreSQL connection string | Yes |
| JWT_SECRET | JWT secret key | Yes |
| JWT_EXPIRES_IN | JWT expiration time | No (default: 7d) |
| TELEGRAM_BOT_TOKEN | Telegram bot token | Yes |
| BLOCKCHAIN_API_KEY | Bitcoin API key | No |
| ETHERSCAN_API_KEY | Etherscan API key | No |
| TRON_API_KEY | TRON API key | No |
| FRONTEND_URL | Frontend URL for CORS | No |
| RATE_LIMIT_WINDOW_MS | Rate limit window | No |
| RATE_LIMIT_MAX_REQUESTS | Max requests per window | No |

## License

ISC
