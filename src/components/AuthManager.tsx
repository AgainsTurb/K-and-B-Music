// src/components/AuthManager.tsx
import { useState, useEffect } from 'react';
import { updateBilibiliCookies, cloakBrowserStatus } from '../services/bilibili'; 
import { updateChosicCookies } from '../services/genreSync';
import { useTranslation } from 'react-i18next';

export default function AuthManager() {
    const [isChecking, setIsChecking] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(true);
    const [isReady, setIsReady] = useState(false); // Explicitly track hard drive readiness
    const [downloadState, setDownloadState] = useState({ status: 'idle', progress: 0, error: '' });
    const [debugData, setDebugData] = useState<any>(null);
    const [isDismissed, setIsDismissed] = useState(false); // NEW: Track manual dismissal

    const { t } = useTranslation();

    const checkStatus = async () => {
        try {
            const res = await fetch('http://localhost:9191/api/status');
            const data = await res.json();
            setDebugData(data);
            
            if (!res.ok) throw new Error(data.error || 'Server error');
            
            setIsReady(data.isReady);
            cloakBrowserStatus.isReady = data.isReady; // Sync global state
            
            if (!data.isReady) {
                setDownloadState(data.state);
                setIsLoggedIn(false);
                cloakBrowserStatus.isLoggedIn = false;
            } else {
                setDownloadState({ status: 'ready', progress: 100, error: '' });
                setIsLoggedIn(data.isBiliLoggedIn);
                cloakBrowserStatus.isLoggedIn = data.isBiliLoggedIn; // Sync global state
                
                // --- CRITICAL FIX: INJECT THE LIVE COOKIES ---
                if (data.biliCookies && Object.keys(data.biliCookies).length > 0) {
                    updateBilibiliCookies(data.biliCookies);
                }
                if (data.chosicCookies && Object.keys(data.chosicCookies).length > 0) {
                    updateChosicCookies(data.chosicCookies);
                }
                // ----------------------------------------------
            }
        } catch (error: any) {
            console.error("Sidecar error:", error);
            setIsLoggedIn(false);
            setIsReady(false);
            cloakBrowserStatus.isReady = false;
            cloakBrowserStatus.isLoggedIn = false;
            setDownloadState({ status: 'error', progress: 0, error: error.message || 'Starting background engine...' });
        }
        setIsChecking(false);
    };

    useEffect(() => {
        const interval = setInterval(checkStatus, 1500);
        return () => clearInterval(interval);
    }, []);

    const handleLoginClick = async () => {
        try {
            await fetch('http://localhost:9191/api/login', { method: 'POST' });
        } catch (error) {
            console.error("Failed to open browser:", error);
        }
    };

    const handleInstallClick = async () => {
        try {
            await fetch('http://localhost:9191/api/install', { method: 'POST' });
        } catch (error) {
            console.error("Failed to start install:", error);
        }
    };

    // If logged in OR the user manually clicked the close button, hide the modal entirely
    if (isLoggedIn || isDismissed) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full text-center flex flex-col items-center animate-fadeIn relative">
                
                {/* NEW: Dismiss/Close Button */}
                <button 
                    onClick={() => setIsDismissed(true)} 
                    className="absolute top-5 right-5 p-2 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>

                {/* STATE 1: HARD DRIVE IS NOT READY (DOWNLOADING/EXTRACTING/INITIALIZING) */}
                {!isReady ? (
                    <>
                        <svg className="animate-spin w-16 h-16 text-[#0b57d0] mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">{t("First Time Setup")}</h2>
                        
                        {/* THE FIX: Conditionally render the button vs the progress bar */}
                        {downloadState.status === 'idle' || downloadState.status === 'error' ? (
                            <>
                                <p className="text-gray-500 mb-4">
                                    {downloadState.status === 'error' 
                                        ? `${t('Download failed:')} ${downloadState.error}. ${t('Try again?')}` 
                                        : t("To enable premium AI features, the app needs to download the Stealth Engine (approx. ~150MB).")}
                                </p>
                                <button 
                                    onClick={handleInstallClick}
                                    className="w-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold py-3 px-6 rounded-xl transition-colors mb-4"
                                >
                                    {t('Download & Install Engine')}
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-gray-500 mb-4">
                                    {downloadState.status === 'downloading' ? `${t('Downloading Stealth Engine...')} ${downloadState.progress}%` : 
                                     downloadState.status === 'extracting' ? t('Extracting browser binaries...') : t('Initializing setup...')}
                                </p>
                                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 overflow-hidden">
                                    <div className="bg-[#0b57d0] h-2.5 rounded-full transition-all duration-300" style={{ width: `${downloadState.progress}%` }}></div>
                                </div>
                            </>
                        )}
                        
                        {/* Explanation of skipped features */}
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-xl mt-2 w-full text-left">
                            <strong>{t('Note:')}</strong> {t('You can close this window to skip setup and play music normally. However,')} <span className="font-bold">{t('AI Translated Subtitles')}</span> {t('and the')} <span className="font-bold">{t('"For You" recommendations')}</span> {t('will be disabled.')}
                        </p>
                    </>
                ) : (
                    /* STATE 2: ENGINE READY, USER NEEDS TO LOG IN */
                    <>
                        <svg className="w-16 h-16 text-[#0b57d0] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('Bilibili Login Required')}</h2>
                        <p className="text-gray-500 mb-4">
                            {isChecking ? t('Checking session status...') : t('Your session has expired or is missing. Please log in to enable premium features.')}
                        </p>
                        <button 
                            onClick={handleLoginClick}
                            disabled={isChecking}
                            className="w-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 mb-4"
                        >
                            {t('Open Browser to Log In')}
                        </button>
                        {/* NEW: Explanation of skipped features */}
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-xl w-full text-left">
                            <strong>{t('Note:')}</strong> {t('You can close this window to skip login and play music normally. However,')} <span className="font-bold">{t('AI Translated Subtitles')}</span> {t('and the')} <span className="font-bold">{t('"For You" recommendations')}</span> {t('will be disabled.')}
                        </p>
                    </>
                )}

                {/* Debug Window Container */}
                <div className="mt-8 w-full bg-gray-900 rounded-xl p-4 text-left overflow-hidden flex flex-col border border-gray-800 shadow-inner">
                    <p className="text-red-400 font-bold text-xs mb-2 flex items-center gap-2">
                        <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>
                        {t('LIVE SIDECAR PAYLOAD')}
                    </p>
                    <div className="overflow-y-auto max-h-32 custom-scrollbar">
                        <pre className="text-green-400 font-mono text-[10px] whitespace-pre-wrap">
                            {debugData ? JSON.stringify(debugData, null, 2) : t('Waiting for sidecar response...')}
                        </pre>
                    </div>
                </div>

            </div>
        </div>
    );
}