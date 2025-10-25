# CRYPTO PAYMENT AUTOMATION - QUICK REFERENCE

**Status**: Исследование завершено | **Дата**: Октябрь 2025

---

## TOP 3 РЕКОМЕНДАЦИИ

### 1. NOWPayments ⭐⭐⭐ (ВЫБИРАЕМ СЕЙЧАС)
- **Стоимость**: 0.5% на платеж
- **Setup**: 2-3 дня
- **Плюсы**: Простой API, все валюты, real-time webhook
- **Минусы**: Комиссия растет с volume
- **Подходит**: MVP до 10k платежей/мес

### 2. Tatum ⭐⭐⭐ (ВЫБИРАЕМ КОГДА РАСТЕТ)
- **Стоимость**: $99-999/мес (по volume)
- **Setup**: 3-5 дней
- **Плюсы**: 50+ блокчейнов, enterprise-grade, real-time webhook
- **Минусы**: Дороже на малых объемах
- **Подходит**: Production при >1k платежей/мес

### 3. Self-hosted Polling ⭐⭐⭐ (КАК FALLBACK)
- **Стоимость**: FREE
- **Setup**: 2 дня
- **Плюсы**: Полный контроль, бесплатно, все валюты
- **Минусы**: 30 сек задержка, нужна инфраструктура
- **Подходит**: Резервный канал + backup

---

## ТАБЛИЦА СРАВНЕНИЯ (15 СЕРВИСОВ)

| # | Сервис | BTC | ETH | USDT | Webhook | Cost | Сложность | ВЫВОД |
|---|--------|-----|-----|------|---------|------|-----------|-------|
| 1 | **NOWPayments** | ✅ | ✅ | ✅ | ✅ | 0.5% | 2/10 | 🏆 MVP |
| 2 | **Tatum** | ✅ | ✅ | ✅ | ✅ | $99 | 4/10 | 🏆 PROD |
| 3 | Alchemy | ❌ | ✅ | ✅ | ✅ | $400 | 3/10 | ⚠️ дорого |
| 4 | BTCPay | ✅ | ❌ | ❌ | ✅ | FREE | 7/10 | ⚠️ сложно |
| 5 | Coinbase | ✅ | ✅ | ❌ | ✅ | 1% | 2/10 | ⚠️ ограничено |
| 6 | Mempool | ✅ | ❌ | ❌ | ⚠️ | FREE | 5/10 | ✅ BTC only |
| 7 | Etherscan | ❌ | ✅ | ✅ | ⚠️ | FREE | 3/10 | ✅ ETH only |
| 8 | Infura | ❌ | ✅ | ✅ | ✅ | VAR | 4/10 | ✅ EVM |
| 9 | Self-hosted | ✅ | ✅ | ✅ | ❌ | FREE | 5/10 | ✅ fallback |

---

## РЕКОМЕНДУЕМАЯ АРХИТЕКТУРА (HYBRID)

```
PRIMARY: NOWPayments webhook
  ↓
SECONDARY: Self-hosted polling (30 сек) - если webhook не дошел
  ↓
FALLBACK: Direct blockchain API (Etherscan/blockchain.info)
```

### Фазы реализации

**Фаза 1: MVP (сейчас, 1-2 недели)**
- Интегрировать NOWPayments
- Webhook + polling
- ✅ Deploy

**Фаза 2: Prod (6 месяцев)**
- Добавить Tatum как primary
- NOWPayments как secondary
- Multi-provider redundancy

**Фаза 3: Scale (12 месяцев)**
- Migrate на Tatum полностью
- Убрать NOWPayments комиссия
- Enterprise infrastructure

---

## СТОИМОСТЬ ПО СЦЕНАРИЯМ

### Сценарий 1: Small (100 платежей/мес)
```
NOWPayments: 100 × $25 × 0.5% = $12.5/мес
Инфраструктура: $0 (используем их сервер)
ИТОГО: $12.5/мес
```

### Сценарий 2: Medium (10k платежей/мес)
```
NOWPayments: 10000 × $25 × 0.5% = $1,250/мес ⚠️ дорого
Или Tatum: $99-299/мес ✅ дешевле
ВЫБИРАЕМ: Tatum
```

### Сценарий 3: Large (100k платежей/мес)
```
Tatum Business: $999/мес
Плюс инфраструктура: $50-100/мес
ИТОГО: $1,050/мес
```

---

## ТЕХНИЧЕСКИЙ ЧЕКЛИСТ РЕАЛИЗАЦИИ

### NOWPayments Integration

