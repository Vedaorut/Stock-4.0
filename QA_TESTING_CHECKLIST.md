# Status Stock - QA Testing Checklist

## 1. BACKEND API ENDPOINTS (117+ endpoints)

### Auth Routes (/api/auth)
| Method | Endpoint | Handler | Middleware | Description |
|--------|----------|---------|------------|-------------|
| POST | /api/auth/login | authController.login | authLimiter | Вход через Telegram WebApp |
| POST | /api/auth/register | authController.register | authLimiter | Регистрация с ролью |
| GET | /api/auth/profile | authController.getProfile | verifyToken | Получить профиль |
| PUT | /api/auth/profile | authController.updateProfile | verifyToken | Обновить профиль |
| PATCH | /api/auth/role | authController.updateRole | verifyToken | Обновить роль |
| POST | /api/auth/telegram-validate | authController.telegramValidate | verifyTelegramInitData | Валидация initData |
| POST | /api/auth/refresh | authController.refreshToken | authLimiter | Обновить токен |
| POST | /api/auth/logout | authController.logout | authLimiter | Выход |
| PATCH | /api/auth/language | inline | verifyToken | Изменить язык |

### Shops Routes (/api/shops)
| Method | Endpoint | Handler | Middleware | Description |
|--------|----------|---------|------------|-------------|
| POST | /api/shops | shopController.create | verifyToken, shopCreationLimiter | Создать магазин |
| GET | /api/shops/my | shopController.getMyShops | verifyToken | Мои магазины |
| GET | /api/shops/worker | workerController.getWorkerShops | verifyToken | Магазины воркера |
| GET | /api/shops/active | shopController.listActive | apiLimiter | Активные магазины |
| GET | /api/shops/search | shopController.search | apiLimiter, optionalAuth | Поиск магазинов |
| GET | /api/shops/invite/:inviteCode | shopController.getByInviteCode | apiLimiter | По invite коду |
| GET | /api/shops/:id | shopController.getById | optionalAuth | Магазин по ID |
| PUT | /api/shops/:id | shopController.update | verifyToken, requireShopOwner, requireActiveShop | Обновить |
| DELETE | /api/shops/:id | shopController.delete | verifyToken, requireShopOwner | Удалить |
| GET | /api/shops/:id/wallets | shopController.getWallets | verifyToken | Кошельки |
| PUT | /api/shops/:id/wallets | shopController.updateWallets | verifyToken, requireShopOwner | Обновить кошельки |
| GET | /api/shops/:shopId/products | productController.list | verifyToken, requireShopAccess | Товары магазина |
| POST | /api/shops/:shopId/products | productController.create | verifyToken, requireShopAccess, requireActiveShop | Создать товар |
| PUT | /api/shops/:shopId/products/:id | productController.update | verifyToken, requireShopAccess | Обновить товар |
| DELETE | /api/shops/:shopId/products/:id | productController.delete | verifyToken, requireShopAccess | Удалить товар |
| GET | /api/shops/:shopId/orders | orderController.getMyOrders | verifyToken, requireShopAccess | Заказы магазина |
| POST | /api/shops/:shopId/subscribe | shopSubscriberController.subscribe | verifyToken | Подписаться |
| DELETE | /api/shops/:shopId/subscribe | shopSubscriberController.unsubscribe | verifyToken | Отписаться |
| GET | /api/shops/:shopId/subscribed | shopSubscriberController.checkSubscription | verifyToken | Проверить подписку |
| GET | /api/shops/:shopId/subscribers/count | shopSubscriberController.getCount | apiLimiter | Кол-во подписчиков |
| GET | /api/shops/:shopId/subscribers | shopSubscriberController.getSubscribers | verifyToken, requireShopOwner | Список подписчиков |

