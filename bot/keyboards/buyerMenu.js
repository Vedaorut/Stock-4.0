import { Markup } from 'telegraf';

// Buyer main menu
export function buyerMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔍 Найти магазин', 'search_shop')],
    [Markup.button.callback('⭐️ Мои подписки', 'my_subscriptions')],
    [Markup.button.callback('📦 Мои заказы', 'buyer_orders')],
    [Markup.button.callback('🌐 Открыть веб-приложение', 'open_webapp_buyer')],
    [Markup.button.callback('⬅️ Главное меню', 'back_to_main')],
  ]);
}

// Shop detail for buyer
export function shopDetailKeyboard(shopId, isSubscribed = false) {
  const buttons = [];

  if (isSubscribed) {
    buttons.push([Markup.button.callback('🔕 Отписаться', `unsubscribe_${shopId}`)]);
  } else {
    buttons.push([Markup.button.callback('⭐️ Подписаться', `subscribe_${shopId}`)]);
  }

  buttons.push([Markup.button.callback('🛍 Товары магазина', `browse_products_${shopId}`)]);
  buttons.push([Markup.button.callback('🌐 Открыть в веб-приложении', `open_shop_webapp_${shopId}`)]);
  buttons.push([Markup.button.callback('⬅️ Назад', 'buyer_menu')]);

  return Markup.inlineKeyboard(buttons);
}

// Subscriptions list keyboard
export function subscriptionsListKeyboard(subscriptions) {
  if (subscriptions.length === 0) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Найти магазин', 'search_shop')],
      [Markup.button.callback('⬅️ Назад', 'buyer_menu')],
    ]);
  }

  const buttons = subscriptions.map((sub) => [
    Markup.button.callback(`🏪 ${sub.shop.name}`, `view_shop_${sub.shop.id}`),
  ]);

  buttons.push([Markup.button.callback('🔍 Найти еще', 'search_shop')]);
  buttons.push([Markup.button.callback('⬅️ Назад', 'buyer_menu')]);

  return Markup.inlineKeyboard(buttons);
}

// Product browse keyboard for buyer
export function browseProductsKeyboard(products, shopId) {
  if (products.length === 0) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Назад к магазину', `view_shop_${shopId}`)],
    ]);
  }

  const buttons = products.map((product) => [
    Markup.button.callback(
      `${product.name} - $${product.price}`,
      `view_product_${product.id}`
    ),
  ]);

  buttons.push([Markup.button.callback('⬅️ Назад к магазину', `view_shop_${shopId}`)]);

  return Markup.inlineKeyboard(buttons);
}

// Product view keyboard for buyer
export function viewProductKeyboard(productId, shopId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🛒 Заказать', `order_product_${productId}`)],
    [Markup.button.callback('⬅️ Назад к товарам', `browse_products_${shopId}`)],
  ]);
}

// Buyer orders menu
export function buyerOrdersMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🆕 Активные', 'buyer_orders_active')],
    [Markup.button.callback('✅ Завершенные', 'buyer_orders_completed')],
    [Markup.button.callback('❌ Отмененные', 'buyer_orders_cancelled')],
    [Markup.button.callback('⬅️ Назад', 'buyer_menu')],
  ]);
}

// Buyer order detail keyboard
export function buyerOrderDetailKeyboard(orderId, currentStatus) {
  const buttons = [];

  if (currentStatus === 'new' || currentStatus === 'processing') {
    buttons.push([Markup.button.callback('❌ Отменить заказ', `cancel_order_${orderId}`)]);
  }

  if (currentStatus === 'shipped') {
    buttons.push([Markup.button.callback('✅ Подтвердить получение', `confirm_delivery_${orderId}`)]);
  }

  buttons.push([Markup.button.callback('💬 Связаться с продавцом', `contact_seller_${orderId}`)]);
  buttons.push([Markup.button.callback('⬅️ Назад к заказам', 'buyer_orders')]);

  return Markup.inlineKeyboard(buttons);
}

// Search result keyboard
export function searchResultKeyboard(shops) {
  if (shops.length === 0) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Искать снова', 'search_shop')],
      [Markup.button.callback('⬅️ Назад', 'buyer_menu')],
    ]);
  }

  const buttons = shops.map((shop) => [
    Markup.button.callback(`🏪 ${shop.name}`, `view_shop_${shop.id}`),
  ]);

  buttons.push([Markup.button.callback('🔍 Искать снова', 'search_shop')]);
  buttons.push([Markup.button.callback('⬅️ Назад', 'buyer_menu')]);

  return Markup.inlineKeyboard(buttons);
}

// Back to buyer menu
export function backToBuyerMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад в меню покупателя', 'buyer_menu')],
  ]);
}
