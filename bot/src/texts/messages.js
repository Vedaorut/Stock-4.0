/**
 * messages.js - Compatibility Layer
 *
 * This file provides backward compatibility for existing code while
 * the i18n migration is in progress.
 *
 * NEW CODE should use:
 * - ctx.t('key.path') in handlers
 * - t('key.path', params, lang) in keyboards/utilities
 *
 * OLD CODE can continue using:
 * - messages.buyer.panel
 * - buttons.openCatalog
 * - formatters.shopList(...)
 */

import { escapeHtml } from '../utils/format.js';
import { t, withLang } from '../i18n/index.js';

const safe = (value) => escapeHtml(String(value ?? ''));

// Buttons - proxy to i18n
const buildButtons = () => ({
  openCatalog: t('buttons.openCatalog'),
  findShop: t('buttons.findShop'),
  mySubscriptions: t('buttons.mySubscriptions'),
  myOrders: t('buttons.myOrders'),
  switchRole: t('buttons.switchRole'),
  createShop: t('buttons.createShop'),
  buyerRole: t('buttons.buyerRole'),
  sellerRole: t('buttons.sellerRole'),
  workspace: t('buttons.workspace'),
  subscribe: t('buttons.subscribe'),
  subscribed: t('buttons.subscribed'),
  unsubscribe: t('buttons.unsubscribe'),
  stockSection: t('buttons.stockSection'),
  preorderSection: t('buttons.preorderSection'),
  aboutShop: t('buttons.aboutShop'),
  back: t('buttons.back'),
  myShop: t('buttons.myShop'),
  addProduct: t('buttons.addProduct'),
  manageSubscription: t('buttons.manageSubscription'),
  tools: t('buttons.tools'),
  manageWallets: t('buttons.manageWallets'),
  manageFollows: t('buttons.manageFollows'),
  manageWorkers: t('buttons.manageWorkers'),
  viewSales: t('buttons.viewSales'),
  activeOrders: t('buttons.activeOrders'),
  orderHistory: t('buttons.orderHistory'),
  backToSeller: t('buttons.backToSeller'),
  backToBuyer: t('buttons.backToBuyer'),
  confirm: t('buttons.confirm'),
  cancel: t('buttons.cancel'),
  yes: t('buttons.yes'),
  no: t('buttons.no'),
  upgradeToPro: t('buttons.upgradeToPro'),
  upgradeToMax: t('buttons.upgradeToMax'),
  paySubscription: t('buttons.paySubscription'),
  contactSeller: t('buttons.contactSeller'),
  editMarkup: t('buttons.editMarkup'),
  changeMode: t('buttons.changeMode'),
  delete: t('buttons.delete'),
  addWorker: t('buttons.addWorker'),
  listWorkers: t('buttons.listWorkers'),
  addFollow: t('buttons.addFollow'),
  addFollowMore: t('buttons.addFollowMore'),
  addWallet: t('buttons.addWallet'),
  backToWallets: t('buttons.backToWallets'),
  backToFollows: t('buttons.backToFollows'),
  backSimple: t('buttons.backSimple'),
  followSettings: t('buttons.followSettings'),
  backToTools: t('buttons.backToTools'),
  changeChannel: t('buttons.changeChannel'),
  goToTools: t('buttons.goToTools'),
  migrationConfirm: t('buttons.migrationConfirm'),
  sendNotifications: t('buttons.sendNotifications'),
  modeMonitor: t('buttons.modeMonitor'),
  modeResell: t('buttons.modeResell'),
  tierPro: t('buttons.tierPro'),
  tierMax: t('buttons.tierMax'),
  cryptoBTC: t('buttons.cryptoBTC'),
  cryptoETH: t('buttons.cryptoETH'),
  cryptoUSDT: t('buttons.cryptoUSDT'),
  cryptoLTC: t('buttons.cryptoLTC'),
  retry: t('buttons.retry'),
  refresh: t('buttons.refresh'),
  viewQr: t('buttons.viewQr'),
  changeWallet: t('buttons.changeWallet'),
  deleteWallet: t('buttons.deleteWallet'),
  mainMenu: t('buttons.mainMenu'),
  promoCode: t('buttons.promoCode'),
  backToMenu: t('buttons.backToMenu'),
});

export const buttons = buildButtons();

export function getButtons(lang = 'ru') {
  if (lang === 'ru') return buttons;
  return withLang(lang, buildButtons);
}

