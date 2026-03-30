/**
 * page-advisories.js
 * Advisories page — renders active NOAA advisories in card and table views;
 * applies user filter preferences; supports free-text search with debounce.
 *
 * Key responsibilities:
 *   - Loads all active NOAA advisories and weather observations in parallel
 *   - Applies a single unified view filter (alert-type preset OR severity),
 *     state filter, and free-text search
 *   - Supports two views: card view (office cards) and grouped table view
 *   - Shows a filter-warning banner when hidden alerts include critical types
 *   - Handles ?severity= URL parameter to pre-select a severity option on load
 *
 * State variables:
 *   allAdvisories          - Current working set of advisories (may be pre-filtered
 *                            by applyURLParameters if ?severity= is set)
 *   allAdvisoriesUnfiltered - Full raw advisory list used for filter-warning diff
 *   observationsMap        - Keyed by office_code; provides temperature readings
 *   currentView            - 'card' or 'table'; controls which renderer runs
 *
 * External dependencies (globals from loaded scripts):
 *   API               - backend REST client (api.js)
 *   AlertFilters      - user preference engine (alert-filters.js)
 *   OfficeAggregator  - aggregation/severity helpers (office-aggregator.js)
 *   debounce, html, raw, escapeHtml, truncate, cToF, isStale, timeAgo,
 *   formatDate, getSeverityBadge, getActionBadge, renderEmptyHtml,
 *   renderErrorHtml, renderFilterWarning  — from utils.js / shared helpers
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

let allAdvisories = [];
let allAdvisoriesUnfiltered = [];
let observationsMap = {};
let currentView = 'card';

/**
 * Determine whether an advisory type should be shown under a given named filter preset.
 * When no filterName is supplied the user's saved AlertFilters preferences govern.
 * When a preset name is supplied the preset's includeCategories and excludeTypes
 * fields are applied directly — enabling the filter dropdown to override preferences
 * without permanently mutating localStorage.
 *
 * @param {string} alertType   - NOAA alert type string (e.g. "Tornado Warning")
 * @param {string} filterName  - Optional named preset key from AlertFilters.filterConfigs;
 *                               pass '' or null to use the user's active preferences
 * @returns {boolean} True if the alert type should be included in the current view
 */
function shouldIncludeAlertType(alertType, filterName) {
    if (!filterName || filterName === '') {
        return AlertFilters.shouldIncludeAlertType(alertType);
    }

    const config = AlertFilters.filterConfigs[filterName];
    if (!config) return true;

    if (config.excludeTypes && config.excludeTypes.includes(alertType)) {
        return false;
    }

    let impactLevel = null;
    for (const [level, types] of Object.entries(AlertFilters.alertTypesByLevel)) {
        if (types.includes(alertType)) {
            impactLevel = level;
            break;
        }
    }

    if (!impactLevel) return true;
    return config.includeCategories && config.includeCategories.includes(impactLevel);
}

/**
 * Fetch all active advisories and current weather observations, then
 * build the observations lookup map and trigger the initial render.
 * Advisories and observations are loaded in parallel via Promise.allSettled
 * so partial failures show degraded banners instead of a blank page.
 *
 * @returns {Promise<void>}
 */
async function loadAdvisories() {
    try {
        const results = await Promise.allSettled([API.getActiveAdvisories(), API.getObservations()]);
        const data = settledValue(results, 0, [], 'Advisories');
        const obsData = settledValue(results, 1, [], 'Weather observations');

        // Build observations lookup by office_code
        observationsMap = {};
        obsData.forEach((obs) => {
            observationsMap[obs.office_code] = obs;
        });

        allAdvisoriesUnfiltered = data;
        // Apply location filter before any other filtering
        allAdvisories = LocationFilters.filterAdvisoriesByLocation(data);

        // Populate state filter
        const states = [...new Set(data.map((a) => a.state))].sort();
        const stateSelect = document.getElementById('stateFilter');
        stateSelect.innerHTML = '<option value="">All States</option>';
        states.forEach((state) => {
            const option = document.createElement('option');
            option.value = state;
            option.textContent = state;
            stateSelect.appendChild(option);
        });

        // Initial render
        renderAll();
    } catch (error) {
        document.getElementById('cardViewContainer').innerHTML = renderErrorHtml('Failed to load advisories');
        document.getElementById('advisoriesTable').innerHTML =
            `<tr><td colspan="11"><div class="alert alert-danger mb-0" role="alert"><i class="bi bi-exclamation-triangle-fill me-2"></i>Failed to load advisories</div></td></tr>`;
    }
}

