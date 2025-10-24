# Follow Shop - Dropshipping/Reseller Feature (MVP)

**Дата:** 2025-01-23  
**Статус:** ✅ Backend MVP Complete  
**Время разработки:** ~4 часа

---

## 📦 Обзор фичи

**Follow Shop** — это функция дропшиппинга/реселлинга, которая позволяет одному магазину (follower) отслеживать товары другого магазина (source) и автоматически копировать их с наценкой.

### Два режима работы:

1. **Monitor Mode (👀)** — просто отслеживание товаров без копирования
   - Показывает товары source магазина
   - Уведомления о новых товарах и изменениях
   - Не создаёт копии в своём магазине

2. **Resell Mode (💰)** — автоматическое копирование и синхронизация
   - Копирует все товары source магазина
   - Автоматически применяет наценку (markup %)
   - Синхронизирует цены и остатки каждые 5 минут
   - Обнаруживает конфликты при ручном редактировании
   - Soft delete при удалении source товара

---

## 🏗️ Архитектура

### Database Layer
```
shop_follows (подписки магазинов)
    ├── follower_shop_id → shops(id)
    ├── source_shop_id → shops(id)
    ├── mode ('monitor' | 'resell')
    ├── markup_percentage (1-500%)
    └── status ('active' | 'paused' | 'cancelled')

synced_products (связь скопированных товаров)
    ├── follow_id → shop_follows(id)
    ├── synced_product_id → products(id)  # копия в follower магазине
    ├── source_product_id → products(id)  # оригинал в source магазине
    ├── last_synced_at
    └── conflict_status ('synced' | 'conflict' | 'manual_override')
```

### Service Layer
```
productSyncService.js
    ├── copyProductWithMarkup()         # Копирование с наценкой
    ├── updateSyncedProduct()           # Обновление синхронизированного товара
    ├── handleSourceProductDelete()     # Обработка удаления source товара
    ├── syncAllProductsForFollow()      # Синхронизация всех товаров
    ├── updateMarkupForFollow()         # Пересчёт цен при изменении markup
    └── runPeriodicSync()               # Cron job (каждые 5 минут)
```

### REST API
```
/api/follows
    ├── GET    /my                   # Список подписок
    ├── GET    /check-limit          # Проверка FREE лимита
    ├── POST   /                     # Создать подписку
    ├── PUT    /:id/markup           # Изменить наценку
    ├── PUT    /:id/mode             # Переключить режим (monitor ↔ resell)
    └── DELETE /:id                  # Удалить подписку
```

### Cron Job
```
productSyncCron.js
    ├── startSyncCron()   # Запуск каждые 5 минут
    └── stopSyncCron()    # Остановка при shutdown
```

---

## 🗄️ Database Schema

### Table: `shop_follows`
```sql
CREATE TABLE shop_follows (
  id SERIAL PRIMARY KEY,
  follower_shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  source_shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('monitor', 'resell')),
  markup_percentage DECIMAL(5, 2) DEFAULT 0 
    CHECK (markup_percentage >= 1 AND markup_percentage <= 500),
  status VARCHAR(20) DEFAULT 'active' 
    CHECK (status IN ('active', 'paused', 'cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_shop_id, source_shop_id),  -- Нельзя подписаться дважды
  CHECK (follower_shop_id != source_shop_id)  -- Нельзя подписаться на себя
);

-- Indexes (5 total)
CREATE INDEX idx_shop_follows_follower ON shop_follows(follower_shop_id);
CREATE INDEX idx_shop_follows_source ON shop_follows(source_shop_id);
CREATE INDEX idx_shop_follows_mode ON shop_follows(mode);
CREATE INDEX idx_shop_follows_status ON shop_follows(status);
CREATE INDEX idx_shop_follows_relationship ON shop_follows(follower_shop_id, source_shop_id);
```

### Table: `synced_products`
```sql
CREATE TABLE synced_products (
  id SERIAL PRIMARY KEY,
  follow_id INT NOT NULL REFERENCES shop_follows(id) ON DELETE CASCADE,
  synced_product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  conflict_status VARCHAR(20) DEFAULT 'synced' 
    CHECK (conflict_status IN ('synced', 'conflict', 'manual_override')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(synced_product_id),               -- Один товар = одна связь
  UNIQUE(follow_id, source_product_id),    -- Нельзя скопировать дважды
  CHECK (synced_product_id != source_product_id)  -- Нельзя связать с самим собой
);

-- Indexes (4 total)
CREATE INDEX idx_synced_products_follow ON synced_products(follow_id);
CREATE INDEX idx_synced_products_synced ON synced_products(synced_product_id);
CREATE INDEX idx_synced_products_source ON synced_products(source_product_id);
CREATE INDEX idx_synced_products_conflict ON synced_products(conflict_status);
```

