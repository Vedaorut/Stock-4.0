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
import { t } from '../i18n/index.js';

const safe = (value) => escapeHtml(String(value ?? ''));

// Buttons - proxy to i18n
export const buttons = {
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
  tierBasic: t('buttons.tierBasic'),
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
};

// Messages - proxy to i18n with function wrappers for parameterized messages
export const messages = {
  start: {
    welcome: t('start.welcome'),
  },
  general: {
    welcomeDetailed: t('general.welcomeDetailed'),
    actionFailed: t('general.actionFailed'),
    authorizationRequired: t('general.authorizationRequired'),
    shopRequired: t('general.shopRequired'),
    featureAfterShop: t('general.featureAfterShop'),
    done: t('general.done'),
    processing: (subject) => t('general.processing', { subject: safe(subject) }),
    invalidChoice: t('general.invalidChoice'),
    restartRequired: t('general.restartRequired'),
  },
  buyer: {
    searchContext: t('buyer.searchContext'),
    ordersContext: t('buyer.ordersContext'),
    cartContext: t('buyer.cartContext'),
    panel: t('buyer.panel'),
    noSubscriptions: t('buyer.noSubscriptions'),
    listSubscriptionsTitle: (count) => t('buyer.listSubscriptionsTitle', { count }),
    ordersTitle: (count) => t('buyer.ordersTitle', { count }),
    ordersEmpty: t('buyer.ordersEmpty'),
    orderLine: ({ shop, status, price }) =>
      t('buyer.orderLine', { shop: safe(shop), status: safe(status), price: safe(price) }),
    searchPrompt: t('buyer.searchPrompt'),
    searching: t('buyer.searching'),
    searchNoResults: t('buyer.searchNoResults'),
    searchResultsTitle: (count) => t('buyer.searchResultsTitle', { count }),
    subscriptionActive: () => t('buyer.subscriptionActive'),
    subscriptionAdded: (shop) => t('buyer.subscriptionAdded', { shop: safe(shop) }),
    subscriptionRemoved: (shop) => t('buyer.subscriptionRemoved', { shop: safe(shop) }),
    subscriptionLimit: t('buyer.subscriptionLimit'),
    subscriptionAlreadyToast: t('buyer.subscriptionAlreadyToast'),
    subscriptionOwnShop: t('buyer.subscriptionOwnShop'),
    subscriptionError: t('buyer.subscriptionError'),
    unsubscribeError: t('buyer.unsubscribeError'),
    stockSectionTitle: (shop, count) => t('buyer.stockSectionTitle', { shop: safe(shop), count }),
    stockSectionEmpty: (shop) => t('buyer.stockSectionEmpty', { shop: safe(shop) }),
    preorderSectionTitle: (shop, count) =>
      t('buyer.preorderSectionTitle', { shop: safe(shop), count }),
    preorderSectionEmpty: (shop) => t('buyer.preorderSectionEmpty', { shop: safe(shop) }),
  },
  buyerButtons: {
    preorderContact: t('buyer.preorderContact'),
    preorderClose: t('buyer.preorderClose'),
  },
  seller: {
    panel: t('seller.panel'),
    shopPanel: (shop) => t('seller.shopPanel', { shop: safe(shop) }),
    shopPanelWithStats: (shop, revenue, activeOrders, statusBar = null, lang = 'ru') => {
      let message = '';

      if (statusBar) {
        message += `${safe(statusBar)}\n\n`;
      }

      const formattedRevenue =
        revenue > 0
          ? `$${Number(revenue).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
          : '$0';

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

      message += `${safe(shop)}\n\n`;
      message += `${formattedRevenue}  ${ordersText}`;

      return message;
    },
    noShop: t('seller.noShop'),
    noWorkers: (shop) => t('seller.noWorkers', { shop: safe(shop) }),
    workersListTitle: (shop) => t('seller.workersListTitle', { shop: safe(shop) }),
    workersListInstruction: t('seller.workersListInstruction'),
    workersMenuIntro: (shop) => t('seller.workersMenuIntro', { shop: safe(shop) }),
    workersProOnly: t('seller.workersProOnly'),
    workersMaxOnly: t('seller.workersMaxOnly'),
    workersOwnerOnly: t('seller.workersOwnerOnly'),
    workerAdded: (name) => t('seller.workerAdded', { name: safe(name) }),
    workerRemoved: t('seller.workerRemoved'),
    workerPrompt: t('seller.workerPrompt'),
    workerIdInvalid: t('seller.workerIdInvalid'),
    workerAdding: t('seller.workerAdding'),
    workerAddError: t('seller.workerAddError'),
    workerAddNotFound: t('seller.workerAddNotFound'),
    workerAddAlready: t('seller.workerAddAlready'),
    workerAddOwner: t('seller.workerAddOwner'),
    workerLookupError: t('seller.workerLookupError'),
    migration: {
      intro: t('migration.intro'),
      confirmPrompt: t('migration.confirmPrompt'),
      askChannel: t('migration.askChannel'),
      invalidChannel: t('migration.invalidChannel'),
      channelAccessError: t('migration.channelAccessError'),
      confirmation: ({ shopName, channel, buyersCount }) =>
        t('migration.confirmation', {
          shopName: safe(shopName),
          channel: safe(channel),
          buyersCount: safe(buyersCount),
        }),
      sending: t('migration.sending'),
      success: ({ channel, buyersCount }) =>
        t('migration.success', { channel: safe(channel), buyersCount: safe(buyersCount) }),
      error: t('migration.error'),
      accessDenied: t('migration.accessDenied'),
      cancelled: t('migration.cancelled'),
    },
    workerSelectionInvalid: t('seller.workerSelectionInvalid'),
    workerNotFound: t('seller.workerNotFound'),
    workerRemoveConfirm: (name) => t('seller.workerRemoveConfirm', { name: safe(name) }),
    workerRemoveError: t('seller.workerRemoveError'),
    addProductNamePrompt: t('seller.addProductNamePrompt'),
    addProductPricePrompt: t('seller.addProductPricePrompt'),
    addProductPriceInvalid: t('seller.addProductPriceInvalid'),
    addProductSaving: t('seller.addProductSaving'),
    addProductSuccess: (name, price) =>
      t('seller.addProductSuccess', { name: safe(name), price: safe(price) }),
    addProductError: t('seller.addProductError'),
    toolsIntro: t('seller.toolsIntro'),
    toolsError: t('seller.toolsError'),
    createShopNamePrompt: t('seller.createShopNamePrompt'),
    createShopNameHint: t('seller.createShopNameHint'),
    createShopNameInvalidLength: t('seller.createShopNameInvalidLength'),
    createShopNameInvalidChars: t('seller.createShopNameInvalidChars'),
    createShopNameTaken: t('seller.createShopNameTaken'),
    createShopPromoPrompt: t('seller.createShopPromoPrompt'),
    createShopSaving: t('seller.createShopSaving'),
    createShopSuccess: (name, tier) =>
      t('seller.createShopSuccess', { name: safe(name), tier: safe(tier) }),
    createShopPromoSuccess: (name) => t('seller.createShopPromoSuccess', { name: safe(name) }),
    createShopError: t('seller.createShopError'),
    walletsIntroEmpty: t('seller.walletsIntroEmpty'),
    walletsIntroList: (list) => t('seller.walletsIntroList', { list: safe(list) }),
    walletsChoosePrompt: t('seller.walletsChoosePrompt'),
    walletsPromptReplace: (crypto, example) =>
      t('seller.walletsPromptReplace', { crypto: safe(crypto), example: safe(example) }),
    walletsAddPrompt: t('seller.walletsAddPrompt'),
    walletsAddPromptSpecific: (crypto) => {
      const examples = {
        BTC: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        ETH: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        USDT: 'TQamF8rf8CuCBcrS85trYW23MsKJc2FMJr',
        LTC: 'ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxmhkny',
      };
      return t('seller.walletsAddPromptSpecific', {
        crypto: safe(crypto),
        example: safe(examples[crypto] || ''),
      });
    },
    walletsUnknownAddress: t('seller.walletsUnknownAddress'),
    walletsInvalidAddress: (crypto) => t('seller.walletsInvalidAddress', { crypto: safe(crypto) }),
    walletsSaved: (crypto) => t('seller.walletsSaved', { crypto: safe(crypto) }),
    walletsUpdated: (crypto) => t('seller.walletsUpdated', { crypto: safe(crypto) }),
    walletsDeleted: (crypto) => t('seller.walletsDeleted', { crypto: safe(crypto) }),
    walletsDeleteConfirm: (crypto) => t('seller.walletsDeleteConfirm', { crypto: safe(crypto) }),
    walletsNotFound: t('seller.walletsNotFound'),
    walletsLoadError: t('seller.walletsLoadError'),
    walletsQrError: t('seller.walletsQrError'),
    walletsUseButtons: t('seller.walletsUseButtons'),
    walletsStatusEmpty: t('seller.walletsStatusEmpty'),
    walletsUnknownCommand: t('seller.walletsUnknownCommand'),
    paymentHashPrompt: t('seller.paymentHashPrompt'),
    paymentChecking: t('seller.paymentChecking'),
    paymentHashShort: t('seller.paymentHashShort'),
    paymentFailed: t('seller.paymentFailed'),
    subscriptionStatus: (tier) =>
      t('seller.subscriptionStatus', { tier: tier === 'pro' ? 'PRO' : 'BASIC' }),
    subscriptionStatusLine: (status, date) => {
      const statusLabel = status === 'active' ? t('formatters.statusActive') : t('formatters.statusInactive');
      return date
        ? t('seller.subscriptionStatusLine', { status: statusLabel, date: safe(date) })
        : t('seller.subscriptionStatusLineNoDate', { status: statusLabel });
    },
    subscriptionGraceNotice: t('seller.subscriptionGraceNotice'),
    subscriptionInactiveNotice: t('seller.subscriptionInactiveNotice'),
    subscriptionUpgradePrompt: t('seller.subscriptionUpgradePrompt'),
    subscriptionProBenefits: t('seller.subscriptionProBenefits'),
    subscriptionStatusError: t('seller.subscriptionStatusError'),
    upgrade: {
      alreadyPro: t('upgrade.alreadyPro'),
      alreadyMax: t('upgrade.alreadyMax'),
      notEligible: t('upgrade.notEligible'),
      chooseCrypto: (cost) => t('upgrade.chooseCrypto', { cost }),
      cancelled: t('upgrade.cancelled'),
      unknownCommand: t('upgrade.unknownCommand'),
      error: (msg) => t('upgrade.error', { msg: safe(msg) }),
      confirmPrompt: (tier, amount) =>
        t('upgrade.confirmPrompt', { tier: safe(tier), amount: safe(amount) }),
      paymentDetails: (cost, currency, address) =>
        t('upgrade.paymentDetails', {
          cost: safe(cost),
          currency: safe(currency),
          address: safe(address),
        }),
      sendHashPrompt: t('upgrade.sendHashPrompt'),
      hashInvalid: t('upgrade.hashInvalid'),
      verifying: t('upgrade.verifying'),
      success: (endDate) => t('upgrade.success', { endDate: safe(endDate) }),
      benefits: t('upgrade.benefits'),
      duplicateTx: t('upgrade.duplicateTx'),
      verificationFailed: t('upgrade.verificationFailed'),
      verificationError: t('upgrade.verificationError'),
    },
    aiProducts: {
      processing: t('aiProducts.processing'),
      rateLimitReached: t('aiProducts.rateLimitReached'),
      operationExpired: t('aiProducts.operationExpired'),
      productNotFound: t('aiProducts.productNotFound'),
      productDeleted: (name, price) =>
        t('aiProducts.productDeleted', { name: safe(name), price: safe(price) }),
      productDeleteError: t('aiProducts.productDeleteError'),
      processingError: t('aiProducts.processingError'),
      applyingChanges: t('aiProducts.applyingChanges'),
      stockRequired: t('aiProducts.stockRequired'),
      nameMinLength: t('aiProducts.nameMinLength'),
      pricePositive: t('aiProducts.pricePositive'),
      stockNotSpecified: t('aiProducts.stockNotSpecified'),
      apiError: t('aiProducts.apiError'),
      productsEmpty: t('aiProducts.productsEmpty'),
      productsList: (count, list) => t('aiProducts.productsList', { count, list: safe(list) }),
      invalidOperation: t('aiProducts.invalidOperation'),
      operationNames: {
        decrease: t('aiProducts.operationDecrease'),
        increase: t('aiProducts.operationIncrease'),
      },
      bulkPricePrompt: (operation, percentage, preview) =>
        t('aiProducts.bulkPricePrompt', {
          operation: safe(operation),
          percentage: safe(percentage),
          preview: safe(preview),
        }),
    },
    activeOrders: {
      empty: t('activeOrders.empty'),
      title: (count) => t('activeOrders.title', { count }),
    },
    orderHistory: {
      empty: t('orderHistory.empty'),
      title: (count) => t('orderHistory.title', { count }),
    },
    activeOrdersContext: t('seller.activeOrdersContext'),
    activeOrdersEmpty: t('seller.activeOrdersEmpty'),
    orderHistoryContext: t('seller.orderHistoryContext'),
    orderHistoryEmpty: t('seller.orderHistoryEmpty'),
    subscriptionBasicInfo: (data) => {
      const statusLabel =
        data.status === 'active' ? t('formatters.statusActive') : t('formatters.statusInactive');
      return t('seller.subscriptionBasicInfo', { status: statusLabel });
    },
    subscriptionProInfo: (data) => {
      const statusLabel =
        data.status === 'active' ? t('formatters.statusActive') : t('formatters.statusInactive');
      const renewDate = data.renewDate
        ? new Date(data.renewDate).toLocaleDateString('ru-RU')
        : '-';
      return t('seller.subscriptionProInfo', { status: statusLabel, renewDate });
    },
    subscriptionMaxInfo: (data) => {
      const statusLabel =
        data.status === 'active' ? t('formatters.statusActive') : t('formatters.statusInactive');
      const renewDate = data.renewDate
        ? new Date(data.renewDate).toLocaleDateString('ru-RU')
        : '-';
      return t('seller.subscriptionMaxInfo', { status: statusLabel, renewDate });
    },
    walletsContext: t('seller.walletsContext'),
    workersContext: t('seller.workersContext'),
    bulkShip: {
      prompt: t('bulkShip.prompt'),
      confirmTitle: (count) => t('bulkShip.confirmTitle', { count }),
      confirmList: (orders) => {
        return orders
          .map((o, i) => {
            const buyer = o.buyer_username ? `@${safe(o.buyer_username)}` : 'Buyer';
            return `${i + 1}. ${buyer} - ${safe(o.product_name)} (${safe(o.quantity)}) - $${safe(o.total_price)}`;
          })
          .join('\n');
      },
      success: (count) => t('bulkShip.success', { count }),
      invalidInput: t('bulkShip.invalidInput'),
      invalidNumbers: (invalid) => t('bulkShip.invalidNumbers', { invalid: safe(invalid.join(', ')) }),
      cancelled: t('bulkShip.cancelled'),
    },
  },
  follows: {
    contextDetailed: t('follows.contextDetailed'),
    createModePromptDetailed: (shopName) =>
      t('follows.createModePromptDetailed', { shopName: safe(shopName) }),
    emptyState: t('follows.emptyState'),
    listHeader: (count) => t('follows.listHeader', { count: count ? ` (${count})` : '' }),
    listTitle: (count) => t('follows.listTitle', { count }),
    listEmpty: t('follows.listEmpty'),
    listItem: ({ index, name, mode, markupType, markupPercentage, markupFixed }) => {
      let suffix = '';
      if (mode === 'resell') {
        if (markupType === 'fixed' && Number.isFinite(markupFixed) && markupFixed > 0) {
          suffix = `, +$${Number(markupFixed).toFixed(0)}`;
        } else if (Number.isFinite(markupPercentage) && markupPercentage > 0) {
          suffix = `, +${Number(markupPercentage).toFixed(0)}%`;
        }
      }
      const modeText = mode === 'resell' ? t('formatters.modeResell') : t('formatters.modeMonitor');
      return `${index}. ${safe(name)} (${modeText}${suffix})`;
    },
    listManageHint: t('follows.listManageHint'),
    listTitle2: t('follows.listTitle'),
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
    topMonitorTitle: (count, total) => {
      const suffix = total && total > count ? ` (${count}/${total})` : count ? ` (${count})` : '';
      return t('follows.topMonitorTitle', { suffix });
    },
    topResellTitle: (count, total) => {
      const suffix = total && total > count ? ` (${count}/${total})` : count ? ` (${count})` : '';
      return t('follows.topResellTitle', { suffix });
    },
    monitorProductsEmpty: t('follows.monitorProductsEmpty'),
    resellProductsEmpty: t('follows.resellProductsEmpty'),
    monitorProductLine: ({ index, name, price, stock }) => {
      const stockText = Number.isFinite(stock) ? `${safe(stock)} pcs` : '-';
      return `${safe(index)}. ${safe(name)} - ${safe(price)} (${stockText})`;
    },
    resellProductLine: ({ index, name, sourcePrice, syncedPrice, diff }) => {
      const diffText =
        diff > 0 ? ` (+${safe(diff)})` : diff < 0 ? ` (-${safe(Math.abs(diff))})` : '';
      return `${safe(index)}. ${safe(name)}\n   Supplier: ${safe(sourcePrice)}\n   Your: ${safe(syncedPrice)}${diffText}`;
    },
    notFound: t('follows.notFound'),
    loadError: t('follows.loadError'),
    accessDenied: t('follows.accessDenied'),
    deleteSuccess: t('follows.deleteSuccess'),
    deleteError: t('follows.deleteError'),
    modeLimit: t('follows.modeLimit'),
    limitReached: t('follows.limitReached'),
    markupPrompt: t('follows.markupPrompt'),
    markupInvalid: t('follows.markupInvalid'),
    markupUpdated: (value) => t('follows.markupUpdated', { value }),
    markupTypePrompt: t('follows.markupTypePrompt'),
    markupTypeRequired: t('follows.markupTypeRequired'),
    markupPercentagePrompt: t('follows.markupPercentagePrompt'),
    markupFixedPrompt: t('follows.markupFixedPrompt'),
    markupFixedInvalid: t('follows.markupFixedInvalid'),
    markupFixedUpdated: (value) => t('follows.markupFixedUpdated', { value }),
    modeChanged: t('follows.modeChanged'),
    switchError: t('follows.switchError'),
    createEnterId: t('follows.createEnterId'),
    createIdInvalid: t('follows.createIdInvalid'),
    createShopNotFound: t('follows.createShopNotFound'),
    createCheckError: t('follows.createCheckError'),
    createSelfFollow: t('follows.createSelfFollow'),
    createLimitReached: (count, limit) => t('follows.createLimitReached', { count, limit }),
    createModePrompt: t('follows.createModePrompt'),
    createSaving: t('follows.createSaving'),
    createMonitorSuccess: t('follows.createMonitorSuccess'),
    createResellPrompt: t('follows.createResellPrompt'),
    createMarkupInvalid: t('follows.createMarkupInvalid'),
    createResellSuccess: (markup) => t('follows.createResellSuccess', { markup }),
    createExists: t('follows.createExists'),
    createCircular: t('follows.createCircular'),
    createError: t('follows.createError'),
    createCancelled: t('follows.createCancelled'),
    limitReachedBasicToPro: t('follows.limitReachedBasicToPro'),
    createCircularDetailed: t('follows.createCircularDetailed'),
    cancelOperationError: t('follows.cancelOperationError'),
    createEnterName: t('follows.createEnterName'),
    createQueryTooShort: t('follows.createQueryTooShort'),
    createSearching: t('follows.createSearching'),
    createNoResults: t('follows.createNoResults'),
    createOnlyOwnShop: t('follows.createOnlyOwnShop'),
    createSelectShop: (count) => t('follows.createSelectShop', { count }),
    createSearchError: t('follows.createSearchError'),
  },
  subscription: {
    chooseTierIntro: t('subscription.chooseTierIntro'),
    tierDescriptionBasic: t('subscription.tierDescriptionBasic'),
    tierDescriptionPro: t('subscription.tierDescriptionPro'),
    tierDescriptionMax: t('subscription.tierDescriptionMax'),
    chooseCryptoIntro: (tier, amount) =>
      t('subscription.chooseCryptoIntro', { tier: safe(tier), amount: safe(amount) }),
    paymentDetails: (tier, amount, currency, address) =>
      t('subscription.paymentDetails', {
        tier: safe(tier),
        amount: safe(amount),
        currency: safe(currency),
        address: safe(address),
      }),
    sendHashPrompt: t('subscription.sendHashPrompt'),
    hashInvalid: t('subscription.hashInvalid'),
    verifying: t('subscription.verifying'),
    verificationSuccess: (tier, date, id) =>
      t('subscription.verificationSuccess', { tier: safe(tier), date: safe(date), id: safe(id) }),
    proBenefits: t('subscription.proBenefits'),
    duplicateTx: t('subscription.duplicateTx'),
    verificationFailed: t('subscription.verificationFailed'),
    verificationError: t('subscription.verificationError'),
    cancelled: t('subscription.cancelled'),
    unknownCommand: t('subscription.unknownCommand'),
    invalidTier: t('subscription.invalidTier'),
    invalidCrypto: t('subscription.invalidCrypto'),
    confirmPrompt: (tier, amount) =>
      t('subscription.confirmPrompt', { tier: safe(tier), amount: safe(amount) }),
    promoPrompt: t('subscription.promoPrompt'),
    promoInvalid: t('subscription.promoInvalid'),
    promoAccepted: (code) => t('subscription.promoAccepted', { code: safe(code) }),
    chooseTierCancelled: t('subscription.chooseTierCancelled'),
    promoTextPrompt: t('subscription.promoTextPrompt'),
    generatingInvoice: t('subscription.generatingInvoice'),
    invoiceGenerated: (tier, amount, currency, address, expiresAt, cryptoAmount) => {
      const amountLine = cryptoAmount ? `${safe(cryptoAmount)} ${safe(currency)}` : `${safe(amount)} (USD)`;
      return t('subscription.invoiceGenerated', {
        tier: safe(tier),
        amountLine,
        address: safe(address),
      });
    },
    checkingPayment: t('subscription.checkingPayment'),
    paymentPending: t('subscription.paymentPending'),
    paymentExpired: t('subscription.paymentExpired'),
    invoiceError: t('subscription.invoiceError'),
    paymentStatusError: t('subscription.paymentStatusError'),
    chainMappings: {
      BTC: t('subscription.chainBTC'),
      LTC: t('subscription.chainLTC'),
      ETH: t('subscription.chainETH'),
      USDT_ERC20: t('subscription.chainUSDT_ERC20'),
      USDT_TRC20: t('subscription.chainUSDT_TRC20'),
    },
  },
  workspace: {
    panel: t('workspace.panel'),
    noAccess: t('workspace.noAccess'),
    noWorkerAccess: t('workspace.noWorkerAccess'),
    loadError: t('workspace.loadError'),
    selectShop: t('workspace.selectShop'),
    actionFailed: t('workspace.actionFailed'),
    shopNotFoundOrRevoked: t('workspace.shopNotFoundOrRevoked'),
    header: (shopName) => t('workspace.header', { shopName: safe(shopName) }),
  },
  search: {
    prompt: t('search.prompt'),
    searching: t('search.searching'),
    noResults: t('search.noResults'),
    tooShort: t('search.tooShort'),
    inputRequired: t('search.inputRequired'),
    error: t('search.error'),
  },
  promo: {
    applied: t('promo.applied'),
    invalid: t('promo.invalid'),
  },
};

// Formatters - complex formatting functions
export const formatters = {
  shopList: (shops) =>
    shops
      .map((shop) => {
        const seller = shop.seller_username
          ? `@${safe(shop.seller_username)}`
          : safe(shop.seller_first_name) || t('formatters.seller');
        const mark = shop.is_subscribed ? ` - ${t('formatters.subscribed')}` : '';
        return `${safe(shop.name)} ${seller}${mark}`;
      })
      .join('\n'),
  orders: (orders) =>
    orders
      .map((o) => {
        const price = o.total_price || o.totalPrice;
        const statusMap = {
          pending: t('formatters.orderStatusPending'),
          processing: t('formatters.orderStatusProcessing'),
          completed: t('formatters.orderStatusCompleted'),
          cancelled: t('formatters.orderStatusCancelled'),
          shipped: t('formatters.orderStatusShipped'),
        };
        const status = statusMap[o.status] || o.status;
        const shopName = o.shop_name || 'Shop';
        return `${safe(status)} ${safe(shopName)} - $${Number(price || 0).toFixed(2)}`;
      })
      .join('\n'),
  subscriptions: (subscriptions) =>
    subscriptions
      .map((sub) => {
        const name = sub.shop_name || sub.shopName || 'Shop';
        return `${safe(name)}`;
      })
      .join('\n'),
  followsList: (follows) =>
    follows
      .map((follow) => {
        const name =
          follow.source_shop_name || follow.sourceShopName || follow.name || 'Shop';
        const mode =
          follow.mode === 'resell' ? t('formatters.modeResell') : t('formatters.modeMonitor');
        const markupValue = follow.markup_percentage ?? follow.markup ?? 0;
        const markup = Number.isFinite(Number(markupValue))
          ? `${Number(markupValue).toFixed(0)}%`
          : `${markupValue}`;
        const markupText = follow.mode === 'resell' ? `, +${markup}` : '';
        return `${safe(name)} - ${mode}${markupText}`;
      })
      .join('\n'),
  productsList: (products, shopName) => {
    if (!products.length) {
      return t('buyer.stockSectionEmpty', { shop: shopName });
    }
    const lines = products
      .slice(0, 5)
      .map((product) => `${safe(product.name)} - $${Number(product.price ?? 0).toFixed(2)}`);
    const extra = products.length > 5 ? `\n... +${products.length - 5}` : '';
    return `${safe(shopName)} (${products.length}).\n${lines.join('\n')}${extra}`;
  },
  salesList: (orders, shopName) => {
    if (!orders.length) {
      return `${safe(shopName)} - no sales`;
    }
    const lines = orders.slice(0, 5).map((order) => {
      const buyer = order.buyer_username
        ? `@${safe(order.buyer_username)}`
        : safe(order.buyer_first_name) || 'Buyer';
      const status = safe(order.status || 'processing');
      const price = Number(order.total_price || order.totalPrice || 0).toFixed(2);
      return `${buyer} - ${status} - $${price}`;
    });
    const extra = orders.length > 5 ? `\n... +${orders.length - 5}` : '';
    return `${safe(shopName)} (${orders.length}).\n${lines.join('\n')}${extra}`;
  },
  productSection: (section, shopName, products) => {
    const isPreorder = section === 'preorder';
    const count = products.length;

    if (count === 0) {
      return isPreorder
        ? messages.buyer.preorderSectionEmpty(shopName)
        : messages.buyer.stockSectionEmpty(shopName);
    }

    const title = isPreorder
      ? messages.buyer.preorderSectionTitle(shopName, count)
      : messages.buyer.stockSectionTitle(shopName, count);

    const lines = products
      .slice(0, 5)
      .map((product) => `${safe(product.name)} - $${Number(product.price ?? 0).toFixed(2)}`);
    const extra = count > 5 ? `\n... +${count - 5}` : '';

    return `${title}\n${lines.join('\n')}${extra}`;
  },
  shopInfo: (shop, sections) => {
    const seller = shop.seller_username
      ? `@${safe(shop.seller_username)}`
      : safe(shop.seller_first_name) || t('formatters.seller');
    const stock = sections.stock || [];
    const preorder = sections.preorder || [];

    const stockLines = stock
      .slice(0, 3)
      .map((p) => `${safe(p.name)} - $${Number(p.price || 0).toFixed(2)}`);
    const preorderLines = preorder
      .slice(0, 3)
      .map((p) => `${safe(p.name)} - $${Number(p.price || 0).toFixed(2)}`);

    const extraStock = stock.length > 3 ? `\n... +${stock.length - 3}` : '';
    const extraPreorder = preorder.length > 3 ? `\n... +${preorder.length - 3}` : '';

    const stockSection = stock.length ? `${stockLines.join('\n')}${extraStock}` : 'empty';
    const preorderSection = preorder.length
      ? `${preorderLines.join('\n')}${extraPreorder}`
      : 'awaiting';

    return `${safe(shop.name)} ${seller}\n\nStock - ${stock.length || 0}\n${stockSection}\n\nPreorder - ${preorder.length || 0}\n${preorderSection}`;
  },
};