// getActionBadge() is defined in js/utils.js

function sortSites(sites) {
    const order = document.getElementById('sortOrder').value;
    return [...sites].sort((a, b) => {
        switch (order) {
            case 'severity':
                return b.urgency_score - a.urgency_score;
            case 'office':
                return a.office_code.localeCompare(b.office_code, undefined, { numeric: true });
            case 'alerts':
                return b.unique_advisory_count - a.unique_advisory_count;
            case 'state':
                return a.state.localeCompare(b.state) || b.urgency_score - a.urgency_score;
            default:
                return 0;
        }
    });
}

/**
 * Render all offices with active advisories as a grouped HTML table.
 * Each office is represented by a clickable header row summarising its
 * highest severity and alert count, followed by one sub-row per alert
 * sorted highest-severity-first within each office group.
 * Summary stats (unique offices, critical/severe counts, etc.) are also
 * re-rendered so they stay in sync when the filter state changes in table view.
 *
 * @param {Array<Object>} sites             - Aggregated office objects from
 *                                            OfficeAggregator.aggregateByOffice
 * @param {Array<Object>} filteredAdvisories - Flat advisory array used to
 *                                            compute summary stats
 * @returns {void}
 */
function renderGroupedTable(sites, filteredAdvisories) {
    const tbody = document.getElementById('advisoriesTable');
    const statsContainer = document.getElementById('summaryStatsContainer');

    if (sites.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11">${renderEmptyHtml('cloud-sun', 'No active advisories', 'No advisories match your current filter settings.')}</td></tr>`;
        statsContainer.innerHTML = '';
        return;
    }

    // Render summary stats (keeps stats updated when filters change in table view)
    const stats = OfficeAggregator.getSummaryStats(filteredAdvisories, sites);
    const extremeCount = sites.filter((s) => s.highest_severity === 'Extreme').length;
    const severeCount = sites.filter((s) => s.highest_severity === 'Severe').length;
    statsContainer.innerHTML = `
                <div class="col-12">
                    <div class="summary-stats">
                        <div class="summary-stat">
                            <span class="summary-stat-value">${stats.unique_offices}</span>
                            <span class="summary-stat-label">Locations Impacted</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value"><span class="text-severity-extreme">${extremeCount}</span> / <span class="text-severity-severe">${severeCount}</span></span>
                            <span class="summary-stat-label">Extreme/Severe</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value text-severity-moderate">${stats.moderate_offices}</span>
                            <span class="summary-stat-label">Moderate</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value text-severity-minor">${stats.new_alerts}</span>
                            <span class="summary-stat-label">New Alerts</span>
                        </div>
                    </div>
                </div>
            `;

    const sorted = sortSites(sites);

    let rowsHtml = '';
    sorted.forEach((site) => {
        const obs = observationsMap[site.office_code];
        const tempSpan = renderTemperatureHTML(obs);
        const alertCount = site.advisories.length;
        const sevLower = site.highest_severity.toLowerCase();

        // Office header row
        rowsHtml += `<tr class="office-group-header office-group-${escapeHtml(sevLower)}" data-office-code="${escapeHtml(site.office_code)}">
                    <td colspan="11">
                        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
                            <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
                                <strong>${escapeHtml(site.office_code)}</strong>
                                <span>${escapeHtml(site.office_name)}</span>
                                <span class="text-muted"><i class="bi bi-geo-alt"></i> ${escapeHtml(site.city)}, ${escapeHtml(site.state)}</span>
                                ${tempSpan}
                            </div>
                            <div style="display:flex;align-items:center;gap:0.5rem;">
                                <span class="badge bg-light text-dark">${alertCount} alert${alertCount !== 1 ? 's' : ''}</span>
                                <span class="badge severity-${escapeHtml(sevLower)}">${escapeHtml(site.highest_severity)}</span>
                            </div>
                        </div>
                    </td>
                </tr>`;

        // Sort alerts: highest severity first
        const sortedAdvs = [...site.advisories].sort(
            (a, b) => OfficeAggregator.getSeverityRank(b.severity) - OfficeAggregator.getSeverityRank(a.severity)
        );

        // Alert sub-rows
        sortedAdvs.forEach((adv) => {
            const headlineShort = truncate(adv.headline || '', 80);
            rowsHtml += html`<tr class="office-group-row">
                <td colspan="6" class="ps-4 text-muted">
                    <small>${headlineShort}</small>
                </td>
                <td><strong>${adv.advisory_type}</strong></td>
                <td>
                    ${raw(`<span class="badge ${getSeverityBadge(adv.severity)}">${escapeHtml(adv.severity)}</span>`)}
                </td>
                <td>${raw(getActionBadge(adv.vtec_action))}</td>
                <td>${adv.source}</td>
                <td>${raw(formatDate(adv.last_updated))}</td>
            </tr>`;
        });
    });

    tbody.innerHTML = rowsHtml;

    // Click handlers: office header rows navigate to office detail
    tbody.querySelectorAll('.office-group-header').forEach((row) => {
        row.addEventListener('click', () => {
            window.location.href = `office-detail.html?office=${row.dataset.officeCode}`;
        });
    });
}