### Products Routes (/api/products)
| Method | Endpoint | Handler | Middleware | Description |
|--------|----------|---------|------------|-------------|
| POST | /api/products | productController.create | verifyToken, productCreationLimiter | Создать товар |
| GET | /api/products | productController.list | apiLimiter | Список товаров |
| GET | /api/products/search | productController.search | verifyToken | Поиск товаров |
| GET | /api/products/limit-status/:shopId | inline | verifyToken | Лимит товаров |
| GET | /api/products/:id | productController.getById | apiLimiter | Товар по ID |
| PUT | /api/products/:id | productController.update | verifyToken, requireActiveShop | Обновить |
| DELETE | /api/products/:id | productController.delete | verifyToken, requireActiveShop | Удалить |
| POST | /api/products/bulk-delete-all | productController.bulkDeleteAll | verifyToken | Удалить все |
| POST | /api/products/bulk-delete-by-ids | productController.bulkDeleteByIds | verifyToken | Удалить по ID |
| POST | /api/products/bulk-discount | productController.applyBulkDiscount | verifyToken | Массовая скидка |
| POST | /api/products/bulk-discount/remove | productController.removeBulkDiscount | verifyToken | Убрать скидку |
| POST | /api/products/bulk-update | productController.bulkUpdateProducts | verifyToken | Массовое обновление |

### Orders Routes (/api/orders)
| Method | Endpoint | Handler | Middleware | Description |
|--------|----------|---------|------------|-------------|
| POST | /api/orders | orderController.create | verifyToken | Создать заказ |
| GET | /api/orders | orderController.getMyOrders | verifyToken | Мои заказы |
| GET | /api/orders/my | orderController.getMyOrders | verifyToken | Мои заказы (покупатель) |
| GET | /api/orders/sales | orderController.getMyOrders | verifyToken | Продажи (продавец) |
| GET | /api/orders/active/count | orderController.getActiveCount | verifyToken | Активные заказы |
| GET | /api/orders/analytics | orderController.getAnalytics | verifyToken | Аналитика |
| GET | /api/orders/:id | orderController.getById | verifyToken | Заказ по ID |
| PUT | /api/orders/:id/status | orderController.updateStatus | verifyToken | Обновить статус |
| POST | /api/orders/bulk-status | orderController.bulkUpdateStatus | verifyToken | Массовый статус |
| GET | /api/orders/:id/payment-info | orderController.getPaymentInfo | verifyToken, orderPaymentLimiter | Инфо для оплаты |
| POST | /api/orders/:id/submit-payment | orderController.submitPayment | verifyToken, orderPaymentLimiter | Отправить хеш |
| GET | /api/orders/:id/payment-status | orderController.getPaymentStatus | verifyToken, orderPaymentLimiter | Статус платежа |

### Payments Routes (/api/payments)
| Method | Endpoint | Handler | Middleware | Description |
|--------|----------|---------|------------|-------------|
| POST | /api/payments/verify | paymentController.verify | verifyToken, strictPaymentLimiter | Проверить платеж |
| GET | /api/payments/order/:orderId | paymentController.getByOrder | verifyToken | Платежи заказа |
| GET | /api/payments/status | paymentController.checkStatus | verifyToken | Статус по хешу |
| POST | /api/payments/qr | paymentController.generateQR | verifyToken | QR код |
| POST | /api/payments/subscriptions/:id/invoice/crystalpay | inline | verifyToken | CrystalPay счёт |
| GET | /api/payments/invoices/:id/status | inline | verifyToken | Статус счёта |

