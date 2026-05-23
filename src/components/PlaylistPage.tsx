// src/components/PlaylistPage.tsx
import { useEffect, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { VideoTrack } from '../types';
import { UserPlaylist, renameUserPlaylist, deleteUserPlaylist, getPlaylistTracks, removeTrackFromUserPlaylist, updateUserPlaylistOrder } from '../services/db';
import { useTranslation } from 'react-i18next';

interface PlaylistPageProps {
  playlistId: string;
  playlists: UserPlaylist[];
  currentBvid: string | null;
  onPlayTrack: (track: VideoTrack) => void;
  onPlayAll: (tracks: VideoTrack[]) => void; // NEW: Play All Prop
  onRefreshPlaylists: () => void;
  onDeleteComplete: () => void;
  userPlaylists: UserPlaylist[];
  onAddToPlaylist: (playlistId: string, track: VideoTrack) => void;
  favorites: VideoTrack[];
  onToggleFavorite: (track: VideoTrack) => void;
}

function SortablePlaylistItem({ item, index, currentBvid, onPlayTrack, onRemove, onOpenPlaylistModal, isFav, onToggleFav }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.bvid });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1, opacity: isDragging ? 0.8 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`flex items-center gap-4 p-2 rounded-xl cursor-grab active:cursor-grabbing hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors select-none group ${currentBvid === item.bvid ? 'bg-[#f0f4f9] dark:bg-[#0b57d0]/20' : ''}`}>
      <div className="w-8 text-center text-sm font-medium text-gray-400 dark:text-gray-500" onPointerDown={(e) => { e.stopPropagation(); onPlayTrack(item); }}>{index + 1}</div>
      <div className="w-12 h-12 rounded-md overflow-hidden shrink-0" onPointerDown={(e) => { e.stopPropagation(); onPlayTrack(item); }}><img src={item.cover.startsWith('//') ? `https:${item.cover}` : item.cover} alt="cover" className="w-full h-full object-cover" /></div>
      {/* CRITICAL FIX: min-w-0 added here to prevent flexbox overflow from long titles */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0" onPointerDown={(e) => { e.stopPropagation(); onPlayTrack(item); }}>
        <span className={`text-sm font-semibold truncate pointer-events-none ${currentBvid === item.bvid ? 'text-[#0b57d0] dark:text-[#699bf7]' : 'text-gray-900 dark:text-gray-100'}`}>{item.title}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 truncate pointer-events-none">{item.uploader}</span>
      </div>
      
      <div className="hidden md:flex items-center gap-2 w-48 justify-end text-sm text-gray-500 dark:text-gray-400">
        <span className="w-12 text-right mr-4">{item.duration}</span>
        
        <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 relative`}>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onOpenPlaylistModal(item); }} className="p-1.5 text-gray-400 hover:text-[#0b57d0] hover:bg-blue-50 dark:hover:bg-[#0b57d0]/20 rounded-full transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
          </button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onToggleFav(item); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-full transition-all">
            <svg className={`w-4 h-4 ${isFav ? 'text-red-500 fill-red-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          </button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRemove(item.bvid); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-full transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PlaylistPage({ playlistId, playlists, currentBvid, onPlayTrack, onPlayAll, onRefreshPlaylists, onDeleteComplete, userPlaylists, onAddToPlaylist, favorites, onToggleFavorite }: PlaylistPageProps) {
  const [tracks, setTracks] = useState<VideoTrack[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [trackToAdd, setTrackToAdd] = useState<VideoTrack | null>(null);
  const [searchQuery, setSearchQuery] = useState(''); // NEW: Search state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  
  const playlist = playlists.find(p => p.id === playlistId);
  const { t } = useTranslation();

  // NEW: Filter logic
  const filteredTracks = tracks.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.uploader.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    getPlaylistTracks(playlistId).then(setTracks);
    if (playlist) setEditName(playlist.name);
  }, [playlistId, playlist]);

  if (!playlist) return null;

  const handleRenameSave = async () => {
    if (editName.trim() && editName.trim() !== playlist.name) {
      await renameUserPlaylist(playlistId, editName.trim());
      onRefreshPlaylists();
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!playlist) return;
    await deleteUserPlaylist(playlistId);
    onDeleteComplete();
    setIsDeleteModalOpen(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = tracks.findIndex((t) => t.bvid === active.id);
      const newIndex = tracks.findIndex((t) => t.bvid === over.id);
      const newOrder = arrayMove(tracks, oldIndex, newIndex);
      setTracks(newOrder);
      await updateUserPlaylistOrder(playlistId, newOrder);
    }
  };

  return (
    <section className="flex-1 overflow-y-auto px-8 pb-32">
      {/* NEW: Updated Header with Search & Play All */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 mt-8 border-b border-gray-100 dark:border-gray-800 pb-4 gap-4">
        <div className="flex items-center gap-4">
          {isEditing ? (
            <input 
              type="text" autoFocus value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSave(); }}
              onBlur={handleRenameSave}
              className="text-3xl font-bold border-b-2 border-[#0b57d0] bg-transparent outline-none text-gray-800 dark:text-gray-100"
            />
          ) : (
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white">{playlist.name}</h2>
          )}
          <button onClick={() => setIsEditing(true)} className="p-2 text-gray-400 hover:text-[#0b57d0] transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          </button>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <input 
            type="text" 
            placeholder={t('Search playlist...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 border-none rounded-full outline-none focus:ring-2 focus:ring-[#0b57d0] text-gray-800 dark:text-gray-200 w-48 transition-all focus:w-64"
          />
          <button 
            onClick={() => onPlayAll(filteredTracks)}
            disabled={filteredTracks.length === 0}
            className="px-4 py-2 bg-[#0b57d0] hover:bg-[#0842a0] text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50 shrink-0"
          >
            {t('Play All')}
          </button>
          <button onClick={handleDelete} className="text-sm font-semibold text-red-500 hover:text-red-600 px-4 py-2 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-full transition-colors shadow-sm shrink-0">
            {t('Delete Playlist')}
          </button>
        </div>
      </div>
      
      {tracks.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 mt-10 text-center">{t('No songs in this playlist yet.')}</p>
      ) : filteredTracks.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 mt-10 text-center">{t('No matching songs found.')}</p>
      ) : (
        <>
          <div className="flex items-center gap-4 px-3 pb-2 mb-2 border-b border-gray-200 dark:border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
             <div className="w-8 text-center">#</div>
             <div className="w-12 text-center">{t('Cover')}</div>
             <div className="flex-1 pl-1">{t('Title & Artist')}</div>
          </div>
          <div className="flex flex-col gap-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              {/* CHANGED: Mapping filteredTracks instead of tracks */}
              <SortableContext items={filteredTracks.map(t => t.bvid)} strategy={verticalListSortingStrategy}>
                {filteredTracks.map((item, index) => (
                  <SortablePlaylistItem 
                    key={item.bvid} item={item} index={index} currentBvid={currentBvid} onPlayTrack={onPlayTrack} 
                    onRemove={async (bvid: string) => { await removeTrackFromUserPlaylist(playlistId, bvid); getPlaylistTracks(playlistId).then(setTracks); onRefreshPlaylists(); }} 
                    onOpenPlaylistModal={setTrackToAdd}
                    isFav={favorites.some(f => f.bvid === item.bvid)}
                    onToggleFav={onToggleFavorite}
                  />
                ))}
              </SortableContext>
            </DndContext>
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

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setIsDeleteModalOpen(false)}>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-xl w-full max-w-sm mx-4 border border-gray-100 dark:border-gray-800" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 text-center text-gray-900 dark:text-white">
              {t('Delete Playlist')}
            </h3>
            <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
              {t('Are you sure you want to delete')} "{playlist?.name}"?
            </p>
            <div className="flex gap-4">
              <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {t('Cancel')}
              </button>
              <button onClick={confirmDelete} className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition-colors">
                {t('Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}