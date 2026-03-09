        let nextUpdateTime = null;
        let countdownInterval = null;
        let observationsMap = {};

        // Calculate and display countdown to next update
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

        // Load overview data with filter application
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
                obsData.forEach(obs => { observationsMap[obs.office_code] = obs; });

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
                const severityToImpact = { 'Extreme': 'red', 'Severe': 'orange', 'Moderate': 'yellow', 'Minor': 'green' };
                aggregatedSites.forEach(site => {
                    const level = severityToImpact[site.highest_severity] || 'green';
                    weatherImpactCounts[level]++;
                });
                document.getElementById('weatherTotal').textContent = weatherImpactCounts.red + weatherImpactCounts.orange + weatherImpactCounts.yellow;
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
                    noSitesMsg.style.display = 'block';
                } else {
                    noSitesMsg.style.display = 'none';
                }

                // Operational Status Counts - Coming Soon (manual IMT tracking not yet implemented)
                // const statusCounts = overviewData.operational_status_counts || [];
                // document.getElementById('statusClosed').textContent = statusCounts.find(s => s.operational_status === 'closed')?.count || 0;
                // document.getElementById('statusRestricted').textContent = statusCounts.find(s => s.operational_status === 'open_restricted')?.count || 0;
                // document.getElementById('statusPending').textContent = statusCounts.find(s => s.operational_status === 'pending')?.count || 0;
                // document.getElementById('statusOpen').textContent = statusCounts.find(s => s.operational_status === 'open_normal')?.count || 0;

                // Recalculate severity counts from filtered advisories
                const severityCounts = {};
                filteredAdvisories.forEach(adv => {
                    severityCounts[adv.severity] = (severityCounts[adv.severity] || 0) + 1;
                });

                const severityOrder = ['Extreme', 'Severe', 'Moderate', 'Minor'];
                const severityHTML = severityOrder
                    .filter(sev => severityCounts[sev] > 0)
                    .map(sev => html`
                        <div class="mb-2">
                            <a href="advisories.html?severity=${sev}" class="badge ${raw(getSeverityBadge(sev))} me-2 text-decoration-none">${sev}</a>
                            <strong>${severityCounts[sev]}</strong> advisories
                        </div>`
                    ).join('');
                document.getElementById('severityCounts').innerHTML = severityHTML || '<p class="text-center text-muted mb-0"><i class="bi bi-cloud-sun me-1"></i>No active advisories</p>';

                // Sites with advisories (filter to show only sites with active advisories)
                const sitesWithAdvisoriesData = overviewData.recently_updated
                    .filter(site => {
                        // Check if this site has any advisories in the filtered set
                        return filteredAdvisories.some(adv => adv.office_id === site.office_id);
                    })
                    .slice(0, 5);

                const sitesHTML = sitesWithAdvisoriesData.map(site => {
                    const weatherBadge = getWeatherBadge(site.weather_impact_level || 'green');
                    const opsBadge = getOperationalBadge(site.operational_status || 'open_normal');
                    return html`<div class="mb-2">
                        <a href="offices.html?office=${site.office_code}" class="text-decoration-none fw-bold">${site.office_code}</a> - ${site.name}<br>
                        <small>
                            <span class="badge ${raw(weatherBadge)} me-1">Weather: ${raw((site.weather_impact_level || 'green').toUpperCase())}</span>
                            <span class="badge ${raw(opsBadge)}">Ops: ${raw(formatOperationalStatus(site.operational_status || 'open_normal'))}</span>
                        </small>
                    </div>`;
                }).join('');
                document.getElementById('recentlyUpdatedList').innerHTML = sitesHTML || '<p class="text-center text-muted mb-0"><i class="bi bi-building me-1"></i>No offices with advisories</p>';

                function getWeatherBadge(level) {
                    const badges = { red: 'weather-red', orange: 'weather-orange', yellow: 'weather-yellow', green: 'weather-green' };
                    return badges[level] || 'weather-green';
                }

                function getOperationalBadge(status) {
                    const badges = { closed: 'status-closed', open_restricted: 'status-restricted', pending: 'status-pending', open_normal: 'status-open' };
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

        // Render grouped site summaries
        // Colors now align with Weather Impact Assessment
        function renderSiteGroups(groupedSites) {
            renderSiteGroup('extremeSitesSection', 'extreme', '<i class="bi bi-circle-fill me-1" aria-hidden="true"></i> EXTREME - High Impact', groupedSites.extreme, false);
            renderSiteGroup('severeSitesSection', 'severe', '<i class="bi bi-circle-fill me-1" aria-hidden="true"></i> SEVERE - Severe Impact', groupedSites.severe, false);
            renderSiteGroup('moderateSitesSection', 'moderate', '<i class="bi bi-circle-fill me-1" aria-hidden="true"></i> MODERATE - Moderate Impact', groupedSites.moderate, true);
            renderSiteGroup('minorSitesSection', 'minor', '<i class="bi bi-circle-fill me-1" aria-hidden="true"></i> MINOR - Low Impact', groupedSites.minor, true);
        }

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
                        <div class="severity-group-header ${raw(escapeHtml(cssClass))} ${raw(collapsed ? 'collapsed' : '')}"
                             data-bs-toggle="collapse"
                             data-bs-target="#${raw(collapseId)}">
                            <h4 class="severity-group-title">${raw(title)}</h4>
                            <span class="severity-group-count">${sites.length}</span>
                            <span class="severity-group-toggle">▼</span>
                        </div>
                        <div class="collapse ${raw(showClass)}" id="${raw(collapseId)}">
                            <div class="row mt-3">
                                ${raw(sorted.slice(0, 6).map(site => renderSiteSummary(site, observationsMap[site.office_code])).join(''))}
                            </div>
                            ${raw(sorted.length > 6 ? `
                            <div class="text-center mt-2">
                                <a href="offices.html" class="btn btn-sm btn-outline-primary">
                                    View All ${sorted.length} Offices <i class="bi bi-arrow-right"></i>
                                </a>
                            </div>
                            ` : '')}
                        </div>
                    </div>
                </div>
            `;
        }

        function renderSiteSummary(site, obs) {
            const severityClass = `office-card-${escapeHtml(site.highest_severity.toLowerCase())}`;
            const advisory = site.highest_severity_advisory || {};
            const headlineText = truncate(advisory.headline || '', 120);

            // Temperature display
            let tempHtml = '';
            if (obs && obs.temperature_c != null) {
                const tempF = cToF(obs.temperature_c);
                const tempC = Math.round(parseFloat(obs.temperature_c));
                const stale = isStale(obs.observed_at);
                if (stale) {
                    tempHtml = `<div class="temp-display">
                        <span class="text-dark"><span aria-hidden="true">🌡️</span> ${tempF}°F / ${tempC}°C</span>
                        <small class="text-danger ms-2"><strong>${escapeHtml(obs.station_id)} - OFFLINE</strong></small>
                    </div>`;
                } else {
                    tempHtml = `<div class="temp-display">
                        <span class="text-dark"><span aria-hidden="true">🌡️</span> ${tempF}°F / ${tempC}°C</span>
                        <small class="text-muted ms-2">${timeAgo(obs.observed_at)}</small>
                    </div>`;
                }
            }

            return html`
                <div class="col-lg-4 col-md-6 col-12 mb-3">
                    <a href="office-detail.html?office=${site.office_code}" class="text-decoration-none">
                        <div class="card office-card card-clickable ${raw(severityClass)}" style="height: 100%;">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-start mb-2">
                                    <h6 class="mb-0 text-dark">
                                        <strong>${site.office_code}</strong> - ${site.office_name}<br>
                                        <small class="text-muted">${site.city}, ${site.state}</small>
                                    </h6>
                                    <div style="text-align: right;">
                                        <span class="badge severity-badge severity-${raw(escapeHtml(site.highest_severity.toLowerCase()))}">
                                            ${site.highest_severity}
                                        </span>
                                        ${raw(tempHtml)}
                                    </div>
                                </div>

                                <div class="mb-2 text-dark">
                                    <strong>${advisory.advisory_type}</strong>
                                    ${raw(advisory.vtec_action === 'NEW' ? '<span class="badge action-badge-new ms-1"><i class="bi bi-bell-fill"></i> NEW</span>' : '')}
                                    ${raw(headlineText ? '<br><small class="text-muted" style="line-height: 1.3; display: inline-block; margin-top: 0.25rem;">' + escapeHtml(headlineText) + '</small>' : '')}
                                </div>

                                <small class="text-muted d-block mb-2">
                                    ${raw(advisory.expires ? 'Expires: ' + formatDate(advisory.expires) : '')}
                                </small>

                                <div class="d-flex gap-2 align-items-center text-dark" style="font-size: 0.85rem;">
                                    <span>
                                        <strong>${site.unique_advisory_count}</strong> ${raw(site.unique_advisory_count === 1 ? 'alert' : 'alerts')}
                                    </span>
                                    ${raw(site.total_zone_count !== site.unique_advisory_count ?
                                        `<span class="text-muted">(${site.total_zone_count} zones)</span>` : '')}
                                    ${raw(site.new_count > 0 ?
                                        `<span class="badge bg-success">${site.new_count} new</span>` : '')}
                                </div>
                            </div>
                        </div>
                    </a>
                </div>
            `;
        }

        // Update filter indicator
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
                indicator.style.display = 'inline-block';
            } else {
                indicator.style.display = 'none';
            }
        }

        // Initialize filters then load overview
        AlertFilters.init().then(() => {
            updateFilterIndicator();
            loadOverview();
        });

        // Helper function to export current dashboard data
        window.exportCurrentData = async function(type) {
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
                const sites = Array.isArray(officesData.data) ? officesData.data : [];

                // Export based on type
                switch(type) {
                    case 'csv':
                        StormScoutExport.exportOfficesToCSV(sites);
                        break;
                    case 'executive':
                        StormScoutExport.generateHTMLReport({ sites, advisories, overview }, 'executive');
                        break;
                    case 'incident':
                        StormScoutExport.generateHTMLReport({ sites, advisories }, 'incident');
                        break;
                    case 'summary':
                        StormScoutExport.generateHTMLReport({ sites }, 'summary');
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
        document.getElementById('exportPrintPDF').addEventListener('click', (e) => { e.preventDefault(); StormScoutExport.printToPDF(); });
        document.getElementById('exportShareLink').addEventListener('click', (e) => { e.preventDefault(); StormScoutExport.copyShareableLink(); });
        // Advanced export features coming soon
