import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load locales synchronously at startup with error handling
const locales = { ru: {}, en: {} };

try {
  locales.ru = JSON.parse(readFileSync(join(__dirname, 'locales/ru.json'), 'utf-8'));
} catch (error) {
  console.error('[i18n] Failed to load ru.json:', error.message);
}

try {
  locales.en = JSON.parse(readFileSync(join(__dirname, 'locales/en.json'), 'utf-8'));
} catch (error) {
  console.error('[i18n] Failed to load en.json:', error.message);
}

let langOverride = null;

/**
 * Execute a function with a temporary language override.
 * Useful for building localized message maps without mutating global state.
 * @param {string} lang - Language code
 * @param {Function} fn - Callback to execute with override applied
 * @returns {*}
 */
export function withLang(lang, fn) {
  const prev = langOverride;
  langOverride = lang;
  try {
    return fn();
  } finally {
    langOverride = prev;
  }
}

/**
 * Translate a key with optional parameter interpolation
 * @param {string} key - Dot-notation key (e.g., 'buyer.panel')
 * @param {Object} params - Parameters to interpolate (e.g., { count: 5 })
 * @param {string} lang - Language code ('ru' or 'en')
 * @returns {string} Translated string or key if not found
 */
export function t(key, params = {}, lang) {
  const effectiveLang = lang || langOverride || 'ru';
  const keys = key.split('.');
  let value = locales[effectiveLang] || locales.ru;

  for (const k of keys) {
    if (!value) break;
    value = value[k];
  }

  // Fallback to Russian if not found in target language
  if (!value && effectiveLang !== 'ru') {
    value = locales.ru;
    for (const k of keys) {
      if (!value) break;
      value = value[k];
    }
  }

  if (!value || typeof value !== 'string') return key;

  // Interpolate parameters: {param} -> value
  return Object.entries(params).reduce(
    (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v ?? '')),
    value
  );
}

/**
 * Get user language from context
 * Priority: session.user.language > Telegram language_code > 'ru'
 * @param {Object} ctx - Telegraf context
 * @returns {string} Language code ('ru' or 'en')
 */
export function getLang(ctx) {
  // Check session first (user preference)
  if (ctx.session?.user?.language) {
    return ctx.session.user.language;
  }

  // Check Telegram language code
  const telegramLang = ctx.from?.language_code;
  if (telegramLang) {
    // Map to supported languages
    if (telegramLang.startsWith('ru')) return 'ru';
    if (telegramLang.startsWith('uk')) return 'ru'; // Ukrainian -> Russian
    if (telegramLang.startsWith('be')) return 'ru'; // Belarusian -> Russian
    return 'en'; // Default to English for all other languages
  }

  return 'ru'; // Default fallback
}

/**
 * Get available languages
 * @returns {string[]} Array of language codes
 */
export function getAvailableLanguages() {
  return Object.keys(locales);
}

/**
 * Check if a key exists in the locale
 * @param {string} key - Dot-notation key
 * @param {string} lang - Language code
 * @returns {boolean}
 */
export function hasKey(key, lang = 'ru') {
  const keys = key.split('.');
  let value = locales[lang] || locales.ru;

  for (const k of keys) {
    if (!value) return false;
    value = value[k];
  }

  return typeof value === 'string';
}

export default { t, getLang, getAvailableLanguages, hasKey };
