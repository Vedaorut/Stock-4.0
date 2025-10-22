# Wallet Management API

API для управления криптовалютными кошельками магазинов.

## Описание

Каждый магазин может хранить до 4 криптовалютных адресов для приема платежей:
- **BTC** - Bitcoin wallet address
- **ETH** - Ethereum wallet address
- **USDT** - USDT (ERC-20) wallet address
- **TON** - TON wallet address

Все адреса хранятся в таблице `shops` в колонках `wallet_btc`, `wallet_eth`, `wallet_usdt`, `wallet_ton`.

## Endpoints

### GET /api/wallets/:shopId
Получить адреса кошельков магазина.

**Авторизация:** Требуется (владелец магазина)

**Параметры:**
- `shopId` (path) - ID магазина

**Ответ:**
```json
{
  "success": true,
  "data": {
    "shopId": 1,
    "shopName": "My Awesome Shop",
    "wallets": {
      "btc": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      "eth": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "usdt": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "ton": "EQD7ckT9p8Hv5Kz8s2lPz5rQx8q9vW1xY2nZ3fJ4kL5mN6oP"
    }
  }
}
```

**Ошибки:**
- `401` - Не авторизован
- `403` - Не владелец магазина
- `404` - Магазин не найден

---

### PUT /api/wallets/:shopId
Обновить адреса кошельков магазина (полное обновление).

**Авторизация:** Требуется (владелец магазина)

**Параметры:**
- `shopId` (path) - ID магазина

**Тело запроса:**
```json
{
  "walletBtc": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "walletEth": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "walletUsdt": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "walletTon": "EQD7ckT9p8Hv5Kz8s2lPz5rQx8q9vW1xY2nZ3fJ4kL5mN6oP"
}
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "shopId": 1,
    "shopName": "My Awesome Shop",
    "wallets": {
      "btc": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      "eth": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "usdt": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "ton": "EQD7ckT9p8Hv5Kz8s2lPz5rQx8q9vW1xY2nZ3fJ4kL5mN6oP"
    },
    "updatedAt": "2024-01-01T00:10:00.000Z"
  },
  "message": "Wallet addresses updated successfully"
}
```

**Ошибки:**
- `400` - Невалидные данные
- `401` - Не авторизован
- `403` - Не владелец магазина
- `404` - Магазин не найден

---

### PATCH /api/wallets/:shopId
Обновить отдельные адреса кошельков (частичное обновление).

**Авторизация:** Требуется (владелец магазина)

**Параметры:**
- `shopId` (path) - ID магазина

**Тело запроса:**
```json
{
  "walletBtc": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
}
```

**Ответ:** Аналогичен PUT

---

## Валидация адресов

### Bitcoin (BTC)
- **Формат:** Alphanumeric (A-Z, a-z, 0-9)
- **Длина:** 26-62 символов
- **Примеры:**
  - `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa` (Legacy)
  - `3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy` (P2SH)
  - `bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq` (Bech32)

### Ethereum (ETH)
- **Формат:** 0x + 40 hex символов
- **Длина:** Ровно 42 символа
- **Regex:** `^0x[a-fA-F0-9]{40}$`
- **Пример:** `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`

### USDT (ERC-20)
- **Формат:** Аналогично ETH (ERC-20 token)
- **Длина:** Ровно 42 символа
- **Regex:** `^0x[a-fA-F0-9]{40}$`
- **Пример:** `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`

### TON
- **Формат:** Base64url encoded
- **Длина:** Ровно 48 символов
- **Regex:** `^[a-zA-Z0-9_-]+$`
- **Пример:** `EQD7ckT9p8Hv5Kz8s2lPz5rQx8q9vW1xY2nZ3fJ4kL5mN6oP`

---

## Безопасность

1. **Авторизация:** Все endpoints требуют JWT токен
2. **Ownership Verification:** Проверка что пользователь владеет магазином
3. **Input Validation:** Валидация формата адресов с помощью regex
4. **Rate Limiting:** Применяется общий rate limit (100 req/15 min)

---

## Примеры использования

### cURL

```bash
# Получить кошельки
curl -X GET http://localhost:3000/api/wallets/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Обновить все кошельки
curl -X PUT http://localhost:3000/api/wallets/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletBtc": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    "walletEth": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
  }'

# Обновить только BTC адрес
curl -X PATCH http://localhost:3000/api/wallets/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletBtc": "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
  }'

# Удалить адрес (установить в null)
curl -X PATCH http://localhost:3000/api/wallets/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletBtc": null
  }'
```

### JavaScript (Fetch API)

```javascript
// Получить кошельки
async function getWallets(shopId, token) {
  const response = await fetch(`http://localhost:3000/api/wallets/${shopId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();

  if (data.success) {
    console.log('Wallets:', data.data.wallets);
    return data.data.wallets;
  } else {
    console.error('Error:', data.error);
    throw new Error(data.error);
  }
}

