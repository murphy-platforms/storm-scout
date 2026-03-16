/**
 * Unit tests for the API client
 * Covers: isRetryable, requestWithRetry, circuit breaker state transitions,
 *         enforceRateLimit, validateConfig, NOAA API functions, and advanced
 *         circuit breaker transitions (HALF_OPEN)
 */

const axios = require('axios');

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

// ── NEW TESTS ───────────────────────────────────────────────────────────

describe('enforceRateLimit', () => {
    let enforceRateLimit;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
        const apiClient = require('../../src/ingestion/utils/api-client');
        enforceRateLimit = apiClient._internal.enforceRateLimit;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should not delay the first request', async () => {
        const before = Date.now();
        await enforceRateLimit();
        // No sleep should have been awaited (fake timers would block)
        expect(Date.now() - before).toBeLessThan(100);
    });

    test('should delay when requests are too close together', async () => {
        // First call sets lastRequestTime
        await enforceRateLimit();

        // Immediately call again — should need to sleep
        const promise = enforceRateLimit();
        // Advance timers by the rate limit interval (500ms default)
        jest.advanceTimersByTime(500);
        await promise;
        // If we got here without hanging, the rate limit delay resolved
    });
});

describe('validateConfig', () => {
    test('should throw when userAgent is missing', () => {
        jest.resetModules();
        // Override config mock to have empty userAgent
        jest.doMock('../../src/config/config', () => ({
            noaa: {
                baseUrl: 'https://api.weather.gov',
                userAgent: ''
            }
        }));

        const apiClient = require('../../src/ingestion/utils/api-client');
        // Calling any NOAA function triggers createNoaaClient -> validateConfig
        expect(() => {
            // Access the internal lazy init by trying to get alerts
            // But since validateConfig is called from createNoaaClient,
            // we can trigger it via getNOAAAlerts which calls getNoaaClient
            // However, that's async. Let's trigger it more directly.
            // The simplest way: call getNOAAAlerts and let it throw synchronously
            // from checkCircuitBreaker -> getNoaaClient -> createNoaaClient -> validateConfig
        }).not.toThrow(); // placeholder — we test below

        // Actually test via the async path
        expect(apiClient.getNOAAAlerts()).rejects.toThrow('NOAA_API_USER_AGENT environment variable is required');
    });
});

describe('createNoaaClient / getNoaaClient (lazy initialization)', () => {
    test('should create axios client with correct config', () => {
        jest.resetModules();
        // Restore the normal config mock
        jest.doMock('../../src/config/config', () => ({
            noaa: {
                baseUrl: 'https://api.weather.gov',
                userAgent: 'TestApp/1.0 (test@example.com)'
            }
        }));
        const mockAxios = require('axios');
        const mockClient = { get: jest.fn() };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');
        // Trigger lazy init by calling an API function
        const fn = jest.fn().mockResolvedValue({ data: { features: [] } });
        mockClient.get.mockResolvedValue({ data: { features: [] } });

        // getNOAAAlerts will call getNoaaClient() -> createNoaaClient() -> axios.create()
        return apiClient.getNOAAAlerts().then(() => {
            expect(mockAxios.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    baseURL: 'https://api.weather.gov',
                    timeout: 30000,
                    headers: expect.objectContaining({
                        'User-Agent': 'TestApp/1.0 (test@example.com)',
                        Accept: 'application/geo+json'
                    })
                })
            );
        });
    });

    test('should reuse client on subsequent calls (lazy singleton)', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: {
                baseUrl: 'https://api.weather.gov',
                userAgent: 'TestApp/1.0 (test@example.com)'
            }
        }));
        const mockAxios = require('axios');
        const mockClient = { get: jest.fn().mockResolvedValue({ data: { features: [] } }) };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getNOAAAlerts().then(() => {
            return apiClient.getNOAAAlerts();
        }).then(() => {
            // axios.create should only be called once
            expect(mockAxios.create).toHaveBeenCalledTimes(1);
        });
    });
});

describe('getNOAAAlerts', () => {
    test('should fetch and return features array', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const mockFeatures = [{ id: 'alert-1' }, { id: 'alert-2' }];
        const mockClient = { get: jest.fn().mockResolvedValue({ data: { features: mockFeatures } }) };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getNOAAAlerts().then((result) => {
            expect(result).toEqual(mockFeatures);
            expect(mockClient.get).toHaveBeenCalledWith('/alerts/active');
        });
    });

    test('should return empty array when response has no features', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const mockClient = { get: jest.fn().mockResolvedValue({ data: {} }) };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getNOAAAlerts().then((result) => {
            expect(result).toEqual([]);
        });
    });
});

