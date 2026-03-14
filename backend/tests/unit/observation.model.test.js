'use strict';

/**
 * Unit tests for src/models/observation.js
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn()
}));

const { getDatabase }   = require('../../src/config/database');
const ObservationModel   = require('../../src/models/observation');

function makeDb(rows = []) {
  return { query: jest.fn().mockResolvedValue([rows, {}]) };
}

afterEach(() => jest.clearAllMocks());

const SAMPLE_DATA = {
  station_id: 'KORD',
  temperature_c: 5.5,
  relative_humidity: 62,
  dewpoint_c: -1.1,
  wind_speed_kmh: 24,
  wind_direction_deg: 270,
  wind_gust_kmh: null,
  barometric_pressure_pa: 101300,
  visibility_m: 16093,
  wind_chill_c: 2.0,
  heat_index_c: null,
  cloud_layers: '[{"base":1200,"amount":"BKN"}]',
  text_description: 'Partly Cloudy',
  observed_at: '2026-03-14T12:00:00Z'
};

// ── upsert ─────────────────────────────────────────────────────────────────

describe('ObservationModel.upsert()', () => {
  test('inserts observation and returns result', async () => {
    const db = makeDb({ affectedRows: 1 });
    getDatabase.mockReturnValue(db);

    const result = await ObservationModel.upsert(1, SAMPLE_DATA);

    expect(result).toEqual({ affectedRows: 1 });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO office_observations'),
      expect.arrayContaining([1, 'KORD', 5.5])
    );
  });

  test('passes all fields in correct order', async () => {
    const db = makeDb({ affectedRows: 1 });
    getDatabase.mockReturnValue(db);

    await ObservationModel.upsert(42, SAMPLE_DATA);

    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBe(42);          // officeId
    expect(params[1]).toBe('KORD');      // station_id
    expect(params[2]).toBe(5.5);         // temperature_c
    expect(params[13]).toBe('Partly Cloudy'); // text_description
  });
});

// ── getByOfficeId ──────────────────────────────────────────────────────────

describe('ObservationModel.getByOfficeId()', () => {
  test('returns observation when found', async () => {
    const row = { office_id: 1, temperature_c: 5.5 };
    const db = makeDb([row]);
    getDatabase.mockReturnValue(db);

    expect(await ObservationModel.getByOfficeId(1)).toEqual(row);
  });

  test('returns null when not found', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    expect(await ObservationModel.getByOfficeId(999)).toBeNull();
  });
});

// ── getAll ──────────────────────────────────────────────────────────────────

describe('ObservationModel.getAll()', () => {
  test('returns all observations with office info', async () => {
    const rows = [
      { office_id: 1, office_code: '46201', temperature_c: 5.5 },
      { office_id: 2, office_code: '90210', temperature_c: 20.0 }
    ];
    const db = makeDb(rows);
    getDatabase.mockReturnValue(db);

    const result = await ObservationModel.getAll();

    expect(result).toHaveLength(2);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('JOIN offices'));
  });
});

// ── getByOfficeCode ────────────────────────────────────────────────────────

describe('ObservationModel.getByOfficeCode()', () => {
  test('returns observation with office data', async () => {
    const row = { office_id: 1, office_code: '46201', temperature_c: 5.5 };
    const db = makeDb([row]);
    getDatabase.mockReturnValue(db);

    const result = await ObservationModel.getByOfficeCode('46201');

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE s.office_code = ?'),
      ['46201']
    );
  });

  test('returns null when office code not found', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    expect(await ObservationModel.getByOfficeCode('00000')).toBeNull();
  });
});
