/** @jest-environment jsdom */

/**
 * Unit tests for frontend/js/location-filters.js
 * Location filter logic, state-level toggles, localStorage handling,
 * advisory filtering by location, and reconciliation of new offices.
 */

// LocationFilters expects API_BASE_URL as a global
global.API_BASE_URL = 'api';

const LocationFilters = require('./location-filters');

// ---------------------------------------------------------------------------
// Mock office data (simulates what /api/offices returns)
// ---------------------------------------------------------------------------
const MOCK_OFFICES = [
    { id: 1, name: 'Downtown Baltimore', city: 'Baltimore', state: 'MD', office_code: '21201' },
    { id: 2, name: 'Annapolis Office', city: 'Annapolis', state: 'MD', office_code: '21401' },
    { id: 3, name: 'Manhattan HQ', city: 'New York', state: 'NY', office_code: '10001' },
    { id: 4, name: 'Brooklyn Office', city: 'Brooklyn', state: 'NY', office_code: '11201' },
    { id: 5, name: 'Miami Beach', city: 'Miami', state: 'FL', office_code: '33139' }
];

const MOCK_ADVISORIES = [
    { office_id: 1, advisory_type: 'Tornado Warning', severity: 'Extreme' },
    { office_id: 1, advisory_type: 'Flood Warning', severity: 'Severe' },
    { office_id: 2, advisory_type: 'Wind Advisory', severity: 'Moderate' },
    { office_id: 3, advisory_type: 'Winter Storm Warning', severity: 'Severe' },
    { office_id: 5, advisory_type: 'Hurricane Warning', severity: 'Extreme' }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setupFilters(allEnabled = true) {
    LocationFilters.allOffices = [...MOCK_OFFICES];
    LocationFilters.userFilters = null;
    if (allEnabled) {
        LocationFilters.enableAll();
    } else {
        LocationFilters.disableAll();
    }
}

// ---------------------------------------------------------------------------
// enableAll / disableAll
// ---------------------------------------------------------------------------
describe('enableAll', () => {
    test('enables every office', () => {
        setupFilters(true);
        expect(LocationFilters.userFilters['1']).toBe(true);
        expect(LocationFilters.userFilters['2']).toBe(true);
        expect(LocationFilters.userFilters['3']).toBe(true);
        expect(LocationFilters.userFilters['4']).toBe(true);
        expect(LocationFilters.userFilters['5']).toBe(true);
    });
});

describe('disableAll', () => {
    test('disables every office', () => {
        setupFilters(false);
        expect(LocationFilters.userFilters['1']).toBe(false);
        expect(LocationFilters.userFilters['2']).toBe(false);
        expect(LocationFilters.userFilters['5']).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// toggleOffice
// ---------------------------------------------------------------------------
describe('toggleOffice', () => {
    beforeEach(() => setupFilters(true));

    test('toggles enabled office to disabled', () => {
        LocationFilters.toggleOffice(1);
        expect(LocationFilters.userFilters['1']).toBe(false);
    });

    test('toggles disabled office to enabled', () => {
        LocationFilters.userFilters['1'] = false;
        LocationFilters.toggleOffice(1);
        expect(LocationFilters.userFilters['1']).toBe(true);
    });

    test('sets explicit enabled value', () => {
        LocationFilters.toggleOffice(1, false);
        expect(LocationFilters.userFilters['1']).toBe(false);
    });

    test('sets explicit disabled value', () => {
        LocationFilters.userFilters['1'] = false;
        LocationFilters.toggleOffice(1, true);
        expect(LocationFilters.userFilters['1']).toBe(true);
    });

    test('works with string office ID', () => {
        LocationFilters.toggleOffice('3', false);
        expect(LocationFilters.userFilters['3']).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// enableByState / disableByState
// ---------------------------------------------------------------------------
describe('enableByState', () => {
    beforeEach(() => setupFilters(false));

    test('enables all offices in the given state', () => {
        LocationFilters.enableByState('MD');
        expect(LocationFilters.userFilters['1']).toBe(true);
        expect(LocationFilters.userFilters['2']).toBe(true);
    });

    test('does not affect offices in other states', () => {
        LocationFilters.enableByState('MD');
        expect(LocationFilters.userFilters['3']).toBe(false);
        expect(LocationFilters.userFilters['5']).toBe(false);
    });
});

describe('disableByState', () => {
    beforeEach(() => setupFilters(true));

    test('disables all offices in the given state', () => {
        LocationFilters.disableByState('NY');
        expect(LocationFilters.userFilters['3']).toBe(false);
        expect(LocationFilters.userFilters['4']).toBe(false);
    });

    test('does not affect offices in other states', () => {
        LocationFilters.disableByState('NY');
        expect(LocationFilters.userFilters['1']).toBe(true);
        expect(LocationFilters.userFilters['2']).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// shouldIncludeOffice
// ---------------------------------------------------------------------------
describe('shouldIncludeOffice', () => {
    beforeEach(() => setupFilters(true));

    test('returns true for enabled office', () => {
        expect(LocationFilters.shouldIncludeOffice(1)).toBe(true);
    });

    test('returns false for disabled office', () => {
        LocationFilters.userFilters['1'] = false;
        expect(LocationFilters.shouldIncludeOffice(1)).toBe(false);
    });

    test('returns false for unknown office', () => {
        expect(LocationFilters.shouldIncludeOffice(999)).toBe(false);
    });

    test('works with string office ID', () => {
        expect(LocationFilters.shouldIncludeOffice('3')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// filterOffices
// ---------------------------------------------------------------------------
describe('filterOffices', () => {
    beforeEach(() => setupFilters(true));

    test('returns all offices when all enabled', () => {
        const result = LocationFilters.filterOffices(MOCK_OFFICES);
        expect(result).toHaveLength(5);
    });

    test('excludes disabled offices', () => {
        LocationFilters.userFilters['3'] = false;
        LocationFilters.userFilters['4'] = false;
        const result = LocationFilters.filterOffices(MOCK_OFFICES);
        expect(result).toHaveLength(3);
        expect(result.map((o) => o.id)).toEqual([1, 2, 5]);
    });

    test('returns empty array when all disabled', () => {
        setupFilters(false);
        const result = LocationFilters.filterOffices(MOCK_OFFICES);
        expect(result).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// filterAdvisoriesByLocation
// ---------------------------------------------------------------------------
describe('filterAdvisoriesByLocation', () => {
    beforeEach(() => setupFilters(true));

    test('keeps all advisories when all locations enabled', () => {
        const result = LocationFilters.filterAdvisoriesByLocation(MOCK_ADVISORIES);
        expect(result).toHaveLength(5);
    });

    test('drops advisories from disabled locations', () => {
        LocationFilters.userFilters['1'] = false;
        const result = LocationFilters.filterAdvisoriesByLocation(MOCK_ADVISORIES);
        expect(result).toHaveLength(3);
        // Office 1 had 2 advisories — both removed
        expect(result.every((a) => a.office_id !== 1)).toBe(true);
    });

    test('returns empty when all locations disabled', () => {
        setupFilters(false);
        const result = LocationFilters.filterAdvisoriesByLocation(MOCK_ADVISORIES);
        expect(result).toHaveLength(0);
    });

    test('keeps advisories only from enabled locations', () => {
        setupFilters(false);
        LocationFilters.userFilters['5'] = true;
        const result = LocationFilters.filterAdvisoriesByLocation(MOCK_ADVISORIES);
        expect(result).toHaveLength(1);
        expect(result[0].office_id).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// getEnabledCount / getTotalCount
// ---------------------------------------------------------------------------
describe('getEnabledCount', () => {
    test('counts only true values', () => {
        setupFilters(true);
        LocationFilters.userFilters['1'] = false;
        expect(LocationFilters.getEnabledCount()).toBe(4);
    });

    test('returns 0 when all disabled', () => {
        setupFilters(false);
        expect(LocationFilters.getEnabledCount()).toBe(0);
    });

    test('returns total when all enabled', () => {
        setupFilters(true);
        expect(LocationFilters.getEnabledCount()).toBe(5);
    });
});

describe('getTotalCount', () => {
    test('returns total office count', () => {
        LocationFilters.allOffices = MOCK_OFFICES;
        expect(LocationFilters.getTotalCount()).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// hasActiveFilters / isFullView
// ---------------------------------------------------------------------------
describe('hasActiveFilters / isFullView', () => {
    test('hasActiveFilters returns false when all enabled', () => {
        setupFilters(true);
        expect(LocationFilters.hasActiveFilters()).toBe(false);
        expect(LocationFilters.isFullView()).toBe(true);
    });

    test('hasActiveFilters returns true when some disabled', () => {
        setupFilters(true);
        LocationFilters.userFilters['1'] = false;
        expect(LocationFilters.hasActiveFilters()).toBe(true);
        expect(LocationFilters.isFullView()).toBe(false);
    });

    test('hasActiveFilters returns true when all disabled', () => {
        setupFilters(false);
        expect(LocationFilters.hasActiveFilters()).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// getFilterStatus
// ---------------------------------------------------------------------------
describe('getFilterStatus', () => {
    test('returns "All Locations" when all enabled', () => {
        setupFilters(true);
        expect(LocationFilters.getFilterStatus()).toBe('All Locations');
    });

    test('returns "No Locations" when all disabled', () => {
        setupFilters(false);
        expect(LocationFilters.getFilterStatus()).toBe('No Locations');
    });

    test('returns "N of M" when partially enabled', () => {
        setupFilters(true);
        LocationFilters.userFilters['1'] = false;
        expect(LocationFilters.getFilterStatus()).toBe('4 of 5');
    });
});

// ---------------------------------------------------------------------------
// getStates / getOfficesByState / getStateCount
// ---------------------------------------------------------------------------
describe('getStates', () => {
    test('returns sorted unique state codes', () => {
        LocationFilters.allOffices = MOCK_OFFICES;
        expect(LocationFilters.getStates()).toEqual(['FL', 'MD', 'NY']);
    });
});

describe('getOfficesByState', () => {
    test('groups offices by state', () => {
        LocationFilters.allOffices = MOCK_OFFICES;
        const grouped = LocationFilters.getOfficesByState();
        expect(Object.keys(grouped).sort()).toEqual(['FL', 'MD', 'NY']);
        expect(grouped['MD']).toHaveLength(2);
        expect(grouped['NY']).toHaveLength(2);
        expect(grouped['FL']).toHaveLength(1);
    });

    test('sorts offices by name within each state', () => {
        LocationFilters.allOffices = MOCK_OFFICES;
        const grouped = LocationFilters.getOfficesByState();
        expect(grouped['MD'][0].name).toBe('Annapolis Office');
        expect(grouped['MD'][1].name).toBe('Downtown Baltimore');
    });
});

describe('getStateCount', () => {
    beforeEach(() => setupFilters(true));

    test('returns correct counts for fully enabled state', () => {
        const result = LocationFilters.getStateCount('MD');
        expect(result).toEqual({ enabled: 2, total: 2 });
    });

    test('returns correct counts for partially enabled state', () => {
        LocationFilters.userFilters['1'] = false;
        const result = LocationFilters.getStateCount('MD');
        expect(result).toEqual({ enabled: 1, total: 2 });
    });

    test('returns correct counts for fully disabled state', () => {
        LocationFilters.disableByState('NY');
        const result = LocationFilters.getStateCount('NY');
        expect(result).toEqual({ enabled: 0, total: 2 });
    });
});

// ---------------------------------------------------------------------------
// _reconcileNewOffices
// ---------------------------------------------------------------------------
describe('_reconcileNewOffices', () => {
    test('enables offices not in saved preferences', () => {
        LocationFilters.allOffices = MOCK_OFFICES;
        // Simulate saved prefs with only 3 offices (2 new added)
        LocationFilters.userFilters = {
            1: true,
            2: false,
            3: true
        };
        LocationFilters._reconcileNewOffices();
        // Office 4 and 5 are new — should be enabled
        expect(LocationFilters.userFilters['4']).toBe(true);
        expect(LocationFilters.userFilters['5']).toBe(true);
        // Existing prefs preserved
        expect(LocationFilters.userFilters['1']).toBe(true);
        expect(LocationFilters.userFilters['2']).toBe(false);
    });

    test('removes stale office IDs', () => {
        LocationFilters.allOffices = MOCK_OFFICES;
        LocationFilters.userFilters = {
            1: true,
            999: true, // no longer in dataset
            888: false // no longer in dataset
        };
        LocationFilters._reconcileNewOffices();
        expect(LocationFilters.userFilters['999']).toBeUndefined();
        expect(LocationFilters.userFilters['888']).toBeUndefined();
        expect(LocationFilters.userFilters['1']).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// loadUserPreferences (localStorage integration)
// ---------------------------------------------------------------------------
describe('loadUserPreferences', () => {
    beforeEach(() => {
        localStorage.clear();
        LocationFilters.allOffices = MOCK_OFFICES;
        LocationFilters.userFilters = null;
    });

    test('loads saved preferences from localStorage', () => {
        const saved = { 1: true, 2: false, 3: true, 4: true, 5: true };
        localStorage.setItem(LocationFilters.STORAGE_KEY, JSON.stringify(saved));

        LocationFilters.loadUserPreferences();
        expect(LocationFilters.userFilters['2']).toBe(false);
        expect(LocationFilters.userFilters['1']).toBe(true);
    });

    test('falls back to all enabled when localStorage is empty', () => {
        LocationFilters.loadUserPreferences();
        expect(LocationFilters.getEnabledCount()).toBe(5);
    });

    test('falls back to all enabled on corrupt JSON', () => {
        localStorage.setItem(LocationFilters.STORAGE_KEY, 'NOT_JSON{{{');

        LocationFilters.loadUserPreferences();
        expect(LocationFilters.getEnabledCount()).toBe(5);
    });

    test('reconciles new offices added since last save', () => {
        // Only 3 of 5 offices in saved prefs
        const saved = { 1: true, 2: false, 3: true };
        localStorage.setItem(LocationFilters.STORAGE_KEY, JSON.stringify(saved));

        LocationFilters.loadUserPreferences();
        // New offices 4 and 5 should be auto-enabled
        expect(LocationFilters.userFilters['4']).toBe(true);
        expect(LocationFilters.userFilters['5']).toBe(true);
        // Existing pref preserved
        expect(LocationFilters.userFilters['2']).toBe(false);
    });

    test('falls back to all enabled when localStorage contains an array', () => {
        localStorage.setItem(LocationFilters.STORAGE_KEY, JSON.stringify([1, 2, 3]));

        LocationFilters.loadUserPreferences();
        expect(LocationFilters.getEnabledCount()).toBe(5);
    });

    test('falls back to all enabled when localStorage contains a string', () => {
        localStorage.setItem(LocationFilters.STORAGE_KEY, JSON.stringify('not an object'));

        LocationFilters.loadUserPreferences();
        expect(LocationFilters.getEnabledCount()).toBe(5);
    });

    test('round-trip save/load preserves preferences', () => {
        setupFilters(true);
        LocationFilters.userFilters['1'] = false;
        LocationFilters.userFilters['3'] = false;

        // Save
        localStorage.setItem(LocationFilters.STORAGE_KEY, JSON.stringify(LocationFilters.userFilters));

        // Reset and reload
        LocationFilters.userFilters = null;
        LocationFilters.loadUserPreferences();

        expect(LocationFilters.userFilters['1']).toBe(false);
        expect(LocationFilters.userFilters['2']).toBe(true);
        expect(LocationFilters.userFilters['3']).toBe(false);
        expect(LocationFilters.userFilters['4']).toBe(true);
        expect(LocationFilters.userFilters['5']).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// toggleOffice with unknown IDs
// ---------------------------------------------------------------------------
describe('toggleOffice unknown ID guard', () => {
    beforeEach(() => setupFilters(true));

    test('ignores unknown office IDs', () => {
        LocationFilters.toggleOffice(999);
        expect(LocationFilters.userFilters['999']).toBeUndefined();
    });

    test('does not inflate enabled count with unknown IDs', () => {
        LocationFilters.toggleOffice(999, true);
        expect(LocationFilters.getEnabledCount()).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// Fail-open behavior
// ---------------------------------------------------------------------------
describe('fail-open when uninitialized', () => {
    test('filterAdvisoriesByLocation returns input when allOffices is empty', () => {
        LocationFilters.allOffices = [];
        LocationFilters.userFilters = null;
        const result = LocationFilters.filterAdvisoriesByLocation(MOCK_ADVISORIES);
        expect(result).toHaveLength(MOCK_ADVISORIES.length);
    });

    test('filterOffices returns input when allOffices is empty', () => {
        LocationFilters.allOffices = [];
        LocationFilters.userFilters = null;
        const result = LocationFilters.filterOffices(MOCK_OFFICES);
        expect(result).toHaveLength(MOCK_OFFICES.length);
    });
});

// ---------------------------------------------------------------------------
// filterAdvisoriesByLocation edge cases
// ---------------------------------------------------------------------------
describe('filterAdvisoriesByLocation edge cases', () => {
    beforeEach(() => setupFilters(true));

    test('drops advisories without office_id', () => {
        const advisories = [...MOCK_ADVISORIES, { advisory_type: 'Heat Advisory', severity: 'Moderate' }];
        const result = LocationFilters.filterAdvisoriesByLocation(advisories);
        // The advisory without office_id should be dropped
        expect(result).toHaveLength(MOCK_ADVISORIES.length);
    });
});