/**
 * Entry point for all re-renders — delegates to filterAndRender so that
 * every render path always applies the current filter state.
 * Named `renderAll` for external callers (e.g. event listeners) that
 * need a stable reference even if the internal implementation changes.
 *
 * @returns {void}
 */
function renderAll() {
    filterAndRender();
}

/**
 * Read all active filter controls, apply them to the full advisory list,
 * aggregate results by office, then delegate to the correct view renderer.
 * The dual-view design (card vs. table) keeps the same filter+aggregate
 * pipeline but hands off to different renderers so each view can optimise
 * its own DOM structure independently.
 *
 * @returns {void}
 */
function filterAndRender() {
    const search = document.getElementById('searchBox').value.toLowerCase();
    const viewFilter = document.getElementById('viewFilter').value;
    const state = document.getElementById('stateFilter').value;
    const dedupEnabled = document.getElementById('dedupToggle').checked;

    // Parse the unified viewFilter: preset names apply alert-type filtering,
    // "severity:X" values apply severity filtering, "all" disables both.
    let alertTypeFilter = '';
    let severity = '';

    if (viewFilter.startsWith('severity:')) {
        severity = viewFilter.split(':')[1];
    } else if (viewFilter !== 'all') {
        alertTypeFilter = viewFilter;
    }

    // Filter advisories
    let filtered = allAdvisories.filter((adv) => {
        if (
            search &&
            !(adv.office_code.toLowerCase().includes(search) || adv.office_name.toLowerCase().includes(search))
        )
            return false;
        if (alertTypeFilter && !shouldIncludeAlertType(adv.advisory_type, alertTypeFilter)) return false;
        if (state && adv.state !== state) return false;
        if (severity && adv.severity !== severity) return false;
        return true;
    });

    // Show filter warning (shared renderFilterWarning from utils.js)
    renderFilterWarning(allAdvisoriesUnfiltered, filtered, { onShowAll: showAllAlerts });

    // Aggregate by office
    const aggregatedSites = OfficeAggregator.aggregateByOffice(filtered, { deduplicateZones: dedupEnabled });

    // Render based on current view
    if (currentView === 'card') {
        renderCardView(aggregatedSites, filtered);
    } else {
        renderGroupedTable(aggregatedSites, filtered);
    }
}

/**
 * Render the card-view grid of impacted offices.
 * One Bootstrap card is emitted per aggregated office, sorted ascending
 * by office code. The summary stats bar is re-rendered alongside the
 * cards so it reflects the current filter state.
 *
 * @param {Array<Object>} sites             - Aggregated office objects
 * @param {Array<Object>} originalAdvisories - Flat advisory array for stats calculation
 * @returns {void}
 */
function renderCardView(sites, originalAdvisories) {
    const container = document.getElementById('cardViewContainer');
    const statsContainer = document.getElementById('summaryStatsContainer');

    if (sites.length === 0) {
        container.innerHTML = renderEmptyHtml(
            'cloud-sun',
            'No advisories match your filters',
            'Try adjusting your filter settings to see more results.'
        );
        statsContainer.innerHTML = '';
        return;
    }

    // Render summary stats
    const stats = OfficeAggregator.getSummaryStats(originalAdvisories, sites);
    const extremeCount = sites.filter((s) => s.highest_severity === 'Extreme').length;
    const severeCount = sites.filter((s) => s.highest_severity === 'Severe').length;
    statsContainer.innerHTML = `
                <div class="col-12">
                    <div class="summary-stats">
                        <div class="summary-stat">
                            <span class="summary-stat-value">${stats.unique_offices}</span>
                            <span class="summary-stat-label">Locations Impacted</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value"><span class="text-severity-extreme">${extremeCount}</span> / <span class="text-severity-severe">${severeCount}</span></span>
                            <span class="summary-stat-label">Extreme/Severe</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value text-severity-moderate">${stats.moderate_offices}</span>
                            <span class="summary-stat-label">Moderate</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value text-severity-minor">${stats.new_alerts}</span>
                            <span class="summary-stat-label">New Alerts</span>
                        </div>
                    </div>
                </div>
            `;

    const sorted = sortSites(sites);
    container.innerHTML = sorted
        .map((office) => renderOfficeCard(office, observationsMap[office.office_code]))
        .join('');
}

