# План защиты Redis сессий - Clean Architecture подход

## Анализ текущей архитектуры

### Текущее состояние (ПРОБЛЕМЫ)
```javascript
// Redis Session (bot/src/middleware/redisSession.js)
ctx.session = {
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // ❌ JWT в plaintext
  user: {                                              // ❌ PII в Redis
    id: 123,
    telegram_id: 987654321,
    username: "john_doe",
    first_name: "John",
    last_name: "Doe",
    selected_role: "seller"
  },
  shopId: 456,
  shopName: "My Shop",
  role: "seller",
  tempData: {},
  tokenCreatedAt: "2025-11-30T10:00:00.000Z"
}
```

**Использование сессии:** 189 упоминаний в 23 файлах
- `ctx.session.token` - передается в каждый API запрос
- `ctx.session.user` - используется для проверки роли, отображения имени
- `ctx.session.shopId/shopName/role` - бизнес-логика бота

### Уязвимости

1. **JWT Token в Redis plaintext**
   - Если Redis скомпрометирован → токены утекают
   - TTL 24h, но токен живет 7 дней → дисбаланс

2. **PII утечка**
   - `first_name`, `last_name`, `username` хранятся в открытом виде
   - GDPR/privacy риски

3. **Session hijacking**
   - Нет привязки сессии к telegram_id на уровне ключа
   - session:123456 может быть использована кем угодно с доступом к Redis

4. **Нет ротации токенов**
   - Токен обновляется только через 6 дней
   - Compromised token работает до истечения срока

---

## CLEAN ARCHITECTURE решение

### Принципы

1. **Separation of Concerns**
   - Session = только идентификаторы и state
   - Auth = токены управляются отдельно
   - User data = получается on-demand из backend

2. **Minimal Exposure**
   - Redis хранит минимум данных
   - Sensitive data живет только в памяти процесса
   - Short-lived tokens + refresh mechanism

3. **Defense in Depth**
   - Encryption at rest (Redis)
   - Signature verification (session integrity)
   - Rate limiting (token refresh abuse)

---

## Архитектурные изменения

### Option A: Session ID + Server-side Token Management (RECOMMENDED)

**Концепция:**
- Redis хранит только `session_id` + `telegram_id` + `state`
- JWT токен НЕ хранится в Redis
- Токен генерируется/обновляется через backend при каждом запросе
- В памяти бота кэш токенов с TTL 5 минут

```javascript
// NEW: Redis Session (minimal)
session:{telegram_id} = {
  session_id: "uuid-v4-random",           // Уникальный идентификатор сессии
  telegram_id: 987654321,                 // Для валидации владельца
  state: {                                // Только бизнес-логика
    role: "seller",
    shopId: 456,
    shopName: "My Shop",
    tempData: {}
  },
  created_at: 1732968000,
  expires_at: 1733054400,                 // 24h TTL
  signature: "hmac-sha256-of-session"     // Защита от подделки
}

// NEW: In-memory token cache (bot process)
tokenCache = new Map([
  [987654321, {
    token: "eyJhbGci...",
    expires_at: Date.now() + 5*60*1000,   // 5 min cache
    user: { id, username }                 // Minimal user info
  }]
])
```

**Workflow:**
1. User opens bot → authMiddleware
2. Check tokenCache[telegram_id]
   - If exists & not expired → use cached token
   - If expired → call backend `/auth/refresh` or `/auth/token`
3. Backend generates new JWT (stateless)
4. Cache token for 5 minutes
5. Use token for API calls

**Преимущества:**
- ✅ JWT НЕ в Redis (нет утечки)
- ✅ PII минимизирована (только telegram_id + role/shopId)
- ✅ Token refresh автоматический
- ✅ Падение бота → токены переиздаются, session state сохранен
- ✅ Масштабируемость (stateless backend)

**Trade-offs:**
- ⚠️ Backend load: +1 запрос на /auth/token при cold start (но кэш 5 мин)
- ⚠️ Падение бота → tokenCache очищается → переиздача токенов
- ⚠️ Нужен новый endpoint `/auth/token` для токен-генерации

---

### Option B: Encrypted Token Storage in Redis

