// src/components/AuthManager.tsx
import { useState, useEffect } from 'react';
import { updateBilibiliCookies, cloakBrowserStatus } from '../services/bilibili'; 
import { updateChosicCookies } from '../services/genreSync';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { requestCookieTransfer, pollCookieTransfer } from '../services/cloud';

export default function AuthManager() {
    const [isChecking, setIsChecking] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(true);
    const [isReady, setIsReady] = useState(false);
    const [downloadState, setDownloadState] = useState({ status: 'idle', progress: 0, error: '' });
    const [debugData, setDebugData] = useState<any>(null);
    const [isDismissed, setIsDismissed] = useState(false);

    const [mobilePin, setMobilePin] = useState<string | null>(null);
    const [isMobilePolling, setIsMobilePolling] = useState(false);

    const { t } = useTranslation();

    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

    const checkStatus = async () => {
        try {
            // Direct memory call to Rust instead of localhost fetch
            const data: any = await invoke('engine_status');
            setDebugData(data);
            
            setIsReady(data.isReady);
            cloakBrowserStatus.isReady = data.isReady; 
            
            if (!data.isReady) {
                setDownloadState(data.state);
                setIsLoggedIn(false);
                cloakBrowserStatus.isLoggedIn = false;
            } else {
                setDownloadState({ status: 'ready', progress: 100, error: '' });
                setIsLoggedIn(data.isBiliLoggedIn);
                cloakBrowserStatus.isLoggedIn = data.isBiliLoggedIn; 
                
                if (data.biliCookies && Object.keys(data.biliCookies).length > 0) {
                    updateBilibiliCookies(data.biliCookies);
                }
                if (data.chosicCookies && Object.keys(data.chosicCookies).length > 0) {
                    updateChosicCookies(data.chosicCookies);
                }
            }
        } catch (error: any) {
            console.error("Engine error:", error);
            setIsLoggedIn(false);
            setIsReady(false);
            cloakBrowserStatus.isReady = false;
            cloakBrowserStatus.isLoggedIn = false;
            
            // Tauri invoke returns the error as a string directly if it fails
            const errMsg = typeof error === 'string' ? error : (error.message || 'Starting background engine...');
            setDownloadState({ status: 'error', progress: 0, error: errMsg });
        }
        setIsChecking(false);
    };

    useEffect(() => {
        if (isMobile) {
            const savedBili = localStorage.getItem('mobile_bili_cookies');
            if (savedBili) {
                updateBilibiliCookies(JSON.parse(savedBili));
                setIsLoggedIn(true);
                cloakBrowserStatus.isReady = true;
                cloakBrowserStatus.isLoggedIn = true;
            } else {
                setIsLoggedIn(false);
                requestCookieTransfer().then(pin => {
                    setMobilePin(pin);
                    setIsMobilePolling(true);
                }).catch(console.error);
            }
            setIsChecking(false);
            return;
        }
        const interval = setInterval(checkStatus, 1500);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!isMobilePolling || !mobilePin) return;
        const interval = setInterval(async () => {
            try {
                const res = await pollCookieTransfer(mobilePin);
                if (res) {
                    const parsed = JSON.parse(res);
                    if (parsed.bili && Object.keys(parsed.bili).length > 0) {
                        localStorage.setItem('mobile_bili_cookies', JSON.stringify(parsed.bili));
                        updateBilibiliCookies(parsed.bili);
                    }
                    if (parsed.chosic && Object.keys(parsed.chosic).length > 0) {
                        localStorage.setItem('mobile_chosic_cookies', JSON.stringify(parsed.chosic));
                        updateChosicCookies(parsed.chosic);
                    }
                    setIsLoggedIn(true);
                    cloakBrowserStatus.isReady = true;
                    cloakBrowserStatus.isLoggedIn = true;
                    setIsMobilePolling(false);
                }
            } catch (e) {}
        }, 3000);
        return () => clearInterval(interval);
    }, [isMobilePolling, mobilePin]);

    const handleLoginClick = async () => {
        try {
            // Invoke Rust
            await invoke('engine_login');
        } catch (error) {
            console.error("Failed to open browser:", error);
        }
    };

    const handleInstallClick = async () => {
        try {
            // Invoke Rust
            await invoke('engine_install');
        } catch (error) {
            console.error("Failed to start install:", error);
        }
    };

    if (isLoggedIn || isDismissed) return null;

    if (isMobile) {
        return (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center flex flex-col items-center animate-fadeIn relative mx-4">
                    <button onClick={() => setIsDismissed(true)} className="absolute top-5 right-5 p-2 text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                    <svg className="w-16 h-16 text-[#0b57d0] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">{t('Link to PC')}</h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
                        {t('Mobile devices cannot run the stealth engine. Enter this PIN in your PC app (Settings -> Share Session to Mobile) to sync your session.')}
                    </p>
                    
                    {mobilePin ? (
                        <div className="text-center p-4 rounded-xl border-2 border-[#0b57d0] bg-blue-50 dark:bg-[#0b57d0]/10 w-full mb-4">
                            <p className="text-4xl font-mono font-bold tracking-widest text-[#0b57d0] dark:text-[#b4cffb]">{mobilePin}</p>
                        </div>
                    ) : (
                        <svg className="animate-spin w-8 h-8 text-[#0b57d0] mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    )}
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-xl w-full text-left">
                        <strong>{t('Note:')}</strong> {t('You can close this window to skip setup and play music normally. However,')} <span className="font-bold">{t('AI Translated Subtitles')}</span> {t('will be disabled.')}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full text-center flex flex-col items-center animate-fadeIn relative">
                
                <button 
                    onClick={() => setIsDismissed(true)} 
                    className="absolute top-5 right-5 p-2 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>

                {!isReady ? (
                    <>
                        <svg className="animate-spin w-16 h-16 text-[#0b57d0] mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">{t("First Time Setup")}</h2>
                        
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
                        
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-xl mt-2 w-full text-left">
                            <strong>{t('Note:')}</strong> {t('You can close this window to skip setup and play music normally. However,')} <span className="font-bold">{t('AI Translated Subtitles')}</span> {t('and the')} <span className="font-bold">{t('"For You" recommendations')}</span> {t('will be disabled.')}
                        </p>
                    </>
                ) : (
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
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-xl w-full text-left">
                            <strong>{t('Note:')}</strong> {t('You can close this window to skip login and play music normally. However,')} <span className="font-bold">{t('AI Translated Subtitles')}</span> {t('and the')} <span className="font-bold">{t('"For You" recommendations')}</span> {t('will be disabled.')}
                        </p>
                    </>
                )}

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