/** @jest-environment jsdom */

/**
 * Unit tests for frontend/js/api.js
 * Cache behavior, timeout/error paths, and localStorage fallbacks.
 */

const { API, fetchWithTimeout, __resetVersionCache } = require('./api');

describe('frontend api.js', () => {
    beforeEach(() => {
        localStorage.clear();
        __resetVersionCache();
        jest.restoreAllMocks();
        global.fetch = jest.fn();
    });

    test('getOverview caches successful responses for subsequent calls', async () => {
        global.fetch.mockResolvedValue({
            json: async () => ({ success: true, data: { total_offices: 300 } })
        });

        const first = await API.getOverview();
        const second = await API.getOverview();

        expect(first.total_offices).toBe(300);
        expect(second.total_offices).toBe(300);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('getOverview forceRefresh bypasses localStorage cache and fetches fresh data', async () => {
        localStorage.setItem('cache:overview', JSON.stringify({ data: { total_offices: 1 }, ts: Date.now() }));
        global.fetch.mockResolvedValue({
            json: async () => ({ success: true, data: { total_offices: 300 } })
        });

        const fresh = await API.getOverview({ forceRefresh: true });

        expect(fresh.total_offices).toBe(300);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(
            'api/status/overview',
            expect.objectContaining({ cache: 'no-store', signal: expect.any(Object) })
        );
    });

    test('getActiveAdvisories bypasses corrupt localStorage cache and refetches', async () => {
        localStorage.setItem('cache:advisories', 'not-json');
        global.fetch.mockResolvedValue({
            json: async () => ({ success: true, data: [{ id: 1, advisory_type: 'Tornado Warning' }] })
        });

        const advisories = await API.getActiveAdvisories();

        expect(advisories).toHaveLength(1);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('getOffices throws when API reports success=false', async () => {
        global.fetch.mockResolvedValue({
            json: async () => ({ success: false, error: 'Failed to fetch offices' })
        });

        await expect(API.getOffices()).rejects.toThrow('Failed to fetch offices');
    });

    test('getVersion uses in-memory cache after first fetch', async () => {
        global.fetch.mockResolvedValue({
            json: async () => ({ version: '2.0.0', released: '2026-03-13' })
        });

        const first = await API.getVersion();
        const second = await API.getVersion();

        expect(first).toEqual(second);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('getTiming fetches uncached timing metadata', async () => {
        global.fetch.mockResolvedValue({
            json: async () => ({
                success: true,
                data: {
                    server_time: '2026-03-21T19:00:00.000Z',
                    last_updated: '2026-03-21T18:45:00.000Z',
                    update_interval_minutes: 15,
                    ingestion_active: false,
                    next_scheduled_update_at: '2026-03-21T19:15:00.000Z'
                }
            })
        });

        const timing = await API.getTiming();

        expect(timing.server_time).toBe('2026-03-21T19:00:00.000Z');
        expect(global.fetch).toHaveBeenCalledWith(
            'api/status/timing',
            expect.objectContaining({ cache: 'no-store', signal: expect.any(Object) })
        );
    });

    test('fetchWithTimeout rejects when request exceeds timeout', async () => {
        jest.useFakeTimers();

        global.fetch.mockImplementation((url, options = {}) => {
            return new Promise((resolve, reject) => {
                if (options.signal) {
                    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
                }
            });
        });

        const pendingAssertion = expect(fetchWithTimeout('api/slow-endpoint', {}, 10)).rejects.toThrow();
        await jest.advanceTimersByTimeAsync(20);

        await pendingAssertion;
        jest.useRealTimers();
    });

    test('getOverview still works when localStorage access throws', async () => {
        const storageSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('localStorage unavailable');
        });

        global.fetch.mockResolvedValue({
            json: async () => ({ success: true, data: { total_offices: 300 } })
        });

        const result = await API.getOverview();
        expect(result.total_offices).toBe(300);
        expect(global.fetch).toHaveBeenCalledTimes(1);

        storageSpy.mockRestore();
    });
});
