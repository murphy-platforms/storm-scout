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
    '!src/ingestion/scheduler.js'
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
