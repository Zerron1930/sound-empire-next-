/**
 * Aurafy Adapter
 * Syncs data from game discography to Aurafy streaming platform
 */

// uid function is defined in App.jsx
const uid = () => crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9);

/**
 * Sync Aurafy data from game discography
 * @param {Object} gameState - Current game state
 * @param {Object} aurafyState - Current Aurafy state
 * @returns {Object} Updated Aurafy state
 */
export const syncFromDiscography = (gameState, aurafyState = {}) => {
  const { profile, releases, projects, projectsReleased, social } = gameState;
  const currentWeek = gameState.time?.week || 1;
  
  // Initialize Aurafy state if empty
  const updatedState = {
    artists: aurafyState.artists || {},
    tracks: aurafyState.tracks || {},
    releases: aurafyState.releases || {}
  };
  
  // Sync artist data
  const artistId = 'player';
  if (!updatedState.artists[artistId]) {
    updatedState.artists[artistId] = {
      id: artistId,
      name: profile?.artistName || 'Artist',
      imageUrl: social?.player?.profilePhotoDataURL || null,
      monthlyListeners: 0,
      about: `Rising artist from ${profile?.year || '2025'}`
    };
  }
  
  // Sync tracks from releases
  const gameTracks = [...(releases || []), ...(projectsReleased || [])];
  
  gameTracks.forEach(gameTrack => {
    const trackId = gameTrack.id;
    
    // Determine track type
    let trackType = 'single';
    if (gameTrack.projectIds && gameTrack.projectIds.length > 0) {
      const project = projectsReleased?.find(p => p.id === gameTrack.projectIds[0]) || 
                     projects?.find(p => p.id === gameTrack.projectIds[0]);
      if (project) {
        trackType = project.type === 'Album' ? 'album-track' : 'ep-track';
      }
    }
    
    // Get streams data
    const streamsHistory = gameTrack.streamsHistory || [];
    const streamsThisWeek = streamsHistory[streamsHistory.length - 1] || 0;
    const streamsTotal = streamsHistory.reduce((sum, streams) => sum + streams, 0);
    
    // Update or create track
    updatedState.tracks[trackId] = {
      id: trackId,
      artistId: artistId,
      title: gameTrack.title,
      type: trackType,
      coverUrl: gameTrack.coverUrl || null,
      releaseWeek: gameTrack.weekReleased || gameTrack.week || currentWeek,
      streamsTotal: streamsTotal,
      streamsThisWeek: streamsThisWeek,
      durationSec: gameTrack.duration || 180, // Default 3 minutes
      popularityScore: 0 // Will be computed by metrics
    };
  });
  
  // Sync releases (projects and singles)
  const gameReleases = [...(projectsReleased || []), ...(releases.filter(r => !r.projectIds || r.projectIds.length === 0))];
  
  gameReleases.forEach(gameRelease => {
    const releaseId = gameRelease.id;
    
    // Determine release type
    let releaseType = 'single';
    if (gameRelease.type) {
      releaseType = gameRelease.type.toLowerCase();
    }
    
    // Get track IDs for this release
    let trackIds = [];
    if (gameRelease.trackIds) {
      trackIds = gameRelease.trackIds;
    } else if (gameRelease.id) {
      // For singles, the track ID is the release ID
      trackIds = [gameRelease.id];
    }
    
    // Update or create release
    updatedState.releases[releaseId] = {
      id: releaseId,
      title: gameRelease.title,
      type: releaseType,
      coverUrl: gameRelease.coverUrl || null,
      releaseWeek: gameRelease.weekReleased || gameRelease.week || currentWeek,
      trackIds: trackIds,
      popularityScore: 0 // Will be computed by metrics
    };
  });
  
  // Clean up orphaned tracks/releases
  const validTrackIds = new Set(Object.keys(updatedState.tracks));
  const validReleaseIds = new Set(Object.keys(updatedState.releases));
  
  // Remove tracks that no longer exist in game
  Object.keys(updatedState.tracks).forEach(trackId => {
    if (!validTrackIds.has(trackId)) {
      delete updatedState.tracks[trackId];
    }
  });
  
  // Remove releases that no longer exist in game
  Object.keys(updatedState.releases).forEach(releaseId => {
    if (!validReleaseIds.has(releaseId)) {
      delete updatedState.releases[releaseId];
    }
  });
  
  return updatedState;
};

/**
 * Get Aurafy data for a specific artist
 * @param {string} artistId - Artist ID
 * @param {Object} aurafyState - Current Aurafy state
 * @returns {Object} Artist data with computed metrics
 */
export const getArtistData = (artistId, aurafyState) => {
  // Ensure artist exists, create if missing
  if (!aurafyState.artists[artistId]) {
    console.warn(`Artist ${artistId} not found in Aurafy state, creating fallback`);
    return null; // Let the UI handle the fallback
  }
  
  const artist = aurafyState.artists[artistId];
  
  // Get all tracks and releases for this artist
  const tracks = Object.values(aurafyState.tracks || {}).filter(t => t.artistId === artistId);
  const releases = Object.values(aurafyState.releases || {}).filter(r => 
    r.trackIds && r.trackIds.some(trackId => {
      const track = aurafyState.tracks[trackId];
      return track && track.artistId === artistId;
    })
  );
  
  return {
    ...artist,
    tracks,
    releases,
    totalTracks: tracks.length,
    totalReleases: releases.length
  };
};

/**
 * Get Aurafy data for a specific track
 * @param {string} trackId - Track ID
 * @param {Object} aurafyState - Current Aurafy state
 * @returns {Object} Track data
 */
export const getTrackData = (trackId, aurafyState) => {
  return aurafyState.tracks[trackId] || null;
};

/**
 * Get Aurafy data for a specific release
 * @param {string} releaseId - Release ID
 * @param {Object} aurafyState - Current Aurafy state
 * @returns {Object} Release data with tracks
 */
export const getReleaseData = (releaseId, aurafyState) => {
  const release = aurafyState.releases[releaseId];
  if (!release) return null;
  
  // Get all tracks for this release
  const tracks = release.trackIds
    .map(trackId => aurafyState.tracks[trackId])
    .filter(track => track); // Remove undefined tracks
  
  return {
    ...release,
    tracks
  };
};
