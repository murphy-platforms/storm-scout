/**
 * Unit tests for data normalizer
 * Tests severity mapping, VTEC extraction/parsing, alert normalization,
 * weather impact calculations, and status formatting
 */

const {
  normalizeSeverity,
  normalizeNOAAAlert,
  extractVTEC,
  extractVTECEventID,
  extractVTECAction,
  calculateWeatherImpact,
  calculateHighestWeatherImpact,
  formatStatusReason,
  getSeverityFromAlertType
} = require('../../src/ingestion/utils/normalizer');

// Suppress console.warn noise during tests
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  console.warn.mockRestore();
  console.error.mockRestore();
});

describe('getSeverityFromAlertType', () => {
  test('should map CRITICAL types to Extreme', () => {
    expect(getSeverityFromAlertType('Tornado Warning')).toBe('Extreme');
    expect(getSeverityFromAlertType('Flash Flood Warning')).toBe('Extreme');
  });

  test('should map HIGH types to Severe', () => {
    expect(getSeverityFromAlertType('Winter Storm Warning')).toBe('Severe');
    expect(getSeverityFromAlertType('Flood Warning')).toBe('Severe');
  });

  test('should map MODERATE types to Moderate', () => {
    expect(getSeverityFromAlertType('Winter Weather Advisory')).toBe('Moderate');
    expect(getSeverityFromAlertType('Wind Advisory')).toBe('Moderate');
  });

  test('should map LOW types to Minor', () => {
    expect(getSeverityFromAlertType('Flood Advisory')).toBe('Minor');
    expect(getSeverityFromAlertType('Rip Current Statement')).toBe('Minor');
  });

  test('should map INFO types to Minor', () => {
    expect(getSeverityFromAlertType('Special Weather Statement')).toBe('Minor');
  });

  test('should return Minor for unknown alert types', () => {
    expect(getSeverityFromAlertType('Made Up Alert')).toBe('Minor');
  });

  test('should return Minor for null/undefined', () => {
    expect(getSeverityFromAlertType(null)).toBe('Minor');
    expect(getSeverityFromAlertType(undefined)).toBe('Minor');
    expect(getSeverityFromAlertType('')).toBe('Minor');
  });
});

describe('normalizeSeverity', () => {
  test('should normalize valid NOAA severities', () => {
    expect(normalizeSeverity('Extreme')).toBe('Extreme');
    expect(normalizeSeverity('Severe')).toBe('Severe');
    expect(normalizeSeverity('Moderate')).toBe('Moderate');
    expect(normalizeSeverity('Minor')).toBe('Minor');
  });

  test('should be case-insensitive', () => {
    expect(normalizeSeverity('EXTREME')).toBe('Extreme');
    expect(normalizeSeverity('severe')).toBe('Severe');
    expect(normalizeSeverity('MODERATE')).toBe('Moderate');
  });

  test('should default to Minor for invalid values', () => {
    expect(normalizeSeverity('Unknown')).toBe('Minor');
    expect(normalizeSeverity('Critical')).toBe('Minor');
    expect(normalizeSeverity('nonsense')).toBe('Minor');
  });

  test('should default to Minor for null/undefined/empty', () => {
    expect(normalizeSeverity(null)).toBe('Minor');
    expect(normalizeSeverity(undefined)).toBe('Minor');
    expect(normalizeSeverity('')).toBe('Minor');
  });
});

describe('extractVTECEventID', () => {
  test('should extract event ID from valid VTEC code', () => {
    const vtec = '/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/';
    expect(extractVTECEventID(vtec)).toBe('PAJK.WS.W.0005');
  });

  test('should extract from different VTEC actions', () => {
    expect(extractVTECEventID('/O.NEW.KORD.WS.W.0001.260301T0000Z-260302T0000Z/')).toBe('KORD.WS.W.0001');
    expect(extractVTECEventID('/O.EXT.KLOT.BZ.W.0003.260301T0000Z-260303T0000Z/')).toBe('KLOT.BZ.W.0003');
    expect(extractVTECEventID('/O.EXP.KMFL.HW.W.0006.260301T0000Z-260302T0000Z/')).toBe('KMFL.HW.W.0006');
  });

  test('should return null for null/undefined input', () => {
    expect(extractVTECEventID(null)).toBeNull();
    expect(extractVTECEventID(undefined)).toBeNull();
  });

  test('should return null for malformed VTEC codes', () => {
    expect(extractVTECEventID('not-a-vtec-code')).toBeNull();
    expect(extractVTECEventID('/O.CON.PAJK/')).toBeNull();
    expect(extractVTECEventID('')).toBeNull();
  });
});