---

## 🔌 API Endpoints

### 1. Получить список подписок
```http
GET /api/follows/my?shopId=123
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "follows": [
    {
      "id": 1,
      "follower_shop_id": 123,
      "source_shop_id": 456,
      "source_shop_name": "Nike Store",
      "source_shop_description": "Official Nike products",
      "mode": "resell",
      "markup_percentage": 20.00,
      "status": "active",
      "synced_products_count": 15,
      "created_at": "2025-01-20T10:00:00Z"
    }
  ]
}
```

### 2. Проверить FREE лимит
```http
GET /api/follows/check-limit?shopId=123
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "canFollow": true,
  "activeCount": 1,
  "limit": 2,
  "remaining": 1
}
```

### 3. Создать подписку
```http
POST /api/follows
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "followerShopId": 123,
  "sourceShopId": 456,
  "mode": "resell",
  "markupPercentage": 20
}
```

**Validations:**
- ❌ 400: Cannot follow your own shop
- ❌ 409: Already following this shop
- ❌ 402: FREE tier limit reached (2 shops max)
- ❌ 400: Circular follow detected (A→B→C→A)
- ✅ 201: Follow created + all products synced (if resell mode)

### 4. Изменить наценку
```http
PUT /api/follows/:id/markup
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "markupPercentage": 25
}
```

**Effect:** Пересчитывает цены всех синхронизированных товаров

### 5. Переключить режим
```http
PUT /api/follows/:id/mode
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "mode": "monitor"  // 'monitor' или 'resell'
}
```

**Effect:** 
- **monitor → resell**: Копирует все товары
- **resell → monitor**: Деактивирует скопированные товары (is_active = false)

### 6. Удалить подписку
```http
DELETE /api/follows/:id
Authorization: Bearer <jwt_token>
```

**Effect:** Деактивирует все скопированные товары (soft delete)

---

## 💻 Code Examples

### Создание подписки с наценкой 30%
```javascript
// Frontend (WebApp)
const response = await fetch('/api/follows', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    followerShopId: 123,
    sourceShopId: 456,
    mode: 'resell',
    markupPercentage: 30
  })
});

const { follow } = await response.json();
// follow.id = 1
// follow.synced_products_count = 10 (если было 10 товаров в source магазине)
```

### Проверка конфликтов
```javascript
// Backend service
import { syncedProductQueries } from './models/syncedProductQueries.js';

// Проверить есть ли ручные изменения
const hasEdits = await syncedProductQueries.hasManualEdits(syncedProductId);

if (hasEdits) {
  await syncedProductQueries.updateConflictStatus(id, 'conflict');
  // Sync service пропустит этот товар
}
```

### Circular follow detection (Recursive CTE)
```javascript
import { shopFollowQueries } from './models/shopFollowQueries.js';

// Проверить создаст ли подписка цикл (A→B→C→A)
const wouldCreateCycle = await shopFollowQueries.checkCircularFollow(
  followerShopId, // A
  sourceShopId     // B (если B уже подписан на C, а C на A → цикл!)
);

if (wouldCreateCycle) {
  return res.status(400).json({ error: 'Circular follow detected' });
}
```

---

## 🚀 Migration Commands

### Добавить таблицы Follow Shop
```bash
cd backend

# С правильными параметрами из DATABASE_URL
DB_HOST=localhost \
DB_PORT=5433 \
DB_NAME=telegram_shop \
DB_USER=admin \
DB_PASSWORD=password \
node database/migrations.cjs --add-follow-shop --no-schema --no-indexes
```

**Output:**
```
✅ Table shop_follows created successfully
✅ Table synced_products created successfully
✅ Indexes on shop_follows created successfully
✅ Indexes on synced_products created successfully
✅ All expected tables present (10 total)
```

