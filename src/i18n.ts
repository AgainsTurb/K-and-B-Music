// src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// We import the JSON files directly so Tauri bundles them into the native app seamlessly.
// (Don't worry if your editor says these are missing right now, the scanner will create them!)
import enTranslation from './locales/en.json';
import zhTranslation from './locales/zh.json';

i18n
  // Detects the user's OS language automatically
  .use(LanguageDetector)
  // Passes i18n down to react-i18next
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      zh: { translation: zhTranslation }
    },
    fallbackLng: 'en', // Default to English if detection fails
    interpolation: {
      escapeValue: false // React already safely escapes values
    }
  });

export default i18n;