/**
 * Build and return the HTML string for a single office advisory card.
 * Includes the highest-severity alert summary, zone count, action badges,
 * and current temperature if an observation is available.
 *
 * @param {Object}      site - Aggregated office object from OfficeAggregator
 * @param {Object|null} obs  - Weather observation for this office, or null
 * @returns {string} HTML string for the card column element
 */
function renderOfficeCard(site, obs) {
    const severityClass = `office-card-${escapeHtml(site.highest_severity.toLowerCase())}`;
    const highestAlert = site.highest_severity_advisory;
    const headlineText = truncate(highestAlert.headline || '', 120);

    const tempHtml = renderTemperatureHTML(obs);

    return html`
        <div class="col-lg-6 col-12">
            <a href="office-detail.html?office=${site.office_code}" class="text-decoration-none">
                <div class="card office-card card-clickable ${raw(severityClass)}">
                    <div class="office-card-header">
                        <div>
                            <h5 class="office-card-title text-dark">
                                <strong>${site.office_code}</strong> - ${site.office_name}
                            </h5>
                            <div class="office-card-location">
                                <i class="bi bi-geo-alt"></i> ${site.city}, ${site.state}
                            </div>
                        </div>
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
                    <div class="office-card-body">
                        <!-- Highest severity alert -->
                        <div style="margin-bottom: 0.75rem;">
                            <strong class="text-dark">${highestAlert.advisory_type}</strong>
                            ${raw(
                                highestAlert.vtec_action === 'NEW'
                                    ? '<span class="badge action-badge-new ms-2"><i class="bi bi-bell-fill"></i> NEW</span>'
                                    : ''
                            )}
                            ${raw(
                                headlineText
                                    ? '<br><small class="text-muted" style="line-height: 1.3; display: inline-block; margin-top: 0.25rem;">' +
                                          escapeHtml(headlineText) +
                                          '</small>'
                                    : ''
                            )}
                            <br />
                            <small class="text-muted">
                                ${raw(highestAlert.expires ? 'Expires: ' + formatDate(highestAlert.expires) : '')}
                            </small>
                        </div>

                        <!-- Alert summary -->
                        <div class="alert-summary">
                            <div class="alert-stat">
                                <span class="alert-stat-icon">📊</span>
                                <span class="text-dark">
                                    <span class="alert-stat-value">${site.unique_advisory_count}</span>
                                    unique ${raw(site.unique_advisory_count === 1 ? 'alert' : 'alerts')}
                                    ${raw(
                                        site.total_zone_count !== site.unique_advisory_count
                                            ? `<span class="text-muted">(${site.total_zone_count} zones)</span>`
                                            : ''
                                    )}
                                </span>
                            </div>
                            ${raw(
                                site.new_count > 0
                                    ? `
                                    <div class="alert-stat">
                                        <span class="alert-stat-icon"><i class="bi bi-bell-fill"></i></span>
                                        <span class="text-dark"><span class="alert-stat-value">${site.new_count}</span> new</span>
                                    </div>
                                    `
                                    : ''
                            )}
                            ${raw(
                                site.continued_count > 0
                                    ? `
                                    <div class="alert-stat">
                                        <span class="alert-stat-icon"><i class="bi bi-arrow-repeat"></i></span>
                                        <span class="text-dark"><span class="alert-stat-value">${site.continued_count}</span> continued</span>
                                    </div>
                                    `
                                    : ''
                            )}
                        </div>

                        <!-- Advisory types -->
                        <div class="advisory-type-list">
                            ${raw(
                                site.type_groups
                                    .map(
                                        (group) => html`
                                            <div class="advisory-type-item">
                                                <span class="advisory-type-name">${group.type}</span>
                                                <div class="advisory-type-meta">
                                                    ${raw(
                                                        `<span class="badge ${getSeverityBadge(group.severity)}">${escapeHtml(group.severity)}</span>`
                                                    )}
                                                    ${raw(
                                                        group.zone_count > 1
                                                            ? `<span class="badge zone-badge zone-badge-multi" title="${group.zone_count} NWS zones">
                                                        <i class="bi bi-layers"></i> ${group.zone_count} zones
                                                    </span>`
                                                            : `<span class="badge zone-badge">${escapeHtml(group.representative.source || 'NWS')}</span>`
                                                    )}
                                                </div>
                                            </div>
                                        `
                                    )
                                    .join('')
                            )}
                        </div>
                    </div>
                </div>
            </a>
        </div>
    `;
}

