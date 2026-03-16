/**
 * Unit tests for the normalizer utility functions
 * Covers: getSeverityFromAlertType, normalizeSeverity, extractVTECEventID,
 * extractVTECAction, isPointInAlertArea, calculateWeatherImpact,
 * calculateHighestWeatherImpact, formatStatusReason, normalizeNOAAAlert datetime handling
 *
 * extractVTEC and normalizeNOAAAlert core fields are covered in vtec-extraction.test.js
 */

const {
    normalizeSeverity,
    normalizeNOAAAlert,
    getSeverityFromAlertType,
    extractVTEC,
    extractVTECEventID,
    extractVTECAction,
    isPointInAlertArea,
    calculateWeatherImpact,
    calculateHighestWeatherImpact,
    formatStatusReason,
    calculateOperationalStatus
} = require('../../src/ingestion/utils/normalizer');

describe('getSeverityFromAlertType', () => {
    test('should return Extreme for CRITICAL alert types', () => {
        expect(getSeverityFromAlertType('Tornado Warning')).toBe('Extreme');
        expect(getSeverityFromAlertType('Hurricane Warning')).toBe('Extreme');
        expect(getSeverityFromAlertType('Tsunami Warning')).toBe('Extreme');
        expect(getSeverityFromAlertType('Flash Flood Warning')).toBe('Extreme');
    });

    test('should return Severe for HIGH alert types', () => {
        expect(getSeverityFromAlertType('Winter Storm Warning')).toBe('Severe');
        expect(getSeverityFromAlertType('Flood Warning')).toBe('Severe');
        expect(getSeverityFromAlertType('High Wind Warning')).toBe('Severe');
        expect(getSeverityFromAlertType('Tornado Watch')).toBe('Severe');
    });

    test('should return Moderate for MODERATE alert types', () => {
        expect(getSeverityFromAlertType('Winter Weather Advisory')).toBe('Moderate');
        expect(getSeverityFromAlertType('Wind Advisory')).toBe('Moderate');
        expect(getSeverityFromAlertType('Heat Advisory')).toBe('Moderate');
        expect(getSeverityFromAlertType('Dense Fog Advisory')).toBe('Moderate');
    });

    test('should return Minor for LOW alert types', () => {
        expect(getSeverityFromAlertType('Small Craft Advisory')).toBe('Minor');
        expect(getSeverityFromAlertType('Rip Current Statement')).toBe('Minor');
        expect(getSeverityFromAlertType('Cold Weather Advisory')).toBe('Minor');
    });

    test('should return Minor for INFO alert types', () => {
        expect(getSeverityFromAlertType('Special Weather Statement')).toBe('Minor');
        expect(getSeverityFromAlertType('Hazardous Weather Outlook')).toBe('Minor');
    });

    test('should return Minor for null/undefined/empty', () => {
        expect(getSeverityFromAlertType(null)).toBe('Minor');
        expect(getSeverityFromAlertType(undefined)).toBe('Minor');
        expect(getSeverityFromAlertType('')).toBe('Minor');
    });

    test('should return Minor for unknown alert types', () => {
        expect(getSeverityFromAlertType('Made Up Warning')).toBe('Minor');
    });
});

describe('normalizeSeverity', () => {
    test('should normalize valid severity strings', () => {
        expect(normalizeSeverity('Extreme')).toBe('Extreme');
        expect(normalizeSeverity('Severe')).toBe('Severe');
        expect(normalizeSeverity('Moderate')).toBe('Moderate');
        expect(normalizeSeverity('Minor')).toBe('Minor');
    });

    test('should be case-insensitive', () => {
        expect(normalizeSeverity('extreme')).toBe('Extreme');
        expect(normalizeSeverity('SEVERE')).toBe('Severe');
        expect(normalizeSeverity('moderate')).toBe('Moderate');
        expect(normalizeSeverity('MINOR')).toBe('Minor');
    });

    test('should return Minor for null/undefined/empty', () => {
        expect(normalizeSeverity(null)).toBe('Minor');
        expect(normalizeSeverity(undefined)).toBe('Minor');
        expect(normalizeSeverity('')).toBe('Minor');
    });

    test('should return Minor for invalid values', () => {
        expect(normalizeSeverity('Critical')).toBe('Minor');
        expect(normalizeSeverity('Unknown')).toBe('Minor');
        expect(normalizeSeverity('nonsense')).toBe('Minor');
    });
});

