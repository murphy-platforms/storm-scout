        let map;
        let markers = [];
        let markerLayer;
        let observationsMap = {};

        // Severity rank — lower index = higher priority (closes #108)
        const SEVERITY_ORDER = ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'];

        /**
         * Create a severity-aware cluster icon.
         * Colors the cluster badge by the highest-severity child marker.
         */
        function createClusterIcon(cluster) {
            const children = cluster.getAllChildMarkers();
            let topSeverity = 'Unknown';
            for (const child of children) {
                const s = child.options.severity || 'Unknown';
                if (SEVERITY_ORDER.indexOf(s) < SEVERITY_ORDER.indexOf(topSeverity)) {
                    topSeverity = s;
                }
            }
            const severityClass = `marker-${topSeverity.toLowerCase()}`;
            return L.divIcon({
                html: `<div class="severity-marker ${escapeHtml(severityClass)}" style="width:36px;height:36px;font-size:14px;">${cluster.getChildCount()}</div>`,
                className: '',
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });
        }

        // Initialize map
        function initMap() {
            map = L.map('map').setView([39.8283, -98.5795], 4); // Center of USA

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(map);

            markerLayer = L.markerClusterGroup({
                maxClusterRadius: 60,
                iconCreateFunction: createClusterIcon
            }).addTo(map);
        }

        function debugStep(text) {
            const list = document.getElementById('mapDebugSteps');
            if (list) {
                const li = document.createElement('li');
                li.textContent = text;
                list.appendChild(li);
            }
        }

        async function loadMapData() {
            try {
                debugStep('Starting: AlertFilters.init()');
                const filtersLoaded = await AlertFilters.init();
                debugStep('AlertFilters.init() returned: ' + filtersLoaded);
                if (!filtersLoaded) throw new Error('Alert filter initialization failed');

                debugStep('Fetching advisories, offices, observations...');
                const [allAdvisories, allOffices, obsData] = await Promise.all([
                    API.getActiveAdvisories(),
                    API.getOffices(),
                    API.getObservations().catch(() => [])
                ]);
                debugStep('APIs returned — advisories:' + allAdvisories.length + ' offices:' + allOffices.length + ' obs:' + obsData.length);

                observationsMap = {};
                obsData.forEach(obs => { observationsMap[obs.office_code] = obs; });

                debugStep('Filtering advisories...');
                const filteredAdvisories = AlertFilters.filterAdvisories(allAdvisories);
                debugStep('filteredAdvisories: ' + filteredAdvisories.length);

                debugStep('Aggregating by office...');
                const aggregated = OfficeAggregator.aggregateByOffice(filteredAdvisories, { deduplicateZones: true });
                debugStep('aggregated offices: ' + aggregated.length);

                const aggMap = new Map();
                aggregated.forEach(office => { aggMap.set(office.office_id, office); });

                const officesWithAdvisories = allOffices
                    .filter(office => aggMap.has(office.id))
                    .map(office => ({ ...office, ...aggMap.get(office.id) }));
                debugStep('officesWithAdvisories: ' + officesWithAdvisories.length);

                debugStep('Calling renderMarkers...');
                renderMarkers(officesWithAdvisories);
                debugStep('Calling updateStats...');
                updateStats(aggregated);
                debugStep('Done.');

            } catch (error) {
                console.error('Failed to load map data:', error);
                const banner = document.getElementById('mapErrorBanner');
                const msg = document.getElementById('mapErrorMessage');
                if (msg) msg.textContent = 'Error: ' + error.message + ' (' + error.constructor.name + ')';
                if (banner) banner.classList.remove('d-none');
            }
        }

        function renderMarkers(offices) {
            // Clear existing markers
            markerLayer.clearLayers();
            markers = [];

            offices.forEach(office => {
                if (!office.latitude || !office.longitude) return;

                const severity = office.highest_severity || 'Minor';
                const severityClass = `marker-${severity.toLowerCase()}`;

                // Create custom div icon with escaped values
                const iconHtml = `<div class="severity-marker ${escapeHtml(severityClass)}" style="width: 30px; height: 30px;">${parseInt(office.unique_advisory_count) || 0}</div>`;
                const customIcon = L.divIcon({
                    html: iconHtml,
                    className: '',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    popupAnchor: [0, -15]
                });

                // Create marker — store severity as custom option for cluster icon access
                const marker = L.marker([office.latitude, office.longitude], { icon: customIcon, severity });

                // Create popup content using html tagged template for XSS prevention
                // Build temperature HTML
                const obs = observationsMap[office.office_code];
                let tempHtml = '';
                if (obs && obs.temperature_c != null) {
                    const tempF = cToF(obs.temperature_c);
                    const tempC = Math.round(parseFloat(obs.temperature_c));
                    const stale = isStale(obs.observed_at);
                    if (stale) {
                        tempHtml = `<span><span aria-hidden="true">🌡️</span> ${tempF}°F / ${tempC}°C <small class="text-danger"><strong>${escapeHtml(obs.station_id)} - OFFLINE</strong></small></span>`;
                    } else {
                        tempHtml = `<span><span aria-hidden="true">🌡️</span> ${tempF}°F / ${tempC}°C <small class="text-muted">${timeAgo(obs.observed_at)}</small></span>`;
                    }
                }

                const headlineText = truncate(office.highest_severity_advisory.headline || '', 80);

                const popupContent = html`
                    <div class="office-popup">
                        <h6><strong>${office.office_code}</strong> - ${office.name}</h6>
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span>${raw('<i class="bi bi-geo-alt"></i>')} ${office.city}, ${office.state}</span>
                            ${raw(tempHtml ? `<span class="temp-display d-inline-block">${tempHtml}</span>` : '')}
                        </div>
                        <p class="mb-2">
                            ${raw(`<span class="badge severity-${escapeHtml(severity.toLowerCase())}">${escapeHtml(severity)}</span>`)}
                            ${raw(office.new_count > 0 ? `<span class="badge bg-success">${office.new_count} NEW</span>` : '')}
                        </p>
                        <p class="mb-1"><strong>${office.highest_severity_advisory.advisory_type}</strong></p>
                        ${raw(headlineText ? `<p class="mb-2"><small class="text-muted">${escapeHtml(headlineText)}</small></p>` : '')}
                        <p class="mb-2">
                            <strong>${office.unique_advisory_count}</strong> unique alerts
                            ${raw(office.total_zone_count !== office.unique_advisory_count ?
                                `<small class="text-muted">(${office.total_zone_count} zones)</small>` : '')}
                        </p>
                        <a href="office-detail.html?office=${encodeURIComponent(office.office_code)}" class="btn btn-sm btn-primary w-100">
                            ${raw('<i class="bi bi-arrow-right-circle"></i>')} View Details
                        </a>
                    </div>
                `;

                marker.bindPopup(popupContent);

                // Add to layer and tracking
                marker.addTo(markerLayer);
                markers.push({
                    marker,
                    office,
                    severity
                });
            });

            // Fit map to show all markers
            if (markers.length > 0) {
                const group = L.featureGroup(markers.map(m => m.marker));
                map.fitBounds(group.getBounds().pad(0.1));
            }

            updateVisibleCount();
        }

        function updateStats(offices) {
            const counts = {
                extreme: offices.filter(o => o.highest_severity === 'Extreme').length,
                severe: offices.filter(o => o.highest_severity === 'Severe').length,
                moderate: offices.filter(o => o.highest_severity === 'Moderate').length
            };

            document.getElementById('extremeCount').textContent = counts.extreme;
            document.getElementById('severeCount').textContent = counts.severe;
            document.getElementById('moderateCount').textContent = counts.moderate;
            document.getElementById('totalOfficesCount').textContent = offices.length;
        }

        function updateVisibleCount() {
            const visible = markers.filter(m => map.getBounds().contains(m.marker.getLatLng())).length;
            document.getElementById('visibleOfficeCount').textContent = `${visible} offices visible`;
        }

        function fitAllMarkers() {
            if (markers.length > 0) {
                const group = L.featureGroup(markers.map(m => m.marker));
                map.fitBounds(group.getBounds().pad(0.1));
            }
        }

        function resetMap() {
            map.setView([39.8283, -98.5795], 4);
            document.getElementById('filterExtreme').checked = true;
            document.getElementById('filterSevere').checked = true;
            document.getElementById('filterModerate').checked = true;
            applyFilters();
        }

        function applyFilters() {
            const showExtreme = document.getElementById('filterExtreme').checked;
            const showSevere = document.getElementById('filterSevere').checked;
            const showModerate = document.getElementById('filterModerate').checked;

            markers.forEach(({ marker, severity }) => {
                const show = (
                    (severity === 'Extreme' && showExtreme) ||
                    (severity === 'Severe' && showSevere) ||
                    (severity === 'Moderate' && showModerate) ||
                    severity === 'Minor'
                );

                if (show) {
                    marker.addTo(markerLayer);
                } else {
                    markerLayer.removeLayer(marker);
                }
            });

            updateVisibleCount();
            updateStatCardStyles();
        }

        function toggleFilter(severity) {
            const checkbox = document.getElementById(`filter${severity}`);
            checkbox.checked = !checkbox.checked;
            applyFilters();
        }

        function updateStatCardStyles() {
            const filters = ['Extreme', 'Severe', 'Moderate'];
            filters.forEach(severity => {
                const checkbox = document.getElementById(`filter${severity}`);
                const card = document.querySelector(`.map-stat-card[data-severity="${severity}"]`);
                if (card) {
                    if (checkbox.checked) {
                        card.classList.remove('filter-disabled');
                    } else {
                        card.classList.add('filter-disabled');
                    }
                }
            });
        }

        // Event listeners
        document.getElementById('filterExtreme').addEventListener('change', applyFilters);
        document.getElementById('filterSevere').addEventListener('change', applyFilters);
        document.getElementById('filterModerate').addEventListener('change', applyFilters);
        document.getElementById('fitAllBtn').addEventListener('click', fitAllMarkers);
        document.getElementById('resetMapBtn').addEventListener('click', resetMap);
        document.getElementById('toggleExtreme').addEventListener('click', () => toggleFilter('Extreme'));
        document.getElementById('toggleSevere').addEventListener('click', () => toggleFilter('Severe'));
        document.getElementById('toggleModerate').addEventListener('click', () => toggleFilter('Moderate'));

        map?.on('moveend', updateVisibleCount);

        // Initialize
        initMap();
        loadMapData();
