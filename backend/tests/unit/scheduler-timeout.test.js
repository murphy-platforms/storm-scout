'use strict';

/**
 * Unit tests for ingestion cycle timeout behavior.
 * Verifies that runIngestionWithTimeout aborts long-running cycles
 * and clears the isIngesting guard so future cycles can run.
 */

// Mock ingestNOAAData to simulate slow ingestion
const mockIngestNOAAData = jest.fn();
jest.mock('../../src/ingestion/noaa-ingestor', () => ({
    ingestNOAAData: (...args) => mockIngestNOAAData(...args),
    getLastIngestionTime: jest.fn(),
    getIngestionStatus: jest.fn().mockReturnValue({ active: false, startedAt: null })
}));

jest.mock('../../src/config/config', () => ({
    ingestion: {
        enabled: true,
        intervalMinutes: 15,
        maxDurationMs: 600000
    },
    noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'test' }
}));

jest.mock('../../src/utils/alerting', () => ({
    alertIngestionFailure: jest.fn(),
    alertIngestionRecovery: jest.fn()
}));

jest.mock('../../src/scripts/capture-historical-snapshot', () => ({
    captureSnapshot: jest.fn()
}));

jest.mock('../../src/middleware/metrics', () => ({
    ingestionCycleDuration: { startTimer: jest.fn().mockReturnValue(jest.fn()) },
    ingestionAdvisoriesTotal: { inc: jest.fn() }
}));

jest.mock('node-cron', () => ({
    schedule: jest.fn()
}));

const { _testing, getSchedulerStatus } = require('../../src/ingestion/scheduler');
const { runIngestionWithTimeout } = _testing;

afterEach(() => jest.clearAllMocks());

describe('runIngestionWithTimeout', () => {
    test('resolves when ingestion completes within timeout', async () => {
        mockIngestNOAAData.mockResolvedValue({ advisoriesCreated: 5 });

        const result = await runIngestionWithTimeout(5000);

        expect(result.advisoriesCreated).toBe(5);
        expect(mockIngestNOAAData).toHaveBeenCalledWith(expect.objectContaining({
            signal: expect.any(AbortSignal)
        }));
    });

    test('rejects when ingestion exceeds timeout', async () => {
        // Simulate slow ingestion that takes longer than timeout
        mockIngestNOAAData.mockImplementation(() =>
            new Promise((resolve) => setTimeout(resolve, 5000))
        );

        await expect(runIngestionWithTimeout(50)).rejects.toThrow(/timeout/);
    });

    test('passes AbortSignal to ingestNOAAData', async () => {
        mockIngestNOAAData.mockResolvedValue({});

        await runIngestionWithTimeout(5000);

        const callArgs = mockIngestNOAAData.mock.calls[0][0];
        expect(callArgs).toHaveProperty('signal');
        expect(callArgs.signal).toBeInstanceOf(AbortSignal);
    });

    test('signal is aborted when timeout fires', async () => {
        let capturedSignal;
        mockIngestNOAAData.mockImplementation(({ signal }) => {
            capturedSignal = signal;
            return new Promise((resolve) => setTimeout(resolve, 5000));
        });

        await expect(runIngestionWithTimeout(50)).rejects.toThrow(/timeout/);
        expect(capturedSignal.aborted).toBe(true);
    });
});

describe('getSchedulerStatus', () => {
    test('includes maxDurationMs and lastTimeoutAt', () => {
        const status = getSchedulerStatus();
        expect(status.ingestion).toHaveProperty('maxDurationMs');
        expect(status.ingestion).toHaveProperty('lastTimeoutAt');
    });
});
