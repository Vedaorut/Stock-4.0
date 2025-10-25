# Crypto Payment Verification — Practical Implementation Guide

## Quick Comparison Matrix

### Recommendation Summary
```
┌─────────────────────────────────────────────────────────────────┐
│                  VERIFICATION FLOW COMPARISON                   │
├──────────────┬───────────────┬────────────────┬──────────────────┤
│ Currency     │ Best API      │ Complexity     │ Recommended Tier │
├──────────────┼───────────────┼────────────────┼──────────────────┤
│ BTC          │ blockchain.io │ ⭐ Simple      │ Free/$25/month   │
│ ETH          │ Etherscan     │ ⭐⭐ Medium   │ Free/$25/month   │
│ USDT (ERC20) │ Etherscan     │ ⭐⭐⭐ Hard    │ Free/$25/month   │
│ TON          │ TonAPI        │ ⭐⭐ Medium   │ Getblock Free    │
│ USDT (TRC20) │ TronWeb       │ ⭐⭐ Medium   │ N/A (future)     │
└──────────────┴───────────────┴────────────────┴──────────────────┘
```

## Payment Verification Flows

### Flow 1: Bitcoin (BTC)
```
User Payment → blockchain.info /rawtx/{hash}
                    ↓
            Find output to address
                    ↓
        Convert satoshis to BTC (÷100000000)
                    ↓
        Check: amount ≈ expected (±1% tolerance)
                    ↓
        Get block height → calculate confirmations
                    ↓
        ✅ If ≥3 confirmations: CONFIRMED
        ⏳ Otherwise: PENDING
        ❌ Amount/Address mismatch: FAILED
```

### Flow 2: Ethereum (ETH)
```
User Payment → Etherscan eth_getTransactionByHash
                    ↓
        Verify tx.to === expectedAddress
                    ↓
        Convert wei to ETH (÷1e18)
                    ↓
        Check: amount ≈ expected (±1% tolerance)
                    ↓
        Get tx receipt: eth_getTransactionReceipt
                    ↓
        Check receipt.status === '0x1' (SUCCESS)
                    ↓
        ✅ If status='0x1' AND confirmations≥1: CONFIRMED
        ⏳ Otherwise or status='0x0': FAILED
```

### Flow 3: USDT (ERC-20 on Ethereum)
```
User Payment → Etherscan eth_getTransactionByHash
                    ↓
        Verify tx.to === USDT_CONTRACT_ADDRESS
                    ↓
        Get receipt logs: eth_getTransactionReceipt
                    ↓
        Find Transfer event (topic[0] = 0xddf252ad...)
                    ↓
        Decode: 
        - Recipient: topic[2].slice(26) → address
        - Amount: data (hex) / 1e6 (6 decimals)
                    ↓
        Check: recipient === expectedAddress
               amount ≈ expected (±1% tolerance)
                    ↓
        ✅ If receipt.status='0x1' AND verified: CONFIRMED
        ❌ Otherwise: FAILED
```

### Flow 4: TON (The Open Network)
```
User Payment → TonAPI /v2/blockchain/transactions/{hash}
                    ↓
        Get transaction details
                    ↓
        Verify in_msg.destination === expectedAddress
                    ↓
        Convert nanotons to TON (÷1e9)
                    ↓
        Check: amount ≈ expected (±1% tolerance)
                    ↓
        TON finalizes FAST (1-2 blocks):
        ✅ If tx exists AND verified: CONFIRMED
        ⏳ If tx in mempool: PENDING
        ❌ Otherwise: FAILED
```

## Error Handling Patterns

### Retry Logic Pattern (Exponential Backoff)
```javascript
async function verifyWithRetry(verifyFn, maxRetries = 3, initialDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await verifyFn();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw new Error(`Verification failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, attempt);
      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, { error });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Usage:
const verification = await verifyWithRetry(
  () => cryptoService.verifyBitcoinTransaction(txHash, address, amount),
  3,
  1000
);
```

### Error Classification
```javascript
const errorCategories = {
  TRANSIENT: {
    // Retry
    'TIMEOUT',
    'RATE_LIMIT',
    'CONNECTION_ERROR',
    'TEMPORARILY_UNAVAILABLE'
  },
  PERMANENT: {
    // Don't retry
    'INVALID_HASH',
    'TRANSACTION_NOT_FOUND',
    'ADDRESS_MISMATCH',
    'AMOUNT_MISMATCH',
    'INVALID_ADDRESS_FORMAT'
  },
  BLOCKCHAIN: {
    // Transaction exists but invalid
    'TRANSACTION_FAILED',
    'TRANSACTION_REVERTED',
    'INSUFFICIENT_CONFIRMATIONS'
  }
};