### Откатить миграцию (DESTRUCTIVE!)
```bash
DB_HOST=localhost \
DB_PORT=5433 \
DB_NAME=telegram_shop \
DB_USER=admin \
DB_PASSWORD=password \
node database/migrations.cjs --rollback-follow-shop --no-schema --no-indexes
```

**Warning:** Удалит все таблицы shop_follows и synced_products с данными!

### Проверить таблицы
```bash
PGPASSWORD=password psql -h localhost -p 5433 -d telegram_shop -U admin -c "\d shop_follows"
PGPASSWORD=password psql -h localhost -p 5433 -d telegram_shop -U admin -c "\d synced_products"
```

---

## 📖 Usage Examples

### Сценарий 1: Создание resell подписки
```
1. Seller A (shopId=123) хочет реселлить товары Seller B (shopId=456)
2. POST /api/follows { followerShopId: 123, sourceShopId: 456, mode: 'resell', markupPercentage: 25 }
3. Backend:
   a. Проверяет FREE limit (2 магазина)
   b. Проверяет circular follow
   c. Создаёт shop_follows запись (mode='resell', markup=25%)
   d. Вызывает syncAllProductsForFollow(followId)
   e. Копирует все товары из shopId=456 в shopId=123 с наценкой +25%
   f. Создаёт synced_products записи для каждого товара
4. Результат:
   - Seller A теперь имеет копии всех товаров Seller B
   - Цены автоматически пересчитаны: price_new = price_original * 1.25
   - Sync cron будет обновлять цены/остатки каждые 5 минут
```

### Сценарий 2: Изменение наценки
```
1. Seller A хочет изменить наценку с 25% на 30%
2. PUT /api/follows/1/markup { markupPercentage: 30 }
3. Backend:
   a. Находит все синхронизированные товары (synced_products where follow_id=1)
   b. Для каждого товара:
      - Получает source_price
      - Пересчитывает: new_price = source_price * 1.30
      - Обновляет synced товар
   c. Обновляет markup_percentage в shop_follows
4. Результат:
   - Все цены пересчитаны мгновенно
   - Sync cron будет использовать новую наценку
```

### Сценарий 3: Обнаружение конфликта
```
1. Sync cron находит stale товар (last_synced_at > 5 минут назад)
2. Проверяет hasManualEdits():
   - source_price = $100, markup = 20%
   - expected_price = $100 * 1.20 = $120
   - actual_synced_price = $125 (seller вручную изменил!)
   - Разница > $0.01 → conflict detected
3. Обновляет conflict_status = 'conflict'
4. Sync service пропускает этот товар в будущих синхронизациях
5. Seller видит уведомление о конфликте (в future bot implementation)
```

### Сценарий 4: Удаление source товара
```
1. Source seller удаляет товар (DELETE /api/products/789)
2. Sync cron обнаруживает что source товар больше не существует
3. Вызывает handleSourceProductDelete(syncId)
4. Backend:
   a. Находит все synced товары (synced_products where source_product_id=789)
   b. Для каждого: UPDATE products SET is_active = false WHERE id = synced_product_id
   c. НЕ удаляет товар (soft delete для сохранения истории заказов)
5. Результат:
   - Synced товар скрыт в каталоге
   - История заказов сохранена
```

---

## ⚙️ Sync Mechanism

### Periodic Sync (Cron Job)
```javascript
// Запускается автоматически при старте backend
// Интервал: 5 минут

async function runPeriodicSync() {
  // 1. Найти stale товары (не синхронизировались >5 минут)
  const stale = await syncedProductQueries.findStaleProducts(5);
  
  // 2. Для каждого товара проверить изменения
  for (const sync of stale) {
    const sourcePrice = sync.source_price;
    const syncedPrice = sync.synced_price;
    const expectedPrice = calculatePriceWithMarkup(sourcePrice, sync.markup_percentage);
    
    const priceChanged = Math.abs(syncedPrice - expectedPrice) > 0.01;
    const stockChanged = sync.source_stock !== sync.synced_stock;
    const activeChanged = sync.source_active !== sync.synced_active;
    
    if (priceChanged || stockChanged || activeChanged) {
      // 3. Обновить только если есть изменения
      await updateSyncedProduct(sync.id);
    } else {
      // 4. Просто обновить timestamp
      await syncedProductQueries.updateLastSynced(sync.id);
    }
  }
}
```

