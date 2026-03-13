/**
 * In-Memory Cache Service
 * Uses node-cache for efficient caching with automatic TTL expiration
 */

const NodeCache = require('node-cache');

const isDevMode = process.env.NODE_ENV !== 'production';

// Default TTL: 15 minutes (matches NOAA ingestion interval)
const DEFAULT_TTL_SECONDS = 900;

// Create cache instance
const cache = new NodeCache({
    stdTTL: DEFAULT_TTL_SECONDS, // Default TTL for all entries
    checkperiod: 120, // Check for expired keys every 2 minutes
    useClones: false, // Return references for better performance
    deleteOnExpire: true // Automatically delete expired entries
});

/**
 * Cache keys for different endpoints
 */
const CACHE_KEYS = {
    STATUS_OVERVIEW: 'status:overview',
    ALL_SITES: 'sites:all',
    ACTIVE_ADVISORIES: 'advisories:active',
    STATES_LIST: 'sites:states',
    REGIONS_LIST: 'sites:regions'
};

/**
 * TTL values in seconds for different cache types
 */
const TTL = {
    SHORT: 900, // 15 minutes - for dynamic data (advisories, status)
    LONG: 3600, // 1 hour - for static data (sites)
    VERY_LONG: 86400 // 24 hours - for very static data (states, regions)
};

/**
 * Get a value from cache
 * @param {string} key - Cache key
 * @returns {*} Cached value or undefined if not found/expired
 */
function get(key) {
    const value = cache.get(key);
    if (value !== undefined) {
        if (isDevMode) console.log(`[CACHE] HIT: ${key}`);
        return value;
    }
    if (isDevMode) console.log(`[CACHE] MISS: ${key}`);
    return undefined;
}

/**
 * Set a value in cache
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 * @param {number} ttl - TTL in seconds (optional, uses default if not specified)
 * @returns {boolean} True if successful
 */
function set(key, value, ttl = DEFAULT_TTL_SECONDS) {
    const success = cache.set(key, value, ttl);
    if (success && isDevMode) {
        console.log(`[CACHE] SET: ${key} (TTL: ${ttl}s)`);
    }
    return success;
}

/**
 * Delete a specific key from cache
 * @param {string} key - Cache key to delete
 * @returns {number} Number of deleted entries
 */
function del(key) {
    const count = cache.del(key);
    if (count > 0 && isDevMode) {
        console.log(`[CACHE] DEL: ${key}`);
    }
    return count;
}

/**
 * Invalidate all cached data
 * Called after NOAA ingestion to ensure fresh data
 */
function invalidateAll() {
    const keys = cache.keys();
    cache.flushAll();
    if (isDevMode) console.log(`[CACHE] INVALIDATED: ${keys.length} keys cleared`);
}

/**
 * Invalidate only dynamic data changed by ingestion.
 * Preserves static keys (ALL_SITES, STATES_LIST, REGIONS_LIST) which do not
 * change during ingestion and are expensive to rebuild — avoiding thundering herd.
 * Also clears filtered advisory keys cached under 'advisories:filtered:*'.
 */
function invalidateDynamic() {
    const dynamicKeys = [CACHE_KEYS.ACTIVE_ADVISORIES, CACHE_KEYS.STATUS_OVERVIEW];
    dynamicKeys.forEach((k) => cache.del(k));

    // Clear parameterised advisory filter keys (see routes/advisories.js #92)
    cache
        .keys()
        .filter((k) => k.startsWith('advisories:filtered:'))
        .forEach((k) => cache.del(k));

    if (isDevMode) console.log('[CACHE] Dynamic data invalidated (static keys preserved)');
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats including hits, misses, keys
 */
function getStats() {
    const stats = cache.getStats();
    return {
        keys: cache.keys().length,
        hits: stats.hits,
        misses: stats.misses,
        hitRate:
            stats.hits + stats.misses > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1) + '%' : '0%'
    };
}

module.exports = {
    get,
    set,
    del,
    invalidateAll,
    invalidateDynamic,
    getStats,
    CACHE_KEYS,
    TTL
};