describe('extractVTECAction', () => {
  test('should extract action code from VTEC', () => {
    expect(extractVTECAction('/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/')).toBe('CON');
    expect(extractVTECAction('/O.NEW.KORD.WS.W.0001.260301T0000Z-260302T0000Z/')).toBe('NEW');
    expect(extractVTECAction('/O.EXT.KLOT.BZ.W.0003.260301T0000Z-260303T0000Z/')).toBe('EXT');
    expect(extractVTECAction('/O.EXP.KMFL.HW.W.0006.260301T0000Z-260302T0000Z/')).toBe('EXP');
    expect(extractVTECAction('/O.CAN.KBOI.WW.Y.0002.260301T0000Z-260302T0000Z/')).toBe('CAN');
    expect(extractVTECAction('/O.UPG.KPHI.WS.W.0004.260301T0000Z-260302T0000Z/')).toBe('UPG');
  });

  test('should return null for null/undefined input', () => {
    expect(extractVTECAction(null)).toBeNull();
    expect(extractVTECAction(undefined)).toBeNull();
  });

  test('should return null for malformed input', () => {
    expect(extractVTECAction('')).toBeNull();
    expect(extractVTECAction('random-string')).toBeNull();
  });
});

describe('normalizeNOAAAlert', () => {
  const makeAlert = (overrides = {}) => ({
    properties: {
      event: 'Winter Storm Warning',
      severity: 'Severe',
      status: 'Actual',
      senderName: 'NWS Chicago IL',
      headline: 'Winter Storm Warning until noon CST',
      description: 'Heavy snow expected.',
      onset: '2026-02-12T00:00:00Z',
      ends: '2026-02-13T00:00:00Z',
      sent: '2026-02-11T18:00:00Z',
      effective: '2026-02-11T18:00:00Z',
      expires: '2026-02-13T06:00:00Z',
      parameters: {
        VTEC: ['/O.NEW.KLOT.WS.W.0003.260212T0000Z-260213T0000Z/']
      },
      ...overrides
    }
  });

  test('should normalize all required fields', () => {
    const result = normalizeNOAAAlert(makeAlert());

    expect(result.advisory_type).toBe('Winter Storm Warning');
    expect(result.severity).toBe('Severe');
    expect(result.status).toBe('active');
    expect(result.source).toBe('NOAA/NWS Chicago IL');
    expect(result.headline).toBe('Winter Storm Warning until noon CST');
    expect(result.description).toBe('Heavy snow expected.');
    expect(result.start_time).toBe('2026-02-12T00:00:00Z');
    expect(result.end_time).toBe('2026-02-13T00:00:00Z');
    expect(result.issued_time).toBe('2026-02-11T18:00:00Z');
    expect(result.vtec_code).toBe('/O.NEW.KLOT.WS.W.0003.260212T0000Z-260213T0000Z/');
    expect(result.vtec_event_id).toBe('KLOT.WS.W.0003');
    expect(result.vtec_action).toBe('NEW');
    expect(result.raw_payload).toBeDefined();
  });

  test('should use internal severity mapping instead of NOAA raw severity', () => {
    // NOAA says "Moderate" but internal category maps Tornado Warning to Extreme
    const result = normalizeNOAAAlert(makeAlert({
      event: 'Tornado Warning',
      severity: 'Moderate'
    }));
    expect(result.severity).toBe('Extreme');
  });

  test('should set status to expired for non-Actual alerts', () => {
    const result = normalizeNOAAAlert(makeAlert({ status: 'Test' }));
    expect(result.status).toBe('expired');
  });

  test('should handle missing senderName', () => {
    const result = normalizeNOAAAlert(makeAlert({ senderName: undefined }));
    expect(result.source).toBe('NOAA/NWS');
  });

  test('should fall back to event name when headline is missing', () => {
    const result = normalizeNOAAAlert(makeAlert({ headline: undefined }));
    expect(result.headline).toBe('Winter Storm Warning');
  });

  test('should use effective as fallback for missing onset', () => {
    const result = normalizeNOAAAlert(makeAlert({ onset: undefined }));
    expect(result.start_time).toBe('2026-02-11T18:00:00Z');
  });

  test('should use expires as fallback for missing ends', () => {
    const result = normalizeNOAAAlert(makeAlert({
      ends: undefined,
      expires: '2026-02-13T06:00:00Z'
    }));
    expect(result.end_time).toBe('2026-02-13T06:00:00Z');
  });

  test('should default advisory_type to Weather Advisory when event is missing', () => {
    const result = normalizeNOAAAlert(makeAlert({ event: undefined }));
    expect(result.advisory_type).toBe('Weather Advisory');
  });

  test('should handle alert without VTEC parameters', () => {
    const result = normalizeNOAAAlert(makeAlert({ parameters: {} }));
    expect(result.vtec_code).toBeNull();
    expect(result.vtec_event_id).toBeNull();
    expect(result.vtec_action).toBeNull();
  });
});

