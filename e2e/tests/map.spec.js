/**
 * Map View E2E Tests
 * Verifies the map page loads and renders a Leaflet map.
 */

const { test, expect } = require('@playwright/test');
async function mockMapApis(page) {
    const now = new Date().toISOString();

    await page.route(/\/api\/filters\/types\/all(?:\?.*)?$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                data: {
                    CRITICAL: ['Tornado Warning'],
                    HIGH: [],
                    MODERATE: ['Wind Advisory'],
                    LOW: [],
                    INFO: []
                }
            })
        });
    });

    await page.route(/\/api\/filters(?:\?.*)?$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                data: {
                    CUSTOM: {
                        name: 'Office Default',
                        includeCategories: ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'INFO'],
                        excludeTypes: []
                    }
                }
            })
        });
    });

    await page.route(/\/api\/offices(?:\?.*)?$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                data: [
                    {
                        id: 1,
                        office_code: '99501',
                        name: 'Anchorage Central',
                        city: 'Anchorage',
                        state: 'AK',
                        latitude: 61.2181,
                        longitude: -149.9003
                    },
                    {
                        id: 2,
                        office_code: '33101',
                        name: 'Miami Coastal',
                        city: 'Miami',
                        state: 'FL',
                        latitude: 25.7617,
                        longitude: -80.1918
                    }
                ]
            })
        });
    });

    await page.route(/\/api\/advisories\/active(?:\?.*)?$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                data: [
                    {
                        id: 11,
                        office_id: 1,
                        office_code: '99501',
                        office_name: 'Anchorage Central',
                        city: 'Anchorage',
                        state: 'AK',
                        advisory_type: 'Tornado Warning',
                        severity: 'Extreme',
                        vtec_action: 'NEW',
                        issued_time: now,
                        last_updated: now,
                        expires: now,
                        source: 'NWS-AFC',
                        headline: 'Critical conditions expected'
                    },
                    {
                        id: 12,
                        office_id: 2,
                        office_code: '33101',
                        office_name: 'Miami Coastal',
                        city: 'Miami',
                        state: 'FL',
                        advisory_type: 'Wind Advisory',
                        severity: 'Moderate',
                        vtec_action: 'CON',
                        issued_time: now,
                        last_updated: now,
                        expires: now,
                        source: 'NWS-MFL',
                        headline: 'Wind impacts possible'
                    }
                ]
            })
        });
    });

    await page.route(/\/api\/observations(?:\?.*)?$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: [] })
        });
    });
}

async function getVisibleOfficeCount(page) {
    const text = await page.locator('#visibleOfficeCount').innerText();
    const value = parseInt(text, 10);
    return Number.isNaN(value) ? 0 : value;
}

test.describe('Map View', () => {
    test('loads map page', async ({ page }) => {
        await page.goto('./map.html');
        await expect(page).toHaveTitle(/Storm Scout/);
    });

    test('renders Leaflet map container', async ({ page }) => {
        await page.goto('./map.html');
        // Leaflet adds .leaflet-container to the map div
        const map = page.locator('.leaflet-container');
        await expect(map).toBeVisible({ timeout: 10_000 });
    });

    test('applies severity toggles and updates map filter state', async ({ page }) => {
        await mockMapApis(page);
        await page.goto('./map.html');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('#extremeCount')).toHaveText('1');
        await expect(page.locator('#moderateCount')).toHaveText('1');
        await expect(page.locator('#severeCount')).toHaveText('0');
        await expect(page.locator('#minorCount')).toHaveText('0');

        const before = await getVisibleOfficeCount(page);

        await page.locator('#toggleModerate').click();
        await expect(page.locator('#filterModerate')).not.toBeChecked();
        await expect(page.locator('#toggleModerate')).toHaveClass(/filter-disabled/);

        const after = await getVisibleOfficeCount(page);
        expect(after).toBeLessThanOrEqual(before);
    });
});
