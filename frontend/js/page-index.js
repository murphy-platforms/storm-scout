/**
 * page-index.js
 * Dashboard index page — loads overview stats, impacted offices, top advisories,
 * and weather observations; drives the update countdown timer.
 *
 * Key responsibilities:
 *   - Fetches overview stats, all active advisories, and weather observations
 *     in parallel on load and on each countdown expiry
 *   - Applies user-configured alert-type filters (AlertFilters) before
 *     aggregating and rendering so dashboards counts match the offices page
 *   - Groups impacted offices by severity (Extreme/Severe/Moderate/Minor)
 *     and renders collapsible severity sections (Moderate and Minor collapsed
 *     by default to keep the critical information above the fold)
 *   - Drives a per-second countdown to the next scheduled ingestion cycle
 *   - Shows a filter indicator in the nav when non-default filters are active
 *   - Exposes window.exportCurrentData for the export dropdown buttons
 *
 * State variables:
 *   nextUpdateTime    - Date object for the next ingestion cycle; drives countdown
 *   countdownInterval - setInterval handle; cleared/replaced on each data reload
 *   observationsMap   - Keyed by office_code; provides temperature for each card
 *
 * External dependencies (globals):
 *   API, AlertFilters, OfficeAggregator, StormScoutExport, debounce, html, raw,
 *   escapeHtml, truncate, cToF, isStale, timeAgo, formatDate, formatLocalTime,
 *   getSeverityBadge, renderEmptyHtml, renderErrorHtml, showError — from utils.js
 */

let nextUpdateTime = null;
let countdownInterval = null;
let observationsMap = {};

/**
 * Update the "next update" countdown display.
 * Called once immediately when a new nextUpdateTime is set, then via a
 * 1-second setInterval. When the countdown expires it triggers a data
 * reload (with a 2-second delay to allow the backend ingestion cycle to
 * complete) and stops the current interval.
 *
 * @returns {void}
 */
function updateCountdown() {
    if (!nextUpdateTime) return;

    const now = new Date();
    const diff = nextUpdateTime - now;

    if (diff <= 0) {
        document.getElementById('nextUpdate').textContent = 'Updating now...';
        // Reload data after a short delay
        setTimeout(() => loadOverview(), 2000);
        return;
    }

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    document.getElementById('nextUpdate').textContent = `${minutes}m ${seconds}s`;
}

/**
 * Fetch all dashboard data in parallel and render the full page.
 * Uses Promise.all for overview, advisories, and observations so
 * the three independent requests do not wait on each other.
 * Applies AlertFilters before aggregating so filtered counts match
 * the offices and advisories pages.
 * Wrapped so it can be called both on initial load and by the countdown
 * when the next ingestion cycle is due.
 *
 * @returns {Promise<void>}
 */
