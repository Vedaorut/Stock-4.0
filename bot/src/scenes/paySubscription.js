/**
 * Pay Subscription Scene
 *
 * Multi-step wizard for paying monthly shop subscription
 *
 * Steps:
 * 1. Show pricing and select tier (basic $25 or pro $35)
 * 2. Select cryptocurrency
 * 3. Auto-generate payment address via Backend API
 * 4. User clicks "I paid" button
 * 5. Auto-verify payment and activate subscription
 */

import { Scenes, Markup } from 'telegraf';
import { subscriptionApi, walletApi, shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { reply as cleanReply, replyHTML as cleanReplyHTML } from '../utils/cleanReply.js';
import { messages, buttons as buttonText } from '../texts/messages.js';
import { showSellerMainMenu } from '../utils/sellerNavigation.js';
import { generateQRWithTimeout } from '../utils/qrHelper.js';
import {
  normalizePaymentState,
  paymentStateKeyboard,
  paymentStateMessage,
} from '../utils/paymentUi.js';

const { general: generalMessages, subscription: subMessages } = messages;

const BASIC_PRICE_LABEL = '$1';
const PRO_PRICE_LABEL = '$1';

// Chain mappings (Bot → Backend API format)
const CHAIN_MAPPINGS = {
  BTC: 'BTC',
  LTC: 'LTC',
  ETH: 'ETH',
  USDT: 'USDT_TRC20',
};

const paySubscriptionScene = new Scenes.WizardScene(
  'pay_subscription',

  // Step 1: Show pricing and tier selection
  async (ctx) => {
    try {
      // Check if tier was passed on scene entry (from chooseTier scene)
      const enteredWithTier = ctx.scene.state?.tier;
      const createShopAfter = ctx.scene.state?.createShopAfter;

      // FIRST SUBSCRIPTION MODE: User creating first shop (subscriptionId created by chooseTier)
      if (enteredWithTier) {
        const subscriptionId = ctx.scene.state?.subscriptionId;

        if (!subscriptionId) {
          logger.error('[PaySubscription] Missing subscriptionId!', {
            userId: ctx.from.id,
            sceneState: ctx.scene.state,
          });

          await cleanReply(ctx, '❌ Ошибка: не удалось создать подписку. Попробуйте снова.');
          return ctx.scene.leave();
        }

        logger.info(
          `[PaySubscription] Entered with tier: ${enteredWithTier}, subscriptionId: ${subscriptionId}`
        );

        // Save to wizard state
        ctx.wizard.state.tier = enteredWithTier;
        ctx.wizard.state.subscriptionId = subscriptionId;
        ctx.wizard.state.createShopAfter = createShopAfter;
        const amount = enteredWithTier === 'pro' ? PRO_PRICE_LABEL : BASIC_PRICE_LABEL;
        ctx.wizard.state.amount = amount;

        // Skip to crypto selection (Step 3)
        const message = subMessages.confirmPrompt(enteredWithTier, amount);

        await cleanReplyHTML(
          ctx,
          message,
          Markup.inlineKeyboard([
            [Markup.button.callback('₿ Bitcoin (BTC)', 'subscription:crypto:BTC')],
            [Markup.button.callback('Ł Litecoin (LTC)', 'subscription:crypto:LTC')],
            [Markup.button.callback('Ξ Ethereum (ETH)', 'subscription:crypto:ETH')],
            [Markup.button.callback('₮ Tether USDT (TRC20)', 'subscription:crypto:USDT')],
            [Markup.button.callback(buttonText.cancel, 'seller:menu')],
          ])
        );

        return ctx.wizard.selectStep(2);
      }

      // RENEWAL MODE: Existing shop renewing subscription
      const shopId = ctx.session.shopId;

      if (!shopId) {
        await smartMessage.send(ctx, { text: generalMessages.shopRequired });
        return ctx.scene.leave();
      }

      // Get current subscription status
      const token = ctx.session.token;
      if (!token) {
        await smartMessage.send(ctx, { text: generalMessages.authorizationRequired });
        return ctx.scene.leave();
      }

      const statusResponse = await subscriptionApi.getStatus(shopId, token);
      const shopName = ctx.session.shopName || 'Магазин';

      const message = [
        subMessages.chooseTierIntro,
        subMessages.tierDescriptionBasic,
        subMessages.tierDescriptionPro,
      ].join('\n\n');

      await cleanReplyHTML(
        ctx,
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback(buttonText.tierBasic, 'subscription:tier:basic')],
          [Markup.button.callback(buttonText.tierPro, 'subscription:tier:pro')],
          [Markup.button.callback(buttonText.cancel, 'seller:menu')],
        ])
      );

      // Save shop info and subscription ID for next steps
      ctx.wizard.state.shopId = shopId;
      ctx.wizard.state.shopName = shopName;
      ctx.wizard.state.subscriptionId = statusResponse.currentSubscription?.id;

      if (!ctx.session.shopName) {
        ctx.session.shopName = shopName;
      }

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[PaySubscription] Step 1 error:', error);

      const errorMsg = error.response?.data?.error || error.message;
      await cleanReply(
        ctx,
        `❌ Ошибка: ${errorMsg}`,
        Markup.inlineKeyboard([[Markup.button.callback(buttonText.backToMenu, 'seller:menu')]])
      );

      return ctx.scene.leave();
    }
  },

  // Step 2: Handle tier selection and show crypto options
  async (ctx) => {
    if (!ctx.callbackQuery) {
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle cancel
    if (data === 'seller:menu') {
      await ctx.answerCbQuery(subMessages.cancelled);
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    if (!data.startsWith('subscription:tier:')) {
      await ctx.answerCbQuery(subMessages.unknownCommand, { show_alert: true });
      return;
    }

    const tier = data.replace('subscription:tier:', '');
    if (tier !== 'basic' && tier !== 'pro') {
      await ctx.answerCbQuery(subMessages.invalidTier);
      return;
    }

    await ctx.answerCbQuery();

    const amount = tier === 'pro' ? PRO_PRICE_LABEL : BASIC_PRICE_LABEL;
    ctx.wizard.state.tier = tier;
    ctx.wizard.state.amount = amount;

    const message = subMessages.confirmPrompt(tier, amount);

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(buttonText.cryptoBTC, 'subscription:crypto:BTC')],
        [Markup.button.callback(buttonText.cryptoLTC, 'subscription:crypto:LTC')],
        [Markup.button.callback(buttonText.cryptoETH, 'subscription:crypto:ETH')],
        [Markup.button.callback(buttonText.cryptoUSDT, 'subscription:crypto:USDT')],
        [Markup.button.callback(buttonText.back, 'subscription:back')],
      ]),
    });

    return ctx.wizard.next();
  },

  // Step 3: Handle crypto selection and generate payment address
  async (ctx) => {
    if (!ctx.callbackQuery) {
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle back
    if (data === 'subscription:back') {
      await ctx.answerCbQuery();
      return ctx.wizard.back();
    }

    // Handle cancel
    if (data === 'seller:menu') {
      await ctx.answerCbQuery(subMessages.cancelled);
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    // Parse crypto selection
    if (!data.startsWith('subscription:crypto:')) {
      await ctx.answerCbQuery(generalMessages.invalidChoice);
      return;
    }

    const currency = data.replace('subscription:crypto:', '');
    if (!['BTC', 'LTC', 'ETH', 'USDT'].includes(currency)) {
      await ctx.answerCbQuery(subMessages.invalidCrypto);
      return;
    }

    await ctx.answerCbQuery();

    try {
      // Show loading message
      await ctx.editMessageText(subMessages.generatingInvoice, { parse_mode: 'HTML' });

      const { tier, amount, subscriptionId } = ctx.wizard.state;
      const token = ctx.session.token;

      // Map currency to chain format (USDT → USDT_ERC20)
      const chain = CHAIN_MAPPINGS[currency];

      // Generate payment invoice via Backend API
      const invoice = await subscriptionApi.generateSubscriptionInvoice(
        subscriptionId,
        chain,
        token
      );

      // Save invoice details (support both snake_case and camelCase from API)
      ctx.wizard.state.currency = currency;
      ctx.wizard.state.invoiceId = invoice.invoiceId;
      ctx.wizard.state.address = invoice.address;
      ctx.wizard.state.expectedAmount = invoice.expectedAmount; // USD amount
      ctx.wizard.state.cryptoAmount = invoice.cryptoAmount || invoice.crypto_amount; // Exact crypto amount
      ctx.wizard.state.expiresAt = invoice.expiresAt;

      // Display currency name for user
      const currencyDisplayName = subMessages.chainMappings[chain] || currency;

      // P0-BOT-8 FIX: Generate QR code via backend (non-blocking)
      // Backend generates QR, bot just fetches it with timeout protection
      const qrResponse = await generateQRWithTimeout(
        () =>
          walletApi.generateQR(
            {
              address: invoice.address,
              amount: invoice.crypto_amount || invoice.cryptoAmount || invoice.expectedAmount,
              currency: currency,
            },
            token
          ),
        10000 // 10 second timeout
      );

      if (!qrResponse || !qrResponse.success || !qrResponse.data?.qrCode) {
        throw new Error('Failed to generate QR code from backend');
      }

      // Convert base64 to buffer
      const base64Data = qrResponse.data.qrCode.replace(/^data:image\/png;base64,/, '');
      const qrCodeBuffer = Buffer.from(base64Data, 'base64');

      // Prepare message with crypto amount from wizard state
      const cryptoAmount = ctx.wizard.state.cryptoAmount || null;
      const message = subMessages.invoiceGenerated(
        tier,
        amount,
        currencyDisplayName,
        invoice.address,
        invoice.expiresAt,
        cryptoAmount  // Exact crypto amount to send
      );

      // Delete loading message and send QR code with caption
      try {
        await ctx.deleteMessage();
      } catch {
        // Ignore delete errors
      }

      await ctx.replyWithPhoto(
        { source: qrCodeBuffer },
        {
          caption: message,
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔗 Ввести TX Hash', 'subscription:paid')],
            [Markup.button.callback('🔄 Проверить статус', 'subscription:status')],
            [Markup.button.callback(buttonText.cancel, 'seller:menu')],
          ]),
        }
      );

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[PaySubscription] Invoice generation error:', error);

      const errorData = error.response?.data;
      let errorMessage = subMessages.invoiceError;

      // Check if error is QR generation timeout
      if (error.message === 'QR_GENERATION_TIMEOUT') {
        errorMessage =
          'QR код генерируется слишком долго. Попробуйте выбрать другую криптовалюту или попробуйте позже.';
      } else if (errorData?.error) {
        errorMessage += `\n\n${errorData.error}`;
      }

      await ctx.editMessageText(errorMessage, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(buttonText.back, 'subscription:back')],
          [Markup.button.callback(buttonText.cancel, 'seller:menu')],
        ]),
      });

      return;
    }
  },

  // Step 4: Handle "I paid" button and manual tx-hash confirmation
  async (ctx) => {
    // If waiting for tx hash and user sends text
    if (ctx.wizard.state.awaitingTxHash && ctx.message?.text) {
      const inputText = ctx.message.text.trim();
      
      // Logic to extract hash from link or text
      const hashRegex = /\b(0x)?[a-fA-F0-9]{64}\b/;
      const match = inputText.match(hashRegex);
      const txHash = match ? match[0] : inputText;

      const { subscriptionId, tier, createShopAfter } = ctx.wizard.state;
      const token = ctx.session.token;

      let statusMsg;
      try {
        statusMsg = await cleanReply(ctx, '⏳ Проверяем транзакцию...');
        
        const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        let result = null;
        
        // Silent retry loop (handle propagation delays)
        for (let i = 0; i < 3; i++) {
          try {
            result = await subscriptionApi.confirmSubscriptionPayment(
              subscriptionId,
              txHash,
              token
            );
            // If we get here, we have a result (pending or confirmed)
            break;
          } catch (err) {
            // Only retry if it's a 404/400 (not found yet)
            // Log it but don't spam user
            if (i === 2) throw err; // Throw on last attempt
            await delay(4000);
          }
        }

        let status = normalizePaymentState(result);

        // If still pending (seen but unconfirmed), poll quietly
        if (status === 'pending') {
          await ctx.telegram.editMessageText(
             ctx.chat.id, 
             statusMsg.message_id, 
             null, 
             '✅ Оплата найдена! Ожидаем подтверждения сети...'
          );

          // Poll for up to 60 seconds
          for (let j = 0; j < 10; j++) {
            await delay(6000);
            try {
              const check = await subscriptionApi.getSubscriptionPaymentStatus(subscriptionId, token);
              status = normalizePaymentState(check, 'pending');
              if (status === 'paid' || status === 'confirmed' || status === 'expired' || status === 'failed') {
                result = check;
                break;
              }
            } catch (e) { /* ignore polling errors */ }
          }
        }

        // SUCCESS FLOW
        if (status === 'confirmed' || status === 'paid') {
          try {
             await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
          } catch (e) {}

          // Check if user already has a shop (for renewal vs new)
          let hasShop = Boolean(ctx.session.shopId);
          if (!hasShop && token) {
            try {
              const myShops = await shopApi.getMyShop(token);
              if (Array.isArray(myShops) && myShops.length > 0) {
                 hasShop = true;
                 ctx.session.shopId = myShops[0].id;
              }
            } catch (e) {}
          }

          // If new shop creation flow
          if (createShopAfter && !hasShop) {
            await ctx.reply(
              '✅ Оплата получена! Магазин оплачен.\n\n📝 Введите название для вашего магазина:', 
              { parse_mode: 'HTML' }
            );
            
            // Transition immediately
            ctx.wizard.state.awaitingTxHash = false;
            await ctx.scene.leave();
            return ctx.scene.enter('createShop', {
              tier,
              subscriptionId,
              paidSubscription: true, // Flag to skip payment check
            });
          }

          // Renewal / Existing Shop Flow
          await ctx.reply(`✅ Подписка успешно продлена!`, {
            ...Markup.inlineKeyboard([[Markup.button.callback(buttonText.mainMenu, 'seller:menu')]]),
          });

          ctx.wizard.state.awaitingTxHash = false;
          await ctx.scene.leave();
          const { showSellerMainMenu } = await import('../handlers/seller/index.js');
          await showSellerMainMenu(ctx);
          return;
        }

        await ctx.reply(
          paymentStateMessage(status, { hint: 'Ждём подтверждения сети.' }),
          {
            ...paymentStateKeyboard(status, {
              retryCb: 'subscription:retry',
              cancelCb: 'seller:menu',
            }),
          }
        );
        ctx.wizard.state.awaitingTxHash = false;
        return;

      } catch (error) {
        logger.error('[PaySubscription] Verification failed', error);
        
        try {
             if(statusMsg) await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
        } catch (e) {}

        const msg = error.response?.data?.error || 'Транзакция пока не найдена. Попробуйте через минуту.';
          
        await ctx.reply(`⏳ ${msg}`, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Проверить снова', 'subscription:paid')],
            [Markup.button.callback(buttonText.cancel, 'seller:menu')],
          ]),
        });
        ctx.wizard.state.awaitingTxHash = false;
        return;
      }
    }

    if (!ctx.callbackQuery) {
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle cancel
    if (data === 'seller:menu') {
      await ctx.answerCbQuery(subMessages.cancelled);
      await ctx.scene.leave();
      await showSellerMainMenu(ctx);
      return;
    }

    // Handle "check status" without tx hash (legacy)
    if (data === 'subscription:status') {
      await ctx.answerCbQuery();
      try {
        const { subscriptionId } = ctx.wizard.state;
        const token = ctx.session.token;
        const paymentStatus = await subscriptionApi.getSubscriptionPaymentStatus(
          subscriptionId,
          token
        );

        const status = normalizePaymentState(paymentStatus, paymentStatus?.status);

        if (status === 'paid' || status === 'confirmed') {
          await cleanReply(ctx, '✅ Оплата подтверждена!');
           // Try to move forward if possible, or just let them leave
          return;
        }

        await cleanReply(
          ctx,
          paymentStateMessage(status, { hint: 'Если оплатили, отправьте TX hash.' }),
          paymentStateKeyboard(status, {
            retryCb: 'subscription:retry',
            cancelCb: 'seller:menu',
          })
        );
        ctx.wizard.state.awaitingTxHash = !['confirmed', 'paid'].includes(status);
        return;
      } catch (err) {
        await cleanReply(ctx, 'Не удалось проверить статус.');
        return;
      }
    }

    // Handle "I paid" button -> ask for tx hash
    if (data === 'subscription:paid') {
      await ctx.answerCbQuery();
      await cleanReply(
        ctx,
        'Отправьте <b>ссылку на транзакцию</b> или <b>хэш</b> (TXID).'
      );
      ctx.wizard.state.awaitingTxHash = true;
      return;
    }

    // Handle retry
    if (data === 'subscription:retry') {
      await ctx.answerCbQuery();
      return ctx.wizard.selectStep(1);
    }
  }
);

// Leave handler
paySubscriptionScene.leave(async (ctx) => {
  // ✅ P1-2 FIX: Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    delete ctx.wizard.state;
  }
  ctx.scene.state = {};
  logger.info('[PaySubscription] Scene left');
});

export default paySubscriptionScene;
