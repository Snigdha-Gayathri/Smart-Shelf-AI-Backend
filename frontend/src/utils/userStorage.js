/**
 * User-scoped persistent storage utility
 * Handles localStorage persistence for user-specific data that must survive browser refresh
 * 
 * Data persisted per user:
 * - currentlyReading
 * - previousReads
 * - userFeedback (likes/dislikes)
 * - personalityProfile
 * - annualWrapped
 * - profilePicture (already in localStorage)
 * 
 * On logout: Data is NOT deleted (persists for next login)
 * On account deletion: All user data is explicitly wiped
 * On refresh: Data is restored from localStorage
 */

const getStorageKey = (userId, dataType) => `user_${userId}_${dataType}`;

export const userStorage = {
  /**
   * Save user-specific data to localStorage
   * @param {string} userId - User identifier from auth.user.id
   * @param {string} dataType - Type of data (e.g., 'currentlyReading', 'previousReads')
   * @param {any} data - Data to persist
   */
  save: (userId, dataType, data) => {
    if (!userId) return;
    try {
      const key = getStorageKey(userId, dataType);
      // Convert Maps to plain objects for JSON serialization
      const serializable = serializeData(data);
      localStorage.setItem(key, JSON.stringify(serializable));
    } catch (e) {
      console.error(`Failed to save ${dataType} for user ${userId}:`, e);
    }
  },

  /**
   * Load user-specific data from localStorage
   * @param {string} userId - User identifier
   * @param {string} dataType - Type of data to load
   * @param {any} defaultValue - Default value if not found
   * @returns {any} Persisted data or defaultValue
   */
  load: (userId, dataType, defaultValue) => {
    if (!userId) return defaultValue;
    try {
      const key = getStorageKey(userId, dataType);
      const data = localStorage.getItem(key);
      if (!data) return defaultValue;
      
      const parsed = JSON.parse(data);
      // Restore Maps from plain objects if needed
      return deserializeData(dataType, parsed);
    } catch (e) {
      console.error(`Failed to load ${dataType} for user ${userId}:`, e);
      return defaultValue;
    }
  },

  /**
   * Delete all data for a specific user (used on account deletion)
   * @param {string} userId - User identifier
   */
  deleteUser: (userId) => {
    if (!userId) return;
    try {
      const dataTypes = ['currentlyReading', 'previousReads', 'userFeedback', 'personalityProfile', 'annualWrapped', 'educationalBooks', 'reviews', 'userPreferenceModel', 'reviewInsights'];
      dataTypes.forEach(type => {
        const key = getStorageKey(userId, type);
        localStorage.removeItem(key);
      });
      // Also remove any per-book notes
      const notePrefix = `user_notes_${userId}_`;
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(notePrefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      localStorage.removeItem(`smartshelf_user_settings_${userId}`);
      console.log(`Deleted all persisted data for user ${userId}`);
    } catch (e) {
      console.error(`Failed to delete user data for ${userId}:`, e);
    }
  },

  /**
   * Check if user has existing data in storage
   * @param {string} userId - User identifier
   * @returns {boolean} True if any user data exists
   */
  hasUserData: (userId) => {
    if (!userId) return false;
    const key = getStorageKey(userId, 'currentlyReading');
    return localStorage.getItem(key) !== null;
  }
};

/**
 * Convert data to serializable format (Maps -> objects)
 */
function serializeData(data) {
  if (data instanceof Map) {
    return {
      __type: 'Map',
      value: Array.from(data.entries())
    };
  }
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const serialized = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = serializeData(value);
    }
    return serialized;
  }
  if (Array.isArray(data)) {
    return data.map(item => serializeData(item));
  }
  return data;
}

/**
 * Restore data from serialized format (objects -> Maps for userFeedback)
 */
function deserializeData(dataType, data) {
  // userFeedback has nested Maps (likedGenres, dislikedGenres, etc.)
  if (dataType === 'userFeedback' && data && typeof data === 'object') {
    return {
      likedGenres: data.likedGenres?.__type === 'Map' ? new Map(data.likedGenres.value) : new Map(),
      dislikedGenres: data.dislikedGenres?.__type === 'Map' ? new Map(data.dislikedGenres.value) : new Map(),
      likedTags: data.likedTags?.__type === 'Map' ? new Map(data.likedTags.value) : new Map(),
      dislikedTags: data.dislikedTags?.__type === 'Map' ? new Map(data.dislikedTags.value) : new Map()
    };
  }
  return data;
}
