export const buttons = {
  openCatalog: 'Открыть приложение',
  findShop: 'Найти магазин',
  mySubscriptions: 'Мои подписки',
  myOrders: 'Мои заказы',
  switchRole: '🔄 Сменить роль',
  createShop: 'Создать магазин',
  buyerRole: 'Я покупаю',
  sellerRole: 'Я продаю',
  workspace: 'Рабочее место',
  subscribe: 'Подписаться',
  subscribed: 'Подписан',
  unsubscribe: 'Отписаться',
  stockSection: 'Наличие',
  preorderSection: 'Предзаказ',
  aboutShop: 'О магазине',
  back: 'Назад',
  myShop: 'Мой магазин',
  addProduct: 'Добавить товар',
  manageSubscription: '🔔 Управление подпиской',
  tools: '🔧 Инструменты',
  manageWallets: '💰 Настроить кошельки',
  manageFollows: '👀 Следить',
  manageWorkers: '👥 Работники магазина',
  viewSales: 'Продажи',
  activeOrders: 'Активные заказы',
  orderHistory: 'История заказов',
  backToSeller: 'Назад к продавцу',
  backToBuyer: 'Назад к покупателю',
  confirm: 'Подтвердить',
  cancel: '❌ Отмена',
  yes: 'Да',
  no: 'Нет',
  upgradeToPro: 'Перейти на PRO',
  paySubscription: 'Оплатить подписку',
  contactSeller: 'Написать продавцу',
  editMarkup: 'Изменить наценку',
  changeMode: 'Сменить режим',
  delete: 'Удалить',
  addWorker: 'Добавить сотрудника',
  listWorkers: 'Список сотрудников',
  addFollow: 'Добавить подписку',
  addFollowMore: 'Добавить ещё',
  addWallet: 'Добавить кошелёк',
  backToWallets: '↩️ К кошелькам',
  backToFollows: '↩️ К подпискам',
  backSimple: '« Назад',
  followSettings: 'Настройки',
  backToTools: '↩️ К инструментам',
  changeChannel: '🚨 Канал заблокирован?',
  goToTools: '🔧 К инструментам',
  migrationConfirm: 'Да, мой канал заблокирован',
  sendNotifications: '✅ Отправить уведомления',
  modeMonitor: '🔍 Мониторинг',
  modeResell: '💰 Перепродажа',
  tierBasic: 'BASIC (бесплатно)',
  tierPro: 'PRO — $1',
  cryptoBTC: 'Bitcoin (BTC)',
  cryptoETH: 'Ethereum (ETH)',
  cryptoUSDT: 'USDT (TRC-20)',
  cryptoLTC: 'Litecoin (LTC)',
  retry: 'Попробовать снова',
  refresh: '🔄 Обновить',
  viewQr: 'Показать QR',
  changeWallet: 'Изменить адрес',
  deleteWallet: 'Удалить кошелёк',
  mainMenu: 'Главное меню',
  promoCode: 'Промокод',
  backToMenu: '« Назад в меню',
};

