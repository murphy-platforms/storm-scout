        let allOffices = [];
        let allAdvisories = [];
        let observationsMap = {};

        async function loadOffices() {
            try {
                // Load all offices, advisories, and observations
                const [offices, advisories, obsData] = await Promise.all([
                    API.getOffices(),
                    API.getActiveAdvisories(),
                    API.getObservations().catch(() => [])
                ]);

                // Build observations lookup by office_code
                observationsMap = {};
                obsData.forEach(obs => { observationsMap[obs.office_code] = obs; });

                allOffices = offices;
                allAdvisories = advisories;

                // Apply filters and recalculate advisory counts
                // This will filter to only show offices WITH advisories
                const filteredData = applyFiltersToOffices(offices, advisories);
                renderOffices(filteredData);

                // Populate state filter
                const states = [...new Set(filteredData.map(s => s.state))].sort();
                const stateSelect = document.getElementById('stateFilter');
                states.forEach(state => {
                    const option = document.createElement('option');
                    option.value = state;
                    option.textContent = state;
                    stateSelect.appendChild(option);
                });
            } catch (error) {
                document.getElementById('officesContainer').innerHTML =
                    renderErrorHtml('Failed to load impacted offices');
            }
        }

        // Apply user's filter preferences and aggregate
        function applyFiltersToOffices(offices, advisories) {
            // Filter advisories based on user preferences
            const filteredAdvisories = AlertFilters.filterAdvisories(advisories);

            // Aggregate advisories by office with deduplication
            const aggregatedOffices = OfficeAggregator.aggregateByOffice(filteredAdvisories, { deduplicateZones: true });

            // Create map for quick lookup
            const aggMap = new Map();
            aggregatedOffices.forEach(office => {
                aggMap.set(office.office_id, office);
            });

            // Map severity to weather impact level (matches dashboard)
            const severityToImpact = { 'Extreme': 'red', 'Severe': 'orange', 'Moderate': 'yellow', 'Minor': 'green' };

            // Enhance original offices with aggregation data
            // Note: Offices API uses 'id', advisories use 'office_id'
            return offices
                .map(office => {
                    const aggData = aggMap.get(office.id);
                    if (!aggData) return null;

                    return {
                        ...office,
                        advisory_count: aggData.unique_advisory_count,
                        highest_severity: aggData.highest_severity,
                        highest_severity_advisory: aggData.highest_severity_advisory,
                        new_count: aggData.new_count,
                        total_zone_count: aggData.total_zone_count,
                        weather_impact_level: severityToImpact[aggData.highest_severity] || 'green'
                    };
                })
                .filter(office => office !== null); // Remove offices without advisories
        }

        function renderOffices(offices) {
            const container = document.getElementById('officesContainer');
            if (offices.length === 0) {
                container.innerHTML = renderEmptyHtml('building', 'No offices currently impacted', 'No USPS locations are affected by active weather advisories.');
                return;
            }

            // Sort by urgency (offices with highest severity first)
            const sortedOffices = [...offices].sort((a, b) => {
                const rankA = OfficeAggregator.getSeverityRank(a.highest_severity || 'Minor');
                const rankB = OfficeAggregator.getSeverityRank(b.highest_severity || 'Minor');
                return rankB - rankA;
            });

            container.innerHTML = sortedOffices.map(office => {
                const severityClass = office.highest_severity ? `office-card-${escapeHtml(office.highest_severity.toLowerCase())}` : '';
                const advisory = office.highest_severity_advisory;
                const headlineText = advisory ? truncate(advisory.headline || '', 120) : '';
                const obs = observationsMap[office.office_code];

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
                <div class="col-md-6 col-lg-4 mb-3">
                    <a href="office-detail.html?office=${office.office_code}" class="text-decoration-none">
                        <div class="card office-card card-clickable ${raw(severityClass)}">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-start mb-2">
                                    <div>
                                        <h5 class="card-title mb-0 text-dark">
                                            <strong>${office.office_code}</strong> - ${office.name}
                                        </h5>
                                        <small class="text-muted"><i class="bi bi-geo-alt"></i> ${office.city}, ${office.state}</small>
                                    </div>
                                    <div style="text-align: right;">
                                        ${raw(office.highest_severity ?
                                            `<span class="badge severity-badge severity-${escapeHtml(office.highest_severity.toLowerCase())}">
                                                ${escapeHtml(office.highest_severity)}
                                            </span>` : '')}
                                        ${raw(tempHtml)}
                                    </div>
                                </div>

                                ${raw(advisory ? `
                                <div class="mb-2">
                                    <strong class="text-severity-${escapeHtml((advisory.severity || 'extreme').toLowerCase())}">${escapeHtml(advisory.advisory_type)}</strong>
                                    ${advisory.vtec_action === 'NEW' ? '<span class="badge action-badge-new ms-1"><i class="bi bi-bell-fill"></i> NEW</span>' : ''}
                                    ${headlineText ? '<br><small class="text-muted" style="line-height: 1.3; display: inline-block; margin-top: 0.25rem;">' + escapeHtml(headlineText) + '</small>' : ''}
                                </div>
                                ` : '')}

                                <p class="card-text text-dark">
                                    <i class="bi bi-exclamation-triangle"></i> <strong>${office.advisory_count}</strong> active ${raw(office.advisory_count === 1 ? 'alert' : 'alerts')}
                                    ${raw(office.total_zone_count !== office.advisory_count ?
                                        `<span class="text-muted small">(${office.total_zone_count} zones)</span>` : '')}
                                    ${raw(office.new_count > 0 ? `<br><i class="bi bi-bell"></i> <strong>${office.new_count}</strong> new` : '')}
                                </p>
                            </div>
                        </div>
                    </a>
                </div>
                `;
            }).join('');
        }

        function filterOffices() {
            const search = document.getElementById('searchBox').value.toLowerCase();
            const state = document.getElementById('stateFilter').value;
            const weatherImpact = document.getElementById('weatherImpactFilter').value;
            const status = document.getElementById('statusFilter').value;

            // First apply alert type filters to get updated advisory counts
            const filteredData = applyFiltersToOffices(allOffices, allAdvisories);

            // Then apply UI filters
            const filtered = filteredData.filter(office => {
                if (search && !(office.office_code.toLowerCase().includes(search) || office.name.toLowerCase().includes(search))) return false;
                if (state && office.state !== state) return false;
                if (weatherImpact && office.weather_impact_level !== weatherImpact) return false;
                if (status && office.operational_status !== status) return false;
                return true;
            });

            renderOffices(filtered);
        }

        // Clear weather impact filter
        function clearWeatherFilter() {
            document.getElementById('weatherImpactFilter').value = '';
            document.getElementById('activeFilterBanner').classList.add('d-none');
            // Update URL without the parameter
            const url = new URL(window.location);
            url.searchParams.delete('weather_impact');
            window.history.replaceState({}, '', url);
            filterOffices();
        }

        document.getElementById('searchBox').addEventListener('input', filterOffices);
        document.getElementById('stateFilter').addEventListener('change', filterOffices);
        document.getElementById('weatherImpactFilter').addEventListener('change', function() {
            // Hide banner when manually changing filter
            if (!this.value) {
                document.getElementById('activeFilterBanner').classList.add('d-none');
            }
            filterOffices();
        });
        document.getElementById('statusFilter').addEventListener('change', filterOffices);
        document.getElementById('clearFilterBtn').addEventListener('click', clearWeatherFilter);

        // Check for URL parameters on page load
        function applyURLParameters() {
            const urlParams = new URLSearchParams(window.location.search);
            const officeParam = urlParams.get('office') || urlParams.get('site'); // support legacy ?site= links
            const weatherImpactParam = urlParams.get('weather_impact');

            if (officeParam) {
                // Auto-populate search box with office code from URL
                document.getElementById('searchBox').value = officeParam;
            }

            if (weatherImpactParam) {
                // Set weather impact filter from URL
                document.getElementById('weatherImpactFilter').value = weatherImpactParam;

                // Show active filter banner
                const labels = { red: 'Extreme (High Impact)', orange: 'Severe (Severe Impact)', yellow: 'Moderate (Moderate Impact)', green: 'Minor (Low/No Impact)' };
                document.getElementById('activeFilterLabel').textContent = labels[weatherImpactParam] || weatherImpactParam.toUpperCase();
                document.getElementById('activeFilterBanner').classList.remove('d-none');
            }

            // Trigger filtering
            filterOffices();
        }

        // Initialize filters then load offices
        AlertFilters.init().then(async () => {
            await loadOffices();
            // Apply URL parameters after offices are loaded
            applyURLParameters();
        });
