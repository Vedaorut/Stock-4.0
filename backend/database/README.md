# Database Schema Documentation

## Overview

PostgreSQL database schema for Telegram E-Commerce Platform with support for cryptocurrency payments (BTC, ETH, USDT).

## Quick Start

### Prerequisites

- PostgreSQL 14+ installed
- Node.js 18+ for migration scripts
- `pg` npm package installed

### Installation

```bash
# Install dependencies
npm install pg

# Create database and run migrations
node migrations.js --drop --seed --stats

# Run migrations without test data
node migrations.js

# Show help
node migrations.js --help
```

## Database Tables

### users
Stores all platform users (buyers and sellers).

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| telegram_id | BIGINT | Unique Telegram user ID |
| username | VARCHAR(255) | Telegram username |
| first_name | VARCHAR(255) | User's first name |
| last_name | VARCHAR(255) | User's last name |
| role | VARCHAR(20) | User role: 'buyer' or 'seller' |
| created_at | TIMESTAMP | Account creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

**Indexes:**
- `idx_users_telegram_id` on telegram_id
- `idx_users_role` on role
- `idx_users_created_at` on created_at DESC

### shops
Stores seller shops with cryptocurrency wallet addresses.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| owner_id | INT | Foreign key to users(id) |
| name | VARCHAR(255) | Unique shop name |
| description | TEXT | Shop description |
| wallet_btc | VARCHAR(255) | Bitcoin wallet address |
| wallet_eth | VARCHAR(255) | Ethereum wallet address |
| wallet_usdt | VARCHAR(255) | USDT wallet address |
| is_active | BOOLEAN | Shop activation status |
| created_at | TIMESTAMP | Shop creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

**Indexes:**
- `idx_shops_owner_id` on owner_id
- `idx_shops_name` on name
- `idx_shops_is_active` on is_active
- `idx_shops_owner_active` on (owner_id, is_active)

### products
Stores products for each shop.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| shop_id | INT | Foreign key to shops(id) |
| name | VARCHAR(255) | Product name |
| description | TEXT | Product description |
| price | DECIMAL(10,8) | Product price (8 decimal precision) |
| currency | VARCHAR(10) | Currency: 'BTC', 'ETH', 'USDT' |
| stock_quantity | INT | Available stock |
| is_available | BOOLEAN | Product availability status |
| created_at | TIMESTAMP | Product creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

**Indexes:**
- `idx_products_shop_id` on shop_id
- `idx_products_is_available` on is_available
- `idx_products_shop_available` on (shop_id, is_available)
- `idx_products_name_trgm` GIN index for fuzzy search

### orders
Stores customer orders with payment tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| buyer_id | INT | Foreign key to users(id) |
| shop_id | INT | Foreign key to shops(id) |
| total_amount | DECIMAL(10,8) | Total order amount |
| currency | VARCHAR(10) | Payment currency |
| payment_hash | VARCHAR(255) | Blockchain transaction hash |
| payment_address | VARCHAR(255) | Payment wallet address |
| status | VARCHAR(20) | Order status |
| created_at | TIMESTAMP | Order creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |
| paid_at | TIMESTAMP | Payment confirmation timestamp |
| completed_at | TIMESTAMP | Order completion timestamp |

**Status values:**
- `pending` - Order created, awaiting payment
- `paid` - Payment received, awaiting confirmation
- `completed` - Order completed
- `cancelled` - Order cancelled

**Indexes:**
- `idx_orders_buyer_id` on buyer_id
- `idx_orders_shop_id` on shop_id
- `idx_orders_status` on status
- `idx_orders_payment_hash` on payment_hash
- `idx_orders_buyer_status` on (buyer_id, status)
- `idx_orders_shop_status` on (shop_id, status)

### order_items
Stores individual items in each order.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| order_id | INT | Foreign key to orders(id) |
| product_id | INT | Foreign key to products(id) |
| product_name | VARCHAR(255) | Cached product name |
| quantity | INT | Item quantity |
| price | DECIMAL(10,8) | Item price at time of order |
| currency | VARCHAR(10) | Item currency |
| created_at | TIMESTAMP | Item creation timestamp |

**Indexes:**
- `idx_order_items_order_id` on order_id
- `idx_order_items_product_id` on product_id

