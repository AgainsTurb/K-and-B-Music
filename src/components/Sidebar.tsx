// src/components/Sidebar.tsx
import { useState } from 'react';
import { UserPlaylist } from '../services/db';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  activeView: string;
  activePlaylistId: string | null;
  onNavigate: (view: string, playlistId?: string) => void;
  playlists: UserPlaylist[];
  onCreatePlaylist: () => void;
}

export default function Sidebar({ activeView, activePlaylistId, onNavigate, playlists, onCreatePlaylist }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isPlaylistExpanded, setIsPlaylistExpanded] = useState(true);
  
  // Use our new isDark boolean
  const { isDark } = useTheme();
  const { t } = useTranslation();

  // 👇 CHANGED: Split 'name' into 'id' (for logic) and 'label' (for translation using t())
  const mainNavItems = [
    { id: 'Recommend', label: t('Recommend'), icon: <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg> },
    { id: 'Recent', label: t('Recent History'), icon: <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
    { id: 'Favorites', label: t('Favorites'), icon: <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg> },
  ];

  return (
    <aside className={`relative h-full flex flex-col transition-all duration-300 ease-in-out shrink-0 bg-[#f4f5f9] dark:bg-gray-900 border-r-0 dark:border-r border-gray-800 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      
      <button onClick={() => setIsCollapsed(!isCollapsed)} className={`absolute -right-3 top-8 w-6 h-6 rounded-full flex items-center justify-center shadow transition-colors z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700`}>
        <svg className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg>
      </button>

      <div className={`pt-8 pb-6 px-4 flex items-center transition-all ${isCollapsed ? 'justify-center' : 'justify-start gap-3'}`}>
        <img 
          src="/app-icon.svg" 
          alt="Logo" 
          className="w-10 h-10 rounded-xl shadow-sm shrink-0 object-cover" 
        />
        
        {!isCollapsed && (
          <h1 className="text-2xl font-bold whitespace-nowrap overflow-hidden text-gray-800 dark:text-white">
            K&B {t('Music')}
          </h1>
        )}
      </div>

      <nav className="flex flex-col gap-2 px-3 overflow-y-auto pb-24" style={{ scrollbarWidth: 'none' }}>
        {/* Main Navigation */}
        {mainNavItems.map((item) => (
          <button 
            // onClick uses item.id, title uses item.label
            key={item.id} onClick={() => onNavigate(item.id)} title={isCollapsed ? item.label : undefined}
            className={`flex items-center p-3 rounded-xl font-medium transition-all ${activeView === item.id ? 'bg-[#d3e3fd] text-[#0b57d0] dark:bg-[#0b57d0]/20 dark:text-[#699bf7]' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'} ${isCollapsed ? 'justify-center' : 'justify-start gap-4'}`}
          >
            {item.icon}
            {/* Render item.label instead of item.name */}
            {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
          </button>
        ))}

        <div className="my-2 border-t mx-2 border-gray-200 dark:border-gray-800"></div>

        {/* Playlist Section Header */}
        <div className={`flex ${isCollapsed ? 'flex-col items-center gap-2' : 'items-center justify-between'} p-2`}>
          {/* Translated Tooltips and Headers */}
          <button onClick={() => setIsPlaylistExpanded(!isPlaylistExpanded)} className={`flex items-center gap-3 transition-colors ${isCollapsed ? 'justify-center' : 'flex-1'} text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white`} title={isCollapsed ? t('Playlists') : undefined}>
            <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h8"/></svg>
            {!isCollapsed && <span className="font-semibold text-sm tracking-wide">{t('Playlists').toUpperCase()}</span>}
            {!isCollapsed && <svg className={`w-4 h-4 ml-auto transition-transform ${isPlaylistExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>}
          </button>
          <button onClick={onCreatePlaylist} className="p-1 rounded-md transition-colors text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-[#0b57d0] dark:hover:text-[#699bf7]" title={t('Create Playlist')}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
          </button>
        </div>

        {/* Expanded User Playlists */}
        {isPlaylistExpanded && (
          <div className={`flex flex-col gap-1 mt-1 ${isCollapsed ? 'items-center' : 'pl-4'}`}>
            {playlists.map(pl => {
              const isActive = activeView === 'Playlist' && activePlaylistId === pl.id;
              return (
                <button 
                  key={pl.id} onClick={() => onNavigate('Playlist', pl.id)} title={isCollapsed ? pl.name : undefined}
                  className={`flex items-center gap-3 p-2 rounded-xl transition-all ${isActive ? 'bg-[#d3e3fd] text-[#0b57d0] dark:bg-[#0b57d0]/20 dark:text-[#699bf7]' : 'text-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 dark:hover:text-gray-200'} ${isCollapsed ? 'justify-center' : 'w-full'}`}
                >
                  {pl.cover ? (
                    <img src={pl.cover.startsWith('//') ? `https:${pl.cover}` : pl.cover} className="w-8 h-8 rounded-md object-cover shrink-0 shadow-sm" alt="cover"/>
                  ) : (
                    <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 shadow-sm bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
                    </div>
                  )}
                  {!isCollapsed && <span className="text-sm font-medium truncate">{pl.name}</span>}
                </button>
              );
            })}
          </div>
        )}
      </nav>
    </aside>
  );
}