/**
 * Filter Settings E2E Tests
 * Verifies filter preferences persist and propagate to advisory pages.
 */

const { test, expect } = require('@playwright/test');

test.describe('Filter Settings', () => {
    test('persists filter changes and reflects active count on advisories page', async ({ page }) => {
        await page.goto('/filters.html');
        await page.waitForLoadState('networkidle');

        const enabledCount = page.locator('#enabledCount');
        await expect(enabledCount).not.toHaveText('0');

        const initialEnabled = parseInt(await enabledCount.innerText(), 10);

        const firstToggle = page.locator('input[data-alert-type]').first();
        await expect(firstToggle).toBeVisible();
        const wasChecked = await firstToggle.isChecked();

        await firstToggle.click();
        await page.locator('#savePrefsBtn').click();

        const expectedEnabled = initialEnabled + (wasChecked ? -1 : 1);
        await expect(enabledCount).toHaveText(String(expectedEnabled));

        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(enabledCount).toHaveText(String(expectedEnabled));

        await page.goto('/advisories.html');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('#filterIndicatorRow')).toBeVisible();
        await expect(page.locator('#filterCount')).toHaveText(String(expectedEnabled));
    });

    test('full preset increases enabled alert count and propagates to advisories page', async ({ page }) => {
        await page.goto('/filters.html');
        await page.waitForLoadState('networkidle');
        const initialEnabled = parseInt(await page.locator('#enabledCount').innerText(), 10);

        await page.locator('[data-preset="FULL"]').click();

        const enabledAfter = parseInt(await page.locator('#enabledCount').innerText(), 10);
        expect(enabledAfter).toBeGreaterThan(initialEnabled);

        await page.goto('/advisories.html');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#filterIndicatorRow')).toBeVisible();
        await expect(page.locator('#filterCount')).toHaveText(String(enabledAfter));
    });
});
