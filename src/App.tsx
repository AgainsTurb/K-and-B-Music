import { useState, useRef, useCallback, useEffect } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import Sidebar from './components/Sidebar';
import TrackCard from './components/TrackCard';
import SearchBar from './components/SearchBar';
import PlayerBar from './components/PlayerBar';
import RecentPage from './components/RecentPage';
import { searchVideos } from './services/bilibili';
import FavoritesPage from './components/FavoritesPage';
import PlaylistPage from './components/PlaylistPage';
import RecommendPage from './components/RecommendPage';
import AuthManager from './components/AuthManager';
import { resumeBackgroundSync } from './services/genreSync';
import { getSyncConfig, triggerCloudSync } from './services/cloud';
import SettingsPage from './components/SettingsPage';
import { getPlaylist, addToPlaylist, removeFromPlaylist, updatePlaylistOrder, clearPlaylist, recordPlay, getFavorites, addToFavorites, removeFromFavorites, updateFavoritesOrder, getUserPlaylists, createUserPlaylist, UserPlaylist, addTrackToUserPlaylist } from './services/db';
import { VideoTrack } from './types';
import { useTranslation } from 'react-i18next';

// The standalone Floating Lyric UI
function DesktopLyrics() {
  const { t } = useTranslation();
  const [lyric, setLyric] = useState<any>({ text: '♪', translation: '', words: null });
  const [effectiveTime, setEffectiveTime] = useState(0);
  
  useEffect(() => {
    document.body.style.backgroundColor = 'transparent';

    // Listen for both the lyric text payload and the 60fps time ticker
    const unlistenUpdate = listen('lyric-update', (event: any) => setLyric(event.payload));
    const unlistenTime = listen('lyric-time', (event: any) => setEffectiveTime(event.payload));
    
    return () => { 
      unlistenUpdate.then(f => f()); 
      unlistenTime.then(f => f()); 
    };
  }, []);

  return (
    <div data-tauri-drag-region className="w-screen h-screen flex flex-col items-center justify-center text-center p-4 select-none overflow-hidden cursor-move rounded-xl hover:bg-black/40 transition-colors duration-300 bg-transparent group">
       <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => getCurrentWindow().close()} className="text-white bg-black/50 hover:bg-red-500 rounded-full p-1.5 z-50">
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
       </div>
       
       <div data-tauri-drag-region className="text-3xl md:text-4xl font-bold font-sans text-gray-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-tight text-shadow-xl whitespace-pre">
          {lyric.words ? lyric.words.map((w: any, wi: number) => {
             const wordStart = w.time;
             const wordEnd = w.time + w.duration;
             let progress = 0;
             if (effectiveTime >= wordEnd) progress = 100;
             else if (effectiveTime >= wordStart) progress = ((effectiveTime - wordStart) / w.duration) * 100;

             return (
                <span key={wi} className="relative inline-block whitespace-pre">
                  {/* The light gray base word */}
                  <span className="opacity-80">{w.text}</span>
                  {/* The blue immersive highlight filling up over time */}
                  <span className="absolute left-0 top-0 overflow-hidden text-[#699bf7] whitespace-pre drop-shadow-[0_0_8px_rgba(105,155,247,0.6)]" style={{ width: `${progress}%` }}>
                    {w.text}
                  </span>
                </span>
             );
          }) : lyric.text}
       </div>
       
       {lyric.translation && (
         <div data-tauri-drag-region className="text-lg md:text-xl font-medium text-[#b4cffb] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] mt-2">
            {lyric.translation}
         </div>
       )}
    </div>
  );
}

