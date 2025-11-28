# Blockchain Verification Service

Сервис для верификации криптовалютных платежей через публичные блокчейн API.

## Поддерживаемые криптовалюты

| Валюта | API Provider | Min Confirmations | Decimals |
|--------|--------------|-------------------|----------|
| BTC    | BlockCypher  | 3                 | 8        |
| LTC    | BlockCypher  | 3                 | 8        |
| ETH    | Etherscan    | 12                | 18       |
| USDT   | TronGrid     | 19                | 6        |

## Конфигурация (.env)

```bash
# Etherscan API (для ETH)
ETHERSCAN_API_KEY=your-etherscan-api-key-here

# TronGrid API (для USDT TRC20)
TRONGRID_API_KEY=your-trongrid-api-key-here

# BlockCypher token (опционально, для повышенного rate limit)
BLOCKCYPHER_TOKEN=your-blockcypher-token-here
```

## Использование

### Основной метод - verifyPayment

```javascript
import { verifyPayment } from './services/blockchainVerificationService.js';

const result = await verifyPayment(
  txHash,           // Transaction hash
  chain,            // 'BTC' | 'LTC' | 'ETH' | 'USDT'
  expectedAddress,  // Expected recipient address
  expectedAmount    // Expected amount in crypto (not smallest unit)
);

// Result format:
// {
//   verified: boolean,        // true if payment valid & confirmed
//   status: string,            // 'pending' | 'confirmed' | 'failed'
//   confirmations: number,     // Current confirmations
//   amount: string,            // Actual received amount
//   error?: string             // Error message if failed
// }
```

### Примеры

#### Bitcoin

```javascript
const result = await verifyPayment(
  '7c9f2c6b3a4e8d1f5b9c8a7e6d4c3b2a1f9e8d7c6b5a4e3d2c1b0a9f8e7d6c5b4',
  'BTC',
  '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  '0.001' // 0.001 BTC
);

if (result.verified) {
  console.log(`Payment confirmed! Amount: ${result.amount} BTC`);
} else if (result.status === 'pending') {
  console.log(`Waiting for confirmations: ${result.confirmations}/3`);
} else {
  console.error(`Payment failed: ${result.error}`);
}
```

#### Ethereum

```javascript
const result = await verifyPayment(
  '0x1234...abcd',
  'ETH',
  '0x742d35Cc6634C0532925a3b844Bc9e7595f0beb1',
  '0.05' // 0.05 ETH
);
```

#### Litecoin

```javascript
const result = await verifyPayment(
  'abc123...',
  'LTC',
  'LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL',
  '0.5' // 0.5 LTC
);
```

#### USDT TRC20

```javascript
const result = await verifyPayment(
  'def456...',
  'USDT',
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  '100' // 100 USDT
);
```

## Особенности

### Amount Tolerance (2%)

Сервис принимает платежи с отклонением -2% от ожидаемой суммы для учёта network fees:

```javascript
// Expected: 1.0 BTC
// Minimum accepted: 0.98 BTC (98% of expected)
// 0.99 BTC ✅ Accepted
// 0.97 BTC ❌ Rejected (insufficient amount)
```

### Retry Logic

Автоматические повторные попытки при API ошибках:
- **3 попытки** с exponential backoff
- Задержки: 1s → 2s → 4s
- Timeout: 10 секунд на каждый запрос

### Error Handling

Подробные сообщения об ошибках:

```javascript
{
  verified: false,
  status: 'failed',
  confirmations: 0,
  amount: '0',
  error: 'Payment not sent to expected address'
}
```

Типичные ошибки:
- `Invalid transaction hash`
- `Unsupported chain: DOGE`
- `Transaction not found`
- `Payment not sent to expected address`
- `Insufficient amount: expected X, received Y`
- `Transaction flagged as double-spend` (BTC/LTC)
- `Transaction failed on blockchain` (ETH/USDT)
- `Insufficient confirmations` (status: 'pending')
- `API error` (rate limit, timeout, network)

## API Rate Limits