export const messages = {
  start: {
    welcome: 'Status Stock. Выберите роль, чтобы продолжить.',
  },
  general: {
    welcomeDetailed: `Добро пожаловать в Status Stock!

Telegram-маркетплейс для продажи и покупки товаров.

🏪 Продавец - создайте свой магазин, управляйте товарами, получайте оплату в криптовалюте
👤 Покупатель - ищите товары, оформляйте заказы, отслеживайте доставку

Выберите роль:`,
    actionFailed: 'Не удалось выполнить действие. Попробуйте ещё раз позже.',
    authorizationRequired: 'Требуется авторизация. Перезапустите бота командой /start.',
    shopRequired: 'Создайте магазин, чтобы перейти в панель продавца.',
    featureAfterShop: 'Функция доступна после создания магазина.',
    done: 'Готово',
    processing: (subject) => `${subject}…`,
    invalidChoice: 'Неверный выбор. Попробуйте ещё раз.',
    restartRequired: 'Произошла ошибка. Нажмите /start для перезапуска.',
  },
  buyer: {
    searchContext: `🔍 Поиск магазина

Введите ID или название магазина.

Примеры:
• 12345 (ID магазина)
• ShopName (название)

После поиска вы сможете открыть каталог и добавить товары в корзину.`,
    ordersContext: `📦 Мои заказы

Здесь все ваши заказы:
• Ожидают отправки продавцом
• Отправлены (с трек-номером)
• Доставлены

Нажмите на заказ для деталей.`,
    cartContext: `🛒 Корзина

Здесь товары, которые вы добавили из каталогов магазинов.

Для оформления заказа нажмите "Оформить заказ" - система сгенерирует адрес для оплаты в криптовалюте.`,
    panel: 'Панель покупателя. Выберите действие ниже.',
    noSubscriptions: 'Нет подписок. Нажмите «Найти магазин», чтобы оформить первую.',
    listSubscriptionsTitle: (count) => `Мои подписки (${count}).`,
    ordersTitle: (count) => `Заказы (${count}).`,
    ordersEmpty: 'Заказы ещё не оформлялись.',
    orderLine: ({ shop, status, price }) => `• ${status} ${shop} — ${price}`,
    searchPrompt: 'Введите название магазина (минимум 2 символа).',
    searching: 'Ищем магазины…',
    searchNoResults: 'Магазины не найдены. Измените запрос.',
    searchResultsTitle: (count) => `Нашли магазины (${count}):`,
    subscriptionActive: () => 'Этот магазин уже в ваших подписках.',
    subscriptionAdded: (shop) => `✅ Подписка оформлена. Магазин: ${shop}.`,
    subscriptionRemoved: (shop) => `Подписка на ${shop} отключена.`,
    subscriptionLimit:
      'Достигнут лимит: BASIC — до двух магазинов. Перейдите на PRO, чтобы подключить больше.',
    subscriptionAlreadyToast: 'Этот магазин уже в ваших подписках.',
    subscriptionOwnShop: 'Нельзя подписаться на собственный магазин.',
    subscriptionError: 'Не удалось оформить подписку.',
    unsubscribeError: 'Не удалось отменить подписку.',
    stockSectionTitle: (shop, count) => `Наличие магазина ${shop} (${count}).`,
    stockSectionEmpty: (shop) => `Наличие магазина ${shop}. Пока нет товаров.`,
    preorderSectionTitle: (shop, count) => `Предзаказ магазина ${shop} (${count}).`,
    preorderSectionEmpty: (shop) => `Предзаказ магазина ${shop}. Пока нет товаров.`,
  },
  buyerButtons: {
    preorderContact: 'Написать продавцу',
    preorderClose: 'Закрыть',
  },
  seller: {
    panel: 'Панель продавца. Доступные разделы ниже.',
    shopPanel: (shop) => `Магазин «${shop}». Доступные разделы ниже.`,
    shopPanelWithStats: (shop, revenue, activeOrders, statusBar = null) => {
      let message = '';

      // Если есть статус-бар - показываем его в начале
      if (statusBar) {
        message += `${statusBar}\n\n`;
      }

      const formattedRevenue =
        revenue > 0
          ? `${Number(revenue).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
          : '$0';

      const ordersText = (() => {
        if (activeOrders <= 0) {
          return 'Нет активных заказов';
        }

        const mod10 = activeOrders % 10;
        const mod100 = activeOrders % 100;
        if (mod10 === 1 && mod100 !== 11) {
          return `${activeOrders} активный заказ`;
        }
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
          return `${activeOrders} активных заказа`;
        }
        return `${activeOrders} активных заказов`;
      })();

      // Основная информация о магазине
      message += `🏪 Магазин «${shop}»\n\n`;
      message += `💵 ${formattedRevenue} за 7 дней  •  ${ordersText}`;

      return message;
    },
    noShop: 'Создайте магазин, чтобы перейти в панель продавца.',
    noWorkers: (shop) => `Работники магазина ${shop}. Пока никто не подключён.`,
    workersListTitle: (shop) => `Работники магазина ${shop}.`,
    workersListInstruction: 'Выберите сотрудника, чтобы отключить доступ.',
    workersMenuIntro: (shop) => `Работники магазина ${shop}. Выберите действие.`,
    workersProOnly:
      'Работники доступны на тарифе PRO. Откройте раздел «Управление подпиской», чтобы обновить тариф.',
    workersOwnerOnly: 'Только владелец магазина может управлять работниками.',
    workerAdded: (name) => `Работник ${name} добавлен. У него есть доступ к продуктам магазина.`,
    workerRemoved: 'Доступ сотрудника отключён.',
    workerPrompt: `Введите @username или user ID работника, которому хотите дать доступ к магазину.\n\nПримеры:\n• @username\n• 123456789`,
    workerIdInvalid: 'Введите @username или числовой ID. Пример: @username или 123456789.',
    workerAdding: 'Добавляем сотрудника…',
    workerAddError: 'Не удалось добавить сотрудника. Попробуйте ещё раз.',
    workerAddNotFound: 'Пользователь не найден. Убедитесь, что он запускал бота хотя бы один раз.',
    workerAddAlready: 'Этот пользователь уже подключён к магазину.',
    workerAddOwner: 'Владелец не может быть добавлен как сотрудник.',
    workerLookupError: 'Не удалось получить данные пользователя. Попробуйте ещё раз позже.',
    migration: {
      intro: `🚨 Экстренная миграция канала

Используйте эту функцию ТОЛЬКО если ваш текущий канал заблокирован Telegram.

Что произойдёт:
• Вы укажете новый канал
• Все ваши покупатели получат уведомление
• Они узнают о новом канале через личные сообщения

⚠️ ВНИМАНИЕ: Это действие нельзя отменить!`,
      confirmPrompt: 'Продолжить?',
      askChannel: `🚨 Миграция канала

Введите @username или ссылку на ваш НОВЫЙ канал.

Примеры:
• @my_new_channel
• https://t.me/my_new_channel

После подтверждения все покупатели получат уведомление.`,
      invalidChannel:
        'Похоже, это не похоже на корректный канал. Пример: @my_channel или https://t.me/my_channel',
      channelAccessError:
        'Не удалось проверить новый канал. Убедитесь, что бот добавлен в администраторы и попробуйте снова.',
      confirmation: ({ shopName, channel, buyersCount }) => `⚠️ Подтверждение миграции

Новый канал: ${channel}

Вы уверены? Все ${buyersCount} покупателям придёт сообщение:

"Внимание! Магазин «${shopName}» переехал на новый канал:
${channel}

По техническим причинам старый канал больше не работает. Подпишитесь на новый канал чтобы не пропустить обновления товаров."`,
      sending: 'Отправляем уведомления покупателям…',
      success: ({ channel, buyersCount }) => `✅ Миграция завершена

Уведомления отправлены всем покупателям (${buyersCount} чел).

Новый канал: ${channel}

Не забудьте:
• Настроить новый канал
• Добавить описание и аватар
• Сделать канал публичным`,
      error: 'Не удалось выполнить миграцию. Попробуйте позже.',
      accessDenied: 'Только владелец магазина может выполнять миграцию канала.',
      cancelled: 'Миграция отменена.',
    },
    workerSelectionInvalid: 'Некорректный сотрудник.',
    workerNotFound: 'Сотрудник не найден.',
    workerRemoveConfirm: (name) => `Удалить сотрудника ${name}? Доступ будет отключён сразу.`,
    workerRemoveError: 'Не удалось удалить сотрудника. Попробуйте ещё раз.',
    addProductNamePrompt: 'Введите название товара (от 3 символов).',
    addProductPricePrompt: 'Укажите цену в долларах. Например 99.90.',
    addProductPriceInvalid: 'Нужна сумма больше нуля. Пример: 49.90.',
    addProductSaving: 'Сохраняем товар…',
    addProductSuccess: (name, price) => `Товар «${name}» сохранён за ${price}.`,
    addProductError: 'Не получилось сохранить товар. Попробуйте ещё раз.',
    toolsIntro: `🔧 Инструменты\n\nДополнительные функции для управления магазином:`,
    toolsError: 'Не удалось загрузить инструменты. Попробуйте ещё раз.',
    createShopNamePrompt: 'Введите название магазина (3–100 символов).',
    createShopNameHint: 'Используйте латинские буквы (a-z), цифры и подчёркивание.',
    createShopNameInvalidLength: 'Название должно быть от 3 до 100 символов.',
    createShopNameInvalidChars:
      'Название может содержать только латинские буквы (a-z), цифры и подчёркивание.',
    createShopNameTaken: 'Название уже занято. Попробуйте другое.',
    createShopPromoPrompt: 'Если у вас есть промокод, отправьте его. Если нет — напишите «-».',
    createShopSaving: 'Создаём магазин…',
    createShopSuccess: (name, tier) => `Магазин «${name}» готов. Текущий тариф: ${tier}.`,
    createShopPromoSuccess: (name) => `Магазин «${name}» готов. Тариф PRO активирован промокодом.`,
    createShopError: 'Не удалось создать магазин. Попробуйте ещё раз.',
    walletsIntroEmpty:
      'Кошельки не подключены. Отправьте адрес кошелька — мы автоматически определим валюту.',
    walletsIntroList: (list) => `💰 Ваши кошельки\n\n${list}`,
    walletsChoosePrompt: 'Выберите валюту ниже, чтобы добавить или обновить адрес.',
    walletsPromptReplace: (crypto, example) =>
      `Отправьте новый адрес ${crypto}. Например\n${example}.`,
    walletsAddPrompt:
      'Отправьте адрес кошелька (BTC, ETH, USDT или LTC). Мы автоматически определим валюту.',
    walletsAddPromptSpecific: (crypto) => {
      const examples = {
        BTC: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        ETH: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        USDT: 'TQamF8rf8CuCBcrS85trYW23MsKJc2FMJr',
        LTC: 'ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxmhkny',
      };
      return `Отправьте адрес ${crypto}. Например:\n${examples[crypto] || 'адрес кошелька'}`;
    },
    walletsUnknownAddress: 'Не удалось распознать валюту. Проверьте адрес и попробуйте ещё раз.',
    walletsInvalidAddress: (crypto) => `Адрес не похож на ${crypto}. Проверьте формат и повторите.`,
    walletsSaved: (crypto) => `${crypto} кошелёк добавлен.`,
    walletsUpdated: (crypto) => `${crypto} кошелёк обновлён.`,
    walletsDeleted: (crypto) => `${crypto} кошелёк удалён.`,
    walletsDeleteConfirm: (crypto) => `Удалить ${crypto} кошелёк?`,
    walletsNotFound: 'Кошелёк не найден.',
    walletsLoadError: 'Не удалось загрузить кошельки. Попробуйте ещё раз.',
    walletsQrError: 'Не удалось сформировать QR-код. Попробуйте ещё раз.',
    walletsUseButtons: 'Выберите валюту ниже или отправьте адрес в чат.',
    walletsStatusEmpty: 'Не указан',
    walletsUnknownCommand: 'Команда не распознана. Попробуйте ещё раз.',
    paymentHashPrompt: 'Пришлите hash транзакции текстом. Например 0x12…',
    paymentChecking: 'Проверяем платёж… Это может занять до 30 секунд.',
    paymentHashShort: 'Хэш слишком короткий. Скопируйте значение полностью.',
    paymentFailed: 'Не удалось подтвердить платёж. Проверьте сумму и попробуйте снова.',
    subscriptionStatus: (tier) => `Ваш тариф: ${tier === 'pro' ? 'PRO' : 'BASIC'}.`,
    subscriptionStatusLine: (status, date) => {
      const statusLabel = status === 'active' ? 'Активна' : 'Неактивна';
      return date
        ? `Статус: ${statusLabel}\nСледующее продление: ${date}`
        : `Статус: ${statusLabel}`;
    },
    subscriptionGraceNotice: 'Продлите подписку, чтобы сохранить доступ ко всем функциям.',
    subscriptionInactiveNotice:
      'Подписка не активна. Нажмите «Оплатить подписку», чтобы продолжить.',
    subscriptionUpgradePrompt: 'Обновитесь до PRO, чтобы открыть дополнительные возможности.',
    subscriptionProBenefits: 'PRO даёт доступ к расширенной аналитике и продвинутым инструментам.',
    subscriptionStatusError: 'Не удалось загрузить статус подписки. Попробуйте ещё раз.',
    upgrade: {
      alreadyPro: 'Ваш магазин уже на тарифе PRO.',
      notEligible:
        'Апгрейд доступен только для активных BASIC подписок. Сначала оплатите базовую подписку.',
      chooseCrypto: (cost) => `Апгрейд на PRO: $${cost}\n\nВыберите валюту для оплаты.`,
      cancelled: 'Апгрейд отменён.',
      unknownCommand: 'Команда не распознана. Попробуйте ещё раз.',
      error: (msg) => `Не удалось выполнить апгрейд. ${msg}`,
      confirmPrompt: (tier, amount) =>
        `Выбран тариф: ${tier.toUpperCase()}\nСумма: $${amount}\n\nВыберите валюту для оплаты.`,
      paymentDetails: (cost, currency, address) =>
        `Доплата: $${cost}\nВалюта: ${currency}\nАдрес для оплаты: ${address}\n\nПосле оплаты отправьте TX hash сюда.`,
      sendHashPrompt: 'Отправьте TX hash текстом.',
      hashInvalid: 'TX hash слишком короткий. Проверьте строку и попробуйте ещё раз.',
      verifying: 'Проверяем платёж… Это может занять до 30 секунд.',
      success: (endDate) => `Оплата подтверждена. Тариф: PRO\nДействует до ${endDate}`,
      benefits: 'PRO включает безлимит товаров, автозакуп и уведомления подписчикам.',
      duplicateTx: 'Эта транзакция уже использована. Отправьте другой TX hash.',
      verificationFailed: 'Не удалось подтвердить платёж. Проверьте сумму и попробуйте ещё раз.',
      verificationError: 'Не удалось проверить платёж. Попробуйте ещё раз.',
    },
    aiProducts: {
      processing: 'Обрабатываю предыдущую команду. Подождите...',
      rateLimitReached: 'Слишком много команд. Подождите минуту.',
      operationExpired: 'Операция устарела. Попробуйте снова.',
      productNotFound: 'Товар не найден.',
      productDeleted: (name, price) => `Удалён: ${name} ($${price})`,
      productDeleteError: 'Не удалось удалить товар.',
      processingError: 'Ошибка обработки.',
      applyingChanges: 'Применяю изменения...',
      stockRequired: 'Укажите количество товара. Например: "добавь iPhone за 500 10 штук"',
      nameMinLength: 'Название должно быть минимум 3 символа.',
      pricePositive: 'Цена должна быть больше 0.',
      stockNotSpecified: 'Не указано количество товара.',
      apiError: 'Ошибка API. Попробуйте позже.',
      productsEmpty: 'Товаров пока нет.',
      productsList: (count, list) => `Товары (${count}):\n\n${list}`,
      invalidOperation: 'Операция должна быть "увеличить" или "уменьшить".',
      operationNames: {
        decrease: 'Скидка',
        increase: 'Повышение',
      },
      bulkPricePrompt: (operation, percentage, preview) =>
        `${operation} ${percentage}%\n\n${preview}\n\n⚠️ Применить изменения для всех товаров?`,
    },
    activeOrders: {
      empty: 'Нет активных заказов.\n\nОплаченные заказы появятся здесь автоматически.',
      title: (count) => `Активные заказы (${count})`,
    },
    orderHistory: {
      empty:
        '📋 История заказов пуста\n\nЗдесь будут отображаться завершённые заказы (статус: доставлено).',
      title: (count) => `История заказов (${count})`,
    },
    activeOrdersContext: `📦 Активные заказы

Здесь заказы, которые оплачены покупателем и ожидают отправки.

После отправки товара нажмите "✓ Отправлено" - покупатель получит уведомление.`,
    activeOrdersEmpty: `📦 Активные заказы

Пока нет активных заказов.

Заказы появятся здесь автоматически после оплаты покупателем.`,
    orderHistoryContext: `📋 История заказов

Здесь отображаются завершённые заказы - те, которые вы отметили как "Отправлено".

Используйте историю для отслеживания продаж и выручки.`,
    orderHistoryEmpty: `📋 История заказов

Пока нет завершённых заказов.

Заказы появятся здесь после того, как вы отметите их как "Отправлено".`,
    subscriptionBasicInfo: (data) => {
      const statusLabel = data.status === 'active' ? 'Активна' : 'Неактивна';

      return `🔔 Управление подпиской

Ваш тариф: BASIC (бесплатно)
Статус: ${statusLabel}

Что доступно:
- До 2 магазинов для отслеживания
- Статистика за 7 дней
- Базовая аналитика

Хотите больше? Обновитесь до PRO для расширенных возможностей.`;
    },
    subscriptionProInfo: (data) => {
      const statusLabel = data.status === 'active' ? 'Активна' : 'Неактивна';
      const renewDate = data.renewDate ? new Date(data.renewDate).toLocaleDateString('ru-RU') : '—';

      return `🔔 Управление подпиской

Ваш тариф: PRO ($1/мес)
Статус: ${statusLabel}
Следующее продление: ${renewDate}

Преимущества PRO:
- Безлимит магазинов для отслеживания
- Выбор периода статистики
- Расширенная аналитика

У вас есть доступ ко всем функциям!`;
    },
    walletsContext: `💰 Кошельки для приёма платежей

Добавьте адреса ваших криптокошельков — на них будут приходить оплаты от покупателей.

Поддерживаемые валюты:
• BTC (Bitcoin)
• ETH (Ethereum)
• USDT (Tether TRC-20)
• LTC (Litecoin)

Можно добавить все 4 валюты — покупатель выберет удобную при оплате.`,
    workersContext: `👥 Работники магазина

Функция доступна только на PRO тарифе.

Зачем это нужно?
Добавьте сотрудников, которые смогут управлять товарами и заказами от вашего имени. Вы остаётесь владельцем магазина.

Что могут работники:
• Добавлять и редактировать товары
• Просматривать заказы
• Отмечать заказы отправленными

Что НЕ могут работники:
• Менять настройки магазина
• Управлять подпиской
• Удалять магазин`,
    bulkShip: {
      prompt: 'Введите номера заказов через пробел (например: 1 3 5 или 1-5)',
      confirmTitle: (count) => `Подтверждение отправки (${count})`,
      confirmList: (orders) => {
        return orders
          .map((o, i) => {
            const buyer = o.buyer_username ? `@${o.buyer_username}` : 'Покупатель';
            return `${i + 1}. ${buyer} — ${o.product_name} (${o.quantity} шт) — $${o.total_price}`;
          })
          .join('\n');
      },
      success: (count) => `✅ ${count} заказов отмечены как отправленные`,
      invalidInput: 'Не удалось распознать номера. Попробуйте ещё раз.',
      invalidNumbers: (invalid) => `Заказов не существует: ${invalid.join(', ')}`,
      cancelled: 'Отметка отменена',
    },
  },
  follows: {
    contextDetailed: `👀 Следить

Эта функция позволяет отслеживать наличие товаров в других магазинах.

🔍 МОНИТОРИНГ
└─ Отслеживайте наличие товаров
└─ Всегда знайте что есть у ваших поставщиков
└─ Товары НЕ копируются в ваш магазин

💰 ПЕРЕПРОДАЖА
└─ Товары автоматически копируются к вам
└─ Вы добавляете свою наценку (1-500%)
└─ Продавайте товары поставщиков эффективно

Зачем это нужно?
Мониторинг — чтобы знать ассортимент поставщиков
Перепродажа — чтобы продавать их товары с наценкой`,
    createModePromptDetailed: (shopName) => `👀 Подписка на магазин "${shopName}"

Выберите режим работы:

🔍 МОНИТОРИНГ
└─ Отслеживайте наличие товаров
└─ Знайте что есть у поставщика
└─ Товары остаются в их магазине

💰 ПЕРЕПРОДАЖА
└─ Товары копируются к вам автоматически
└─ Вы устанавливаете наценку 1-500%
└─ Продавайте их товары эффективно`,
    emptyState: `👀 Следить

У вас пока нет активных подписок.

Добавьте магазин для отслеживания — выберите режим мониторинга или перепродажи.`,
    listHeader: (count) => `👀 Ваши подписки${count ? ` (${count})` : ''}`,
    listTitle: (count) => `👀 Ваши подписки (${count})`,
    listEmpty:
      'У вас пока нет активных подписок.\n\nДобавьте магазин для отслеживания — выберите режим мониторинга или перепродажи.',
    listItem: ({ index, name, mode, markup }) => {
      const icon = mode === 'resell' ? '💰' : '🔍';
      const suffix =
        mode === 'resell' && Number.isFinite(markup) ? `, +${Number(markup).toFixed(0)}%` : '';
      const modeText = mode === 'resell' ? 'Перепродажа' : 'Мониторинг';
      return `${index}. 🏪 ${name} (${icon} ${modeText}${suffix})`;
    },
    listManageHint: 'Нажмите на подписку для управления.',
    listTitle2: '👀 Ваши подписки',
    detail: ({ name, mode, markup, sourceProducts = 0, syncedProducts = 0 }) => {
      const isResell = mode === 'resell';
      const markupValue = isResell ? `${Number(markup ?? 0).toFixed(0)}%` : '—';
      const modeLabel = isResell ? '💰 Перепродажа' : '🔍 Мониторинг';

      const lines = [
        `🏪 Магазин: ${name}`,
        `Режим: ${modeLabel}`,
        `Наценка: ${markupValue}`,
        `Товаров в их каталоге: ${sourceProducts}`,
        `Скопировано к вам: ${syncedProducts}`,
      ];

      if (isResell) {
        lines.push(
          '',
          'Как это работает:',
          `Товары автоматически копируются в ваш магазин с наценкой ${markupValue}.`,
          'Когда поставщик меняет цену — ваша цена обновляется автоматически.'
        );
      } else {
        lines.push(
          '',
          'Как это работает:',
          'Вы отслеживаете наличие товаров и обновления каталога поставщика.',
          'Товары остаются в их магазине — вы получаете уведомления о наличии.'
        );
      }

      return lines.join('\n');
    },
    topMonitorTitle: (count, total) => {
      const suffix =
        total && total > count ? ` (${count} из ${total})` : count ? ` (${count})` : '';
      return `🔍 Каталог поставщика${suffix}`;
    },
    topResellTitle: (count, total) => {
      const suffix =
        total && total > count ? ` (${count} из ${total})` : count ? ` (${count})` : '';
      return `💰 Скопированные товары${suffix}`;
    },
    monitorProductsEmpty: 'У поставщика пока нет товаров.',
    resellProductsEmpty:
      'Нет скопированных товаров. Переключитесь в режим «Перепродажа», чтобы копировать каталог.',
    monitorProductLine: ({ index, name, price, stock }) => {
      const stockText = Number.isFinite(stock) ? `${stock} шт` : '—';
      return `${index}. ${name} — $${price} (${stockText})`;
    },
    resellProductLine: ({ index, name, sourcePrice, syncedPrice, diff }) => {
      const diffText = diff > 0 ? ` (+$${diff})` : diff < 0 ? ` (-$${Math.abs(diff)})` : '';
      return `${index}. ${name}\n   Поставщик: $${sourcePrice}\n   Ваш магазин: $${syncedPrice}${diffText}`;
    },
    notFound: 'Подписка не найдена.',
    loadError: 'Не удалось загрузить подписку. Попробуйте ещё раз.',
    accessDenied: 'Нет доступа к этой подписке.',
    deleteSuccess: 'Подписка удалена.',
    deleteError: 'Не удалось удалить подписку. Попробуйте ещё раз.',
    modeLimit: 'Взаимные подписки не поддерживаются. Удалите обратную связь и повторите.',
    limitReached: 'Достигнут лимит подписок. Обновите тариф, чтобы продолжить.',
    markupPrompt: 'Введите наценку от 1 до 500%.',
    markupInvalid: 'Наценка должна быть в диапазоне от 1 до 500%.',
    markupUpdated: (value) => `Наценка обновлена до ${value}%.`,
    modeChanged: 'Режим обновлён.',
    switchError: 'Не удалось изменить режим. Попробуйте ещё раз.',
    createEnterId: 'Введите ID магазина для подписки.',
    createIdInvalid: 'Нужен числовой ID. Например 123.',
    createShopNotFound: 'Магазин не найден. Проверьте ID и попробуйте снова.',
    createCheckError: 'Не удалось проверить магазин. Попробуйте ещё раз.',
    createSelfFollow: 'Нельзя подписаться на собственный магазин.',
    createLimitReached: (count, limit) =>
      `Достигнут лимит подписок (${count}/${limit}). Обновите тариф, чтобы продолжить.`,
    createModePrompt: 'Выберите режим подписки.',
    createSaving: 'Сохраняем подписку…',
    createMonitorSuccess: 'Подписка (мониторинг) оформлена.',
    createResellPrompt: 'Введите наценку от 1 до 500%.',
    createMarkupInvalid: 'Наценка должна быть в диапазоне от 1 до 500%.',
    createResellSuccess: (markup) => `Подписка (перепродажа) оформлена. Наценка: ${markup}%.`,
    createExists: 'Подписка уже существует.',
    createCircular: 'Взаимные подписки не поддерживаются. Удалите обратную связь и повторите.',
    createError: 'Не удалось оформить подписку. Попробуйте ещё раз.',
    createCancelled: 'Создание подписки отменено.',
    limitReachedBasicToPro: 'Лимит подписок\n\nBASIC — до 2 магазинов\nPRO — безлимит ($1/мес)',
    createCircularDetailed:
      'Циклическая подписка\n\nЭтот магазин уже подписан на ваш магазин. Взаимные подписки не разрешены',
    cancelOperationError: 'Произошла ошибка при отмене\n\nПопробуйте позже',
  },
  subscription: {
    chooseTierIntro: 'Выберите тариф.',
    tierDescriptionBasic: 'BASIC — $1/мес\nДо 4 товаров',
    tierDescriptionPro: 'PRO — $1/мес\nБезлимит товаров, рассылки',
    chooseCryptoIntro: (tier, amount) =>
      `Тариф ${tier.toUpperCase()} — ${amount}. Выберите валюту для оплаты.`,
    paymentDetails: (tier, amount, currency, address) =>
      `Тариф ${tier.toUpperCase()} — ${amount}` +
      `\nВалюта: ${currency}` +
      `\nАдрес для оплаты: ${address}` +
      `\nПосле оплаты отправьте TX hash сюда.`,
    sendHashPrompt: 'Отправьте TX hash текстом.',
    hashInvalid: 'TX hash слишком короткий. Проверьте строку и попробуйте ещё раз.',
    verifying: 'Проверяем платёж… Это может занять до 30 секунд.',
    verificationSuccess: (tier, date, id) =>
      `Оплата подтверждена. Тариф: ${tier.toUpperCase()}\n` +
      `Действует до ${date}\nID подписки: ${id}`,
    proBenefits:
      'PRO включает безлимитные подписчики, рассылку при смене канала и приоритетную поддержку.',
    duplicateTx: 'Эта транзакция уже использована. Отправьте другой TX hash.',
    verificationFailed: 'Не удалось подтвердить платёж. Проверьте сумму и попробуйте ещё раз.',
    verificationError: 'Не удалось проверить платёж. Попробуйте ещё раз.',
    cancelled: 'Оплата отменена.',
    unknownCommand: 'Команда не распознана. Попробуйте ещё раз.',
    invalidTier: 'Неверный тариф. Попробуйте ещё раз.',
    invalidCrypto: 'Неверная криптовалюта. Выберите из списка.',
    confirmPrompt: (tier, amount) =>
      `Выбран тариф: ${tier.toUpperCase()}\nСумма: ${amount}\n\nВыберите валюту для оплаты.`,
    promoPrompt: 'Введите промокод.',
    promoInvalid: 'Промокод слишком короткий. Попробуйте ещё раз.',
    promoAccepted: (code) => `Промокод «${code}» сохранён.`,
    chooseTierCancelled: 'Выбор тарифа отменён.',
    promoTextPrompt: 'Пожалуйста, отправьте промокод текстом.',
    generatingInvoice: 'Генерируем адрес для оплаты…',
    invoiceGenerated: (tier, amount, currency, address, expiresAt, cryptoAmount) => {
      // Minimalist invoice message
      const amountLine = cryptoAmount
        ? `${cryptoAmount} ${currency}`
        : `${amount} (USD)`;

      return (
        `💎 <b>Оплата подписки</b>\n` +
        `Тариф: ${tier.toUpperCase()}\n` +
        `Сумма: <b>${amountLine}</b>\n\n` +
        `Адрес (нажмите чтобы скопировать):\n` +
        `<code>${address}</code>\n\n` +
        `После отправки средств пришлите <b>ссылку на транзакцию</b> или <b>TX Hash</b> в этот чат.`
      );
    },
    checkingPayment: 'Проверяем поступление платежа…',
    paymentPending:
      'Платёж ещё не поступил. Проверка происходит автоматически каждую минуту.\n\nПосле оплаты подождите несколько минут и нажмите "Обновить".',
    paymentExpired: 'Срок действия счёта истёк. Создайте новый счёт для оплаты.',
    invoiceError: 'Не удалось создать счёт. Попробуйте ещё раз.',
    paymentStatusError: 'Не удалось проверить статус платежа. Попробуйте ещё раз.',
    chainMappings: {
      BTC: 'Bitcoin (BTC)',
      LTC: 'Litecoin (LTC)',
      ETH: 'Ethereum (ETH)',
      USDT_ERC20: 'USDT (ERC-20)',
      USDT_TRC20: 'USDT (TRC-20)',
    },
  },
  workspace: {
    panel: 'Рабочее место. Выберите магазин.',
    noAccess: 'Функция доступна после создания магазина.',
    noWorkerAccess:
      'У вас нет доступа к workspace магазинам. Попросите владельца магазина добавить вас как работника.',
    loadError: 'Не удалось загрузить данные. Попробуйте ещё раз.',
    selectShop: 'Рабочие места. Выберите магазин.',
    actionFailed: 'Произошла ошибка. Попробуйте позже.',
    shopNotFoundOrRevoked: 'Магазин не найден или доступ отозван.',
    header: (shopName) => `Workspace: ${shopName}\n\n`,
  },
  search: {
    prompt: 'Введите название магазина (минимум 2 символа).',
    searching: 'Ищем магазины…',
    noResults: 'Магазины не найдены. Измените запрос.',
    tooShort: 'Введите минимум два символа.',
    inputRequired: 'Отправьте название магазина текстом.',
    error: 'Не удалось выполнить поиск. Попробуйте ещё раз позже.',
  },
  promo: {
    applied: 'Промокод применён. Тариф PRO активирован.',
    invalid: 'Промокод не применён. Создайте магазин без промокода.',
  },
};

