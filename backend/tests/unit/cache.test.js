/**
 * Unit tests for the in-memory cache service
 */

const cache = require('../../src/utils/cache');

afterEach(() => {
    cache.invalidateAll();
});

describe('Cache get/set/del', () => {
    test('should return undefined for missing key', () => {
        expect(cache.get('nonexistent')).toBeUndefined();
    });

    test('should store and retrieve a value', () => {
        cache.set('testKey', { data: 'hello' });
        expect(cache.get('testKey')).toEqual({ data: 'hello' });
    });

    test('should store string values', () => {
        cache.set('str', 'simple string');
        expect(cache.get('str')).toBe('simple string');
    });

    test('should store array values', () => {
        cache.set('arr', [1, 2, 3]);
        expect(cache.get('arr')).toEqual([1, 2, 3]);
    });

    test('should delete a key and return count', () => {
        cache.set('toDelete', 'value');
        const count = cache.del('toDelete');
        expect(count).toBe(1);
        expect(cache.get('toDelete')).toBeUndefined();
    });

    test('should return 0 when deleting nonexistent key', () => {
        const count = cache.del('nonexistent');
        expect(count).toBe(0);
    });

    test('should overwrite existing key', () => {
        cache.set('key', 'first');
        cache.set('key', 'second');
        expect(cache.get('key')).toBe('second');
    });
});

describe('Cache invalidation', () => {
    test('invalidateAll should clear all keys', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        cache.invalidateAll();
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('c')).toBeUndefined();
    });

    test('invalidateDynamic should clear advisory and status keys', () => {
        cache.set(cache.CACHE_KEYS.ACTIVE_ADVISORIES, [{ id: 1 }]);
        cache.set(cache.CACHE_KEYS.STATUS_OVERVIEW, { total: 5 });
        cache.set(cache.CACHE_KEYS.ALL_SITES, [{ id: 1 }]);
        cache.set(cache.CACHE_KEYS.STATES_LIST, ['AK', 'AL']);

        cache.invalidateDynamic();

        // Dynamic keys should be cleared
        expect(cache.get(cache.CACHE_KEYS.ACTIVE_ADVISORIES)).toBeUndefined();
        expect(cache.get(cache.CACHE_KEYS.STATUS_OVERVIEW)).toBeUndefined();

        // Static keys should be preserved
        expect(cache.get(cache.CACHE_KEYS.ALL_SITES)).toEqual([{ id: 1 }]);
        expect(cache.get(cache.CACHE_KEYS.STATES_LIST)).toEqual(['AK', 'AL']);
    });

    test('invalidateDynamic should clear filtered advisory keys', () => {
        cache.set('advisories:filtered:CRITICAL', [{ id: 1 }]);
        cache.set('advisories:filtered:HIGH', [{ id: 2 }]);
        cache.set(cache.CACHE_KEYS.ALL_SITES, [{ id: 1 }]);

        cache.invalidateDynamic();

        expect(cache.get('advisories:filtered:CRITICAL')).toBeUndefined();
        expect(cache.get('advisories:filtered:HIGH')).toBeUndefined();
        expect(cache.get(cache.CACHE_KEYS.ALL_SITES)).toEqual([{ id: 1 }]);
    });
});

describe('Cache stats', () => {
    test('should return stats with zero values initially', () => {
        const stats = cache.getStats();
        expect(stats).toHaveProperty('keys');
        expect(stats).toHaveProperty('hits');
        expect(stats).toHaveProperty('misses');
        expect(stats).toHaveProperty('hitRate');
    });

    test('should track key count', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        const stats = cache.getStats();
        expect(stats.keys).toBe(2);
    });

    test('should calculate hit rate', () => {
        cache.set('key', 'value');
        cache.get('key');       // hit
        cache.get('key');       // hit
        cache.get('missing');   // miss
        const stats = cache.getStats();
        expect(parseFloat(stats.hitRate)).toBeGreaterThan(0);
    });
});

describe('Cache constants', () => {
    test('CACHE_KEYS should have expected keys', () => {
        expect(cache.CACHE_KEYS.STATUS_OVERVIEW).toBe('status:overview');
        expect(cache.CACHE_KEYS.ALL_SITES).toBe('sites:all');
        expect(cache.CACHE_KEYS.ACTIVE_ADVISORIES).toBe('advisories:active');
    });

    test('TTL should have expected values', () => {
        expect(cache.TTL.SHORT).toBe(900);
        expect(cache.TTL.LONG).toBe(3600);
        expect(cache.TTL.VERY_LONG).toBe(86400);
    });
});