async function loadOverview() {
    try {
        // Get all raw data
        const [overviewData, allAdvisories, obsData] = await Promise.all([
            API.getOverview(),
            API.getActiveAdvisories(),
            API.getObservations().catch(() => [])
        ]);

        // Build observations lookup by office_code
        observationsMap = {};
        obsData.forEach((obs) => {
            observationsMap[obs.office_code] = obs;
        });

        // Update timestamp and countdown
        document.getElementById('lastUpdated').textContent = formatLocalTime(overviewData.last_updated);

        if (overviewData.last_updated && overviewData.update_interval_minutes) {
            const lastUpdate = new Date(overviewData.last_updated);
            nextUpdateTime = new Date(lastUpdate.getTime() + overviewData.update_interval_minutes * 60000);

            // Clear existing countdown interval
            if (countdownInterval) clearInterval(countdownInterval);

            // Update countdown immediately and then every second
            updateCountdown();
            countdownInterval = setInterval(updateCountdown, 1000);
        }

        // Apply user's filter preferences
        const filteredAdvisories = AlertFilters.filterAdvisories(allAdvisories);

        // Aggregate by office with deduplication
        const aggregatedSites = OfficeAggregator.aggregateByOffice(filteredAdvisories, { deduplicateZones: true });
        const groupedSites = OfficeAggregator.groupBySeverity(aggregatedSites);

        // Recalculate counts based on filtered data — set BEFORE rendering cards
        // so counts always display even if card rendering throws
        document.getElementById('totalSites').textContent = overviewData.total_offices;
        document.getElementById('sitesWithAdvisories').textContent = aggregatedSites.length;

        // Weather Impact Counts - based on sites with filtered advisories only
        const weatherImpactCounts = { red: 0, orange: 0, yellow: 0, green: 0 };
        const severityToImpact = { Extreme: 'red', Severe: 'orange', Moderate: 'yellow', Minor: 'green' };
        aggregatedSites.forEach((site) => {
            const level = severityToImpact[site.highest_severity] || 'green';
            weatherImpactCounts[level]++;
        });
        document.getElementById('weatherTotal').textContent =
            weatherImpactCounts.red + weatherImpactCounts.orange + weatherImpactCounts.yellow;
        document.getElementById('weatherRed').textContent = weatherImpactCounts.red;
        document.getElementById('weatherOrange').textContent = weatherImpactCounts.orange;
        document.getElementById('weatherYellow').textContent = weatherImpactCounts.yellow;

        // Render grouped site summaries (wrapped so card errors don't abort the rest)
        try {
            renderSiteGroups(groupedSites);
        } catch (renderErr) {
            console.error('Failed to render site groups:', renderErr);
        }

        // Show/hide "no sites" message
        const noSitesMsg = document.getElementById('noSitesMessage');
        if (aggregatedSites.length === 0) {
            noSitesMsg.classList.remove('d-none');
        } else {
            noSitesMsg.classList.add('d-none');
        }

        // Recalculate severity counts from filtered advisories
        const severityCounts = {};
        filteredAdvisories.forEach((adv) => {
            severityCounts[adv.severity] = (severityCounts[adv.severity] || 0) + 1;
        });

        const severityOrder = ['Extreme', 'Severe', 'Moderate', 'Minor'];
        const severityHTML = severityOrder
            .filter((sev) => severityCounts[sev] > 0)
            .map(
                (sev) =>
                    html` <div class="mb-2">
                        <a
                            href="advisories.html?severity=${sev}"
                            class="badge ${raw(getSeverityBadge(sev))} me-2 text-decoration-none"
                            >${sev}</a
                        >
                        <strong>${severityCounts[sev]}</strong> advisories
                    </div>`
            )
            .join('');
        document.getElementById('severityCounts').innerHTML =
            severityHTML ||
            '<p class="text-center text-muted mb-0"><i class="bi bi-cloud-sun me-1"></i>No active advisories</p>';

        // Sites with advisories (filter to show only sites with active advisories)
        const sitesWithAdvisoriesData = overviewData.recently_updated
            .filter((site) => {
                // Check if this site has any advisories in the filtered set
                return filteredAdvisories.some((adv) => adv.office_id === site.office_id);
            })
            .slice(0, 5);

        const sitesHTML = sitesWithAdvisoriesData
            .map((site) => {
                const weatherBadge = getWeatherBadge(site.weather_impact_level || 'green');
                const opsBadge = getOperationalBadge(site.operational_status || 'open_normal');
                return html`<div class="mb-2">
                    <a href="offices.html?office=${site.office_code}" class="text-decoration-none fw-bold"
                        >${site.office_code}</a
                    >
                    - ${site.name}<br />
                    <small>
                        <span class="badge ${raw(weatherBadge)} me-1"
                            >Weather: ${raw((site.weather_impact_level || 'green').toUpperCase())}</span
                        >
                        <span class="badge ${raw(opsBadge)}"
                            >Ops: ${raw(formatOperationalStatus(site.operational_status || 'open_normal'))}</span
                        >
                    </small>
                </div>`;
            })
            .join('');
        document.getElementById('recentlyUpdatedList').innerHTML =
            sitesHTML ||
            '<p class="text-center text-muted mb-0"><i class="bi bi-building me-1"></i>No offices with advisories</p>';

        function getWeatherBadge(level) {
            const badges = {
                red: 'weather-red',
                orange: 'weather-orange',
                yellow: 'weather-yellow',
                green: 'weather-green'
            };
            return badges[level] || 'weather-green';
        }

        function getOperationalBadge(status) {
            const badges = {
                closed: 'status-closed',
                open_restricted: 'status-restricted',
                pending: 'status-pending',
                open_normal: 'status-open'
            };
            return badges[status] || 'status-open';
        }

        function formatOperationalStatus(status) {
            const labels = { closed: 'CLOSED', open_restricted: 'RESTRICTED', pending: 'PENDING', open_normal: 'OPEN' };
            return labels[status] || 'OPEN';
        }
    } catch (error) {
        console.error('Failed to load overview:', error);
        showError('Failed to load dashboard data');
    }
}

/**
 * Render all four severity group sections.
 * Colors align with the Weather Impact Assessment colour scheme:
 *   Extreme → red, Severe → orange, Moderate → yellow, Minor → green.
 * Moderate and Minor sections default to collapsed to keep the critical
 * information visible without scrolling on typical dashboards.
 *
 * @param {Object} groupedSites - Object with extreme/severe/moderate/minor
 *                               arrays from OfficeAggregator.groupBySeverity
 * @returns {void}
 */
