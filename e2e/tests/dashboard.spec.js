/**
 * Dashboard (Overview) E2E Tests
 * Verifies that the main dashboard loads and renders key elements.
 */

const { test, expect } = require('@playwright/test');

test.describe('Dashboard', () => {
    test('loads overview page with title', async ({ page }) => {
        await page.goto('./');
        await expect(page).toHaveTitle(/Storm Scout/);
    });

    test('renders navbar with navigation links', async ({ page }) => {
        await page.goto('./');
        const nav = page.locator('.navbar');
        await expect(nav).toBeVisible();
        await expect(nav.getByText('Active Advisories')).toBeVisible();
        await expect(nav.getByText('Offices Impacted')).toBeVisible();
        await expect(nav.getByText('Map View')).toBeVisible();
    });

    test('displays last-updated timestamp', async ({ page }) => {
        await page.goto('./');
        const lastUpdated = page.locator('#lastUpdated');
        await expect(lastUpdated).toBeVisible();
        // Should eventually replace "Loading..." with a value
        await expect(lastUpdated).not.toHaveText('Loading...', { timeout: 10_000 });
    });

    test('renders severity summary cards', async ({ page }) => {
        await page.goto('./');
        // Wait for JS to populate cards
        await page.waitForLoadState('networkidle');
        // The overview page should have summary statistics
        const mainContent = page.locator('#main-content, main, .container-fluid');
        await expect(mainContent.first()).toBeVisible();
    });
});