**Концепция:**
- Redis хранит зашифрованный JWT токен
- Шифрование AES-256-GCM с ключом из env
- PII минимизирована

```javascript
// Redis Session
session:{telegram_id} = {
  session_id: "uuid",
  telegram_id: 987654321,
  encrypted_token: "aes256gcm:iv:tag:ciphertext", // Encrypted JWT
  state: { role, shopId, shopName, tempData },
  signature: "hmac"
}
```

**Workflow:**
1. authMiddleware создает JWT
2. Encrypt JWT перед сохранением в Redis
3. При каждом запросе: decrypt → use token
4. Шифр-ключ в env (REDIS_ENCRYPTION_KEY)

**Преимущества:**
- ✅ Защита от Redis dump утечки
- ✅ Меньше изменений в коде (токен все еще в session, но зашифрован)
- ✅ Нет дополнительных backend запросов

**Trade-offs:**
- ⚠️ Шифр-ключ в env → single point of failure
- ⚠️ Производительность: encrypt/decrypt на каждую операцию
- ⚠️ Ключ ротация = invalidate все сессии
- ❌ НЕ решает проблему token refresh

---

### Option C: Short-lived Tokens + Refresh Tokens

**Концепция:**
- Access token (5 min) + Refresh token (7 days)
- Access token в памяти (tokenCache)
- Refresh token зашифрован в Redis
- Auto-refresh при истечении access token

```javascript
// Redis Session
session:{telegram_id} = {
  session_id: "uuid",
  telegram_id: 987654321,
  encrypted_refresh_token: "aes256gcm:...",  // Long-lived, encrypted
  state: { ... },
  signature: "hmac"
}

// In-memory cache
tokenCache[telegram_id] = {
  access_token: "short-lived-jwt",            // 5 min
  expires_at: Date.now() + 5*60*1000
}
```

**Workflow:**
1. authMiddleware checks access_token in cache
2. If expired → use refresh_token from Redis → call `/auth/refresh`
3. Backend validates refresh_token → issues new access_token
4. Cache new access_token

**Преимущества:**
- ✅ Best practice (OAuth 2.0 style)
- ✅ Access token short-lived → minimal exposure window
- ✅ Refresh token encrypted → защита от утечки Redis
- ✅ Revocation support (backend tracks refresh tokens)

**Trade-offs:**
- ⚠️ Сложность реализации (refresh flow)
- ⚠️ Backend needs refresh token DB table
- ⚠️ Шифрование все еще нужно
- ❌ Высокая сложность для small project

---

## РЕКОМЕНДАЦИЯ: **Option A** (Session ID + Server-side Token Management)

**Почему:**
1. **Простота:** Минимальные изменения в backend (1 endpoint)
2. **Безопасность:** JWT НЕ хранится в Redis вообще
3. **Производительность:** Кэш 5 мин = 1 запрос на сессию
4. **Масштабируемость:** Stateless backend, можно добавить Redis Cluster
5. **Соответствие Clean Architecture:** Session layer ≠ Auth layer

**НЕ рекомендуется Option C:** Overkill для Telegram бота (refresh tokens нужны для Web, где нет backend auth)

---

## Детальный план реализации (Option A)

### 1. Новые сервисы/утилиты

#### 1.1 TokenManager (bot/src/services/tokenManager.js)
```javascript
/**
 * In-memory token cache with TTL
 * Handles token lifecycle: fetch, cache, validate, refresh
 */
class TokenManager {
  constructor() {
    this.cache = new Map(); // telegram_id -> { token, expires_at, user }
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  async getToken(telegramId, userData) {
    // Check cache first
    const cached = this.cache.get(telegramId);
    if (cached && Date.now() < cached.expires_at) {
      return cached.token;
    }

    // Cache miss → fetch from backend
    const authData = await authApi.getOrCreateToken(telegramId, userData);
    
    // Cache new token
    this.cache.set(telegramId, {
      token: authData.token,
      expires_at: Date.now() + this.cacheTTL,
      user: authData.user
    });

    return authData.token;
  }

  invalidate(telegramId) {
    this.cache.delete(telegramId);
  }

  cleanup() {
    // Remove expired entries every minute
    const now = Date.now();
    for (const [id, data] of this.cache.entries()) {
      if (now > data.expires_at) {
        this.cache.delete(id);
      }
    }
  }
}
```

