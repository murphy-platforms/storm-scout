        let allAdvisories = [];
        let allAdvisoriesUnfiltered = [];
        let observationsMap = {};
        let currentView = 'card';

        // Check if alert type should be included
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

        async function loadAdvisories() {
            try {
                const [data, obsData] = await Promise.all([
                    API.getActiveAdvisories(),
                    API.getObservations().catch(() => [])
                ]);

                // Build observations lookup by office_code
                observationsMap = {};
                obsData.forEach(obs => { observationsMap[obs.office_code] = obs; });

                allAdvisoriesUnfiltered = data;
                allAdvisories = data;

                // Populate state filter
                const states = [...new Set(data.map(a => a.state))].sort();
                const stateSelect = document.getElementById('stateFilter');
                stateSelect.innerHTML = '<option value="">All States</option>';
                states.forEach(state => {
                    const option = document.createElement('option');
                    option.value = state;
                    option.textContent = state;
                    stateSelect.appendChild(option);
                });

                // Initial render
                renderAll();
            } catch (error) {
                document.getElementById('cardViewContainer').innerHTML =
                    renderErrorHtml('Failed to load advisories');
                document.getElementById('advisoriesTable').innerHTML =
                    `<tr><td colspan="11"><div class="alert alert-danger mb-0" role="alert"><i class="bi bi-exclamation-triangle-fill me-2"></i>Failed to load advisories</div></td></tr>`;
            }
        }

        // getActionBadge() is defined in js/utils.js

        function renderGroupedTable(sites, filteredAdvisories) {
            const tbody = document.getElementById('advisoriesTable');
            const statsContainer = document.getElementById('summaryStatsContainer');

            if (sites.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="text-center py-5 text-muted"><i class="bi bi-cloud-sun fs-1 d-block mb-2"></i><strong>No active advisories</strong><p class="mb-0 small mt-1">No advisories match your current filter settings.</p></td></tr>';
                statsContainer.innerHTML = '';
                return;
            }

            // Render summary stats (keeps stats updated when filters change in table view)
            const stats = OfficeAggregator.getSummaryStats(filteredAdvisories, sites);
            const extremeCount = sites.filter(s => s.highest_severity === 'Extreme').length;
            const severeCount = sites.filter(s => s.highest_severity === 'Severe').length;
            statsContainer.innerHTML = `
                <div class="col-12">
                    <div class="summary-stats">
                        <div class="summary-stat">
                            <span class="summary-stat-value">${stats.unique_offices}</span>
                            <span class="summary-stat-label">Locations Impacted</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value"><span class="text-severity-extreme">${extremeCount}</span> / <span class="text-severity-severe">${severeCount}</span></span>
                            <span class="summary-stat-label">Critical/Severe</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value text-severity-moderate">${stats.elevated_offices}</span>
                            <span class="summary-stat-label">Moderate</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value text-severity-minor">${stats.new_alerts}</span>
                            <span class="summary-stat-label">New Alerts</span>
                        </div>
                    </div>
                </div>
            `;

            // Sort offices by office_code ascending
            const sorted = [...sites].sort((a, b) =>
                a.office_code.localeCompare(b.office_code, undefined, { numeric: true })
            );

            let rowsHtml = '';
            sorted.forEach(site => {
                const obs = observationsMap[site.office_code];
                const tempF = obs ? cToF(obs.temperature_c) : null;
                const tempC = obs && obs.temperature_c != null ? Math.round(parseFloat(obs.temperature_c)) : null;
                let tempSpan = '';
                if (tempF != null) {
                    const stale = isStale(obs.observed_at);
                    if (stale) {
                        tempSpan = `<span class="text-muted ms-3"><span aria-hidden="true">🌡️</span> ${tempF}°F / ${tempC}°C</span> <small class="text-danger"><strong>${escapeHtml(obs.station_id)} OFFLINE</strong></small>`;
                    } else {
                        tempSpan = `<span class="text-muted ms-3"><span aria-hidden="true">🌡️</span> ${tempF}°F / ${tempC}°C</span>`;
                    }
                }
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
                const sortedAdvs = [...site.advisories].sort((a, b) =>
                    OfficeAggregator.getSeverityRank(b.severity) - OfficeAggregator.getSeverityRank(a.severity)
                );

                // Alert sub-rows
                sortedAdvs.forEach(adv => {
                    const headlineShort = truncate(adv.headline || '', 80);
                    rowsHtml += html`<tr class="office-group-row">
                        <td colspan="6" class="ps-4 text-muted">
                            <small>${headlineShort}</small>
                        </td>
                        <td><strong>${adv.advisory_type}</strong></td>
                        <td>${raw(`<span class="badge ${getSeverityBadge(adv.severity)}">${escapeHtml(adv.severity)}</span>`)}</td>
                        <td>${raw(getActionBadge(adv.vtec_action))}</td>
                        <td>${adv.source}</td>
                        <td>${raw(formatDate(adv.last_updated))}</td>
                    </tr>`;
                });
            });

            tbody.innerHTML = rowsHtml;

            // Click handlers: office header rows navigate to office detail
            tbody.querySelectorAll('.office-group-header').forEach(row => {
                row.addEventListener('click', () => {
                    window.location.href = `office-detail.html?office=${row.dataset.officeCode}`;
                });
            });
        }

        // Render everything
        function renderAll() {
            filterAndRender();
        }

        // Main filter and render function
        function filterAndRender() {
            const search = document.getElementById('searchBox').value.toLowerCase();
            const alertTypeFilter = document.getElementById('alertTypeFilter').value;
            const state = document.getElementById('stateFilter').value;
            const severity = document.getElementById('severityFilter').value;
            const dedupEnabled = document.getElementById('dedupToggle').checked;

            // Filter advisories
            let filtered = allAdvisories.filter(adv => {
                if (search && !(adv.office_code.toLowerCase().includes(search) || adv.office_name.toLowerCase().includes(search))) return false;
                if (alertTypeFilter && !shouldIncludeAlertType(adv.advisory_type, alertTypeFilter)) return false;
                if (state && adv.state !== state) return false;
                if (severity && adv.severity !== severity) return false;
                return true;
            });

            // Show filter warning
            renderFilterWarning(allAdvisoriesUnfiltered, filtered);

            // Aggregate by office
            const aggregatedSites = OfficeAggregator.aggregateByOffice(filtered, { deduplicateZones: dedupEnabled });

            // Render based on current view
            if (currentView === 'card') {
                renderCardView(aggregatedSites, filtered);
            } else {
                renderGroupedTable(aggregatedSites, filtered);
            }
        }

        // Render filter warning banner
        function renderFilterWarning(allAdv, filteredAdv) {
            const warning = OfficeAggregator.getFilterWarning(allAdv, filteredAdv);
            const container = document.getElementById('filterWarningContainer');

            if (!warning) {
                container.innerHTML = '';
                return;
            }

            const criticalClass = warning.has_critical ? 'filter-warning-critical' : '';
            const criticalText = warning.has_critical ? ` (${warning.critical_hidden} CRITICAL)` : '';

            container.innerHTML = `
                <div class="col-12">
                    <div class="filter-warning-banner ${criticalClass}">
                        <div class="filter-warning-content">
                            <div class="filter-warning-text">
                                <span class="filter-warning-icon"><i class="bi bi-exclamation-triangle-fill"></i></span>
                                <span>
                                    <strong>Filters Active:</strong> ${warning.hidden_count} alerts hidden${criticalText}
                                </span>
                            </div>
                            <div class="filter-warning-actions">
                                <button class="btn btn-sm btn-outline-primary" id="showAllAlertsBtn">
                                    <i class="bi bi-eye"></i> Show All Alerts
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Attach event listener after inserting HTML
            document.getElementById('showAllAlertsBtn').addEventListener('click', showAllAlerts);
        }

        // Render card view
        function renderCardView(sites, originalAdvisories) {
            const container = document.getElementById('cardViewContainer');
            const statsContainer = document.getElementById('summaryStatsContainer');

            if (sites.length === 0) {
                container.innerHTML = renderEmptyHtml('cloud-sun', 'No advisories match your filters', 'Try adjusting your filter settings to see more results.');
                statsContainer.innerHTML = '';
                return;
            }

            // Render summary stats
            const stats = OfficeAggregator.getSummaryStats(originalAdvisories, sites);
            const extremeCount = sites.filter(s => s.highest_severity === 'Extreme').length;
            const severeCount = sites.filter(s => s.highest_severity === 'Severe').length;
            statsContainer.innerHTML = `
                <div class="col-12">
                    <div class="summary-stats">
                        <div class="summary-stat">
                            <span class="summary-stat-value">${stats.unique_offices}</span>
                            <span class="summary-stat-label">Locations Impacted</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value"><span class="text-severity-extreme">${extremeCount}</span> / <span class="text-severity-severe">${severeCount}</span></span>
                            <span class="summary-stat-label">Critical/Severe</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value text-severity-moderate">${stats.elevated_offices}</span>
                            <span class="summary-stat-label">Moderate</span>
                        </div>
                        <div class="summary-stat">
                            <span class="summary-stat-value text-severity-minor">${stats.new_alerts}</span>
                            <span class="summary-stat-label">New Alerts</span>
                        </div>
                    </div>
                </div>
            `;

            // Render office cards (sorted by office code ascending)
            const sorted = [...sites].sort((a, b) =>
                a.office_code.localeCompare(b.office_code, undefined, { numeric: true })
            );
            container.innerHTML = sorted.map(office => renderOfficeCard(office, observationsMap[office.office_code])).join('');
        }

        // Render individual office card
        function renderOfficeCard(site, obs) {
            const severityClass = `office-card-${escapeHtml(site.highest_severity.toLowerCase())}`;
            const highestAlert = site.highest_severity_advisory;
            const headlineText = truncate(highestAlert.headline || '', 120);

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
                                    <span class="badge severity-badge severity-${raw(escapeHtml(site.highest_severity.toLowerCase()))}">
                                        ${site.highest_severity}
                                    </span>
                                    ${raw(tempHtml)}
                                </div>
                            </div>
                            <div class="office-card-body">
                                <!-- Highest severity alert -->
                                <div style="margin-bottom: 0.75rem;">
                                    <strong class="text-dark">${highestAlert.advisory_type}</strong>
                                    ${raw(highestAlert.vtec_action === 'NEW' ? '<span class="badge action-badge-new ms-2"><i class="bi bi-bell-fill"></i> NEW</span>' : '')}
                                    ${raw(headlineText ? '<br><small class="text-muted" style="line-height: 1.3; display: inline-block; margin-top: 0.25rem;">' + escapeHtml(headlineText) + '</small>' : '')}
                                    <br>
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
                                            ${raw(site.total_zone_count !== site.unique_advisory_count ?
                                                `<span class="text-muted">(${site.total_zone_count} zones)</span>` : '')}
                                        </span>
                                    </div>
                                    ${raw(site.new_count > 0 ? `
                                    <div class="alert-stat">
                                        <span class="alert-stat-icon"><i class="bi bi-bell-fill"></i></span>
                                        <span class="text-dark"><span class="alert-stat-value">${site.new_count}</span> new</span>
                                    </div>
                                    ` : '')}
                                    ${raw(site.continued_count > 0 ? `
                                    <div class="alert-stat">
                                        <span class="alert-stat-icon"><i class="bi bi-arrow-repeat"></i></span>
                                        <span class="text-dark"><span class="alert-stat-value">${site.continued_count}</span> continued</span>
                                    </div>
                                    ` : '')}
                                </div>

                                <!-- Advisory types -->
                                <div class="advisory-type-list">
                                    ${raw(site.type_groups.map(group => html`
                                        <div class="advisory-type-item">
                                            <span class="advisory-type-name">${group.type}</span>
                                            <div class="advisory-type-meta">
                                                ${raw(`<span class="badge ${getSeverityBadge(group.severity)}">${escapeHtml(group.severity)}</span>`)}
                                                ${raw(group.zone_count > 1 ?
                                                    `<span class="badge zone-badge zone-badge-multi" title="${group.zone_count} NWS zones">
                                                        <i class="bi bi-layers"></i> ${group.zone_count} zones
                                                    </span>` :
                                                    `<span class="badge zone-badge">${escapeHtml(group.representative.source || 'NWS')}</span>`
                                                )}
                                            </div>
                                        </div>
                                    `).join(''))}
                                </div>
                            </div>
                        </div>
                    </a>
                </div>
            `;
        }

        // View switching
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

        // Show all alerts (disable filters)
        function showAllAlerts() {
            document.getElementById('searchBox').value = '';
            document.getElementById('alertTypeFilter').value = 'FULL';
            document.getElementById('stateFilter').value = '';
            document.getElementById('severityFilter').value = '';
            renderAll();
        }

        // Event listeners
        document.getElementById('searchBox').addEventListener('input', renderAll);
        document.getElementById('alertTypeFilter').addEventListener('change', renderAll);
        document.getElementById('stateFilter').addEventListener('change', renderAll);
        document.getElementById('severityFilter').addEventListener('change', renderAll);
        document.getElementById('dedupToggle').addEventListener('change', renderAll);
        document.getElementById('cardViewBtn').addEventListener('click', () => switchView('card'));
        document.getElementById('tableViewBtn').addEventListener('click', () => switchView('table'));

        // Check for URL parameters on page load
        function applyURLParameters() {
            const urlParams = new URLSearchParams(window.location.search);
            const severityParam = urlParams.get('severity');

            if (severityParam) {
                // Auto-select severity dropdown with value from URL
                const severityFilter = document.getElementById('severityFilter');
                severityFilter.value = severityParam;
                // Trigger filtering
                renderAll();
            }
        }

        // Initialize: Load filter configs then load advisories
        AlertFilters.init().then(() => {
            loadAdvisories();
            // Apply URL parameters after advisories are loaded
            setTimeout(() => applyURLParameters(), 100);
        });
