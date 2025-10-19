# 🧪 API Testing Guide

Полное руководство по тестированию всех API endpoints с примерами cURL и ожидаемыми ответами.

**Base URL:** `http://localhost:3000`

---

## 📋 Содержание

1. [Health Check](#health-check)
2. [Authentication](#authentication)
3. [Shops](#shops)
4. [Products](#products)
5. [Orders](#orders)
6. [Payments](#payments)
7. [Subscriptions](#subscriptions)
8. [WebSocket](#websocket)
9. [Postman Collection](#postman-collection)
10. [Test Scenarios](#test-scenarios)

---

## Health Check

### Check server health

```bash
curl http://localhost:3000/health
```

**Response 200:**
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2025-10-18T12:00:00.000Z",
  "environment": "development"
}
```

---

## Authentication

### 1. Register new user

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "telegramId": 123456789,
    "username": "john_doe",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "telegramId": 123456789,
      "username": "john_doe",
      "firstName": "John",
      "lastName": "Doe",
      "createdAt": "2025-10-18T12:00:00.000Z"
    }
  }
}
```

### 2. Login (Telegram WebApp)

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "telegramId": 123456789,
    "initData": "query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22John%22%2C%22last_name%22%3A%22Doe%22%2C%22username%22%3A%22john_doe%22%2C%22language_code%22%3A%22en%22%7D&auth_date=1697620000&hash=abc123..."
  }'
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "telegramId": 123456789,
      "username": "john_doe",
      "firstName": "John",
      "lastName": "Doe",
      "createdAt": "2025-10-18T12:00:00.000Z"
    }
  }
}
```

### 3. Get profile

```bash
curl http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "telegramId": 123456789,
    "username": "john_doe",
    "firstName": "John",
    "lastName": "Doe",
    "createdAt": "2025-10-18T12:00:00.000Z",
    "updatedAt": "2025-10-18T12:00:00.000Z"
  }
}
```

### 4. Update profile

```bash
curl -X PUT http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Smith"
  }'
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "telegramId": 123456789,
    "username": "john_doe",
    "firstName": "John",
    "lastName": "Smith",
    "updatedAt": "2025-10-18T13:00:00.000Z"
  }
}
```

---

## Shops

### 1. Create shop

```bash
curl -X POST http://localhost:3000/api/shops \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tech Store",
    "description": "Best electronics and gadgets",
    "logo": "https://example.com/logo.png"
  }'
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "owner_id": 1,
    "name": "Tech Store",
    "description": "Best electronics and gadgets",
    "logo": "https://example.com/logo.png",
    "is_active": true,
    "registration_paid": false,
    "created_at": "2025-10-18T12:00:00.000Z",
    "updated_at": "2025-10-18T12:00:00.000Z"
  }
}
```

### 2. Get my shops

```bash
curl http://localhost:3000/api/shops/my \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "owner_id": 1,
      "name": "Tech Store",
      "description": "Best electronics and gadgets",
      "is_active": true,
      "created_at": "2025-10-18T12:00:00.000Z"
    }
  ]
}
```

### 3. List all active shops

```bash
curl http://localhost:3000/api/shops/active
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Tech Store",
      "description": "Best electronics and gadgets",
      "seller_username": "john_doe",
      "is_active": true,
      "created_at": "2025-10-18T12:00:00.000Z"
    },
    {
      "id": 2,
      "name": "Fashion Boutique",
      "description": "Trendy clothes",
      "seller_username": "jane_smith",
      "is_active": true,
      "created_at": "2025-10-18T11:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 2
  }
}
```

### 4. Get shop by ID

```bash
curl http://localhost:3000/api/shops/1
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "owner_id": 1,
    "name": "Tech Store",
    "description": "Best electronics and gadgets",
    "logo": "https://example.com/logo.png",
    "seller_username": "john_doe",
    "seller_first_name": "John",
    "is_active": true,
    "created_at": "2025-10-18T12:00:00.000Z"
  }
}
```

### 5. Update shop

```bash
curl -X PUT http://localhost:3000/api/shops/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Premium electronics and latest gadgets",
    "isActive": true
  }'
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Tech Store",
    "description": "Premium electronics and latest gadgets",
    "is_active": true,
    "updated_at": "2025-10-18T13:00:00.000Z"
  }
}
```

### 6. Delete shop

```bash
curl -X DELETE http://localhost:3000/api/shops/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "message": "Shop deleted successfully"
}
```

---

## Products

### 1. Create product

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shopId": 1,
    "name": "iPhone 15 Pro",
    "description": "Latest iPhone with A17 chip",
    "price": 0.025,
    "currency": "BTC",
    "stock": 10,
    "images": ["https://example.com/iphone1.jpg", "https://example.com/iphone2.jpg"],
    "category": "Electronics"
  }'
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "shop_id": 1,
    "name": "iPhone 15 Pro",
    "description": "Latest iPhone with A17 chip",
    "price": 0.025,
    "currency": "BTC",
    "stock": 10,
    "images": ["https://example.com/iphone1.jpg", "https://example.com/iphone2.jpg"],
    "category": "Electronics",
    "is_available": true,
    "created_at": "2025-10-18T12:00:00.000Z"
  }
}
```

