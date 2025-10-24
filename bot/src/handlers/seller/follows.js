import { followsMenu, followDetailMenu, sellerMenu } from '../../keyboards/seller.js';
import { followApi } from '../../utils/api.js';
import { formatFollowsList, formatFollowDetail } from '../../utils/minimalist.js';
import logger from '../../utils/logger.js';

/**
 * View all follows for current shop
 */
export const handleViewFollows = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await ctx.editMessageText(
        'Сначала создайте магазин',
        sellerMenu('Магазин')
      );
      return;
    }

    if (!ctx.session.token) {
      await ctx.editMessageText(
        'Необходима авторизация',
        sellerMenu(ctx.session.shopName || 'Магазин')
      );
      return;
    }

    const follows = await followApi.getMyFollows(ctx.session.shopId, ctx.session.token);
    const shopName = ctx.session.shopName || 'Магазин';

    const message = formatFollowsList(follows, shopName);

    await ctx.editMessageText(message, followsMenu(shopName));
    logger.info(`User ${ctx.from.id} viewed follows (${follows.length} total)`);
  } catch (error) {
    logger.error('Error fetching follows:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await ctx.editMessageText(
      'Ошибка загрузки',
      followsMenu(shopName)
    );
  }
};

/**
 * Start creating a follow
 */
export const handleCreateFollow = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await ctx.editMessageText(
        'Сначала создайте магазин',
        sellerMenu('Магазин')
      );
      return;
    }

    await ctx.scene.enter('createFollow');
  } catch (error) {
    logger.error('Error entering createFollow scene:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await ctx.editMessageText(
      'Произошла ошибка',
      followsMenu(shopName)
    );
  }
};

/**
 * View follow detail
 */
export const handleFollowDetail = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText('Необходима авторизация');
      return;
    }

    // Get follow details from list
    const follows = await followApi.getMyFollows(ctx.session.shopId, ctx.session.token);
    const follow = follows.find(f => f.id === followId);

    if (!follow) {
      await ctx.editMessageText('Подписка не найдена');
      return;
    }

    const message = formatFollowDetail(follow);

    await ctx.editMessageText(message, followDetailMenu(followId));
    logger.info(`User ${ctx.from.id} viewed follow detail ${followId}`);
  } catch (error) {
    logger.error('Error viewing follow detail:', error);
    
    // Parse backend error
    const errorMsg = error.response?.data?.error;
    
    if (error.response?.status === 404) {
      await ctx.editMessageText('❌ Подписка не найдена');
    } else if (error.response?.status === 403) {
      await ctx.editMessageText('❌ Доступ запрещён');
    } else {
      await ctx.editMessageText('❌ Ошибка загрузки');
    }
  }
};

/**
 * Delete follow with confirmation
 */
export const handleDeleteFollow = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText('Необходима авторизация');
      return;
    }

    await followApi.deleteFollow(followId, ctx.session.token);

    await ctx.editMessageText('✅ Подписка удалена');
    logger.info(`User ${ctx.from.id} deleted follow ${followId}`);
  } catch (error) {
    logger.error('Error deleting follow:', error);
    await ctx.editMessageText('Ошибка удаления');
  }
};

/**
 * Switch follow mode (Monitor ↔ Resell)
 */
export const handleSwitchMode = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText('Необходима авторизация');
      return;
    }

    // Get current follow to determine mode
    const follows = await followApi.getMyFollows(ctx.session.shopId, ctx.session.token);
    const follow = follows.find(f => f.id === followId);

    if (!follow) {
      await ctx.editMessageText('Подписка не найдена');
      return;
    }

    const newMode = follow.mode === 'monitor' ? 'resell' : 'monitor';

    // If switching to resell, need markup percentage
    if (newMode === 'resell') {
      // Store followId in session for later use
      ctx.session.editingFollowId = followId;
      ctx.session.pendingModeSwitch = 'resell';  // Flag that this is a mode switch
      await ctx.editMessageText('Новая наценка (%):\n\n1-500');
      return;
    }

    // Switch to monitor mode
    await followApi.switchMode(followId, newMode, ctx.session.token);

    await ctx.editMessageText('✅ Режим изменён');
    logger.info(`User ${ctx.from.id} switched follow ${followId} to ${newMode}`);
  } catch (error) {
    logger.error('Error switching mode:', error);
    
    const errorMsg = error.response?.data?.error;
    
    if (error.response?.status === 402) {
      await ctx.editMessageText('❌ Лимит достигнут\n\nНужен PRO ($35/мес)');
    } else if (error.response?.status === 404) {
      await ctx.editMessageText('❌ Подписка не найдена');
    } else if (errorMsg?.toLowerCase().includes('circular')) {
      await ctx.editMessageText('❌ Циклическая подписка невозможна');
    } else {
      await ctx.editMessageText('❌ Ошибка изменения режима');
    }
  }
};

