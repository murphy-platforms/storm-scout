/**
 * Unit tests for frontend/js/aggregation.js
 * Office aggregation, multi-zone dedup, urgency scoring
 */

const OfficeAggregator = require('../../../../frontend/js/aggregation');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeAdvisory(overrides = {}) {
  return {
    id: 1,
    office_id: 100,
    office_code: '10001',
    office_name: 'Test Office',
    city: 'Testville',
    state: 'TX',
    advisory_type: 'Winter Storm Warning',
    severity: 'Severe',
    vtec_action: 'NEW',
    issued_time: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    expires: new Date(Date.now() + 3600000).toISOString(),
    source: 'NWS-OKX',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// getSeverityRank
// ---------------------------------------------------------------------------
describe('getSeverityRank', () => {
  test('ranks Extreme highest', () => {
    expect(OfficeAggregator.getSeverityRank('Extreme')).toBe(4);
  });

  test('ranks all five levels correctly', () => {
    expect(OfficeAggregator.getSeverityRank('Severe')).toBe(3);
    expect(OfficeAggregator.getSeverityRank('Moderate')).toBe(2);
    expect(OfficeAggregator.getSeverityRank('Minor')).toBe(1);
    expect(OfficeAggregator.getSeverityRank('Unknown')).toBe(0);
  });

  test('returns 0 for unrecognised severity', () => {
    expect(OfficeAggregator.getSeverityRank('Bogus')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateUrgency
// ---------------------------------------------------------------------------
describe('calculateUrgency', () => {
  test('Extreme severity scores higher than Minor', () => {
    const extreme = makeAdvisory({ severity: 'Extreme' });
    const minor = makeAdvisory({ severity: 'Minor' });
    expect(OfficeAggregator.calculateUrgency(extreme))
      .toBeGreaterThan(OfficeAggregator.calculateUrgency(minor));
  });

  test('NEW action adds bonus', () => {
    const withNew = makeAdvisory({ vtec_action: 'NEW' });
    const withCon = makeAdvisory({ vtec_action: 'CON' });
    expect(OfficeAggregator.calculateUrgency(withNew))
      .toBeGreaterThan(OfficeAggregator.calculateUrgency(withCon));
  });

  test('UPG action adds higher bonus than NEW', () => {
    const withUpg = makeAdvisory({ vtec_action: 'UPG' });
    const withNew = makeAdvisory({ vtec_action: 'NEW' });
    expect(OfficeAggregator.calculateUrgency(withUpg))
      .toBeGreaterThan(OfficeAggregator.calculateUrgency(withNew));
  });

  test('soon-expiring alert gets bonus', () => {
    const soonExpire = makeAdvisory({ expires: new Date(Date.now() + 2 * 3600000).toISOString() });
    const laterExpire = makeAdvisory({ expires: new Date(Date.now() + 12 * 3600000).toISOString() });
    expect(OfficeAggregator.calculateUrgency(soonExpire))
      .toBeGreaterThan(OfficeAggregator.calculateUrgency(laterExpire));
  });
});

// ---------------------------------------------------------------------------
// deduplicateMultiZone
// ---------------------------------------------------------------------------
describe('deduplicateMultiZone', () => {
  test('merges alerts with same office/type/severity/time', () => {
    const time = new Date().toISOString();
    const a1 = makeAdvisory({ id: 1, source: 'NWS-A', issued_time: time });
    const a2 = makeAdvisory({ id: 2, source: 'NWS-B', issued_time: time });

    const result = OfficeAggregator.deduplicateMultiZone([a1, a2]);
    expect(result).toHaveLength(1);
    expect(result[0].zone_count).toBe(2);
    expect(result[0].zones).toContain('NWS-A');
    expect(result[0].zones).toContain('NWS-B');
  });

  test('keeps alerts with different types separate', () => {
    const a1 = makeAdvisory({ advisory_type: 'Tornado Warning' });
    const a2 = makeAdvisory({ advisory_type: 'Flood Warning' });

    const result = OfficeAggregator.deduplicateMultiZone([a1, a2]);
    expect(result).toHaveLength(2);
  });

  test('keeps alerts from different offices separate', () => {
    const a1 = makeAdvisory({ office_id: 100 });
    const a2 = makeAdvisory({ office_id: 200 });

    const result = OfficeAggregator.deduplicateMultiZone([a1, a2]);
    expect(result).toHaveLength(2);
  });

  test('returns empty array for empty input', () => {
    expect(OfficeAggregator.deduplicateMultiZone([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateByOffice
// ---------------------------------------------------------------------------
describe('aggregateByOffice', () => {
  test('groups advisories by office_id', () => {
    const advisories = [
      makeAdvisory({ office_id: 1, advisory_type: 'Tornado Warning', severity: 'Extreme' }),
      makeAdvisory({ office_id: 1, advisory_type: 'Flood Warning', severity: 'Severe' }),
      makeAdvisory({ office_id: 2, advisory_type: 'Wind Advisory', severity: 'Moderate' })
    ];

    const result = OfficeAggregator.aggregateByOffice(advisories);
    expect(result).toHaveLength(2);

    const office1 = result.find(o => o.office_id === 1);
    expect(office1.unique_advisory_count).toBe(2);
    expect(office1.highest_severity).toBe('Extreme');
  });

  test('tracks NEW vs CON counts', () => {
    const advisories = [
      makeAdvisory({ office_id: 1, vtec_action: 'NEW', advisory_type: 'A', severity: 'Severe' }),
      makeAdvisory({ office_id: 1, vtec_action: 'CON', advisory_type: 'B', severity: 'Minor' }),
      makeAdvisory({ office_id: 1, vtec_action: 'NEW', advisory_type: 'C', severity: 'Moderate' })
    ];

    const result = OfficeAggregator.aggregateByOffice(advisories);
    expect(result[0].new_count).toBe(2);
    expect(result[0].continued_count).toBe(1);
  });

  test('sorts by urgency score descending', () => {
    const advisories = [
      makeAdvisory({ office_id: 1, severity: 'Minor', advisory_type: 'A' }),
      makeAdvisory({ office_id: 2, severity: 'Extreme', advisory_type: 'B' })
    ];

    const result = OfficeAggregator.aggregateByOffice(advisories);
    expect(result[0].office_id).toBe(2); // Extreme first
  });

  test('returns empty array for no advisories', () => {
    expect(OfficeAggregator.aggregateByOffice([])).toHaveLength(0);
  });

  test('respects deduplicateZones option', () => {
    const time = new Date().toISOString();
    const advisories = [
      makeAdvisory({ id: 1, office_id: 1, issued_time: time }),
      makeAdvisory({ id: 2, office_id: 1, issued_time: time })
    ];

    const withDedup = OfficeAggregator.aggregateByOffice(advisories, { deduplicateZones: true });
    const withoutDedup = OfficeAggregator.aggregateByOffice(advisories, { deduplicateZones: false });

    expect(withDedup[0].unique_advisory_count).toBe(1);
    expect(withoutDedup[0].unique_advisory_count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// groupBySeverity
// ---------------------------------------------------------------------------
describe('groupBySeverity', () => {
  test('buckets offices into four severity groups', () => {
    const offices = [
      { highest_severity: 'Extreme' },
      { highest_severity: 'Severe' },
      { highest_severity: 'Severe' },
      { highest_severity: 'Moderate' },
      { highest_severity: 'Minor' }
    ];

    const result = OfficeAggregator.groupBySeverity(offices);
    expect(result.extreme).toHaveLength(1);
    expect(result.severe).toHaveLength(2);
    expect(result.moderate).toHaveLength(1);
    expect(result.minor).toHaveLength(1);
  });

  test('returns empty arrays when no offices match', () => {
    const result = OfficeAggregator.groupBySeverity([]);
    expect(result.extreme).toHaveLength(0);
    expect(result.severe).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getSummaryStats
// ---------------------------------------------------------------------------
describe('getSummaryStats', () => {
  test('computes correct counts', () => {
    const advisories = [
      makeAdvisory({ vtec_action: 'NEW' }),
      makeAdvisory({ vtec_action: 'CON' }),
      makeAdvisory({ vtec_action: 'NEW' })
    ];
    const offices = [
      { highest_severity: 'Extreme' },
      { highest_severity: 'Moderate' }
    ];

    const stats = OfficeAggregator.getSummaryStats(advisories, offices);
    expect(stats.total_advisories).toBe(3);
    expect(stats.unique_offices).toBe(2);
    expect(stats.extreme_severe_offices).toBe(1);
    expect(stats.moderate_offices).toBe(1);
    expect(stats.new_alerts).toBe(2);
  });

  test('returns zero avg for empty offices', () => {
    const stats = OfficeAggregator.getSummaryStats([], []);
    expect(stats.avg_alerts_per_office).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getFilterWarning
// ---------------------------------------------------------------------------
describe('getFilterWarning', () => {
  test('returns null when nothing is hidden', () => {
    const all = [{ id: 1 }, { id: 2 }];
    expect(OfficeAggregator.getFilterWarning(all, all)).toBeNull();
  });

  test('reports hidden count', () => {
    const all = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const filtered = [all[0]];

    const warning = OfficeAggregator.getFilterWarning(all, filtered);
    expect(warning.hidden_count).toBe(2);
    expect(warning.all_hidden).toBe(false);
  });

  test('detects all hidden', () => {
    const all = [{ id: 1, severity: 'Minor' }];
    const filtered = [];

    const warning = OfficeAggregator.getFilterWarning(all, filtered);
    expect(warning.all_hidden).toBe(true);
  });

  test('detects hidden critical alerts', () => {
    const all = [
      { id: 1, severity: 'Extreme' },
      { id: 2, severity: 'Minor' }
    ];
    const filtered = [all[1]]; // only Minor visible

    const warning = OfficeAggregator.getFilterWarning(all, filtered);
    expect(warning.has_critical).toBe(true);
    expect(warning.critical_hidden).toBe(1);
  });
});
