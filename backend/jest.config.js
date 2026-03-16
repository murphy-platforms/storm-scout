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
      branches: 84,
      functions: 96,
      lines: 94,
      statements: 94
    }
  },
  testTimeout: 15000
};
