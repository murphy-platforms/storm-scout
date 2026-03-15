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
      branches: 58,
      functions: 72,
      lines: 65,
      statements: 65
    }
  },
  testTimeout: 15000
};
