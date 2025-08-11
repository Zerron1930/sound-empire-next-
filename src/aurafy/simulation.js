/**
 * Aurafy Simulation
 * Weekly streaming updates and sales integration
 */

import { AURAFY_CONFIG } from './config.js';
import { 
  computeMonthlyListeners, 
  computeTrackPopularity,
  getTopTracks,
  getPopularReleases,
  getGlobalArtistRank
} from './metrics.js';

/**
 * Apply weekly Aurafy updates
 * @param {Object} gameState - Current game state
 * @param {Object} aurafyState - Current Aurafy state
 * @returns {Object} Updated Aurafy state
 */
export const applyAurafyWeekly = (gameState, aurafyState) => {
  const currentWeek = gameState.time?.week || 1;
  const { tracks, releases, artists } = aurafyState;
  
  const updatedState = {
    ...aurafyState,
    tracks: { ...tracks },
    releases: { ...releases },
    artists: { ...artists }
  };
  
  // Decay previous week's streams
  Object.keys(updatedState.tracks).forEach(trackId => {
    const track = updatedState.tracks[trackId];
    if (track) {
      // Apply weekly decay
      track.streamsThisWeek = Math.floor(track.streamsThisWeek * AURAFY_CONFIG.WEEKLY_STREAM_DECAY);
    }
  });
  
  // Generate new streams for each track
  Object.keys(updatedState.tracks).forEach(trackId => {
    const track = updatedState.tracks[trackId];
    if (!track) return;
    
    // Calculate base streams based on game factors
    const baseStreams = calculateBaseStreams(track, gameState, currentWeek);
    
    // Apply playlist chance
    const playlistBoost = Math.random() < AURAFY_CONFIG.PLAYLIST_HIT_P 
      ? AURAFY_CONFIG.PLAYLIST_MULT 
      : 1;
    
    // Apply new release boost
    const weeksSinceRelease = currentWeek - track.releaseWeek;
    const newReleaseBoost = weeksSinceRelease <= 2 ? AURAFY_CONFIG.NEW_RELEASE_BOOST : 1;
    
    // Calculate final weekly streams
    const newStreams = Math.floor(baseStreams * playlistBoost * newReleaseBoost);
    
    // Update track data
    track.streamsThisWeek += newStreams;
    track.streamsTotal += newStreams;
    
    // Recompute popularity score
    track.popularityScore = computeTrackPopularity(track, currentWeek, updatedState.tracks);
  });
  
  // Update release popularity scores
  Object.keys(updatedState.releases).forEach(releaseId => {
    const release = updatedState.releases[releaseId];
    if (!release) return;
    
    // Calculate aggregate popularity from tracks
    const releaseTracks = release.trackIds
      .map(trackId => updatedState.tracks[trackId])
      .filter(track => track);
    
    if (releaseTracks.length > 0) {
      const avgPopularity = releaseTracks.reduce((sum, t) => sum + t.popularityScore, 0) / releaseTracks.length;
      
      // Add recency weight
      const weeksSinceRelease = currentWeek - release.releaseWeek;
      const recencyWeight = Math.max(1 - weeksSinceRelease * 0.02, 0.8);
      
      release.popularityScore = Math.round(avgPopularity * recencyWeight);
    }
  });
  
  // Update artist monthly listeners
  Object.keys(updatedState.artists).forEach(artistId => {
    const artist = updatedState.artists[artistId];
    if (artist) {
      artist.monthlyListeners = computeMonthlyListeners(artistId, updatedState, currentWeek);
    }
  });
  
  return updatedState;
};

/**
 * Calculate base streams for a track
 * @param {Object} track - AurafyTrack object
 * @param {Object} gameState - Game state
 * @param {number} currentWeek - Current week
 * @returns {number} Base weekly streams
 */
