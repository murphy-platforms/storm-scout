/** @jest-environment jsdom */

/**
 * Unit tests for frontend/js/export.js
 * CSV generation, date formatting, shareable links
 */

// Provide escapeHtml globally (export.js uses it for report generation)
const { escapeHtml } = require('./utils');
global.escapeHtml = escapeHtml;

const StormScoutExport = require('./export');

// ---------------------------------------------------------------------------
// escapeCSV
// ---------------------------------------------------------------------------
describe('escapeCSV', () => {
    test('returns plain text unchanged', () => {
        expect(StormScoutExport.escapeCSV('hello')).toBe('hello');
    });

    test('wraps text with commas in quotes', () => {
        expect(StormScoutExport.escapeCSV('hello, world')).toBe('"hello, world"');
    });

    test('doubles internal quotes and wraps', () => {
        expect(StormScoutExport.escapeCSV('say "hi"')).toBe('"say ""hi"""');
    });

    test('wraps text with newlines in quotes', () => {
        expect(StormScoutExport.escapeCSV('line1\nline2')).toBe('"line1\nline2"');
    });

    test('returns empty string for null', () => {
        expect(StormScoutExport.escapeCSV(null)).toBe('');
    });

    test('returns empty string for undefined', () => {
        expect(StormScoutExport.escapeCSV(undefined)).toBe('');
    });

    test('converts numbers to string', () => {
        expect(StormScoutExport.escapeCSV(42)).toBe('42');
    });
});

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------
describe('formatDateTime', () => {
    test('returns empty string for null', () => {
        expect(StormScoutExport.formatDateTime(null)).toBe('');
    });

    test('returns empty string for empty string', () => {
        expect(StormScoutExport.formatDateTime('')).toBe('');
    });

    test('formats valid ISO date', () => {
        const result = StormScoutExport.formatDateTime('2026-03-15T12:00:00Z');
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// exportOfficesToCSV
// ---------------------------------------------------------------------------
describe('exportOfficesToCSV', () => {
    test('calls downloadCSV with correct headers', () => {
        const spy = jest.spyOn(StormScoutExport, 'downloadCSV').mockImplementation(() => {});

        StormScoutExport.exportOfficesToCSV([
            {
                office_code: '10001',
                name: 'Test Office',
                city: 'Dallas',
                state: 'TX',
                highest_severity: 'Severe',
                advisory_count: 3,
                new_count: 1,
                operational_status: 'At Risk',
                weather_impact_level: 'HIGH'
            }
        ]);

        expect(spy).toHaveBeenCalledTimes(1);
        const [headers, rows, filename] = spy.mock.calls[0];
        expect(headers).toContain('Office Code');
        expect(headers).toContain('Highest Severity');
        expect(rows).toHaveLength(1);
        expect(rows[0][0]).toBe('10001');
        expect(filename).toBe('storm-scout-offices');

        spy.mockRestore();
    });
});

describe('exportAdvisoriesToCSV', () => {
    test('calls downloadCSV with correct headers and row data', () => {
        const spy = jest.spyOn(StormScoutExport, 'downloadCSV').mockImplementation(() => {});

        StormScoutExport.exportAdvisoriesToCSV([
            {
                office_code: '10001',
                office_name: 'Test',
                city: 'Dallas',
                state: 'TX',
                advisory_type: 'Tornado Warning',
                severity: 'Extreme',
                vtec_action: 'NEW',
                start_time: '2026-03-15T12:00:00Z',
                end_time: '2026-03-15T18:00:00Z',
                source: 'NWS-OKX'
            }
        ]);

        expect(spy).toHaveBeenCalledTimes(1);
        const [headers, rows] = spy.mock.calls[0];
        expect(headers).toContain('Advisory Type');
        expect(headers).toContain('Severity');
        expect(rows[0][4]).toBe('Tornado Warning');

        spy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// generateShareableLink
// ---------------------------------------------------------------------------
describe('generateShareableLink', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('includes preset param when not CUSTOM', () => {
        localStorage.setItem('selectedFilterPreset', 'EXECUTIVE');
        const link = StormScoutExport.generateShareableLink();
        expect(link).toContain('preset=EXECUTIVE');
    });

    test('returns URL without params when no filters set', () => {
        // No preset or custom filters stored — default is CUSTOM, which adds no param
        const link = StormScoutExport.generateShareableLink();
        expect(link).not.toContain('?');
    });

    test('encodes custom filters as base64', () => {
        localStorage.setItem('selectedFilterPreset', 'CUSTOM');
        localStorage.setItem('customFilters', JSON.stringify({ 'Tornado Warning': true }));
        const link = StormScoutExport.generateShareableLink();
        expect(link).toContain('filters=');
    });
});
