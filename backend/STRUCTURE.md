# Backend Project Structure

Полная структура backend проекта Telegram E-Commerce платформы.

```
backend/
├── src/
│   ├── server.js                      # Main Express server & WebSocket setup
│   │
│   ├── config/
│   │   ├── env.js                     # Environment variables & validation
│   │   └── database.js                # PostgreSQL connection pool & queries
│   │
│   ├── routes/
│   │   ├── auth.js                    # Authentication routes
│   │   ├── shops.js                   # Shop CRUD routes
│   │   ├── products.js                # Product CRUD routes
│   │   ├── orders.js                  # Order management routes
│   │   └── payments.js                # Payment verification routes
│   │
│   ├── controllers/
│   │   ├── authController.js          # Auth logic (login, register, profile)
│   │   ├── shopController.js          # Shop CRUD logic
│   │   ├── productController.js       # Product CRUD logic
│   │   ├── orderController.js         # Order management logic
│   │   └── paymentController.js       # Payment verification logic
│   │
│   ├── models/
│   │   └── db.js                      # Database queries for all entities
│   │
│   ├── middleware/
│   │   ├── auth.js                    # JWT verification & role checks
│   │   └── validation.js              # Input validation schemas
│   │
│   └── services/
│       ├── crypto.js                  # Crypto payment verification (BTC, ETH, USDT, TON)
│       └── telegram.js                # Telegram API integration & notifications
│
├── database/
│   ├── schema.sql                     # Database schema & tables
│   ├── indexes.sql                    # Performance indexes
│   └── seed.sql                       # Sample data for testing
│
├── logs/                              # Application logs (created by PM2)
│   ├── err.log
│   └── out.log
│
├── package.json                       # Dependencies & scripts
├── .env.example                       # Environment variables template
├── .gitignore                         # Git ignore rules
├── ecosystem.config.js                # PM2 configuration
├── README.md                          # Project documentation
├── API_EXAMPLES.md                    # API request examples
├── DEPLOYMENT.md                      # Deployment guide
└── STRUCTURE.md                       # This file
```

---

## File Descriptions

### Core Files

#### `src/server.js`
- Express server initialization
- Middleware setup (helmet, cors, rate limiting)
- Route mounting
- WebSocket server setup
- Error handling
- Graceful shutdown

#### `src/config/env.js`
- Load and validate environment variables
- Export configuration object
- Ensure required variables exist

#### `src/config/database.js`
- PostgreSQL connection pool
- Query execution functions
- Transaction support
- Connection testing
- Graceful pool closing

---

### Routes

#### `src/routes/auth.js`
Routes:
- `POST /api/auth/login` - Login via Telegram
- `POST /api/auth/register` - Register new user
- `GET /api/auth/profile` - Get profile (auth required)
- `PUT /api/auth/profile` - Update profile (auth required)

#### `src/routes/shops.js`
Routes:
- `POST /api/shops` - Create shop (seller only)
- `GET /api/shops/my` - Get my shops (seller only)
- `GET /api/shops/active` - List active shops
- `GET /api/shops/:id` - Get shop by ID
- `PUT /api/shops/:id` - Update shop (seller only)
- `DELETE /api/shops/:id` - Delete shop (seller only)

#### `src/routes/products.js`
Routes:
- `POST /api/products` - Create product (seller only)
- `GET /api/products` - List products with filters
- `GET /api/products/:id` - Get product by ID
- `PUT /api/products/:id` - Update product (seller only)
- `DELETE /api/products/:id` - Delete product (seller only)

#### `src/routes/orders.js`
Routes:
- `POST /api/orders` - Create order
- `GET /api/orders/my` - Get my orders
- `GET /api/orders/:id` - Get order by ID
- `PUT /api/orders/:id/status` - Update order status

#### `src/routes/payments.js`
Routes:
- `POST /api/payments/verify` - Verify crypto payment
- `GET /api/payments/order/:orderId` - Get payments by order
- `GET /api/payments/status` - Check payment status

---

### Controllers

#### `src/controllers/authController.js`
Methods:
- `login()` - Verify Telegram data & create/login user
- `register()` - Register new user with role
- `getProfile()` - Get current user profile
- `updateProfile()` - Update user information

