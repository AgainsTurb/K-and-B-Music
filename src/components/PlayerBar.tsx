// src/components/PlayerBar.tsx
import { useState, useEffect, useRef } from 'react';
import { VideoTrack } from '../types';
// CHANGED: Removed getTrackSubtitles, fetchLyricData, and SubtitleTrack imports
import { getPureAudioStream, LyricLine } from '../services/bilibili';
import { UserPlaylist, addPlayTime } from '../services/db';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { fetchNeteaseLyrics, fetchTencentLyrics } from '../services/legacy_lyrics';
import { fetchNeteaseProLyrics } from '../services/netease_lyric';
import { fetchTencentProLyrics } from '../services/tencent_lyric';
import { fetchKugouProLyrics } from '../services/kugou_lyric';
import { useTranslation } from 'react-i18next';

interface PlayerBarProps {
  playlist: VideoTrack[];
  currentBvid: string | null;
  onPlayTrack: (bvid: string) => void;
  onReorder: (newPlaylist: VideoTrack[]) => void;
  onRemove: (bvid: string) => void;
  onClear: () => void;
  favorites: VideoTrack[];
  isFavorite: boolean;
  onToggleFavorite: (track?: VideoTrack) => void;
  userPlaylists: UserPlaylist[];
  onAddToPlaylist: (playlistId: string, track: VideoTrack) => void;
  isMiniMode: boolean;
  onToggleMiniMode: () => void;
}

type LoopMode = 'sequence' | 'single' | 'random';

// --- SORTABLE COMPONENT FOR THE PLAYLIST ROW ---
function SortableTrackItem({ 
  item, currentBvid, isFav, onPlayTrack, onRemove, onToggleFav, onOpenPlaylistModal 
}: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.bvid });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1, opacity: isDragging ? 0.8 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`group flex items-center justify-between p-2 rounded-lg cursor-grab active:cursor-grabbing transition-colors select-none ${currentBvid === item.bvid ? 'bg-[#f0f4f9] dark:bg-[#0b57d0]/20 text-[#0b57d0] dark:text-[#699bf7]' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
      <div className="w-10 h-10 rounded overflow-hidden shrink-0 mr-3 cursor-pointer" onClick={() => onPlayTrack(item.bvid)}>
        <img src={item.cover ? (item.cover.startsWith('//') ? `https:${item.cover}` : item.cover) : ''} alt="cover" className="w-full h-full object-cover bg-gray-200 dark:bg-gray-700" />
      </div>

      <div className="flex flex-col overflow-hidden w-full cursor-pointer" onClick={() => onPlayTrack(item.bvid)}>
        <span className="text-sm font-medium truncate">{item.title}</span>
        <span className="text-xs opacity-60">{item.uploader}</span>
      </div>
      
      <div className="flex items-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10 relative">
        <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onOpenPlaylistModal(item); }} className="p-1.5 text-gray-400 hover:text-[#0b57d0] hover:bg-blue-50 dark:hover:bg-[#0b57d0]/20 rounded transition-all">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
        </button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onToggleFav(item); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded transition-all">
          <svg className={`w-4 h-4 ${isFav ? 'text-red-500 fill-red-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
        </button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRemove(item.bvid); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded transition-all">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </div>
  );
}

