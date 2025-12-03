/**
 * i18n Service - Internationalization for backend notifications
 *
 * Simple translation system with:
 * - JSON locale files (ru.json, en.json)
 * - Template parameter substitution
 * - Fallback to key if translation missing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supported languages
const SUPPORTED_LANGUAGES = ['ru', 'en'];
const DEFAULT_LANGUAGE = 'ru';

// Cache for loaded locales
const locales = {};

/**
 * Load locale file
 * @param {string} lang - Language code
 * @returns {object} Locale object
 */
function loadLocale(lang) {
  if (locales[lang]) {
    return locales[lang];
  }

  const localePath = path.join(__dirname, 'locales', `${lang}.json`);

  try {
    const content = fs.readFileSync(localePath, 'utf-8');
    locales[lang] = JSON.parse(content);
    logger.info(`[i18n] Loaded locale: ${lang}`);
    return locales[lang];
  } catch (error) {
    logger.error(`[i18n] Failed to load locale: ${lang}`, { error: error.message });
    return {};
  }
}

/**
 * Get nested value from object by dot-notation key
 * @param {object} obj - Object to search in
 * @param {string} key - Dot-notation key (e.g., 'order.new.title')
 * @returns {string|undefined} Value or undefined
 */
function getNestedValue(obj, key) {
  return key.split('.').reduce((acc, part) => acc?.[part], obj);
}

/**
 * Replace template parameters in string
 * @param {string} template - Template string with {param} placeholders
 * @param {object} params - Parameters to substitute
 * @returns {string} Processed string
 */
function replaceParams(template, params = {}) {
  if (!template || typeof template !== 'string') {
    return template;
  }

  // Use {param} format for consistency with bot/webapp
  return Object.entries(params).reduce(
    (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v ?? '')),
    template
  );
}

/**
 * Translate a key with optional parameters
 * @param {string} key - Translation key (dot notation supported)
 * @param {object} params - Parameters to substitute in template
 * @param {string} lang - Language code (defaults to 'ru')
 * @returns {string} Translated string or key if not found
 *
 * @example
 * t('order.new.title') // "Новый заказ!"
 * t('order.product', { name: 'iPhone' }) // "Товар: iPhone"
 * t('order.new.title', {}, 'en') // "New Order!"
 */
function t(key, params = {}, lang = DEFAULT_LANGUAGE) {
  // Validate language
  const effectiveLang = SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;

  // Load locale
  const locale = loadLocale(effectiveLang);

  // Get translation
  let translation = getNestedValue(locale, key);

  // Fallback to default language if not found
  if (translation === undefined && effectiveLang !== DEFAULT_LANGUAGE) {
    const defaultLocale = loadLocale(DEFAULT_LANGUAGE);
    translation = getNestedValue(defaultLocale, key);
  }

  // If still not found, return key
  if (translation === undefined) {
    logger.warn(`[i18n] Missing translation: ${key} (${effectiveLang})`);
    return key;
  }

  // Replace parameters
  return replaceParams(translation, params);
}

/**
 * Check if language is supported
 * @param {string} lang - Language code
 * @returns {boolean}
 */
function isSupported(lang) {
  return SUPPORTED_LANGUAGES.includes(lang);
}

/**
 * Get all supported languages
 * @returns {string[]}
 */
function getSupportedLanguages() {
  return [...SUPPORTED_LANGUAGES];
}

/**
 * Preload all locales (call on app startup)
 */
function preloadLocales() {
  SUPPORTED_LANGUAGES.forEach(loadLocale);
}

/**
 * Clear locale cache (for testing or hot reload)
 */
function clearCache() {
  Object.keys(locales).forEach(key => delete locales[key]);
}

export {
  t,
  isSupported,
  getSupportedLanguages,
  preloadLocales,
  clearCache,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES
};

export default t;
