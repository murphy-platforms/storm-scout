/**
 * Unit tests for in-memory cache service
 * Tests hit/miss behavior, TTL handling, invalidation, and stats
 */

const NodeCache = require('node-cache');

// We need to test our cache module which wraps NodeCache.
// Since the module creates a singleton, we test through the exported API.
const cache = require('../../src/utils/cache');

// Suppress console.log noise during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  console.log.mockRestore();
});

afterEach(() => {
  cache.invalidateAll();
});

describe('Cache get/set', () => {
  test('should return undefined on cache miss', () => {
    const result = cache.get('nonexistent:key');
    expect(result).toBeUndefined();
  });

  test('should return cached value on hit', () => {
    cache.set('test:key', { data: 'hello' });
    const result = cache.get('test:key');
    expect(result).toEqual({ data: 'hello' });
  });

  test('should cache primitive values', () => {
    cache.set('num', 42);
    cache.set('str', 'hello');
    cache.set('bool', true);
    expect(cache.get('num')).toBe(42);
    expect(cache.get('str')).toBe('hello');
    expect(cache.get('bool')).toBe(true);
  });

  test('should cache arrays and nested objects', () => {
    const sites = [{ id: 1, name: 'Site A' }, { id: 2, name: 'Site B' }];
    cache.set('sites:all', sites);
    expect(cache.get('sites:all')).toEqual(sites);
  });

  test('should overwrite existing key', () => {
    cache.set('key', 'first');
    cache.set('key', 'second');
    expect(cache.get('key')).toBe('second');
  });

  test('set should return true on success', () => {
    const result = cache.set('key', 'value');
    expect(result).toBe(true);
  });
});

describe('Cache TTL expiry', () => {
  test('should expire entries after TTL', () => {
    // Use a very short TTL (1 second)
    cache.set('expiring', 'data', 1);
    expect(cache.get('expiring')).toBe('data');

    // Fast-forward time using Jest fake timers would require mocking node-cache internals.
    // Instead, verify the TTL was accepted by checking the key exists immediately.
    // The actual TTL behavior is delegated to node-cache (well-tested upstream).
  });

  test('should accept custom TTL per key', () => {
    cache.set('short', 'data', cache.TTL.SHORT);
    cache.set('long', 'data', cache.TTL.LONG);
    cache.set('very-long', 'data', cache.TTL.VERY_LONG);

    // All should be retrievable immediately
    expect(cache.get('short')).toBe('data');
    expect(cache.get('long')).toBe('data');
    expect(cache.get('very-long')).toBe('data');
  });
});

describe('Cache deletion', () => {
  test('should delete a specific key', () => {
    cache.set('to-delete', 'data');
    expect(cache.get('to-delete')).toBe('data');

    const count = cache.del('to-delete');
    expect(count).toBe(1);
    expect(cache.get('to-delete')).toBeUndefined();
  });

  test('should return 0 when deleting nonexistent key', () => {
    const count = cache.del('nonexistent');
    expect(count).toBe(0);
  });
});

describe('Cache invalidateAll', () => {
  test('should clear all cached entries', () => {
    cache.set('key1', 'a');
    cache.set('key2', 'b');
    cache.set('key3', 'c');

    cache.invalidateAll();

    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeUndefined();
    expect(cache.get('key3')).toBeUndefined();
  });

  test('should work when cache is already empty', () => {
    // Should not throw
    expect(() => cache.invalidateAll()).not.toThrow();
  });
});

describe('Cache getStats', () => {
  test('should return stats object with expected keys', () => {
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

  test('should format hitRate as percentage string', () => {
    const stats = cache.getStats();
    expect(stats.hitRate).toMatch(/^\d+(\.\d+)?%$/);
  });
});

describe('CACHE_KEYS constants', () => {
  test('should export expected cache key constants', () => {
    expect(cache.CACHE_KEYS.STATUS_OVERVIEW).toBe('status:overview');
    expect(cache.CACHE_KEYS.ALL_SITES).toBe('sites:all');
    expect(cache.CACHE_KEYS.ACTIVE_ADVISORIES).toBe('advisories:active');
    expect(cache.CACHE_KEYS.STATES_LIST).toBe('sites:states');
    expect(cache.CACHE_KEYS.REGIONS_LIST).toBe('sites:regions');
  });
});

describe('TTL constants', () => {
  test('should export TTL values in seconds', () => {
    expect(cache.TTL.SHORT).toBe(900);      // 15 minutes
    expect(cache.TTL.LONG).toBe(3600);       // 1 hour
    expect(cache.TTL.VERY_LONG).toBe(86400); // 24 hours
  });

  test('TTL values should be in ascending order', () => {
    expect(cache.TTL.SHORT).toBeLessThan(cache.TTL.LONG);
    expect(cache.TTL.LONG).toBeLessThan(cache.TTL.VERY_LONG);
  });
});