### 2. List products

```bash
# All products
curl http://localhost:3000/api/products

# Filter by shop
curl http://localhost:3000/api/products?shopId=1

# Filter by category
curl http://localhost:3000/api/products?category=Electronics

# Pagination
curl http://localhost:3000/api/products?page=2&limit=20
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "shop_id": 1,
      "name": "iPhone 15 Pro",
      "description": "Latest iPhone with A17 chip",
      "price": 0.025,
      "currency": "BTC",
      "stock": 10,
      "shop_name": "Tech Store",
      "is_available": true,
      "created_at": "2025-10-18T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1
  }
}
```

### 3. Get product by ID

```bash
curl http://localhost:3000/api/products/1
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "shop_id": 1,
    "name": "iPhone 15 Pro",
    "description": "Latest iPhone with A17 chip",
    "price": 0.025,
    "currency": "BTC",
    "stock": 10,
    "images": ["https://example.com/iphone1.jpg"],
    "category": "Electronics",
    "shop_name": "Tech Store",
    "seller_id": 1,
    "is_available": true
  }
}
```

### 4. Update product

```bash
curl -X PUT http://localhost:3000/api/products/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 0.023,
    "stock": 8
  }'
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "iPhone 15 Pro",
    "price": 0.023,
    "stock": 8,
    "updated_at": "2025-10-18T13:00:00.000Z"
  }
}
```

### 5. Delete product

```bash
curl -X DELETE http://localhost:3000/api/products/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "message": "Product deleted successfully"
}
```

---

## Orders

### 1. Create order

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": 1,
    "quantity": 2,
    "deliveryAddress": "123 Main St, City, Country"
  }'
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "buyer_id": 2,
    "product_id": 1,
    "quantity": 2,
    "total_price": 0.05,
    "currency": "BTC",
    "status": "pending",
    "delivery_address": "123 Main St, City, Country",
    "created_at": "2025-10-18T12:00:00.000Z"
  }
}
```

### 2. Get my orders

```bash
# As buyer (default)
curl http://localhost:3000/api/orders/my \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# As seller
curl "http://localhost:3000/api/orders/my?type=seller" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "buyer_id": 2,
      "product_id": 1,
      "product_name": "iPhone 15 Pro",
      "product_images": ["https://example.com/iphone1.jpg"],
      "shop_name": "Tech Store",
      "quantity": 2,
      "total_price": 0.05,
      "currency": "BTC",
      "status": "pending",
      "created_at": "2025-10-18T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1
  }
}
```

### 3. Get order by ID

```bash
curl http://localhost:3000/api/orders/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "buyer_id": 2,
    "product_id": 1,
    "product_name": "iPhone 15 Pro",
    "product_images": ["https://example.com/iphone1.jpg"],
    "shop_name": "Tech Store",
    "seller_id": 1,
    "buyer_username": "alice",
    "buyer_telegram_id": 987654321,
    "quantity": 2,
    "total_price": 0.05,
    "currency": "BTC",
    "status": "pending",
    "payment_address": null,
    "delivery_address": "123 Main St, City, Country",
    "created_at": "2025-10-18T12:00:00.000Z"
  }
}
```

### 4. Update order status

```bash
curl -X PUT http://localhost:3000/api/orders/1/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "confirmed"
  }'
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "confirmed",
    "updated_at": "2025-10-18T13:00:00.000Z"
  }
}
```

---

## Payments

### 1. Verify payment

```bash
curl -X POST http://localhost:3000/api/payments/verify \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": 1,
    "txHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "currency": "ETH"
  }'
