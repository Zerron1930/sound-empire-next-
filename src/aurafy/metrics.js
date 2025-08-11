/**
 * Aurafy Metrics
 * Core calculations for popularity scores, rankings, and monthly listeners
 */

import { AURAFY_CONFIG } from './config.js';

/**
 * Normalize a value using log scaling between min and max
 * @param {number} value - Value to normalize
 * @param {number} min - Minimum value in dataset
 * @param {number} max - Maximum value in dataset
 * @returns {number} Normalized value between 0-100
 */
export const normalizeValue = (value, min, max) => {
  if (max === min) return 50; // Middle value if all values are the same
  if (value <= min) return 0;
  if (value >= max) return 100;
  
  // Log scaling for better distribution
  const logValue = Math.log(value + 1);
  const logMin = Math.log(min + 1);
  const logMax = Math.log(max + 1);
  
  return ((logValue - logMin) / (logMax - logMin)) * 100;
};

/**
 * Compute monthly listeners for an artist
 * @param {string} artistId - Artist ID
 * @param {Object} aurafyState - Current Aurafy state
 * @param {number} currentWeek - Current game week
 * @returns {number} Monthly listeners count
 */
export const computeMonthlyListeners = (artistId, aurafyState, currentWeek) => {
  const { tracks } = aurafyState;
  const { MONTHLY_LISTENERS_WEEKS, LISTENER_IMPRESSION_RATIO } = AURAFY_CONFIG;
  
  let totalStreams = 0;
  
  // Sum streams from last 4 weeks
  for (let week = currentWeek - MONTHLY_LISTENERS_WEEKS + 1; week <= currentWeek; week++) {
    Object.values(tracks).forEach(track => {
      if (track.artistId === artistId && track.releaseWeek === week) {
        totalStreams += track.streamsThisWeek || 0;
      }
    });
  }
  
  // Convert to approximate unique listeners
  return Math.round(totalStreams * LISTENER_IMPRESSION_RATIO);
};

/**
 * Compute track popularity score
 * @param {Object} track - AurafyTrack object
 * @param {number} currentWeek - Current game week
 * @param {Object} allTracks - All tracks for normalization
 * @returns {number} Popularity score (0-100)
 */
export const computeTrackPopularity = (track, currentWeek, allTracks) => {
  const { POPULARITY_WEIGHTS, AGE_DECAY_PER_WEEK, MIN_AGE_WEIGHT } = AURAFY_CONFIG;
  
  // Calculate age weight (newer tracks get higher weight)
  const weeksSinceRelease = currentWeek - track.releaseWeek;
  const ageWeight = Math.max(1 - weeksSinceRelease * AGE_DECAY_PER_WEEK, MIN_AGE_WEIGHT);
  
  // Get min/max values for normalization
  const allStreamsTotal = Object.values(allTracks).map(t => t.streamsTotal || 0);
  const allStreamsWeekly = Object.values(allTracks).map(t => t.streamsThisWeek || 0);
  
  const maxTotal = Math.max(...allStreamsTotal, 1);
  const maxWeekly = Math.max(...allStreamsWeekly, 1);
  
  // Normalize individual components
  const lifetimeScore = normalizeValue(track.streamsTotal || 0, 0, maxTotal);
  const weeklyScore = normalizeValue(track.streamsThisWeek || 0, 0, maxWeekly);
  
  // Projected virality (based on recent performance vs lifetime)
  const viralityRatio = (track.streamsThisWeek || 0) / Math.max(track.streamsTotal || 1, 1);
  const viralityScore = normalizeValue(viralityRatio, 0, 2); // Cap at 2x ratio
  
  // Weighted combination
  const popularityScore = 
    POPULARITY_WEIGHTS.LIFETIME_STREAMS * lifetimeScore +
    POPULARITY_WEIGHTS.WEEKLY_STREAMS * weeklyScore * ageWeight +
    POPULARITY_WEIGHTS.VIRALITY_BOOST * viralityScore;
  
  return Math.round(Math.max(0, Math.min(100, popularityScore)));
};

/**
 * Get top tracks for an artist
 * @param {string} artistId - Artist ID
 * @param {Object} aurafyState - Current Aurafy state
 * @param {number} currentWeek - Current game week
 * @returns {Array} Top tracks sorted by popularity
 */
export const getTopTracks = (artistId, aurafyState, currentWeek) => {
  const { tracks } = aurafyState;
  
  // Filter tracks by artist and compute popularity
  const artistTracks = Object.values(tracks)
    .filter(track => track.artistId === artistId)
    .map(track => ({
      ...track,
      popularityScore: computeTrackPopularity(track, currentWeek, tracks)
    }))
    .sort((a, b) => b.popularityScore - a.popularityScore);
  
  return artistTracks;
};

/**
 * Get popular releases for an artist
 * @param {string} artistId - Artist ID
 * @param {Object} aurafyState - Current Aurafy state
 * @param {number} currentWeek - Current game week
 * @returns {Array} Popular releases sorted by aggregate popularity
 */
export const getPopularReleases = (artistId, aurafyState, currentWeek) => {
  const { releases, tracks } = aurafyState;
  
  // Filter releases by artist
  const artistReleases = Object.values(releases)
    .filter(release => {
      // Check if any track in this release belongs to the artist
      return release.trackIds.some(trackId => {
        const track = tracks[trackId];
        return track && track.artistId === artistId;
      });
    })
    .map(release => {
      // Get top 2 tracks for this release
      const releaseTracks = release.trackIds
        .map(trackId => tracks[trackId])
        .filter(track => track && track.artistId === artistId)
        .map(track => ({
          ...track,
          popularityScore: computeTrackPopularity(track, currentWeek, tracks)
        }))
        .sort((a, b) => b.popularityScore - a.popularityScore)
        .slice(0, 2);
      
      // Calculate aggregate popularity
      const avgPopularity = releaseTracks.length > 0 
        ? releaseTracks.reduce((sum, t) => sum + t.popularityScore, 0) / releaseTracks.length
        : 0;
      
      // Add recency weight
      const weeksSinceRelease = currentWeek - release.releaseWeek;
      const recencyWeight = Math.max(1 - weeksSinceRelease * 0.02, 0.8);
      
      return {
        ...release,
        popularityScore: Math.round(avgPopularity * recencyWeight),
        topTracks: releaseTracks
      };
    })
    .sort((a, b) => b.popularityScore - a.popularityScore);
  
  return artistReleases;
};

/**
 * Get global artist rank by monthly listeners
 * @param {string} artistId - Artist ID
 * @param {Object} aurafyState - Current Aurafy state
 * @param {number} currentWeek - Current game week
 * @returns {number} Global rank (1 = highest)
 */
export const getGlobalArtistRank = (artistId, aurafyState, currentWeek) => {
  const { artists } = aurafyState;
  
  // Calculate monthly listeners for all artists
  const artistRankings = Object.entries(artists).map(([id, artist]) => ({
    id,
    monthlyListeners: computeMonthlyListeners(id, aurafyState, currentWeek)
  }));
  
  // Sort by monthly listeners (descending)
  artistRankings.sort((a, b) => b.monthlyListeners - a.monthlyListeners);
  
  // Find rank of target artist
  const rank = artistRankings.findIndex(artist => artist.id === artistId) + 1;
  return rank > 0 ? rank : artistRankings.length + 1;
};

/**
 * Format large numbers for display
 * @param {number} num - Number to format
 * @returns {string} Formatted number (e.g., "1.2M", "45.6K")
 */
export const formatLargeNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};
