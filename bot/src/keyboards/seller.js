import { Markup } from 'telegraf';
import config from '../config/index.js';

// Seller menu (with active shop)
export const sellerMenu = (shopName) => Markup.inlineKeyboard([
  [Markup.button.callback('➕ Добавить товар', 'seller:add_product')],
  [Markup.button.webApp('📦 Мои товары', `${config.webAppUrl}/products`)],
  [Markup.button.webApp('💰 Продажи', `${config.webAppUrl}/sales`)],
  [Markup.button.webApp('📱 Приложение', config.webAppUrl)],
  [Markup.button.callback('« Назад', 'main_menu')]
]);

// Seller menu (no shop - need registration)
export const sellerMenuNoShop = Markup.inlineKeyboard([
  [Markup.button.callback('➕ Создать магазин', 'seller:create_shop')],
  [Markup.button.callback('« Назад', 'main_menu')]
]);

// Currency selection for shop registration
export const currencyKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('₿ BTC', 'currency:BTC'),
    Markup.button.callback('Ξ ETH', 'currency:ETH')
  ],
  [
    Markup.button.callback('₮ USDT', 'currency:USDT'),
    Markup.button.callback('Ł LTC', 'currency:LTC')
  ],
  [Markup.button.callback('« Отменить', 'cancel_scene')]
]);

// Product currency selection
export const productCurrencyKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('₿ BTC', 'product_currency:BTC'),
    Markup.button.callback('Ξ ETH', 'product_currency:ETH')
  ],
  [
    Markup.button.callback('₮ USDT', 'product_currency:USDT'),
    Markup.button.callback('Ł LTC', 'product_currency:LTC')
  ],
  [Markup.button.callback('« Отменить', 'cancel_scene')]
]);
