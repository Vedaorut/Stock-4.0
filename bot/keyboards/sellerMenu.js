import { Markup } from 'telegraf';

// Seller main menu
export function sellerMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏪 Мой магазин', 'my_shop')],
    [Markup.button.callback('➕ Добавить товар', 'add_product')],
    [Markup.button.callback('📦 Мои заказы', 'my_orders')],
    [Markup.button.callback('🌐 Открыть веб-приложение', 'open_webapp_seller')],
    [Markup.button.callback('⬅️ Главное меню', 'back_to_main')],
  ]);
}

// Shop management menu
export function shopManagementKeyboard(shopId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📝 Изменить название', `edit_shop_name_${shopId}`)],
    [Markup.button.callback('📋 Список товаров', `shop_products_${shopId}`)],
    [Markup.button.callback('➕ Добавить товар', 'add_product')],
    [Markup.button.callback('📊 Статистика', `shop_stats_${shopId}`)],
    [Markup.button.callback('⬅️ Назад', 'seller_menu')],
  ]);
}

// Product list keyboard
export function productListKeyboard(products) {
  const buttons = products.map((product) => [
    Markup.button.callback(
      `${product.name} - $${product.price}`,
      `product_detail_${product.id}`
    ),
  ]);

  buttons.push([Markup.button.callback('➕ Добавить товар', 'add_product')]);
  buttons.push([Markup.button.callback('⬅️ Назад', 'my_shop')]);

  return Markup.inlineKeyboard(buttons);
}

// Product detail menu
export function productDetailKeyboard(productId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Изменить', `edit_product_${productId}`)],
    [Markup.button.callback('🗑 Удалить', `delete_product_${productId}`)],
    [Markup.button.callback('⬅️ Назад к товарам', 'back_to_products')],
  ]);
}

// Edit product menu
export function editProductKeyboard(productId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📝 Название', `edit_product_name_${productId}`)],
    [Markup.button.callback('📄 Описание', `edit_product_desc_${productId}`)],
    [Markup.button.callback('💰 Цена', `edit_product_price_${productId}`)],
    [Markup.button.callback('📦 Количество', `edit_product_stock_${productId}`)],
    [Markup.button.callback('🖼 Изображение', `edit_product_image_${productId}`)],
    [Markup.button.callback('⬅️ Назад', `product_detail_${productId}`)],
  ]);
}

// Orders menu
export function ordersMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🆕 Новые заказы', 'orders_new')],
    [Markup.button.callback('📦 В обработке', 'orders_processing')],
    [Markup.button.callback('✅ Завершенные', 'orders_completed')],
    [Markup.button.callback('❌ Отмененные', 'orders_cancelled')],
    [Markup.button.callback('⬅️ Назад', 'seller_menu')],
  ]);
}

// Order detail menu
export function orderDetailKeyboard(orderId, currentStatus) {
  const buttons = [];

  if (currentStatus === 'new') {
    buttons.push([Markup.button.callback('✅ Принять заказ', `order_accept_${orderId}`)]);
    buttons.push([Markup.button.callback('❌ Отклонить', `order_reject_${orderId}`)]);
  } else if (currentStatus === 'processing') {
    buttons.push([Markup.button.callback('📦 Отправлен', `order_shipped_${orderId}`)]);
  } else if (currentStatus === 'shipped') {
    buttons.push([Markup.button.callback('✅ Завершить', `order_complete_${orderId}`)]);
  }

  buttons.push([Markup.button.callback('💬 Связаться с покупателем', `contact_buyer_${orderId}`)]);
  buttons.push([Markup.button.callback('⬅️ Назад к заказам', 'my_orders')]);

  return Markup.inlineKeyboard(buttons);
}

// Create shop flow - payment keyboard
export function paymentInstructionsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Я оплатил', 'payment_confirm')],
    [Markup.button.callback('❌ Отмена', 'cancel_shop_creation')],
  ]);
}

// Create shop - verify payment keyboard
export function verifyPaymentKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Проверить платеж', 'verify_payment')],
    [Markup.button.callback('❌ Отмена', 'cancel_shop_creation')],
  ]);
}

// Back to seller menu
export function backToSellerMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад в меню продавца', 'seller_menu')],
  ]);
}
