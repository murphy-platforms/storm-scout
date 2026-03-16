/**
 * Notices E2E Tests
 * Verifies jurisdiction filtering behavior on notices page.
 */

const { test, expect } = require('@playwright/test');

async function mockNoticesApis(page) {
    const now = new Date().toISOString();

    await page.route(/\/api\/notices\/active(?:\?.*)?$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                data: [
                    {
                        id: 1,
                        title: 'Federal Weather Operations Bulletin',
                        jurisdiction_type: 'Federal',
                        jurisdiction: 'NOAA',
                        notice_type: 'Operations',
                        description: 'Federal coordination notice for weather operations.',
                        effective_time: now,
                        affected_states: 'AK, FL',
                        source_url: 'https://example.com/federal'
                    },
                    {
                        id: 2,
                        title: 'State Emergency Operations Update',
                        jurisdiction_type: 'State',
                        jurisdiction: 'Alaska',
                        notice_type: 'Emergency Declaration',
                        description: 'State-level weather emergency update.',
                        effective_time: now,
                        affected_states: 'AK',
                        source_url: 'https://example.com/state'
                    }
                ]
            })
        });
    });
}

test.describe('Notices', () => {
    test('filters notice cards by jurisdiction type', async ({ page }) => {
        await mockNoticesApis(page);
        await page.goto('/notices.html');
        await page.waitForLoadState('networkidle');

        await expect(page.getByText('Federal Weather Operations Bulletin')).toBeVisible();
        await expect(page.getByText('State Emergency Operations Update')).toBeVisible();

        await page.locator('#jurisdictionFilter').selectOption('Federal');

        await expect(page.getByText('Federal Weather Operations Bulletin')).toBeVisible();
        await expect(page.getByText('State Emergency Operations Update')).toHaveCount(0);
    });
});