// --- MAIN COMPONENT ---
export default function PlayerBar({ playlist, currentBvid, onPlayTrack, onReorder, onRemove, onClear, favorites, isFavorite, onToggleFavorite, userPlaylists, onAddToPlaylist, isMiniMode, onToggleMiniMode }: PlayerBarProps) {
  const [trackToAdd, setTrackToAdd] = useState<VideoTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isImmersiveOpen, setIsImmersiveOpen] = useState(false);

  const [isMobileLyricsVisible, setIsMobileLyricsVisible] = useState(false);
  
  // Audio Engine States
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    if (/android|iphone|ipad|ipod/i.test(navigator.userAgent)) return 1.0;
    const saved = localStorage.getItem('player_volume');
    return saved !== null ? Number(saved) : 0.3;
  });
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // --- NEW: Sound Mode (B&O Style) States & Refs ---
  const [isSoundModeOpen, setIsSoundModeOpen] = useState(false);
  const [soundPos, setSoundPos] = useState(() => {
    const saved = localStorage.getItem('player_soundMode');
    return saved ? JSON.parse(saved) : { x: 0, y: 0 };
  });
  const isDraggingSound = useRef(false);
  const soundAreaRef = useRef<HTMLDivElement>(null);
  const lowShelfRef = useRef<BiquadFilterNode | null>(null);
  const peakingRef = useRef<BiquadFilterNode | null>(null);
  const highShelfRef = useRef<BiquadFilterNode | null>(null);

  // --- Audio Visualizer Refs ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const requestFrameRef = useRef<number>(0);

  // Lyrics Engine States
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollTimeoutRef = useRef<number | null>(null);

  // CHANGED: Defaulted strictly to netease, removed Bilibili
  const [subtitleSource, setSubtitleSource] = useState<'netease_pro' | 'tencent_pro' | 'kugou_pro' | 'netease' | 'tencent'>('netease_pro');
  const [isSubtitleMenuOpen, setIsSubtitleMenuOpen] = useState(false);
  const [isLegacyExpanded, setIsLegacyExpanded] = useState(false);

  const [neteaseProLyrics, setNeteaseProLyrics] = useState<any[]>([]);
  const [isFetchingNeteasePro, setIsFetchingNeteasePro] = useState(false);
  
  const [tencentProLyrics, setTencentProLyrics] = useState<any[]>([]);
  const [isFetchingTencentPro, setIsFetchingTencentPro] = useState(false);

  const [kugouProLyrics, setKugouProLyrics] = useState<any[]>([]);
  const [isFetchingKugouPro, setIsFetchingKugouPro] = useState(false);

  const [lyricOffset, setLyricOffset] = useState(0);

  const [neteaseLyrics, setNeteaseLyrics] = useState<any[]>([]);
  const [isFetchingNetease, setIsFetchingNetease] = useState(false);
  const [tencentLyrics, setTencentLyrics] = useState<any[]>([]);
  const [isFetchingTencent, setIsFetchingTencent] = useState(false);

  // Playlist & Cycle States
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [loopMode, setLoopMode] = useState<LoopMode>('sequence');
  const isInitialMount = useRef(true);
  const shouldRestoreTime = useRef(true);
  const loadedTrackBvid = useRef<string | null>(null);

  // Derive active track
  const track = playlist.find(t => t.bvid === currentBvid) || null;
  const currentIndex = playlist.findIndex(t => t.bvid === currentBvid);

  const [isDesktopLyricOpen, setIsDesktopLyricOpen] = useState(false);

  const { t } = useTranslation();

  const toggleDesktopLyric = async () => {
    if (isDesktopLyricOpen) {
      const win = await WebviewWindow.getByLabel('lyrics_window');
      if (win) await win.close();
      setIsDesktopLyricOpen(false);
    } else {
      const win = new WebviewWindow('lyrics_window', {
        url: '/', // Points back to App.tsx where we intercept it!
        transparent: true,
        decorations: false,
        alwaysOnTop: true,
        width: 1000,
        height: 140,
        minWidth: 600,
        minHeight: 80,
        resizable: true,
        skipTaskbar: true,
        shadow: false
      });
      win.once('tauri://created', () => setIsDesktopLyricOpen(true));
      win.onCloseRequested(() => setIsDesktopLyricOpen(false));

      win.once('tauri://error', (e) => {
        console.error("Failed to spawn Lyrics Window:", e);
      });
    }
  };

  useEffect(() => {
    if (!isMiniMode && isDesktopLyricOpen) {
      WebviewWindow.getByLabel('lyrics_window').then(win => {
        if (win) win.close();
      });
      setIsDesktopLyricOpen(false);
    }
  }, [isMiniMode]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = playlist.findIndex((t) => t.bvid === active.id);
      const newIndex = playlist.findIndex((t) => t.bvid === over.id);
      const newPlaylist = arrayMove(playlist, oldIndex, newIndex);
      onReorder(newPlaylist);
    }
  };

  // --- NEW: Sound Mode Math & Event Listeners ---
  const updateSoundPos = (clientX: number, clientY: number) => {
    if (!soundAreaRef.current) return;
    const rect = soundAreaRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxR = rect.width / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Pythagorean Clamp: Keep the puck strictly inside the circle!
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }

    setSoundPos({ x: dx / maxR, y: dy / maxR });
  };

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!isDraggingSound.current) return;
      updateSoundPos(e.clientX, e.clientY);
    };
    const handleUp = () => {
      isDraggingSound.current = false;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, []);

  useEffect(() => {
    if (track && track.bvid !== loadedTrackBvid.current) {
      loadedTrackBvid.current = track.bvid;

      setIsLoadingAudio(true);
      setAudioUrl(''); 
      setNeteaseProLyrics([]);
      setTencentProLyrics([]);
      setKugouProLyrics([]);
      setNeteaseLyrics([]);
      setTencentLyrics([]);
      
      setIsFetchingNeteasePro(false);
      setIsFetchingTencentPro(false);
      setIsFetchingKugouPro(false);
      setIsFetchingNetease(false);
      setIsFetchingTencent(false);

      setSubtitleSource('netease_pro');  
      setLyricOffset(0);
      
      const isBoot = isInitialMount.current;
      if (isBoot) {
        isInitialMount.current = false;
      } else {
        setCurrentTime(0);
        localStorage.setItem('player_currentTime', '0');
      }
      
      setIsPlaying(false);
      
      getPureAudioStream(track.bvid).then((url) => {
        if (url) {
          setAudioUrl(url);
          if (isBoot) {
            setIsPlaying(false);
          } else {
            setIsPlaying(true);
          }
        }
        setIsLoadingAudio(false);
      });
    }
  }, [track?.bvid]);

  useEffect(() => {
    if (subtitleSource === 'netease' && track && neteaseLyrics.length === 0 && !isFetchingNetease) {
      setIsFetchingNetease(true);
      fetchNeteaseLyrics(track.title).then(lrc => {
        setNeteaseLyrics(lrc);
        setIsFetchingNetease(false);
      });
    }
  }, [subtitleSource, track, neteaseLyrics.length]);

  useEffect(() => {
    if (subtitleSource === 'tencent' && track && tencentLyrics.length === 0 && !isFetchingTencent) {
      setIsFetchingTencent(true);
      fetchTencentLyrics(track.title).then(lrc => {
        setTencentLyrics(lrc);
        setIsFetchingTencent(false);
      });
    }
  }, [subtitleSource, track, tencentLyrics.length]);

  const displayLyrics = subtitleSource === 'kugou_pro' ? (kugouProLyrics || []) :
                        subtitleSource === 'tencent_pro' ? (tencentProLyrics || []) :
                        subtitleSource === 'tencent' ? (tencentLyrics || []) : 
                        subtitleSource === 'netease' ? (neteaseLyrics || []) : 
                        (neteaseProLyrics || []);

  const effectiveTime = currentTime - lyricOffset;

  const activeLyricIndex = displayLyrics.findIndex((l, i) => {
    const next = displayLyrics[i + 1];
    return effectiveTime >= l.from && (!next || effectiveTime < next.from);
  });

  const handleLyricsScroll = () => {
    setAutoScroll(false);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = window.setTimeout(() => setAutoScroll(true), 3000);
  };

  useEffect(() => {
    if (autoScroll && activeLyricIndex !== -1 && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current;
      const el = container.querySelector(`[data-index="${activeLyricIndex}"]`) as HTMLElement;
      
      if (el) {
        // Calculate where the element should sit relative to the container's top edge
        const containerCenter = container.clientHeight / 2;
        const elCenter = el.offsetTop + (el.clientHeight / 2);
        const targetScrollTop = elCenter - containerCenter;

        container.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
      }
    }
  }, [activeLyricIndex, autoScroll]);

  // Emit lyrics in real-time to the floating window
  useEffect(() => {
    const activeLyric = activeLyricIndex !== -1 ? displayLyrics[activeLyricIndex] : null;
    if (activeLyric) {
      emit('lyric-update', { 
        text: activeLyric.content, 
        translation: activeLyric.translation || '',
        words: activeLyric.words || null
      }).catch(() => {});
    } else {
      emit('lyric-update', { text: '♪', translation: '', words: null }).catch(() => {});
    }
  }, [activeLyricIndex, displayLyrics.length, track?.bvid]);

  // --- NEW: Upgraded Helper to parse Word-by-Word + Translations ---
  const parseVerbatimToLines = (rawLrc: string): any[] => {
    if (!rawLrc) return [];
    const lines = rawLrc.split('\n');
    const parsed: any[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    // Regex to capture the timestamp and the exact word characters following it
    const wordRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]([^\[]*)/g;

    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Split the original text from the translation using our backend separator
      const parts = line.split('  •  ');
      const origPart = parts[0];
      const transPart = parts[1] || '';

      const match = timeRegex.exec(origPart);
      if (match) {
        const m = parseInt(match[1], 10);
        const s = parseInt(match[2], 10);
        const msStr = match[3];
        const ms = msStr.length === 2 ? parseInt(msStr, 10) * 10 : parseInt(msStr, 10);
        const time = m * 60 + s + ms / 1000;
        
        // Parse the individual words and their local timestamps
        const words = [];
        let wordMatch;
        wordRegex.lastIndex = 0;
        while ((wordMatch = wordRegex.exec(origPart)) !== null) {
          const wm = parseInt(wordMatch[1], 10);
          const ws = parseInt(wordMatch[2], 10);
          const wmsStr = wordMatch[3];
          const wms = wmsStr.length === 2 ? parseInt(wmsStr, 10) * 10 : parseInt(wmsStr, 10);
          const wTime = wm * 60 + ws + wms / 1000;
          const wText = wordMatch[4];
          if (wText) {
            words.push({ time: wTime, text: wText, duration: 0 });
          }
        }

        for (let i = 0; i < words.length; i++) {
          words[i].duration = i < words.length - 1 ? words[i + 1].time - words[i].time : 1.5;
        }

        // Clean out timestamps for fallback strings
        const cleanContent = origPart.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
        const cleanTrans = transPart.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
        
        if (cleanContent) {
          parsed.push({ 
            from: time, 
            to: 0, 
            content: cleanContent,
            words: words.length > 0 ? words : null,
            translation: cleanTrans || null
          });
        }
      }
    }

    for (let i = 0; i < parsed.length - 1; i++) {
      parsed[i].to = parsed[i + 1].from;
    }
    if (parsed.length > 0) parsed[parsed.length - 1].to = parsed[parsed.length - 1].from + 10;
    return parsed;
  };

  // --- NEW: Netease Pro Effect ---
  useEffect(() => {
    if (subtitleSource === 'netease_pro' && track && neteaseProLyrics.length === 0 && !isFetchingNeteasePro) {
      setIsFetchingNeteasePro(true);
      fetchNeteaseProLyrics(track.title, true).then(lrcString => {
        const parsed = parseVerbatimToLines(lrcString);
        setNeteaseProLyrics(parsed);
        setIsFetchingNeteasePro(false);
      });
    }
  }, [subtitleSource, track, neteaseProLyrics.length]);

  useEffect(() => {
    if (subtitleSource === 'tencent_pro' && track && tencentProLyrics.length === 0 && !isFetchingTencentPro) {
      setIsFetchingTencentPro(true);
      fetchTencentProLyrics(track.title, true).then(lrcString => {
        const parsed = parseVerbatimToLines(lrcString);
        setTencentProLyrics(parsed);
        setIsFetchingTencentPro(false);
      });
    }
  }, [subtitleSource, track, tencentProLyrics.length]);

  useEffect(() => {
    if (subtitleSource === 'kugou_pro' && track && kugouProLyrics.length === 0 && !isFetchingKugouPro) {
      setIsFetchingKugouPro(true);
      fetchKugouProLyrics(track.title, true).then(lrcString => {
        const parsed = parseVerbatimToLines(lrcString);
        setKugouProLyrics(parsed);
        setIsFetchingKugouPro(false);
      });
    }
  }, [subtitleSource, track, kugouProLyrics.length]);

  useKeyboardControls({
    onTogglePlay: () => setIsPlaying(prev => !prev),
  });

  useEffect(() => {
    let frameId: number;
    const smoothTimeUpdate = () => {
      if (isPlaying && audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
        emit('lyric-time', audioRef.current.currentTime - lyricOffset).catch(() => {});
        frameId = requestAnimationFrame(smoothTimeUpdate);
      }
    };
    
    if (isPlaying) {
      frameId = requestAnimationFrame(smoothTimeUpdate);
    }
    
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, lyricOffset]);

  // --- NEW: Real-Time Playback Analytics Engine ---
  const accumulatedTime = useRef(0);
  const lastTick = useRef(Date.now());

  useEffect(() => {
    let interval: number;
    
    // 1. If playing, tick every second and flush to the DB every 5 seconds
    if (isPlaying && currentBvid) {
      lastTick.current = Date.now();
      interval = window.setInterval(() => {
        const now = Date.now();
        const delta = (now - lastTick.current) / 1000;
        lastTick.current = now;
        accumulatedTime.current += delta;

        // Periodic safety flush (survives sudden app kills)
        if (accumulatedTime.current >= 5) {
          addPlayTime(currentBvid, accumulatedTime.current);
          accumulatedTime.current = 0;
        }
      }, 1000);
    } else {
      // 2. If paused, immediately flush any remaining leftover seconds
      if (accumulatedTime.current > 0 && currentBvid) {
        addPlayTime(currentBvid, accumulatedTime.current);
        accumulatedTime.current = 0;
      }
    }

    // 3. Cleanup: Flush if the component unmounts or track changes
    return () => {
      clearInterval(interval);
      if (accumulatedTime.current > 0 && currentBvid) {
        addPlayTime(currentBvid, accumulatedTime.current);
        accumulatedTime.current = 0;
      }
    };
  }, [isPlaying, currentBvid]);

  // 4. Ultimate safety: Flush if the entire window is closed abruptly
  useEffect(() => {
    const handleUnload = () => {
      if (accumulatedTime.current > 0 && currentBvid) {
        addPlayTime(currentBvid, accumulatedTime.current);
        accumulatedTime.current = 0;
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [currentBvid]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying && audioUrl) {
        if (!audioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          audioCtxRef.current = new AudioContextClass();
          
          // --- CHANGED: Create the 3-Band Parametric EQ ---
          lowShelfRef.current = audioCtxRef.current.createBiquadFilter();
          lowShelfRef.current.type = 'lowshelf';
          lowShelfRef.current.frequency.value = 250;

          peakingRef.current = audioCtxRef.current.createBiquadFilter();
          peakingRef.current.type = 'peaking';
          peakingRef.current.frequency.value = 2500;
          peakingRef.current.Q.value = 1;

          highShelfRef.current = audioCtxRef.current.createBiquadFilter();
          highShelfRef.current.type = 'highshelf';
          highShelfRef.current.frequency.value = 4000;

          analyserRef.current = audioCtxRef.current.createAnalyser();
          analyserRef.current.fftSize = 128;
          
          sourceRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current);
          
          // --- CHANGED: Connect the new Signal Chain ---
          // Source -> Low -> Mid(Peak) -> High -> Visualizer -> Speakers
          sourceRef.current.connect(lowShelfRef.current);
          lowShelfRef.current.connect(peakingRef.current);
          peakingRef.current.connect(highShelfRef.current);
          highShelfRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioCtxRef.current.destination);
        }
        
        if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
        }
        
        audioRef.current.play().catch(e => console.log("Autoplay blocked:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, audioUrl]);

  // --- NEW: Apply 2D Coordinates to Audio Hardware ---
  useEffect(() => {
    localStorage.setItem('player_soundMode', JSON.stringify(soundPos));
    if (lowShelfRef.current && peakingRef.current && highShelfRef.current) {
      const { x, y } = soundPos;
      
      // X-Axis (Left/Right) = Energetic vs Relaxed (Presence control)
      peakingRef.current.gain.value = x * 12; // -12dB to +12dB
      
      // Y-Axis (Top/Bottom) = Bright vs Warm (Tilt control)
      // UI top is negative Y, bottom is positive Y. 
      highShelfRef.current.gain.value = -y * 10; 
      lowShelfRef.current.gain.value = y * 10;
    }
  }, [soundPos]);

  useEffect(() => {
    if (!isPlaying || !isImmersiveOpen) {
      cancelAnimationFrame(requestFrameRef.current);
      return;
    }

    const drawVisualizer = () => {
      if (!analyserRef.current || !canvasRef.current) {
        requestFrameRef.current = requestAnimationFrame(drawVisualizer);
        return;
      }

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
      if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const visibleBins = Math.floor(bufferLength * 0.75);
      const barWidth = Math.max((canvas.width / visibleBins) - 2, 1);
      let x = 0;

      for (let i = 0; i < visibleBins; i++) {
        const percent = dataArray[i] / 255;
        const barHeight = Math.max(percent * canvas.height, 2);
        
        ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + percent * 0.6})`;
        
        const radius = Math.max(Math.min(barWidth / 2, 4), 0);
        ctx.beginPath();
        ctx.roundRect(x, canvas.height - barHeight, barWidth, barHeight, [radius, radius, 0, 0]);
        ctx.fill();

        x += barWidth + 2;
      }

      requestFrameRef.current = requestAnimationFrame(drawVisualizer);
    };

    drawVisualizer();

    return () => cancelAnimationFrame(requestFrameRef.current);
  }, [isPlaying, isImmersiveOpen]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume * volume;
    localStorage.setItem('player_volume', volume.toString());
  }, [volume, audioUrl]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (!shouldRestoreTime.current) {
        localStorage.setItem('player_currentTime', audioRef.current.currentTime.toString());
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      
      if (shouldRestoreTime.current) {
        const savedTime = Number(localStorage.getItem('player_currentTime')) || 0;
        if (savedTime < audioRef.current.duration) {
          audioRef.current.currentTime = savedTime;
          setCurrentTime(savedTime);
        }
        shouldRestoreTime.current = false;
      }
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const handleNext = () => {
    if (playlist.length === 0) return;
    if (loopMode === 'single') {
      if (audioRef.current) audioRef.current.currentTime = 0;
      audioRef.current?.play();
    } else if (loopMode === 'random') {
      const randIdx = Math.floor(Math.random() * playlist.length);
      onPlayTrack(playlist[randIdx].bvid);
    } else {
      const nextIdx = (currentIndex + 1) % playlist.length;
      onPlayTrack(playlist[nextIdx].bvid);
    }
  };

  const handlePrev = () => {
    if (playlist.length === 0) return;
    if (loopMode === 'single') {
      if (audioRef.current) audioRef.current.currentTime = 0;
      audioRef.current?.play();
    } else if (loopMode === 'random') {
      const randIdx = Math.floor(Math.random() * playlist.length);
      onPlayTrack(playlist[randIdx].bvid);
    } else {
      const prevIdx = currentIndex - 1 < 0 ? playlist.length - 1 : currentIndex - 1;
      onPlayTrack(playlist[prevIdx].bvid);
    }
  };

  useEffect(() => {
    let unlistenPlay: any, unlistenPause: any, unlistenPrev: any, unlistenNext: any;

    const setupListeners = async () => {
      unlistenPlay = await listen('taskbar-play', () => setIsPlaying(true));
      unlistenPause = await listen('taskbar-pause', () => setIsPlaying(false));
      unlistenPrev = await listen('taskbar-prev', handlePrev);
      unlistenNext = await listen('taskbar-next', handleNext);
    };

    setupListeners();

    return () => {
      if (unlistenPlay) unlistenPlay();
      if (unlistenPause) unlistenPause();
      if (unlistenPrev) unlistenPrev();
      if (unlistenNext) unlistenNext();
    };
  }, [playlist, currentIndex, loopMode]);

  useEffect(() => {
    if (track) {
      invoke('update_taskbar', { 
        payload: {
          isPlaying, 
          title: track.title, 
          coverUrl: track.cover.startsWith('//') ? `https:${track.cover}` : track.cover 
        }
      }).catch(err => console.error("TAURI INVOKE ERROR:", err));
    }
  }, [track, isPlaying]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!track) return null;

  if (isMiniMode) {
    return (
      <>
        <audio 
          ref={audioRef}
          src={audioUrl || undefined}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleNext}
          crossOrigin="anonymous"
          playsInline
          preload="auto"
        />
        
        <div className="w-full h-full bg-white dark:bg-gray-950 p-4 flex flex-col items-center justify-between select-none relative animate-fadeIn">
          {/* Top Control Header */}
          <div className="w-full flex justify-between items-center z-10">
            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">{t('Mini Mode')}</span>
            <button 
              onClick={onToggleMiniMode}
              className="p-1.5 text-gray-400 hover:text-[#0b57d0] dark:hover:text-[#699bf7] hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
              title="Expand Window"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4h16v16H4zM4 12h16"/>
              </svg>
            </button>
          </div>

          {/* Center Cover + Details Card Layout */}
          <div className="flex items-center gap-4 w-full px-2 my-2">
            <div className="w-16 h-16 rounded-xl overflow-hidden shadow-md shrink-0 bg-gray-100 dark:bg-gray-800">
              <img src={track.cover.startsWith('//') ? `https:${track.cover}` : track.cover} alt="cover" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col overflow-hidden text-left flex-1">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{track.title}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{track.uploader}</span>
            </div>
          </div>

          {/* Core Player Control Functions Strip */}
          <div className="w-full flex flex-col items-center gap-2">
            {/* Timestamp Scrubber Bar */}
            <div className="w-full h-1 bg-gray-200 dark:bg-gray-800 cursor-pointer group relative rounded-full overflow-hidden">
              <div className="absolute top-0 left-0 h-full bg-[#0b57d0]" style={{ width: `${progressPercent}%` }}></div>
              <input type="range" min={0} max={duration || 100} value={currentTime} onChange={handleScrub} className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10" />
            </div>
            
            {/* Timing Text Indicators */}
            <div className="w-full flex justify-between text-[10px] font-mono text-gray-400 px-0.5">
              <span>{Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')}</span>
              <span>{Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}</span>
            </div>

            {/* Subtitles, Playback, and Volume all tightly packed on one line */}
            <div className="w-full flex items-center justify-between mt-1 px-1">
              
              {/* Floating Lyric Button */}
              <div className="relative z-50">
                {isSubtitleMenuOpen && (
                  <div className="fixed inset-0 z-40" onClick={() => setIsSubtitleMenuOpen(false)} />
                )}
                
                <button 
                  onClick={() => setIsSubtitleMenuOpen(!isSubtitleMenuOpen)} 
                  title="Subtitle Menu"
                  className={`w-7 h-7 flex items-center justify-center border-2 rounded-[5px] font-bold text-[12px] transition-colors shrink-0 ${isSubtitleMenuOpen || isDesktopLyricOpen ? 'text-[#0b57d0] border-[#0b57d0] bg-blue-50 dark:bg-[#0b57d0]/20' : 'text-gray-500 border-gray-400 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  字
                </button>

                {isSubtitleMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-3 bg-white/95 dark:bg-black/95 backdrop-blur-xl rounded-xl p-3 flex flex-col gap-2 shadow-[0_10px_40px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-50 min-w-[180px] border border-gray-200 dark:border-white/10 animate-fadeIn">
                    
                    {/* Desktop Lyric Toggle */}
                    <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-gray-200 dark:border-white/10">
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{t('Desktop Lyric')}</span>
                      <button onClick={toggleDesktopLyric} className={`w-8 h-4 rounded-full relative transition-colors ${isDesktopLyricOpen ? 'bg-[#0b57d0]' : 'bg-gray-400 dark:bg-gray-600'}`}>
                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${isDesktopLyricOpen ? 'translate-x-4' : ''}`}></div>
                      </button>
                    </div>

                    {/* Source Options */}
                    <span className="text-[10px] font-bold text-gray-400 px-2 pt-1 uppercase tracking-wider">{t('Source')}</span>
                    <button onClick={() => { setSubtitleSource('netease_pro'); setIsSubtitleMenuOpen(false); }} className={`text-xs px-2 py-2 rounded-lg text-left transition-colors flex justify-between ${subtitleSource === 'netease_pro' ? 'bg-[#0b57d0] text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'}`}><span>{t('Netease (Pro)')}</span></button>
                    <button onClick={() => { setSubtitleSource('tencent_pro'); setIsSubtitleMenuOpen(false); }} className={`text-xs px-2 py-2 rounded-lg text-left transition-colors flex justify-between ${subtitleSource === 'tencent_pro' ? 'bg-[#0b57d0] text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'}`}><span>{t('Tencent (Pro)')}</span></button>
                    <button onClick={() => { setSubtitleSource('kugou_pro'); setIsSubtitleMenuOpen(false); }} className={`text-xs px-2 py-2 rounded-lg text-left transition-colors flex justify-between ${subtitleSource === 'kugou_pro' ? 'bg-[#0b57d0] text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'}`}><span>{t('KuGou (Pro)')}</span></button>
                  </div>
                )}
              </div>

              {/* Media Action Trigger Row */}
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <button onClick={handlePrev} className="hover:text-[#0b57d0] dark:hover:text-[#699bf7] transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                
                <button onClick={() => setIsPlaying(!isPlaying)} disabled={isLoadingAudio} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#d3e3fd] dark:bg-[#0b57d0]/20 hover:bg-[#b4cffb] text-[#041e49] dark:text-[#699bf7] transition-colors">
                  {isLoadingAudio ? (
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : isPlaying ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  ) : (
                    <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  )}
                </button>

                <button onClick={handleNext} className="hover:text-[#0b57d0] dark:hover:text-[#699bf7] transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>

              {/* Compact Volume Slider */}
              <div className="flex items-center gap-1.5 w-16 shrink-0">
                <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
                <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-full h-1 bg-gray-200 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#0b57d0]" />
              </div>
              
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <audio 
        ref={audioRef}
        src={audioUrl || undefined}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleNext}
        crossOrigin="anonymous"
        playsInline
        preload="auto"
      />

      {isPlaylistOpen && (
        <div 
          className="fixed inset-0 z-50"
          onClick={() => setIsPlaylistOpen(false)}
        />
      )}

      <div 
        className={`fixed right-0 w-full sm:w-96 md:w-[28rem] top-[15vh] md:top-0 bottom-[70px] md:bottom-20 bg-white dark:bg-gray-900 shadow-[0_-10px_30px_rgba(0,0,0,0.15)] md:shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-50 flex flex-col rounded-t-3xl md:rounded-none border-l-0 md:border-l md:border-gray-200 md:dark:border-gray-800 overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isPlaylistOpen ? 'translate-y-0 translate-x-0' : 'translate-y-[100vh] md:translate-y-0 translate-x-0 md:translate-x-full'}`}
      >
        <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-gray-800 dark:text-gray-100">{t('Playlist')} ({playlist.length})</h3>
          <div className="flex items-center gap-2">
            <button onClick={onClear} className="text-xs font-semibold text-red-500 hover:text-red-600 px-3 py-1.5 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded transition-colors">
              {t('Clear All')}
            </button>
            <button onClick={() => setIsPlaylistOpen(false)} className="text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={playlist.map(t => t.bvid)} strategy={verticalListSortingStrategy}>
              {playlist.map((item) => (
                <SortableTrackItem 
                  key={item.bvid} item={item} currentBvid={currentBvid} 
                  isFav={favorites.some(f => f.bvid === item.bvid)} 
                  onPlayTrack={onPlayTrack} onRemove={onRemove} onToggleFav={onToggleFavorite}
                  onOpenPlaylistModal={setTrackToAdd}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <div 
        onClick={() => setIsMobileLyricsVisible(false)}
        className={`fixed inset-0 z-30 bg-[#0a0a0a] text-white transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isImmersiveOpen ? 'translate-y-0' : 'translate-y-full'} flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-[86px] overflow-hidden`}
      >
        
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-40 blur-3xl scale-125 pointer-events-none transition-all duration-700"
          style={{ backgroundImage: track.cover ? `url(${track.cover.startsWith('//') ? `https:${track.cover}` : track.cover})` : 'none' }}
        />
        
        <button onClick={(e) => { e.stopPropagation(); setIsImmersiveOpen(false); setIsMobileLyricsVisible(false); }} className="absolute top-[calc(4.5rem+env(safe-area-inset-top))] md:top-8 left-4 md:left-8 p-3 hover:bg-white/10 rounded-full transition-colors z-50">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
        </button>

        <div className={`absolute bottom-[100px] right-8 flex-col items-end gap-2 z-50 ${isMobileLyricsVisible ? 'flex' : 'hidden md:flex'}`}>
          
          {isSubtitleMenuOpen && (
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => { setIsSubtitleMenuOpen(false); setIsLegacyExpanded(false); }} 
            />
          )}

          {isSubtitleMenuOpen && (
            <div className="bg-black/50 backdrop-blur-md rounded-xl p-3 flex flex-col gap-2 animate-fadeIn min-w-[160px] border border-white/10 shadow-2xl relative z-50">
              
              {/* Sync Offset Adjuster */}
              <span className="text-[10px] font-bold text-gray-400 px-2 pt-1 pb-1 uppercase tracking-wider">{t('Sync Offset')}</span>
              <div className="flex items-center justify-between text-sm px-2 py-1 text-gray-300">
                <span className="text-xs">{t('Adjust')}</span>
                <div className="flex items-center gap-3 bg-white/10 rounded-lg px-2 py-1">
                  <button onClick={(e) => { e.stopPropagation(); setLyricOffset(prev => prev - 0.5); }} className="hover:text-white font-bold px-1 transition-colors">-</button>
                  <span className="w-8 text-center text-xs font-mono">{(lyricOffset > 0 ? '+' : '')}{lyricOffset.toFixed(1)}s</span>
                  <button onClick={(e) => { e.stopPropagation(); setLyricOffset(prev => prev + 0.5); }} className="hover:text-white font-bold px-1 transition-colors">+</button>
                </div>
              </div>
              
              <div className="h-px bg-white/10 my-1"></div>
              
              <span className="text-[10px] font-bold text-gray-400 px-2 pt-1 pb-1 uppercase tracking-wider">{t('Source')}</span>

              {/* Netease Pro Button */}
              <button
                onClick={(e) => { e.stopPropagation(); setSubtitleSource('netease_pro'); setIsSubtitleMenuOpen(false); setIsLegacyExpanded(false); }}
                className={`text-sm px-2 py-1.5 rounded-lg text-left transition-colors flex items-center justify-between ${subtitleSource === 'netease_pro' ? 'bg-[#0b57d0] text-white font-medium' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
              >
                <span>{t('Netease (Pro)')}</span>
                {isFetchingNeteasePro && <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
              </button>

              {/* Tencent Pro Button */}
              <button
                onClick={(e) => { e.stopPropagation(); setSubtitleSource('tencent_pro'); setIsSubtitleMenuOpen(false); setIsLegacyExpanded(false); }}
                className={`text-sm px-2 py-1.5 rounded-lg text-left transition-colors flex items-center justify-between ${subtitleSource === 'tencent_pro' ? 'bg-[#0b57d0] text-white font-medium' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
              >
                <span>{t('Tencent (Pro)')}</span>
                {isFetchingTencentPro && <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
              </button>

              {/* KuGou Pro Button */}
              <button
                onClick={(e) => { e.stopPropagation(); setSubtitleSource('kugou_pro'); setIsSubtitleMenuOpen(false); setIsLegacyExpanded(false); }}
                className={`text-sm px-2 py-1.5 rounded-lg text-left transition-colors flex items-center justify-between ${subtitleSource === 'kugou_pro' ? 'bg-[#0b57d0] text-white font-medium' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
              >
                <span>{t('KuGou (Pro)')}</span>
                {isFetchingKugouPro && <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); setIsLegacyExpanded(!isLegacyExpanded); }}
                className="text-sm px-2 py-1.5 rounded-lg text-left transition-colors flex items-center justify-between font-bold text-gray-200 hover:text-white hover:bg-white/10 mt-1 border-t border-white/10 pt-2"
              >
                <span>{t('Legacy Sources')}</span>
                <svg className={`w-4 h-4 transition-transform ${isLegacyExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
              </button>

              {isLegacyExpanded && (
                <div className="flex flex-col gap-1 pl-3 ml-1 border-l border-white/20">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSubtitleSource('netease'); setIsSubtitleMenuOpen(false); setIsLegacyExpanded(false); }}
                    className={`text-sm px-2 py-1.5 rounded-lg text-left transition-colors flex items-center justify-between ${subtitleSource === 'netease' ? 'bg-[#0b57d0] text-white font-medium' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
                  >
                    <span>{t('Netease')}</span>
                    {isFetchingNetease && <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); setSubtitleSource('tencent'); setIsSubtitleMenuOpen(false); setIsLegacyExpanded(false); }}
                    className={`text-sm px-2 py-1.5 rounded-lg text-left transition-colors flex items-center justify-between ${subtitleSource === 'tencent' ? 'bg-[#0b57d0] text-white font-medium' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
                  >
                    <span>{t('Tencent')}</span>
                    {isFetchingTencent && <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); setIsSubtitleMenuOpen(!isSubtitleMenuOpen); if (isSubtitleMenuOpen) setIsLegacyExpanded(false); }}
            className={`w-10 h-10 relative z-50 border bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-xl flex items-center justify-center text-white font-bold text-lg transition-all shadow-lg ${isSubtitleMenuOpen ? 'border-white/40 shadow-white/10' : 'border-white/20'}`}
          >
            字
          </button>
        </div>
        
        <div 
          className="relative z-10 flex-1 flex flex-col md:flex-row items-center justify-center p-4 pt-[15vh] md:p-16 gap-4 md:gap-20 w-full max-w-6xl mx-auto cursor-pointer md:cursor-default"
          onClick={(e) => { 
            if (!isMobileLyricsVisible) { e.stopPropagation(); setIsMobileLyricsVisible(true); } 
          }}
        >
          <style>{`
            .mobile-fade { animation: mobileFadeIn 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
            @keyframes mobileFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
          `}</style>
          <div 
            className={`w-full md:w-1/2 justify-center md:justify-end mt-8 md:mt-0 ${isMobileLyricsVisible ? 'hidden md:flex' : 'flex mobile-fade'}`}
          >
            <div className="w-full max-w-[70vw] aspect-square md:aspect-auto md:w-96 md:h-96 md:max-w-none rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative">
               <img src={track.cover.startsWith('//') ? `https:${track.cover}` : track.cover} alt="cover" className="w-full h-full object-cover" />
               {isPlaying && (
                 <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center px-6 pb-4">
                   <canvas ref={canvasRef} className="w-full h-3/4" />
                 </div>
               )}
            </div>
          </div>
          <div className={`w-full md:w-1/2 relative flex flex-col items-center md:items-start text-center md:text-left overflow-hidden ${isMobileLyricsVisible ? 'flex-1 md:flex-none md:h-[80vh]' : 'shrink-0 md:shrink md:h-[80vh]'}`}>
            
            <div className={`relative z-20 w-full shrink-0 pb-8 pointer-events-none ${isMobileLyricsVisible ? 'hidden md:block md:pt-28' : 'block pt-4 md:pt-28 mobile-fade'}`} onClick={(e) => e.stopPropagation()}>
              <h2 className="text-3xl md:text-4xl font-bold mb-3 px-4 md:px-0 w-full line-clamp-2 leading-tight pointer-events-auto">{track.title}</h2>
              <div className="flex items-center justify-center md:justify-start gap-4 px-4 md:px-0 pointer-events-auto">
                <p className="text-gray-400 text-xl">{track.uploader}</p>
              </div>
            </div>

            <div 
              ref={lyricsContainerRef} 
              onWheel={handleLyricsScroll} onTouchMove={handleLyricsScroll} 
              onClick={(e) => { e.stopPropagation(); setIsMobileLyricsVisible(false); }}
              className={`absolute inset-0 w-full overflow-y-auto space-y-8 text-gray-400 font-medium px-4 md:px-0 transition-opacity duration-200 block ${isMobileLyricsVisible ? 'opacity-80 pointer-events-auto' : 'opacity-0 pointer-events-none md:opacity-80 md:pointer-events-auto'}`}
              style={{
                scrollbarWidth: 'none', 
                msOverflowStyle: 'none',
                maskImage: 'linear-gradient(to bottom, transparent 0%, transparent 30%, black 45%, black 65%, transparent 85%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, transparent 30%, black 45%, black 65%, transparent 85%)'
              }}
            >
              <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
              
              <div className="h-[50vh] md:h-[40vh] shrink-0 pointer-events-none"></div>
              
              {displayLyrics.length > 0 ? (
                displayLyrics.map((line: any, index) => {
                  const isActive = index === activeLyricIndex;
                  return (
                    <div 
                      key={index} 
                      data-index={index} 
                      onClick={(e) => { e.stopPropagation(); setCurrentTime(line.from); if (audioRef.current) audioRef.current.currentTime = line.from; setAutoScroll(true); }}
                      className={`cursor-pointer transition-all duration-300 flex flex-col items-center md:items-start ${isActive ? 'opacity-100' : 'opacity-60 hover:opacity-80'}`}
                    >
                      <p className={`font-bold transition-all duration-300 ${isActive ? 'text-white text-2xl' : 'text-gray-400 text-lg'}`}>
                        {line.words ? (
                          line.words.map((w: any, wi: number) => {
                            
                            if (!isActive) {
                              return <span key={wi}>{w.text}</span>;
                            }

                            const wordStart = w.time;
                            const wordEnd = w.time + w.duration;
                            let progress = 0;
                            if (effectiveTime >= wordEnd) progress = 100;
                            else if (effectiveTime >= wordStart) progress = ((effectiveTime - wordStart) / w.duration) * 100;

                            return (
                              <span key={wi} className="relative inline-block whitespace-pre">
                                <span className="opacity-60">{w.text}</span>
                                <span 
                                  // THE FIX: Removed CSS transitions. The 60fps React engine now drives this perfectly smoothly!
                                  className="absolute left-0 top-0 overflow-hidden text-[#699bf7] whitespace-pre drop-shadow-[0_0_8px_rgba(105,155,247,0.6)]"
                                  style={{ width: `${progress}%` }}
                                >
                                  {w.text}
                                </span>
                              </span>
                            );
                          })
                        ) : (
                          line.content
                        )}
                      </p>
                      
                      {line.translation && (
                        <p className={`mt-1 transition-all duration-300 font-medium ${isActive ? 'text-[#b4cffb] text-xl' : 'text-gray-500 text-md'}`}>
                          {line.translation}
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-lg opacity-60 flex items-center justify-center md:justify-start h-20">♪ (Instrumental / No lyrics available) ♪</p>
              )}
              
              <div className="h-[50vh] md:h-[40vh] shrink-0 pointer-events-none"></div>
            </div>
          </div>
        </div>
      </div>

      {/* --- THE BOTTOM TOOLBAR --- */}
      <div 
        className={`fixed bottom-0 left-0 w-full z-40 flex flex-col transition-all duration-500 ${
          isImmersiveOpen 
            ? 'bg-white/60 dark:bg-black/60 backdrop-blur-2xl border-transparent shadow-none' 
            : 'bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]'
        }`}
      >
        <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 cursor-pointer group relative">
          <div className="absolute top-0 left-0 h-full bg-[#0b57d0] group-hover:bg-[#0842a0] transition-colors pointer-events-none" style={{ width: `${progressPercent}%` }}></div>
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[#0b57d0] rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ left: `calc(${progressPercent}% - 6px)` }}></div>
          <input type="range" min={0} max={duration || 100} value={currentTime} onChange={handleScrub} className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10" />
        </div>

        <div className="flex items-center justify-between px-3 md:px-6 py-2 md:py-3 h-16 md:h-20">
          
          {/* LEFT COLUMN: Cover & Title */}
          <div className="flex items-center gap-2 md:gap-4 flex-1 md:flex-none md:w-1/3 md:min-w-[250px] min-w-0">
            <div className="relative w-10 h-10 md:w-14 md:h-14 rounded-md overflow-hidden cursor-pointer group shrink-0 shadow-sm" onClick={() => setIsImmersiveOpen(true)}>
              <img src={track.cover.startsWith('//') ? `https:${track.cover}` : track.cover} alt="cover" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
              </div>
            </div>
            <div className="flex flex-col overflow-hidden mr-1 md:mr-0">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate hover:underline cursor-pointer">{track.title}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{track.uploader}</span>
            </div>

            <div className="flex items-center shrink-0">
              <button onClick={() => setTrackToAdd(track!)} className="p-1 md:p-2 text-gray-400 hover:text-[#0b57d0] hover:bg-blue-50 dark:hover:bg-[#0b57d0]/20 rounded-full transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
              </button>
              <button onClick={() => onToggleFavorite()} className="p-1 md:p-2 ml-0.5 md:ml-1 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-full transition-colors shrink-0">
                <svg className={`w-5 h-5 ${isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-400 hover:text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
              </button>
            </div>
          </div>

          {/* CENTER COLUMN: Controls */}
          <div className="flex flex-col items-center justify-center shrink-0 px-2 md:px-0 md:w-1/3">
            <div className="flex items-center gap-2 md:gap-6 text-gray-800 dark:text-gray-200">
              <button onClick={() => setLoopMode(prev => prev === 'sequence' ? 'single' : prev === 'single' ? 'random' : 'sequence')} className={`hidden sm:block transition-colors ${loopMode !== 'sequence' ? 'text-[#0b57d0] dark:text-[#699bf7]' : 'hover:text-[#0b57d0] dark:hover:text-[#699bf7]'}`}>
                {loopMode === 'single' ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /><text x="12" y="15" fontSize="8" textAnchor="middle" fill="currentColor" strokeWidth="1">1</text></svg>
                ) : loopMode === 'random' ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h3l5 8h8M16 12l4 4-4 4M4 16h3l2-3.2M13 8.8L15 6h5M16 2l4 4-4 4" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                )}
              </button>

              <button onClick={handlePrev} className="hover:text-[#0b57d0] dark:hover:text-[#699bf7] transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg></button>
              
              <button onClick={() => setIsPlaying(!isPlaying)} disabled={isLoadingAudio} className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full transition-colors ${isLoadingAudio ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600' : 'bg-[#d3e3fd] dark:bg-[#0b57d0]/20 hover:bg-[#b4cffb] dark:hover:bg-[#0b57d0]/40 text-[#041e49] dark:text-[#699bf7]'}`}>
                {isLoadingAudio ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : isPlaying ? (
                  <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                  <svg className="w-5 h-5 md:w-6 md:h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>

              <button onClick={handleNext} className="hover:text-[#0b57d0] dark:hover:text-[#699bf7] transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg></button>

              <button onClick={() => setIsPlaylistOpen(!isPlaylistOpen)} className={`transition-colors ${isPlaylistOpen ? 'text-[#0b57d0] dark:text-[#699bf7]' : 'hover:text-[#0b57d0] dark:hover:text-[#699bf7]'}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h8"/></svg>
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: EQ & Volume */}
          <div className="flex items-center justify-end gap-2 md:gap-3 shrink-0 md:w-1/3 md:min-w-[200px] relative">
            
            {isSoundModeOpen && (
              <div className="fixed inset-0 z-40" onClick={() => setIsSoundModeOpen(false)} />
            )}

            <button 
              onClick={() => setIsSoundModeOpen(!isSoundModeOpen)} 
              className={`p-1 md:p-2 rounded-full transition-colors z-50 ${isSoundModeOpen || soundPos.x !== 0 || soundPos.y !== 0 ? 'text-[#0b57d0] bg-blue-50 dark:bg-[#0b57d0]/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            </button>

            {isSoundModeOpen && (
              <div className="absolute bottom-16 right-0 mb-4 w-72 h-72 bg-white dark:bg-[#111111] rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-gray-100 dark:border-gray-800 z-50 overflow-hidden select-none touch-none transform transition-transform animate-fadeIn">
                
                <div 
                  className="absolute inset-0 opacity-30 dark:opacity-40 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at ${(soundPos.x + 1) * 50}% ${(soundPos.y + 1) * 50}%, hsl(${(Math.atan2(-soundPos.y, soundPos.x) * (180 / Math.PI) + 360) % 360}, ${Math.min(100, Math.sqrt(soundPos.x * soundPos.x + soundPos.y * soundPos.y) * 100)}%, 55%) 0%, transparent 70%)`
                  }}
                />
                
                <div 
                  ref={soundAreaRef} 
                  onPointerDown={(e) => { isDraggingSound.current = true; updateSoundPos(e.clientX, e.clientY); }} 
                  className="absolute inset-6 rounded-full cursor-crosshair border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30"
                >
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-200 dark:bg-gray-700 opacity-50 pointer-events-none" />
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700 opacity-50 pointer-events-none" />
                  
                  <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[11px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">{t('Bright')}</span>
                  <span className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">{t('Warm')}</span>
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">{t('Relaxed')}</span>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">{t('Energetic')}</span>

                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 pointer-events-none" />

                  <div 
                    className="absolute w-8 h-8 bg-white dark:bg-gray-200 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.2)] pointer-events-none transition-transform"
                    style={{
                      left: `calc(${(soundPos.x + 1) * 50}% - 16px)`,
                      top: `calc(${(soundPos.y + 1) * 50}% - 16px)`
                    }}
                  />
                </div>

                <button 
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setSoundPos({ x: 0, y: 0 }); }}
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-bold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white bg-white dark:bg-gray-800 px-3 py-1 rounded-full transition-colors z-20 shadow-sm border border-gray-200 dark:border-gray-700"
                >
                  {t('RESET')}
                </button>
              </div>
            )}
            
            <div className="hidden md:flex items-center gap-1.5 w-32 shrink-0">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
              <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-24 h-1 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#0b57d0]" />
            </div>
          </div>
        </div>
      </div>

      {/* --- ADD TO PLAYLIST MODAL --- */}
      {trackToAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setTrackToAdd(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-96 max-h-[70vh] flex flex-col overflow-hidden transform transition-all" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{t('Add to Playlist')}</h3>
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
    </>
  );
}