describe('extractVTECEventID', () => {
    test('should extract event ID from valid VTEC code', () => {
        const vtec = '/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/';
        expect(extractVTECEventID(vtec)).toBe('PAJK.WS.W.0005');
    });

    test('should extract event ID for different action codes', () => {
        expect(extractVTECEventID('/O.NEW.KBOU.WS.W.0012.260301T0000Z-260302T0000Z/')).toBe('KBOU.WS.W.0012');
        expect(extractVTECEventID('/O.EXT.KMSO.HW.W.0006.260212T1200Z-260213T0300Z/')).toBe('KMSO.HW.W.0006');
        expect(extractVTECEventID('/O.EXP.KPHI.WW.Y.0009.260211T1200Z-260212T0000Z/')).toBe('KPHI.WW.Y.0009');
        expect(extractVTECEventID('/O.CAN.KORD.WS.W.0003.260301T0000Z-260302T0000Z/')).toBe('KORD.WS.W.0003');
    });

    test('should return null for null/undefined/empty input', () => {
        expect(extractVTECEventID(null)).toBeNull();
        expect(extractVTECEventID(undefined)).toBeNull();
        expect(extractVTECEventID('')).toBeNull();
    });

    test('should return null for malformed VTEC code', () => {
        expect(extractVTECEventID('not-a-vtec-code')).toBeNull();
        expect(extractVTECEventID('/invalid/')).toBeNull();
    });

    test('should return null when input causes an exception', () => {
        // Non-string truthy value triggers error in .match()
        expect(extractVTECEventID({})).toBeNull();
    });
});

describe('extractVTECAction', () => {
    test('should extract action code from valid VTEC', () => {
        expect(extractVTECAction('/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/')).toBe('CON');
        expect(extractVTECAction('/O.NEW.KBOU.WS.W.0012.260301T0000Z-260302T0000Z/')).toBe('NEW');
        expect(extractVTECAction('/O.EXT.KMSO.HW.W.0006.260212T1200Z-260213T0300Z/')).toBe('EXT');
        expect(extractVTECAction('/O.EXP.KPHI.WW.Y.0009.260211T1200Z-260212T0000Z/')).toBe('EXP');
        expect(extractVTECAction('/O.CAN.KORD.WS.W.0003.260301T0000Z-260302T0000Z/')).toBe('CAN');
        expect(extractVTECAction('/O.UPG.KLOT.WS.W.0001.260301T0000Z-260302T0000Z/')).toBe('UPG');
    });

    test('should return null for null/undefined/empty input', () => {
        expect(extractVTECAction(null)).toBeNull();
        expect(extractVTECAction(undefined)).toBeNull();
        expect(extractVTECAction('')).toBeNull();
    });

    test('should return null for malformed VTEC code', () => {
        expect(extractVTECAction('not-a-vtec-code')).toBeNull();
    });

    test('should return null when input causes an exception', () => {
        // Non-string truthy value triggers .match() error
        expect(extractVTECAction({})).toBeNull();
    });
});

describe('isPointInAlertArea', () => {
    // Square polygon: corners at (0,0), (10,0), (10,10), (0,10) in [lon, lat]
    const squarePolygon = {
        type: 'Polygon',
        coordinates: [
            [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0]
            ]
        ]
    };

    test('should return true when point is inside polygon', () => {
        expect(isPointInAlertArea(5, 5, squarePolygon)).toBe(true);
    });

    test('should return false when point is outside polygon', () => {
        expect(isPointInAlertArea(15, 15, squarePolygon)).toBe(false);
        expect(isPointInAlertArea(-1, -1, squarePolygon)).toBe(false);
    });

    test('should return true when geometry is null/undefined', () => {
        expect(isPointInAlertArea(5, 5, null)).toBe(true);
        expect(isPointInAlertArea(5, 5, undefined)).toBe(true);
    });

    test('should return true when geometry has no coordinates', () => {
        expect(isPointInAlertArea(5, 5, { type: 'Polygon' })).toBe(true);
    });

    test('should handle MultiPolygon geometry', () => {
        const multiPolygon = {
            type: 'MultiPolygon',
            coordinates: [
                [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
                [[[20, 20], [25, 20], [25, 25], [20, 25], [20, 20]]]
            ]
        };

        expect(isPointInAlertArea(2, 2, multiPolygon)).toBe(true);
        expect(isPointInAlertArea(22, 22, multiPolygon)).toBe(true);
        expect(isPointInAlertArea(10, 10, multiPolygon)).toBe(false);
    });

    test('should return true for unknown geometry type', () => {
        expect(isPointInAlertArea(5, 5, { type: 'Point', coordinates: [5, 5] })).toBe(true);
    });
});

describe('calculateWeatherImpact', () => {
    test('should map severity to correct impact color', () => {
        expect(calculateWeatherImpact('Extreme')).toBe('red');
        expect(calculateWeatherImpact('Severe')).toBe('orange');
        expect(calculateWeatherImpact('Moderate')).toBe('yellow');
        expect(calculateWeatherImpact('Minor')).toBe('green');
        expect(calculateWeatherImpact('Unknown')).toBe('green');
    });

    test('should default to green for unrecognized severity', () => {
        expect(calculateWeatherImpact('nonsense')).toBe('green');
        expect(calculateWeatherImpact(undefined)).toBe('green');
    });

    test('calculateOperationalStatus should be an alias', () => {
        expect(calculateOperationalStatus).toBe(calculateWeatherImpact);
    });
});