### Subscriptions Routes (/api/subscriptions)
| Method | Endpoint | Handler | Middleware | Description |
|--------|----------|---------|------------|-------------|
| GET | /api/subscriptions/pricing | subscriptionController.getPricing | - | Цены подписок |
| POST | /api/subscriptions/pending | subscriptionController.createPendingSubscription | verifyToken | Pending подписка |
| GET | /api/subscriptions/check/:shopId | subscriptionController.checkSubscription | verifyToken | Проверить подписку |
| GET | /api/subscriptions | subscriptionController.getUserSubscriptions | verifyToken | Мои подписки |
| POST | /api/subscriptions | subscriptionController.createSubscription | verifyToken | Подписаться |
| GET | /api/subscriptions/my-shops | subscriptionController.getMyShopSubscriptions | verifyToken | Подписки магазинов |
| GET | /api/subscriptions/upgrade-cost/:shopId | subscriptionController.getUpgradeCost | verifyToken | Стоимость апгрейда |
| GET | /api/subscriptions/status/:shopId | subscriptionController.getStatus | verifyToken | Статус подписки |
| GET | /api/subscriptions/history/:shopId | subscriptionController.getHistory | verifyToken | История платежей |
| POST | /api/subscriptions/:id/payment/generate | subscriptionController.generatePaymentInvoice | verifyToken | Создать счёт |
| POST | /api/subscriptions/:id/upgrade/payment/generate | subscriptionController.generateUpgradePaymentInvoice | verifyToken | Счёт апгрейда |
| GET | /api/subscriptions/:id/payment/status | subscriptionController.getPaymentStatus | verifyToken | Статус платежа |
| POST | /api/subscriptions/:id/payment/confirm | subscriptionController.confirmPaymentWithTxHash | verifyToken | Подтвердить tx |

### Follows Routes (/api/follows)
| Method | Endpoint | Handler | Middleware | Description |
|--------|----------|---------|------------|-------------|
| GET | /api/follows | followController.getMyFollows | verifyToken | Мои follows |
| GET | /api/follows/my | followController.getMyFollows | verifyToken | Alias |
| GET | /api/follows/check-limit | followController.checkFollowLimit | verifyToken | Лимит follows |
| POST | /api/follows | followController.createFollow | verifyToken | Создать follow |
| GET | /api/follows/:id | followController.getFollowDetail | verifyToken | Детали |
| GET | /api/follows/:id/products | followController.getFollowProducts | verifyToken | Товары |
| GET | /api/follows/:id/sync-status | followController.getFollowSyncStatus | verifyToken | Статус синхронизации |
| PUT | /api/follows/:id/markup | followController.updateFollowMarkup | verifyToken, requireFollowOwner | Обновить наценку |
| PUT | /api/follows/:id/mode | followController.switchFollowMode | verifyToken, requireFollowOwner | Режим |
| DELETE | /api/follows/:id | followController.deleteFollow | verifyToken, requireFollowOwner | Удалить |
| PUT | /api/follows/:id/products/:productId/markup | followController.updateProductMarkup | verifyToken | Наценка товара |
| DELETE | /api/follows/:id/products/:productId/markup | followController.resetProductMarkup | verifyToken | Сбросить наценку |

### Workers Routes (/api/workers)
| Method | Endpoint | Handler | Middleware | Description |
|--------|----------|---------|------------|-------------|
| GET | /api/workers/accessible | workerController.getAccessibleShops | verifyToken | Доступные магазины |
| GET | /api/workers/workspace | workerController.getWorkerShops | verifyToken | Магазины воркера |
| POST | /api/workers/:shopId/workers | workerController.add | verifyToken, workerLimiter | Добавить воркера (MAX tier) |
| GET | /api/workers/:shopId/workers | workerController.list | verifyToken | Список воркеров |
| DELETE | /api/workers/:shopId/workers/:workerId | workerController.remove | verifyToken | Удалить воркера |
| PATCH | /api/workers/mute | workerController.toggleNotificationMute | verifyToken | Mute уведомления |
| GET | /api/workers/mute/:shopId | workerController.getNotificationMuteStatus | verifyToken | Статус mute |

### Admin Routes (/api/admin)
| Method | Endpoint | Handler | Middleware | Description |
|--------|----------|---------|------------|-------------|
| GET | /api/admin/payments/needs-review | getNeedsReviewPayments | authenticate, requireAdmin | Платежи на проверку |
| POST | /api/admin/payments/:paymentId/approve | approvePayment | authenticate, requireAdmin | Одобрить |
| POST | /api/admin/payments/:paymentId/reject | rejectPayment | authenticate, requireAdmin | Отклонить |

