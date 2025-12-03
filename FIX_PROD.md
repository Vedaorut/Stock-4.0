# FIX_PROD — Баги для исправления перед Production

**Дата:** 2025-12-03  
**Всего багов:** 44  
**Статус:** IN PROGRESS

---

## CRITICAL (P0) — Блокеры прода

### [C1] Race Condition - Stock Inflation через отмену заказа
- **Файл:** `backend/src/services/orderService.js:126-128`
- **Проблема:** При отмене confirmed заказа stock возвращается без проверки `stock_deducted` флага. Можно получить бесплатный товар.
- **Impact:** Финансовые потери, inventory corruption
- **Fix:** Добавить поле `stock_deducted` в order_items, проверять перед возвратом
- **Status:** [x] PARTIAL - TODO добавлен, нужна миграция БД

### [C2] Missing FOR UPDATE в legacy order path
- **Файл:** `backend/src/services/invoicePayment/finalizers/orderFinalizer.js:104-111`
- **Проблема:** Legacy single-item order path не блокирует продукт `FOR UPDATE`, race condition при параллельных покупках
- **Impact:** Overselling, минусовой stock
- **Fix:** Добавить `FOR UPDATE` в SELECT запрос
- **Status:** [x] FIXED

### [C3] TOCTOU в проверке stock
- **Файл:** `backend/src/services/invoicePayment/processors/orderProcessor.js:207-247`
- **Проблема:** Time-of-check to time-of-use: между SELECT и UPDATE stock может измениться
- **Impact:** Race condition, минусовой stock
- **Fix:** Использовать `WHERE stock_quantity >= $1` в UPDATE, проверять rowCount
- **Status:** [x] FIXED

### [C4] require() в ESM модуле
- **Файл:** `webapp/src/components/Payment/PaymentFlowManager.jsx:30-31`
- **Проблема:** `require()` не работает в Vite ESM production build
- **Impact:** Error recovery полностью СЛОМАН в production
- **Fix:** Заменить на `import { useStore } from '../../store/useStore'`
- **Status:** [x] FIXED

### [C5] ctx.lang undefined без fallback
- **Файл:** `bot/src/handlers/` (множество файлов)
- **Проблема:** Если i18nMiddleware не выполнился, ctx.lang = undefined
- **Impact:** Crash при отсутствии i18n middleware
- **Fix:** Добавить fallback `const lang = ctx.lang || 'ru'` везде
- **Status:** [x] FIXED - getLangSafe() в 4 файлах

### [C6] Network errors без answerCbQuery
- **Файл:** `bot/src/utils/sceneValidation.js:98-100`
- **Проблема:** При network error (ECONNREFUSED, timeout) не вызывается answerCbQuery
- **Impact:** Бесконечный спиннер на кнопках
- **Fix:** Добавить обработку network errors с answerCbQuery
- **Status:** [x] FIXED

---

## HIGH (P1) — Нужно до прода

### [H1] SQL Injection Risk в subscriptionService
- **Файл:** `backend/src/services/subscriptionService.js:93-101`
- **Проблема:** `GRACE_PERIOD_DAYS` интерполируется в SQL без параметризации
- **Impact:** Потенциальный SQL injection если константа станет user-controlled
- **Fix:** Использовать `make_interval(days => $2)` или параметр
- **Status:** [x] FIXED

### [H2] Double-Notification Race Condition
- **Файл:** `backend/src/services/invoicePayment/processors/orderProcessor.js:276-285`
- **Проблема:** Notification после COMMIT может отправиться дважды при race
- **Impact:** Спам нотификациями
- **Fix:** Добавить флаг `notification_sent` в orders/payments
- **Status:** [ ] TODO

### [H3] NaN в calculatePriceWithMarkup
- **Файл:** `backend/src/services/productSyncService.js:62-68`
- **Проблема:** Если sourcePrice или markupValue = null/undefined, возвращается NaN
- **Impact:** Сломанные цены, невозможность покупки
- **Fix:** Добавить валидацию isNaN() и throw Error
- **Status:** [x] FIXED

### [H4] Trial Abuse через deleted shops
- **Файл:** `backend/src/controllers/shopController.js:155-160`
- **Проблема:** Проверка trial не учитывает soft-deleted shops
- **Impact:** Бесконечный trial для пользователя
- **Fix:** Убрать `AND deleted_at IS NULL` из проверки trial
- **Status:** [x] FIXED - запрос уже проверяет все shops

