/**
 * Export E2E Tests
 * Verifies that dashboard export controls exist and CSV export triggers a download.
 */

const { test, expect } = require('@playwright/test');

test.describe('Export', () => {
    test('dashboard page has export controls', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const exportToggle = page.getByRole('button', { name: /export/i });
        await expect(exportToggle).toBeVisible();

        await exportToggle.click();
        const exportCsvItem = page.locator('a.dropdown-item').filter({ hasText: /export csv/i });
        await expect(exportCsvItem).toBeVisible();
    });

    test('export csv triggers download', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: /export/i }).click();
        const exportCsvItem = page.locator('a.dropdown-item').filter({ hasText: /export csv/i }).first();
        await expect(exportCsvItem).toBeVisible();

        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 10_000 }).catch(() => null),
            exportCsvItem.click()
        ]);

        // Export CSV should trigger a file download.
        expect(download).not.toBeNull();
        if (download) {
            const filename = download.suggestedFilename();
            expect(filename).toMatch(/\.csv$/i);
        }
    });
});