// Обновить кошельки
async function updateWallets(shopId, wallets, token) {
  const response = await fetch(`http://localhost:3000/api/wallets/${shopId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(wallets)
  });

  const data = await response.json();

  if (data.success) {
    console.log('Updated wallets:', data.data.wallets);
    return data.data;
  } else {
    console.error('Error:', data.error);
    throw new Error(data.error);
  }
}

// Пример использования
const token = 'your_jwt_token_here';
const shopId = 1;

// Получить текущие кошельки
const currentWallets = await getWallets(shopId, token);

// Обновить кошельки
const updatedData = await updateWallets(shopId, {
  walletBtc: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  walletEth: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  walletUsdt: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  walletTon: 'EQD7ckT9p8Hv5Kz8s2lPz5rQx8q9vW1xY2nZ3fJ4kL5mN6oP'
}, token);
```

### React Hook Example

```javascript
import { useState, useEffect } from 'react';

function useWallets(shopId, token) {
  const [wallets, setWallets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Получить кошельки
  const fetchWallets = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3000/api/wallets/${shopId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();

      if (data.success) {
        setWallets(data.data.wallets);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Обновить кошельки
  const updateWallets = async (newWallets) => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3000/api/wallets/${shopId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newWallets)
      });

      const data = await response.json();

      if (data.success) {
        setWallets(data.data.wallets);
        return data.data;
      } else {
        setError(data.error);
        throw new Error(data.error);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (shopId && token) {
      fetchWallets();
    }
  }, [shopId, token]);

  return { wallets, loading, error, updateWallets, refetch: fetchWallets };
}

// Использование в компоненте
function WalletSettings({ shopId, token }) {
  const { wallets, loading, error, updateWallets } = useWallets(shopId, token);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    try {
      await updateWallets({
        walletBtc: formData.get('btc'),
        walletEth: formData.get('eth'),
        walletUsdt: formData.get('usdt'),
        walletTon: formData.get('ton')
      });
      alert('Wallets updated successfully!');
    } catch (err) {
      alert('Failed to update wallets');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="btc" defaultValue={wallets.btc || ''} placeholder="BTC Address" />
      <input name="eth" defaultValue={wallets.eth || ''} placeholder="ETH Address" />
      <input name="usdt" defaultValue={wallets.usdt || ''} placeholder="USDT Address" />
      <input name="ton" defaultValue={wallets.ton || ''} placeholder="TON Address" />
      <button type="submit">Update Wallets</button>
    </form>
  );
}
```

---

## База данных

### Таблица shops

```sql
CREATE TABLE shops (
  id SERIAL PRIMARY KEY,
  owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  logo TEXT,
  wallet_btc VARCHAR(255),      -- Bitcoin address
  wallet_eth VARCHAR(255),      -- Ethereum address
  wallet_usdt VARCHAR(255),     -- USDT (ERC-20) address
  wallet_ton VARCHAR(255),      -- TON address
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Миграция

Если колонки еще не существуют:

```sql
ALTER TABLE shops
ADD COLUMN IF NOT EXISTS wallet_btc VARCHAR(255),
ADD COLUMN IF NOT EXISTS wallet_eth VARCHAR(255),
ADD COLUMN IF NOT EXISTS wallet_usdt VARCHAR(255),
ADD COLUMN IF NOT EXISTS wallet_ton VARCHAR(255);
```

---

## Интеграция с платежной системой

После получения адреса кошелька, покупатель может отправить платеж:

1. **Получить адрес продавца:**
```javascript
const { wallets } = await getWallets(shopId, token);
const btcAddress = wallets.btc;
```

2. **Покупатель отправляет платеж на этот адрес**

3. **Покупатель предоставляет transaction hash для верификации:**
```javascript
const verification = await fetch('http://localhost:3000/api/payments/verify', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    orderId: 123,
    txHash: '0x1234567890abcdef...',
    currency: 'BTC'
  })
});
```

---

## Тестирование

### Unit Tests

```javascript
describe('Wallet Controller', () => {
  it('should get wallets for shop owner', async () => {
    const res = await request(app)
      .get('/api/wallets/1')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.wallets).toHaveProperty('btc');
  });

  it('should reject non-owner', async () => {
    const res = await request(app)
      .get('/api/wallets/1')
      .set('Authorization', `Bearer ${otherUserToken}`);

    expect(res.status).toBe(403);
  });

  it('should update wallets', async () => {
    const res = await request(app)
      .put('/api/wallets/1')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        walletBtc: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.wallets.btc).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  });

  it('should reject invalid BTC address', async () => {
    const res = await request(app)
      .put('/api/wallets/1')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        walletBtc: 'invalid_address'
      });

    expect(res.status).toBe(400);
  });
});
```

---

## Известные ограничения

1. **Не проверяется существование адреса в blockchain** - валидация только формата
2. **Нет автоматической верификации ownership** - предполагается что продавец вводит свой адрес
3. **Нет истории изменений** - каждое обновление перезаписывает предыдущее значение

---

## Roadmap

- [ ] Добавить историю изменений адресов
- [ ] Реализовать верификацию ownership через подпись сообщения
- [ ] Добавить поддержку дополнительных криптовалют
- [ ] Реализовать автоматическую валидацию адреса через blockchain API
- [ ] Добавить уведомления при изменении адресов

---

## Changelog

### v1.0.0 (2024-01-01)
- Первый релиз
- Поддержка BTC, ETH, USDT, TON
- GET, PUT, PATCH endpoints
- Валидация формата адресов
- Ownership verification
