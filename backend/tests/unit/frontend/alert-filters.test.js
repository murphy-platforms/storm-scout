/** @jest-environment jsdom */

/**
 * Unit tests for frontend/js/alert-filters.js
 * Filter logic, preset matching, localStorage handling
 */

// AlertFilters expects API_BASE_URL as a global
global.API_BASE_URL = 'api';

const AlertFilters = require('../../../../frontend/js/alert-filters');

// ---------------------------------------------------------------------------
// Mock filter configs (simulates what /api/filters returns)
// ---------------------------------------------------------------------------
const MOCK_FILTER_CONFIGS = {
  CUSTOM: {
    name: 'Office Default',
    includeCategories: ['CRITICAL', 'HIGH'],
    excludeTypes: ['Storm Surge Watch']
  },
  EXECUTIVE: {
    name: 'Executive Summary',
    includeCategories: ['CRITICAL'],
    excludeTypes: []
  }
};

const MOCK_ALERT_TYPES = {
  CRITICAL: ['Tornado Warning', 'Flash Flood Warning'],
  HIGH: ['Winter Storm Warning', 'Storm Surge Watch'],
  MODERATE: ['Wind Advisory'],
  LOW: ['Rip Current Statement'],
  INFO: ['Special Weather Statement']
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setupFilters(presetName = 'CUSTOM') {
  AlertFilters.filterConfigs = MOCK_FILTER_CONFIGS;
  AlertFilters.alertTypesByLevel = MOCK_ALERT_TYPES;
  AlertFilters.userFilters = null;
  AlertFilters.applyPreset(presetName);
}

// ---------------------------------------------------------------------------
// applyPreset
// ---------------------------------------------------------------------------
describe('applyPreset', () => {
  test('enables types from included categories', () => {
    setupFilters('CUSTOM');

    expect(AlertFilters.userFilters['Tornado Warning']).toBe(true);
    expect(AlertFilters.userFilters['Flash Flood Warning']).toBe(true);
    expect(AlertFilters.userFilters['Winter Storm Warning']).toBe(true);
  });

  test('excludes types in excludeTypes list', () => {
    setupFilters('CUSTOM');
    expect(AlertFilters.userFilters['Storm Surge Watch']).toBeUndefined();
  });

  test('does not enable types from excluded categories', () => {
    setupFilters('CUSTOM');
    expect(AlertFilters.userFilters['Wind Advisory']).toBeUndefined();
    expect(AlertFilters.userFilters['Rip Current Statement']).toBeUndefined();
  });

  test('EXECUTIVE preset only includes CRITICAL', () => {
    setupFilters('EXECUTIVE');
    expect(AlertFilters.userFilters['Tornado Warning']).toBe(true);
    expect(AlertFilters.userFilters['Flash Flood Warning']).toBe(true);
    expect(AlertFilters.userFilters['Winter Storm Warning']).toBeUndefined();
  });

  test('does nothing for unknown preset', () => {
    AlertFilters.userFilters = { existing: true };
    AlertFilters.filterConfigs = MOCK_FILTER_CONFIGS;
    AlertFilters.applyPreset('NONEXISTENT');
    expect(AlertFilters.userFilters).toEqual({ existing: true });
  });
});

// ---------------------------------------------------------------------------
// shouldIncludeAlertType
// ---------------------------------------------------------------------------
describe('shouldIncludeAlertType', () => {
  beforeEach(() => setupFilters('CUSTOM'));

  test('returns true for included type', () => {
    expect(AlertFilters.shouldIncludeAlertType('Tornado Warning')).toBe(true);
  });

  test('returns false for excluded type', () => {
    expect(AlertFilters.shouldIncludeAlertType('Storm Surge Watch')).toBe(false);
  });

  test('returns false for type outside included categories', () => {
    expect(AlertFilters.shouldIncludeAlertType('Rip Current Statement')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterAdvisories
// ---------------------------------------------------------------------------
describe('filterAdvisories', () => {
  beforeEach(() => setupFilters('CUSTOM'));

  test('keeps advisories matching enabled types', () => {
    const advisories = [
      { advisory_type: 'Tornado Warning' },
      { advisory_type: 'Wind Advisory' },
      { advisory_type: 'Flash Flood Warning' }
    ];

    const result = AlertFilters.filterAdvisories(advisories);
    expect(result).toHaveLength(2);
    expect(result.map(a => a.advisory_type)).toEqual([
      'Tornado Warning', 'Flash Flood Warning'
    ]);
  });

  test('returns empty array when nothing matches', () => {
    const advisories = [{ advisory_type: 'Rip Current Statement' }];
    expect(AlertFilters.filterAdvisories(advisories)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getEnabledCount / getTotalAlertTypes
// ---------------------------------------------------------------------------
describe('getEnabledCount', () => {
  test('counts only true values', () => {
    setupFilters('CUSTOM');
    // CUSTOM includes CRITICAL (2) + HIGH (2) minus 1 excluded = 3
    expect(AlertFilters.getEnabledCount()).toBe(3);
  });
});

describe('getTotalAlertTypes', () => {
  test('sums types across all levels', () => {
    AlertFilters.alertTypesByLevel = MOCK_ALERT_TYPES;
    // 2 + 2 + 1 + 1 + 1 = 7
    expect(AlertFilters.getTotalAlertTypes()).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// isFullView / hasActiveFilters
// ---------------------------------------------------------------------------
describe('isFullView / hasActiveFilters', () => {
  test('isFullView returns false when not all types enabled', () => {
    setupFilters('CUSTOM');
    expect(AlertFilters.isFullView()).toBe(false);
    expect(AlertFilters.hasActiveFilters()).toBe(true);
  });

  test('isFullView returns true when all types enabled', () => {
    AlertFilters.alertTypesByLevel = MOCK_ALERT_TYPES;
    AlertFilters.userFilters = {};
    // Enable every type
    for (const types of Object.values(MOCK_ALERT_TYPES)) {
      types.forEach(t => { AlertFilters.userFilters[t] = true; });
    }
    expect(AlertFilters.isFullView()).toBe(true);
    expect(AlertFilters.hasActiveFilters()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchesPreset
// ---------------------------------------------------------------------------
describe('matchesPreset', () => {
  test('matches when filters equal preset', () => {
    setupFilters('EXECUTIVE');
    expect(AlertFilters.matchesPreset('EXECUTIVE')).toBe(true);
  });

  test('does not match different preset', () => {
    setupFilters('CUSTOM');
    expect(AlertFilters.matchesPreset('EXECUTIVE')).toBe(false);
  });

  test('returns false for unknown preset', () => {
    setupFilters('CUSTOM');
    expect(AlertFilters.matchesPreset('NONEXISTENT')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadUserPreferences
// ---------------------------------------------------------------------------
describe('loadUserPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    AlertFilters.filterConfigs = MOCK_FILTER_CONFIGS;
    AlertFilters.alertTypesByLevel = MOCK_ALERT_TYPES;
    AlertFilters.userFilters = null;
  });

  test('loads saved preferences from localStorage', () => {
    const saved = { 'Tornado Warning': true, 'Wind Advisory': true };
    localStorage.setItem(AlertFilters.STORAGE_KEY, JSON.stringify(saved));

    AlertFilters.loadUserPreferences();
    expect(AlertFilters.userFilters).toEqual(saved);
  });

  test('falls back to default preset when localStorage is empty', () => {
    AlertFilters.loadUserPreferences();
    expect(AlertFilters.userFilters).toBeTruthy();
    expect(AlertFilters.userFilters['Tornado Warning']).toBe(true);
  });

  test('falls back to default on corrupt JSON', () => {
    localStorage.setItem(AlertFilters.STORAGE_KEY, 'NOT_JSON{{{');

    AlertFilters.loadUserPreferences();
    expect(AlertFilters.userFilters).toBeTruthy();
    expect(AlertFilters.userFilters['Tornado Warning']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getFilterStatus
// ---------------------------------------------------------------------------
describe('getFilterStatus', () => {
  test('returns preset name when filters match', () => {
    setupFilters('EXECUTIVE');
    expect(AlertFilters.getFilterStatus()).toBe('Executive Summary');
  });

  test('returns Custom when no preset matches', () => {
    setupFilters('CUSTOM');
    // Add an extra type to break the match
    AlertFilters.userFilters['Extra Type'] = true;
    expect(AlertFilters.getFilterStatus()).toBe('Custom');
  });
});
