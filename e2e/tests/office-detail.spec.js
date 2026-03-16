/**
 * Office Detail E2E Tests
 * Verifies office drill-down and alert modal behavior.
 */

const { test, expect } = require('@playwright/test');

async function mockOfficeDetailApis(page) {
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await page.route(/\/api\/filters\/types\/all(?:\?.*)?$/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                data: {
                    CRITICAL: ['Blizzard Warning'],
                    HIGH: [],
                    MODERATE: [],
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
                        longitude: -149.9003,
                        cwa: 'AFC'
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
                        id: 42,
                        office_id: 1,
                        office_code: '99501',
                        office_name: 'Anchorage Central',
                        city: 'Anchorage',
                        state: 'AK',
                        advisory_type: 'Blizzard Warning',
                        severity: 'Extreme',
                        vtec_action: 'NEW',
                        issued_time: now,
                        last_updated: now,
                        expires,
                        source: 'NWS-AFC',
                        headline: 'Life-threatening blizzard conditions expected',
                        description:
                            '* WHAT...Heavy snow and dangerous winds.\n\n* WHEN...Through tonight.\n\n* IMPACTS...Travel may be impossible.',
                        vtec_code: '/O.NEW.PAFC.BZ.W.0001.260316T0000Z-260316T0600Z/'
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

test.describe('Office Detail', () => {
    test('drills down from impacted offices list to office detail page', async ({ page }) => {
        await mockOfficeDetailApis(page);
        await page.goto('/offices.html');
        await page.waitForLoadState('networkidle');

        const officeLink = page.locator('a[href*="office-detail.html?office=99501"]').first();
        await expect(officeLink).toBeVisible();
        await officeLink.click();

        await expect(page).toHaveURL(/office-detail\.html\?office=99501/);
        await expect(page.locator('#officeContent')).toBeVisible();
        await expect(page.locator('#officeCode')).toHaveText('99501');
    });

    test('opens the alert detail modal from office detail view', async ({ page }) => {
        await mockOfficeDetailApis(page);
        await page.goto('/office-detail.html?office=99501');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('#officeContent')).toBeVisible();

        const viewAlertBtn = page.locator('.view-alert-btn').first();
        await expect(viewAlertBtn).toBeVisible();
        await viewAlertBtn.click();

        await expect(page.locator('#alertDetailModal')).toBeVisible();
        await expect(page.locator('#alertDetailModalBody')).toContainText('Full Alert Details');
        await expect(page.locator('#alertDetailModalLabel')).toContainText('Blizzard Warning');
    });
});