### Conflict Detection
```javascript
async function hasManualEdits(syncedProductId) {
  const sync = await syncedProductQueries.findById(syncId);
  const sourceProduct = await productQueries.findById(sync.source_product_id);
  const syncedProduct = await productQueries.findById(sync.synced_product_id);
  const follow = await shopFollowQueries.findById(sync.follow_id);
  
  // Рассчитать ожидаемую цену
  const expectedPrice = calculatePriceWithMarkup(
    sourceProduct.price, 
    follow.markup_percentage
  );
  
  // Сравнить с реальной
  const priceDiff = Math.abs(syncedProduct.price - expectedPrice);
  return priceDiff > 0.01; // Более $0.01 = manual edit
}
```

---

## 🔒 Security & Validation

### FREE Tier Limit (2 shops)
```javascript
const activeCount = await shopFollowQueries.countActiveByFollowerShopId(shopId);

if (activeCount >= 2) {
  return res.status(402).json({ 
    error: 'FREE tier limit reached',
    message: 'Upgrade to PRO ($35/month) for unlimited follows',
    limit: 2 
  });
}
```

### Circular Follow Prevention
```sql
-- Recursive CTE ищет цикл до 10 уровней
WITH RECURSIVE follow_chain AS (
  SELECT source_shop_id as shop_id, follower_shop_id, 1 as depth
  FROM shop_follows
  WHERE follower_shop_id = $2 AND status = 'active'
  
  UNION ALL
  
  SELECT sf.source_shop_id, sf.follower_shop_id, fc.depth + 1
  FROM shop_follows sf
  JOIN follow_chain fc ON sf.follower_shop_id = fc.shop_id
  WHERE sf.status = 'active' AND fc.depth < 10
)
SELECT EXISTS(SELECT 1 FROM follow_chain WHERE shop_id = $1) as has_cycle
```

### Database Constraints
```sql
-- Self-follow prevention
CHECK (follower_shop_id != source_shop_id)

-- Self-sync prevention
CHECK (synced_product_id != source_product_id)

-- UNIQUE constraint на relationship
UNIQUE(follower_shop_id, source_shop_id)

-- UNIQUE constraint на synced product
UNIQUE(synced_product_id)

-- Markup range validation
CHECK (markup_percentage >= 1 AND markup_percentage <= 500)
```

---

## 📊 Performance Optimization

### Indexes Strategy
**shop_follows (5 indexes):**
- Primary: `id` (SERIAL PRIMARY KEY)
- Foreign Keys: `follower_shop_id`, `source_shop_id`
- Filters: `mode`, `status`
- Composite: `(follower_shop_id, source_shop_id)` для быстрой проверки дубликатов

**synced_products (4 indexes):**
- Primary: `id` (SERIAL PRIMARY KEY)
- Foreign Keys: `follow_id`, `synced_product_id`, `source_product_id`
- Filter: `conflict_status`

### Query Optimization
```javascript
// findStaleProducts() ограничен 100 товарами за раз
SELECT sp.*, ...
FROM synced_products sp
WHERE sf.mode = 'resell' 
  AND sf.status = 'active'
  AND sp.conflict_status = 'synced'
  AND sp.last_synced_at < NOW() - INTERVAL '5 minutes'
ORDER BY sp.last_synced_at ASC 
LIMIT 100;  -- ✅ Не перегружаем БД
```

### Cron Interval
- **5 минут** - баланс между актуальностью и нагрузкой на БД
- Альтернативы:
  - 1 минута - слишком частые запросы
  - 15 минут - устаревшие цены
  - Real-time websocket - сложно, не нужно для MVP

---

## 📁 Files Created/Modified

### Created Files (7)
```
backend/src/models/shopFollowQueries.js        # 250 lines - SQL queries для shop_follows
backend/src/models/syncedProductQueries.js     # 280 lines - SQL queries для synced_products
backend/src/services/productSyncService.js     # 320 lines - Бизнес-логика синхронизации
backend/src/controllers/shopFollowController.js # 160 lines - HTTP handlers
backend/src/routes/follows.js                  # 28 lines - REST endpoints
backend/src/jobs/productSyncCron.js            # 30 lines - Cron job
backend/src/jobs/                              # Directory для cron jobs
```

