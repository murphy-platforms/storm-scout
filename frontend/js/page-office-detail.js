/**
 * page-office-detail.js
 * Office detail page — loads a single office, its active advisories,
 * and current weather observations; renders advisory cards with VTEC metadata.
 *
 * Key responsibilities:
 *   - Reads the office code from the URL (?office= preferred, ?site= for legacy)
 *   - Fetches all advisories, offices, and observations in parallel
 *   - Aggregates and deduplicates advisories for the target office
 *   - Renders: office header, highest alert card, impact summary, timeline,
 *     and full advisory list with VTEC action badges and NWS external links
 *   - Provides a modal detail view with full NOAA alert narrative
 *
 * State variables:
 *   officeData       - The matched office record from the offices API
 *   officeAdvisories - Raw advisory records for this office (pre-aggregation)
 *
 * External dependencies (globals):
 *   API, OfficeAggregator, html, raw, escapeHtml, truncate, cToF, isStale,
 *   timeAgo, formatDate, getSeverityBadge, getActionBadge, getActionBadgeWithTime,
 *   renderEmptyHtml, renderErrorHtml — from utils.js / shared helpers
 *   bootstrap (for modal instantiation)
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

let officeData = null;
let officeAdvisories = [];

/**
 * Main entry point — reads the office code from URL params, fetches all
 * required data in parallel, matches the target office, and orchestrates
 * the render sequence for each page section.
 *
 * URL parameter handling:
 *   ?office=XXXXX  - preferred format (5-digit zip code)
 *   ?site=XXXXX    - legacy alias retained for backwards compatibility
 *                    with bookmarked or externally shared links
 *
 * @returns {Promise<void>}
 */
async function loadOfficeDetail() {
    try {
        // Get office code from URL (?office= preferred, ?site= for legacy links)
        const urlParams = new URLSearchParams(window.location.search);
        const officeCode = urlParams.get('office') || urlParams.get('site');

        if (!officeCode) {
            showError('No office code provided in URL');
            return;
        }

        // Load all advisories, offices, and observations
        const [allAdvisories, allOffices, obsData] = await Promise.all([
            API.getActiveAdvisories(),
            API.getOffices(),
            API.getObservations().catch(() => [])
        ]);

        // Find the office
        officeData = allOffices.find((s) => s.office_code === officeCode);
        if (!officeData) {
            showError(`Office ${officeCode} not found`);
            return;
        }

        // Get advisories for this office
        officeAdvisories = allAdvisories.filter((a) => a.office_code === officeCode);

        if (officeAdvisories.length === 0) {
            showError(`No active advisories for office ${officeCode}`);
            return;
        }

        // Aggregate with deduplication
        const aggregated = OfficeAggregator.aggregateByOffice(officeAdvisories, { deduplicateZones: true });
        const officeAggData = aggregated[0]; // Should only be one office

        // Find observation for this office
        const officeObs = obsData.find((o) => o.office_code === officeCode) || null;

        // Render the page
        renderOfficeHeader(officeData, officeAggData, officeObs);
        renderHighestAlert(officeAggData);
        renderImpactSummary(officeAggData);
        renderTimeline(officeAggData);
        renderAllAdvisories(officeAggData);

        // Show content, hide loading
        document.getElementById('loadingState').classList.add('d-none');
        document.getElementById('officeContent').classList.remove('d-none');
    } catch (error) {
        console.error('Error loading office detail:', error);
        showError('Failed to load office details: ' + error.message);
    }
}

/**
 * Display the error state panel with the provided message.
 * Hides the loading spinner and the main content section so the page
 * degrades gracefully when an office is not found or the API fails.
 *
 * @param {string} message - Human-readable error description
 * @returns {void}
 */
function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('loadingState').classList.add('d-none');
    document.getElementById('errorState').classList.remove('d-none');
}

/**
 * Populate the office header card with identity, location, severity badge,
 * and current temperature display.
 *
 * @param {Object}      office  - Office record from the offices API
 * @param {Object}      aggData - Aggregated office data from OfficeAggregator
 * @param {Object|null} obs     - Current weather observation for this office,
 *                               or null if no observation is available
 * @returns {void}
 */
