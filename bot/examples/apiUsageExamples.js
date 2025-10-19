/**
 * API Usage Examples
 *
 * Demonstrates how to use the new API clients in bot handlers
 */

import {
  authApi,
  shopsApi,
  productsApi,
  ordersApi,
  subscriptionsApi,
  paymentsApi
} from '../api/index.js';

import { getToken, setToken } from '../utils/tokenManager.js';
import { handleApiCall, safeReply } from '../utils/errorHandler.js';
import logger from '../utils/logger.js';

/**
 * Example: User login/registration
 */
export async function handleUserLogin(ctx) {
  const telegramUser = ctx.from;

  // Try to login
  const result = await handleApiCall(
    ctx,
    async () => await authApi.login(telegramUser),
    'Login error'
  );

  if (!result) return; // Error was already handled

  // Store token in session
  setToken(ctx, result.token);

  logger.userAction('login', telegramUser.id, { username: telegramUser.username });

  await safeReply(
    ctx,
    `✅ Добро пожаловать, ${result.user.firstName || result.user.username}!`
  );
}

/**
 * Example: Create shop
 */
export async function handleCreateShop(ctx) {
  const token = getToken(ctx);
  const shopName = ctx.session.shopName; // From previous step

  const result = await handleApiCall(
    ctx,
    async () => await shopsApi.create(token, {
      name: shopName,
      description: 'Мой новый магазин',
      currency: 'BTC'
    }),
    'Shop creation error'
  );

  if (!result) return;

  logger.userAction('create_shop', ctx.from.id, { shopId: result.id });

  await safeReply(
    ctx,
    `🎉 Магазин "${result.name}" успешно создан!\n\n` +
    `ID: ${result.id}\n` +
    `Статус: ${result.isActive ? 'Активен' : 'Неактивен'}`
  );
}

/**
 * Example: List my shops
 */
export async function handleMyShops(ctx) {
  const token = getToken(ctx);

  const result = await handleApiCall(
    ctx,
    async () => await shopsApi.getMyShops(token),
    'Failed to load shops'
  );

  if (!result) return;

  if (result.length === 0) {
    await safeReply(ctx, '📭 У вас пока нет магазинов.');
    return;
  }

  const shopsList = result.map(shop =>
    `🏪 ${shop.name}\n` +
    `   ID: ${shop.id}\n` +
    `   Статус: ${shop.isActive ? '✅ Активен' : '⏸️ Неактивен'}\n` +
    `   Подписчиков: ${shop.subscribersCount || 0}`
  ).join('\n\n');

  await safeReply(ctx, `📦 Ваши магазины:\n\n${shopsList}`);
}

/**
 * Example: Add product
 */
export async function handleAddProduct(ctx) {
  const token = getToken(ctx);
  const productData = ctx.session.productData; // Collected from user input

  const result = await handleApiCall(
    ctx,
    async () => await productsApi.create(token, {
      shopId: productData.shopId,
      name: productData.name,
      description: productData.description,
      price: parseFloat(productData.price),
      stock: parseInt(productData.stock),
      imageUrl: productData.imageUrl
    }),
    'Product creation error'
  );

  if (!result) return;

  logger.userAction('add_product', ctx.from.id, { productId: result.id });

  await safeReply(
    ctx,
    `✅ Товар "${result.name}" добавлен!\n\n` +
    `💰 Цена: ${result.price} ${result.currency}\n` +
    `📦 В наличии: ${result.stock} шт.`
  );
}

/**
 * Example: List products
 */
export async function handleListProducts(ctx, shopId) {
  const result = await handleApiCall(
    ctx,
    async () => await productsApi.list({ shopId, inStock: true }),
    'Failed to load products'
  );

  if (!result) return;

  if (result.products.length === 0) {
    await safeReply(ctx, '📭 В магазине пока нет товаров.');
    return;
  }

  const productsList = result.products.map(product =>
    `📦 ${product.name}\n` +
    `   💰 ${product.price} ${product.currency}\n` +
    `   📊 В наличии: ${product.stock} шт.`
  ).join('\n\n');

  await safeReply(
    ctx,
    `🛍️ Товары (${result.total}):\n\n${productsList}\n\n` +
    `Страница ${result.page} из ${Math.ceil(result.total / result.limit)}`
  );
}

/**
 * Example: Create order
 */
