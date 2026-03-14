/**
 * Office Detail E2E Tests
 * Verifies the offices list and detail page navigation.
 */

const { test, expect } = require('@playwright/test');

test.describe('Offices', () => {
    test('loads offices list page', async ({ page }) => {
        await page.goto('/offices.html');
        await expect(page).toHaveTitle(/Storm Scout/);
    });

    test('renders office cards or table rows', async ({ page }) => {
        await page.goto('/offices.html');
        await page.waitForLoadState('networkidle');
        const items = page.locator('.card, tr, .office-item, [data-office-id]');
        await expect(items.first()).toBeVisible({ timeout: 10_000 });
    });

    test('navigates to office detail page', async ({ page }) => {
        await page.goto('/offices.html');
        await page.waitForLoadState('networkidle');
        // Click the first office link/card
        const link = page.locator('a[href*="office-detail"]').first();
        if ((await link.count()) > 0) {
            await link.click();
            await expect(page).toHaveURL(/office-detail/);
            await page.waitForLoadState('networkidle');
            // Detail page should show office info
            const content = page.locator('#main-content, main, .container-fluid');
            await expect(content.first()).toBeVisible();
        }
    });
});