function renderSiteGroups(groupedSites) {
    renderSiteGroup(
        'extremeSitesSection',
        'extreme',
        '<i class="bi bi-circle-fill me-1" aria-hidden="true"></i> EXTREME - High Impact',
        groupedSites.extreme,
        false
    );
    renderSiteGroup(
        'severeSitesSection',
        'severe',
        '<i class="bi bi-circle-fill me-1" aria-hidden="true"></i> SEVERE - Severe Impact',
        groupedSites.severe,
        false
    );
    renderSiteGroup(
        'moderateSitesSection',
        'moderate',
        '<i class="bi bi-circle-fill me-1" aria-hidden="true"></i> MODERATE - Moderate Impact',
        groupedSites.moderate,
        true
    );
    renderSiteGroup(
        'minorSitesSection',
        'minor',
        '<i class="bi bi-circle-fill me-1" aria-hidden="true"></i> MINOR - Low Impact',
        groupedSites.minor,
        true
    );
}

/**
 * Render a single severity group as a collapsible Bootstrap section.
 * Shows up to 6 office cards inline; a "View All" link to offices.html
 * is appended when the group has more than 6 members.
 * Clears the container and returns early when the group is empty to avoid
 * rendering an empty accordion section.
 *
 * @param {string}        containerId - ID of the DOM element to populate
 * @param {string}        cssClass    - CSS severity class (e.g. 'extreme')
 * @param {string}        title       - Section heading HTML (may contain icons)
 * @param {Array<Object>} sites       - Aggregated office objects for this group
 * @param {boolean}       collapsed   - Whether the section starts collapsed
 * @returns {void}
 */
