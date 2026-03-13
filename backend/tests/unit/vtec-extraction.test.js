/**
 * Unit tests for VTEC extraction
 * Tests the extractVTEC function with various NOAA alert payloads
 */

const { extractVTEC, normalizeNOAAAlert } = require('../../src/ingestion/utils/normalizer');

describe('VTEC Extraction', () => {
  test('should extract VTEC from valid NOAA alert', () => {
    const mockAlert = {
      properties: {
        event: 'Winter Storm Warning',
        severity: 'Severe',
        parameters: {
          VTEC: ['/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/']
        }
      }
    };

    const vtec = extractVTEC(mockAlert);
    expect(vtec).toBe('/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/');
  });

  test('should return null for alert without VTEC', () => {
    const mockAlert = {
      properties: {
        event: 'Special Weather Statement',
        severity: 'Moderate',
        parameters: {}
      }
    };

    const vtec = extractVTEC(mockAlert);
    expect(vtec).toBeNull();
  });

  test('should return first VTEC when multiple exist', () => {
    const mockAlert = {
      properties: {
        event: 'Winter Storm Warning',
        severity: 'Severe',
        parameters: {
          VTEC: [
            '/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/',
            '/O.CON.PAJK.WW.Y.0009.000000T0000Z-260213T0000Z/'
          ]
        }
      }
    };

    const vtec = extractVTEC(mockAlert);
    expect(vtec).toBe('/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/');
  });

  test('should handle missing properties gracefully', () => {
    const mockAlert = {
      properties: null
    };

    const vtec = extractVTEC(mockAlert);
    expect(vtec).toBeNull();
  });

  test('should handle empty VTEC array', () => {
    const mockAlert = {
      properties: {
        event: 'Special Weather Statement',
        parameters: {
          VTEC: []
        }
      }
    };

    const vtec = extractVTEC(mockAlert);
    expect(vtec).toBeNull();
  });

  test('should handle malformed alert object', () => {
    const mockAlert = {};

    const vtec = extractVTEC(mockAlert);
    expect(vtec).toBeNull();
  });
});

describe('NOAA Alert Normalization with VTEC', () => {
  test('should include vtec_code in normalized alert', () => {
    const mockAlert = {
      properties: {
        event: 'Winter Storm Warning',
        severity: 'Severe',
        status: 'Actual',
        senderName: 'NWS Juneau AK',
        headline: 'Winter Storm Warning until 3 PM AKST',
        description: 'Heavy snow expected',
        onset: '2026-02-12T00:00:00Z',
        ends: '2026-02-12T23:00:00Z',
        sent: '2026-02-11T16:00:00Z',
        parameters: {
          VTEC: ['/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/']
        }
      }
    };

    const normalized = normalizeNOAAAlert(mockAlert);
    
    expect(normalized.advisory_type).toBe('Winter Storm Warning');
    expect(normalized.severity).toBe('Severe');
    expect(normalized.vtec_code).toBe('/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/');
    expect(normalized.status).toBe('active');
  });

  test('should set vtec_code to null for alerts without VTEC', () => {
    const mockAlert = {
      properties: {
        event: 'Special Weather Statement',
        severity: 'Moderate',
        status: 'Actual',
        senderName: 'NWS Anchorage AK',
        headline: 'Special Weather Statement',
        description: 'Heavy snow bands possible',
        onset: '2026-02-12T00:00:00Z',
        sent: '2026-02-12T00:00:00Z',
        parameters: {}
      }
    };

    const normalized = normalizeNOAAAlert(mockAlert);
    
    expect(normalized.advisory_type).toBe('Special Weather Statement');
    expect(normalized.vtec_code).toBeNull();
  });

  test('should handle real NOAA alert structure', () => {
    // This is a real-world NOAA alert structure
    const realAlert = {
      id: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.31c954d6c2750576d7ed939f627070ac0d24a926.001.1',
      type: 'Feature',
      geometry: null,
      properties: {
        '@id': 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.31c954d6c2750576d7ed939f627070ac0d24a926.001.1',
        event: 'Winter Storm Warning',
        severity: 'Severe',
        status: 'Actual',
        messageType: 'Update',
        category: 'Met',
        certainty: 'Likely',
        urgency: 'Expected',
        sender: 'w-nws.webmaster@noaa.gov',
        senderName: 'NWS Juneau AK',
        headline: 'Winter Storm Warning issued February 12 at 6:35AM AKST until February 12 at 3:00PM AKST by NWS Juneau AK',
        description: 'Heavy snow expected. Total snow accumulations of 4 to 8 inches.',
        onset: '2026-02-12T11:35:00.000Z',
        ends: '2026-02-12T20:00:00.000Z',
        sent: '2026-02-12T11:35:00.000Z',
        parameters: {
          AWIPSidentifier: ['WSWAJK'],
          WMOidentifier: ['WWAK47 PAJK 121535'],
          VTEC: ['/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/'],
          eventEndingTime: ['2026-02-12T15:00:00-09:00']
        }
      }
    };

    const normalized = normalizeNOAAAlert(realAlert);
    
    expect(normalized.vtec_code).toBe('/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/');
    expect(normalized.advisory_type).toBe('Winter Storm Warning');
    expect(normalized.severity).toBe('Severe');
    expect(normalized.source).toBe('NOAA/NWS Juneau AK');
  });
});
