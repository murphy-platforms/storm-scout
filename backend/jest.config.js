/**
 * Test Layer Boundaries
 *
 * Unit (tests/unit/):
 *   Isolated logic — models, utilities, validators, formatters.
 *   All external dependencies (DB, HTTP, cache) are mocked.
 *
 * Integration (tests/integration/):
 *   Route behavior — HTTP status codes, response envelope shapes,
 *   middleware chains, caching, pagination. Models are mocked;
 *   Express app is real.
 *
 * E2E (e2e/tests/, Playwright):
 *   User-facing workflows only — page loads, navigation, interactions,
 *   exports. Runs against a live server.
 *
 * Rule: each behavior should be owned by exactly one layer.
 * Validation logic → unit. Route wiring → integration. Page flows → E2E.
 */

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/../frontend/js'],
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js',
    '**/frontend/js/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/data/**',
    '!src/scripts/**',
    '!src/ingestion/scheduler.js',
    '!src/middleware/partials.js', // Only active when STATIC_FILES_PATH is configured
    '!src/types.js'               // JSDoc typedef declarations only — no runtime logic
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 100,
      lines: 100,
      statements: 99
    }
  },
  testTimeout: 15000
};
