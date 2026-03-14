/**
 * Playwright E2E Test Configuration
 * Runs against the local dev server (closes #270)
 */

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30_000,
    retries: 1,
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
        screenshot: 'only-on-failure',
        trace: 'on-first-retry'
    },
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium' }
        }
    ],
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              command: 'npm start',
              cwd: '../backend',
              port: 3000,
              reuseExistingServer: true,
              timeout: 30_000
          }
});