### [H5] Deadlock potential в updateMarkupForFollow
- **Файл:** `backend/src/services/productSyncService.js:453-465`
- **Проблема:** Lock order не гарантирован, возможен deadlock
- **Impact:** Зависание транзакций
- **Fix:** Добавить `ORDER BY id` в FOR UPDATE запрос
- **Status:** [x] FIXED

### [H6] Double answerCbQuery в chooseTier
- **Файл:** `bot/src/scenes/chooseTier.js:69, 122`
- **Проблема:** answerCbQuery вызывается дважды
- **Impact:** Второй вызов игнорируется, лишний await
- **Fix:** Убрать второй answerCbQuery на строке 122
- **Status:** [x] FIXED

### [H7] Missing answerCbQuery в handleBack
- **Файл:** `bot/src/handlers/common.js:186-224`
- **Проблема:** В catch-блоке нет answerCbQuery
- **Impact:** Бесконечный спиннер при ошибке
- **Fix:** Добавить `await ctx.answerCbQuery('Ошибка')` в catch
- **Status:** [x] FIXED

### [H8] Missing answerCbQuery в handleMainMenu
- **Файл:** `bot/src/handlers/common.js:140-151`
- **Проблема:** Аналогично H7
- **Impact:** Бесконечный спиннер
- **Fix:** Добавить answerCbQuery в catch
- **Status:** [x] FIXED

### [H9] Null pointer в handleSellerRole
- **Файл:** `bot/src/handlers/seller/index.js:308`
- **Проблема:** `shopHealth` может быть null, передается в getTipForShop
- **Impact:** TypeError crash
- **Fix:** Добавить null-check перед вызовом getTipForShop
- **Status:** [x] FIXED

### [H10] Missing tier validation в createShop
- **Файл:** `bot/src/scenes/createShop.js:122-129`
- **Проблема:** При отсутствии tier показывается generic error
- **Impact:** Пользователь не понимает причину ошибки
- **Fix:** Показать конкретное сообщение, redirect на chooseTier
- **Status:** [x] FIXED

### [H11] Network error handling в validateShopBeforeScene
- **Файл:** `bot/src/utils/sceneValidation.js:98-100`
- **Проблема:** Network errors пробрасываются без user feedback
- **Impact:** Бесконечный спиннер, непонятная ошибка
- **Fix:** Добавить обработку ECONNREFUSED, ETIMEDOUT
- **Status:** [x] FIXED (в C6)

### [H12] Race condition getState() после async
- **Файл:** `webapp/src/components/Payment/PaymentHashModal.jsx:59-64`
- **Проблема:** getState() вызывается сразу после await, state может не обновиться
- **Impact:** Incorrect UI state
- **Fix:** Использовать возвращаемое значение вместо getState()
- **Status:** [x] FIXED

### [H13] Memory leak при retry в Catalog
- **Файл:** `webapp/src/pages/Catalog.jsx:447-449`
- **Проблема:** AbortController не сохраняется и не абортится при unmount
- **Impact:** setState на unmounted component
- **Fix:** Сохранять controller в ref, abort в cleanup
- **Status:** [x] FIXED

### [H14] Null access в createFakeCallbackContext
- **Файл:** `bot/src/handlers/start.js:13-32`
- **Проблема:** `ctx.reply.bind(ctx)` без optional chaining
- **Impact:** Potential crash в edge cases
- **Fix:** Добавить optional chaining `ctx.reply?.bind(ctx)`
- **Status:** [x] FIXED

---

## MEDIUM (P2) — После MVP

### [M1] Integer Overflow в pagination COUNT
- **Файл:** `backend/src/models/shopFollowQueries.js:166` и другие
- **Проблема:** PostgreSQL COUNT(*) возвращает bigint, parseInt может overflow
- **Impact:** Неправильный count для больших таблиц
- **Fix:** Использовать `::int` cast или BigInt
- **Status:** [ ] TODO

### [M2] Cache invalidation в cryptoPriceService
- **Файл:** `backend/src/services/cryptoPriceService.js:126-129`
- **Проблема:** При ошибке одной chain кэш других не обновляется
- **Impact:** Stale prices
- **Fix:** Timestamp per chain
- **Status:** [ ] TODO

### [M3] Subscription cleanup leak
- **Файл:** `backend/src/services/broadcastService.js:284-306`
- **Проблема:** При 403/400 удаляется только из subscriptions, не из shop_subscribers
- **Impact:** Orphaned records
- **Fix:** Удалять из обеих таблиц
- **Status:** [ ] TODO