export async function handleCreateOrder(ctx) {
  const token = getToken(ctx);
  const cartItems = ctx.session.cart; // Cart items from session

  const result = await handleApiCall(
    ctx,
    async () => await ordersApi.create(token, {
      shopId: cartItems[0].shopId,
      items: cartItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price
      })),
      shippingAddress: ctx.session.shippingAddress,
      paymentMethod: 'BTC'
    }),
    'Order creation error'
  );

  if (!result) return;

  logger.userAction('create_order', ctx.from.id, { orderId: result.id });

  await safeReply(
    ctx,
    `✅ Заказ #${result.id} создан!\n\n` +
    `💰 Сумма: ${result.totalAmount} BTC\n` +
    `📦 Товаров: ${result.items.length}\n\n` +
    `Отправьте ${result.totalAmount} BTC на адрес:\n` +
    `\`${result.paymentAddress}\``
  );
}

/**
 * Example: Subscribe to shop
 */
export async function handleSubscribe(ctx, shopId) {
  const token = getToken(ctx);

  const result = await handleApiCall(
    ctx,
    async () => await subscriptionsApi.subscribe(token, shopId),
    'Subscription error'
  );

  if (!result) return;

  logger.userAction('subscribe', ctx.from.id, { shopId });

  await safeReply(
    ctx,
    `✅ Вы подписались на магазин!\n\n` +
    `Теперь вы будете получать уведомления о новых товарах.`
  );
}

/**
 * Example: Check subscription status
 */
export async function handleCheckSubscription(ctx, shopId) {
  const token = getToken(ctx);

  const result = await handleApiCall(
    ctx,
    async () => await subscriptionsApi.checkSubscription(token, shopId),
    'Failed to check subscription'
  );

  if (!result) return;

  const status = result.isSubscribed
    ? '✅ Вы подписаны на этот магазин'
    : '❌ Вы не подписаны на этот магазин';

  await safeReply(ctx, status);
}

/**
 * Example: Verify payment
 */
export async function handleVerifyPayment(ctx, orderId, txHash) {
  const token = getToken(ctx);

  await safeReply(ctx, '🔍 Проверяю платеж...');

  const result = await handleApiCall(
    ctx,
    async () => await paymentsApi.verify(token, orderId, txHash, 'BTC'),
    'Payment verification error'
  );

  if (!result) return;

  logger.userAction('verify_payment', ctx.from.id, { orderId, txHash });

  if (result.verified) {
    await safeReply(
      ctx,
      `✅ Платеж подтвержден!\n\n` +
      `Сумма: ${result.amount} BTC\n` +
      `Статус заказа обновлен.`
    );
  } else {
    await safeReply(
      ctx,
      `⏳ Платеж еще не подтвержден.\n\n` +
      `Требуется подтверждений: ${result.confirmationsRequired}\n` +
      `Получено: ${result.confirmations}`
    );
  }
}

/**
 * Example: Update order status (seller)
 */
export async function handleUpdateOrderStatus(ctx, orderId, newStatus) {
  const token = getToken(ctx);

  const result = await handleApiCall(
    ctx,
    async () => await ordersApi.updateStatus(token, orderId, newStatus),
    'Failed to update order status'
  );

  if (!result) return;

  logger.userAction('update_order_status', ctx.from.id, { orderId, status: newStatus });

  const statusEmoji = {
    processing: '⚙️',
    shipped: '🚚',
    completed: '✅',
    cancelled: '❌'
  };

  await safeReply(
    ctx,
    `${statusEmoji[newStatus] || '📋'} Статус заказа #${orderId} обновлен на "${newStatus}"`
  );
}

/**
 * Example: Get my orders with filters
 */
export async function handleMyOrders(ctx, status = null) {
  const token = getToken(ctx);

  const result = await handleApiCall(
    ctx,
    async () => await ordersApi.getMyOrders(token, { status, limit: 10 }),
    'Failed to load orders'
  );

  if (!result) return;

  if (result.orders.length === 0) {
    await safeReply(ctx, '📭 У вас пока нет заказов.');
    return;
  }

  const ordersList = result.orders.map(order =>
    `📦 Заказ #${order.id}\n` +
    `   Магазин: ${order.shopName}\n` +
    `   Сумма: ${order.totalAmount} ${order.currency}\n` +
    `   Статус: ${order.status}\n` +
    `   Дата: ${new Date(order.createdAt).toLocaleDateString('ru-RU')}`
  ).join('\n\n');

  await safeReply(
    ctx,
    `📋 Ваши заказы (${result.total}):\n\n${ordersList}\n\n` +
    `Страница ${result.page} из ${Math.ceil(result.total / result.limit)}`
  );
}