### Modified Files (2)
```
backend/database/migrations.cjs                # +130 lines
  - addFollowShopFeature()
  - rollbackFollowShopFeature()

backend/src/server.js                          # +8 lines
  - import followRoutes
  - import startSyncCron, stopSyncCron
  - app.use('/api/follows', followRoutes)
  - startSyncCron() после старта сервера
  - stopSyncCron() в shutdown handler
```

---

## ⚠️ Known Limitations (MVP)

### 1. Name Collision Handling
**Проблема:** Если source магазин имеет 2 товара "iPhone", follower получит:
- iPhone
- iPhone (копия 1)

**Улучшение:** Более умная система именования (добавлять артикул, категорию)

### 2. Single Source Restriction
**Проблема:** Нельзя подписаться на один магазин дважды (UNIQUE constraint)

**Use Case:** Seller хочет создать 2 follow с разными наценками:
- Follow 1: markup 20% для премиум клиентов
- Follow 2: markup 50% для розницы

**Улучшение:** Разрешить multiple follows с разными настройками

### 3. No Bulk Operations
**Проблема:** При изменении markup нужно обновить 1000 товаров → долго

**Улучшение:** Batch update queries, background job для больших операций

### 4. Conflict Resolution Manual
**Проблема:** При конфликте товар просто помечается `conflict_status = 'conflict'`, seller должен вручную решить

**Улучшение:** UI для выбора:
- Overwrite with source (забыть ручные изменения)
- Keep manual edits (пометить как manual_override)
- Merge (попытаться объединить изменения)

### 5. No Category/Filter Sync
**Проблема:** Копируются ВСЕ товары, нельзя выбрать категорию

**Улучшение:** Фильтры при создании follow:
- Только товары категории "Электроника"
- Только товары дороже $100
- Только товары с stock > 0

### 6. No Historical Tracking
**Проблема:** Нет истории изменений цен/остатков

**Улучшение:** Таблица `product_history` для аудита

---

## 🔮 Future Enhancements (Phase 2)

### Backend Improvements
1. **Webhook Integration**
   - Source магазин отправляет webhook при изменении товара
   - Instant sync вместо polling каждые 5 минут

2. **Advanced Filters**
   ```javascript
   POST /api/follows
   {
     "sourceShopId": 456,
     "mode": "resell",
     "markupPercentage": 20,
     "filters": {
       "categories": ["Electronics", "Phones"],
       "minPrice": 100,
       "maxPrice": 1000,
       "inStock": true
     }
   }
   ```

3. **Bulk Operations API**
   ```javascript
   POST /api/follows/:id/bulk-update-prices
   {
     "markupPercentage": 25
   }
   // Background job → returns job_id
   
   GET /api/follows/:id/bulk-jobs/:jobId
   // Check status: "pending" | "running" | "completed"
   ```

4. **Analytics Dashboard**
   ```javascript
   GET /api/follows/:id/analytics
   {
     "total_synced": 150,
     "conflicts": 5,
     "revenue": 12500.00,
     "top_products": [...]
   }
   ```

### Bot Implementation (Phase 3)
```
/follow_shops                    # Список подписок
/follow_shop <shop_id>           # Подписаться на магазин
/unfollow <shop_id>              # Отписаться
/set_markup <follow_id> <num>    # Изменить наценку
/switch_mode <follow_id>         # Monitor ↔ Resell
/resolve_conflicts               # Показать конфликты
```

### WebApp UI (Phase 4)
```jsx
<FollowsPage>
  <FollowList follows={follows} />
  <CreateFollowButton onPress={showModal} />
  <FollowModal>
    <ShopSearch />
    <ModeSelector mode={mode} />
    <MarkupSlider markup={markup} />
    <FreeTierWarning activeCount={1} limit={2} />
  </FollowModal>
</FollowsPage>
```

---

## 🧪 Testing Strategy

### Unit Tests (Priority)
```javascript
// backend/__tests__/services/productSyncService.test.js
describe('productSyncService', () => {
  test('calculatePriceWithMarkup', () => {
    expect(calculatePriceWithMarkup(100, 20)).toBe(120.00);
    expect(calculatePriceWithMarkup(99.99, 15)).toBe(114.99);
  });
  
  test('copyProductWithMarkup prevents duplicates', async () => {
    await copyProductWithMarkup(sourceId, followId);
    await expect(copyProductWithMarkup(sourceId, followId))
      .resolves.toMatchObject({ source_product_id: sourceId });
  });
  
  test('hasManualEdits detects price changes', async () => {
    // source = $100, markup = 20% → expected = $120
    // Seller изменил на $125
    const hasEdits = await hasManualEdits(syncId);
    expect(hasEdits).toBe(true);
  });
});
```

