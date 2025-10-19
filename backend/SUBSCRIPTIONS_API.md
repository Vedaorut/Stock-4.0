# Subscriptions API

API для управления подписками пользователей на магазины.

## Обзор

Subscriptions API позволяет пользователям:
- Подписываться на магазины для получения уведомлений о новых товарах
- Просматривать список своих подписок
- Отписываться от магазинов
- Владельцам магазинов просматривать список подписчиков

## Endpoints

### 1. Подписаться на магазин
**POST** `/api/subscriptions`

**Требуется аутентификация:** Да

**Body:**
```json
{
  "shopId": 1
}
```

**Валидация:**
- Магазин должен существовать
- Магазин должен быть активным
- Нельзя подписаться на собственный магазин
- Нельзя подписаться повторно

**Response (201):**
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

---

### 2. Получить мои подписки
**GET** `/api/subscriptions?page=1&limit=20`

**Требуется аутентификация:** Да

**Query Parameters:**
- `page` (optional) - номер страницы (default: 1)
- `limit` (optional) - количество записей (default: 50, max: 100)

**Response (200):**
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

**Особенности:**
- Возвращает только активные магазины
- Данные отсортированы по дате создания (новые первые)

---

### 3. Получить подписчиков магазина
**GET** `/api/subscriptions/shop/:shopId?page=1&limit=20`

**Требуется аутентификация:** Да

**Доступ:** Только владелец магазина

**Query Parameters:**
- `page` (optional) - номер страницы (default: 1)
- `limit` (optional) - количество записей (default: 50, max: 100)

**Response (200):**
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

**Ошибки:**
- `404` - Магазин не найден
- `403` - Доступ запрещен (не владелец магазина)

---

### 4. Проверить статус подписки
**GET** `/api/subscriptions/check/:shopId`

**Требуется аутентификация:** Да

**Response (200):**
```json
{
  "success": true,
  "data": {
    "subscribed": true
  }
}
```

**Использование:**
- Проверка, подписан ли пользователь на конкретный магазин
- Для отображения кнопки "Подписаться"/"Отписаться" в UI

---

### 5. Отписаться от магазина
**DELETE** `/api/subscriptions/:shopId`

**Требуется аутентификация:** Да

**Response (200):**
```json
{
  "success": true,
  "message": "Successfully unsubscribed from shop"
}
```

**Ошибки:**
- `404` - Подписка не найдена

---

## Database Schema

```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, shop_id)
);
```

**Ограничения:**
- `UNIQUE(user_id, shop_id)` - один пользователь не может подписаться дважды
- `ON DELETE CASCADE` - при удалении пользователя или магазина подписки удаляются автоматически

---

## Примеры использования

### Подписаться на магазин
```bash
curl -X POST http://localhost:3000/api/subscriptions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"shopId": 1}'
```

### Получить список подписок
```bash
curl -X GET "http://localhost:3000/api/subscriptions?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Проверить подписку
```bash
curl -X GET http://localhost:3000/api/subscriptions/check/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Отписаться
```bash
curl -X DELETE http://localhost:3000/api/subscriptions/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Возможные ошибки

### 400 Bad Request
- Попытка подписаться на собственный магазин
- Попытка подписаться на неактивный магазин
- Повторная подписка

### 401 Unauthorized
- Отсутствует или недействителен JWT токен

### 403 Forbidden
- Попытка просмотра подписчиков чужого магазина

### 404 Not Found
- Магазин не найден
- Подписка не найдена

### 500 Internal Server Error
- Ошибка базы данных

---

## Интеграция с WebSocket

При создании/удалении подписки можно отправлять WebSocket события:

```javascript
// В будущем можно добавить
global.broadcastUpdate({
  type: 'subscription_update',
  data: {
    shopId: shopId,
    action: 'subscribed', // или 'unsubscribed'
    subscribersCount: count
  }
});
```

---

## Будущие улучшения

1. **Уведомления**
   - Интеграция с Telegram Bot для уведомлений подписчиков
   - Уведомления о новых товарах в подписанных магазинах

2. **Аналитика**
   - Количество подписчиков по дням/неделям
   - Самые популярные магазины

3. **Категории подписок**
   - Подписка на определенные категории товаров в магазине

4. **Настройки уведомлений**
   - Возможность отключить уведомления для определенных магазинов