```javascript
// 1. Новый файл: backend/src/services/nowpaymentsService.js
✅ createInvoice()
✅ verifyWebhookSignature()
✅ processWebhook()
✅ getInvoiceStatus()

// 2. Обновить: backend/src/controllers/paymentController.js
✅ createNOWPaymentsInvoice()
✅ nowpaymentsWebhook()
✅ checkInvoiceStatus()

// 3. Обновить: backend/src/routes/payments.js
✅ POST /api/payments/nowpayments/create
✅ POST /api/payments/webhooks/nowpayments
✅ GET /api/payments/invoice/status

// 4. Database
✅ ALTER TABLE payments ADD invoice_id, provider, webhook_timestamp
✅ CREATE INDEX idx_payments_invoice_id

// 5. Environment
✅ NOWPAYMENTS_API_KEY
✅ NOWPAYMENTS_IPN_SECRET
✅ NOWPAYMENTS_WEBHOOK_URL
```

### Self-hosted Polling (Backup)

```javascript
// 1. Новый файл: backend/src/services/paymentMonitorService.js
✅ start() - запустить фоновый worker
✅ monitorPendingPayments() - проверять каждые 30 сек
✅ checkPayment() - верифицировать один платеж
✅ stop() - остановить worker

// 2. Обновить: backend/src/server.js
✅ paymentMonitor.start() при запуске
✅ paymentMonitor.stop() при shutdown

// 3. Database
✅ Уже есть в текущей schema (payments table)
```

---

## MIGRATION ROADMAP

### Week 1: Development
- [ ] Создать nowpaymentsService.js
- [ ] Тестировать на testnet
- [ ] Code review

### Week 2: Staging
- [ ] Деплой на staging
- [ ] E2E тестирование
- [ ] Load тесты

### Week 3: Production
- [ ] Blue-green deployment
- [ ] Monitor логи
- [ ] A/B test (50% пользователей)

### Week 4: Rollout
- [ ] 100% пользователей
- [ ] Убрать старый код (если все OK)

---

## ПОТЕНЦИАЛЬНЫЕ ПРОБЛЕМЫ & РЕШЕНИЯ

| Проблема | Причина | Решение |
|----------|---------|---------|
| Webhook не дошел | NOWPayments down | Self-hosted polling fallback |
| Медленная верификация | API lag | Увеличить polling frequency |
| Высокая комиссия | Много платежей | Migrate на Tatum |
| TX Hash в mempool | Зависает | Стандартная практика, ждать |
| User спешит | Нет instant платежей | Рекомендовать меньше суммы |

---

## КОГДА МЕНЯТЬ ПРОВАЙДЕРА

### Switch на Tatum когда:
- Платежи: >1,000/мес
- Комиссия NOWPayments: >$500/мес
- Нужна: Multi-provider redundancy
- Требуется: Enterprise SLA

### Keep NOWPayments если:
- Платежи: <1,000/мес
- Комиссия: <$500/мес
- Простота: критична
- Бюджет: ограничен

---

## API ПРИМЕРЫ

### NOWPayments: Create Invoice
```bash
curl -X POST https://api.nowpayments.io/v1/invoice \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "price_amount": 25.00,
    "price_currency": "USD",
    "pay_currency": "btc",
    "order_id": "123",
    "ipn_callback_url": "https://your-api.com/webhooks/nowpayments"
  }'
```

### Response
```json
{
  "id": "inv_123abc",
  "pay_address": "1A1z7agoat...",
  "pay_amount": 0.00045,
  "pay_currency": "btc",
  "expiration_date": "2025-10-25T14:30:00Z"
}
```

### Webhook (от NOWPayments → ваш endpoint)
```json
POST /api/payments/webhooks/nowpayments
{
  "invoice_id": "inv_123abc",
  "payment_status": "finished",
  "pay_amount": 0.00045,
  "pay_currency": "btc",
  "order_id": "123",
  "confirmations": 3,
  "received_amount": 0.00045
}
```

---

## ДОКУМЕНТАЦИЯ & ССЫЛКИ

- NOWPayments API: https://documenter.getpostman.com/view/7907941/SVfwTyxo
- Tatum API: https://tatum.io/docs
- BTCPay Docs: https://docs.btcpayserver.org
- Etherscan API: https://docs.etherscan.io
- Mempool API: https://mempool.space/api
- Coinbase Commerce: https://commerce.coinbase.com/docs

---

## ИТОГОВЫЙ ВЕРДИКТ

### ✅ РЕКОМЕНДУЕМ: NOWPayments (MVP)
- Простая интеграция
- Все валюты
- Real-time webhooks
- 0.5% комиссия OK для малых объемов

### ⏰ В БУДУЩЕМ: Tatum (Scale)
- Enterprise-grade
- Multi-provider
- Лучше на больших volume'ах

### 🔄 ВСЕГДА: Self-hosted polling (Fallback)
- Бесплатный резерв
- Полный контроль
- Критически важен для надежности

---

**Автор**: Claude Code  
**Дата**: Октябрь 2025  
**Статус**: Ready to implement