### subscriptions
Stores user subscriptions to shops for notifications.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| user_id | INT | Foreign key to users(id) |
| shop_id | INT | Foreign key to shops(id) |
| created_at | TIMESTAMP | Subscription timestamp |

**Constraints:**
- UNIQUE(user_id, shop_id) - One subscription per user per shop

**Indexes:**
- `idx_subscriptions_user_id` on user_id
- `idx_subscriptions_shop_id` on shop_id
- `idx_subscriptions_user_shop` on (user_id, shop_id)

### shop_payments
Stores $25 payments for shop activation.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| user_id | INT | Foreign key to users(id) |
| shop_id | INT | Foreign key to shops(id) |
| amount | DECIMAL(10,8) | Payment amount |
| currency | VARCHAR(10) | Payment currency |
| payment_hash | VARCHAR(255) | Blockchain transaction hash |
| payment_address | VARCHAR(255) | Payment wallet address |
| status | VARCHAR(20) | Payment status |
| created_at | TIMESTAMP | Payment creation timestamp |
| verified_at | TIMESTAMP | Payment verification timestamp |

**Status values:**
- `pending` - Payment initiated, awaiting confirmation
- `confirmed` - Payment confirmed on blockchain
- `failed` - Payment failed or rejected

**Indexes:**
- `idx_shop_payments_user_id` on user_id
- `idx_shop_payments_shop_id` on shop_id
- `idx_shop_payments_payment_hash` on payment_hash
- `idx_shop_payments_status` on status

## Migration Commands

### Fresh Install
```bash
node migrations.js --drop --seed --stats
```

### Update Schema
```bash
node migrations.js
```

### Add Test Data
```bash
node migrations.js --seed
```

### View Statistics
```bash
node migrations.js --stats --no-schema --no-indexes
```

### Drop All Tables
```bash
node migrations.js --drop --no-schema --no-indexes
```

## Environment Variables

Create `.env` file in backend directory:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=telegram_ecommerce
DB_USER=postgres
DB_PASSWORD=your_password
```

## Performance Optimization

### Query Optimization Tips

1. **Use indexes effectively:**
   - Foreign keys are indexed automatically
   - Status fields have indexes for filtering
   - Composite indexes for common query patterns

2. **Analyze queries:**
   ```sql
   EXPLAIN ANALYZE SELECT * FROM orders WHERE buyer_id = 1 AND status = 'completed';
   ```

3. **Regular maintenance:**
   ```sql
   VACUUM ANALYZE;
   REINDEX DATABASE telegram_ecommerce;
   ```

### Connection Pooling

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

## Common Queries

### Get user's orders with items
```sql
SELECT o.*, oi.product_name, oi.quantity, oi.price
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.buyer_id = $1
ORDER BY o.created_at DESC;
```

### Get shop products with availability
```sql
SELECT *
FROM products
WHERE shop_id = $1 AND is_available = true
ORDER BY created_at DESC;
```

### Get shop subscribers
```sql
SELECT u.*
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.shop_id = $1;
```

### Check pending payments
```sql
SELECT *
FROM orders
WHERE status = 'pending' AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

## Backup and Restore

### Backup database
```bash
pg_dump -U postgres -d telegram_ecommerce > backup.sql
```

### Restore database
```bash
psql -U postgres -d telegram_ecommerce < backup.sql
```

### Backup specific table
```bash
pg_dump -U postgres -d telegram_ecommerce -t orders > orders_backup.sql
```

## Security Considerations

1. **Sensitive Data:**
   - Store only necessary user data
   - Never store private keys or seeds
   - Wallet addresses are public information

2. **SQL Injection Prevention:**
   - Always use parameterized queries
   - Validate input data
   - Use ORM/query builder when possible

3. **Access Control:**
   - Use database roles and permissions
   - Limit connection access by IP
   - Use SSL/TLS for connections

## Monitoring

### Check active connections
```sql
SELECT * FROM pg_stat_activity WHERE datname = 'telegram_ecommerce';
```

### Check table sizes
```sql
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Check slow queries
```sql
SELECT * FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

## File Structure

```
backend/database/
├── schema.sql          # Database schema definition
├── indexes.sql         # Performance indexes
├── seed.sql           # Test data seeds
├── migrations.js      # Migration runner script
└── README.md          # This file
```

## Support

For issues or questions, please refer to the main project documentation.
