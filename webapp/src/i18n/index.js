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

// Установить язык (вызывается из LanguageModal)
export async function setLanguage(lang) {
  currentLang = lang
  localStorage.setItem('app_language', lang)

  // Загрузить переводы для нового языка
  await loadTranslations(lang)

  // Обновить Zustand store (импортируется динамически чтобы избежать циклических зависимостей)
  const { useStore } = await import('../store/useStore')
  useStore.getState().setLanguage(lang)
}

// Получить текущий язык
export function getLanguage() {
  const stored = localStorage.getItem('app_language')
  return stored || 'ru'
}

// Инициализация i18n (вызывается в App.jsx)
export async function initI18n() {
  currentLang = getLanguage()
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
