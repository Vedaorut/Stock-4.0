import { Markup } from 'telegraf';
import { t } from '../i18n/index.js';

/**
 * Calculate days remaining until a date
 * @param {string|Date} dateStr - Date to calculate days until
 * @returns {number} Days remaining (0 if date is in the past or invalid)
 */
const getDaysRemaining = (dateStr) => {
  if (!dateStr) return 0;
  const end = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
};

/**
 * Get subscription button text based on subscription status
 * @param {Object} options - Subscription options
 * @param {string} lang - Language code
 * @returns {string} Button text
 */
const getSubscriptionButtonText = (options, lang) => {
  const tierLabel = (options.tier || 'pro').toUpperCase();

  // Trial user
  if (options.isTrial) {
    const days = getDaysRemaining(options.trialEndsAt);
    if (days > 0) {
      return t('settings.subscriptionTrial', { days }, lang);
    }
    return t('settings.subscriptionExpired', {}, lang);
  }

  // Grace period
  if (options.subscriptionStatus === 'grace_period') {
    const days = getDaysRemaining(options.nextPaymentDue);
    if (days > 0) {
      return t('settings.subscriptionGrace', { tier: tierLabel, days }, lang);
    }
    return t('settings.subscriptionExpired', {}, lang);
  }

  // Active subscription
  if (options.subscriptionStatus === 'active') {
    const days = getDaysRemaining(options.nextPaymentDue);
    if (days > 0) {
      return t('settings.subscription', { tier: tierLabel, days }, lang);
    }
    return t('settings.subscriptionExpired', {}, lang);
  }

  // Expired or unknown status
  if (options.subscriptionStatus === 'expired' || options.subscriptionStatus === 'cancelled') {
    return t('settings.subscriptionExpired', {}, lang);
  }

  // Fallback to old format
  return t('settings.renewSubscription', { tier: tierLabel }, lang);
};

/**
 * Settings menu keyboard
 * @param {Object} options - { hasShop, isTrial, tier, role, trialEndsAt, nextPaymentDue, subscriptionStatus }
 * @param {string} lang - Language code
 */
export const settingsMenu = (options = {}, lang = 'ru') => {
  const buttons = [
    [Markup.button.callback(t('settings.language', {}, lang), 'settings:language')],
  ];

  // Show "Create Shop" for buyers who don't have a shop yet
  if (!options.hasShop && options.role === 'buyer') {
    buttons.push([
      Markup.button.callback(t('buttons.createShop', {}, lang), 'seller:create_shop'),
    ]);
  }

  // Show subscription button for SELLERS only (not buyers)
  if (options.hasShop && options.role === 'seller') {
    const buttonText = getSubscriptionButtonText(options, lang);

    // For trial users, use exit_trial action
    if (options.isTrial) {
      buttons.push([
        Markup.button.callback(buttonText, 'settings:exit_trial'),
      ]);
    } else {
      // For active/grace/expired subscriptions, use renew action
      buttons.push([
        Markup.button.callback(buttonText, 'settings:renew'),
      ]);
    }
  }

  buttons.push([Markup.button.callback(t('buttons.back', {}, lang), 'settings:back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Language selection keyboard
 */
export const languageSelectMenu = (lang = 'ru') =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(t('settings.languageOptionRu', {}, lang), 'settings:lang:ru'),
      Markup.button.callback(t('settings.languageOptionEn', {}, lang), 'settings:lang:en'),
    ],
    [Markup.button.callback(t('buttons.back', {}, lang), 'settings:main')],
  ]);