function shouldRetry(error) {
  return Object.values(errorCategories.TRANSIENT).some(
    category => error.message.includes(category)
  );
}
```

## API Endpoint Specifications

### POST /api/payments/verify
```bash
curl -X POST http://localhost:3000/api/payments/verify \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": 123,
    "txHash": "abc123...",
    "currency": "BTC"
  }'
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "payment": {
      "id": 1,
      "order_id": 123,
      "tx_hash": "abc123...",
      "amount": 0.001,
      "currency": "BTC",
      "status": "confirmed",
      "confirmations": 3
    },
    "verification": {
      "verified": true,
      "confirmations": 3,
      "status": "confirmed"
    }
  }
}
```

**Response (Failure):**
```json
{
  "success": false,
  "error": "Amount mismatch. Expected: 0.001 BTC, Received: 0.0005 BTC"
}
```

### GET /api/payments/status?txHash={hash}
```bash
curl http://localhost:3000/api/payments/status?txHash=abc123... \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "tx_hash": "abc123...",
    "status": "pending",
    "confirmations": 1,
    "amount": 0.001,
    "currency": "BTC"
  }
}
```

### POST /api/payments/qr
```bash
curl -X POST http://localhost:3000/api/payments/qr \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "amount": 0.001,
    "currency": "BTC"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "qrCode": "data:image/png;base64,...",
    "paymentURI": "bitcoin:bc1qxy...?amount=0.001",
    "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "amount": 0.001,
    "currency": "BTC"
  }
}
```

## Environment Variables Setup

```bash
# Backend .env
export PORT=3000
export DATABASE_URL="postgresql://admin:password@localhost:5432/telegram_shop"
export JWT_SECRET="your-super-secret-key-min-32-chars"
export TELEGRAM_BOT_TOKEN="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"

# Crypto APIs (Free tiers recommended for dev)
export BLOCKCHAIN_API_KEY=""  # Optional for blockchain.info (free works)
export ETHERSCAN_API_KEY="YOUR_ETHERSCAN_KEY"  # Free tier: 5M req/day
export TON_API_KEY="YOUR_TON_API_KEY"  # Optional (Getblock free)

# Platform wallet addresses (CHANGE THESE!)
export CRYPTO_BTC_ADDRESS="bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
export CRYPTO_ETH_ADDRESS="0x1234567890123456789012345678901234567890"
export CRYPTO_USDT_ADDRESS="0xdac17f958d2ee523a2206206994597c13d831ec7"  # ERC-20 USDT contract
export CRYPTO_TON_ADDRESS="EQCbxfW1fP8eKzVaVN_z-cp2gEkE3pjt1xUpGHa2XrJXExga"

# TON Network config
export USDT_NETWORK="ethereum"  # or "tron", "ton" (future)
```

## Testing Verification Locally

### Using testnet addresses
```javascript
// Bitcoin Testnet
const BTC_TESTNET_ADDR = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const BTC_TESTNET_TX = "9f896a6191caeb1e88b58e4b1923a7f00d0ac01e6e8b1fa4f9d11ecd5e81d01f";

// Goerli Testnet (Ethereum)
const ETH_TESTNET_ADDR = "0x742d35Cc6634C0532925a3b844Bc9e7595f51Bc5";
const ETH_TESTNET_TX = "0x1234...";

// TON Testnet
const TON_TESTNET_ADDR = "EQCbxfW1fP8eKzVaVN_z-cp2gEkE3pjt1xUpGHa2XrJXExga";
const TON_TESTNET_TX = "...";
```

### Mock API responses for testing
```javascript
import MockAdapter from 'axios-mock-adapter';
import { api } from './api';

const mock = new MockAdapter(api);

// Mock blockchain.info BTC verification
mock.onGet('https://blockchain.info/rawtx/abc123').reply(200, {
  tx_index: 1234567,
  block_height: 700000,
  out: [
    {
      addr: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      value: 100000  // 0.001 BTC in satoshis
    }
  ]
});

// Mock Etherscan transaction
mock.onGet('https://api.etherscan.io/api').reply(200, {
  result: {
    to: "0x1234567890123456789012345678901234567890",
    value: "1000000000000000",  // 0.001 ETH in wei
    status: "0x1"
  }
});
```

## Monitoring & Debugging

### Useful query patterns
```sql
-- Check pending payments
SELECT id, order_id, tx_hash, currency, status, created_at
FROM payments
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check failed verifications
SELECT id, order_id, currency, COUNT(*) as attempts
FROM payments
WHERE status = 'failed'
GROUP BY order_id, currency
HAVING COUNT(*) > 3;

-- Check verification latency
SELECT 
  currency,
  AVG(EXTRACT(EPOCH FROM (verified_at - created_at))) as avg_verification_seconds,
  MAX(EXTRACT(EPOCH FROM (verified_at - created_at))) as max_verification_seconds
FROM payments
WHERE verified_at IS NOT NULL
GROUP BY currency;
```

### Debug logging
```javascript
// Enable detailed crypto verification logging
const logger = {
  debug: (msg, data) => console.log(`[DEBUG] ${msg}`, JSON.stringify(data, null, 2)),
  info: (msg, data) => console.info(`[INFO] ${msg}`, data),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data)
};

// During verification
logger.debug('Verifying BTC transaction', {
  txHash,
  expectedAddress,
  expectedAmount,
  timestamp: new Date().toISOString()
});

const result = await verifyBitcoinTransaction(txHash, expectedAddress, expectedAmount);

logger.debug('Verification result', {
  verified: result.verified,
  confirmations: result.confirmations,
  actualAmount: result.amount,
  status: result.status
});
```

## Integration Checklist

- [ ] All 4 APIs configured and tested
- [ ] Retry logic implemented with exponential backoff
- [ ] Error handling for transient vs permanent failures
- [ ] Receipt status check for ETH (reverted tx detection)
- [ ] TON verification rewritten with TonAPI
- [ ] Redis caching for block heights
- [ ] Rate limiting on payment endpoints
- [ ] Idempotency via UNIQUE constraint on tx_hash
- [ ] Tests for happy path + error cases
- [ ] Monitoring dashboard setup
- [ ] Alerting for high failure rates
- [ ] Documentation updated
- [ ] Security audit completed