/**
 * Switch between card and table views.
 * Toggles active state on the view-selector buttons, shows/hides the
 * corresponding container elements, and triggers a full re-render so the
 * new view reflects the current filter state immediately.
 * Both containers remain in the DOM at all times (toggled via d-none) to
 * avoid losing scroll position on the inactive container when switching back.
 *
 * @param {'card'|'table'} view - Target view identifier
 * @returns {void}
 */
function switchView(view) {
    currentView = view;

    if (view === 'card') {
        document.getElementById('cardViewBtn').classList.add('active');
        document.getElementById('tableViewBtn').classList.remove('active');
        document.getElementById('cardViewContainer').classList.remove('d-none');
        document.getElementById('tableViewContainer').classList.add('d-none');
    } else {
        document.getElementById('cardViewBtn').classList.remove('active');
        document.getElementById('tableViewBtn').classList.add('active');
        document.getElementById('cardViewContainer').classList.add('d-none');
        document.getElementById('tableViewContainer').classList.remove('d-none');
    }

    renderAll();
}

/**
 * Reset all filter controls to their "show everything" state and re-render.
 * Called by the "Show All Alerts" button in the filter-warning banner so
 * operators can quickly clear accidental over-filtering with a single click.
 *
 * @returns {void}
 */
function showAllAlerts() {
    document.getElementById('searchBox').value = '';
    document.getElementById('viewFilter').value = 'all';
    document.getElementById('stateFilter').value = '';
    renderAll();
}

// Event listeners
// 300ms debounce on the search box: balances immediate-feeling response
// against avoiding a render on every keystroke during fast typing.
document.getElementById('searchBox').addEventListener('input', debounce(renderAll, 300));
document.getElementById('viewFilter').addEventListener('change', renderAll);
document.getElementById('stateFilter').addEventListener('change', renderAll);
document.getElementById('dedupToggle').addEventListener('change', renderAll);
document.getElementById('sortOrder').addEventListener('change', renderAll);
document.getElementById('cardViewBtn').addEventListener('click', () => switchView('card'));
document.getElementById('tableViewBtn').addEventListener('click', () => switchView('table'));

/**
 * Read URL query parameters and pre-populate filter controls accordingly.
 * Supports ?severity= so that links from the dashboard's severity badges
 * open the advisories page pre-filtered to the clicked severity level.
 * Called after advisories are loaded so the filter applies to real data.
 *
 * @returns {void}
 */
function applyURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const severityParam = urlParams.get('severity');

    if (severityParam) {
        // Auto-select severity option in the unified view filter
        document.getElementById('viewFilter').value = `severity:${severityParam}`;
        renderAll();
    }
}

function updateFilterIndicator() {
    const row = document.getElementById('filterIndicatorRow');
    if (!row || !AlertFilters.alertTypesByLevel) return;

    const hasAlertFilters = AlertFilters.hasActiveFilters();
    const hasLocationFilters = LocationFilters.hasActiveFilters();

    // Show row if either filter type is active
    row.classList.toggle('d-none', !hasAlertFilters && !hasLocationFilters);

    // Alert filter badge
    const alertBadge = document.getElementById('alertFilterIndicator');
    if (alertBadge) {
        document.getElementById('filterCount').textContent = AlertFilters.getEnabledCount();
        document.getElementById('filterTotal').textContent = AlertFilters.getTotalAlertTypes();
        alertBadge.classList.toggle('d-none', !hasAlertFilters);
    }

    // Location filter badge
    const locBadge = document.getElementById('locationFilterIndicator');
    if (locBadge && LocationFilters.getTotalCount() > 0) {
        document.getElementById('locationFilterCount').textContent = LocationFilters.getEnabledCount();
        document.getElementById('locationFilterTotal').textContent = LocationFilters.getTotalCount();
        locBadge.classList.toggle('d-none', !hasLocationFilters);
    }
}

// Initialize both filter modules then load advisories
Promise.all([LocationFilters.init(), AlertFilters.init()]).then(() => {
    updateFilterIndicator();
    loadAdvisories();
    // Apply URL parameters after advisories are loaded
    setTimeout(() => applyURLParameters(), 100);
});
