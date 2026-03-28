'use strict';

/**
 * Unit tests for database.js — loadOffices() and offices.json integrity
 * Guards against regressions where observation_station is lost on DB reinit.
 */

const path = require('path');
const fs = require('fs');

// ── offices.json data integrity ──────────────────────────────────────────────

describe('offices.json data integrity', () => {
  const officesPath = path.join(__dirname, '../../src/data/offices.json');
  const offices = JSON.parse(fs.readFileSync(officesPath, 'utf8'));

  test('every office has a truthy observation_station', () => {
    const missing = offices.filter((o) => !o.observation_station);
    expect(missing).toEqual([]);
  });

  test('observation_station values are valid ICAO-like codes', () => {
    for (const office of offices) {
      expect(office.observation_station).toMatch(/^[A-Z0-9]{3,10}$/);
    }
  });

  test('all 302 offices are present', () => {
    expect(offices.length).toBe(302);
  });
});

// ── loadOffices() SQL verification ───────────────────────────────────────────

describe('loadOffices() includes observation_station', () => {
  test('INSERT statement references observation_station column', () => {
    // Read the source file directly to verify the SQL includes observation_station
    const dbSource = fs.readFileSync(
      path.join(__dirname, '../../src/config/database.js'),
      'utf8'
    );

    // Extract the loadOffices function body
    const fnStart = dbSource.indexOf('async function loadOffices()');
    const fnEnd = dbSource.indexOf('\n/**', fnStart + 1);
    const fnBody = dbSource.substring(fnStart, fnEnd);

    // The INSERT must include observation_station in the column list
    expect(fnBody).toContain('observation_station');

    // The VALUES must have 11 placeholders (10 original + observation_station)
    const valuesMatch = fnBody.match(/VALUES\s*\(([^)]+)\)/);
    expect(valuesMatch).not.toBeNull();
    const placeholders = valuesMatch[1].split(',').map((s) => s.trim());
    expect(placeholders).toHaveLength(11);

    // The params array must reference office.observation_station
    expect(fnBody).toContain('office.observation_station');
  });
});
