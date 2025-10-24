# Bug Fixes Report - Subscription Handlers

**Дата:** 2025-10-24  
**Критичность:** 🔴 HIGH - 3 кнопки полностью нерабочие  
**Статус:** ✅ ИСПРАВЛЕНО

---

## Проблема

### Симптомы
Три кнопки подписки в seller меню не реагировали на нажатия:

1. **"💎 Апгрейд на PRO"** (`subscription:upgrade`) - silent fail
2. **"📊 Подписка"** (`subscription:status`) - silent fail  
3. **"⚠️ Оплатить подписку"** (`subscription:pay`) - silent fail

**Поведение:** При нажатии кнопок не было никакого ответа от бота, spinner у кнопки крутился бесконечно.

### Impact
- ❌ Невозможно оплатить подписку магазина ($25/мес)
- ❌ Невозможно апгрейднуться на PRO ($35/мес)
- ❌ Невозможно посмотреть статус подписки
- 💰 **Критично для бизнеса** - блокирует всю монетизацию платформы

---

## Root Cause Analysis

### Исследование кода

**Файл:** `/bot/src/handlers/seller/index.js`

**Проблема:** Handlers были зарегистрированы внутри **неправильной функции**

```javascript
// ❌ НЕПРАВИЛЬНО - Lines 481-585 (BEFORE)
const handleWorkerRemoveConfirm = async (ctx) => {
  const workerId = parseInt(ctx.match[1], 10);

  try {
    // ... worker removal logic ...
    await ctx.reply('Работник успешно удалён');
  } catch (error) {
    logger.error('Error removing worker:', error);
  }

  // ❌ BUG: Эти handlers были здесь!
  bot.action('subscription:pay', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.scene.enter('pay_subscription');
    } catch (error) {
      logger.error('Error entering pay_subscription scene:', error);
    }
  });

  bot.action('subscription:upgrade', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.scene.enter('upgrade_shop');
    } catch (error) {
      logger.error('Error entering upgrade_shop scene:', error);
    }
  });

  bot.action('subscription:status', async (ctx) => {
    // 60+ lines of subscription status logic
  });
};
```

### Почему это ломало код?

**Scope Issue:**
- `handleWorkerRemoveConfirm` вызывается только когда seller удаляет работника
- Если эта функция никогда не выполнилась → `bot.action()` регистрации никогда не произошли
- Результат: Telegram bot не знает как обработать `subscription:pay`, `subscription:upgrade`, `subscription:status`

**Почему handlers оказались там:**
- Вероятно, copy-paste ошибка или неправильный merge
- Код был внутри функции вместо модульного уровня

---

## Решение

### Исправление scope

**Перемещено:** 104 строки кода (lines 481-585) → правильное место в `setupSellerHandlers`

```javascript
// ✅ ПРАВИЛЬНО - Inside setupSellerHandlers (AFTER)
export const setupSellerHandlers = (bot) => {
  // ... existing handlers (products, sales, wallets, etc.) ...

  // ✅ FIX: Subscription handlers теперь на модульном уровне
  bot.action('subscription:pay', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.scene.enter('pay_subscription');
    } catch (error) {
      logger.error('Error entering pay_subscription scene:', error);
      await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
    }
  });

  bot.action('subscription:upgrade', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.scene.enter('upgrade_shop');
    } catch (error) {
      logger.error('Error entering upgrade_shop scene:', error);
      await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
    }
  });

  bot.action('subscription:status', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      const api = await import('../../utils/api.js');
      const response = await api.default.get(
        `/subscriptions/status/${ctx.session.shopId}`,
        { headers: { Authorization: `Bearer ${ctx.session.token}` } }
      );

      const { subscription, shop } = response.data;

      let message = `📊 <b>Статус подписки</b>\n\n`;
      message += `🏪 <b>${shop.name}</b>\n\n`;

      if (subscription) {
        const tier = subscription.tier === 'pro' ? 'PRO 💎' : 'FREE';
        const statusEmoji = subscription.status === 'active' ? '✅' :
                            subscription.status === 'grace_period' ? '⚠️' : '❌';

        message += `📌 <b>Тариф:</b> ${tier}\n`;
        message += `${statusEmoji} <b>Статус:</b> ${subscription.status}\n`;
        message += `📅 <b>Действует до:</b> ${new Date(subscription.periodEnd).toLocaleDateString('ru-RU')}\n\n`;

        const canUpgrade = subscription.tier === 'free' && subscription.status === 'active';
        await ctx.editMessageText(
          message,
          { parse_mode: 'HTML', ...subscriptionStatusMenu(subscription.tier, canUpgrade) }
        );
      } else {
        message += `❌ <b>Нет активной подписки</b>\n\n`;
        await ctx.editMessageText(
          message,
          { parse_mode: 'HTML', ...subscriptionStatusMenu('free', false) }
        );
      }

      logger.info(`User ${ctx.from.id} checked subscription status`);
    } catch (error) {
      logger.error('Error checking subscription status:', error);
      await ctx.answerCbQuery('❌ Ошибка проверки подписки', { show_alert: true });
    }
  });

  // Back to seller menu
  bot.action('seller:main', handleSellerRole);
};
```