// Messages - proxy to i18n with function wrappers for parameterized messages
const buildMessages = () => ({
  start: {
    welcome: (lang = 'ru') => t('start.welcome', {}, lang),
  },
  general: {
    welcomeDetailed: (lang = 'ru') => t('general.welcomeDetailed', {}, lang),
    actionFailed: (lang = 'ru') => t('general.actionFailed', {}, lang),
    authorizationRequired: (lang = 'ru') => t('general.authorizationRequired', {}, lang),
    shopRequired: (lang = 'ru') => t('general.shopRequired', {}, lang),
    featureAfterShop: (lang = 'ru') => t('general.featureAfterShop', {}, lang),
    done: (lang = 'ru') => t('general.done', {}, lang),
    processing: (subject, lang = 'ru') => t('general.processing', { subject: safe(subject) }, lang),
    invalidChoice: (lang = 'ru') => t('general.invalidChoice', {}, lang),
    restartRequired: (lang = 'ru') => t('general.restartRequired', {}, lang),
  },
  buyer: {
    searchContext: (lang = 'ru') => t('buyer.searchContext', {}, lang),
    ordersContext: (lang = 'ru') => t('buyer.ordersContext', {}, lang),
    cartContext: (lang = 'ru') => t('buyer.cartContext', {}, lang),
    panel: (lang = 'ru') => t('buyer.panel', {}, lang),
    noSubscriptions: (lang = 'ru') => t('buyer.noSubscriptions', {}, lang),
    listSubscriptionsTitle: (count, lang = 'ru') => t('buyer.listSubscriptionsTitle', { count }, lang),
    ordersTitle: (count, lang = 'ru') => t('buyer.ordersTitle', { count }, lang),
    ordersEmpty: (lang = 'ru') => t('buyer.ordersEmpty', {}, lang),
    orderLine: ({ shop, status, price }, lang = 'ru') =>
      t('buyer.orderLine', { shop: safe(shop), status: safe(status), price: safe(price) }, lang),
    searchPrompt: (lang = 'ru') => t('buyer.searchPrompt', {}, lang),
    searching: (lang = 'ru') => t('buyer.searching', {}, lang),
    searchNoResults: (lang = 'ru') => t('buyer.searchNoResults', {}, lang),
    searchResultsTitle: (count, lang = 'ru') => t('buyer.searchResultsTitle', { count }, lang),
    subscriptionActive: (lang = 'ru') => t('buyer.subscriptionActive', {}, lang),
    subscriptionAdded: (shop, lang = 'ru') => t('buyer.subscriptionAdded', { shop: safe(shop) }, lang),
    subscriptionRemoved: (shop, lang = 'ru') => t('buyer.subscriptionRemoved', { shop: safe(shop) }, lang),
    subscriptionLimit: (lang = 'ru') => t('buyer.subscriptionLimit', {}, lang),
    subscriptionAlreadyToast: (lang = 'ru') => t('buyer.subscriptionAlreadyToast', {}, lang),
    subscriptionOwnShop: (lang = 'ru') => t('buyer.subscriptionOwnShop', {}, lang),
    subscriptionError: (lang = 'ru') => t('buyer.subscriptionError', {}, lang),
    unsubscribeError: (lang = 'ru') => t('buyer.unsubscribeError', {}, lang),
    stockSectionTitle: (shop, count, lang = 'ru') => t('buyer.stockSectionTitle', { shop: safe(shop), count }, lang),
    stockSectionEmpty: (shop, lang = 'ru') => t('buyer.stockSectionEmpty', { shop: safe(shop) }, lang),
    preorderSectionTitle: (shop, count, lang = 'ru') =>
      t('buyer.preorderSectionTitle', { shop: safe(shop), count }, lang),
    preorderSectionEmpty: (shop, lang = 'ru') => t('buyer.preorderSectionEmpty', { shop: safe(shop) }, lang),
  },
  buyerButtons: {
    preorderContact: (lang = 'ru') => t('buyer.preorderContact', {}, lang),
    preorderClose: (lang = 'ru') => t('buyer.preorderClose', {}, lang),
  },
  seller: {
    panel: (lang = 'ru') => t('seller.panel', {}, lang),
    shopPanel: (shop, lang = 'ru') => t('seller.shopPanel', { shop: safe(shop) }, lang),
    shopPanelWithStats: (shop, revenue, activeOrders, statusBar = null, lang = 'ru') => {
      const lines = [];

      // Shop name first
      lines.push(safe(shop));
      lines.push('');

      // Revenue line with "last 7 days" context
      const formattedRevenue =
        revenue > 0
          ? `$${Number(revenue).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
          : '$0';
      lines.push(t('stats.revenue7days', { amount: formattedRevenue }, lang));

      lines.push('');

      // Active orders on separate line
      const ordersText = (() => {
        if (activeOrders <= 0) {
          return t('formatters.ordersActiveNone', {}, lang);
        }

        const mod10 = activeOrders % 10;
        const mod100 = activeOrders % 100;
        if (mod10 === 1 && mod100 !== 11) {
          return t('formatters.ordersActive1', { count: activeOrders }, lang);
        }
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
          return t('formatters.ordersActive24', { count: activeOrders }, lang);
        }
        return t('formatters.ordersActive5', { count: activeOrders }, lang);
      })();
      lines.push(t('stats.activeOrders', { orders: ordersText }, lang));

      // Status bar (warning/tip) at the bottom with visual separation
      if (statusBar) {
        lines.push('');
        lines.push(`${safe(statusBar)}`);
      }

      return lines.join('\n');
    },
    noShop: (lang = 'ru') => t('seller.noShop', {}, lang),
    noWorkers: (shop, lang = 'ru') => t('seller.noWorkers', { shop: safe(shop) }, lang),
    workersListTitle: (shop, lang = 'ru') => t('seller.workersListTitle', { shop: safe(shop) }, lang),
    workersListInstruction: (lang = 'ru') => t('seller.workersListInstruction', {}, lang),
    workersMenuIntro: (shop, lang = 'ru') => t('seller.workersMenuIntro', { shop: safe(shop) }, lang),
    workersProOnly: (lang = 'ru') => t('seller.workersProOnly', {}, lang),
    workersMaxOnly: (lang = 'ru') => t('seller.workersMaxOnly', {}, lang),
    workersOwnerOnly: (lang = 'ru') => t('seller.workersOwnerOnly', {}, lang),
    workerAdded: (name, lang = 'ru') => t('seller.workerAdded', { name: safe(name) }, lang),
    workerRemoved: (lang = 'ru') => t('seller.workerRemoved', {}, lang),
    workerPrompt: (lang = 'ru') => t('seller.workerPrompt', {}, lang),
    workerIdInvalid: (lang = 'ru') => t('seller.workerIdInvalid', {}, lang),
    workerAdding: (lang = 'ru') => t('seller.workerAdding', {}, lang),
    workerAddError: (lang = 'ru') => t('seller.workerAddError', {}, lang),
    workerAddNotFound: (lang = 'ru') => t('seller.workerAddNotFound', {}, lang),
    workerAddAlready: (lang = 'ru') => t('seller.workerAddAlready', {}, lang),
    workerAddOwner: (lang = 'ru') => t('seller.workerAddOwner', {}, lang),
    workerLookupError: (lang = 'ru') => t('seller.workerLookupError', {}, lang),
    workerUsernameInvalid: (lang = 'ru') => t('seller.workerUsernameInvalid', {}, lang),
    workersProSubscriptionRequired: (lang = 'ru') => t('seller.workersProSubscriptionRequired', {}, lang),
    migration: {
      intro: (lang = 'ru') => t('migration.intro', {}, lang),
      confirmPrompt: (lang = 'ru') => t('migration.confirmPrompt', {}, lang),
      askChannel: (lang = 'ru') => t('migration.askChannel', {}, lang),
      invalidChannel: (lang = 'ru') => t('migration.invalidChannel', {}, lang),
      channelAccessError: (lang = 'ru') => t('migration.channelAccessError', {}, lang),
      confirmation: ({ shopName, channel, buyersCount }, lang = 'ru') =>
        t('migration.confirmation', {
          shopName: safe(shopName),
          channel: safe(channel),
          buyersCount: safe(buyersCount),
        }, lang),
      sending: (lang = 'ru') => t('migration.sending', {}, lang),
      success: ({ channel, buyersCount }, lang = 'ru') =>
        t('migration.success', { channel: safe(channel), buyersCount: safe(buyersCount) }, lang),
      error: (lang = 'ru') => t('migration.error', {}, lang),
      accessDenied: (lang = 'ru') => t('migration.accessDenied', {}, lang),
      cancelled: (lang = 'ru') => t('migration.cancelled', {}, lang),
    },
    workerSelectionInvalid: (lang = 'ru') => t('seller.workerSelectionInvalid', {}, lang),
    workerNotFound: (lang = 'ru') => t('seller.workerNotFound', {}, lang),
    workerRemoveConfirm: (name, lang = 'ru') => t('seller.workerRemoveConfirm', { name: safe(name) }, lang),
    workerRemoveError: (lang = 'ru') => t('seller.workerRemoveError', {}, lang),
    addProductNamePrompt: (lang = 'ru') => t('seller.addProductNamePrompt', {}, lang),
    addProductPricePrompt: (lang = 'ru') => t('seller.addProductPricePrompt', {}, lang),
    addProductPriceInvalid: (lang = 'ru') => t('seller.addProductPriceInvalid', {}, lang),
    addProductSaving: (lang = 'ru') => t('seller.addProductSaving', {}, lang),
    addProductSuccess: (name, price, lang = 'ru') =>
      t('seller.addProductSuccess', { name: safe(name), price: safe(price) }, lang),
    addProductError: (lang = 'ru') => t('seller.addProductError', {}, lang),
    toolsIntro: (lang = 'ru') => t('seller.toolsIntro', {}, lang),
    toolsError: (lang = 'ru') => t('seller.toolsError', {}, lang),
    createShopNamePrompt: (lang = 'ru') => t('seller.createShopNamePrompt', {}, lang),
    createShopNameHint: (lang = 'ru') => t('seller.createShopNameHint', {}, lang),
    createShopNameInvalidLength: (lang = 'ru') => t('seller.createShopNameInvalidLength', {}, lang),
    createShopNameInvalidChars: (lang = 'ru') => t('seller.createShopNameInvalidChars', {}, lang),
    createShopNameTaken: (lang = 'ru') => t('seller.createShopNameTaken', {}, lang),
    createShopPromoPrompt: (lang = 'ru') => t('seller.createShopPromoPrompt', {}, lang),
    createShopSaving: (lang = 'ru') => t('seller.createShopSaving', {}, lang),
    createShopSuccess: (name, tier, lang = 'ru') =>
      t('seller.createShopSuccess', { name: safe(name), tier: safe(tier) }, lang),
    createShopPromoSuccess: (name, lang = 'ru') => t('seller.createShopPromoSuccess', { name: safe(name) }, lang),
    createShopError: (lang = 'ru') => t('seller.createShopError', {}, lang),
    walletsIntroEmpty: (lang = 'ru') => t('seller.walletsIntroEmpty', {}, lang),
    walletsIntroList: (list, lang = 'ru') => t('seller.walletsIntroList', { list: safe(list) }, lang),
    walletsChoosePrompt: (lang = 'ru') => t('seller.walletsChoosePrompt', {}, lang),
    walletsPromptReplace: (crypto, example, lang = 'ru') =>
      t('seller.walletsPromptReplace', { crypto: safe(crypto), example: safe(example) }, lang),
    walletsAddPrompt: (lang = 'ru') => t('seller.walletsAddPrompt', {}, lang),
    walletsAddPromptSpecific: (crypto, lang = 'ru') => {
      const examples = {
        BTC: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        ETH: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        USDT: 'TQamF8rf8CuCBcrS85trYW23MsKJc2FMJr',
        LTC: 'ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxmhkny',
      };
      return t('seller.walletsAddPromptSpecific', {
        crypto: safe(crypto),
        example: safe(examples[crypto] || ''),
      }, lang);
    },
    walletsUnknownAddress: (lang = 'ru') => t('seller.walletsUnknownAddress', {}, lang),
    walletsInvalidAddress: (crypto, lang = 'ru') => t('seller.walletsInvalidAddress', { crypto: safe(crypto) }, lang),
    walletsSaved: (crypto, lang = 'ru') => t('seller.walletsSaved', { crypto: safe(crypto) }, lang),
    walletsUpdated: (crypto, lang = 'ru') => t('seller.walletsUpdated', { crypto: safe(crypto) }, lang),
    walletsDeleted: (crypto, lang = 'ru') => t('seller.walletsDeleted', { crypto: safe(crypto) }, lang),
    walletsDeleteConfirm: (crypto, lang = 'ru') => t('seller.walletsDeleteConfirm', { crypto: safe(crypto) }, lang),
    walletsNotFound: (lang = 'ru') => t('seller.walletsNotFound', {}, lang),
    walletsLoadError: (lang = 'ru') => t('seller.walletsLoadError', {}, lang),
    walletsQrError: (lang = 'ru') => t('seller.walletsQrError', {}, lang),
    walletsUseButtons: (lang = 'ru') => t('seller.walletsUseButtons', {}, lang),
    walletsStatusEmpty: (lang = 'ru') => t('seller.walletsStatusEmpty', {}, lang),
    walletsUnknownCommand: (lang = 'ru') => t('seller.walletsUnknownCommand', {}, lang),
    paymentHashPrompt: (lang = 'ru') => t('seller.paymentHashPrompt', {}, lang),
    paymentChecking: (lang = 'ru') => t('seller.paymentChecking', {}, lang),
    paymentHashShort: (lang = 'ru') => t('seller.paymentHashShort', {}, lang),
    paymentFailed: (lang = 'ru') => t('seller.paymentFailed', {}, lang),
    subscriptionStatus: (tier, lang = 'ru') =>
      t('seller.subscriptionStatus', { tier: tier === 'max' ? 'MAX' : 'PRO' }, lang),
    subscriptionStatusLine: (status, date, lang = 'ru') => {
      const statusLabel = status === 'active' ? t('formatters.statusActive', {}, lang) : t('formatters.statusInactive', {}, lang);
      return date
        ? t('seller.subscriptionStatusLine', { status: statusLabel, date: safe(date) }, lang)
        : t('seller.subscriptionStatusLineNoDate', { status: statusLabel }, lang);
    },
    subscriptionGraceNotice: (lang = 'ru') => t('seller.subscriptionGraceNotice', {}, lang),
    subscriptionInactiveNotice: (lang = 'ru') => t('seller.subscriptionInactiveNotice', {}, lang),
    subscriptionUpgradePrompt: (lang = 'ru') => t('seller.subscriptionUpgradePrompt', {}, lang),
    subscriptionProBenefits: (lang = 'ru') => t('seller.subscriptionProBenefits', {}, lang),
    subscriptionStatusError: (lang = 'ru') => t('seller.subscriptionStatusError', {}, lang),
    upgrade: {
      alreadyPro: (lang = 'ru') => t('upgrade.alreadyPro', {}, lang),
      alreadyMax: (lang = 'ru') => t('upgrade.alreadyMax', {}, lang),
      notEligible: (lang = 'ru') => t('upgrade.notEligible', {}, lang),
      chooseCrypto: (cost, lang = 'ru') => t('upgrade.chooseCrypto', { cost }, lang),
      cancelled: (lang = 'ru') => t('upgrade.cancelled', {}, lang),
      unknownCommand: (lang = 'ru') => t('upgrade.unknownCommand', {}, lang),
      error: (msg, lang = 'ru') => t('upgrade.error', { msg: safe(msg) }, lang),
      confirmPrompt: (tier, amount, lang = 'ru') =>
        t('upgrade.confirmPrompt', { tier: safe(tier), amount: safe(amount) }, lang),
      paymentDetails: (cost, currency, address, lang = 'ru') =>
        t('upgrade.paymentDetails', {
          cost: safe(cost),
          currency: safe(currency),
          address: safe(address),
        }, lang),
      sendHashPrompt: (lang = 'ru') => t('upgrade.sendHashPrompt', {}, lang),
      hashInvalid: (lang = 'ru') => t('upgrade.hashInvalid', {}, lang),
      verifying: (lang = 'ru') => t('upgrade.verifying', {}, lang),
      success: (endDate, lang = 'ru') => t('upgrade.success', { endDate: safe(endDate) }, lang),
      benefits: (lang = 'ru') => t('upgrade.benefits', {}, lang),
      duplicateTx: (lang = 'ru') => t('upgrade.duplicateTx', {}, lang),
      verificationFailed: (lang = 'ru') => t('upgrade.verificationFailed', {}, lang),
      verificationError: (lang = 'ru') => t('upgrade.verificationError', {}, lang),
    },
    aiProducts: {
      processing: (lang = 'ru') => t('aiProducts.processing', {}, lang),
      rateLimitReached: (lang = 'ru') => t('aiProducts.rateLimitReached', {}, lang),
      operationExpired: (lang = 'ru') => t('aiProducts.operationExpired', {}, lang),
      productNotFound: (lang = 'ru') => t('aiProducts.productNotFound', {}, lang),
      productDeleted: (name, price, lang = 'ru') =>
        t('aiProducts.productDeleted', { name: safe(name), price: safe(price) }, lang),
      productDeleteError: (lang = 'ru') => t('aiProducts.productDeleteError', {}, lang),
      processingError: (lang = 'ru') => t('aiProducts.processingError', {}, lang),
      applyingChanges: (lang = 'ru') => t('aiProducts.applyingChanges', {}, lang),
      stockRequired: (lang = 'ru') => t('aiProducts.stockRequired', {}, lang),
      nameMinLength: (lang = 'ru') => t('aiProducts.nameMinLength', {}, lang),
      pricePositive: (lang = 'ru') => t('aiProducts.pricePositive', {}, lang),
      stockNotSpecified: (lang = 'ru') => t('aiProducts.stockNotSpecified', {}, lang),
      apiError: (lang = 'ru') => t('aiProducts.apiError', {}, lang),
      productsEmpty: (lang = 'ru') => t('aiProducts.productsEmpty', {}, lang),
      productsList: (count, list, lang = 'ru') => t('aiProducts.productsList', { count, list: safe(list) }, lang),
      invalidOperation: (lang = 'ru') => t('aiProducts.invalidOperation', {}, lang),
      operationNames: {
        decrease: (lang = 'ru') => t('aiProducts.operationDecrease', {}, lang),
        increase: (lang = 'ru') => t('aiProducts.operationIncrease', {}, lang),
      },
      bulkPricePrompt: (operation, percentage, preview, lang = 'ru') =>
        t('aiProducts.bulkPricePrompt', {
          operation: safe(operation),
          percentage: safe(percentage),
          preview: safe(preview),
        }, lang),
    },
    activeOrders: {
      empty: (lang = 'ru') => t('activeOrders.empty', {}, lang),
      title: (count, lang = 'ru') => t('activeOrders.title', { count }, lang),
    },
    orderHistory: {
      empty: (lang = 'ru') => t('orderHistory.empty', {}, lang),
      title: (count, lang = 'ru') => t('orderHistory.title', { count }, lang),
    },
    activeOrdersContext: (lang = 'ru') => t('seller.activeOrdersContext', {}, lang),
    activeOrdersEmpty: (lang = 'ru') => t('seller.activeOrdersEmpty', {}, lang),
    orderHistoryContext: (lang = 'ru') => t('seller.orderHistoryContext', {}, lang),
    orderHistoryEmpty: (lang = 'ru') => t('seller.orderHistoryEmpty', {}, lang),
    subscriptionProInfo: (data, lang = 'ru') => {
      const statusLabel =
        data.status === 'active' ? t('formatters.statusActive', {}, lang) : t('formatters.statusInactive', {}, lang);
      const renewDate = data.renewDate
        ? new Date(data.renewDate).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')
        : '-';
      return t('seller.subscriptionProInfo', { status: statusLabel, renewDate }, lang);
    },
    subscriptionMaxInfo: (data, lang = 'ru') => {
      const statusLabel =
        data.status === 'active' ? t('formatters.statusActive', {}, lang) : t('formatters.statusInactive', {}, lang);
      const renewDate = data.renewDate
        ? new Date(data.renewDate).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')
        : '-';
      return t('seller.subscriptionMaxInfo', { status: statusLabel, renewDate }, lang);
    },
    walletsContext: (lang = 'ru') => t('seller.walletsContext', {}, lang),
    workersContext: (lang = 'ru') => t('seller.workersContext', {}, lang),
    bulkShip: {
      prompt: (lang = 'ru') => t('bulkShip.prompt', {}, lang),
      confirmTitle: (count, lang = 'ru') => t('bulkShip.confirmTitle', { count }, lang),
      confirmList: (orders, lang = 'ru') => {
        return orders
          .map((o, i) => {
            const buyer = o.buyer_username ? `@${safe(o.buyer_username)}` : t('orders.buyerDefault', {}, lang);
            return `${i + 1}. ${buyer} - ${safe(o.product_name)} (${safe(o.quantity)}) - $${safe(o.total_price)}`;
          })
          .join('\n');
      },
      success: (count, lang = 'ru') => t('bulkShip.success', { count }, lang),
      invalidInput: (lang = 'ru') => t('bulkShip.invalidInput', {}, lang),
      invalidNumbers: (invalid, lang = 'ru') => t('bulkShip.invalidNumbers', { invalid: safe(invalid.join(', ')) }, lang),
      cancelled: (lang = 'ru') => t('bulkShip.cancelled', {}, lang),
    },
  },
  follows: {
    contextDetailed: (lang = 'ru') => t('follows.contextDetailed', {}, lang),
    createModePromptDetailed: (shopName, lang = 'ru') =>
      t('follows.createModePromptDetailed', { shopName: safe(shopName) }, lang),
    emptyState: (lang = 'ru') => t('follows.emptyState', {}, lang),
    listHeader: (count, lang = 'ru') => t('follows.listHeader', { count: count ? ` (${count})` : '' }, lang),
    listTitle: (count, lang = 'ru') => t('follows.listTitle', { count }, lang),
    listEmpty: (lang = 'ru') => t('follows.listEmpty', {}, lang),
    listItem: ({ index, name, mode, markupType, markupPercentage, markupFixed }, lang = 'ru') => {
      let suffix = '';
      if (mode === 'resell') {
        if (markupType === 'fixed' && Number.isFinite(markupFixed) && markupFixed > 0) {
          suffix = `, +$${Number(markupFixed).toFixed(0)}`;
        } else if (Number.isFinite(markupPercentage) && markupPercentage > 0) {
          suffix = `, +${Number(markupPercentage).toFixed(0)}%`;
        }
      }
      const modeText = mode === 'resell' ? t('formatters.modeResell', {}, lang) : t('formatters.modeMonitor', {}, lang);
      return `${index}. ${safe(name)} (${modeText}${suffix})`;
    },
    listManageHint: (lang = 'ru') => t('follows.listManageHint', {}, lang),
    listTitle2: (lang = 'ru') => t('follows.listTitle', {}, lang),
    detail: (
      { name, mode, markupType, markupPercentage, markupFixed, sourceProducts = 0, syncedProducts = 0 },
      lang = 'ru'
    ) => {
      const isResell = mode === 'resell';
      let markupValue = '-';
      if (isResell) {
        if (markupType === 'fixed') {
          markupValue = `+$${Number(markupFixed ?? 0).toFixed(0)}`;
        } else {
          markupValue = `${Number(markupPercentage ?? 0).toFixed(0)}%`;
        }
      }
      const modeLabel = isResell
        ? t('formatters.modeResell', {}, lang)
        : t('formatters.modeMonitor', {}, lang);

      const lines = [
        `${t('formatters.followShop', {}, lang)}: ${safe(name)}`,
        `${t('formatters.followMode', {}, lang)}: ${modeLabel}`,
        `${t('formatters.followMarkup', {}, lang)}: ${markupValue}`,
        `${t('formatters.followProducts', {}, lang)}: ${sourceProducts}`,
        `${t('formatters.followCopied', {}, lang)}: ${syncedProducts}`,
      ];

      return lines.join('\n');
    },
    topMonitorTitle: (count, total, lang = 'ru') => {
      const suffix = total && total > count ? ` (${count}/${total})` : count ? ` (${count})` : '';
      return t('follows.topMonitorTitle', { suffix }, lang);
    },
    topResellTitle: (count, total, lang = 'ru') => {
      const suffix = total && total > count ? ` (${count}/${total})` : count ? ` (${count})` : '';
      return t('follows.topResellTitle', { suffix }, lang);
    },
    monitorProductsEmpty: (lang = 'ru') => t('follows.monitorProductsEmpty', {}, lang),
    resellProductsEmpty: (lang = 'ru') => t('follows.resellProductsEmpty', {}, lang),
    monitorProductLine: ({ index, name, price, stock }, _lang = 'ru') => {
      const stockText = Number.isFinite(stock) ? `${safe(stock)} pcs` : '-';
      return `${safe(index)}. ${safe(name)} - ${safe(price)} (${stockText})`;
    },
    resellProductLine: ({ index, name, sourcePrice, syncedPrice, diff }, _lang = 'ru') => {
      const diffText =
        diff > 0 ? ` (+${safe(diff)})` : diff < 0 ? ` (-${safe(Math.abs(diff))})` : '';
      return `${safe(index)}. ${safe(name)}\n   Supplier: ${safe(sourcePrice)}\n   Your: ${safe(syncedPrice)}${diffText}`;
    },
    notFound: (lang = 'ru') => t('follows.notFound', {}, lang),
    loadError: (lang = 'ru') => t('follows.loadError', {}, lang),
    accessDenied: (lang = 'ru') => t('follows.accessDenied', {}, lang),
    deleteSuccess: (lang = 'ru') => t('follows.deleteSuccess', {}, lang),
    deleteError: (lang = 'ru') => t('follows.deleteError', {}, lang),
    modeLimit: (lang = 'ru') => t('follows.modeLimit', {}, lang),
    limitReached: (lang = 'ru') => t('follows.limitReached', {}, lang),
    markupPrompt: (lang = 'ru') => t('follows.markupPrompt', {}, lang),
    markupInvalid: (lang = 'ru') => t('follows.markupInvalid', {}, lang),
    markupUpdated: (value, lang = 'ru') => t('follows.markupUpdated', { value }, lang),
    markupTypePrompt: (lang = 'ru') => t('follows.markupTypePrompt', {}, lang),
    markupTypeRequired: (lang = 'ru') => t('follows.markupTypeRequired', {}, lang),
    markupPercentagePrompt: (lang = 'ru') => t('follows.markupPercentagePrompt', {}, lang),
    markupFixedPrompt: (lang = 'ru') => t('follows.markupFixedPrompt', {}, lang),
    markupFixedInvalid: (lang = 'ru') => t('follows.markupFixedInvalid', {}, lang),
    markupFixedUpdated: (value, lang = 'ru') => t('follows.markupFixedUpdated', { value }, lang),
    modeChanged: (lang = 'ru') => t('follows.modeChanged', {}, lang),
    switchError: (lang = 'ru') => t('follows.switchError', {}, lang),
    createEnterId: (lang = 'ru') => t('follows.createEnterId', {}, lang),
    createIdInvalid: (lang = 'ru') => t('follows.createIdInvalid', {}, lang),
    createShopNotFound: (lang = 'ru') => t('follows.createShopNotFound', {}, lang),
    createCheckError: (lang = 'ru') => t('follows.createCheckError', {}, lang),
    createSelfFollow: (lang = 'ru') => t('follows.createSelfFollow', {}, lang),
    createLimitReached: (count, limit, lang = 'ru') => t('follows.createLimitReached', { count, limit }, lang),
    createModePrompt: (lang = 'ru') => t('follows.createModePrompt', {}, lang),
    createSaving: (lang = 'ru') => t('follows.createSaving', {}, lang),
    createMonitorSuccess: (lang = 'ru') => t('follows.createMonitorSuccess', {}, lang),
    createResellPrompt: (lang = 'ru') => t('follows.createResellPrompt', {}, lang),
    createMarkupInvalid: (lang = 'ru') => t('follows.createMarkupInvalid', {}, lang),
    createResellSuccess: (markup, lang = 'ru') => t('follows.createResellSuccess', { markup }, lang),
    createExists: (lang = 'ru') => t('follows.createExists', {}, lang),
    createCircular: (lang = 'ru') => t('follows.createCircular', {}, lang),
    createError: (lang = 'ru') => t('follows.createError', {}, lang),
    createCancelled: (lang = 'ru') => t('follows.createCancelled', {}, lang),
    limitReachedBasicToPro: (lang = 'ru') => t('follows.limitReachedBasicToPro', {}, lang),
    createCircularDetailed: (lang = 'ru') => t('follows.createCircularDetailed', {}, lang),
    cancelOperationError: (lang = 'ru') => t('follows.cancelOperationError', {}, lang),
    createEnterName: (lang = 'ru') => t('follows.createEnterName', {}, lang),
    createQueryTooShort: (lang = 'ru') => t('follows.createQueryTooShort', {}, lang),
    createSearching: (lang = 'ru') => t('follows.createSearching', {}, lang),
    createNoResults: (lang = 'ru') => t('follows.createNoResults', {}, lang),
    createOnlyOwnShop: (lang = 'ru') => t('follows.createOnlyOwnShop', {}, lang),
    createSelectShop: (count, lang = 'ru') => t('follows.createSelectShop', { count }, lang),
    createSearchError: (lang = 'ru') => t('follows.createSearchError', {}, lang),
  },
  subscription: {
    chooseTierIntro: (lang = 'ru') => t('subscription.chooseTierIntro', {}, lang),
    tierDescriptionPro: (lang = 'ru') => t('subscription.tierDescriptionPro', {}, lang),
    tierDescriptionMax: (lang = 'ru') => t('subscription.tierDescriptionMax', {}, lang),
    chooseCryptoIntro: (tier, amount, lang = 'ru') =>
      t('subscription.chooseCryptoIntro', { tier: safe(tier), amount: safe(amount) }, lang),
    paymentDetails: (tier, amount, currency, address, lang = 'ru') =>
      t('subscription.paymentDetails', {
        tier: safe(tier),
        amount: safe(amount),
        currency: safe(currency),
        address: safe(address),
      }, lang),
    sendHashPrompt: (lang = 'ru') => t('subscription.sendHashPrompt', {}, lang),
    hashInvalid: (lang = 'ru') => t('subscription.hashInvalid', {}, lang),
    verifying: (lang = 'ru') => t('subscription.verifying', {}, lang),
    verificationSuccess: (tier, date, id, lang = 'ru') =>
      t('subscription.verificationSuccess', { tier: safe(tier), date: safe(date), id: safe(id) }, lang),
    proBenefits: (lang = 'ru') => t('subscription.proBenefits', {}, lang),
    duplicateTx: (lang = 'ru') => t('subscription.duplicateTx', {}, lang),
    verificationFailed: (lang = 'ru') => t('subscription.verificationFailed', {}, lang),
    verificationError: (lang = 'ru') => t('subscription.verificationError', {}, lang),
    cancelled: (lang = 'ru') => t('subscription.cancelled', {}, lang),
    unknownCommand: (lang = 'ru') => t('subscription.unknownCommand', {}, lang),
    invalidTier: (lang = 'ru') => t('subscription.invalidTier', {}, lang),
    invalidCrypto: (lang = 'ru') => t('subscription.invalidCrypto', {}, lang),
    confirmPrompt: (tier, amount, lang = 'ru') =>
      t('subscription.confirmPrompt', { tier: safe(tier), amount: safe(amount) }, lang),
    promoPrompt: (lang = 'ru') => t('subscription.promoPrompt', {}, lang),
    promoInvalid: (lang = 'ru') => t('subscription.promoInvalid', {}, lang),
    promoAccepted: (code, lang = 'ru') => t('subscription.promoAccepted', { code: safe(code) }, lang),
    chooseTierCancelled: (lang = 'ru') => t('subscription.chooseTierCancelled', {}, lang),
    promoTextPrompt: (lang = 'ru') => t('subscription.promoTextPrompt', {}, lang),
    generatingInvoice: (lang = 'ru') => t('subscription.generatingInvoice', {}, lang),
    invoiceGenerated: (tier, amount, currency, address, expiresAt, cryptoAmount, lang = 'ru') => {
      const amountLine = cryptoAmount ? `${safe(cryptoAmount)} ${safe(currency)}` : `${safe(amount)} (USD)`;
      return t('subscription.invoiceGenerated', {
        tier: safe(tier),
        amountLine,
        address: safe(address),
      }, lang);
    },
    checkingPayment: (lang = 'ru') => t('subscription.checkingPayment', {}, lang),
    paymentPending: (lang = 'ru') => t('subscription.paymentPending', {}, lang),
    paymentExpired: (lang = 'ru') => t('subscription.paymentExpired', {}, lang),
    invoiceError: (lang = 'ru') => t('subscription.invoiceError', {}, lang),
    paymentStatusError: (lang = 'ru') => t('subscription.paymentStatusError', {}, lang),
    chainMappings: {
      BTC: (lang = 'ru') => t('subscription.chainBTC', {}, lang),
      LTC: (lang = 'ru') => t('subscription.chainLTC', {}, lang),
      ETH: (lang = 'ru') => t('subscription.chainETH', {}, lang),
      USDT_ERC20: (lang = 'ru') => t('subscription.chainUSDT_ERC20', {}, lang),
      USDT_TRC20: (lang = 'ru') => t('subscription.chainUSDT_TRC20', {}, lang),
    },
  },
  workspace: {
    panel: (lang = 'ru') => t('workspace.panel', {}, lang),
    noAccess: (lang = 'ru') => t('workspace.noAccess', {}, lang),
    noWorkerAccess: (lang = 'ru') => t('workspace.noWorkerAccess', {}, lang),
    loadError: (lang = 'ru') => t('workspace.loadError', {}, lang),
    selectShop: (lang = 'ru') => t('workspace.selectShop', {}, lang),
    actionFailed: (lang = 'ru') => t('workspace.actionFailed', {}, lang),
    shopNotFoundOrRevoked: (lang = 'ru') => t('workspace.shopNotFoundOrRevoked', {}, lang),
    header: (shopName, lang = 'ru') => t('workspace.header', { shopName: safe(shopName) }, lang),
  },
  search: {
    prompt: (lang = 'ru') => t('search.prompt', {}, lang),
    searching: (lang = 'ru') => t('search.searching', {}, lang),
    noResults: (lang = 'ru') => t('search.noResults', {}, lang),
    tooShort: (lang = 'ru') => t('search.tooShort', {}, lang),
    inputRequired: (lang = 'ru') => t('search.inputRequired', {}, lang),
    error: (lang = 'ru') => t('search.error', {}, lang),
  },
  promo: {
    applied: (lang = 'ru') => t('promo.applied', {}, lang),
    invalid: (lang = 'ru') => t('promo.invalid', {}, lang),
  },
});

export const messages = buildMessages();

export function getMessages(lang = 'ru') {
  if (lang === 'ru') return messages;
  return withLang(lang, buildMessages);
}

// Formatters - complex formatting functions
const buildFormatters = () => ({
  shopList: (shops, lang = 'ru') =>
    shops
      .map((shop) => {
        const seller = shop.seller_username
          ? `@${safe(shop.seller_username)}`
          : safe(shop.seller_first_name) || t('formatters.seller', {}, lang);
        const mark = shop.is_subscribed ? ` - ${t('formatters.subscribed', {}, lang)}` : '';
        return `${safe(shop.name)} ${seller}${mark}`;
      })
      .join('\n'),
  orders: (orders, lang = 'ru') =>
    orders
      .map((o) => {
        const price = o.total_price || o.totalPrice;
        const statusMap = {
          pending: t('formatters.orderStatusPending', {}, lang),
          processing: t('formatters.orderStatusProcessing', {}, lang),
          completed: t('formatters.orderStatusCompleted', {}, lang),
          cancelled: t('formatters.orderStatusCancelled', {}, lang),
          shipped: t('formatters.orderStatusShipped', {}, lang),
        };
        const status = statusMap[o.status] || o.status;
        const shopName = o.shop_name || t('general.shopFallbackName', {}, lang);
        return `${safe(status)} ${safe(shopName)} - $${Number(price || 0).toFixed(2)}`;
      })
      .join('\n'),
  subscriptions: (subscriptions, lang = 'ru') =>
    subscriptions
      .map((sub) => {
        const name = sub.shop_name || sub.shopName || t('general.shopFallbackName', {}, lang);
        return `${safe(name)}`;
      })
      .join('\n'),
  followsList: (follows, lang = 'ru') =>
    follows
      .map((follow) => {
        const name =
          follow.source_shop_name || follow.sourceShopName || follow.name || t('general.shopFallbackName', {}, lang);
        const mode =
          follow.mode === 'resell' ? t('formatters.modeResell', {}, lang) : t('formatters.modeMonitor', {}, lang);
        const markupValue = follow.markup_percentage ?? follow.markup ?? 0;
        const markup = Number.isFinite(Number(markupValue))
          ? `${Number(markupValue).toFixed(0)}%`
          : `${markupValue}`;
        const markupText = follow.mode === 'resell' ? `, +${markup}` : '';
        return `${safe(name)} - ${mode}${markupText}`;
      })
      .join('\n'),
  productsList: (products, shopName, lang = 'ru') => {
    if (!products.length) {
      return t('buyer.stockSectionEmpty', { shop: shopName }, lang);
    }
    const lines = products
      .map((product) => `${safe(product.name)} - $${Number(product.price ?? 0).toFixed(2)}`);
    return `${safe(shopName)} (${products.length}).\n${lines.join('\n')}`;
  },
  salesList: (orders, shopName, lang = 'ru') => {
    if (!orders.length) {
      return `${safe(shopName)} - ${t('formatters.noSales', {}, lang)}`;
    }
    const lines = orders.slice(0, 5).map((order) => {
      const buyer = order.buyer_username
        ? `@${safe(order.buyer_username)}`
        : safe(order.buyer_first_name) || t('orders.buyerDefault', {}, lang);
      const status = safe(order.status || 'processing');
      const price = Number(order.total_price || order.totalPrice || 0).toFixed(2);
      return `${buyer} - ${status} - $${price}`;
    });
    const extra = orders.length > 5 ? `\n... +${orders.length - 5}` : '';
    return `${safe(shopName)} (${orders.length}).\n${lines.join('\n')}${extra}`;
  },
  productSection: (section, shopName, products, lang = 'ru') => {
    const isPreorder = section === 'preorder';
    const count = products.length;

    if (count === 0) {
      return isPreorder
        ? messages.buyer.preorderSectionEmpty(shopName, lang)
        : messages.buyer.stockSectionEmpty(shopName, lang);
    }

    const title = isPreorder
      ? messages.buyer.preorderSectionTitle(shopName, count, lang)
      : messages.buyer.stockSectionTitle(shopName, count, lang);

    const lines = products
      .map((product) => `${safe(product.name)} - $${Number(product.price ?? 0).toFixed(2)}`);

    return `${title}\n${lines.join('\n')}`;
  },
  shopInfo: (shop, sections, lang = 'ru') => {
    const seller = shop.seller_username
      ? `@${safe(shop.seller_username)}`
      : safe(shop.seller_first_name) || t('formatters.seller', {}, lang);
    const stock = sections.stock || [];
    const preorder = sections.preorder || [];

    const stockLines = stock
      .map((p) => `${safe(p.name)} - $${Number(p.price || 0).toFixed(2)}`);
    const preorderLines = preorder
      .map((p) => `${safe(p.name)} - $${Number(p.price || 0).toFixed(2)}`);

    const stockSection = stock.length ? stockLines.join('\n') : t('formatters.stockEmpty', {}, lang);
    const preorderSection = preorder.length
      ? preorderLines.join('\n')
      : t('formatters.preorderAwaiting', {}, lang);

    return `${safe(shop.name)} ${seller}\n\n${t('formatters.stockLabel', {}, lang)} - ${stock.length || 0}\n${stockSection}\n\n${t('formatters.preorderLabel', {}, lang)} - ${preorder.length || 0}\n${preorderSection}`;
  },
});

export const formatters = buildFormatters();

export function getFormatters(lang = 'ru') {
  if (lang === 'ru') return formatters;
  return withLang(lang, buildFormatters);
}
