// src/components/SettingsPage.tsx
import { useState, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { getSyncConfig, getLocalDeviceId, createSyncGroup, joinSyncGroup, saveSyncConfig, clearSyncGroup, triggerCloudSync, leaveSyncGroup, getGroupPin, submitCookieTransfer } from '../services/cloud';
import { invoke } from '@tauri-apps/api/core';

export default function SettingsPage() {
    const { theme, setTheme, isDark } = useTheme();
    const { t, i18n } = useTranslation();

    // Helper to safely get the active language root (e.g., turns 'en-US' into 'en')
    const activeLang = i18n.resolvedLanguage || i18n.language || 'en';

    // --- NEW: Cloud Sync States ---
    const [syncConfig, setSyncConfigState] = useState(getSyncConfig());
    const [joinPin, setJoinPin] = useState('');
    const [generatedPin, setGeneratedPin] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [cookiePin, setCookiePin] = useState('');
    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    
    const [modalMessage, setModalMessage] = useState<string | null>(null);

    useEffect(() => {
        if (localStorage.getItem('sync_device_id') === 'localhost' || localStorage.getItem('sync_device_id') === '127.0.0.1') {
            localStorage.removeItem('sync_device_id');
        }

        getLocalDeviceId().then(id => {
            setSyncConfigState(prev => ({ ...prev, deviceId: id }));
        });
    }, []);

    const handleCreateGroup = async () => {
        setIsProcessing(true);
        try {
            const { groupId, pin } = await createSyncGroup(syncConfig.deviceId!);
            saveSyncConfig(groupId, syncConfig.deviceId!);
            setSyncConfigState(getSyncConfig());
            setGeneratedPin(pin);
        } catch (e: any) { setModalMessage("Error: " + e); }
        setIsProcessing(false);
    };

    const handleJoinGroup = async () => {
        if (!joinPin.trim()) return;
        setIsProcessing(true);
        try {
            const groupId = await joinSyncGroup(joinPin, syncConfig.deviceId!);
            saveSyncConfig(groupId, syncConfig.deviceId!);
            setSyncConfigState(getSyncConfig());
            setJoinPin('');
        } catch (e: any) { setModalMessage("Error: " + e); }
        setIsProcessing(false);
    };

    const handleLeaveGroup = async () => {
        if (!syncConfig.groupId) return;
        setIsProcessing(true);
        try {
            await leaveSyncGroup(syncConfig.groupId, syncConfig.deviceId!);
            clearSyncGroup();
            setSyncConfigState(getSyncConfig());
            setGeneratedPin(''); 
            setJoinPin('');      
        } catch (e: any) {
            setModalMessage("Error leaving group: " + e);
        }
        setIsProcessing(false);
    };

    const handleGeneratePin = async () => {
        if (!syncConfig.groupId) return;
        setIsProcessing(true);
        try {
            const pin = await getGroupPin(syncConfig.groupId);
            setGeneratedPin(pin);
        } catch (e: any) {
            setModalMessage("Error fetching PIN: " + e);
        }
        setIsProcessing(false);
    };

    const handleForceSync = async () => {
        if (!syncConfig.groupId || !syncConfig.deviceId) return;
        setIsSyncing(true);
        try {
            await triggerCloudSync(syncConfig.groupId, syncConfig.deviceId);
            setModalMessage(t("Sync completed successfully!"));

            window.dispatchEvent(new Event('kandb-sync-complete'));
        } catch (e: any) {
            setModalMessage("Sync Failed: " + e);
        }
        setIsSyncing(false);
    };

    const handleSendCookies = async () => {
        if (!cookiePin.trim()) return;
        setIsProcessing(true);
        try {
            const data: any = await invoke('engine_status');
            const payload = JSON.stringify({
                bili: data.biliCookies || {},
                chosic: data.chosicCookies || {}
            });
            await submitCookieTransfer(cookiePin, payload);
            setModalMessage(t("Cookies securely sent to mobile!"));
            setCookiePin('');
        } catch (e: any) { setModalMessage("Error sending cookies: " + e); }
        setIsProcessing(false);
    };

    const Spinner = () => (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    );

    return (
        <section className="flex-1 overflow-y-auto px-8 pb-32 mt-2 relative">
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

            {/* --- CLOUD SYNC SECTION --- */}
            <div className={`max-w-2xl mt-6 rounded-2xl p-6 border shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                <h3 className={`text-xl font-bold mb-6 flex items-center gap-2 ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                    <svg className="w-6 h-6 text-[#0b57d0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
                    {t('Cloud Sync (vma.cc)')}
                </h3>
                
                <div className="flex flex-col gap-5">

                    <div className="flex items-center gap-4 text-sm">
                        <span className={`px-3 py-1 rounded-md font-mono ${isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
                            ID: {syncConfig.deviceId || t('Loading...')}
                        </span>
                        {syncConfig.groupId && (
                            <span className="px-3 py-1 rounded-md font-mono bg-[#d3e3fd] text-[#0b57d0] dark:bg-[#0b57d0]/20 dark:text-[#b4cffb]">
                                Group: {syncConfig.groupId.split('-')[0]}...
                            </span>
                        )}
                    </div>

                    {/* 2x2 Grid for Active Group Actions */}
                    {syncConfig.groupId ? (
                        <div className="grid grid-cols-2 gap-4 mt-2">
                            <button onClick={handleForceSync} disabled={isSyncing || isProcessing} className="py-3 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                                {isSyncing && <Spinner />}
                                {t('Upload to Cloud')}
                            </button>
                            
                            <button onClick={handleForceSync} disabled={isSyncing || isProcessing} className="py-3 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                                {isSyncing && <Spinner />}
                                {t('Sync from Cloud')}
                            </button>

                            <button onClick={handleGeneratePin} disabled={isSyncing || isProcessing} className={`py-3 rounded-xl border-2 font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                                {isProcessing && <Spinner />}
                                {t('Generate PIN')}
                            </button>

                            <button onClick={handleLeaveGroup} disabled={isProcessing || isSyncing} className={`py-3 rounded-xl border-2 font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${isDark ? 'border-red-500/50 text-red-400 hover:bg-red-500/10' : 'border-red-200 text-red-600 hover:bg-red-50'}`}>
                                {isProcessing && <Spinner />}
                                {t('Leave Group')}
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 mt-2">
                            <button onClick={handleCreateGroup} disabled={isProcessing} className="w-full py-3 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                                {isProcessing && (
                                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                {t('Create New Sync Group')}
                            </button>
                            
                            <div className="relative flex py-2 items-center">
                                <div className={`flex-grow border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}></div>
                                <span className={`flex-shrink-0 mx-4 text-xs font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{t('OR')}</span>
                                <div className={`flex-grow border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}></div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-4">
                                <input 
                                    type="text" 
                                    placeholder={t("Enter 6-digit PIN")}
                                    value={joinPin}
                                    onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    disabled={isProcessing}
                                    className={`flex-1 px-4 py-3 rounded-xl border font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-[#0b57d0] disabled:opacity-50 ${isDark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-800'}`}
                                />
                                <button onClick={handleJoinGroup} disabled={isProcessing || !joinPin.trim()} className={`w-full md:w-auto px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${isDark ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>
                                    {isProcessing && <Spinner />}
                                    {t('Join Group')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* PIN Display moved to bottom so it shows dynamically for Active Groups too */}
                    {generatedPin && (
                        <div className="text-center p-4 rounded-xl border-2 border-green-500 bg-green-50 dark:bg-green-500/10">
                            <p className="text-sm font-semibold text-green-700 dark:text-green-400">{t('Your Group PIN (Valid for this session):')}</p>
                            <p className="text-3xl font-mono font-bold tracking-widest text-green-800 dark:text-green-300 mt-2">{generatedPin}</p>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Disabled */}
            {false && !isMobile && syncConfig.groupId && (
                <div className={`max-w-2xl mt-6 rounded-2xl p-6 border shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                    <h3 className={`text-xl font-bold mb-2 flex items-center gap-2 ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                        <svg className="w-6 h-6 text-[#0b57d0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                        {t('Share Session to Mobile')}
                    </h3>
                    <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {t('Mobile devices cannot run the stealth engine. Enter the PIN shown on your mobile device to securely transfer your active cookies.')}
                    </p>
                    <div className="flex flex-col md:flex-row gap-4">
                        <input 
                            type="text" 
                            placeholder={t("Enter 6-digit Mobile PIN")}
                            value={cookiePin}
                            onChange={(e) => setCookiePin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            disabled={isProcessing}
                            className={`flex-1 px-4 py-3 rounded-xl border font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-[#0b57d0] disabled:opacity-50 ${isDark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-800'}`}
                        />
                        <button onClick={handleSendCookies} disabled={isProcessing || !cookiePin.trim() || cookiePin.length < 6} className={`w-full md:w-auto px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${isDark ? 'bg-[#0b57d0] text-white hover:bg-[#0842a0]' : 'bg-[#0b57d0] text-white hover:bg-[#0842a0]'}`}>
                            {isProcessing && <Spinner />}
                            {t('Send Cookies')}
                        </button>
                    </div>
                </div>
            )}

            {modalMessage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className={`p-6 rounded-2xl shadow-xl w-full max-w-sm mx-4 ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white'}`}>
                        <h3 className={`text-lg font-bold mb-4 text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {t('Notification')}
                        </h3>
                        <p className={`mb-6 text-center text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                            {modalMessage}
                        </p>
                        <button 
                            onClick={() => setModalMessage(null)} 
                            className="w-full py-3 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold transition-colors"
                        >
                            {t('OK')}
                        </button>
                    </div>
                </div>
            )}

        </section>
    );
}