/**
 * Handle edit markup button click
 */
export const handleEditMarkup = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const followId = parseInt(ctx.match[1]);

    if (!ctx.session.token) {
      await ctx.editMessageText('Необходима авторизация');
      return;
    }

    // Set session flag to capture next text message
    ctx.session.editingFollowId = followId;

    const promptMsg = await ctx.editMessageText('Новая наценка (%):\n\n1-500');
    // Save message ID for later editMessageText
    ctx.session.editingMessageId = promptMsg.message_id;

    logger.info(`User ${ctx.from.id} initiated markup edit for follow ${followId}`);
  } catch (error) {
    logger.error('Error initiating markup edit:', error);
    await ctx.editMessageText('❌ Ошибка');
  }
};

/**
 * Handle markup update when editingFollowId is set
 */
export const handleMarkupUpdate = async (ctx) => {
  // Only handle if editingFollowId is set
  if (!ctx.session?.editingFollowId) {
    return; // Not our responsibility, pass through
  }

  try {
    const followId = ctx.session.editingFollowId;
    const editingMessageId = ctx.session.editingMessageId;

    // Track user message ID for cleanup
    const userMsgId = ctx.message.message_id;
    const markupText = ctx.message.text.trim().replace(',', '.');
    const markup = parseFloat(markupText);

    if (isNaN(markup) || markup < 1 || markup > 500) {
      // FIX: Use editMessageText instead of reply
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        editingMessageId,
        undefined,
        'Наценка должна быть 1-500%'
      );
      // Don't delete session - allow retry
      await ctx.deleteMessage(userMsgId).catch(() => {});
      return;
    }

    // Delete user message (clean chat pattern)
    await ctx.deleteMessage(userMsgId).catch((err) => {
      logger.debug(`Could not delete user message ${userMsgId}:`, err.message);
    });

    // Check if this is a mode switch or simple markup update
    if (ctx.session.pendingModeSwitch) {
      // Mode switch: use switchMode API (endpoint: /follows/:id/mode)
      await followApi.switchMode(followId, ctx.session.pendingModeSwitch, ctx.session.token, markup);
      delete ctx.session.pendingModeSwitch;
      // FIX: Use editMessageText instead of reply
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        editingMessageId,
        undefined,
        '✅ Режим изменён'
      );
    } else {
      // Simple markup update: use updateMarkup API (endpoint: /follows/:id/markup)
      await followApi.updateMarkup(followId, markup, ctx.session.token);
      // FIX: Use editMessageText instead of reply
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        editingMessageId,
        undefined,
        `✅ Наценка обновлена: ${markup}%`
      );
    }

    delete ctx.session.editingFollowId;
    delete ctx.session.editingMessageId;
    
    logger.info(`User ${ctx.from.id} updated markup for follow ${followId} to ${markup}%`);
  } catch (error) {
    logger.error('Error updating markup:', error);

    const errorMsg = error.response?.data?.error;
    const editingMessageId = ctx.session.editingMessageId;

    let message = '❌ Ошибка изменения наценки';
    if (error.response?.status === 402) {
      message = '❌ Лимит достигнут\n\nНужен PRO ($35/мес)';
    } else if (error.response?.status === 404) {
      message = '❌ Подписка не найдена';
    } else if (errorMsg?.toLowerCase().includes('markup')) {
      message = '❌ Некорректная наценка (1-500%)';
    }

    // FIX: Use editMessageText instead of reply
    if (editingMessageId) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        editingMessageId,
        undefined,
        message
      ).catch((err) => {
        logger.debug('Could not edit error message:', err.message);
      });
    }

    delete ctx.session.editingFollowId;
    delete ctx.session.editingMessageId;
  }
};

/**
 * Setup follow-related handlers
 */
export const setupFollowHandlers = (bot) => {
  // View follows list
  bot.action('follows:list', handleViewFollows);
  bot.action('seller:follows', handleViewFollows);

  // Create follow
  bot.action('follows:create', handleCreateFollow);

  // View follow detail (pattern: follow_detail:123)
  bot.action(/^follow_detail:(\d+)$/, handleFollowDetail);

  // Delete follow (pattern: follow_delete:123)
  bot.action(/^follow_delete:(\d+)$/, handleDeleteFollow);

  // Switch mode (pattern: follow_mode:123)
  bot.action(/^follow_mode:(\d+)$/, handleSwitchMode);

  // Edit markup (pattern: follow_edit:123)
  bot.action(/^follow_edit:(\d+)$/, handleEditMarkup);

  // Handle text for markup updates (EARLY handler - before AI)
  bot.on('text', async (ctx, next) => {
    // ONLY handle if editingFollowId is set, otherwise pass through
    if (ctx.session?.editingFollowId) {
      await handleMarkupUpdate(ctx);
    } else {
      await next(); // Pass to other handlers (AI, etc.)
    }
  });

  logger.info('Follow handlers registered');
};
