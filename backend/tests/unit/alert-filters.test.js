/**
 * Unit tests for alert type taxonomy and filter presets
 * Validates NOAA_ALERT_TYPES categories and DEFAULT_FILTERS configuration
 */

const {
  NOAA_ALERT_TYPES,
  DEFAULT_FILTERS,
  getImpactLevel,
  shouldIncludeAlert,
  getAlertTypesByLevel,
  getFilterConfig,
  getAllFilters
} = require('../../src/config/noaa-alert-types');

describe('NOAA Alert Type Taxonomy', () => {
  test('should have 5 impact categories', () => {
    const categories = Object.keys(NOAA_ALERT_TYPES);
    expect(categories).toEqual(['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'INFO']);
  });

  test('should have expected type counts per category', () => {
    expect(NOAA_ALERT_TYPES.CRITICAL).toHaveLength(13);
    expect(NOAA_ALERT_TYPES.HIGH).toHaveLength(18);
    expect(NOAA_ALERT_TYPES.MODERATE).toHaveLength(24);
    expect(NOAA_ALERT_TYPES.LOW).toHaveLength(23);
    expect(NOAA_ALERT_TYPES.INFO).toHaveLength(18);
  });

  test('should have no duplicate types across categories', () => {
    const allTypes = Object.values(NOAA_ALERT_TYPES).flat();
    const uniqueTypes = new Set(allTypes);
    expect(allTypes.length).toBe(uniqueTypes.size);
  });

  test('should include operationally critical types', () => {
    expect(NOAA_ALERT_TYPES.CRITICAL).toContain('Tornado Warning');
    expect(NOAA_ALERT_TYPES.CRITICAL).toContain('Flash Flood Warning');
    expect(NOAA_ALERT_TYPES.CRITICAL).toContain('Blizzard Warning');
    expect(NOAA_ALERT_TYPES.CRITICAL).toContain('Snow Squall Warning');
    expect(NOAA_ALERT_TYPES.HIGH).toContain('Storm Surge Watch');
    expect(NOAA_ALERT_TYPES.HIGH).toContain('Flash Flood Watch');
    expect(NOAA_ALERT_TYPES.MODERATE).toContain('Extreme Cold Watch');
    expect(NOAA_ALERT_TYPES.MODERATE).toContain('Lake Wind Advisory');
  });

  test('should categorize Coastal Flood Statement in LOW', () => {
    expect(NOAA_ALERT_TYPES.LOW).toContain('Coastal Flood Statement');
  });
});

describe('getImpactLevel', () => {
  test('should return correct level for known types', () => {
    expect(getImpactLevel('Tornado Warning')).toBe('CRITICAL');
    expect(getImpactLevel('Winter Storm Warning')).toBe('HIGH');
    expect(getImpactLevel('Winter Weather Advisory')).toBe('MODERATE');
    expect(getImpactLevel('Rip Current Statement')).toBe('LOW');
    expect(getImpactLevel('Special Weather Statement')).toBe('INFO');
  });

  test('should return null for unknown types', () => {
    expect(getImpactLevel('Made Up Alert')).toBeNull();
  });
});

describe('CUSTOM (Office Default) Filter', () => {
  const custom = DEFAULT_FILTERS.CUSTOM;

  test('should include CRITICAL, HIGH, MODERATE categories', () => {
    expect(custom.includeCategories).toEqual(['CRITICAL', 'HIGH', 'MODERATE']);
  });

  test('should enable ALL CRITICAL types (no CRITICAL exclusions)', () => {
    const criticalExcluded = custom.excludeTypes.filter(
      t => NOAA_ALERT_TYPES.CRITICAL.includes(t)
    );
    expect(criticalExcluded).toHaveLength(0);
  });

  test('should enable ALL HIGH types (no HIGH exclusions)', () => {
    const highExcluded = custom.excludeTypes.filter(
      t => NOAA_ALERT_TYPES.HIGH.includes(t)
    );
    expect(highExcluded).toHaveLength(0);
  });

  test('should exclude only coastal/lakeshore/surf MODERATE types', () => {
    const expectedExclusions = [
      'Blowing Dust Advisory',
      'High Surf Warning',
      'Coastal Flood Warning',
      'Coastal Flood Watch',
      'Lakeshore Flood Warning',
      'Lakeshore Flood Watch'
    ];
    expect(custom.excludeTypes.sort()).toEqual(expectedExclusions.sort());
  });

  test('should enable key MODERATE types for land operations', () => {
    const landTypes = [
      'Winter Weather Advisory', 'Wind Advisory', 'Heat Advisory',
      'Dense Fog Advisory', 'Flood Watch', 'Freeze Warning',
      'Frost Advisory', 'Winter Storm Watch', 'High Wind Watch',
      'Excessive Heat Watch', 'Hard Freeze Warning', 'Freeze Watch',
      'Lake Effect Snow Warning', 'Lake Effect Snow Watch',
      'Tropical Storm Watch', 'Extreme Cold Watch', 'Lake Wind Advisory'
    ];
    landTypes.forEach(type => {
      expect(shouldIncludeAlert(type, 'CUSTOM')).toBe(true);
    });
  });

  test('should exclude LOW and INFO types via category', () => {
    expect(shouldIncludeAlert('Rip Current Statement', 'CUSTOM')).toBe(false);
    expect(shouldIncludeAlert('Special Weather Statement', 'CUSTOM')).toBe(false);
    expect(shouldIncludeAlert('Small Craft Advisory', 'CUSTOM')).toBe(false);
  });

  test('should result in 47 total enabled types', () => {
    let enabledCount = 0;
    for (const [level, types] of Object.entries(NOAA_ALERT_TYPES)) {
      if (custom.includeCategories.includes(level)) {
        types.forEach(type => {
          if (!custom.excludeTypes.includes(type)) {
            enabledCount++;
          }
        });
      }
    }
    expect(enabledCount).toBe(49);
  });
});

describe('Other Filter Presets', () => {
  test('should have 5 presets', () => {
    const presets = Object.keys(getAllFilters());
    expect(presets).toEqual(['CUSTOM', 'OPERATIONS', 'EXECUTIVE', 'SAFETY', 'FULL']);
  });

  test('OPERATIONS should include all CRITICAL, HIGH, MODERATE except marine/special weather', () => {
    expect(shouldIncludeAlert('Tornado Warning', 'OPERATIONS')).toBe(true);
    expect(shouldIncludeAlert('Winter Weather Advisory', 'OPERATIONS')).toBe(true);
    expect(shouldIncludeAlert('Special Weather Statement', 'OPERATIONS')).toBe(false);
    expect(shouldIncludeAlert('Marine Weather Statement', 'OPERATIONS')).toBe(false);
  });

  test('EXECUTIVE should only include CRITICAL types', () => {
    expect(shouldIncludeAlert('Tornado Warning', 'EXECUTIVE')).toBe(true);
    expect(shouldIncludeAlert('Winter Storm Warning', 'EXECUTIVE')).toBe(false);
    expect(shouldIncludeAlert('Winter Weather Advisory', 'EXECUTIVE')).toBe(false);
  });

  test('SAFETY should include CRITICAL through LOW', () => {
    expect(shouldIncludeAlert('Tornado Warning', 'SAFETY')).toBe(true);
    expect(shouldIncludeAlert('Flood Advisory', 'SAFETY')).toBe(true);
    expect(shouldIncludeAlert('Special Weather Statement', 'SAFETY')).toBe(false);
  });

  test('FULL should include nearly everything', () => {
    expect(shouldIncludeAlert('Tornado Warning', 'FULL')).toBe(true);
    expect(shouldIncludeAlert('Special Weather Statement', 'FULL')).toBe(true);
    expect(shouldIncludeAlert('Test', 'FULL')).toBe(false);
  });
});