function renderSiteGroup(containerId, cssClass, title, sites, collapsed) {
    const container = document.getElementById(containerId);

    if (!sites || sites.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Sort by office code ascending within severity group
    const sorted = [...sites].sort((a, b) => a.office_code.localeCompare(b.office_code, undefined, { numeric: true }));

    const collapseId = `collapse${escapeHtml(cssClass)}`;
    const showClass = collapsed ? '' : 'show';

    container.innerHTML = html`
        <div class="row mb-3">
            <div class="col-12">
                <div
                    class="severity-group-header ${raw(escapeHtml(cssClass))} ${raw(collapsed ? 'collapsed' : '')}"
                    data-bs-toggle="collapse"
                    data-bs-target="#${raw(collapseId)}"
                >
                    <h4 class="severity-group-title">${raw(title)}</h4>
                    <span class="severity-group-count">${sites.length}</span>
                    <span class="severity-group-toggle">▼</span>
                </div>
                <div class="collapse ${raw(showClass)}" id="${raw(collapseId)}">
                    <div class="row mt-3">
                        ${raw(
                            sorted
                                .slice(0, 6)
                                .map((site) => renderSiteSummary(site, observationsMap[site.office_code]))
                                .join('')
                        )}
                    </div>
                    ${raw(
                        sorted.length > 6
                            ? `
                            <div class="text-center mt-2">
                                <a href="offices.html" class="btn btn-sm btn-outline-primary">
                                    View All ${sorted.length} Offices <i class="bi bi-arrow-right"></i>
                                </a>
                            </div>
                            `
                            : ''
                    )}
                </div>
            </div>
        </div>
    `;
}

/**
 * Build and return the HTML string for a single office summary card.
 * Shown inside each severity group section on the dashboard.
 *
 * @param {Object}      site - Aggregated office object from OfficeAggregator
 * @param {Object|null} obs  - Weather observation for this office, or null
 * @returns {string} HTML string for the card column element
 */
function renderSiteSummary(site, obs) {
    const severityClass = `office-card-${escapeHtml(site.highest_severity.toLowerCase())}`;
    const advisory = site.highest_severity_advisory || {};
    const headlineText = truncate(advisory.headline || '', 120);

    const tempHtml = renderTemperatureHTML(obs);

    return html`
        <div class="col-lg-4 col-md-6 col-12 mb-3">
            <a href="office-detail.html?office=${site.office_code}" class="text-decoration-none">
                <div class="card office-card card-clickable ${raw(severityClass)}" style="height: 100%;">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="mb-0 text-dark">
                                <strong>${site.office_code}</strong> - ${site.office_name}<br />
                                <small class="text-muted">${site.city}, ${site.state}</small>
                            </h6>
                            <div style="text-align: right;">
                                <span
                                    class="badge severity-badge severity-${raw(
                                        escapeHtml(site.highest_severity.toLowerCase())
                                    )}"
                                >
                                    ${site.highest_severity}
                                </span>
                                ${raw(tempHtml)}
                            </div>
                        </div>

                        <div class="mb-2 text-dark">
                            <strong>${advisory.advisory_type}</strong>
                            ${raw(
                                advisory.vtec_action === 'NEW'
                                    ? '<span class="badge action-badge-new ms-1"><i class="bi bi-bell-fill"></i> NEW</span>'
                                    : ''
                            )}
                            ${raw(
                                headlineText
                                    ? '<br><small class="text-muted" style="line-height: 1.3; display: inline-block; margin-top: 0.25rem;">' +
                                          escapeHtml(headlineText) +
                                          '</small>'
                                    : ''
                            )}
                        </div>

                        <small class="text-muted d-block mb-2">
                            ${raw(advisory.expires ? 'Expires: ' + formatDate(advisory.expires) : '')}
                        </small>

                        <div class="d-flex gap-2 align-items-center text-dark" style="font-size: 0.85rem;">
                            <span>
                                <strong>${site.unique_advisory_count}</strong> ${raw(
                                    site.unique_advisory_count === 1 ? 'alert' : 'alerts'
                                )}
                            </span>
                            ${raw(
                                site.total_zone_count !== site.unique_advisory_count
                                    ? `<span class="text-muted">(${site.total_zone_count} zones)</span>`
                                    : ''
                            )}
                            ${raw(
                                site.new_count > 0 ? `<span class="badge bg-success">${site.new_count} new</span>` : ''
                            )}
                        </div>
                    </div>
                </div>
            </a>
        </div>
    `;
}

/**
 * Show or update the filter indicator badge in the nav bar.
 * Displayed only when AlertFilters.hasActiveFilters() returns true so that
 * operators are reminded that some alert types are suppressed.
 *
 * @returns {void}
 */
function updateFilterIndicator() {
    const indicator = document.getElementById('filterIndicator');
    const filterCount = document.getElementById('filterCount');
    const filterTotal = document.getElementById('filterTotal');

    if (!indicator || !AlertFilters.alertTypesByLevel) return;

    const enabled = AlertFilters.getEnabledCount();
    const total = AlertFilters.getTotalAlertTypes();

    filterCount.textContent = enabled;
    filterTotal.textContent = total;

    // Show indicator only if filters are active (not showing all)
    if (AlertFilters.hasActiveFilters()) {
        indicator.classList.remove('d-none');
    } else {
        indicator.classList.add('d-none');
    }
}

// Initialize filters then load overview
AlertFilters.init().then(() => {
    updateFilterIndicator();
    loadOverview();
});

// Helper function to export current dashboard data
window.exportCurrentData = async function (type) {
    try {
        // Fetch current data
        const overviewResponse = await fetch('/api/status/overview');
        const officesResponse = await fetch('/api/status/offices-impacted');
        const advisoriesResponse = await fetch('/api/advisories/active');

        if (!overviewResponse.ok || !officesResponse.ok || !advisoriesResponse.ok) {
            throw new Error('Failed to fetch data for export');
        }

        const overview = await overviewResponse.json();
        const officesData = await officesResponse.json();
        const advisories = await advisoriesResponse.json();

        // Extract offices array from the response
        const offices = Array.isArray(officesData.data) ? officesData.data : [];

        // Export based on type
        switch (type) {
            case 'csv':
                StormScoutExport.exportOfficesToCSV(offices);
                break;
            case 'executive':
                StormScoutExport.generateHTMLReport({ offices, advisories, overview }, 'executive');
                break;
            case 'incident':
                StormScoutExport.generateHTMLReport({ offices, advisories }, 'incident');
                break;
            case 'summary':
                StormScoutExport.generateHTMLReport({ offices }, 'summary');
                break;
            default:
                console.error('Unknown export type:', type);
        }
    } catch (error) {
        console.error('Export failed:', error);
        StormScoutExport.showNotification('✗ Export failed', 'error');
    }
};

// Event listeners for export buttons (CSP-compliant)
document.getElementById('exportPrintPDF').addEventListener('click', (e) => {
    e.preventDefault();
    StormScoutExport.printToPDF();
});
document.getElementById('exportShareLink').addEventListener('click', (e) => {
    e.preventDefault();
    StormScoutExport.copyShareableLink();
});
document.getElementById('exportExecutive').addEventListener('click', (e) => {
    e.preventDefault();
    exportCurrentData('executive');
});
document.getElementById('exportIncident').addEventListener('click', (e) => {
    e.preventDefault();
    exportCurrentData('incident');
});
document.getElementById('exportCSV').addEventListener('click', (e) => {
    e.preventDefault();
    exportCurrentData('csv');
});