### Webhooks (/webhooks)
| Method | Endpoint | Handler | Description |
|--------|----------|---------|-------------|
| POST | /webhooks/crystalpay | crystalPayWebhook | CrystalPay платежи |

---

## 2. TELEGRAM BOT COMMANDS & HANDLERS

### Commands
| Command | Description |
|---------|-------------|
| /start | Запуск бота, выбор роли, обработка deep links |

### Callback Handlers - Language
| Pattern | Description |
|---------|-------------|
| lang:ru, lang:en | Выбор языка |
| settings:lang:ru, settings:lang:en | Язык в настройках |

### Callback Handlers - Navigation
| Pattern | Description |
|---------|-------------|
| main_menu | Главное меню |
| back_to_main | Назад в главное |
| back | Контекстная кнопка назад |
| cancel_scene | Отмена сцены |
| settings | Меню настроек |
| settings:main | Вернуться в настройки |
| settings:back | Выйти из настроек |

### Callback Handlers - Roles
| Pattern | Description |
|---------|-------------|
| role:toggle | Переключить роль |
| role:buyer | Выбрать покупателя |
| role:seller | Выбрать продавца |
| role:worker | Выбрать воркера |
| workspace:\d+ | Выбрать магазин воркера |

### Callback Handlers - Seller
| Pattern | Description |
|---------|-------------|
| seller:create_shop | Создать магазин |
| seller:add_product | Добавить товар |
| seller:active_orders | Активные заказы |
| seller:order_history | История заказов |
| seller:order_history:\d+ | Пагинация истории |
| seller:order_stats | Статистика |
| seller:wallets | Кошельки |
| seller:workers | Управление воркерами |
| seller:tools | Инструменты |
| seller:invite_link | Invite ссылка |
| seller:rename_shop | Переименовать |
| seller:migrate_channel | Миграция канала |
| seller:main | Меню продавца |
| order:ship:\d+ | Отправить заказ |
| order:deliver:\d+ | Доставить заказ |
| order:cancel:\d+ | Отменить заказ |

### Callback Handlers - Subscription
| Pattern | Description |
|---------|-------------|
| subscription:pay | Оплатить подписку |
| subscription:upgrade | Апгрейд на MAX |
| subscription:status | Статус подписки |
| start_create_shop | Создать магазин |
| settings:renew | Продлить подписку |
| settings:exit_trial | Выйти из trial |

### Callback Handlers - Workers
| Pattern | Description |
|---------|-------------|
| workers:add | Добавить воркера |
| workers:list | Список воркеров |
| workers:remove:\d+ | Удалить воркера |
| workers:remove:confirm:\d+ | Подтвердить удаление |

### Callback Handlers - Buyer
| Pattern | Description |
|---------|-------------|
| buyer:search | Поиск магазина |
| buyer:subscriptions | Мои подписки |
| buyer:orders | Мои заказы |
| buyer:main | Меню покупателя |
| subscribe:.+ | Подписаться на магазин |
| unsubscribe:.+ | Отписаться |
| shop:view:.+ | Просмотр магазина |
| shop:stock:.+ | Товары в наличии |
| shop:preorder:.+ | Предзаказ |

### Callback Handlers - Follows
| Pattern | Description |
|---------|-------------|
| follow:create | Создать follow |
| follow:list | Список follows |
| follow:\d+ | Детали follow |
| follow:\d+:catalog | Каталог товаров |
| follow:\d+:edit | Редактировать |
| follow:\d+:delete | Удалить |

