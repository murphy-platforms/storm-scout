/** @jest-environment jsdom */

/**
 * Unit tests for frontend/js/update-banner.js
 * Countdown rendering, ingestion polling, and interval lifecycle.
 */

const UpdateBanner = require('../../../../frontend/js/update-banner');

describe('frontend update-banner.js', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <span id="lastUpdated">Loading...</span>
            <span id="nextUpdate">Loading...</span>
        `;
        UpdateBanner.destroy();
        UpdateBanner.nextUpdateTime = null;
        jest.restoreAllMocks();
        global.API = {
            getOverview: jest.fn()
        };
        global.fetch = jest.fn();
    });

    test('updateCountdown renders minutes and seconds before next update', () => {
        UpdateBanner.nextUpdateTime = new Date(Date.now() + 90 * 1000);
        UpdateBanner.updateCountdown();

        expect(document.getElementById('nextUpdate').textContent).toMatch(/1m \d+s/);
    });

    test('updateCountdown enters refreshing state and starts ingestion polling when expired', () => {
        const pollingSpy = jest.spyOn(UpdateBanner, 'startIngestionPolling').mockImplementation(() => {});
        UpdateBanner.isPollingIngestion = false;
        UpdateBanner.nextUpdateTime = new Date(Date.now() - 1000);

        UpdateBanner.updateCountdown();

        expect(document.getElementById('nextUpdate').innerHTML).toContain('Refreshing data');
        expect(pollingSpy).toHaveBeenCalledTimes(1);
    });

    test('init populates last-updated label and starts countdown interval', async () => {
        jest.useFakeTimers();

        global.API.getOverview.mockResolvedValue({
            last_updated: new Date().toISOString(),
            update_interval_minutes: 15
        });

        await UpdateBanner.init();

        expect(document.getElementById('lastUpdated').textContent).not.toBe('Loading...');
        expect(document.getElementById('nextUpdate').textContent).toMatch(/\d+m \d+s/);
        expect(UpdateBanner.countdownInterval).not.toBeNull();

        UpdateBanner.destroy();
        jest.useRealTimers();
    });

    test('startIngestionPolling re-initializes when ingestion becomes inactive', async () => {
        jest.useFakeTimers();

        const initSpy = jest.spyOn(UpdateBanner, 'init').mockResolvedValue();
        global.fetch.mockResolvedValue({
            json: async () => ({ ingestion: { active: false } })
        });

        UpdateBanner.startIngestionPolling();
        await jest.advanceTimersByTimeAsync(10000);

        expect(global.fetch).toHaveBeenCalled();
        expect(UpdateBanner.isPollingIngestion).toBe(false);
        expect(initSpy).toHaveBeenCalled();

        UpdateBanner.destroy();
        jest.useRealTimers();
    });

    test('destroy clears both intervals and resets polling state', () => {
        const clearSpy = jest.spyOn(global, 'clearInterval');
        UpdateBanner.countdownInterval = setInterval(() => {}, 1000);
        UpdateBanner.pollingInterval = setInterval(() => {}, 1000);
        UpdateBanner.isPollingIngestion = true;

        UpdateBanner.destroy();

        expect(UpdateBanner.countdownInterval).toBeNull();
        expect(UpdateBanner.pollingInterval).toBeNull();
        expect(UpdateBanner.isPollingIngestion).toBe(false);
        expect(clearSpy).toHaveBeenCalled();

        clearSpy.mockRestore();
    });
});
