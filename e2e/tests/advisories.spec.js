/**
 * Advisory Filtering E2E Tests
 * Verifies the advisories page loads and filtering works.
 */

const { test, expect } = require('@playwright/test');

test.describe('Active Advisories', () => {
    test('loads advisories page', async ({ page }) => {
        await page.goto('./advisories.html');
        await expect(page).toHaveTitle(/Storm Scout/);
        await expect(page.locator('h1, h2, h3').first()).toBeVisible();
    });

    test('renders advisory content or empty state', async ({ page }) => {
        await page.goto('./advisories.html');
        await page.waitForLoadState('networkidle');
        // Should have advisories OR an empty-state message (CI has no live NOAA data)
        const content = page.locator('table, .advisory-list, .card, #advisories-container, .text-center.text-muted');
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    test('filter controls are present', async ({ page }) => {
        await page.goto('./advisories.html');
        // Check for filter dropdowns or inputs
        const filters = page.locator('select, input[type="search"], .filter-controls, [data-filter]');
        // At least some filter mechanism should exist
        const count = await filters.count();
        expect(count).toBeGreaterThan(0);
    });

    test('severity deep-link initializes unified view filter', async ({ page }) => {
        await page.goto('./advisories.html?severity=Extreme');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('#viewFilter')).toHaveValue('severity:Extreme');
    });

    test('supports card/table view switching and dedup toggle interaction', async ({ page }) => {
        await page.goto('./advisories.html');
        await page.waitForLoadState('networkidle');

        // Switch to table view
        await page.locator('#tableViewBtn').click();
        await expect(page.locator('#tableViewContainer')).toBeVisible();
        await expect(page.locator('#cardViewContainer')).toBeHidden();

        // Switch back to card view
        await page.locator('#cardViewBtn').click();
        await expect(page.locator('#cardViewContainer')).toBeVisible();
        await expect(page.locator('#tableViewContainer')).toBeHidden();

        // Dedup toggle should be interactive and persist checked state in the DOM
        const dedupToggle = page.locator('#dedupToggle');
        const wasChecked = await dedupToggle.isChecked();
        await dedupToggle.click();
        await expect(dedupToggle).toHaveJSProperty('checked', !wasChecked);
    });
});
