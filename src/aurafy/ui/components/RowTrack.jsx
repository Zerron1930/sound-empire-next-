import React from 'react';
import { formatLargeNumber } from '../../metrics.js';

/**
 * RowTrack - Track display in row format
 * @param {Object} props
 * @param {Object} props.track - Track data
 * @param {number} props.rank - Track rank
 * @param {boolean} props.showRank - Whether to show rank number
 * @param {string} props.className - Additional CSS classes
 */
const RowTrack = ({ track, rank, showRank = true, className = '' }) => {
  if (!track) return null;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors ${className}`}>
      {showRank && (
        <div className="w-6 text-center text-lg font-bold text-gray-400">
          {rank}
        </div>
      )}
      
      {/* Cover Art - Mobile */}
      <div className="w-10 h-10 rounded-md overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0">
        {track.coverUrl ? (
          <img 
            src={track.coverUrl} 
            alt={`${track.title} cover`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
            {track.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      
      {/* Track Info - Mobile */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-white truncate text-sm">{track.title}</div>
        <div className="text-xs text-gray-400">
          {track.type === 'single' ? 'Single' : 
           track.type === 'album-track' ? 'Album Track' : 'EP Track'}
        </div>
      </div>
      
      {/* Streams - Mobile */}
      <div className="text-right">
        <div className="text-xs text-gray-300">
          {formatLargeNumber(track.streamsTotal)}
        </div>
        <div className="text-xs text-gray-500">
          {formatLargeNumber(track.streamsThisWeek)}/wk
        </div>
      </div>
      
      {/* Popularity Score - Mobile */}
      <div className="w-12 text-center">
        <div className="text-sm font-bold text-blue-400">
          {track.popularityScore}
        </div>
        <div className="text-xs text-gray-500">score</div>
      </div>
      
      {/* Duration - Mobile */}
      {track.durationSec && (
        <div className="text-xs text-gray-400 w-12 text-right">
          {Math.floor(track.durationSec / 60)}:{String(track.durationSec % 60).padStart(2, '0')}
        </div>
      )}
    </div>
  );
};

export default RowTrack;
