'use strict';
/**
 * Simulates the full page-map.js data flow to surface any JS errors
 * before they reach the browser.
 */
require('dotenv').config();
const http = require('http');

function get(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve(JSON.parse(body)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

const BASE = 'http://localhost:3000/api';

const RANKS = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 };

function getSeverityRank(s) {
    return RANKS[s] || 0;
}

function aggregateByOffice(advisories) {
    const map = new Map();
    advisories.forEach((adv) => {
        if (!map.has(adv.office_id)) {
            map.set(adv.office_id, {
                office_id: adv.office_id,
                advisories: [],
                highest_severity: null,
                highest_severity_rank: 0
            });
        }
        const o = map.get(adv.office_id);
        o.advisories.push(adv);
        const rank = getSeverityRank(adv.severity);
        if (rank > o.highest_severity_rank) {
            o.highest_severity = adv.severity;
            o.highest_severity_rank = rank;
        }
    });
    return Array.from(map.values()).map((o) => ({
        ...o,
        highest_severity_advisory: o.advisories.find((a) => a.severity === o.highest_severity)
    }));
}

(async () => {
    try {
        // Step 1: AlertFilters.init()
        const filtersResp = await get(`${BASE}/filters`);
        if (!filtersResp.success) throw new Error('GET /filters failed: ' + filtersResp.error);
        const filterConfigs = filtersResp.data;

        const typesResp = await get(`${BASE}/filters/types/all`);
        if (!typesResp.success) throw new Error('GET /filters/types/all failed: ' + typesResp.error);
        const alertTypesByLevel = typesResp.data;

        // Simulate applyPreset('CUSTOM') — no localStorage in private browser
        const preset = filterConfigs['CUSTOM'];
        if (!preset) throw new Error('CUSTOM preset not found in filterConfigs');
        const userFilters = {};
        for (const [level, types] of Object.entries(alertTypesByLevel)) {
            if (preset.includeCategories.includes(level)) {
                types.forEach((t) => {
                    if (!preset.excludeTypes || !preset.excludeTypes.includes(t)) {
                        userFilters[t] = true;
                    }
                });
            }
        }
        console.log('userFilters enabled count:', Object.keys(userFilters).length);

        // Step 2: Promise.all API calls
        const [advResp, offResp, obsResp] = await Promise.all([
            get(`${BASE}/advisories/active`),
            get(`${BASE}/offices`),
            get(`${BASE}/observations`).catch(() => ({ success: true, data: [] }))
        ]);

        if (!advResp.success) throw new Error('GET /advisories/active failed');
        if (!offResp.success) throw new Error('GET /offices failed');

        const allAdvisories = advResp.data;
        const allOffices = offResp.data;
        const obsData = obsResp.data || [];

        console.log('allAdvisories:', allAdvisories.length);
        console.log('allOffices:', allOffices.length);

        // Step 3: filterAdvisories
        const filteredAdvisories = allAdvisories.filter((a) => userFilters[a.advisory_type] === true);
        console.log('filteredAdvisories:', filteredAdvisories.length);

        const filtered_out = allAdvisories.filter((a) => !userFilters[a.advisory_type]);
        if (filtered_out.length) {
            const types = [...new Set(filtered_out.map((a) => a.advisory_type))];
            console.log('Filtered OUT types:', types);
        }

        // Step 4: aggregate
        const aggregated = aggregateByOffice(filteredAdvisories);
        console.log('aggregated offices:', aggregated.length);

        // Step 5: build officesWithAdvisories
        const aggMap = new Map(aggregated.map((o) => [o.office_id, o]));
        const officesWithAdvisories = allOffices
            .filter((o) => aggMap.has(o.id))
            .map((o) => ({ ...o, ...aggMap.get(o.id) }));
        console.log('officesWithAdvisories:', officesWithAdvisories.length);

        // Step 6: simulate renderMarkers — spot every potential throw
        let errors = 0;
        officesWithAdvisories.forEach((office, i) => {
            const severity = office.highest_severity || 'Minor';
            const severityClass = `marker-${severity.toLowerCase()}`;

            const hsa = office.highest_severity_advisory;
            if (!hsa) {
                console.error(
                    `[${i}] MISSING highest_severity_advisory — office_code: ${office.office_code}, highest_severity: ${office.highest_severity}`
                );
                errors++;
                return;
            }
            // line 104 equivalent
            const headlineText = (hsa.headline || '').substring(0, 80);
            // line 117 equivalent
            const advType = hsa.advisory_type;
            if (!advType) {
                console.error(
                    `[${i}] advisory_type is null on highest_severity_advisory — office_code: ${office.office_code}`
                );
                errors++;
            }
        });

        if (errors === 0) {
            console.log('\nSimulation PASSED — no renderMarkers errors found');
        } else {
            console.log(`\nSimulation FAILED — ${errors} error(s) found`);
        }
    } catch (e) {
        console.error('\nSIMULATION THREW:', e.message);
    }
})();
