import { useCallback } from 'react';
import { t as translate, setLanguage as changeLang } from './index';
import { useStore } from '../store/useStore';

export function useTranslation() {
  const language = useStore((state) => state.language);

  // Memoize t function to prevent re-render loops when used in useEffect deps
  const t = useCallback(
    (key, params) => translate(key, params, language),
    [language]
  );

  const setLanguage = async (newLang) => {
    await changeLang(newLang);
  };

  return { t, lang: language, setLanguage };
}