### Integration Tests
```javascript
// backend/__tests__/follows.test.js
describe('POST /api/follows', () => {
  test('creates follow and syncs products in resell mode', async () => {
    const res = await request(app)
      .post('/api/follows')
      .set('Authorization', `Bearer ${token}`)
      .send({
        followerShopId: 1,
        sourceShopId: 2,
        mode: 'resell',
        markupPercentage: 25
      });
    
    expect(res.status).toBe(201);
    expect(res.body.follow.synced_products_count).toBeGreaterThan(0);
  });
  
  test('rejects circular follow', async () => {
    // Shop 1 → Shop 2 → Shop 3 → Shop 1 (cycle!)
    await createFollow(1, 2);
    await createFollow(2, 3);
    
    const res = await request(app)
      .post('/api/follows')
      .send({ followerShopId: 3, sourceShopId: 1 });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('circular');
  });
  
  test('enforces FREE tier limit', async () => {
    await createFollow(1, 2);
    await createFollow(1, 3);
    
    const res = await request(app)
      .post('/api/follows')
      .send({ followerShopId: 1, sourceShopId: 4 });
    
    expect(res.status).toBe(402);
    expect(res.body.limit).toBe(2);
  });
});
```

### E2E Tests
```javascript
// Simulate full resell flow
test('E2E: resell flow with price sync', async () => {
  // 1. Source магазин добавляет товар
  const product = await createProduct(sourceShopId, { name: 'iPhone', price: 500 });
  
  // 2. Follower подписывается с markup 20%
  const follow = await createFollow(followerShopId, sourceShopId, 'resell', 20);
  
  // 3. Проверить что товар скопирован
  const syncedProducts = await getProductsByShopId(followerShopId);
  expect(syncedProducts).toContainEqual(expect.objectContaining({
    name: 'iPhone',
    price: 600  // 500 * 1.20
  }));
  
  // 4. Source изменяет цену на $550
  await updateProduct(product.id, { price: 550 });
  
  // 5. Запустить sync
  await runPeriodicSync();
  
  // 6. Проверить что synced товар обновился
  const updated = await getProductsByShopId(followerShopId);
  expect(updated[0].price).toBe(660);  // 550 * 1.20
});
```

---

## 📈 Success Metrics

### Backend MVP (✅ Complete)
- [x] Database schema создана (2 таблицы, 9 индексов)
- [x] REST API endpoints (6 endpoints)
- [x] Business logic (7 service functions)
- [x] Cron job работает (5 минут interval)
- [x] Circular follow detection
- [x] FREE tier limit (2 shops)
- [x] Conflict detection
- [x] Soft delete на удаление source товара
- [x] Migration CLI (`--add-follow-shop`)
- [x] Comprehensive documentation

### Bot Implementation (⏳ Pending)
- [ ] /follow_shops command
- [ ] Inline keyboard для подписки
- [ ] Wizard scene для настройки markup
- [ ] Conflict resolution UI
- [ ] Notifications при конфликтах

### WebApp UI (⏳ Pending)
- [ ] Follows page
- [ ] Create follow modal
- [ ] Shop search
- [ ] Markup slider
- [ ] FREE tier upgrade CTA

---

## 🚦 Deployment Checklist

### Before Deployment
- [x] Migration tested (shop_follows + synced_products created)
- [x] Server.js integration (routes + cron registered)
- [ ] Environment variables documented
- [ ] Rollback plan готов
- [ ] Monitoring setup (логи cron job)

### Deployment Steps
```bash
# 1. Backup БД
PGPASSWORD=password pg_dump -h localhost -p 5433 -U admin telegram_shop > backup.sql

# 2. Pull latest code
git pull origin main

# 3. Install dependencies
cd backend && npm install

# 4. Run migration
DB_HOST=localhost \
DB_PORT=5433 \
DB_NAME=telegram_shop \
DB_USER=admin \
DB_PASSWORD=password \
node database/migrations.cjs --add-follow-shop --no-schema --no-indexes

# 5. Verify tables
PGPASSWORD=password psql -h localhost -p 5433 -d telegram_shop -U admin \
  -c "SELECT COUNT(*) FROM shop_follows; SELECT COUNT(*) FROM synced_products;"

# 6. Restart backend
npm run dev  # или pm2 restart backend
```