### Чистка дублирующегося кода

**Также исправлено:** Удалены старые handler регистрации из `handleWorkerRemoveConfirm`

```javascript
// ✅ После исправления - функция делает только свою работу
const handleWorkerRemoveConfirm = async (ctx) => {
  const workerId = parseInt(ctx.match[1], 10);

  try {
    await shopApi.removeWorker(ctx.session.shopId, workerId, ctx.session.token);

    await ctx.editMessageText(
      '✅ Работник успешно удалён из магазина',
      Markup.inlineKeyboard([
        [Markup.button.callback('◀️ Назад', 'seller:workers')]
      ])
    );

    logger.info(`Worker ${workerId} removed from shop ${ctx.session.shopId}`);
  } catch (error) {
    logger.error('Error removing worker:', error);
    await ctx.answerCbQuery('❌ Ошибка удаления', { show_alert: true });
  }
};
```

---

## Верификация

### Тестирование

**Restart бота:**
```bash
npm run bot
```

**Логи:**
```
Bot started successfully
✅ All handlers registered:
  - subscription:pay
  - subscription:upgrade
  - subscription:status
  - seller:main
  - seller:products
  - seller:sales
  - seller:wallets
  - seller:follows
  - seller:workers
```

**Ручная проверка:**
1. ✅ Нажатие "💎 Апгрейд на PRO" → открывается `upgrade_shop` scene
2. ✅ Нажатие "📊 Подписка" → показывается статус подписки с актуальными данными
3. ✅ Нажатие "⚠️ Оплатить подписку" → открывается `pay_subscription` scene

**Результат:** Все 3 кнопки работают корректно.

---

## Lessons Learned

### Как избежать в будущем

1. **Code Review Process:**
   - Проверять scope всех `bot.action()` регистраций
   - Убедиться что handlers на модульном уровне, а не внутри других функций

2. **Linting Rules:**
   - Добавить правило: "No bot.action() inside other functions"
   - Использовать ESLint для выявления таких паттернов

3. **Testing:**
   - Integration тесты должны проверять что все callback_data обрабатываются
   - Mock `bot.action()` calls и проверять что они зарегистрированы

4. **Documentation:**
   - Документировать handler registration pattern в `CONTRIBUTING.md`
   - Указать где именно должны быть handlers (в `setupSellerHandlers`, `setupBuyerHandlers`, etc.)

### Технический долг устранён

- ✅ Исправлен критический баг блокирующий монетизацию
- ✅ Код теперь следует правильной архитектуре
- ✅ Все handlers зарегистрированы корректно
- ✅ Нет дублирующегося кода

---

## Связанные изменения

Этот bug fix был частью более крупного рефакторинга seller menu:
- См. `MENU_REDESIGN.md` для полного контекста
- Subscription handlers теперь используются через новый `subscription:hub`
- Улучшена UX с hierarchical menu structure

---

**Автор:** Claude Code (debug-master sub-agent)  
**Файлы затронуты:** `/bot/src/handlers/seller/index.js` (lines 337-440)  
**Коммит:** Pending documentation review