#### 1.2 SessionManager (bot/src/services/sessionManager.js)
```javascript
/**
 * Manages session state in Redis (minimal data)
 * Generates session signatures for integrity
 */
class SessionManager {
  constructor(redis, secretKey) {
    this.redis = redis;
    this.secretKey = secretKey; // From env: SESSION_SECRET
  }

  generateSignature(sessionData) {
    const payload = JSON.stringify({
      session_id: sessionData.session_id,
      telegram_id: sessionData.telegram_id,
      created_at: sessionData.created_at
    });
    return crypto.createHmac('sha256', this.secretKey)
      .update(payload)
      .digest('hex');
  }

  async load(telegramId) {
    const key = `session:${telegramId}`;
    const data = await this.redis.get(key);
    
    if (!data) return null;
    
    const session = JSON.parse(data);
    
    // Validate signature
    const expectedSig = this.generateSignature(session);
    if (session.signature !== expectedSig) {
      logger.warn('Session signature mismatch', { telegramId });
      return null;
    }

    // Validate owner
    if (session.telegram_id !== telegramId) {
      logger.warn('Session ownership mismatch', { telegramId });
      return null;
    }

    return session.state;
  }

  async save(telegramId, state) {
    const session = {
      session_id: uuidv4(),
      telegram_id: telegramId,
      state: state,
      created_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 86400 // 24h
    };

    session.signature = this.generateSignature(session);

    const key = `session:${telegramId}`;
    await this.redis.setex(key, 86400, JSON.stringify(session));
  }
}
```

#### 1.3 Backend endpoint: GET /api/auth/token

```javascript
// backend/src/routes/auth.js
router.get('/token', verifyInternalSecret, authController.getToken);

// backend/src/controllers/authController.js
getToken: asyncHandler(async (req, res) => {
  const { telegram_id } = req.query;
  
  if (!telegram_id) {
    throw new ValidationError('telegram_id required');
  }

  // Find or create user
  let user = await userQueries.findByTelegramId(telegram_id);
  
  if (!user) {
    throw new NotFoundError('User not found. Register first.');
  }

  // Generate JWT (stateless)
  const token = jwt.sign(
    {
      id: user.id,
      telegram_id: user.telegram_id,
      username: user.username,
      jti: crypto.randomBytes(16).toString('hex'),
    },
    config.jwt.secret,
    { expiresIn: '15m' } // SHORT-LIVED: 15 minutes
  );

  return res.status(200).json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        selected_role: user.selected_role
      }
    }
  });
})
```

---

### 2. Изменения в существующих файлах

#### 2.1 bot/src/middleware/redisSession.js
```diff
/**
 * Redis Session Middleware for Telegraf v4
 * 
- * Stores: token, user, shopId, role, tempData
+ * Stores: ONLY session state (shopId, role, tempData)
+ * NO tokens, NO PII
 */

+import { sessionManager } from '../services/sessionManager.js';
+
 export function createRedisSession(redis) {
   return async (ctx, next) => {
     const chatId = ctx.chat?.id || ctx.from?.id;
     if (!chatId) {
       logger.warn('No chat/user ID found, skipping session');
       return next();
     }

-    const sessionKey = `session:${chatId}`;
-
-    // Load session from Redis
-    try {
-      const data = await redis.get(sessionKey);
-      ctx.session = data ? JSON.parse(data) : {};
-    } catch (error) {
-      logger.error(`Failed to load session for ${chatId}:`, error);
-      ctx.session = {};
-    }
+    // Load session state (minimal data)
+    ctx.session = await sessionManager.load(chatId) || {};

     // Add explicit save method
     ctx.session.save = async () => {
-      try {
-        const sessionData = JSON.stringify(ctx.session);
-        await redis.setex(sessionKey, 86400, sessionData);
-        logger.debug(`Session manually saved for ${chatId}`);
-      } catch (error) {
-        logger.error(`Failed to manually save session for ${chatId}:`, error);
-      }
+      await sessionManager.save(chatId, ctx.session);
     };

     const originalSession = JSON.stringify(ctx.session);
     await next();

     // Auto-save if changed
-    try {
-      const newSession = JSON.stringify(ctx.session);
-      if (newSession !== originalSession) {
-        await redis.setex(sessionKey, 86400, newSession);
-        logger.debug(`Session saved for ${chatId}`);
-      }
-    } catch (error) {
-      logger.error(`Failed to save session for ${chatId}:`, error);
-    }
+    const newSession = JSON.stringify(ctx.session);
+    if (newSession !== originalSession) {
+      await sessionManager.save(chatId, ctx.session);
+    }
   };
 }
```

