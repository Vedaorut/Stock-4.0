# Security Audit - Codex Findings (28.11.2024)

## СВОДКА

| # | Severity | Проблема | Файл | Строка | Статус |
|---|----------|----------|------|--------|--------|
| 1 | 🔴 CRITICAL | Register без верификации Telegram | authController.js | 83 | ❌ TODO |
| 2 | 🟠 HIGH | Login с подменой telegramId | authController.js | 17 | ❌ TODO |
| 3 | 🟠 HIGH | Debug endpoints без auth (IDOR) | debug.js | 36 | ❌ TODO |
| 4 | 🟠 HIGH | Webhook без проверки суммы | webhooks.js | 20 | ❌ TODO |
| 5 | 🟡 MEDIUM | IDOR invoice status | payments.js | 126 | ❌ TODO |
| 6 | 🟢 LOW | Hardcoded prices в боте | chooseTier.js | 34 | ❌ TODO |

---

## ДЕТАЛИ

### 1. 🔴 CRITICAL — Register без верификации Telegram

**Файл:** `backend/src/controllers/authController.js:83`

**Проблема:**
`/api/auth/register` принимает произвольные `telegramId`/`username` БЕЗ проверки Telegram подписи или initData. Любой может выпустить JWT токен для ЛЮБОГО Telegram аккаунта = полная имперсонация/захват аккаунта.

**Исправление:**
- Требовать HMAC верификацию initData (как в `verifyTelegramInitData`)
- Отклонять запросы без валидного `x-telegram-init-data`
- Брать user id ТОЛЬКО из верифицированного payload
- Убрать открытую регистрацию

---

### 2. 🟠 HIGH — Login с подменой telegramId

**Файл:** `backend/src/controllers/authController.js:17`

**Проблема:**
`/api/auth/login` доверяет `telegramId` из body и НЕ привязывает его к верифицированной initData. Также не проверяет свежесть `auth_date`.

**Атака:** Злоумышленник может отправить свою валидную initData, но telegramId жертвы → получит JWT жертвы. Старые initData можно переигрывать бесконечно.

**Исправление:**
- Игнорировать client-supplied ID
- Парсить `user.id` из initData
- Проверять совпадение с запросом
- Enforce `auth_date` max age (например, 5 минут)
- Отклонять несовпадения и replay атаки

---

### 3. 🟠 HIGH — Debug endpoints без auth (IDOR)

**Файл:** `backend/src/routes/debug.js:36`

**Проблема:**
Debug endpoints открыты любому аутентифицированному пользователю без проверки ownership/admin:
- `/api/debug/invoice/:id`
- `/api/debug/subscription/:id/invoices`
- `/api/debug/shop/:id/subscription`

Можно получить полные данные invoice/subscription/shop по любому ID = утечка данных.

**Исправление:**
- Закрыть за admin-only auth
- Или удалить в production
- Минимум — проверять что invoice/subscription/shop принадлежит `req.user`

---

### 4. 🟠 HIGH — Webhook без проверки суммы

**Файл:** `backend/src/routes/webhooks.js:20`

**Проблема:**
CrystalPay webhook помечает invoice как оплаченный только по `state === 'payed'`, НЕ проверяя:
- Сумму оплаты vs ожидаемую сумму
- Валюту
- Метод оплаты

**Атака:** Spoofed/underpaid webhook с валидной подписью активирует подписку даже если оплачено меньше!

**Исправление:**
- После проверки подписи сравнить `payload.amount/currency/method` с invoice
- Отклонить или пометить как failed если не совпадает
- Сохранять реально оплаченную сумму
- Логировать аномалии

---

### 5. 🟡 MEDIUM — IDOR invoice status

**Файл:** `backend/src/routes/payments.js:126`

**Проблема:**
`/api/payments/invoices/:id/status` возвращает статус любого invoice без проверки ownership.

**Исправление:**
- Проверить что requester владеет subscription/shop
- Или является buyer для order invoices
- Иначе вернуть 403

---

### 6. 🟢 LOW — Hardcoded prices в боте

**Файл:** `bot/src/scenes/chooseTier.js:34`

**Проблема:**
Цены тарифов захардкожены (BASIC $25/month, PRO $35/month), могут не совпадать с backend.

**Исправление:**
- Брать цены из shared config или API

---

## АУДИТ ЗАВЕРШЁН ✅

Codex проверил основные категории. Найдено 6 проблем.

**Не найдено (хорошо!):**
- ✅ SQL Injection — параметризованные запросы
- ✅ XSS — нет dangerouslySetInnerHTML
- ✅ CSRF — не применимо (API + JWT)
- ✅ Bot handlers — answerCbQuery везде
- ✅ Webapp React — AbortController исправлен ранее

---

## ПРИОРИТЕТ ИСПРАВЛЕНИЯ

1. **СНАЧАЛА:** #1 и #2 (Auth) — полный захват аккаунтов
2. **ЗАТЕМ:** #4 (Webhook) — обход оплаты
3. **ПОТОМ:** #3 и #5 (IDOR) — утечка данных
4. **ПОСЛЕДНИМ:** #6 (Hardcoded) — UX проблема

---

Updated: 2024-11-28
