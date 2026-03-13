/**
 * Unit tests for the API client
 * Covers: isRetryable, requestWithRetry, circuit breaker state transitions
 */

jest.mock('axios');
jest.mock('../../src/config/config', () => ({
    noaa: {
        baseUrl: 'https://api.weather.gov',
        userAgent: 'TestApp/1.0 (test@example.com)'
    }
}));

describe('isRetryable', () => {
    const { _internal } = require('../../src/ingestion/utils/api-client');
    const { isRetryable } = _internal;

    test('should return true for retryable HTTP status codes', () => {
        expect(isRetryable({ response: { status: 408 } })).toBe(true);
        expect(isRetryable({ response: { status: 429 } })).toBe(true);
        expect(isRetryable({ response: { status: 500 } })).toBe(true);
        expect(isRetryable({ response: { status: 502 } })).toBe(true);
        expect(isRetryable({ response: { status: 503 } })).toBe(true);
        expect(isRetryable({ response: { status: 504 } })).toBe(true);
    });

    test('should return false for non-retryable HTTP status codes', () => {
        expect(isRetryable({ response: { status: 400 } })).toBe(false);
        expect(isRetryable({ response: { status: 401 } })).toBe(false);
        expect(isRetryable({ response: { status: 403 } })).toBe(false);
        expect(isRetryable({ response: { status: 404 } })).toBe(false);
        expect(isRetryable({ response: { status: 422 } })).toBe(false);
    });

    test('should return true for retryable network error codes', () => {
        expect(isRetryable({ code: 'ECONNRESET' })).toBe(true);
        expect(isRetryable({ code: 'ETIMEDOUT' })).toBe(true);
        expect(isRetryable({ code: 'ECONNREFUSED' })).toBe(true);
        expect(isRetryable({ code: 'ENOTFOUND' })).toBe(true);
    });

    test('should return true when error message contains retryable code', () => {
        expect(isRetryable({ message: 'connect ECONNRESET 1.2.3.4' })).toBe(true);
        expect(isRetryable({ message: 'request ETIMEDOUT' })).toBe(true);
    });

    test('should return false for non-retryable errors', () => {
        expect(isRetryable({ code: 'ERR_BAD_REQUEST' })).toBe(false);
        expect(isRetryable(new Error('validation failed'))).toBe(false);
    });
});

describe('requestWithRetry', () => {
    let requestWithRetry;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
        const apiClient = require('../../src/ingestion/utils/api-client');
        requestWithRetry = apiClient._internal.requestWithRetry;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should return result on immediate success', async () => {
        const fn = jest.fn().mockResolvedValue({ data: 'ok' });
        const result = await requestWithRetry(fn, 'test');
        expect(result).toEqual({ data: 'ok' });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('should throw non-retryable errors immediately without retrying', async () => {
        const error = { response: { status: 404 }, message: 'Not found' };
        const fn = jest.fn().mockRejectedValue(error);

        await expect(requestWithRetry(fn, 'test')).rejects.toEqual(error);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('should retry on retryable errors then succeed', async () => {
        const serverError = { response: { status: 500 }, message: 'Internal server error' };
        const fn = jest.fn()
            .mockRejectedValueOnce(serverError)
            .mockResolvedValue('recovered');

        const promise = requestWithRetry(fn, 'test');
        await jest.runAllTimersAsync();
        const result = await promise;

        expect(result).toBe('recovered');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    test('should throw after exhausting all retries', async () => {
        const serverError = { response: { status: 500 }, message: 'Server error' };
        const fn = jest.fn().mockRejectedValue(serverError);

        const promise = requestWithRetry(fn, 'test');
        // Prevent unhandled rejection warning
        promise.catch(() => {});

        await jest.runAllTimersAsync();

        await expect(promise).rejects.toEqual(serverError);
        expect(fn).toHaveBeenCalledTimes(3);
    });
});

describe('Circuit breaker state transitions', () => {
    let requestWithRetry, getCircuitBreakerState;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
        const apiClient = require('../../src/ingestion/utils/api-client');
        requestWithRetry = apiClient._internal.requestWithRetry;
        getCircuitBreakerState = apiClient.getCircuitBreakerState;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should start in CLOSED state', () => {
        const state = getCircuitBreakerState();
        expect(state.state).toBe('CLOSED');
        expect(state.failureCount).toBe(0);
        expect(state.lastFailureTime).toBeNull();
    });

    test('should return state snapshot with recoveryTimeMs', () => {
        const state = getCircuitBreakerState();
        expect(state.recoveryTimeMs).toBe(60000);
    });

    test('should transition to OPEN after threshold consecutive failures', async () => {
        const serverError = { response: { status: 500 }, message: 'Server error' };
        const fn = jest.fn().mockRejectedValue(serverError);

        for (let i = 0; i < 3; i++) {
            const promise = requestWithRetry(fn, 'test');
            promise.catch(() => {});
            await jest.runAllTimersAsync();
            try {
                await promise;
            } catch (_) {
                // expected
            }
        }

        const state = getCircuitBreakerState();
        expect(state.state).toBe('OPEN');
        expect(state.failureCount).toBe(3);
    });

    test('should reject immediately when circuit is OPEN', async () => {
        const serverError = { response: { status: 500 }, message: 'Server error' };
        const failFn = jest.fn().mockRejectedValue(serverError);

        // Open the circuit with 3 consecutive failures
        for (let i = 0; i < 3; i++) {
            const promise = requestWithRetry(failFn, 'test');
            promise.catch(() => {});
            await jest.runAllTimersAsync();
            try {
                await promise;
            } catch (_) {
                // expected
            }
        }

        expect(getCircuitBreakerState().state).toBe('OPEN');

        // Next call should be rejected immediately with circuit breaker error
        const freshFn = jest.fn().mockResolvedValue('ok');
        await expect(requestWithRetry(freshFn, 'test')).rejects.toThrow(/CIRCUIT BREAKER/);
        expect(freshFn).not.toHaveBeenCalled();
    });

    test('should reset failure count on success in CLOSED state', async () => {
        const fn = jest.fn().mockResolvedValue('ok');
        await requestWithRetry(fn, 'test');

        const state = getCircuitBreakerState();
        expect(state.state).toBe('CLOSED');
        expect(state.failureCount).toBe(0);
    });
});
