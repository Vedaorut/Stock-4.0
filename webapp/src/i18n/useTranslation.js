import { t as translate, getLanguage, setLanguage as changeLang } from './index'
import { useStore } from '../store/useStore'

export function useTranslation() {
  const { language } = useStore()

  // Передаем текущий язык из Zustand в функцию перевода
  const t = (key, params) => translate(key, params, language)

  const setLanguage = async (newLang) => {
    await changeLang(newLang)
  }

  return { t, lang: language, setLanguage }
}