describe('calculateWeatherImpact', () => {
  test('should map severity to impact colors', () => {
    expect(calculateWeatherImpact('Extreme')).toBe('red');
    expect(calculateWeatherImpact('Severe')).toBe('orange');
    expect(calculateWeatherImpact('Moderate')).toBe('yellow');
    expect(calculateWeatherImpact('Minor')).toBe('green');
    expect(calculateWeatherImpact('Unknown')).toBe('green');
  });

  test('should default to green for unrecognized severity', () => {
    expect(calculateWeatherImpact('InvalidSeverity')).toBe('green');
    expect(calculateWeatherImpact(undefined)).toBe('green');
  });
});

describe('calculateHighestWeatherImpact', () => {
  test('should return red when Extreme advisory present', () => {
    const advisories = [
      { severity: 'Minor' },
      { severity: 'Extreme' },
      { severity: 'Moderate' }
    ];
    expect(calculateHighestWeatherImpact(advisories)).toBe('red');
  });

  test('should return orange when Severe is highest', () => {
    const advisories = [
      { severity: 'Minor' },
      { severity: 'Severe' }
    ];
    expect(calculateHighestWeatherImpact(advisories)).toBe('orange');
  });

  test('should return yellow for Moderate-only advisories', () => {
    const advisories = [
      { severity: 'Moderate' },
      { severity: 'Minor' }
    ];
    expect(calculateHighestWeatherImpact(advisories)).toBe('yellow');
  });

  test('should return green for Minor-only advisories', () => {
    const advisories = [{ severity: 'Minor' }];
    expect(calculateHighestWeatherImpact(advisories)).toBe('green');
  });

  test('should return green for empty/null/undefined advisories', () => {
    expect(calculateHighestWeatherImpact([])).toBe('green');
    expect(calculateHighestWeatherImpact(null)).toBe('green');
    expect(calculateHighestWeatherImpact(undefined)).toBe('green');
  });
});

describe('formatStatusReason', () => {
  test('should return default message for no advisories', () => {
    expect(formatStatusReason([])).toBe('No active advisories');
    expect(formatStatusReason(null)).toBe('No active advisories');
    expect(formatStatusReason(undefined)).toBe('No active advisories');
  });

  test('should return advisory type for single advisory', () => {
    const advisories = [{ advisory_type: 'Tornado Warning', severity: 'Extreme' }];
    expect(formatStatusReason(advisories)).toBe('Tornado Warning');
  });

  test('should show highest severity type + count for multiple advisories', () => {
    const advisories = [
      { advisory_type: 'Wind Advisory', severity: 'Moderate' },
      { advisory_type: 'Winter Storm Warning', severity: 'Severe' },
      { advisory_type: 'Frost Advisory', severity: 'Minor' }
    ];
    expect(formatStatusReason(advisories)).toBe('Winter Storm Warning + 2 more');
  });

  test('should pick Extreme over Severe as highest', () => {
    const advisories = [
      { advisory_type: 'Winter Storm Warning', severity: 'Severe' },
      { advisory_type: 'Tornado Warning', severity: 'Extreme' }
    ];
    expect(formatStatusReason(advisories)).toBe('Tornado Warning + 1 more');
  });
});
