// src/components/RecentPage.tsx
import { useEffect, useState } from 'react';
import { getRecentTracks, RecentTrack, UserPlaylist } from '../services/db';
import { VideoTrack } from '../types';
import { useTranslation } from 'react-i18next';

interface RecentPageProps {
  onPlayTrack: (track: VideoTrack) => void;
  favorites: VideoTrack[];
  onToggleFavorite: (track: VideoTrack) => void;
  userPlaylists: UserPlaylist[];
  onAddToPlaylist: (playlistId: string, track: VideoTrack) => void;
}

export default function RecentPage({ onPlayTrack, favorites, onToggleFavorite, userPlaylists, onAddToPlaylist }: RecentPageProps) {
  const [recentTracks, setRecentTracks] = useState<RecentTrack[]>([]);
  const [trackToAdd, setTrackToAdd] = useState<VideoTrack | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    getRecentTracks().then(setRecentTracks);
  }, []);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0m 0s"; 
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <section className="flex-1 overflow-y-auto px-8 pb-32">
      <h2 className="text-2xl font-bold mb-6 mt-8 text-gray-800 dark:text-white">{t('Recently Played')}</h2>
      
      {recentTracks.length === 0 ? (
        <p className="text-gray-500 mt-10 text-center">{t('No play history yet.')}</p>
      ) : (
        <>
          <div className="flex items-center gap-4 px-3 pb-2 mb-2 border-b border-gray-200 dark:border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
             <div className="w-8 text-center">#</div>
             <div className="w-12 text-center">{t('Cover')}</div>
             <div className="flex-1 pl-1">{t('Title & Artist')}</div>
             <div className="hidden md:flex items-center gap-6 w-72 justify-end">
                <span className="w-20 text-center">{t('Play Count')}</span>
                <span className="w-24 text-right">{t('Total Time')}</span>
             </div>
          </div>

          <div className="flex flex-col gap-1">
            {recentTracks.map((track, index) => {
              const isFav = favorites.some(f => f.bvid === track.bvid);
              return (
                <div 
                  key={track.bvid} 
                  onClick={() => onPlayTrack(track)}
                  className="flex items-center gap-4 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer group"
                >
                  <div className="w-8 text-center text-sm font-medium text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200">{index + 1}</div>
                  <div className="w-12 h-12 rounded-md overflow-hidden shrink-0">
                    <img src={track.cover.startsWith('//') ? `https:${track.cover}` : track.cover} alt="cover" className="w-full h-full object-cover" />
                  </div>
                  {/* CRITICAL FIX: min-w-0 added here to prevent flexbox overflow from long titles */}
                  <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-[#0b57d0] dark:group-hover:text-[#699bf7] transition-colors">{track.title}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{track.uploader}</span>
                  </div>
                  <div className="hidden md:flex items-center gap-2 w-72 justify-end text-sm text-gray-500 relative shrink-0">
                    
                    {/* Default State: Stats (Hides on hover) */}
                    <div className="flex items-center gap-6 opacity-100 group-hover:hidden transition-opacity">
                      <span className="w-20 text-center font-medium bg-gray-100 dark:bg-gray-800 rounded-full py-0.5">{track.play_count}</span>
                      <span className="w-24 text-right">{formatTime(track.total_time)}</span>
                    </div>

                    {/* Hover State: Actions (Appears on hover) */}
                    <div className="hidden group-hover:flex items-center gap-1 z-10 absolute right-0">
                      <button onClick={(e) => { e.stopPropagation(); setTrackToAdd(track); }} className="p-1.5 text-gray-400 hover:text-[#0b57d0] hover:bg-blue-50 dark:hover:bg-[#0b57d0]/20 rounded-full transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(track); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-full transition-all">
                        <svg className={`w-4 h-4 ${isFav ? 'text-red-500 fill-red-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                        </svg>
                      </button>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* --- ADD TO PLAYLIST MODAL --- */}
      {trackToAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setTrackToAdd(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-96 max-h-[70vh] flex flex-col overflow-hidden transform transition-all" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Add to Playlist</h3>
              <button onClick={() => setTrackToAdd(null)} className="text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-white dark:bg-gray-800 rounded-full p-1 shadow-sm">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto p-2">
              {userPlaylists.length === 0 ? (
                <p className="text-gray-500 text-center py-8">{t('No playlists found. Create one in the sidebar!')}</p>
              ) : (
                userPlaylists.map(pl => {
                  const isAlreadyAdded = pl.trackIds?.includes(trackToAdd.bvid);
                  return (
                    <button 
                      key={pl.id} 
                      disabled={isAlreadyAdded}
                      onClick={() => { onAddToPlaylist(pl.id, trackToAdd); setTrackToAdd(null); }} 
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left group ${isAlreadyAdded ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50' : 'hover:bg-[#f0f4f9] dark:hover:bg-gray-800'}`}
                    >
                      {pl.cover ? (
                        <img src={pl.cover.startsWith('//') ? `https:${pl.cover}` : pl.cover} className={`w-12 h-12 rounded-md object-cover shrink-0 shadow-sm ${isAlreadyAdded ? 'grayscale' : ''}`} alt="cover"/>
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 shadow-sm text-gray-400">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className={`font-semibold transition-colors ${isAlreadyAdded ? 'text-gray-500' : 'text-gray-700 dark:text-gray-200 group-hover:text-[#0b57d0] dark:group-hover:text-[#699bf7]'}`}>{pl.name}</span>
                        {isAlreadyAdded && <span className="text-xs text-gray-400 mt-0.5">{t('Already added')}</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}