### [M4] Race condition в manageWallets timeout
- **Файл:** `bot/src/scenes/manageWallets.js:503-520`
- **Проблема:** ctx.scene.current.id может быть undefined
- **Impact:** Potential TypeError
- **Fix:** Использовать optional chaining `ctx.scene?.current?.id`
- **Status:** [ ] TODO

### [M5] Memory leak в shopOnboarding
- **Файл:** `bot/src/scenes/shopOnboarding.js:170`
- **Проблема:** messageId сохраняется но не cleanup при ошибках
- **Impact:** Hanging messages
- **Fix:** Добавить cleanup в error handler
- **Status:** [ ] TODO

### [M6] getShop без token
- **Файл:** `bot/src/scenes/createFollow.js:186-187`
- **Проблема:** getShop вызывается без токена
- **Impact:** Может падать если API требует auth
- **Fix:** Проверить нужен ли token, добавить если да
- **Status:** [ ] TODO

### [M7] answerCbQuery после scene.leave()
- **Файл:** `bot/src/scenes/paySubscription.js:424-425`
- **Проблема:** answerCbQuery вызван за 30+ сек до scene.leave
- **Impact:** Telegram может отклонить callback
- **Fix:** Проверять timeout перед операциями
- **Status:** [ ] TODO

### [M8] Нет max length validation для promoCode
- **Файл:** `bot/src/scenes/chooseTier.js:225-253`
- **Проблема:** Проверяется только min length, не max
- **Impact:** Потенциальный DoS с длинным промокодом
- **Fix:** Добавить `promoCode.length > 50` check
- **Status:** [ ] TODO

### [M9] Closure lock stuck при exception
- **Файл:** `webapp/src/store/slices/paymentSlice.js:237-391`
- **Проблема:** invoiceInProgress может застрять если exception до try-block
- **Impact:** Невозможность выбрать криптовалюту до reload
- **Fix:** Обернуть весь код в try-finally
- **Status:** [ ] TODO

### [M10] AbortError vs CanceledError
- **Файл:** `webapp/src/App.jsx:143`
- **Проблема:** Проверяется AbortError, axios выбрасывает CanceledError
- **Impact:** Лишние error logs
- **Fix:** Проверять оба типа ошибок
- **Status:** [ ] TODO

---

## LOW (P3) — Backlog

### [L1] session.lastHistoryClick не очищается
- **Файл:** `bot/src/handlers/seller/orders.js:474`
- **Fix:** Добавить cleanup или TTL
- **Status:** [ ] TODO

### [L2] Hardcoded bot username
- **Файл:** `bot/src/scenes/createShop.js:216`
- **Fix:** Убрать fallback или добавить в required env
- **Status:** [ ] TODO

### [L3] Double reply в handleWorkers
- **Файл:** `bot/src/handlers/seller/index.js:721-733`
- **Fix:** Проверять timeout перед fallback reply
- **Status:** [ ] TODO

### [L4] shopId undefined check
- **Файл:** `webapp/src/components/Cart/CartSheet.jsx:70-74`
- **Fix:** Добавить `if (!cartShopId) return false`
- **Status:** [ ] TODO

### [L5] Loose equality для ID
- **Файл:** `webapp/src/components/Product/ProductCard.jsx:156`
- **Fix:** Заменить `==` на `===`
- **Status:** [ ] TODO

### [L6] Console.log в production
- **Файл:** `webapp/src/providers/TelegramProvider.jsx:72`
- **Fix:** Убрать или обернуть в if (DEV)
- **Status:** [ ] TODO

### [L7] Stale handler в useBackButton
- **Файл:** `webapp/src/hooks/useBackButton.js:42-45`
- **Fix:** Добавить null-check в handler
- **Status:** [ ] TODO

---

## Прогресс

| Severity | Total | Fixed | Remaining |
|----------|-------|-------|-----------|
| CRITICAL | 6 | 5 | 1 (partial) |
| HIGH | 14 | 13 | 1 (H2 needs DB) |
| MEDIUM | 10 | 0 | 10 |
| LOW | 7 | 0 | 7 |
| **TOTAL** | **37** | **18** | **19** |

---

## Changelog

- **2025-12-03:** Initial bug list created from 3-agent parallel analysis
- **2025-12-03:** CRITICAL C2-C6 FIXED. C1 partial (needs DB migration)
- **2025-12-03:** HIGH H1,H3-H14 FIXED. H2 skipped (needs DB schema change)
