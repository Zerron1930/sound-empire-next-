import React from 'react';
import { formatLargeNumber } from '../../metrics.js';

/**
 * TileRelease - Release display in tile format
 * @param {Object} props
 * @param {Object} props.release - Release data
 * @param {string} props.className - Additional CSS classes
 */
const TileRelease = ({ release, className = '' }) => {
  if (!release) return null;

  return (
    <div className={`group cursor-pointer ${className}`}>
      {/* Cover Art - Mobile */}
      <div className="relative mb-2">
        <div className="w-full aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600">
          {release.coverUrl ? (
            <img 
              src={release.coverUrl} 
              alt={`${release.title} cover`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold">
              {release.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        
        {/* Popularity Badge - Mobile */}
        <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
          {release.popularityScore}
        </div>
        
        {/* Type Badge - Mobile */}
        <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
          {release.type.toUpperCase()}
        </div>
      </div>
      
      {/* Release Info - Mobile */}
      <div className="text-center">
        <h3 className="font-semibold text-white text-xs mb-1 truncate group-hover:text-blue-300 transition-colors">
          {release.title}
        </h3>
        
        {/* Track Count */}
        <div className="text-xs text-gray-400">
          {release.trackIds?.length || 0} track{release.trackIds?.length !== 1 ? 's' : ''}
        </div>
        
        {/* Release Week */}
        <div className="text-xs text-gray-500 mt-1">
          Week {release.releaseWeek}
        </div>
      </div>
    </div>
  );
};

export default TileRelease;