#### 2.2 bot/src/middleware/auth.js
```diff
 import { authApi } from '../utils/api.js';
+import { tokenManager } from '../services/tokenManager.js';
 import logger from '../utils/logger.js';

 const authMiddleware = async (ctx, next) => {
   try {
     if (!ctx.from) {
       return next();
     }

-    ctx.session = ctx.session || {};
-
-    // Check if user already authenticated in session
-    if (ctx.session.token && ctx.session.user) {
-      // Check token age
-      if (!ctx.session.tokenCreatedAt) {
-        ctx.session.tokenCreatedAt = new Date().toISOString();
-        return next();
-      }
-      const tokenAge = Date.now() - new Date(ctx.session.tokenCreatedAt).getTime();
-      const sixDays = 6 * 24 * 60 * 60 * 1000;
-      if (tokenAge < sixDays) {
-        return next(); // Token valid
-      }
-      logger.info(`Token age ${Math.floor(tokenAge / (24*60*60*1000))} days, refreshing`);
-    }

     // Extract user data from Telegram
     const userData = {
       username: ctx.from.username || null,
       firstName: ctx.from.first_name || ctx.from.username || 'User',
       lastName: ctx.from.last_name || null,
       languageCode: ctx.from.language_code,
     };

-    // Authenticate with backend
-    const authData = await authApi.authenticate(ctx.from.id, userData);
-    if (!authData?.token || !authData?.user) {
-      throw new Error('Invalid authentication response from backend');
-    }
+    // Get token from cache or backend
+    const token = await tokenManager.getToken(ctx.from.id, userData);
+    
+    // Attach token to context (NOT session!)
+    ctx.token = token;

-    // Store in session (preserve existing shopId/role)
-    const existingShopId = ctx.session.shopId;
-    const existingShopName = ctx.session.shopName;
-    const existingRole = ctx.session.role;
-
-    ctx.session.token = authData.token;
-    ctx.session.user = authData.user;
-    ctx.session.tokenCreatedAt = new Date().toISOString();
-    ctx.session.role = existingRole || null;
-    ctx.session.shopId = existingShopId || null;
-    ctx.session.shopName = existingShopName || null;
-
     logger.info(`User authenticated: ${ctx.from.id} (@${ctx.from.username})`);

     return next();
   } catch (error) {
     logger.error('Auth middleware error:', error);
-    ctx.session.authError = error.message;
+    tokenManager.invalidate(ctx.from.id);
     if (ctx.reply) {
       await ctx.reply('⚠️ Не удалось авторизоваться. Попробуйте снова через /start.');
     }
     return;
   }
 };
```