function renderOfficeHeader(office, aggData, obs) {
    document.getElementById('officeCode').textContent = office.office_code;
    document.getElementById('officeName').textContent = office.name;
    document.getElementById('breadcrumbOffice').textContent = `${office.office_code} — ${office.name}`;
    document.getElementById('officeLocation').textContent = `${office.city}, ${office.state}`;

    const severity = aggData.highest_severity;
    const severityBadge = document.getElementById('highestSeverityBadge');
    severityBadge.textContent = severity;
    severityBadge.className = `badge severity-badge-large severity-${severity.toLowerCase()}`;

    // Temperature display
    const tempContainer = document.getElementById('officeTempDisplay');
    const tempHtml = renderTemperatureHTML(obs);
    if (tempHtml) {
        tempContainer.innerHTML = tempHtml;
    }

    const headerCard = document.getElementById('officeHeaderCard');
    headerCard.className = `card office-card office-card-${severity.toLowerCase()}`;
}

/**
 * Extract the *WHAT... block from a NOAA alert description
 * @param {string} description - Full alert description text
 * @returns {string|null} The WHAT text, or null if not found
 */
function extractWhat(description) {
    if (!description) return null;
    const match = description.match(/\* WHAT\.\.\.(.+?)(?=\n\n|\n\* |$)/s);
    return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

/**
 * Extract the *WHEN... block from a NOAA alert description
 * @param {string} description - Full alert description text
 * @returns {string|null} The WHEN text, or null if not found
 */
function extractWhen(description) {
    if (!description) return null;
    const match = description.match(/\* WHEN\.\.\.(.+?)(?=\n\n|\n\* |$)/s);
    return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

/**
 * Render the "highest alert" hero card with the most severe active advisory.
 * Extracts the WHAT and WHEN sections from the NOAA narrative for a quick
 * plain-language summary without displaying the full multi-paragraph text.
 *
 * @param {Object} aggData - Aggregated office object from OfficeAggregator;
 *                          must contain highest_severity_advisory
 * @returns {void}
 */
function renderHighestAlert(aggData) {
    const advisory = aggData.highest_severity_advisory;
    const card = document.getElementById('highestAlertCard');
    const advisoryJson = JSON.stringify(advisory).replace(/'/g, '&#39;');

    const whatText = extractWhat(advisory.description);
    const whenText = extractWhen(advisory.description);

    card.innerHTML = html`
        <h5 class="card-title">${advisory.advisory_type}</h5>
        <p class="card-text">
            ${raw(`<span class="badge ${getSeverityBadge(advisory.severity)}">${escapeHtml(advisory.severity)}</span>`)}
            ${raw(getActionBadgeWithTime(advisory))}
        </p>
        <p class="card-text">${advisory.headline || advisory.advisory_type}</p>
        ${raw(whatText ? `<p class="card-text"><strong>What:</strong> ${escapeHtml(whatText)}</p>` : '')}
        ${raw(whenText ? `<p class="card-text"><strong>When:</strong> ${escapeHtml(whenText)}</p>` : '')}
        <p class="card-text">
            <strong>Issued:</strong> ${raw(formatDate(advisory.last_updated))}<br />
            <strong>Source:</strong> ${advisory.source}
        </p>
        <div class="mt-3">
            ${raw(`<button class="btn btn-sm btn-outline-info me-2 view-alert-btn" data-advisory='${advisoryJson}'>
                        <i class="bi bi-file-text"></i> View Full Alert
                    </button>`)} ${raw(getExternalLinks(advisory))}
        </div>
    `;
}

/**
 * Render the impact summary grid — one card per unique alert type showing
 * severity, alert count, and (if applicable) the number of NWS forecast zones.
 *
 * @param {Object} aggData - Aggregated office object; must contain type_groups
 * @returns {void}
 */
function renderImpactSummary(aggData) {
    const container = document.getElementById('impactSummaryContainer');

    const summary = aggData.type_groups
        .map(
            (group) => html`
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="card static-card">
                        <div class="card-body">
                            <h6 class="card-title">${group.type}</h6>
                            <p class="mb-2">
                                ${raw(
                                    `<span class="badge ${getSeverityBadge(group.severity)}">${escapeHtml(group.severity)}</span>`
                                )}
                            </p>
                            <p class="mb-0">
                                <strong>${group.count}</strong> ${raw(group.count === 1 ? 'alert' : 'alerts')}
                                ${raw(
                                    group.zone_count > 1
                                        ? `<span class="badge zone-badge zone-badge-multi ms-2">${group.zone_count} zones</span>`
                                        : ''
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            `
        )
        .join('');

    container.innerHTML = html`<div class="row">${raw(summary)}</div>`;
}

/**
 * Render the advisory timeline sorted newest-first.
 * Each entry shows the alert type, VTEC action badge, severity, and a
 * human-readable relative timestamp (e.g. "3 hours ago") alongside the
 * formatted absolute date for auditability.
 *
 * @param {Object} aggData - Aggregated office object; must contain advisories array
 * @returns {void}
 */
function renderTimeline(aggData) {
    const container = document.getElementById('timelineContainer');

    // Sort advisories by last_updated
    const sorted = [...aggData.advisories].sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));

    const timeline = sorted
        .map((adv, index) => {
            const hoursAgo = Math.round((new Date() - new Date(adv.last_updated)) / 3600000);
            const timeText =
                hoursAgo < 1
                    ? 'Just now'
                    : hoursAgo === 1
                      ? '1 hour ago'
                      : hoursAgo < 24
                        ? `${hoursAgo} hours ago`
                        : `${Math.round(hoursAgo / 24)} days ago`;

            return html`
                <div class="timeline-item ${raw(index === 0 ? 'timeline-item-first' : '')}">
                    <div class="timeline-marker"></div>
                    <div class="timeline-content">
                        <small class="text-muted">${raw(formatDate(adv.last_updated))} (${timeText})</small>
                        <div>
                            <strong>${adv.advisory_type}</strong>
                            ${raw(getActionBadgeWithTime(adv))}
                            ${raw(
                                `<span class="badge ${getSeverityBadge(adv.severity)} ms-2">${escapeHtml(adv.severity)}</span>`
                            )}
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');

    container.innerHTML =
        timeline ||
        '<p class="text-center text-muted py-3 mb-0"><i class="bi bi-clock-history me-1"></i>No timeline data available</p>';
}

/**
 * Render the full advisory list grouped by alert type.
 * Each group card includes action badges, zone counts, WHAT/WHEN summaries,
 * a "View Full Alert" button that opens the detail modal, and NWS links.
 * Groups are sourced from aggData.type_groups so zone-deduplicated counts
 * are used rather than raw advisory rows.
 *
 * @param {Object} aggData - Aggregated office object; must contain
 *                          type_groups and total_zone_count
 * @returns {void}
 */
function renderAllAdvisories(aggData) {
    const container = document.getElementById('allAdvisoriesContainer');
    document.getElementById('totalAdvisoryCount').textContent = aggData.total_zone_count;

    const advisories = aggData.type_groups
        .map((group) => {
            // Escape the advisory data for use in data attribute
            const advisoryJson = JSON.stringify(group.representative).replace(/'/g, '&#39;');

            return html`
                <div class="col-12 mb-3">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="mb-0">
                                ${group.type}
                                ${raw(
                                    `<span class="badge ${getSeverityBadge(group.severity)} float-end">${escapeHtml(group.severity)}</span>`
                                )}
                            </h6>
                        </div>
                        <div class="card-body">
                            <p class="mb-2">
                                ${raw(getActionBadgeWithTime(group.representative))}
                                ${raw(
                                    group.zone_count > 1
                                        ? `<span class="badge zone-badge zone-badge-multi ms-2">
                                        <i class="bi bi-layers"></i> ${group.zone_count} NWS zones
                                    </span>`
                                        : `<span class="badge zone-badge ms-2">${escapeHtml(group.representative.source)}</span>`
                                )}
                            </p>
                            <p class="mb-1">${group.representative.headline || group.type}</p>
                            ${raw(
                                (() => {
                                    const t = extractWhat(group.representative.description);
                                    return t ? `<p class="mb-1"><strong>What:</strong> ${escapeHtml(t)}</p>` : '';
                                })()
                            )}
                            ${raw(
                                (() => {
                                    const w = extractWhen(group.representative.description);
                                    return w ? `<p class="mb-1"><strong>When:</strong> ${escapeHtml(w)}</p>` : '';
                                })()
                            )}
                            <p class="mb-1">
                                <strong>Issued:</strong> ${raw(formatDate(group.representative.last_updated))}<br />
                                <strong>Source:</strong> ${group.representative.source}
                            </p>
                            ${raw(
                                group.zone_count > 1
                                    ? `<small class="text-muted d-block mb-2">
                                    This alert covers multiple NWS forecast zones for this location.
                                </small>`
                                    : ''
                            )}
                            <div class="mt-2">
                                ${raw(`<button class="btn btn-sm btn-outline-info me-2 view-alert-btn" data-advisory='${advisoryJson}'>
                                    <i class="bi bi-file-text"></i> View Full Alert
                                </button>`)}
                                ${raw(getExternalLinks(group.representative))}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');

    container.innerHTML = html`<div class="row">${raw(advisories)}</div>`;
}

// getActionBadgeWithTime() is defined in js/utils.js

/**
 * Return a human-readable time-remaining string for an advisory expiry.
 *
 * @param {string} expiresISO - ISO 8601 expiry datetime string
 * @returns {string} e.g. "Expired", "Expires soon", "3 hours remaining",
 *                   "2 days remaining"
 */
function getTimeRemaining(expiresISO) {
    const hours = Math.round((new Date(expiresISO) - new Date()) / 3600000);
    if (hours < 0) return 'Expired';
    if (hours < 1) return 'Expires soon';
    if (hours === 1) return '1 hour remaining';
    if (hours < 24) return `${hours} hours remaining`;
    const days = Math.round(hours / 24);
    return days === 1 ? '1 day remaining' : `${days} days remaining`;
}

/**
 * Generate external links for NOAA official alert and map
 * @param {Object} advisory - Advisory object with external_id and source
 * @returns {string} HTML for external link buttons
 */
function getExternalLinks(advisory) {
    const links = [];

    // NWS office homepage (shows local forecasts, alerts, and radar for the region)
    if (officeData && officeData.cwa) {
        const nwsUrl = `https://www.weather.gov/${officeData.cwa.toLowerCase()}`;
        links.push(`
                    <a href="${nwsUrl}"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="btn btn-sm btn-outline-primary me-2"
                       title="View NWS office homepage for this region">
                        <i class="bi bi-cloud-sun"></i> NWS Forecast
                    </a>
                `);
    }

    // National radar map
    links.push(`
                <a href="https://radar.weather.gov/"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="btn btn-sm btn-outline-secondary"
                   title="View national radar map">
                    <i class="bi bi-broadcast"></i> Radar Map
                </a>
            `);

    return links.join('');
}

/**
 * Show alert detail modal with full narrative
 * @param {Object} advisory - Advisory object with description
 */
function showAlertDetail(advisory) {
    const modalLabel = document.getElementById('alertDetailModalLabel');
    const modalBody = document.getElementById('alertDetailModalBody');
    const modalLinks = document.getElementById('alertDetailModalLinks');

    // Set title - escape advisory type and severity
    modalLabel.innerHTML = html`
        ${advisory.advisory_type}
        ${raw(
            `<span class="badge ${getSeverityBadge(advisory.severity)} ms-2">${escapeHtml(advisory.severity)}</span>`
        )}
    `;

    // Format description - escape first, then apply formatting
    // This prevents XSS while preserving NOAA's text structure
    const safeDescription = advisory.description
        ? escapeHtml(advisory.description)
              .replace(/\n\n/g, '</p><p>')
              .replace(/\n\*/g, '</p><p class="mb-1"><strong>*')
              .replace(/\.\.\./g, '...</strong>')
              .replace(/\n/g, '<br>')
        : '<em>No detailed description available</em>';

    // Build modal body with escaped content
    modalBody.innerHTML = html`
        <div class="mb-3">
            <h6 class="text-muted">Headline</h6>
            <p class="lead">${advisory.headline || advisory.advisory_type}</p>
        </div>

        <div class="mb-3">
            <div class="row">
                <div class="col-sm-6"><strong>Status:</strong> ${raw(getActionBadgeWithTime(advisory))}</div>
                <div class="col-sm-6"><strong>Source:</strong> ${advisory.source || 'NOAA/NWS'}</div>
            </div>
        </div>

        <div class="mb-3">
            <div class="row">
                <div class="col-sm-6">
                    <strong>Issued:</strong> ${raw(formatDate(advisory.last_updated || advisory.issued_time))}
                </div>
                <div class="col-sm-6">
                    <strong>Expires:</strong> ${raw(
                        advisory.expires
                            ? formatDate(advisory.expires) + ' (' + getTimeRemaining(advisory.expires) + ')'
                            : 'Unknown'
                    )}
                </div>
            </div>
        </div>

        <hr />

        <div class="mb-3">
            <h6 class="text-muted">Full Alert Details</h6>
            <div class="alert-description bg-light p-3 rounded" style="white-space: pre-line; font-family: inherit;">
                <p>${raw(safeDescription)}</p>
            </div>
        </div>

        ${raw(
            advisory.vtec_code
                ? `
                <div class="mb-0">
                    <small class="text-muted">
                        <strong>VTEC:</strong> <code>${escapeHtml(advisory.vtec_code)}</code>
                    </small>
                </div>
                `
                : ''
        )}
    `;

    // Set external links in footer
    modalLinks.innerHTML = getExternalLinks(advisory);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('alertDetailModal'));
    modal.show();
}

// Event delegation for View Full Alert buttons
document.addEventListener('click', function (e) {
    const btn = e.target.closest('.view-alert-btn');
    if (btn && btn.dataset.advisory) {
        const advisory = JSON.parse(btn.dataset.advisory);
        showAlertDetail(advisory);
    }
});

// Initialize
loadOfficeDetail();
