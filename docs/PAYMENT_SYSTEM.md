# Payment System Documentation

## Overview

Status Stock uses a **Direct P2P (Peer-to-Peer) payment system** where buyers pay directly to seller wallets. The platform verifies payments via public blockchain APIs.

## Payment Types

### 1. Order Payments (Direct P2P)
Buyers pay directly to seller's crypto wallet for product purchases.

### 2. Subscription Payments (CrystalPay)
Sellers pay platform fees via CrystalPay merchant gateway.

---

## Order Payment Flow

```
┌─────────────┐    ┌────────────────────────┐    ┌─────────────────────────┐
│   Buyer     │───>│ GET /orders/:id/       │───>│ Return seller wallet    │
│  (WebApp)   │    │    payment-info        │    │ + crypto amount + QR    │
└─────────────┘    └────────────────────────┘    └─────────────────────────┘
      │
      │  Buyer pays manually via their wallet app
      │  (Direct P2P: Buyer wallet → Seller wallet)
      ▼
┌─────────────┐    ┌────────────────────────┐    ┌─────────────────────────┐
│   Buyer     │───>│ POST /orders/:id/      │───>│ Save tx_hash            │
│  submits    │    │    submit-payment      │    │ Create payment record   │
│  tx_hash    │    │ { tx_hash, currency }  │    │ status = 'pending'      │
└─────────────┘    └────────────────────────┘    └─────────────────────────┘
                                                           │
                   ┌───────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BACKGROUND WORKER (every 30 sec)                      │
│                                                                          │
│  1. SELECT pending payments WHERE created_at > NOW() - 24 hours          │
│  2. For each payment:                                                    │
│     - Call blockchain API (BlockCypher/Etherscan/TronGrid)              │
│     - Check: confirmations >= required                                   │
│     - Check: recipient address matches seller wallet                     │
│     - Check: amount >= expected (with 2% tolerance)                      │
│  3. If verified:                                                         │
│     - UPDATE order.status = 'confirmed'                                  │
│     - Deduct stock                                                       │
│     - Telegram notification to seller                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Get Payment Info
```
GET /api/orders/:id/payment-info?currency=BTC
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "orderId": 123,
    "currency": "BTC",
    "address": "bc1q...",        // Seller's wallet
    "amount": 0.00123,           // Crypto amount
    "amountUsd": 50.00,
    "usdRate": 40650.00,
    "qrUri": "bitcoin:bc1q...?amount=0.00123",
    "shopName": "MyShop",
    "expiresIn": 3600,           // 1 hour
    "minConfirmations": 3
  }
}
```

### Submit Payment
```
POST /api/orders/:id/submit-payment
Authorization: Bearer <token>
Content-Type: application/json

{
  "tx_hash": "abc123...",
  "currency": "BTC"
}

Response:
{
  "success": true,
  "data": {
    "paymentId": 456,
    "status": "pending",
    "message": "Payment submitted for verification"
  }
}
```

### Check Payment Status
```
GET /api/orders/:id/payment-status
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "status": "pending",         // pending | verifying | confirmed | failed
    "confirmations": 2,
    "requiredConfirmations": 3,
    "lastCheckedAt": "2024-01-15T12:00:00Z"
  }
}
```

## Supported Cryptocurrencies

| Currency | Blockchain API | Min Confirmations |
|----------|---------------|-------------------|
| BTC      | BlockCypher   | 3                 |
| LTC      | BlockCypher   | 3                 |
| ETH      | Etherscan     | 3                 |
| USDT TRC20 | TronGrid    | 1                 |

## Seller Wallet Configuration

Sellers configure their wallets in Shop Settings:

```
Shop Settings → Crypto Wallets:
├── BTC:  bc1q...
├── ETH:  0x...
├── LTC:  ltc1...
└── USDT: T... (TRC20)
```

Database columns in `shops` table:
- `wallet_btc` - Bitcoin address
- `wallet_eth` - Ethereum address
- `wallet_ltc` - Litecoin address
- `wallet_usdt` - USDT TRC20 address (Tron)

## Security Features

1. **Double-spend protection** - Unique constraint on `tx_hash` in payments table
2. **Amount tolerance** - 2% tolerance for network fees
3. **Address validation** - Recipient must match seller wallet
4. **24h timeout** - Pending payments expire after 24 hours
5. **Rate limiting** - 3 requests/minute on submit-payment endpoint
6. **FOR UPDATE SKIP LOCKED** - Prevents race conditions in worker

## Environment Variables

```env
# Blockchain API Keys (required for payment verification)
BLOCKCYPHER_API_KEY=your-key
ETHERSCAN_API_KEY=your-key
TRONGRID_API_KEY=your-key

# Confirmation thresholds (optional, has defaults)
CONFIRMATIONS_BTC=3
CONFIRMATIONS_LTC=3
CONFIRMATIONS_ETH=3
CONFIRMATIONS_TRON=1
```

## Files Structure

```
backend/
├── src/
│   ├── controllers/
│   │   └── orderController.js      # getPaymentInfo, submitPayment, getPaymentStatus
│   ├── services/
│   │   ├── blockchainVerificationService.js  # Blockchain API calls
│   │   └── cryptoPriceService.js   # USD to crypto conversion
│   ├── workers/
│   │   └── paymentVerificationWorker.js  # Background verification
│   └── database/queries/
│       ├── orderQueries.js         # getInvoiceData, setCryptoPayment
│       └── paymentQueries.js       # findPendingForVerification
└── database/
    └── migrations/
        └── 043_direct_crypto_payments.sql
```

## Subscription Payments (Platform Fees)

Subscription payments (shop registration fees) go through CrystalPay:

- **Basic tier**: $25/month
- **Pro tier**: $35/month

This is separate from order payments and uses merchant payment gateway.
