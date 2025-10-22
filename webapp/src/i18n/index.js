// Хранилище загруженных переводов
const translations = {
  ru: null,
  en: null
}

let currentLang = 'ru'

// Ленивая загрузка переводов
async function loadTranslations(lang) {
  if (!translations[lang]) {
    const module = await import(`./locales/${lang}.json`)
    translations[lang] = module.default || module
  }
  return translations[lang]
}

// Получить язык из Telegram SDK (NO localStorage)
function getTelegramLanguage() {
  const tg = window.Telegram?.WebApp;
  const userLang = tg?.initDataUnsafe?.user?.language_code || 'ru';
  return userLang.startsWith('ru') ? 'ru' : 'en';
}

// Установить язык (вызывается из LanguageModal)
export async function setLanguage(lang) {
  currentLang = lang || getTelegramLanguage();
  // NO localStorage.setItem

  // Загрузить переводы для нового языка
  await loadTranslations(currentLang)

  // Обновить Zustand store (импортируется динамически чтобы избежать циклических зависимостей)
  const { useStore } = await import('../store/useStore')
  useStore.getState().setLanguage(currentLang)
}

// Получить текущий язык
export function getLanguage() {
  // Always get from Telegram (NO localStorage)
  return getTelegramLanguage();
}

// Инициализация i18n (вызывается в App.jsx)
export async function initI18n() {
  currentLang = getTelegramLanguage();  // Use Telegram language
  await loadTranslations(currentLang)
}

// Функция перевода
export function t(key, params = {}, lang = currentLang) {
  const keys = key.split('.')
  let value = translations[lang]

  // Навигация по вложенным ключам (например, "settings.title")
  for (const k of keys) {
    if (!value) break
    value = value[k]
  }

  if (!value) {
    console.warn(`[i18n] Translation missing: ${key}`)
    return key
  }

  // Подстановка параметров {count}, {name} и т.д.
  let result = value
  Object.keys(params).forEach(param => {
    result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param])
  })

  return result
}