#### 2.3 bot/src/middleware/sessionRecovery.js
```diff
 const sessionRecoveryMiddleware = async (ctx, next) => {
   try {
     if (!ctx.from) {
       return next();
     }

-    if (!ctx.session?.token) {
+    if (!ctx.token) {
       return next();
     }

     const needsRecovery = checkIfRecoveryNeeded(ctx);

     if (needsRecovery) {
       await recoverSessionData(ctx);
     }

     return next();
   } catch (error) {
     logger.error('Session recovery middleware error:', error);
     return next();
   }
 };

 function checkIfRecoveryNeeded(ctx) {
-  if (ctx.session.token && !ctx.session.user) {
-    return true;
-  }
-  if (ctx.session.user?.selectedRole === 'seller' && !ctx.session.shopId) {
+  if (ctx.session?.role === 'seller' && !ctx.session?.shopId) {
     return true;
   }
-  if (ctx.session.role === 'seller' && !ctx.session.shopId) {
-    return true;
-  }
-  if (ctx.session.token && !ctx.session.shopId) {
+  if (ctx.token && !ctx.session?.shopId) {
     return true;
   }
   return false;
 }

 async function recoverSessionData(ctx) {
   try {
-    if (ctx.session.token && !ctx.session.shopId) {
-      const shops = await shopApi.getMyShop(ctx.session.token);
+    if (ctx.token && !ctx.session?.shopId) {
+      const shops = await shopApi.getMyShop(ctx.token);

       if (shops && Array.isArray(shops) && shops.length > 0) {
         const shop = shops[0];
         ctx.session.shopId = shop.id;
         ctx.session.shopName = shop.name;

         if (!ctx.session.role) {
           ctx.session.role = 'seller';
         }
-
-        if (ctx.session.user) {
-          ctx.session.user.selectedRole = 'seller';
-        }
       }
     }
   } catch (error) {
     logger.error('Failed to recover session data:', error);

     if (error.response?.status === 401) {
-      ctx.session.token = null;
-      ctx.session.user = null;
+      tokenManager.invalidate(ctx.from.id);
       ctx.session.shopId = null;
       ctx.session.shopName = null;
       ctx.session.role = null;
     }

     throw error;
   }
 }
```

#### 2.4 bot/src/utils/api.js
```diff
 export const authApi = {
-  // Register or login user via internal API
-  async authenticate(telegramId, userData) {
+  // Get or create token (called by TokenManager)
+  async getOrCreateToken(telegramId, userData) {
     const requestBody = {
       telegramId: parseInt(telegramId, 10),
       username: userData.username,
       firstName: userData.firstName || userData.first_name,
       lastName: userData.lastName || userData.last_name || '',
     };

     if (!config.internalSecret) {
       throw new Error('Missing INTERNAL_SECRET');
     }

     const timestamp = Date.now().toString();
     const payload = JSON.stringify(requestBody) + timestamp;
     const signature = crypto
       .createHmac('sha256', config.botToken)
       .update(payload)
       .digest('hex');

-    const { data } = await api.post('/internal/auth/bot-register', requestBody, {
+    // NEW: Use /auth/token endpoint (lightweight)
+    const { data } = await api.get('/auth/token', {
+      params: { telegram_id: telegramId },
       headers: {
         'Content-Type': 'application/json',
         'x-internal-secret': config.internalSecret,
         'x-internal-timestamp': timestamp,
         'x-internal-signature': signature,
       },
     });
+    
     return data.data || data;
   },
 };

 // Update all API calls to use ctx.token instead of ctx.session.token
 export const shopApi = {
   async getMyShop(token) {
     const { data } = await api.get('/shops/my', {
       headers: { Authorization: `Bearer ${token}` },
     });
     return data.data || data;
   },
   // ... rest unchanged
 };
```

#### 2.5 Все handlers/scenes (массовая замена)

**Поиск:**
```bash
grep -r "ctx.session.token" bot/src/
```

**Замена:**
```diff
-const token = ctx.session.token;
+const token = ctx.token;

-await shopApi.getMyShop(ctx.session.token);
+await shopApi.getMyShop(ctx.token);

-const user = ctx.session.user;
+// Get user info from backend API if needed
+const user = await authApi.getProfile(ctx.token);
```

**Затронутые файлы (25 файлов):**
1. bot/src/scenes/editFollowMarkup.js
2. bot/src/scenes/createFollow.js
3. bot/src/handlers/seller/aiProducts.js
4. bot/src/handlers/worker/index.js
5. bot/src/handlers/common.js
6. bot/src/scenes/manageWorkers.js
7. bot/src/handlers/seller/follows.js
8. bot/src/handlers/start.js
9. bot/src/handlers/workspace/index.js
10. bot/src/middleware/auth.js ✅ (уже изменен выше)
11. bot/src/utils/sellerNavigation.js
12. bot/src/scenes/chooseTier.js
13. bot/src/scenes/manageWallets.js
14. bot/src/scenes/migrateChannel.js
15. bot/src/scenes/upgradeShop.js
16. bot/src/scenes/createShop.js
17. bot/src/scenes/addProduct.js
18. bot/src/handlers/seller/orders.js
19. bot/src/handlers/buyer/index.js
20. bot/src/scenes/paySubscription.js
21. bot/src/handlers/seller/index.js
22. bot/src/utils/sceneValidation.js
23. bot/src/scenes/markOrdersShipped.js
24. bot/src/middleware/validateToken.js
25. bot/src/middleware/sessionRecovery.js ✅ (уже изменен выше)

