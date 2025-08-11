import React, { useState, useEffect } from 'react';
import { getArtistData } from '../adapter.js';
import { getTopTracks, getPopularReleases, getGlobalArtistRank, formatLargeNumber } from '../metrics.js';
import { getAurafyAnalytics } from '../simulation.js';
import MetricPill from './components/MetricPill';
import RowTrack from './components/RowTrack';
import TileRelease from './components/TileRelease';
import Carousel from './components/Carousel';

/**
 * ArtistPage - Main Aurafy artist view
 * @param {Object} props
 * @param {Object} props.gameState - Current game state
 * @param {Object} props.aurafyState - Current Aurafy state
 * @param {Function} props.onBack - Back button handler
 */
const ArtistPage = ({ gameState, aurafyState, onBack }) => {
  const [activeTab, setActiveTab] = useState('music');
  const [showAllTracks, setShowAllTracks] = useState(false);
  
  const artistId = 'player';
  const currentWeek = gameState.time?.week || 1;
  
  // Get artist data and analytics
  const artistData = getArtistData(artistId, aurafyState);
  const analytics = getAurafyAnalytics(aurafyState, artistId, currentWeek);
  
  // Debug logging
  console.log('Aurafy Debug:', {
    artistId,
    aurafyState,
    artistData,
    analytics,
    gameState: {
      profile: gameState.profile,
      releases: gameState.releases?.length,
      projectsReleased: gameState.projectsReleased?.length
    }
  });
  
  // Check if aurafyState is properly initialized
  if (!aurafyState || Object.keys(aurafyState).length === 0) {
    console.warn('Aurafy state is empty or undefined');
  }
  
  if (aurafyState && !aurafyState.artists) {
    console.warn('Aurafy state missing artists property');
  }
  
  if (aurafyState && aurafyState.artists && !aurafyState.artists.player) {
    console.warn('Player artist not found in Aurafy state');
  }
  
  // Get filtered data based on active tab
  const getFilteredReleases = (type) => {
    if (!analytics.popularReleases) return [];
    return analytics.popularReleases.filter(release => release.type === type);
  };
  
  const singles = getFilteredReleases('single');
  const albums = getFilteredReleases('album');
  const eps = getFilteredReleases('ep');
  
  // Get tracks to display
  const displayedTracks = showAllTracks 
    ? analytics.topTracks.slice(0, 10)
    : analytics.topTracks.slice(0, 5);
  
  if (!artistData) {
    // Create fallback artist data if none exists
    const fallbackArtistData = {
      id: artistId,
      name: gameState.profile?.artistName || 'Artist',
      imageUrl: gameState.social?.player?.profilePhotoDataURL || null,
      monthlyListeners: 0,
      about: `Rising artist from ${gameState.profile?.year || '2025'}`,
      tracks: [],
      releases: [],
      totalTracks: 0,
      totalReleases: 0
    };
    
    return (
      <div className="text-center py-8 px-4">
        <div className="text-gray-400 mb-4">Initializing Aurafy data...</div>
        <button
          onClick={async () => {
            try {
              // Force reload to trigger Aurafy initialization
              window.location.reload();
            } catch (error) {
              console.error('Failed to reload Aurafy:', error);
              alert('Failed to reload Aurafy. Please try again.');
            }
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Initialize Aurafy Data
        </button>
        <div className="text-xs text-gray-500 mt-2">
          This will sync your discography with Aurafy
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900">
      {/* Mobile Header */}
      <div className="relative h-48 bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800">
        {/* Header Image */}
        {artistData.imageUrl ? (
          <img
            src={artistData.imageUrl}
            alt="Artist header"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800" />
        )}
        
        {/* Header Overlay */}
        <div className="absolute inset-0 bg-black/40" />
        
        {/* Header Content */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">
              {artistData.name}
            </h1>
            <div className="flex items-center gap-2">
              {/* Verified Badge */}
              <div className="inline-flex items-center justify-center w-5 h-5 bg-blue-500 rounded-full">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-white/80 text-sm">Verified Artist</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Monthly Listeners - Mobile */}
      <div className="bg-gray-800 p-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">
            {formatLargeNumber(artistData.monthlyListeners)}
          </div>
          <div className="text-gray-300 text-sm">monthly listeners</div>
          <div className="text-blue-400 text-sm mt-1">
            #{analytics.globalRank} in the world
          </div>
        </div>
      </div>
      
      {/* Mobile Tabs */}
      <div className="border-b border-white/10 bg-gray-900">
        <div className="flex justify-around">
          {[
            { key: 'music', label: 'Music', icon: '🎵' },
            { key: 'events', label: 'Events', icon: '🎪' },
            { key: 'merch', label: 'Merch', icon: '🛍️' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-col items-center gap-1 py-3 px-2 flex-1 transition-colors ${
                activeTab === tab.key
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Mobile Content */}
      <div className="p-4 space-y-6">
        {activeTab === 'music' && (
          <div>
            {/* Popular (Top 10) */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Popular</h2>
                <button
                  onClick={() => setShowAllTracks(!showAllTracks)}
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                >
                  {showAllTracks ? 'Show less' : 'See more'}
                </button>
              </div>
              
              <div className="space-y-2">
                {displayedTracks.map((track, index) => (
                  <RowTrack
                    key={track.id}
                    track={track}
                    rank={index + 1}
                    showRank={true}
                  />
                ))}
              </div>
            </div>
            
            {/* Popular Releases */}
            <Carousel
              items={analytics.popularReleases}
              renderItem={(release) => <TileRelease release={release} />}
              title="Popular Releases"
              itemsPerRow={3}
            />
            
            {/* Singles */}
            <Carousel
              items={singles}
              renderItem={(release) => <TileRelease release={release} />}
              title="Singles"
              itemsPerRow={3}
            />
            
            {/* Albums */}
            <Carousel
              items={albums}
              renderItem={(release) => <TileRelease release={release} />}
              title="Albums"
              itemsPerRow={3}
            />
            
            {/* EPs */}
            <Carousel
              items={eps}
              renderItem={(release) => <TileRelease release={release} />}
              title="EPs"
              itemsPerRow={3}
            />
            
            {/* About Section - Mobile */}
            <div className="mt-6 p-4 bg-gray-800 rounded-lg">
              <h2 className="text-lg font-bold text-white mb-4">About</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <MetricPill
                    label="Total Tracks"
                    value={artistData.totalTracks}
                    variant="primary"
                  />
                  <MetricPill
                    label="Total Releases"
                    value={artistData.totalReleases}
                    variant="secondary"
                  />
                  <MetricPill
                    label="Weekly Growth"
                    value={`${analytics.weeklyGrowth > 0 ? '+' : ''}${analytics.weeklyGrowth}%`}
                    variant={analytics.weeklyGrowth >= 0 ? 'success' : 'warning'}
                  />
                </div>
                <p className="text-gray-300 leading-relaxed text-sm">
                  {artistData.about}
                </p>
                {/* Global Rank - Mobile */}
                <div className="text-center pt-2">
                  <div className="text-4xl font-bold text-blue-400">
                    #{analytics.globalRank}
                  </div>
                  <div className="text-gray-400 text-sm">in the world</div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'events' && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🎪</div>
            <h2 className="text-lg font-bold text-white mb-2">Events Coming Soon</h2>
            <p className="text-gray-400 text-sm">Live performances and tour dates will be available in Phase 2</p>
          </div>
        )}
        
        {activeTab === 'merch' && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🛍️</div>
            <h2 className="text-lg font-bold text-white mb-2">Merchandise Coming Soon</h2>
            <p className="text-gray-400 text-sm">Official merchandise and collectibles will be available in Phase 2</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtistPage;
