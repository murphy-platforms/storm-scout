/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/data/**',
    '!src/scripts/**'
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