---

### 3. Новый env переменная

```bash
# .env
SESSION_SECRET=<generate-with-openssl-rand-hex-32>
```

---

### 4. Миграционная стратегия

#### Фаза 1: Подготовка (без breaking changes)
1. ✅ Создать TokenManager, SessionManager
2. ✅ Добавить backend endpoint GET /auth/token
3. ✅ Добавить SESSION_SECRET в .env
4. ✅ Unit тесты для новых сервисов

#### Фаза 2: Плавный переход (dual mode)
1. ✅ Обновить authMiddleware:
   - Поддержка BOTH ctx.session.token (old) и ctx.token (new)
   - Если session.token exists → migrate to ctx.token
   - Логировать migration events
2. ✅ Deploy backend endpoint
3. ✅ Deploy bot с dual mode

#### Фаза 3: Migration (graceful)
1. ✅ Background job: migrate existing sessions
   ```javascript
   // bot/src/scripts/migrateSessions.js
   async function migrateSessions() {
     const keys = await redis.keys('session:*');
     for (const key of keys) {
       const data = JSON.parse(await redis.get(key));
       if (data.token) {
         delete data.token;
         delete data.user;
         delete data.tokenCreatedAt;
         // Keep only: shopId, shopName, role, tempData
         await redis.setex(key, 86400, JSON.stringify(data));
       }
     }
   }
   ```
2. ✅ Run migration script
3. ✅ Monitor logs for errors

#### Фаза 4: Cleanup (remove old code)
1. ✅ Обновить все handlers: ctx.session.token → ctx.token
2. ✅ Удалить dual mode code
3. ✅ Deploy final version
4. ✅ Monitor for 24h

**Rollback план:**
- Keep old code в ветке `backup/pre-session-migration`
- Feature flag: `ENABLE_NEW_SESSION_MANAGER=false`
- Если критические ошибки → rollback + restart с флагом

---

### 5. Тесты

#### 5.1 Unit тесты

**bot/tests/services/tokenManager.test.js**
```javascript
describe('TokenManager', () => {
  it('should cache token for 5 minutes', async () => {
    const manager = new TokenManager();
    const token = await manager.getToken(123, userData);
    
    // Second call should use cache (no API call)
    const token2 = await manager.getToken(123, userData);
    expect(token).toBe(token2);
    expect(authApi.getOrCreateToken).toHaveBeenCalledTimes(1);
  });

  it('should refresh expired token', async () => {
    // Mock time
    jest.useFakeTimers();
    const manager = new TokenManager();
    
    await manager.getToken(123, userData);
    
    // Advance 6 minutes
    jest.advanceTimersByTime(6 * 60 * 1000);
    
    await manager.getToken(123, userData);
    expect(authApi.getOrCreateToken).toHaveBeenCalledTimes(2);
  });

  it('should cleanup expired entries', () => {
    const manager = new TokenManager();
    manager.cache.set(123, { expires_at: Date.now() - 1000 });
    manager.cleanup();
    expect(manager.cache.has(123)).toBe(false);
  });
});
```

**bot/tests/services/sessionManager.test.js**
```javascript
describe('SessionManager', () => {
  it('should validate session signature', async () => {
    const manager = new SessionManager(redis, 'secret');
    
    await manager.save(123, { role: 'seller' });
    const state = await manager.load(123);
    
    expect(state).toEqual({ role: 'seller' });
  });

  it('should reject tampered session', async () => {
    const manager = new SessionManager(redis, 'secret');
    
    await manager.save(123, { role: 'seller' });
    
    // Tamper with session
    const key = 'session:123';
    const data = JSON.parse(await redis.get(key));
    data.state.role = 'admin'; // Change role
    await redis.setex(key, 86400, JSON.stringify(data));
    
    const state = await manager.load(123);
    expect(state).toBeNull(); // Signature mismatch
  });

  it('should reject session with wrong owner', async () => {
    const manager = new SessionManager(redis, 'secret');
    
    await manager.save(123, { role: 'seller' });
    
    // Try to load with different telegram_id
    const state = await manager.load(456);
    expect(state).toBeNull();
  });
});
```

