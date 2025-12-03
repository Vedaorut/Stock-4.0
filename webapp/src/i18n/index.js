// Хранилище загруженных переводов
const translations = {
  ru: null,
  en: null,
};

let currentLang = 'ru';

// Ленивая загрузка переводов
async function loadTranslations(lang) {
  if (!translations[lang]) {
    const module = await import(`./locales/${lang}.json`);
    translations[lang] = module.default || module;
  }
  return translations[lang];
}

// Получить язык из Telegram SDK (NO localStorage)
function getTelegramLanguage() {
  const tg = window.Telegram?.WebApp;
  const userLang = tg?.initDataUnsafe?.user?.language_code || 'ru';
  return userLang.startsWith('ru') ? 'ru' : 'en';
}

// Установить язык (вызывается из LanguageModal или App.jsx)
export async function setLanguage(lang) {
  // Валидируем язык - только ru или en
  const validLang = ['ru', 'en'].includes(lang) ? lang : 'ru';
  currentLang = validLang;
  // NO localStorage.setItem

  // Загрузить переводы для нового языка
  await loadTranslations(currentLang);

  // Обновить Zustand store (импортируется динамически чтобы избежать циклических зависимостей)
  const { useStore } = await import('../store/useStore');
  useStore.getState().setLanguage(currentLang);
}

// Получить текущий язык
export function getLanguage() {
  // Always get from Telegram (NO localStorage)
  return getTelegramLanguage();
}

// Инициализация i18n (вызывается в App.jsx)
// Принимает опциональный язык из backend (приоритет над Telegram SDK)
export async function initI18n(backendLang = null) {
  // Приоритет: backend язык > Telegram SDK
  if (backendLang && ['ru', 'en'].includes(backendLang)) {
    currentLang = backendLang;
  } else {
    currentLang = getTelegramLanguage();
  }
  await loadTranslations(currentLang);
}

// Функция перевода
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

  // Навигация по вложенным ключам (например, "settings.title")
  for (const k of keys) {
    if (!value) break;
    value = value[k];
  }

  if (!value) {
    // Translation missing - return key as fallback
    return key;
  }

  // Подстановка параметров {count}, {name} и т.д.
  let result = value;
  Object.keys(params).forEach((param) => {
    result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
  });

  return result;
}
