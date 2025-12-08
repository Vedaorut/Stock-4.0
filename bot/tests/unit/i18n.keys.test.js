/**
 * i18n Keys Tests
 *
 * Verifies that all required translation keys exist in both locales
 */

import { describe, it, expect } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ruLocale = require('../../src/i18n/locales/ru.json');
const enLocale = require('../../src/i18n/locales/en.json');

/**
 * Helper to get nested value by dot-notation path
 * @param {object} obj - Object to traverse
 * @param {string} path - Dot-notation path (e.g., 'a.b.c')
 * @returns {*} Value at path or undefined
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

describe('Bot i18n - Required Keys', () => {
  const requiredKeys = [
    'buttons.checkPayment',
    'formatters.revenueLabel',
    'errors.genericError',
    'errors.authRequired',
    'errors.sessionExpired',
    'errors.loadError',
    'errors.serverUnavailable',
    'errors.loadShopsError',
    'errors.accessCheckError',
    'errors.noShopAccess',
    'errors.authenticationFailed',
    'errors.noSubscriptionToUpgrade',
    'errors.invalidPaymentMethod',
    'errors.invalidShopId',
  ];

  describe('Russian locale', () => {
    requiredKeys.forEach((key) => {
      it(`should have key "${key}"`, () => {
        const value = getNestedValue(ruLocale, key);
        expect(value).toBeDefined();
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });

  describe('English locale', () => {
    requiredKeys.forEach((key) => {
      it(`should have key "${key}"`, () => {
        const value = getNestedValue(enLocale, key);
        expect(value).toBeDefined();
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });
});