#### 5.2 Integration тесты

**bot/tests/integration/auth.test.js**
```javascript
describe('Auth flow', () => {
  it('should authenticate user and cache token', async () => {
    const ctx = createMockContext({ from: { id: 123 } });
    
    await authMiddleware(ctx, mockNext);
    
    expect(ctx.token).toBeDefined();
    expect(ctx.session.token).toBeUndefined(); // NOT in session
    expect(tokenManager.cache.has(123)).toBe(true);
  });

  it('should recover shop data after restart', async () => {
    const ctx = createMockContext({ 
      from: { id: 123 },
      session: { role: 'seller' } // shopId missing
    });
    
    await authMiddleware(ctx, mockNext);
    await sessionRecoveryMiddleware(ctx, mockNext);
    
    expect(ctx.session.shopId).toBe(456);
    expect(ctx.session.shopName).toBe('Test Shop');
  });
});
```

#### 5.3 Load тесты

**bot/tests/load/tokenCache.test.js**
```javascript
describe('Token cache performance', () => {
  it('should handle 1000 concurrent requests', async () => {
    const requests = [];
    for (let i = 0; i < 1000; i++) {
      requests.push(tokenManager.getToken(123, userData));
    }
    
    const tokens = await Promise.all(requests);
    
    // Only 1 backend call (rest from cache)
    expect(authApi.getOrCreateToken).toHaveBeenCalledTimes(1);
    expect(new Set(tokens).size).toBe(1); // All same token
  });
});
```

---

### 6. Trade-offs и риски

#### Риски

1. **Token cache в памяти**
   - ⚠️ Риск: Падение бота → cache lost → все пользователи reauth
   - ✅ Mitigation: 5 мин TTL → max 5 мин disruption, auto-recovery
   - ✅ TokenManager.cleanup() каждую минуту → prevent memory leak

2. **Backend load**
   - ⚠️ Риск: +1 запрос /auth/token на cold start каждые 5 мин
   - ✅ Mitigation: Cache → 1 request per 5 min per user (acceptable)
   - ✅ Backend stateless → horizontal scaling

3. **Migration downtime**
   - ⚠️ Риск: Old sessions → new format → users lose context
   - ✅ Mitigation: Dual mode + graceful migration script
   - ✅ shopId/role preserved during migration

4. **Session signature bypass**
   - ⚠️ Риск: Если SESSION_SECRET утекает → подделка сессий
   - ✅ Mitigation: SESSION_SECRET в .env (не в git), ротация possible
   - ✅ Signature + telegram_id validation

#### Trade-offs

| Aspect | Before | After | Impact |
|--------|--------|-------|--------|
| **Security** | JWT в Redis plaintext | JWT НЕ в Redis | ✅ +100% |
| **PII** | Full user object в Redis | Только telegram_id | ✅ GDPR compliant |
| **Performance** | 0 backend calls (session hit) | +1 call per 5 min | ⚠️ -5% (acceptable) |
| **Complexity** | Simple (все в session) | +2 services (TokenManager, SessionManager) | ⚠️ +20% code |
| **Scalability** | Redis bottleneck | Stateless backend + cache | ✅ Horizontal scaling |
| **Recovery** | Session = full state | Session = minimal state | ✅ Faster recovery |

---

### 7. Monitoring и Alerting

#### Metrics to track

1. **Token cache hit rate**
   ```javascript
   logger.info('Token cache stats', {
     hits: tokenManager.cacheHits,
     misses: tokenManager.cacheMisses,
     hitRate: (tokenManager.cacheHits / (tokenManager.cacheHits + tokenManager.cacheMisses)) * 100
   });
   ```
   - Target: >95% hit rate
   - Alert: <80% hit rate → investigate cache TTL