export const formatters = {
  shopList: (shops) =>
    shops
      .map((shop) => {
        const seller = shop.seller_username
          ? `@${shop.seller_username}`
          : shop.seller_first_name || 'Продавец';
        const mark = shop.is_subscribed ? ' — в подписках' : '';
        return `• ${shop.name} • ${seller}${mark}`;
      })
      .join('\n'),
  orders: (orders) =>
    orders
      .map((o) => {
        const price = o.total_price || o.totalPrice;
        const statusMap = {
          pending: 'ожидает',
          processing: 'в обработке',
          completed: 'завершён',
          cancelled: 'отменён',
          shipped: 'отправлен',
        };
        const status = statusMap[o.status] || o.status;
        const shopName = o.shop_name || 'Магазин';
        return `• ${status} ${shopName} — $${Number(price || 0).toFixed(2)}`;
      })
      .join('\n'),
  subscriptions: (subscriptions) =>
    subscriptions
      .map((sub) => {
        const name = sub.shop_name || sub.shopName || 'Магазин';
        return `• ${name}`;
      })
      .join('\n'),
  followsList: (follows) =>
    follows
      .map((follow) => {
        const name = follow.source_shop_name || follow.sourceShopName || follow.name || 'Магазин';
        const mode = follow.mode === 'resell' ? 'перепродажа' : 'мониторинг';
        const markupValue = follow.markup_percentage ?? follow.markup ?? 0;
        const markup = Number.isFinite(Number(markupValue))
          ? `${Number(markupValue).toFixed(0)}%`
          : `${markupValue}`;
        const markupText = follow.mode === 'resell' ? `, наценка ${markup}` : '';
        return `• ${name} — ${mode}${markupText}`;
      })
      .join('\n'),
  productsList: (products, shopName) => {
    if (!products.length) {
      return `Товары магазина ${shopName}. Пока товаров нет.`;
    }
    const lines = products
      .slice(0, 5)
      .map((product) => `• ${product.name} — $${Number(product.price ?? 0).toFixed(2)}`);
    const extra = products.length > 5 ? `\n… ещё ${products.length - 5}` : '';
    return `Товары магазина ${shopName} (${products.length}).\n${lines.join('\n')}${extra}`;
  },
  salesList: (orders, shopName) => {
    if (!orders.length) {
      return `Заказы магазина ${shopName}. Пока нет продаж.`;
    }
    const lines = orders.slice(0, 5).map((order) => {
      const buyer = order.buyer_username
        ? `@${order.buyer_username}`
        : order.buyer_first_name || 'Покупатель';
      const status = order.status || 'processing';
      const price = Number(order.total_price || order.totalPrice || 0).toFixed(2);
      return `• ${buyer} — ${status} — $${price}`;
    });
    const extra = orders.length > 5 ? `\n… ещё ${orders.length - 5}` : '';
    return `Заказы магазина ${shopName} (${orders.length}).\n${lines.join('\n')}${extra}`;
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
      .map((product) => `• ${product.name} — $${Number(product.price ?? 0).toFixed(2)}`);
    const extra = count > 5 ? `\n… ещё ${count - 5}` : '';

    return `${title}\n${lines.join('\n')}${extra}`;
  },
  shopInfo: (shop, sections) => {
    const seller = shop.seller_username
      ? `@${shop.seller_username}`
      : shop.seller_first_name || 'Продавец';
    const stock = sections.stock || [];
    const preorder = sections.preorder || [];

    const stockLines = stock
      .slice(0, 3)
      .map((p) => `• ${p.name} — $${Number(p.price || 0).toFixed(2)}`);
    const preorderLines = preorder
      .slice(0, 3)
      .map((p) => `• ${p.name} — $${Number(p.price || 0).toFixed(2)}`);

    const extraStock = stock.length > 3 ? `\n… ещё ${stock.length - 3}` : '';
    const extraPreorder = preorder.length > 3 ? `\n… ещё ${preorder.length - 3}` : '';

    const stockSection = stock.length ? `${stockLines.join('\n')}${extraStock}` : '• пока пусто';
    const preorderSection = preorder.length
      ? `${preorderLines.join('\n')}${extraPreorder}`
      : '• ожидаем поставку';

    return `${shop.name} • ${seller}\n\nНаличие — ${stock.length || 0}\n${stockSection}\n\nПредзаказ — ${preorder.length || 0}\n${preorderSection}`;
  },
};
