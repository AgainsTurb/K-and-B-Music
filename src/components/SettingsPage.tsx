// src/components/SettingsPage.tsx
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from 'react-i18next';

export default function SettingsPage() {
    const { theme, setTheme, isDark } = useTheme();
    const { t, i18n } = useTranslation();

    // Helper to safely get the active language root (e.g., turns 'en-US' into 'en')
    const activeLang = i18n.resolvedLanguage || i18n.language || 'en';

    return (
        <section className="flex-1 overflow-y-auto px-8 pb-32 mt-2">
            {/* WRAPPED: Settings Title */}
            <h2 className={`text-3xl font-bold mb-8 ${isDark ? 'text-white' : 'text-gray-800'}`}>{t('Settings')}</h2>

            {/* --- THEME SECTION --- */}
            <div className={`max-w-2xl rounded-2xl p-6 border shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                <h3 className={`text-xl font-bold mb-6 flex items-center gap-2 ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                    <svg className="w-6 h-6 text-[#0b57d0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                    {t('Appearance')}
                </h3>
                
                <div className="flex flex-col gap-4">
                    {/* WRAPPED: App Theme */}
                    <label className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t('App Theme')}</label>
                    <div className="grid grid-cols-3 gap-4">
                        <button 
                            onClick={() => setTheme('light')} 
                            className={`py-4 px-4 rounded-xl border-2 text-sm font-bold transition-all ${theme === 'light' ? 'bg-[#0b57d0] text-white border-[#0b57d0] shadow-md' : (isDark ? 'bg-gray-900 text-gray-300 border-gray-700 hover:border-gray-500' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0b57d0]/50')}`}
                        >
                            {t('Light')}
                        </button>
                        <button 
                            onClick={() => setTheme('dark')} 
                            className={`py-4 px-4 rounded-xl border-2 text-sm font-bold transition-all ${theme === 'dark' ? 'bg-[#0b57d0] text-white border-[#0b57d0] shadow-md' : (isDark ? 'bg-gray-900 text-gray-300 border-gray-700 hover:border-gray-500' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0b57d0]/50')}`}
                        >
                            {t('Dark')}
                        </button>
                        <button 
                            onClick={() => setTheme('system')} 
                            className={`py-4 px-4 rounded-xl border-2 text-sm font-bold transition-all ${theme === 'system' ? 'bg-[#0b57d0] text-white border-[#0b57d0] shadow-md' : (isDark ? 'bg-gray-900 text-gray-300 border-gray-700 hover:border-gray-500' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0b57d0]/50')}`}
                        >
                            {t('System')}
                        </button>
                    </div>
                </div>
            </div>

            {/* LANGUAGE SECTION */}
            <div className={`max-w-2xl mt-6 rounded-2xl p-6 border shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                <h3 className={`text-xl font-bold mb-6 flex items-center gap-2 ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                    <svg className="w-6 h-6 text-[#0b57d0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/></svg>
                    {t('Language')}
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                    {/* EN Button */}
                    <button 
                        onClick={() => i18n.changeLanguage('en')} 
                        className={`py-4 px-4 rounded-xl border-2 text-sm font-bold transition-all ${activeLang.startsWith('en') ? 'bg-[#0b57d0] text-white border-[#0b57d0] shadow-md' : (isDark ? 'bg-gray-900 text-gray-300 border-gray-700 hover:border-gray-500' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0b57d0]/50')}`}
                    >
                        English
                    </button>
                    {/* ZH Button */}
                    <button 
                        onClick={() => i18n.changeLanguage('zh')} 
                        className={`py-4 px-4 rounded-xl border-2 text-sm font-bold transition-all ${activeLang.startsWith('zh') ? 'bg-[#0b57d0] text-white border-[#0b57d0] shadow-md' : (isDark ? 'bg-gray-900 text-gray-300 border-gray-700 hover:border-gray-500' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0b57d0]/50')}`}
                    >
                        中文 (简体)
                    </button>
                </div>
            </div>

        </section>
    );
}