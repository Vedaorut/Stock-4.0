// Loaded translations storage
const translations = {
  ru: null,
  en: null,
};

let currentLang = 'ru';

const LANG_STORAGE_KEY = 'statusstock_language';

// Lazy load translations
async function loadTranslations(lang) {
  if (!translations[lang]) {
    const module = await import(`./locales/${lang}.json`);
    translations[lang] = module.default || module;
  }
  return translations[lang];
}

// Get language from localStorage (user preference)
function getStoredLanguage() {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && ['ru', 'en'].includes(stored)) {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return null;
}

// Save language to localStorage
function saveLanguage(lang) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // localStorage not available
  }
}

// Get language from Telegram SDK
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

  // Save to localStorage for persistence
  saveLanguage(currentLang);

  // Load translations for new language
  await loadTranslations(currentLang);

  // Update Zustand store (imported dynamically to avoid circular dependencies)
  const { useStore } = await import('../store/useStore');
  useStore.getState().setLanguage(currentLang);
}

// Get current language
export function getLanguage() {
  return currentLang;
}

// Initialize i18n (called in App.jsx)
// Priority: backend (synced with bot) > localStorage > Telegram SDK
export async function initI18n(backendLang = null) {
  // 1. Backend language is primary (synced across bot and webapp)
  if (backendLang && ['ru', 'en'].includes(backendLang)) {
    currentLang = backendLang;
    saveLanguage(currentLang); // Sync localStorage with backend
  } else {
    // 2. Fallback to localStorage if backend not available
    const storedLang = getStoredLanguage();
    if (storedLang) {
      currentLang = storedLang;
    } else {
      // 3. Fallback to Telegram SDK for first-time users
      currentLang = getTelegramLanguage();
    }
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
