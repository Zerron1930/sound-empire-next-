/**
 * Aurafy Configuration
 * Centralized settings for streaming behavior and calculations
 */

export const AURAFY_CONFIG = {
  // Stream to sales conversion rate
  STREAM_TO_SALE: 0.010, // 100 streams => 1 sale
  
  // New release boost multiplier (first 2 weeks)
  NEW_RELEASE_BOOST: 1.3,
  
  // Playlist editorial chance
  PLAYLIST_HIT_P: 0.08, // 8% chance a track gets editorial bump
  
  // Playlist multiplier on weekly streams
  PLAYLIST_MULT: 2.0,
  
  // Monthly listeners calculation
  MONTHLY_LISTENERS_WEEKS: 4, // Last 4 weeks
  LISTENER_IMPRESSION_RATIO: 0.35, // 35% of streams are unique listeners
  
  // Popularity score weights
  POPULARITY_WEIGHTS: {
    LIFETIME_STREAMS: 0.6,    // 60% weight on total streams
    WEEKLY_STREAMS: 0.3,      // 30% weight on recent streams
    VIRALITY_BOOST: 0.1       // 10% weight on projected virality
  },
  
  // Age decay for weekly streams (per week)
  AGE_DECAY_PER_WEEK: 0.04,
  
  // Minimum age weight (after decay)
  MIN_AGE_WEIGHT: 0.4,
  
  // Stream decay at week start
  WEEKLY_STREAM_DECAY: 0.25, // Keep 25% of previous week's streams
  
  // UI settings
  UI: {
    TOP_TRACKS_DISPLAY: 5,    // Show 5 tracks initially
    TOP_TRACKS_EXPAND: 10,    // Expand to 10
    POPULAR_RELEASES_LIMIT: 8, // Show top 8 popular releases
    CAROUSEL_ITEMS_PER_ROW: 3  // 3 items per row on desktop
  }
};

// Helper function to get config value
export const getConfig = (key) => AURAFY_CONFIG[key] || null;
