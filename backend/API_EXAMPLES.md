# API Examples

Примеры запросов к API для тестирования и интеграции.

## Base URL
```
http://localhost:3000/api
```

## Authentication

### Login via Telegram Web App
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "telegramId": 123456789,
    "initData": "query_id=AAHdF6I...&user=%7B%22id%22%3A123456789..."
  }'
```

**Response:**
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
      "role": "buyer",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### Register New User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "telegramId": 123456789,
    "username": "seller1",
    "firstName": "John",
    "lastName": "Doe",
    "role": "seller"
  }'
```

### Get Profile
```bash
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Update Profile
```bash
curl -X PUT http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "new_username",
    "firstName": "Jane"
  }'
```

---

## Shops

### Create Shop (Seller only)
```bash
curl -X POST http://localhost:3000/api/shops \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Awesome Shop",
    "description": "We sell amazing products",
    "logo": "https://example.com/logo.png"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "seller_id": 2,
    "name": "My Awesome Shop",
    "description": "We sell amazing products",
    "logo": "https://example.com/logo.png",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get My Shops
```bash
curl -X GET http://localhost:3000/api/shops/my \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### List Active Shops
```bash
curl -X GET "http://localhost:3000/api/shops/active?page=1&limit=20"
```

### Get Shop by ID
```bash
curl -X GET http://localhost:3000/api/shops/1
```

### Update Shop
```bash
curl -X PUT http://localhost:3000/api/shops/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Shop Name",
    "isActive": true
  }'
```

### Delete Shop
```bash
curl -X DELETE http://localhost:3000/api/shops/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Products

### Create Product (Seller only)
```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shopId": 1,
    "name": "iPhone 15 Pro",
    "description": "Latest Apple iPhone",
    "price": 0.025,
    "currency": "BTC",
    "stock": 10,
    "images": [
      "https://example.com/image1.jpg",
      "https://example.com/image2.jpg"
    ],
    "category": "Electronics"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "shop_id": 1,
    "name": "iPhone 15 Pro",
    "description": "Latest Apple iPhone",
    "price": "0.02500000",
    "currency": "BTC",
    "stock": 10,
    "images": "[\"https://example.com/image1.jpg\",\"https://example.com/image2.jpg\"]",
    "category": "Electronics",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### List Products
```bash
# All products
curl -X GET "http://localhost:3000/api/products?page=1&limit=20"

# Products by shop
curl -X GET "http://localhost:3000/api/products?shopId=1&page=1&limit=20"

# Products by category
curl -X GET "http://localhost:3000/api/products?category=Electronics&page=1&limit=20"

# Only active products
curl -X GET "http://localhost:3000/api/products?isActive=true&page=1&limit=20"
```

### Get Product by ID
```bash
curl -X GET http://localhost:3000/api/products/1
```

### Update Product
```bash
curl -X PUT http://localhost:3000/api/products/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "iPhone 15 Pro Max",
    "price": 0.030,
    "stock": 5,
    "isActive": true
  }'
```

### Delete Product
```bash
curl -X DELETE http://localhost:3000/api/products/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Orders

### Create Order
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

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "buyer_id": 1,
    "product_id": 1,
    "quantity": 2,
    "total_price": "0.05000000",
    "currency": "BTC",
    "payment_address": null,
    "delivery_address": "123 Main St, City, Country",
    "status": "pending",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get My Orders
```bash
curl -X GET "http://localhost:3000/api/orders/my?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Order by ID
```bash
curl -X GET http://localhost:3000/api/orders/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Update Order Status (Seller only)
```bash
curl -X PUT http://localhost:3000/api/orders/1/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "confirmed"
  }'
```

**Possible statuses:** `pending`, `confirmed`, `shipped`, `delivered`, `cancelled`

---

## Payments

### Verify Payment
```bash
curl -X POST http://localhost:3000/api/payments/verify \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": 1,
    "txHash": "0x1234567890abcdef...",
    "currency": "ETH"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "payment": {
      "id": 1,
      "order_id": 1,
      "tx_hash": "0x1234567890abcdef...",
      "amount": "0.05000000",
      "currency": "ETH",
      "status": "confirmed",
      "confirmations": 12,
      "verified_at": "2024-01-01T00:10:00.000Z",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:10:00.000Z"
    },
    "verification": {
      "verified": true,
      "confirmations": 12,
      "status": "confirmed"
    }
  }
}
```

### Get Payments by Order
```bash
curl -X GET http://localhost:3000/api/payments/order/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Check Payment Status
```bash
curl -X GET "http://localhost:3000/api/payments/status?txHash=0x1234567890abcdef..." \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Subscriptions

### Subscribe to a Shop
```bash
curl -X POST http://localhost:3000/api/subscriptions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shopId": 1
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully subscribed to shop",
  "data": {
    "id": 1,
    "user_id": 1,
    "shop_id": 1,
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get My Subscriptions
```bash
curl -X GET "http://localhost:3000/api/subscriptions?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "shop_id": 1,
      "created_at": "2024-01-01T00:00:00.000Z",
      "shop_name": "My Awesome Shop",
      "shop_description": "We sell amazing products",
      "shop_owner_username": "seller1"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

### Get Shop Subscribers (Shop Owner Only)
```bash
curl -X GET "http://localhost:3000/api/subscriptions/shop/1?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 2,
      "shop_id": 1,
      "created_at": "2024-01-01T00:00:00.000Z",
      "username": "buyer1",
      "first_name": "John",
      "last_name": "Doe"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

### Check Subscription Status
```bash
curl -X GET http://localhost:3000/api/subscriptions/check/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscribed": true
  }
}
```

### Unsubscribe from a Shop
```bash
curl -X DELETE http://localhost:3000/api/subscriptions/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully unsubscribed from shop"
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "price",
      "message": "Price must be greater than 0"
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
  "error": "Only sellers can create shops"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Product not found"
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

## WebSocket Example

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected to WebSocket');

  // Send ping
  ws.send(JSON.stringify({ type: 'ping' }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Message:', data);

  if (data.type === 'connected') {
    console.log('WebSocket connected:', data.message);
  }

  if (data.type === 'pong') {
    console.log('Pong received at:', new Date(data.timestamp));
  }

  if (data.type === 'order_update') {
    console.log('Order updated:', data.data);
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket disconnected');
};
```

---

## Testing with Postman

1. Import collection URL: `http://localhost:3000/api`
2. Set environment variable `baseUrl` = `http://localhost:3000/api`
3. Set environment variable `token` = `YOUR_JWT_TOKEN`
4. Use `{{baseUrl}}` and `{{token}}` in requests

---

## Rate Limiting

Default limits:
- 100 requests per 15 minutes per IP
- Configurable via environment variables

Headers returned:
```
RateLimit-Limit: 100
RateLimit-Remaining: 99
RateLimit-Reset: 1704067200
```

---

## Pagination

List endpoints support pagination:
```bash
?page=1&limit=20
```

Default: `page=1`, `limit=50`
Max limit: `100`

Response includes pagination info:
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
