import { forwardRef } from 'react';
import { VideoTrack } from '../types';

interface TrackCardProps {
  track: VideoTrack;
  index: number;
  isFav: boolean;
  onClick: (track: VideoTrack) => void;
  onToggleFav: (track: VideoTrack) => void;
  onOpenPlaylistModal: (track: VideoTrack) => void;
}

const TrackCard = forwardRef<HTMLDivElement, TrackCardProps>(({ track, index, isFav, onClick, onToggleFav, onOpenPlaylistModal }, ref) => {
    return (
      <div 
        ref={ref} 
        onClick={() => onClick(track)}
        className="group flex items-center gap-4 p-3 hover:bg-[#f0f4f9] dark:hover:bg-gray-800 rounded-xl cursor-pointer transition-all"
      >
        {/* 1. Track Number */}
        <div className="w-6 text-center text-gray-500 dark:text-gray-400 font-medium text-sm shrink-0">
          {index}
        </div>

        {/* 2. Compact Cover Thumbnail */}
        <div className="relative w-12 h-12 shrink-0 rounded-md overflow-hidden bg-gray-200 dark:bg-gray-700">
          <img 
            src={track.cover.startsWith('//') ? `https:${track.cover}` : track.cover} 
            alt={track.title} 
            className="object-cover w-full h-full"
          />
        </div>

        {/* 3. Track Title and Artist */}
        {/* CRITICAL FIX: min-w-0 added here to prevent flexbox overflow from long titles */}
        <div className="flex flex-col overflow-hidden flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-[#0b57d0] dark:group-hover:text-[#699bf7] transition-colors">
            {track.title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {track.uploader}
          </p>
        </div>

        {/* 4. Extra Info (Plays & Duration) + Hover Actions */}
        <div className="hidden md:flex items-center gap-2 w-48 shrink-0 justify-end text-sm text-gray-500 dark:text-gray-400 relative">
          <div className="flex items-center gap-6 mr-4 opacity-100 group-hover:hidden transition-opacity">
            <span className="text-xs">{(track.views / 10000).toFixed(1)}W</span>
            <span className="w-10 text-right text-xs">{track.duration}</span>
          </div>

          {/* Hover Actions */}
          <div className="hidden group-hover:flex items-center gap-1 z-10 absolute right-0 pl-2">
            <button onClick={(e) => { e.stopPropagation(); onOpenPlaylistModal(track); }} className="p-1.5 text-gray-400 hover:text-[#0b57d0] hover:bg-blue-50 dark:hover:bg-[#0b57d0]/20 rounded-full transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onToggleFav(track); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-full transition-all">
              <svg className={`w-4 h-4 ${isFav ? 'text-red-500 fill-red-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }
);

export default TrackCard;