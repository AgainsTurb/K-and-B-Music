// src/components/RecommendPage.tsx
import { useEffect, useState, useRef, useCallback } from 'react';
import { VideoTrack } from '../types';
import { getLatestVideos, getRankingVideos, searchVideosInPartition, cloakBrowserStatus } from '../services/bilibili';
import { UserPlaylist } from '../services/db';
import { getAllCachedGenres } from '../services/genreSync'
import { useTranslation } from 'react-i18next';

interface RecommendPageProps {
  onPlayTrack: (track: VideoTrack) => void;
  favorites: VideoTrack[];
  onToggleFavorite: (track: VideoTrack) => void;
  userPlaylists: UserPlaylist[];
  onAddToPlaylist: (playlistId: string, track: VideoTrack) => void;
}

export default function RecommendPage({ onPlayTrack, favorites, onToggleFavorite, userPlaylists, onAddToPlaylist }: RecommendPageProps) {
  const [subView, setSubView] = useState<'Home' | 'For You'>('Home');
  const [trackToAdd, setTrackToAdd] = useState<VideoTrack | null>(null);

  // Column 1: Latest
  const [latestVideos, setLatestVideos] = useState<VideoTrack[]>([]);
  const [latestPage, setLatestPage] = useState(1);
  const [latestHasMore, setLatestHasMore] = useState(true);
  const [isLatestLoading, setIsLatestLoading] = useState(false);

  // Column 2: Ranking
  const [rankingVideos, setRankingVideos] = useState<VideoTrack[]>([]);
  const [personalizedTracks, setPersonalizedTracks] = useState<VideoTrack[]>([]);

  const [specialTracks, setSpecialTracks] = useState<VideoTrack[]>([]);
  const [genre1Name, setGenre1Name] = useState<string>('');
  const [genre2Name, setGenre2Name] = useState<string>('');
  const [genre1Tracks, setGenre1Tracks] = useState<VideoTrack[]>([]);
  const [genre2Tracks, setGenre2Tracks] = useState<VideoTrack[]>([]);

  const { t } = useTranslation();

  // Compute recommendation matches based on calculated genre metadata counts
  useEffect(() => {
    if (subView === 'For You' && cloakBrowserStatus.isLoggedIn) {
      calculatePersonalizedMix();
    }
  }, [subView]); 

  const calculatePersonalizedMix = async () => {
    const genreMap = await getAllCachedGenres();
    const weights: Record<string, number> = {};

    // 1. Count occurrences of favorite genres
    favorites.forEach(track => {
      const tags = genreMap[track.bvid] || [];
      tags.forEach(t => weights[t] = (weights[t] || 0) + 3);
    });

    // 2. Sort genres by weight to find the top 2
    const sortedGenres = Object.entries(weights)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
      
    const topGenres = sortedGenres.slice(0, 2);

    let g1Results: VideoTrack[] = [];
    let g2Results: VideoTrack[] = [];

    // 3. Fetch independent partition pools for the top 2 genres
    if (topGenres[0]) {
      setGenre1Name(topGenres[0]);
      g1Results = await searchVideosInPartition(`单曲 ${topGenres[0]}`, 3, 1);
      setGenre1Tracks(g1Results);
    } else {
      setGenre1Name('Recommended Pop');
      g1Results = rankingVideos.slice(0, 10);
      setGenre1Tracks(g1Results);
    }

    if (topGenres[1]) {
      setGenre2Name(topGenres[1]);
      g2Results = await searchVideosInPartition(`单曲 ${topGenres[1]}`, 3, 1);
      setGenre2Tracks(g2Results);
    } else {
      setGenre2Name('Trending Mix');
      g2Results = latestVideos.slice(0, 10);
      setGenre2Tracks(g2Results);
    }

    // 4. Craft the Top "Special" Grid (Sort combined pools by views descending)
    const combinedPool = [...g1Results, ...g2Results];
    const uniquePool = Array.from(new Map(combinedPool.map(t => [t.bvid, t])).values());
    const sortedByViews = uniquePool.sort((a, b) => b.views - a.views);
    
    setSpecialTracks(sortedByViews.slice(0, 8));
  };

  // Initial Fetch
  useEffect(() => {
    setIsLatestLoading(true);
    getLatestVideos(1).then(data => { setLatestVideos(data); setIsLatestLoading(false); });
    getRankingVideos(1).then(setRankingVideos);
  }, []);

  // Infinite Scroll for Latest
  const fetchMoreLatest = async () => {
    if (isLatestLoading || !latestHasMore) return;
    setIsLatestLoading(true);
    const next = latestPage + 1;
    const data = await getLatestVideos(next);
    if (data.length === 0) setLatestHasMore(false);
    else { setLatestVideos(prev => [...prev, ...data]); setLatestPage(next); }
    setIsLatestLoading(false);
  };

  const observer = useRef<IntersectionObserver | null>(null);
  const latestTriggerRef = useCallback((node: HTMLDivElement | null) => {
    if (isLatestLoading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => { if (entries[0].isIntersecting) fetchMoreLatest(); });
    if (node) observer.current.observe(node);
  }, [isLatestLoading, latestHasMore]);

  // Shared Compact Card Component
  const CompactCard = ({ track, index, isRanking, refNode }: any) => {
    const isFav = favorites.some(f => f.bvid === track.bvid);
    return (
      <div ref={refNode} onClick={() => onPlayTrack(track)} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer group">
        {/* ADDED shrink-0 so the number doesn't get squashed */}
        <div className="w-6 shrink-0 text-center text-xs font-bold text-gray-400 dark:text-gray-500">{index + 1}</div>
        
        <div className="w-14 h-10 rounded-md overflow-hidden shrink-0">
          <img src={track.cover.startsWith('//') ? `https:${track.cover}` : track.cover} alt="cover" className="w-full h-full object-cover" />
        </div>
        
        {/* ADDED min-w-0 HERE: This is the magic class that allows truncate to work inside a flex container! */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-[#0b57d0] transition-colors">{track.title}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{track.uploader}</span>
        </div>
        
        <div className="hidden xl:flex items-center gap-2 justify-end w-32 shrink-0 relative">
          {/* Default Stats */}
          <div className="flex items-center justify-end w-full opacity-100 group-hover:hidden transition-opacity">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              {isRanking ? `${(track.views / 10000).toFixed(1)}W plays` : track.pubdate_str.split(' ')[0]}
            </span>
          </div>
          {/* Hover Actions */}
          <div className="hidden group-hover:flex items-center gap-1 z-10 absolute right-0">
            <button onClick={(e) => { e.stopPropagation(); setTrackToAdd(track); }} className="p-1.5 text-gray-400 hover:text-[#0b57d0] hover:bg-blue-50 dark:hover:bg-[#0b57d0]/20 rounded-full transition-all"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg></button>
            <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(track); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-full transition-all"><svg className={`w-4 h-4 ${isFav ? 'text-red-500 fill-red-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg></button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="flex-1 flex flex-col overflow-hidden px-8 pb-32">
      {/* Sub-Navigation Switch */}
      <div className="flex items-center gap-6 mt-8 mb-6 border-b border-gray-200 dark:border-gray-800">
        <button onClick={() => setSubView('Home')} className={`pb-2 text-xl font-bold transition-colors border-b-2 ${subView === 'Home' ? 'border-[#0b57d0] text-gray-800 dark:text-gray-100' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>{t('Home')}</button>
        <button onClick={() => setSubView('For You')} className={`pb-2 text-xl font-bold transition-colors border-b-2 ${subView === 'For You' ? 'border-[#0b57d0] text-gray-800 dark:text-gray-100' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>{t('For You')}</button>
      </div>

      {subView === 'For You' ? (
        !cloakBrowserStatus.isLoggedIn ? (
          <div className="flex-1 flex flex-col items-center justify-center h-[50vh] text-center px-4 animate-fadeIn">
            <svg className="w-16 h-16 text-gray-400 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">{t('Service Not Available')}</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
              {t('The personalized "For You" recommendation engine requires the Stealth Engine and an active session. Please restart the app and complete the setup to enable this feature.')}
            </p>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto w-full space-y-6 pr-2 pb-8 animate-fadeIn" style={{ scrollbarWidth: 'none' }}>
          
          {/* SPECIAL GRIDS AREA */}
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm p-5">
            <div className="font-bold text-gray-800 dark:text-gray-100 mb-4 text-lg tracking-tight">{t('Special Pick')}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 md:gap-4">
              {specialTracks.map((track, i) => {
                const isFav = favorites.some(f => f.bvid === track.bvid);
                return (
                  <div key={`special-${track.bvid}-${i}`} onClick={() => onPlayTrack(track)} className="relative group rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 aspect-square cursor-pointer shadow-sm">
                    <img src={track.cover.startsWith('//') ? `https:${track.cover}` : track.cover} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="cover"/>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex flex-col justify-end p-3">
                      <span className="text-white text-xs font-semibold line-clamp-2 mb-0.5 leading-tight group-hover:text-[#d3e3fd] transition-colors">{track.title}</span>
                      <span className="text-gray-300 text-[10px] truncate">{track.uploader}</span>
                      <span className="text-gray-400 text-[9px] mt-0.5 font-medium">{(track.views / 10000).toFixed(1)}W {t('plays')}</span>
                    </div>
                    <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md p-1 rounded-full shadow-md z-20">
                      <button onClick={(e) => { e.stopPropagation(); setTrackToAdd(track); }} className="p-1 text-gray-500 hover:text-[#0b57d0] transition-colors rounded-full"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg></button>
                      <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(track); }} className="p-1 text-gray-500 hover:text-red-500 transition-colors rounded-full"><svg className={`w-3.5 h-3.5 ${isFav ? 'text-red-500 fill-red-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          

          {/* DUAL COLUMNS GENRES VIEW */}
          <div className="flex flex-col md:flex-row gap-6 md:h-[55vh]">
            {/* GENRE 1 COLUMN */}
            <div className="h-[45vh] md:h-auto flex-1 min-w-0 flex flex-col bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 font-bold text-gray-700 dark:text-gray-300 capitalize">{t('Taste Node:')} {genre1Name}</div>
              <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: 'none' }}>
                {genre1Tracks.map((track, i) => (
                  <CompactCard key={`g1-${track.bvid}-${i}`} track={track} index={i} isRanking={true} />
                ))}
              </div>
            </div>

            {/* GENRE 2 COLUMN */}
            <div className="h-[45vh] md:h-auto flex-1 min-w-0 flex flex-col bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 font-bold text-gray-700 dark:text-gray-300 capitalize">{t('Taste Node:')} {genre2Name}</div>
              <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: 'none' }}>
                {genre2Tracks.map((track, i) => (
                  <CompactCard key={`g2-${track.bvid}-${i}`} track={track} index={i} isRanking={true} />
                ))}
              </div>
            </div>
          </div>

        </div>
        )
      ) : (
        // CHANGED: Added max-w-6xl, mx-auto, and w-full to prevent ultra-wide stretching
        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-6 md:gap-8 overflow-y-auto md:overflow-hidden w-full pb-4" style={{ scrollbarWidth: 'none' }}>
          
          {/* LATEST COLUMN */}
          <div className="flex-none md:flex-1 h-[50vh] md:h-auto min-w-0 flex flex-col bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 font-bold text-gray-700 dark:text-gray-300">{t('Latest Music')}</div>
            <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: 'none' }}>
              {latestVideos.map((track, i) => (
                <CompactCard key={`${track.bvid}-${i}`} track={track} index={i} isRanking={false} refNode={i === latestVideos.length - 5 ? latestTriggerRef : null} />
              ))}
              {isLatestLoading && <div className="text-center py-4 text-[#0b57d0]"><svg className="animate-spin h-5 w-5 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>}
            </div>
          </div>

          {/* RANKING COLUMN */}
          <div className="flex-none md:flex-1 h-[50vh] md:h-auto min-w-0 flex flex-col bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 font-bold text-gray-700 dark:text-gray-300">{t('Top Ranking')}</div>
            <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: 'none' }}>
              {rankingVideos.map((track, i) => (
                <CompactCard key={`${track.bvid}-${i}`} track={track} index={i} isRanking={true} />
              ))}
            </div>
          </div>

        </div>
      )}

      {/* --- ADD TO PLAYLIST MODAL --- */}
      {trackToAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setTrackToAdd(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-96 max-h-[70vh] flex flex-col overflow-hidden transform transition-all" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{t('Add to Playlist')}</h3>
              <button onClick={() => setTrackToAdd(null)} className="text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-white dark:bg-gray-800 rounded-full p-1 shadow-sm"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div className="overflow-y-auto p-2">
              {userPlaylists.length === 0 ? <p className="text-gray-500 text-center py-8">{t('No playlists found. Create one in the sidebar!')}</p> : (
                userPlaylists.map(pl => {
                  const isAlreadyAdded = pl.trackIds?.includes(trackToAdd.bvid);
                  return (
                    <button key={pl.id} disabled={isAlreadyAdded} onClick={() => { onAddToPlaylist(pl.id, trackToAdd); setTrackToAdd(null); }} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left group ${isAlreadyAdded ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50' : 'hover:bg-[#f0f4f9] dark:hover:bg-gray-800'}`}>
                      {pl.cover ? <img src={pl.cover.startsWith('//') ? `https:${pl.cover}` : pl.cover} className={`w-12 h-12 rounded-md object-cover shrink-0 shadow-sm ${isAlreadyAdded ? 'grayscale' : ''}`} alt="cover"/> : <div className="w-12 h-12 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 shadow-sm text-gray-400"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg></div>}
                      <div className="flex flex-col"><span className={`font-semibold transition-colors ${isAlreadyAdded ? 'text-gray-500' : 'text-gray-700 dark:text-gray-200 group-hover:text-[#0b57d0] dark:group-hover:text-[#699bf7]'}`}>{pl.name}</span>{isAlreadyAdded && <span className="text-xs text-gray-400 mt-0.5">{t('Already added')}</span>}</div>
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