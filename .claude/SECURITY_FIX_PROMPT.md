# Security Fix Task - Status Stock 4.0

## Контекст

Проведён security аудит проекта. Найдено 6 HIGH issues которые нужно исправить.
Ты - Claude Opus, оркестратор. НЕ пиши код сам - делегируй субагентам.

## Правила работы

1. **Делегируй код субагентам** через `Task` tool:
   - `backend-architect` - для backend fixes
   - `telegram-bot-expert` - для bot fixes  
   - `frontend-developer` - для webapp fixes
   - `database-designer` - для SQL fixes

2. **Используй MCP filesystem** для файловых операций:
   - `mcp__filesystem__read_text_file` - чтение
   - `mcp__filesystem__edit_file` - редактирование
   - `mcp__filesystem__write_file` - создание

3. **Запускай параллельно** - несколько `Task` в одном сообщении

4. **После фиксов - ревью** через `/pr-review-toolkit:review-pr`

5. **Коммить** только когда попросят

---

## HIGH Issues для исправления

### 1. IDOR в confirmPaymentWithTxHash
**Файл:** `backend/src/controllers/subscription/handlers/paymentHandlers.js:153-184`

**Проблема:** Нет проверки ownership при подтверждении платежа подписки.

**Решение:**
```javascript
// Добавить в начало confirmPaymentWithTxHash:
const ownershipCheck = await verifySubscriptionOwnership(subscriptionId, req.user.id);
if (!ownershipCheck.success) {
  return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
}
```

**Делегировать:** `backend-architect`

---

### 2. Missing rate limiter на invoice generation
**Файл:** `backend/src/routes/subscriptions.js:107`

**Проблема:** Endpoint `POST /:id/payment/generate` без rate limiting.

**Решение:**
```javascript
import { strictPaymentLimiter } from '../middleware/rateLimiter.js';

router.post('/:id/payment/generate', 
  verifyToken,
  strictPaymentLimiter,  // Добавить
  subscriptionController.generatePaymentInvoice
);
```

**Делегировать:** `backend-architect`

---

### 3. Order ownership check в bot
**Файл:** `bot/src/handlers/seller/orders.js:332-412`

**Проблема:** `handleMarkShipped` не проверяет что заказ принадлежит магазину пользователя.

**Решение:**
```javascript
// В handleMarkShipped добавить:
const order = await orderApi.getOrder(orderId, token);
if (order.shop_id !== ctx.session.shopId) {
  return ctx.answerCbQuery('❌ Заказ не найден');
}
```

**Делегировать:** `telegram-bot-expert`

---

### 4. Follow ownership verification
**Файл:** `bot/src/handlers/seller/follows.js:206-260`

**Проблема:** `handleFollowDetail` не проверяет ownership follow.

**Решение:** Backend уже должен проверять ownership через JWT. Проверить и если нет - добавить на backend.

**Делегировать:** `telegram-bot-expert` + `backend-architect`

---

### 5. Worker removal owner check
**Файл:** `bot/src/handlers/seller/index.js:798-825`

**Проблема:** Worker может удалять других workers.

**Решение:**
```javascript
// В handleWorkerRemove добавить:
if (!ctx.session.isShopOwner) {
  return ctx.answerCbQuery('❌ Только владелец может удалять работников');
}
```

**Делегировать:** `telegram-bot-expert`

---

### 6. Token storage в localStorage
**Файл:** `webapp/src/store/useStore.js:83`

**Проблема:** JWT token в localStorage уязвим к XSS.

**Решение:** Переключить на sessionStorage или исключить из persist:
```javascript
partialize: (state) => ({
  // token: state.token,  // Убрать из persist
  pendingOrders: state.pendingOrders,
  cart: state.cart,
})
```

**Делегировать:** `frontend-developer`

---

## MEDIUM Issues (после HIGH)

### 7. reserveStock overselling
**Файл:** `backend/src/database/queries/productQueries.js:178-203`

**Решение:**
```sql
UPDATE products 
SET reserved_quantity = reserved_quantity + $2
WHERE id = $1 
  AND stock_quantity >= reserved_quantity + $2
RETURNING ...
```

**Делегировать:** `database-designer`

---

### 8. Source maps в production
**Файл:** `webapp/vite.config.js:27`

**Решение:**
```javascript
build: {
  sourcemap: process.env.NODE_ENV === 'development',
}
```

**Делегировать:** `frontend-developer`

---

## Workflow

```
1. Прочитай файлы через mcp__filesystem__read_text_file
2. Запусти 3-4 параллельных Task для разных компонентов
3. После получения результатов - примени изменения через mcp__filesystem__edit_file
4. Запусти /pr-review-toolkit:review-pr для проверки
5. Если всё ок - спроси пользователя о коммите
```

## Пример параллельного запуска

```
<Task subagent_type="backend-architect">
Fix IDOR in paymentHandlers.js and add rate limiter to subscriptions.js
...detailed instructions...
</Task>

<Task subagent_type="telegram-bot-expert">  
Add ownership checks in orders.js, follows.js, index.js
...detailed instructions...
</Task>

<Task subagent_type="frontend-developer">
Fix token storage and source maps
...detailed instructions...
</Task>
```

## Валидация

После всех фиксов:
1. `npm run lint` в каждом пакете
2. `npm test` где есть тесты
3. `/pr-review-toolkit:review-pr` для code review

---

**Начинай с HIGH issues!**