#### `src/controllers/shopController.js`
Methods:
- `create()` - Create new shop
- `getById()` - Get shop details
- `getMyShops()` - Get seller's shops
- `update()` - Update shop information
- `delete()` - Delete shop
- `listActive()` - List all active shops

#### `src/controllers/productController.js`
Methods:
- `create()` - Create new product
- `getById()` - Get product details
- `list()` - List products with filters
- `update()` - Update product
- `delete()` - Delete product

#### `src/controllers/orderController.js`
Methods:
- `create()` - Create order & reserve stock
- `getById()` - Get order details
- `getMyOrders()` - Get user's orders
- `updateStatus()` - Update order status & notify

#### `src/controllers/paymentController.js`
Methods:
- `verify()` - Verify blockchain transaction
- `getByOrder()` - Get order payments
- `checkStatus()` - Poll payment status

---

### Models

#### `src/models/db.js`
Query collections:
- `userQueries` - User database operations
- `shopQueries` - Shop database operations
- `productQueries` - Product database operations
- `orderQueries` - Order database operations
- `paymentQueries` - Payment database operations

---

### Middleware

#### `src/middleware/auth.js`
Functions:
- `verifyToken()` - JWT verification
- `requireRole(...roles)` - Role-based access control
- `optionalAuth()` - Optional authentication

#### `src/middleware/validation.js`
Schemas:
- `authValidation` - Login, register validation
- `shopValidation` - Shop CRUD validation
- `productValidation` - Product CRUD validation
- `orderValidation` - Order validation
- `paymentValidation` - Payment verification validation

---

### Services

#### `src/services/telegram.js`
Methods:
- `verifyInitData()` - Verify Telegram Web App data
- `parseInitData()` - Parse user data from init data
- `sendMessage()` - Send Telegram message
- `notifyNewOrder()` - Notify seller about new order
- `notifyPaymentConfirmed()` - Notify buyer about payment
- `notifyOrderStatusUpdate()` - Notify about status change
- `getBotInfo()` - Get bot information
- `setWebhook()` - Configure webhook
- `deleteWebhook()` - Remove webhook

#### `src/services/crypto.js`
Methods:
- `verifyBitcoinTransaction()` - Verify BTC payment
- `verifyEthereumTransaction()` - Verify ETH/USDT payment
- `verifyTonTransaction()` - Verify TON payment
- `verifyTransaction()` - Universal verification
- `getBitcoinBlockHeight()` - Get current BTC block height

---

### Database

#### `database/schema.sql`
Tables:
- `users` - User accounts
- `shops` - Seller shops
- `products` - Products for sale
- `orders` - Customer orders
- `order_items` - Order line items
- `payments` - Payment records
- `subscriptions` - User shop subscriptions
- `shop_payments` - Shop activation payments

Triggers:
- Auto-update `updated_at` on all tables

#### `database/indexes.sql`
Performance indexes for:
- Foreign keys
- Frequently queried fields
- Composite queries
- Full-text search

#### `database/seed.sql`
Sample data for:
- Test users (buyer & seller)
- Sample shops
- Sample products
- Test orders

---

## Technology Stack

### Core
- **Node.js** 18+ - Runtime environment
- **Express.js** 4.x - Web framework
- **PostgreSQL** 14+ - Database

### Security
- **Helmet.js** - Security headers
- **express-rate-limit** - Rate limiting
- **jsonwebtoken** - JWT authentication
- **bcrypt** - Password hashing (if needed)

### Database
- **pg** - PostgreSQL client
- Connection pooling
- Prepared statements

### Validation
- **express-validator** - Input validation

### Communication
- **ws** - WebSocket server
- **axios** - HTTP client for blockchain APIs

### Development
- **nodemon** - Auto-reload during development

### Production
- **PM2** - Process manager
- **nginx** - Reverse proxy
- **Let's Encrypt** - SSL certificates

---

## Data Flow

### 1. User Authentication
```
Telegram Web App
    ↓ (initData)
POST /api/auth/login
    ↓ (verify initData)
TelegramService.verifyInitData()
    ↓ (valid)
Database: Find/Create User
    ↓
Generate JWT
    ↓
Return token + user data
```