### BlockCypher (BTC, LTC)
- **Free tier:** 3 req/sec, 200 req/hour
- **With token:** 10 req/sec, 5000 req/hour

### Etherscan (ETH)
- **Free tier:** 5 req/sec
- **Requires API key**

### TronGrid (USDT)
- **Free tier:** 100 req/sec
- **Optional API key** для повышенного лимита

## Security Considerations

### ✅ Что проверяется

1. **Recipient Address** - платёж отправлен на правильный адрес
2. **Amount** - сумма >= ожидаемой (с tolerance 2%)
3. **Confirmations** - достаточно подтверждений для chain
4. **Double-spend** (BTC/LTC) - транзакция не помечена как double-spend
5. **Transaction Status** (ETH/USDT) - status = SUCCESS на блокчейне

### ❌ Что НЕ проверяется

- Ownership адреса (watch-only verification)
- Private key validation (не требуется)
- Replace-by-fee (RBF) attacks (требует мониторинг mempool)

### Рекомендации

1. **Подождите достаточно confirmations** перед зачислением:
   - BTC: 3+ (balanced), 6+ (high value)
   - LTC: 3+ (balanced), 12+ (high value)
   - ETH: 12+ (balanced), 30+ (high value)
   - USDT: 19+ (balanced), 30+ (high value)

2. **Мониторинг webhook** - используйте webhook вместо polling:
   - BlockCypher webhooks для BTC/LTC
   - Etherscan event logs для ETH
   - TronGrid events для USDT

3. **Логирование** - все результаты логируются через winston logger

4. **Кеширование** - кешируйте результаты по txHash для повторных проверок

## Интеграция с Payment Flow

```javascript
// В контроллере payment verification
import { verifyPayment } from '../services/blockchainVerificationService.js';

async function handlePaymentVerification(req, res) {
  const { txHash, orderId } = req.body;
  
  // Получить order из БД
  const order = await getOrder(orderId);
  
  // Верифицировать payment
  const verification = await verifyPayment(
    txHash,
    order.currency,
    order.payment_address,
    order.crypto_amount
  );
  
  if (verification.verified) {
    // Payment confirmed - update order status
    await updateOrderStatus(orderId, 'confirmed');
    return res.json({ success: true, message: 'Payment confirmed' });
  } else if (verification.status === 'pending') {
    // Waiting for confirmations
    return res.json({ 
      success: false, 
      message: `Waiting for confirmations: ${verification.confirmations}`,
      confirmations: verification.confirmations
    });
  } else {
    // Payment failed
    return res.status(400).json({ 
      success: false, 
      error: verification.error 
    });
  }
}
```

## Testing

```bash
# Run unit tests
npm test -- blockchainVerificationService.test.js

# Run with coverage
npm run test:coverage -- blockchainVerificationService.test.js
```

Тесты покрывают:
- ✅ Valid payments (BTC, LTC, ETH)
- ✅ Pending transactions (insufficient confirmations)
- ✅ Wrong recipient address
- ✅ Insufficient amount
- ✅ Double-spend detection (BTC/LTC)
- ✅ Failed transactions (ETH)
- ✅ Transaction not found
- ✅ Invalid inputs (empty txHash, unsupported chain)

## USDT TRC20 Note

**Текущая реализация** использует placeholder для `hexToBase58()` конвертации адресов TRON.

**Для production** рекомендуется:
1. Установить `tronweb` библиотеку: `npm install tronweb`
2. Использовать `TronWeb.address.fromHex()` для корректной конвертации
3. Альтернативно: принимать адреса уже в Base58 формате от клиента

Пример с TronWeb:

```javascript
import TronWeb from 'tronweb';

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
});

// Convert hex to base58
const address = tronWeb.address.fromHex('41' + hexAddress);
```

## Changelog

### v1.0.0 (2025-11-28)
- ✅ Initial release
- ✅ Support for BTC, LTC, ETH, USDT TRC20
- ✅ Retry logic with exponential backoff
- ✅ Amount tolerance (2%)
- ✅ Comprehensive error handling
- ✅ Unit tests (13 passing)

## License

ISC
