import { describe, it, expect } from 'vitest';
import ruLocale from '../locales/ru.json';
import enLocale from '../locales/en.json';

/**
 * Helper function to get nested value from object by dot-separated path
 * @param {object} obj - The object to search in
 * @param {string} path - Dot-separated path (e.g., 'common.retry')
 * @returns {*} The value at the path or undefined
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

describe('WebApp i18n - Required Keys', () => {
  const requiredKeys = [
    // common
    'common.authRequired',
    'common.restartBot',
    'common.retry',

    // cart
    'cart.validationError',
    'cart.shopNotFound',
    'cart.invalidPrice',
    'cart.invalidQuantity',
    'cart.stockLimited',
    'cart.missingProductId',
    'cart.missingShopInfo',
    'cart.multipleShops',
    'cart.zeroTotal',
    'cart.empty',
    'cart.cannotOrderOwn',
    'cart.clearForOtherShop',

    // payment
    'payment.alreadyCreating',
    'payment.connectionError',
    'payment.exchangeUnavailable',
    'payment.timeout',
    'payment.invoiceExpired',
    'payment.timeoutInvoice',
    'payment.alreadySubmitting',
    'payment.timeoutVerify',
    'payment.txNotConfirmed',
    'payment.amountMismatch',
    'payment.invalidWallet',
    'payment.windowExpired',
    'payment.invalidTxHash',
    'payment.txHashLabel',
    'payment.verifyingTransaction',
    'payment.verifyingDesc',
    'payment.verifyError',
    'payment.errorTitle',
    'payment.unexpectedError',

    // follows
    'follows.productMarkupError',
  ];

  describe('Russian locale', () => {
    requiredKeys.forEach(key => {
      it(`should have key "${key}"`, () => {
        const value = getNestedValue(ruLocale, key);
        expect(value).toBeDefined();
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });

  describe('English locale', () => {
    requiredKeys.forEach(key => {
      it(`should have key "${key}"`, () => {
        const value = getNestedValue(enLocale, key);
        expect(value).toBeDefined();
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Locale consistency', () => {
    it('should have the same keys in both locales', () => {
      requiredKeys.forEach(key => {
        const ruValue = getNestedValue(ruLocale, key);
        const enValue = getNestedValue(enLocale, key);

        expect(ruValue, `Missing key "${key}" in Russian locale`).toBeDefined();
        expect(enValue, `Missing key "${key}" in English locale`).toBeDefined();
      });
    });
  });
});