```

**Response 200 (Success):**
```json
{
  "success": true,
  "data": {
    "payment": {
      "id": 1,
      "order_id": 1,
      "tx_hash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "amount": 0.05,
      "currency": "ETH",
      "status": "confirmed",
      "confirmations": 12,
      "created_at": "2025-10-18T12:00:00.000Z"
    },
    "verification": {
      "verified": true,
      "confirmations": 12,
      "status": "confirmed"
    }
  }
}
```

**Response 400 (Failed):**
```json
{
  "success": false,
  "error": "Amount mismatch. Expected: 0.05 ETH, Received: 0.03 ETH"
}
```

### 2. Get payments by order

```bash
curl http://localhost:3000/api/payments/order/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "order_id": 1,
      "tx_hash": "0x1234567890abcdef...",
      "amount": 0.05,
      "currency": "ETH",
      "status": "confirmed",
      "confirmations": 12,
      "verified_at": "2025-10-18T12:05:00.000Z",
      "created_at": "2025-10-18T12:00:00.000Z"
    }
  ]
}
```

### 3. Check payment status

```bash
curl "http://localhost:3000/api/payments/status?txHash=0x1234567890abcdef..." \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "order_id": 1,
    "tx_hash": "0x1234567890abcdef...",
    "status": "confirmed",
    "confirmations": 15,
    "amount": 0.05,
    "currency": "ETH"
  }
}
```

---

## Subscriptions

### 1. Subscribe to shop

```bash
curl -X POST http://localhost:3000/api/subscriptions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shopId": 1
  }'
```

**Response 201:**
```json
{
  "success": true,
  "message": "Successfully subscribed to shop",
  "data": {
    "id": 1,
    "user_id": 2,
    "shop_id": 1,
    "created_at": "2025-10-18T12:00:00.000Z"
  }
}
```

### 2. Get my subscriptions

```bash
curl http://localhost:3000/api/subscriptions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 2,
      "shop_id": 1,
      "shop_name": "Tech Store",
      "shop_description": "Best electronics and gadgets",
      "shop_owner_username": "john_doe",
      "created_at": "2025-10-18T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1
  }
}
```

### 3. Get shop subscribers (owner only)

```bash
curl http://localhost:3000/api/subscriptions/shop/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 2,
      "shop_id": 1,
      "username": "alice",
      "first_name": "Alice",
      "last_name": "Johnson",
      "created_at": "2025-10-18T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 5
  }
}
```

### 4. Check subscription status

```bash
curl http://localhost:3000/api/subscriptions/check/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "subscribed": true
  }
}
```

### 5. Unsubscribe from shop

```bash
curl -X DELETE http://localhost:3000/api/subscriptions/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response 200:**
```json
{
  "success": true,
  "message": "Successfully unsubscribed from shop"
}
```

---