const calculateBaseStreams = (track, gameState, currentWeek) => {
  const { stats, profile } = gameState;
  
  // Base streams from popularity and skill
  let baseStreams = 1000; // Minimum base
  
  // Add popularity bonus
  if (stats?.popularity) {
    baseStreams += stats.popularity * 500;
  }
  
  // Add skill bonus
  if (stats?.skill) {
    baseStreams += stats.skill * 200;
  }
  
  // Add hype bonus
  if (stats?.hype) {
    baseStreams += stats.hype * 300;
  }
  
  // Add reputation bonus
  if (stats?.reputation) {
    baseStreams += stats.reputation * 150;
  }
  
  // Age factor (newer tracks get more streams)
  const weeksSinceRelease = currentWeek - track.releaseWeek;
  const ageFactor = Math.max(1 - weeksSinceRelease * 0.05, 0.5);
  
  // Random variation (±20%)
  const variation = 0.8 + Math.random() * 0.4;
  
  return Math.floor(baseStreams * ageFactor * variation);
};

/**
 * Register Aurafy streams with game sales system
 * @param {Object} gameState - Current game state
 * @param {Object} aurafyState - Current Aurafy state
 * @returns {Object} Updated game state with sales
 */
export const registerAurafySales = (gameState, aurafyState) => {
  const { tracks } = aurafyState;
  const updatedState = { ...gameState };
  
  // Convert streams to sales for each track
  Object.values(tracks).forEach(track => {
    if (track.streamsThisWeek > 0) {
      const sales = Math.floor(track.streamsThisWeek * AURAFY_CONFIG.STREAM_TO_SALE);
      
      // Find the corresponding game track
      const gameTrack = updatedState.releases?.find(r => r.id === track.id) ||
                       updatedState.projectsReleased?.find(p => p.trackIds?.includes(track.id));
      
      if (gameTrack) {
        // Update sales history
        if (!gameTrack.salesHistory) gameTrack.salesHistory = [];
        gameTrack.salesHistory.push(sales);
        
        // Update lifetime sales
        gameTrack.salesLifetime = (gameTrack.salesLifetime || 0) + sales;
        
        // Update first week sales if this is the first week
        if (gameTrack.weekReleased === gameState.time?.week) {
          gameTrack.salesFirstWeek = (gameTrack.salesFirstWeek || 0) + sales;
        }
      }
    }
  });
  
  return updatedState;
};

/**
 * Get Aurafy analytics for the current week
 * @param {Object} aurafyState - Current Aurafy state
 * @param {string} artistId - Artist ID
 * @param {number} currentWeek - Current week
 * @returns {Object} Analytics data
 */
export const getAurafyAnalytics = (aurafyState, artistId, currentWeek) => {
  const topTracks = getTopTracks(artistId, aurafyState, currentWeek);
  const popularReleases = getPopularReleases(artistId, aurafyState, currentWeek);
  const globalRank = getGlobalArtistRank(artistId, aurafyState, currentWeek);
  
  // Calculate total streams this week
  const totalWeeklyStreams = Object.values(aurafyState.tracks)
    .filter(track => track.artistId === artistId)
    .reduce((sum, track) => sum + track.streamsThisWeek, 0);
  
  // Calculate total lifetime streams
  const totalLifetimeStreams = Object.values(aurafyState.tracks)
    .filter(track => track.artistId === artistId)
    .reduce((sum, track) => sum + track.streamsTotal, 0);
  
  return {
    topTracks: topTracks.slice(0, 10),
    popularReleases: popularReleases.slice(0, 8),
    globalRank,
    totalWeeklyStreams,
    totalLifetimeStreams,
    weeklyGrowth: calculateWeeklyGrowth(aurafyState, artistId, currentWeek)
  };
};

/**
 * Calculate weekly growth percentage
 * @param {Object} aurafyState - Current Aurafy state
 * @param {string} artistId - Artist ID
 * @param {number} currentWeek - Current week
 * @returns {number} Growth percentage
 */
const calculateWeeklyGrowth = (aurafyState, artistId, currentWeek) => {
  const currentStreams = Object.values(aurafyState.tracks)
    .filter(track => track.artistId === artistId)
    .reduce((sum, track) => sum + track.streamsThisWeek, 0);
  
  const previousStreams = Object.values(aurafyState.tracks)
    .filter(track => track.artistId === artistId)
    .reduce((sum, track) => sum + (track.streamsThisWeek / AURAFY_CONFIG.WEEKLY_STREAM_DECAY), 0);
  
  if (previousStreams === 0) return 0;
  
  return Math.round(((currentStreams - previousStreams) / previousStreams) * 100);
};
