/**
 * Aurafy - In-game streaming app types
 * Models the streaming platform data structures
 */

/**
 * @typedef {Object} AurafyArtist
 * @property {string} id - Same ID as game artist
 * @property {string} name - Artist display name
 * @property {string} [imageUrl] - Large header image URL
 * @property {number} monthlyListeners - Recalculated weekly
 * @property {string} [about] - Artist bio/description
 */

/**
 * @typedef {Object} AurafyTrack
 * @property {string} id - Tie to game song ID
 * @property {string} artistId - Artist ID
 * @property {string} title - Track title
 * @property {'single' | 'album-track' | 'ep-track'} type - Track type
 * @property {string} [coverUrl] - Track cover art URL
 * @property {number} releaseWeek - Game week released
 * @property {number} streamsTotal - Lifetime streams
 * @property {number} streamsThisWeek - Current week streams
 * @property {number} [durationSec] - Track duration in seconds
 * @property {number} popularityScore - Computed metric (0-100)
 */

/**
 * @typedef {Object} AurafyRelease
 * @property {string} id - Project ID or single ID
 * @property {string} title - Release title
 * @property {'single' | 'album' | 'ep'} type - Release type
 * @property {string} [coverUrl] - Release cover art URL
 * @property {number} releaseWeek - Game week released
 * @property {string[]} trackIds - Array of track IDs
 * @property {number} popularityScore - Aggregate popularity score
 */

/**
 * @typedef {Object} AurafyState
 * @property {Object.<string, AurafyArtist>} artists - Artist records
 * @property {Object.<string, AurafyTrack>} tracks - Track records
 * @property {Object.<string, AurafyRelease>} releases - Release records
 */

// Export for use in other modules
export const AurafyTypes = {
  // This is a placeholder export - the types are documented above
  // and will be used throughout the Aurafy system
};