describe('calculateHighestWeatherImpact', () => {
    test('should return highest impact from multiple advisories', () => {
        const advisories = [
            { severity: 'Minor' },
            { severity: 'Extreme' },
            { severity: 'Moderate' }
        ];
        expect(calculateHighestWeatherImpact(advisories)).toBe('red');
    });

    test('should return green for empty/null advisories', () => {
        expect(calculateHighestWeatherImpact([])).toBe('green');
        expect(calculateHighestWeatherImpact(null)).toBe('green');
        expect(calculateHighestWeatherImpact(undefined)).toBe('green');
    });

    test('should return correct impact for single advisory', () => {
        expect(calculateHighestWeatherImpact([{ severity: 'Severe' }])).toBe('orange');
    });

    test('should handle all moderate advisories', () => {
        const advisories = [{ severity: 'Moderate' }, { severity: 'Moderate' }];
        expect(calculateHighestWeatherImpact(advisories)).toBe('yellow');
    });
});

describe('formatStatusReason', () => {
    test('should return message for no advisories', () => {
        expect(formatStatusReason([])).toBe('No active advisories');
        expect(formatStatusReason(null)).toBe('No active advisories');
        expect(formatStatusReason(undefined)).toBe('No active advisories');
    });

    test('should return advisory type for single advisory', () => {
        const advisories = [{ advisory_type: 'Tornado Warning', severity: 'Extreme' }];
        expect(formatStatusReason(advisories)).toBe('Tornado Warning');
    });

    test('should format multiple advisories with count', () => {
        const advisories = [
            { advisory_type: 'Tornado Warning', severity: 'Extreme' },
            { advisory_type: 'Flood Warning', severity: 'Severe' },
            { advisory_type: 'Wind Advisory', severity: 'Moderate' }
        ];
        expect(formatStatusReason(advisories)).toBe('Tornado Warning + 2 more');
    });

    test('should pick highest severity advisory for the label', () => {
        const advisories = [
            { advisory_type: 'Wind Advisory', severity: 'Moderate' },
            { advisory_type: 'Tornado Warning', severity: 'Extreme' }
        ];
        expect(formatStatusReason(advisories)).toBe('Tornado Warning + 1 more');
    });
});

describe('extractVTEC error handling', () => {
    test('should return null and not throw when alert is null', () => {
        expect(extractVTEC(null)).toBeNull();
    });
});

describe('normalizeNOAAAlert datetime handling', () => {
    test('should return null for invalid date strings', () => {
        const alert = {
            properties: {
                event: 'Wind Advisory',
                status: 'Actual',
                onset: 'not-a-valid-date',
                ends: 'also-invalid',
                sent: '2026-03-01T10:00:00Z',
                parameters: {}
            }
        };

        const normalized = normalizeNOAAAlert(alert);
        expect(normalized.start_time).toBeNull();
        expect(normalized.end_time).toBeNull();
    });

    test('should convert ISO timestamps to MySQL DATETIME format', () => {
        const alert = {
            properties: {
                event: 'Wind Advisory',
                status: 'Actual',
                onset: '2026-03-01T12:00:00Z',
                ends: '2026-03-02T00:00:00Z',
                sent: '2026-03-01T10:00:00Z',
                parameters: {}
            }
        };

        const normalized = normalizeNOAAAlert(alert);
        expect(normalized.start_time).toBe('2026-03-01 12:00:00');
        expect(normalized.end_time).toBe('2026-03-02 00:00:00');
        expect(normalized.issued_time).toBe('2026-03-01 10:00:00');
    });

    test('should handle null end time', () => {
        const alert = {
            properties: {
                event: 'Wind Advisory',
                status: 'Actual',
                onset: '2026-03-01T12:00:00Z',
                sent: '2026-03-01T10:00:00Z',
                parameters: {}
            }
        };

        const normalized = normalizeNOAAAlert(alert);
        expect(normalized.end_time).toBeNull();
    });

    test('should map non-Actual status to expired', () => {
        const alert = {
            properties: {
                event: 'Wind Advisory',
                status: 'Test',
                onset: '2026-03-01T12:00:00Z',
                sent: '2026-03-01T10:00:00Z',
                parameters: {}
            }
        };

        const normalized = normalizeNOAAAlert(alert);
        expect(normalized.status).toBe('expired');
    });

    test('should include raw_payload as the original alert object', () => {
        const alert = {
            properties: {
                event: 'Wind Advisory',
                status: 'Actual',
                onset: '2026-03-01T12:00:00Z',
                sent: '2026-03-01T10:00:00Z',
                parameters: {}
            }
        };

        const normalized = normalizeNOAAAlert(alert);
        expect(normalized.raw_payload).toBe(alert);
    });
});