### Post-Deployment
- [ ] Проверить логи на ошибки
- [ ] Тест API endpoints через Postman
- [ ] Проверить cron job запустился (`Product sync cron started`)
- [ ] Мониторинг 24 часа

---

## 🆘 Troubleshooting

### Cron не запускается
**Симптом:** Логи не показывают "Product sync cron started"

**Fix:**
```javascript
// Проверить server.js:170
startSyncCron();  // Должен быть вызван после app.listen()
```

### Товары не синхронизируются
**Симптом:** last_synced_at не обновляется

**Debug:**
```bash
# Проверить stale товары
PGPASSWORD=password psql -h localhost -p 5433 -d telegram_shop -U admin -c "
SELECT sp.id, sp.last_synced_at, 
       EXTRACT(EPOCH FROM (NOW() - sp.last_synced_at))/60 as minutes_ago
FROM synced_products sp
WHERE sp.last_synced_at < NOW() - INTERVAL '5 minutes'
LIMIT 10;
"

# Проверить логи cron
tail -f backend/logs/combined.log | grep "periodic.*sync"
```

### Circular follow ложный positive
**Симптом:** Нет цикла, но API возвращает "circular follow"

**Fix:** Проверить recursive CTE глубину (limit 10 levels):
```javascript
// shopFollowQueries.js:120
WHERE sf.status = 'active' AND fc.depth < 10
//                                         ^^^ увеличить если нужно
```

### Conflict status застрял
**Симптом:** conflict_status = 'conflict', но цена совпадает

**Fix:**
```sql
-- Вручную сбросить conflict
UPDATE synced_products 
SET conflict_status = 'synced' 
WHERE id = <sync_id>;

-- Или запустить sync принудительно
UPDATE synced_products 
SET last_synced_at = NOW() - INTERVAL '10 minutes'
WHERE id = <sync_id>;
```

---

## 📚 Related Documentation

- **AI Implementation:** `AI_IMPLEMENTATION_GUIDE.md` (reference для стиля документации)
- **Week 1 Roadmap:** `WEEK1_ROADMAP_COMPLETE.md` (P0 фиксы)
- **Backend Tests:** `backend/BACKEND_TESTS_REPORT.md`
- **Database Schema:** `backend/database/schema.sql`
- **Migration Script:** `backend/database/migrations.cjs`

---

## 👨‍💻 Developer Notes

### Naming Conventions
- `follower_shop_id` - магазин который подписывается (buyer/reseller)
- `source_shop_id` - магазин на который подписываются (supplier)
- `synced_product_id` - копия в follower магазине
- `source_product_id` - оригинал в source магазине

### Code Style
```javascript
// ✅ GOOD - async/await
const follow = await shopFollowQueries.findById(id);

// ❌ BAD - callbacks
shopFollowQueries.findById(id, (err, follow) => { ... });

// ✅ GOOD - explicit status codes
return res.status(402).json({ error: 'FREE tier limit' });

// ❌ BAD - generic 400
return res.status(400).json({ error: 'Payment required' });
```

### Database Transaction Pattern
```javascript
// Для atomic operations используй client parameter
export const create = async (data, client = null) => {
  const db = client || { query: pool.query.bind(pool) };
  return await db.query('INSERT INTO ...', [data]);
};

// Usage:
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await shopFollowQueries.create(followData, client);
  await syncAllProducts(followId, client);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

---

## 🎯 Next Steps (Priority Order)

1. **Bot Implementation** (Phase 3) - 8 hours
   - Команды для управления follows
   - Wizard для настройки markup
   - Уведомления о конфликтах

2. **WebApp UI** (Phase 4) - 12 hours
   - Follows page
   - Shop search и browse
   - Markup configuration UI

3. **Testing** - 6 hours
   - Unit tests для productSyncService
   - Integration tests для API
   - E2E test для resell flow

4. **Advanced Features** - 16 hours
   - Webhook integration
   - Category filters
   - Bulk operations
   - Analytics dashboard

---

**MVP Backend Implementation Complete! 🚀**

Backend готов к использованию. Bot и WebApp UI будут реализованы в следующих фазах.

**Реализовано:** Claude Code  
**Дата завершения:** 2025-01-23
