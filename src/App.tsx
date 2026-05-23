import { useState, useRef, useCallback, useEffect } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
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
import SettingsPage from './components/SettingsPage';
import { getPlaylist, addToPlaylist, removeFromPlaylist, updatePlaylistOrder, clearPlaylist, recordPlay, getFavorites, addToFavorites, removeFromFavorites, updateFavoritesOrder, getUserPlaylists, createUserPlaylist, UserPlaylist, addTrackToUserPlaylist } from './services/db';
import { VideoTrack } from './types';

// The standalone Floating Lyric UI
function DesktopLyrics() {
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

export default function App() {
  // If Tauri spawns the lyrics window, Hijack the render instantly!
  if (getCurrentWindow().label === 'lyrics_window') {
    return <DesktopLyrics />;
  }

  const [isMiniMode, setIsMiniMode] = useState(false);

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

  const handleCreatePlaylist = async () => {
    const name = prompt("Enter new playlist name:");
    if (name && name.trim()) { 
      await createUserPlaylist(name.trim()); 
      loadUserPlaylists(); 
    }
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
    <div className="flex h-screen w-screen overflow-hidden transition-colors duration-300">
      {!isMiniMode && (
        <Sidebar 
          activeView={activeView} 
          activePlaylistId={activePlaylistId}
          onNavigate={(view, id) => {
            setActiveView(view);
            setActivePlaylistId(id || null);
          }} 
          playlists={userPlaylists}
          onCreatePlaylist={handleCreatePlaylist}
        />
      )}

      <AuthManager />
      
      <main className={`flex-1 flex flex-col h-full relative min-w-0 ${isMiniMode ? 'hidden' : ''}`}>
        <SearchBar 
          onSearch={handleInitialSearch} 
          isLoading={isLoading} 
          onOpenSettings={() => {
            // Toggle logic: If open, go back. If closed, save current and open.
            if (activeView === 'Settings') {
              setActiveView(previousView);
            } else {
              setPreviousView(activeView);
              setActiveView('Settings');
            }
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
  );
}