### 2. Create Order
```
Frontend
    ↓ (productId, quantity)
POST /api/orders
    ↓ (verify JWT)
Auth Middleware
    ↓
OrderController.create()
    ↓
Database: Check stock
    ↓ (available)
Database: Create order
Database: Decrease stock
    ↓
TelegramService.notifyNewOrder()
    ↓
Return order data
```

### 3. Verify Payment
```
Frontend
    ↓ (txHash, orderId)
POST /api/payments/verify
    ↓
CryptoService.verifyTransaction()
    ↓ (blockchain API)
Blockchain verification
    ↓ (confirmed)
Database: Create payment record
Database: Update order status
    ↓
TelegramService.notifyPaymentConfirmed()
    ↓
Return verification result
```

---

## Security Features

1. **Authentication**
   - JWT tokens with expiration
   - Telegram Web App data verification
   - Role-based access control

2. **Input Validation**
   - express-validator schemas
   - Type checking
   - Range validation

3. **Rate Limiting**
   - 100 requests / 15 minutes per IP
   - Configurable limits

4. **Security Headers**
   - Helmet.js configuration
   - CORS restrictions
   - XSS protection

5. **Database**
   - Prepared statements (SQL injection prevention)
   - Foreign key constraints
   - CHECK constraints

6. **HTTPS**
   - SSL/TLS encryption
   - Let's Encrypt certificates

---

## Performance Optimizations

1. **Database**
   - Connection pooling (max 20 connections)
   - Indexes on frequently queried fields
   - Composite indexes for complex queries

2. **Caching**
   - WebSocket for real-time updates (avoid polling)
   - Connection keep-alive

3. **Clustering**
   - PM2 cluster mode (use all CPU cores)
   - Load balancing

4. **Response**
   - JSON responses (lightweight)
   - Pagination for large datasets

---

## Monitoring & Logging

1. **Application Logs**
   - PM2 log management
   - Separate error and output logs
   - Log rotation

2. **Access Logs**
   - Nginx access logs
   - Request tracking

3. **Database Logs**
   - PostgreSQL query logs
   - Slow query identification

4. **Health Checks**
   - `/health` endpoint
   - Automated health monitoring
   - Auto-restart on failure

---

## Backup Strategy

1. **Database Backups**
   - Daily automated backups
   - 7-day retention
   - Compressed with gzip

2. **Application Files**
   - Git version control
   - Regular commits

3. **Environment Files**
   - Secure storage of .env
   - Separate backups

---

## Deployment Workflow

1. **Development**
   ```bash
   npm run dev  # Local development with nodemon
   ```

2. **Testing**
   ```bash
   npm start    # Test production mode locally
   ```

3. **Production**
   ```bash
   pm2 start ecosystem.config.js --env production
   ```

4. **Updates**
   ```bash
   git pull
   npm install --production
   pm2 reload telegram-shop-api
   ```

---

## Environment Variables

Required:
- `PORT` - Server port
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing key
- `TELEGRAM_BOT_TOKEN` - Telegram bot token

Optional:
- `BLOCKCHAIN_API_KEY` - Bitcoin API
- `ETHERSCAN_API_KEY` - Ethereum API
- `TRON_API_KEY` - TRON API
- `FRONTEND_URL` - CORS whitelist
- `RATE_LIMIT_WINDOW_MS` - Rate limit window
- `RATE_LIMIT_MAX_REQUESTS` - Max requests

---

## API Response Format

### Success
```json
{
  "success": true,
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "error": "Error message",
  "details": []  // Optional validation errors
}
```

### Pagination
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50
  }
}
```

---

## Next Steps

1. Set up development environment
2. Configure database and run migrations
3. Configure environment variables
4. Test API endpoints
5. Deploy to production
6. Set up monitoring
7. Configure backups

---

## Support & Contribution

- **Documentation**: See README.md, API_EXAMPLES.md, DEPLOYMENT.md
- **Issues**: GitHub Issues
- **Contact**: support@yourdomain.com