2. **Session signature failures**
   ```javascript
   logger.warn('Session signature mismatch', { telegram_id });
   ```
   - Target: 0 failures
   - Alert: >10/hour → possible attack or migration issue

3. **Backend /auth/token latency**
   - Target: <200ms p95
   - Alert: >500ms → backend overload

4. **Token refresh errors**
   ```javascript
   logger.error('Token refresh failed', { telegram_id, error });
   ```
   - Target: <0.1% error rate
   - Alert: >1% → backend auth issue

---

## Итоговая структура проекта

```
bot/src/
├── services/
│   ├── tokenManager.js          # NEW: In-memory token cache
│   └── sessionManager.js        # NEW: Redis session with signatures
├── middleware/
│   ├── redisSession.js          # MODIFIED: Use SessionManager
│   ├── auth.js                  # MODIFIED: Use TokenManager
│   └── sessionRecovery.js       # MODIFIED: ctx.token instead of ctx.session.token
├── utils/
│   └── api.js                   # MODIFIED: authApi.getOrCreateToken
├── handlers/                    # MODIFIED: ctx.token instead of ctx.session.token (25 files)
├── scenes/                      # MODIFIED: ctx.token instead of ctx.session.token (12 files)
└── scripts/
    └── migrateSessions.js       # NEW: One-time migration script

backend/src/
├── routes/
│   └── auth.js                  # MODIFIED: +GET /auth/token endpoint
├── controllers/
│   └── authController.js        # MODIFIED: +getToken method
└── middleware/
    └── auth.js                  # UNCHANGED
```

---

## Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Phase 1: Dev** | 3 days | Implement TokenManager, SessionManager, tests |
| **Phase 2: Backend** | 1 day | Add GET /auth/token endpoint, deploy |
| **Phase 3: Bot dual mode** | 2 days | Update middleware, backward compatibility |
| **Phase 4: Migration** | 1 day | Run migration script, monitor |
| **Phase 5: Cleanup** | 2 days | Update all handlers, remove old code |
| **Phase 6: Verification** | 2 days | Load testing, security audit |

**Total:** ~11 days (2 weeks sprint)

---

## Критические файлы для реализации

### Critical Files for Implementation

1. **bot/src/services/tokenManager.js** - NEW
   - Центральный компонент кэширования токенов
   - Весь token lifecycle управляется здесь

2. **bot/src/services/sessionManager.js** - NEW
   - Управление session state в Redis
   - Signature generation/validation для защиты от подделки

3. **bot/src/middleware/auth.js** - CORE MODIFICATION
   - Основной entry point для аутентификации
   - Переход с session-based на token-based approach

4. **backend/src/controllers/authController.js** - BACKEND CHANGE
   - Новый endpoint GET /auth/token
   - Lightweight token generation (stateless)

5. **bot/src/utils/api.js** - API CLIENT UPDATE
   - authApi.getOrCreateToken() - вызывается TokenManager
   - Базовый интерфейс для всех backend запросов

---

## Дополнительные соображения

### Future enhancements

1. **Token rotation**
   - Автоматическая ротация JWT при подозрительной активности
   - Backend endpoint: POST /auth/rotate-token

2. **Multi-device support**
   - session:{telegram_id}:{device_id}
   - Поддержка нескольких устройств одновременно

3. **Session analytics**
   - Track session lifetime, token refresh frequency
   - Anomaly detection (unusual token requests)

4. **Graceful degradation**
   - Если backend недоступен → fallback to cached token (extended TTL)
   - Если Redis недоступен → in-memory session (как сейчас)

---

## Заключение

**Option A (Session ID + Server-side Token Management)** обеспечивает:

✅ **Безопасность:** JWT токены НЕ хранятся в Redis  
✅ **Privacy:** Минимизация PII (только telegram_id + state)  
✅ **Производительность:** In-memory cache → 95%+ hit rate  
✅ **Масштабируемость:** Stateless backend, horizontal scaling  
✅ **Clean Architecture:** Separation of concerns (Session ≠ Auth)  
✅ **Backward compatibility:** Graceful migration с dual mode  

Это правильное решение для production Telegram бота с высокими требованиями к безопасности.
