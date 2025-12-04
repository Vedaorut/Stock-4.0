// Loaded translations storage
const translations = {
  ru: null,
  en: null,
};

let currentLang = 'ru';

// Lazy load translations
async function loadTranslations(lang) {
  if (!translations[lang]) {
    const module = await import(`./locales/${lang}.json`);
    translations[lang] = module.default || module;
  }
  return translations[lang];
}

// Get language from Telegram SDK (NO localStorage)
function getTelegramLanguage() {
  const tg = window.Telegram?.WebApp;
  const userLang = tg?.initDataUnsafe?.user?.language_code || 'ru';
  return userLang.startsWith('ru') ? 'ru' : 'en';
}

// Set language (called from LanguageModal or App.jsx)
export async function setLanguage(lang) {
  // Validate language - only ru or en
  const validLang = ['ru', 'en'].includes(lang) ? lang : 'ru';
  currentLang = validLang;
  // NO localStorage.setItem

  // Load translations for new language
  await loadTranslations(currentLang);

  // Update Zustand store (imported dynamically to avoid circular dependencies)
  const { useStore } = await import('../store/useStore');
  useStore.getState().setLanguage(currentLang);
}

// Get current language
export function getLanguage() {
  // Always get from Telegram (NO localStorage)
  return getTelegramLanguage();
}

// Initialize i18n (called in App.jsx)
// Accepts optional language from backend (priority over Telegram SDK)
export async function initI18n(backendLang = null) {
  // Priority: backend language > Telegram SDK
  if (backendLang && ['ru', 'en'].includes(backendLang)) {
    currentLang = backendLang;
  } else {
    currentLang = getTelegramLanguage();
  }
  await loadTranslations(currentLang);
}

// Translation function
export function t(key, params = {}, lang = currentLang) {
  // Check if translations are loaded
  if (!translations[lang]) {
    // Fallback to Russian if target lang not loaded
    if (lang !== 'ru' && translations.ru) {
      return t(key, params, 'ru');
    }
    // Return key if no translations available
    return key;
  }

  const keys = key.split('.');
  let value = translations[lang];

  // Navigate nested keys (e.g., "settings.title")
  for (const k of keys) {
    if (!value) break;
    value = value[k];
  }

  if (!value) {
    // Translation missing - return key as fallback
    return key;
  }

  // Substitute parameters {count}, {name}, etc.
  let result = value;
  Object.keys(params).forEach((param) => {
    result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
  });

  return result;
}