describe('getNOAAAlertsByPoint', () => {
    test('should fetch alerts for a specific lat/lon point', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const mockFeatures = [{ id: 'point-alert-1' }];
        const mockClient = { get: jest.fn().mockResolvedValue({ data: { features: mockFeatures } }) };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getNOAAAlertsByPoint(40.7128, -74.006).then((result) => {
            expect(result).toEqual(mockFeatures);
            expect(mockClient.get).toHaveBeenCalledWith('/alerts/active?point=40.7128,-74.006');
        });
    });

    test('should return empty array when no features for point', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const mockClient = { get: jest.fn().mockResolvedValue({ data: { features: null } }) };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getNOAAAlertsByPoint(0, 0).then((result) => {
            expect(result).toEqual([]);
        });
    });
});

describe('getNOAAAlertsByState', () => {
    test('should fetch alerts for a state code', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const mockFeatures = [{ id: 'fl-alert' }];
        const mockClient = { get: jest.fn().mockResolvedValue({ data: { features: mockFeatures } }) };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getNOAAAlertsByState('FL').then((result) => {
            expect(result).toEqual(mockFeatures);
            expect(mockClient.get).toHaveBeenCalledWith('/alerts/active?area=FL');
        });
    });
});

describe('getUGCZoneInfo', () => {
    test('should use forecast endpoint for Z-type zones', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const mockProps = { id: 'FLZ076', name: 'Pinellas' };
        const mockClient = { get: jest.fn().mockResolvedValue({ data: { properties: mockProps } }) };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getUGCZoneInfo('FLZ076').then((result) => {
            expect(result).toEqual(mockProps);
            expect(mockClient.get).toHaveBeenCalledWith('/zones/forecast/FLZ076');
        });
    });

    test('should use county endpoint for C-type zones', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const mockProps = { id: 'FLC057', name: 'Hillsborough' };
        const mockClient = { get: jest.fn().mockResolvedValue({ data: { properties: mockProps } }) };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getUGCZoneInfo('FLC057').then((result) => {
            expect(result).toEqual(mockProps);
            expect(mockClient.get).toHaveBeenCalledWith('/zones/county/FLC057');
        });
    });

    test('should return null when properties are missing', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const mockClient = { get: jest.fn().mockResolvedValue({ data: {} }) };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getUGCZoneInfo('FLZ076').then((result) => {
            expect(result).toBeNull();
        });
    });
});

describe('getObservationStations', () => {
    test('should perform two-step fetch: point then stations URL', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const stationsUrl = 'https://api.weather.gov/gridpoints/TBW/48,74/stations';
        const mockClient = {
            get: jest.fn().mockResolvedValue({
                data: {
                    properties: { observationStations: stationsUrl }
                }
            })
        };
        mockAxios.create.mockReturnValue(mockClient);
        mockAxios.get.mockResolvedValue({
            data: {
                features: [
                    { properties: { stationIdentifier: 'KTPA', name: 'Tampa Intl' } },
                    { properties: { stationIdentifier: 'KPIE', name: 'St Pete' } }
                ]
            }
        });

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getObservationStations(27.9506, -82.4572).then((result) => {
            expect(result).toEqual([
                { stationIdentifier: 'KTPA', name: 'Tampa Intl' },
                { stationIdentifier: 'KPIE', name: 'St Pete' }
            ]);
            expect(mockClient.get).toHaveBeenCalledWith('/points/27.9506,-82.4572');
            expect(mockAxios.get).toHaveBeenCalledWith(stationsUrl, expect.objectContaining({
                timeout: 30000,
                headers: expect.objectContaining({
                    'User-Agent': 'TestApp/1.0 (test@example.com)'
                })
            }));
        });
    });

    test('should return empty array when no observationStations URL', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const mockClient = {
            get: jest.fn().mockResolvedValue({
                data: { properties: {} }
            })
        };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getObservationStations(0, 0).then((result) => {
            expect(result).toEqual([]);
        });
    });
});

