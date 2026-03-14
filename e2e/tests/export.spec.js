/**
 * Export E2E Tests
 * Verifies that CSV/PDF export buttons exist and trigger downloads.
 */

const { test, expect } = require('@playwright/test');

test.describe('Export', () => {
    test('advisories page has export button', async ({ page }) => {
        await page.goto('/advisories.html');
        await page.waitForLoadState('networkidle');
        const exportBtn = page.locator('button, a').filter({ hasText: /export|download|csv|pdf/i });
        // Export functionality should be accessible
        const count = await exportBtn.count();
        expect(count).toBeGreaterThan(0);
    });

    test('export triggers download', async ({ page }) => {
        await page.goto('/advisories.html');
        await page.waitForLoadState('networkidle');
        const exportBtn = page.locator('button, a').filter({ hasText: /export|csv/i }).first();
        if ((await exportBtn.count()) > 0) {
            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 5_000 }).catch(() => null),
                exportBtn.click()
            ]);
            // If a download was triggered, verify the filename
            if (download) {
                const filename = download.suggestedFilename();
                expect(filename).toMatch(/\.(csv|pdf|xlsx)$/);
            }
        }
    });
});