### Scenes (Multi-step Dialogs)
| Scene | Steps | Description |
|-------|-------|-------------|
| createShop | 2 | Создание магазина |
| addProduct | 3 | Добавление товара |
| paySubscription | 5 | Оплата подписки CrystalPay |
| chooseTier | 2 | Выбор тарифа (Free/PRO/MAX) |
| searchShop | 2 | Поиск магазина |
| createFollow | 4-5 | Создание follow |
| editFollowMarkup | 2 | Редактирование наценки |
| manageWorkers | 2 | Добавление воркера |
| manageWallets | Multi | Управление кошельками |
| markOrdersShipped | 2 | Массовая отправка |
| migrateChannel | 2-3 | Миграция канала |
| renameShop | 2 | Переименование магазина |
| upgradeShop | - | Апгрейд подписки |
| feedback | 2 | Отправка отзыва |

---

## 3. WEBAPP PAGES & COMPONENTS

### Pages
| Tab/Route | Component | Description |
|-----------|-----------|-------------|
| subscriptions | Subscriptions.jsx | Подписки на магазины |
| catalog | Catalog.jsx | Каталог товаров магазина |
| follows | Follows.jsx | Управление follows |
| followDetailId={id} | FollowDetail.jsx | Детали follow |
| settings | Settings.jsx | Настройки |

### Key Components - Cart
| Component | Description |
|-----------|-------------|
| CartButton.jsx | Плавающая кнопка корзины |
| CartSheet.jsx | Модалка корзины |
| CartItem.jsx | Элемент в корзине |

### Key Components - Payment Flow
| Component | Description |
|-----------|-------------|
| PaymentFlowManager.jsx | Менеджер оплаты |
| PaymentMethodModal.jsx | Выбор способа оплаты |
| PaymentDetailsModal.jsx | Адрес и сумма |
| PaymentHashModal.jsx | Ввод хеша транзакции |
| OrderStatusModal.jsx | Статус заказа |

### Key Components - Products
| Component | Description |
|-----------|-------------|
| ProductCard.jsx | Карточка товара |
| ProductGrid.jsx | Сетка товаров |

### Settings Modals
| Component | Description |
|-----------|-------------|
| WalletsModal.jsx | Крипто-кошельки |
| LanguageModal.jsx | Выбор языка |
| ProductsModal.jsx | Управление товарами |
| SubscriptionModal.jsx | Инфо о подписке |
| WorkspaceModal.jsx | Воркеры (MAX tier) |
| FollowsModal.jsx | Управление follows |
| AnalyticsModal.jsx | Аналитика |
| MigrationModal.jsx | Миграция |
| InviteLinkModal.jsx | Invite ссылки |
| MyOrdersModal.jsx | Мои заказы (buyer) |
| ShopOrdersModal.jsx | Заказы магазина |
| FeedbackModal.jsx | Отзыв |

### Store Actions - Cart
| Action | Description |
|--------|-------------|
| addToCart(product) | Добавить в корзину |
| removeFromCart(productId) | Удалить из корзины |
| updateCartQuantity(productId, qty) | Изменить количество |
| clearCart() | Очистить корзину |
| getCartTotal() | Итого |
| getCartCount() | Количество товаров |

### Store Actions - Payment
| Action | Description |
|--------|-------------|
| startCheckout() | Начать оплату |
| createOrder() | Создать заказ |
| selectCrypto(crypto) | Выбрать крипту |
| submitPaymentHash(hash) | Отправить хеш |
| resetPaymentFlow() | Сбросить |
| setPaymentStep(step) | Установить шаг |

### Store Actions - UI
| Action | Description |
|--------|-------------|
| setCartOpen(isOpen) | Корзина открыта/закрыта |
| setActiveTab(tab) | Активная вкладка |
| setViewMode(mode) | buyer/seller |
| setLanguage(lang) | Язык |

---

## 4. PAYMENT SYSTEM

### Supported Cryptocurrencies
| Currency | Chain | API Provider | Decimals |
|----------|-------|--------------|----------|
| BTC | Bitcoin | Blockstream Esplora | 8 |
| LTC | Litecoin | BlockCypher | 8 |
| ETH | Ethereum | Etherscan | 18 |
| USDT | TRC20 (TRON) | TronGrid | 6 |