// Mobile Bottom Navigation Bar
function BottomNav({ activeView, onNavigate, onTogglePlaylists, t }: { activeView: string, onNavigate: (v: string) => void, onTogglePlaylists: () => void, t: any }) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex justify-around items-center pb-[env(safe-area-inset-bottom)] z-[60]">
       <button onClick={() => onNavigate('Recommend')} className={`p-3 flex flex-col items-center gap-1 ${activeView === 'Recommend' ? 'text-[#0b57d0]' : 'text-gray-500'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
          <span className="text-[10px] font-medium">{t('Home')}</span>
       </button>
       <button onClick={() => onNavigate('Recent')} className={`p-3 flex flex-col items-center gap-1 ${activeView === 'Recent' ? 'text-[#0b57d0]' : 'text-gray-500'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span className="text-[10px] font-medium">{t('Recent')}</span>
       </button>
       <button onClick={() => onNavigate('Favorites')} className={`p-3 flex flex-col items-center gap-1 ${activeView === 'Favorites' ? 'text-[#0b57d0]' : 'text-gray-500'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          <span className="text-[10px] font-medium">{t('Favs')}</span>
       </button>
       <button onClick={onTogglePlaylists} className="p-3 flex flex-col items-center gap-1 text-gray-500 hover:text-[#0b57d0] transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h8"/></svg>
          <span className="text-[10px] font-medium">{t('Playlists')}</span>
       </button>
    </nav>
  );
}

export default function App() {
  const { t } = useTranslation();

  // If Tauri spawns the lyrics window, Hijack the render instantly!
  if (getCurrentWindow().label === 'lyrics_window') {
    return <DesktopLyrics />;
  }

  const [isMiniMode, setIsMiniMode] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Navigation State
  const [activeView, setActiveView] = useState('Recommend');
  const [previousView, setPreviousView] = useState('Recommend');
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  // Search States
  const [currentKeyword, setCurrentKeyword] = useState('');
  const [results, setResults] = useState<VideoTrack[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  // Playlist & DB States
  const [playlist, setPlaylist] = useState<VideoTrack[]>([]);
  const [currentBvid, setCurrentBvid] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<VideoTrack[]>([]);
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([]);
  const [trackToAdd, setTrackToAdd] = useState<VideoTrack | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const [updateInfo, setUpdateInfo] = useState<{ version: string, url: string, body: string } | null>(null);

  const loadUserPlaylists = async () => setUserPlaylists(await getUserPlaylists());

  // Refs to prevent false plays on app boot or playlist reorders
  const isAppBoot = useRef(true);
  const lastRecordedBvid = useRef<string | null>(null);

  const toggleMiniMode = async () => {
    const appWindow = getCurrentWindow();
    if (!isMiniMode) {
      // Transitioning to Mini Mode
      await appWindow.setSize(new LogicalSize(300, 300));
      await appWindow.setAlwaysOnTop(true);
      await appWindow.setResizable(false);
      setIsMiniMode(true);
    } else {
      // Expanding back to Normal Mode
      await appWindow.setSize(new LogicalSize(1300, 1100));
      await appWindow.setAlwaysOnTop(false);
      await appWindow.setResizable(true);
      setIsMiniMode(false);
    }
  };

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const currentVersion = await getVersion(); // e.g., '1.3.0'
          
        const res = await fetch('https://api.github.com/repos/AgainsTurb/K-and-B-Music/releases/latest');
        const data = await res.json();
        
        if (data && data.tag_name) {
          // GitHub tags usually have a 'v' prefix (v1.4.0), Tauri versions do not (1.4.0)
          const latestVersion = data.tag_name.replace(/^v/, '');
          
          // Semantic versioning string comparison (e.g. 1.4.0 > 1.3.0)
          if (latestVersion.localeCompare(currentVersion, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
            setUpdateInfo({
              version: data.tag_name,
              url: data.html_url,
              body: data.body
            });
          }
        }
      } catch (e) {
        console.error("Update check failed:", e);
      }
    };
    // Add a slight 2-second delay so it doesn't interrupt the initial app render
    setTimeout(checkUpdate, 2000);
  }, []);

  // Load playlist on mount
  useEffect(() => {
    getPlaylist().then((loadedList) => {
      setPlaylist(loadedList);
      if (loadedList.length > 0) {
        const savedBvid = localStorage.getItem('player_bvid');
        const trackExists = loadedList.find(t => t.bvid === savedBvid);
        setCurrentBvid(trackExists ? savedBvid : loadedList[0].bvid);
      }
    });
    getFavorites().then(setFavorites);
    loadUserPlaylists();
    resumeBackgroundSync();
  }, []);

  useEffect(() => {
    const handleSyncReload = () => {
      console.log("Sync event received! Reloading UI from local database...");
      getPlaylist().then(setPlaylist);
      getFavorites().then(setFavorites);
      loadUserPlaylists();
    };
    
    window.addEventListener('kandb-sync-complete', handleSyncReload);
    return () => window.removeEventListener('kandb-sync-complete', handleSyncReload);
  }, []);

  const handleCreatePlaylist = () => {
    setNewPlaylistName(''); // Clear the input field
    setIsCreateModalOpen(true);
  };

  const confirmCreatePlaylist = async () => {
    if (newPlaylistName.trim()) {
      await createUserPlaylist(newPlaylistName.trim());
      loadUserPlaylists();
    }
    setIsCreateModalOpen(false);
  };

  // Save state and record play history when track changes
  useEffect(() => {
    if (currentBvid) {
      localStorage.setItem('player_bvid', currentBvid);

      // If the app just booted, save the BVID but do not record a new ghost play
      if (isAppBoot.current) {
        isAppBoot.current = false;
        lastRecordedBvid.current = currentBvid;
        return;
      }

      // ONLY record a play if the song actually switched
      if (currentBvid !== lastRecordedBvid.current) {
        const track = playlist.find(t => t.bvid === currentBvid);
        if (track) {
          recordPlay(track);
          lastRecordedBvid.current = currentBvid;
        }
      }
    }
  }, [currentBvid, playlist]);

  const handleInitialSearch = async (keyword: string) => {
    setActiveView('Search');
    setIsLoading(true);
    setCurrentKeyword(keyword);
    setPage(1);
    setResults([]); 
    const newResults = await searchVideos(keyword, 1);
    setResults(newResults);
    setHasMore(newResults.length > 0);
    setIsLoading(false);
  };

  const fetchMoreData = async () => {
    if (isLoading || !hasMore || !currentKeyword) return;
    setIsLoading(true);
    const nextPage = page + 1;
    const newResults = await searchVideos(currentKeyword, nextPage);
    if (newResults.length === 0) setHasMore(false);
    else { setResults(prev => [...prev, ...newResults]); setPage(nextPage); }
    setIsLoading(false);
  };

  const observer = useRef<IntersectionObserver | null>(null);
  const triggerRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoading) return; 
    if (observer.current) observer.current.disconnect(); 
    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) fetchMoreData();
    });
    if (node) observer.current.observe(node);
  }, [isLoading, hasMore, currentKeyword, page]); 

  // Handlers
  const handlePlayTrack = async (track: VideoTrack) => {
    await addToPlaylist(track);
    setPlaylist(await getPlaylist());
    setCurrentBvid(track.bvid);
  };

  const handlePlayAll = async (tracks: VideoTrack[]) => {
    if (tracks.length === 0) return;
    
    // Clear existing DB playlist and bulk-insert the new tracks
    await clearPlaylist();
    for (const track of tracks) {
      await addToPlaylist(track);
    }
    
    setPlaylist(await getPlaylist());
    setCurrentBvid(tracks[0].bvid);
  };

  const handleReorder = async (newPlaylist: VideoTrack[]) => {
    setPlaylist(newPlaylist); 
    await updatePlaylistOrder(newPlaylist);
  };

  const handleRemove = async (bvid: string) => {
    await removeFromPlaylist(bvid);
    setPlaylist(await getPlaylist());
  };

  const handleClearPlaylist = async () => {
    await clearPlaylist();
    setPlaylist([]);
    setCurrentBvid(null);
  };

  const handleToggleFavorite = async (trackToToggle?: VideoTrack) => {
    const track = trackToToggle || playlist.find(t => t.bvid === currentBvid);
    if (!track) return;

    const isFav = favorites.some(f => f.bvid === track.bvid);
    if (isFav) {
      await removeFromFavorites(track.bvid);
    } else {
      await addToFavorites(track);
    }
    setFavorites(await getFavorites());
  };

  const handleAddToUserPlaylist = async (playlistId: string, track: VideoTrack) => {
    await addTrackToUserPlaylist(playlistId, track);
    loadUserPlaylists(); // Refresh covers
  };

  return (
    // Added pt-[env(safe-area-inset-top)] for the mobile status bar
    <div className="flex h-screen w-screen overflow-hidden transition-colors duration-300 pt-[env(safe-area-inset-top)]">
      
      {/* Hide the Sidebar entirely on mobile (hidden md:flex) */}
      {!isMiniMode && (
        <>
          {/* Dark background overlay for mobile */}
          {isMobileSidebarOpen && (
            <div className="md:hidden fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setIsMobileSidebarOpen(false)} />
          )}
          
          <div className={`fixed inset-y-0 left-0 z-[80] md:relative md:z-auto h-full shrink-0 transform transition-transform duration-300 md:translate-x-0 ${isMobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
            <Sidebar 
              activeView={activeView} 
              activePlaylistId={activePlaylistId}
              onNavigate={(view, id) => {
                setActiveView(view);
                setActivePlaylistId(id || null);
                setIsMobileSidebarOpen(false); // Auto-close drawer on navigation
              }} 
              playlists={userPlaylists}
              onCreatePlaylist={() => {
                handleCreatePlaylist();
                setIsMobileSidebarOpen(false); // Close drawer to show create modal clearly
              }}
            />
          </div>
        </>
      )}

      {/* <AuthManager /> */}
      
      <main className={`flex-1 flex flex-col h-full relative min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 ${isMiniMode ? 'hidden' : ''}`}>
        <SearchBar 
          onSearch={handleInitialSearch} 
          isLoading={isLoading} 
          onOpenSettings={() => {
            if (activeView === 'Settings') setActiveView(previousView);
            else { setPreviousView(activeView); setActiveView('Settings'); }
          }} 
          onToggleMiniMode={toggleMiniMode}
        />
        
        {/* VIEW ROUTING */}
        {activeView === 'Recommend' && (
          <RecommendPage 
            onPlayTrack={handlePlayTrack}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            userPlaylists={userPlaylists}
            onAddToPlaylist={handleAddToUserPlaylist}
          />
        )}

        {/* The existing code block, just changed the string to 'Search' */}
        {activeView === 'Search' && (
        <section className="flex-1 overflow-y-auto px-8 pb-32 mt-2 w-full max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">
            {currentKeyword ? `Results for "${currentKeyword}"` : "Search Results"}
          </h2>
            <div className="flex items-center gap-4 px-3 pb-2 mb-2 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
               <div className="w-6 text-center">#</div>
               <div className="w-12 text-center">Cover</div>
               <div className="flex-1 pl-1">Title & Artist</div>
               <div className="hidden md:flex items-center gap-6 w-48 justify-end">
                  <span>Plays</span>
                  <span className="w-10 text-right">Time</span>
               </div>
            </div>
            <div className="flex flex-col gap-1">
              {results.map((track, index) => {
                const isTriggerElement = index === results.length - 7;
                return (
                  <TrackCard 
                    key={`${track.bvid}-${index}`} 
                    track={track} 
                    index={index + 1} 
                    ref={isTriggerElement ? triggerRef : null} 
                    onClick={() => handlePlayTrack(track)}
                    isFav={favorites.some(f => f.bvid === track.bvid)}
                    onToggleFav={handleToggleFavorite}
                    onOpenPlaylistModal={setTrackToAdd}
                  />
                );
              })}
            </div>
            {isLoading && (
              <div className="flex justify-center py-6 text-[#0b57d0]">
                 <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              </div>
            )}
          </section>
        )}

        {activeView === 'Recent' && (
          <RecentPage 
            onPlayTrack={handlePlayTrack} 
            favorites={favorites} 
            onToggleFavorite={handleToggleFavorite} 
            userPlaylists={userPlaylists}
            onAddToPlaylist={handleAddToUserPlaylist}
          />
        )}

        {activeView === 'Favorites' && (
          <FavoritesPage 
            favorites={favorites}
            currentBvid={currentBvid}
            onPlayTrack={handlePlayTrack}
            onPlayAll={handlePlayAll} // <-- ADD THIS LINE
            onReorder={async (newFavs) => {
              setFavorites(newFavs);
              await updateFavoritesOrder(newFavs);
            }}
            onRemove={async (bvid) => {
              await removeFromFavorites(bvid);
              setFavorites(await getFavorites());
            }}
            userPlaylists={userPlaylists}              
            onAddToPlaylist={handleAddToUserPlaylist}
          />
        )}

        {activeView === 'Playlist' && activePlaylistId !== null && (
          <PlaylistPage 
            playlistId={activePlaylistId}
            playlists={userPlaylists}
            currentBvid={currentBvid}
            onPlayTrack={handlePlayTrack}
            onPlayAll={handlePlayAll} // <-- ADD THIS LINE
            onRefreshPlaylists={loadUserPlaylists}
            onDeleteComplete={() => {
               loadUserPlaylists();
               setActiveView('Recommend');
               setActivePlaylistId(null);
            }}
            userPlaylists={userPlaylists}
            onAddToPlaylist={handleAddToUserPlaylist}
            favorites={favorites}                    
            onToggleFavorite={handleToggleFavorite}   
          />
        )}

        {activeView === 'Settings' && (
          <SettingsPage />
        )}
      </main>

      <style>{`
        @media (max-width: 767px) {
          .mobile-player-wrapper > * {
            transform: translateY(calc(-4rem - env(safe-area-inset-bottom))) !important;
          }
        }
      `}</style>

      <div className={`${isMiniMode ? '' : 'mobile-player-wrapper'} contents`}>
        <PlayerBar 
          playlist={playlist}
          currentBvid={currentBvid}
          onPlayTrack={setCurrentBvid}
          onReorder={handleReorder}
          onRemove={handleRemove}
          onClear={handleClearPlaylist}
          favorites={favorites}
          isFavorite={favorites.some(f => f.bvid === currentBvid)}
          onToggleFavorite={handleToggleFavorite}
          userPlaylists={userPlaylists}
          onAddToPlaylist={handleAddToUserPlaylist}
          isMiniMode={isMiniMode}
          onToggleMiniMode={toggleMiniMode}
        />
      </div>

      {!isMiniMode && <BottomNav activeView={activeView} onNavigate={setActiveView} onTogglePlaylists={() => setIsMobileSidebarOpen(true)} t={t} />}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setIsCreateModalOpen(false)}>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-xl w-full max-w-sm mx-4 border border-gray-100 dark:border-gray-800" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 text-center text-gray-900 dark:text-white">
              Create Playlist
            </h3>
            <input
              type="text"
              autoFocus
              placeholder="Enter new playlist name..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmCreatePlaylist()}
              className="w-full px-4 py-3 mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0b57d0]"
            />
            <div className="flex gap-4">
              <button onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button onClick={confirmCreatePlaylist} disabled={!newPlaylistName.trim()} className="flex-1 py-3 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold transition-colors disabled:opacity-50">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {updateInfo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setUpdateInfo(null)}>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-2xl w-full max-w-sm mx-4 border border-gray-100 dark:border-gray-800 animate-fadeIn" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600 dark:text-green-400 shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('Update Available!')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('Version')} <span className="font-bold text-[#0b57d0] dark:text-[#699bf7]">{updateInfo.version}</span> {t('is ready.')}
                </p>
              </div>
            </div>
            
            {/* Release Notes */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-6 max-h-32 overflow-y-auto text-xs text-gray-600 dark:text-gray-300 font-mono whitespace-pre-wrap custom-scrollbar">
              {updateInfo.body}
            </div>

            <div className="flex gap-4">
              <button onClick={() => setUpdateInfo(null)} className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {t('Later')}
              </button>
              <button 
                onClick={() => { open(updateInfo.url); setUpdateInfo(null); }} 
                className="flex-1 py-3 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold transition-colors"
              >
                {t('Download')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}