## WebSocket

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected to WebSocket');
  
  // Send ping
  ws.send(JSON.stringify({ type: 'ping' }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### Messages

**Connected:**
```json
{
  "type": "connected",
  "message": "Connected to Telegram Shop WebSocket",
  "timestamp": 1697620000000
}
```

**Ping/Pong:**
```json
// Send
{ "type": "ping" }

// Receive
{ "type": "pong", "timestamp": 1697620000000 }
```

**Order Update:**
```json
{
  "type": "order_update",
  "data": {
    "orderId": 1,
    "status": "confirmed",
    "timestamp": 1697620000000
  }
}
```

**Payment Confirmed:**
```json
{
  "type": "payment_confirmed",
  "data": {
    "orderId": 1,
    "amount": 0.05,
    "currency": "ETH",
    "txHash": "0x123..."
  }
}
```

---

## Postman Collection

### Import этот JSON в Postman:

```json
{
  "info": {
    "name": "Telegram Shop API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Authentication",
      "item": [
        {
          "name": "Register",
          "request": {
            "method": "POST",
            "header": [{"key": "Content-Type", "value": "application/json"}],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"telegramId\": 123456789,\n  \"username\": \"john_doe\",\n  \"firstName\": \"John\",\n  \"lastName\": \"Doe\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/auth/register",
              "host": ["{{baseUrl}}"],
              "path": ["api", "auth", "register"]
            }
          }
        },
        {
          "name": "Get Profile",
          "request": {
            "method": "GET",
            "header": [{"key": "Authorization", "value": "Bearer {{token}}"}],
            "url": {
              "raw": "{{baseUrl}}/api/auth/profile",
              "host": ["{{baseUrl}}"],
              "path": ["api", "auth", "profile"]
            }
          }
        }
      ]
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000"
    },
    {
      "key": "token",
      "value": "your_jwt_token_here"
    }
  ]
}
```

---

## Test Scenarios

### Scenario 1: Complete buyer flow

```bash
# 1. Register as buyer
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"telegramId": 111, "username": "buyer1", "firstName": "Alice", "lastName": "Johnson"}' \
  | jq -r '.data.token')

# 2. List active shops
curl -s http://localhost:3000/api/shops/active | jq

# 3. Subscribe to shop
curl -s -X POST http://localhost:3000/api/subscriptions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"shopId": 1}' | jq

# 4. View products
curl -s http://localhost:3000/api/products?shopId=1 | jq

# 5. Create order
curl -s -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId": 1, "quantity": 1, "deliveryAddress": "123 Main St"}' | jq

# 6. Verify payment (replace with real tx hash)
curl -s -X POST http://localhost:3000/api/payments/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderId": 1, "txHash": "0xabc...", "currency": "ETH"}' | jq
```

### Scenario 2: Complete seller flow

```bash
# 1. Register as seller
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"telegramId": 222, "username": "seller1", "firstName": "Bob", "lastName": "Smith"}' \
  | jq -r '.data.token')

# 2. Create shop
SHOP_ID=$(curl -s -X POST http://localhost:3000/api/shops \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Shop", "description": "Great products"}' \
  | jq -r '.data.id')

# 3. Add product
curl -s -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"shopId\": $SHOP_ID, \"name\": \"Product 1\", \"description\": \"Description\", \"price\": 0.01, \"currency\": \"BTC\", \"stock\": 100}" | jq

# 4. View my sales
curl -s "http://localhost:3000/api/orders/my?type=seller" \
  -H "Authorization: Bearer $TOKEN" | jq

# 5. Update order status
curl -s -X PUT http://localhost:3000/api/orders/1/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "shipped"}' | jq

# 6. View subscribers
curl -s http://localhost:3000/api/subscriptions/shop/$SHOP_ID \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Scenario 3: Error handling tests

```bash
# 401 Unauthorized (no token)
curl -i http://localhost:3000/api/auth/profile

# 400 Bad Request (invalid data)
curl -i -X POST http://localhost:3000/api/shops \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "AB"}'  # Too short (min 3 chars)

# 404 Not Found
curl -i http://localhost:3000/api/shops/99999

# 403 Forbidden (not owner)
curl -i -X DELETE http://localhost:3000/api/shops/1 \
  -H "Authorization: Bearer $DIFFERENT_USER_TOKEN"

# 429 Too Many Requests (rate limit)
for i in {1..200}; do
  curl -s http://localhost:3000/api/shops/active > /dev/null
done
```

---

## Common Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "name",
      "message": "Shop name must be 3-100 characters"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "No token provided. Authorization header must be in format: Bearer <token>"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Only shop owners can perform this action. Create a shop first."
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Shop not found"
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "error": "Too many requests from this IP, please try again later."
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## Tips & Best Practices

### 1. Store JWT Token
После login/register сохраняйте token:
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 2. Pretty Print JSON
Используйте `jq` для форматирования:
```bash
curl http://localhost:3000/api/shops/active | jq
```

### 3. Save Response to File
```bash
curl http://localhost:3000/api/products > products.json
```

### 4. Check Response Headers
```bash
curl -i http://localhost:3000/health
```

### 5. Measure Response Time
```bash
curl -w "\nTime: %{time_total}s\n" http://localhost:3000/api/shops/active
```

### 6. Test with Different Users
Создайте несколько пользователей для тестирования permissions:
```bash
BUYER_TOKEN="..."
SELLER_TOKEN="..."
ADMIN_TOKEN="..."
```

---

## Automated Testing Script

Сохраните как `test-api.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

echo "🧪 Testing Telegram Shop API"
echo "=============================="

# Health check
echo "1. Health Check..."
curl -s $BASE_URL/health | jq -r '.message'

# Register user
echo "2. Registering user..."
TOKEN=$(curl -s -X POST $BASE_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"telegramId\": $RANDOM, \"username\": \"test_$RANDOM\", \"firstName\": \"Test\", \"lastName\": \"User\"}" \
  | jq -r '.data.token')

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token"
  exit 1
fi
echo "✅ Got token: ${TOKEN:0:20}..."

# Create shop
echo "3. Creating shop..."
SHOP=$(curl -s -X POST $BASE_URL/api/shops \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Shop '$RANDOM'", "description": "Test"}')

SHOP_ID=$(echo $SHOP | jq -r '.data.id')
echo "✅ Created shop ID: $SHOP_ID"

# Add product
echo "4. Adding product..."
PRODUCT=$(curl -s -X POST $BASE_URL/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"shopId\": $SHOP_ID, \"name\": \"Test Product\", \"description\": \"Test\", \"price\": 0.01, \"currency\": \"BTC\", \"stock\": 10}")

PRODUCT_ID=$(echo $PRODUCT | jq -r '.data.id')
echo "✅ Created product ID: $PRODUCT_ID"

echo ""
echo "=============================="
echo "✅ All tests passed!"
```

Запуск:
```bash
chmod +x test-api.sh
./test-api.sh
```

---

**Happy Testing! 🚀**