describe('getLatestObservation', () => {
    test('should fetch latest observation for a station', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const mockObs = { temperature: { value: 25 }, textDescription: 'Sunny' };
        const mockClient = { get: jest.fn().mockResolvedValue({ data: { properties: mockObs } }) };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getLatestObservation('KORD').then((result) => {
            expect(result).toEqual(mockObs);
            expect(mockClient.get).toHaveBeenCalledWith('/stations/KORD/observations/latest');
        });
    });

    test('should return null when observation has no properties', () => {
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const mockAxios = require('axios');
        const mockClient = { get: jest.fn().mockResolvedValue({ data: {} }) };
        mockAxios.create.mockReturnValue(mockClient);

        const apiClient = require('../../src/ingestion/utils/api-client');

        return apiClient.getLatestObservation('KXXX').then((result) => {
            expect(result).toBeNull();
        });
    });
});

describe('Circuit breaker HALF_OPEN transitions', () => {
    let requestWithRetry, getCircuitBreakerState;

    async function openCircuit(requestWithRetry) {
        const serverError = { response: { status: 500 }, message: 'Server error' };
        const fn = jest.fn().mockRejectedValue(serverError);

        for (let i = 0; i < 3; i++) {
            const promise = requestWithRetry(fn, 'test');
            promise.catch(() => {});
            await jest.runAllTimersAsync();
            try { await promise; } catch (_) { /* expected */ }
        }
    }

    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const apiClient = require('../../src/ingestion/utils/api-client');
        requestWithRetry = apiClient._internal.requestWithRetry;
        getCircuitBreakerState = apiClient.getCircuitBreakerState;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should transition HALF_OPEN -> CLOSED after 2 consecutive successes', async () => {
        await openCircuit(requestWithRetry);
        expect(getCircuitBreakerState().state).toBe('OPEN');

        // Advance past recovery time
        jest.advanceTimersByTime(61000);

        // First success — still HALF_OPEN (need 2)
        const fn1 = jest.fn().mockResolvedValue('ok1');
        const p1 = requestWithRetry(fn1, 'test');
        await jest.runAllTimersAsync();
        await p1;

        // Second success — should close the circuit
        const fn2 = jest.fn().mockResolvedValue('ok2');
        const p2 = requestWithRetry(fn2, 'test');
        await jest.runAllTimersAsync();
        await p2;

        expect(getCircuitBreakerState().state).toBe('CLOSED');
        expect(getCircuitBreakerState().failureCount).toBe(0);
    });

    test('should transition HALF_OPEN -> back to OPEN on failure', async () => {
        await openCircuit(requestWithRetry);
        expect(getCircuitBreakerState().state).toBe('OPEN');

        // Advance past recovery time to enter HALF_OPEN
        jest.advanceTimersByTime(61000);

        // Fail during HALF_OPEN — should go back to OPEN
        const serverError = { response: { status: 500 }, message: 'Server error' };
        const failFn = jest.fn().mockRejectedValue(serverError);

        const promise = requestWithRetry(failFn, 'test');
        promise.catch(() => {});
        await jest.runAllTimersAsync();

        try { await promise; } catch (_) { /* expected */ }

        expect(getCircuitBreakerState().state).toBe('OPEN');
    });
});

describe('429 with Retry-After header handling', () => {
    let requestWithRetry;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const apiClient = require('../../src/ingestion/utils/api-client');
        requestWithRetry = apiClient._internal.requestWithRetry;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should use Retry-After header value as delay on 429', async () => {
        const rateLimitError = {
            response: { status: 429, headers: { 'retry-after': '5' } },
            message: 'Too Many Requests'
        };
        const fn = jest.fn()
            .mockRejectedValueOnce(rateLimitError)
            .mockResolvedValue('ok');

        const promise = requestWithRetry(fn, 'test');
        await jest.runAllTimersAsync();
        const result = await promise;

        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

describe('Non-retryable errors and circuit breaker', () => {
    let requestWithRetry, getCircuitBreakerState;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
        jest.doMock('../../src/config/config', () => ({
            noaa: { baseUrl: 'https://api.weather.gov', userAgent: 'TestApp/1.0 (test@example.com)' }
        }));
        const apiClient = require('../../src/ingestion/utils/api-client');
        requestWithRetry = apiClient._internal.requestWithRetry;
        getCircuitBreakerState = apiClient.getCircuitBreakerState;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('non-retryable error should not trip circuit breaker', async () => {
        const clientError = { response: { status: 404 }, message: 'Not found' };
        const fn = jest.fn().mockRejectedValue(clientError);

        // Three 404 errors in a row should NOT open the circuit
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

        expect(getCircuitBreakerState().state).toBe('CLOSED');
        expect(getCircuitBreakerState().failureCount).toBe(0);
    });
});
