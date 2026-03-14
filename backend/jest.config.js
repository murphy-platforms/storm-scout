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
      branches: 55,
      functions: 65,
      lines: 62,
      statements: 62
    }
  },
  testTimeout: 15000
};