### Payment Verification Flow
```
1. User submits tx_hash
2. Backend extracts hash from URL if needed
3. Blockchain verification via API
4. Check: amount >= expected (2% tolerance)
5. Check: address matches
6. Check: confirmations >= minimum
7. Update order status
```

### CrystalPay Integration (Subscriptions)
| Method | Description |
|--------|-------------|
| BITCOIN | BTC через CrystalPay |
| LITECOIN | LTC через CrystalPay |

### Security Features
- P1-SEC-004: Strict rate limiting (3 req/min)
- P1-SEC-005: IDOR protection
- Amount tolerance: 2%
- TX reuse protection
- Signature verification (webhooks)
- Replay protection

---

## 5. SUBSCRIPTION TIERS

| Feature | FREE (Trial) | PRO ($25/mo) | MAX ($35/mo) |
|---------|--------------|--------------|--------------|
| Products | 10 | 50 | Unlimited |
| Follows | 1 | 2 | Unlimited |
| Workers | - | - | 5 |
| Analytics | 7 days | 30 days | 365 days |
| Duration | 7 days | Monthly/Yearly | Monthly/Yearly |

---

## 6. CRITICAL TEST SCENARIOS

### Authentication
- [ ] Telegram WebApp initData validation
- [ ] JWT token refresh flow
- [ ] Token expiration handling
- [ ] User not found after DB reset

### Shop Management
- [ ] Create shop (name validation, uniqueness)
- [ ] Update shop (owner only)
- [ ] Delete shop cascade
- [ ] Invite link generation and usage

### Products
- [ ] CRUD operations
- [ ] Product limits by tier
- [ ] Bulk operations (delete, discount)
- [ ] Stock quantity tracking

### Orders
- [ ] Create order with cart items
- [ ] Payment flow (crypto selection → hash submission)
- [ ] Status updates (pending → confirmed → shipped)
- [ ] Seller/buyer views

### Payments
- [ ] BTC verification (Blockstream)
- [ ] LTC verification (BlockCypher)
- [ ] ETH verification (Etherscan)
- [ ] USDT TRC20 verification (TronGrid)
- [ ] Amount tolerance (2%)
- [ ] Hash extraction from explorer URLs
- [ ] Duplicate TX prevention

### Subscriptions
- [ ] Free trial flow (7 days)
- [ ] PRO subscription payment
- [ ] MAX subscription payment
- [ ] Upgrade PRO → MAX
- [ ] Grace period (2 days)
- [ ] Subscription expiration

### Follows
- [ ] Create follow (monitor/resell modes)
- [ ] Markup percentage
- [ ] Product sync
- [ ] Follow limits by tier

### Workers (MAX tier only)
- [ ] Add worker by telegram_id
- [ ] Add worker by username
- [ ] Worker shop access
- [ ] Remove worker
- [ ] Notification mute

### Bot Flows
- [ ] /start command (new user, existing user)
- [ ] Role switching (buyer ↔ seller ↔ worker)
- [ ] Deep links (shop invite)
- [ ] Language change (RU/EN)
- [ ] All scenes complete flow

### WebApp Flows
- [ ] Cart operations
- [ ] Checkout flow
- [ ] Payment hash submission
- [ ] Settings modals
- [ ] Tab navigation
- [ ] Offline handling

---

## 7. ERROR HANDLING TESTS

### Expected Errors
| Code | Scenario |
|------|----------|
| 400 | Invalid input validation |
| 401 | Missing/invalid token |
| 403 | Not authorized (owner/worker check) |
| 404 | Resource not found |
| 409 | Duplicate (shop name, worker) |
| 429 | Rate limit exceeded |
| 402 | Subscription inactive |

### Edge Cases
- [ ] Network timeout during payment verification
- [ ] Blockchain API unavailable
- [ ] CrystalPay webhook delay
- [ ] Concurrent order creation
- [ ] Session expiration during checkout

---

*Generated for QA Testing - Status Stock 4.0*
