/**
 * Map View E2E Tests
 * Verifies the map page loads and renders a Leaflet map.
 */

const { test, expect } = require('@playwright/test');

test.describe('Map View', () => {
    test('loads map page', async ({ page }) => {
        await page.goto('/map.html');
        await expect(page).toHaveTitle(/Storm Scout/);
    });

    test('renders Leaflet map container', async ({ page }) => {
        await page.goto('/map.html');
        // Leaflet adds .leaflet-container to the map div
        const map = page.locator('.leaflet-container');
        await expect(map).toBeVisible({ timeout: 10_000 });
    });

    test('map has tile layers loaded', async ({ page }) => {
        await page.goto('/map.html');
        await page.waitForLoadState('networkidle');
        // Leaflet tile images should be present
        const tiles = page.locator('.leaflet-tile-loaded');
        await expect(tiles.first()).toBeVisible({ timeout: 15_000 });
    });
});
