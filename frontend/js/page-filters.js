        const STORAGE_KEY = 'stormScout_alertFilters';
        const DEFAULT_PRESET = 'CUSTOM';

        let alertTypesByLevel = {};
        let filterPresets = {};
        let currentFilters = {};

        // Alert type descriptions
        const ALERT_DESCRIPTIONS = {
            // CRITICAL
            'Tornado Warning': 'A tornado has been sighted or indicated by radar. Take shelter immediately.',
            'Hurricane Warning': 'Hurricane conditions expected within 36 hours. Complete preparations now.',
            'Flash Flood Warning': 'Flash flooding is occurring or imminent. Move to higher ground immediately.',
            'Severe Thunderstorm Warning': 'Severe thunderstorm producing damaging winds and/or large hail.',
            'Blizzard Warning': 'Severe winter storm with sustained winds 35+ mph and falling/blowing snow.',
            'Tsunami Warning': 'Tsunami is imminent or occurring. Evacuate coastal areas immediately.',

            // HIGH
            'Winter Storm Warning': 'Significant winter weather expected. Prepare for hazardous conditions.',
            'Flood Warning': 'Flooding is occurring or imminent. Be prepared to evacuate.',
            'High Wind Warning': 'Sustained winds 40+ mph or gusts 58+ mph expected.',
            'Tornado Watch': 'Conditions favorable for tornado development. Monitor weather closely.',
            'Tropical Storm Warning': 'Tropical storm conditions expected within 36 hours.',

            // MODERATE
            'Winter Weather Advisory': 'Winter weather conditions may cause travel difficulties.',
            'Wind Advisory': 'Sustained winds 30-40 mph or gusts 45-57 mph expected.',
            'Heat Advisory': 'Heat index values may cause heat-related illness.',
            'Dense Fog Advisory': 'Dense fog reducing visibility to 1/4 mile or less.',

            // LOW
            'Small Craft Advisory': 'Hazardous conditions for small boats.',
            'Rip Current Statement': 'Dangerous rip currents present at beaches.',
            'Beach Hazards Statement': 'Hazardous conditions at beaches.',
            'Cold Weather Advisory': 'Cold temperatures may cause health concerns.',

            // INFO
            'Special Weather Statement': 'Non-warning informational statement about weather.',
            'Marine Weather Statement': 'Informational statement for marine interests.',
            'Hazardous Weather Outlook': 'Potential for hazardous weather in the coming days.'
        };

        // Impact level colors
        const IMPACT_COLORS = {
            'CRITICAL': 'danger',
            'HIGH': 'warning',
            'MODERATE': 'info',
            'LOW': 'secondary',
            'INFO': 'light'
        };

        // Load alert types and presets
        async function loadData() {
            try {
                // Load alert types
                const typesResponse = await fetch(`${API_BASE_URL}/filters/types/all`);
                const typesData = await typesResponse.json();
                alertTypesByLevel = typesData.data;

                // Load presets
                const presetsResponse = await fetch(`${API_BASE_URL}/filters`);
                const presetsData = await presetsResponse.json();
                filterPresets = presetsData.data;

                // Load saved preferences or use defaults
                loadPreferences();

                // Render the page
                renderAlertTypes();
                updateStatus();

            } catch (error) {
                console.error('Failed to load data:', error);
                document.getElementById('alertTypesContainer').innerHTML =
                    renderErrorHtml('Failed to load alert types. Please refresh the page.');
            }
        }

        // Load user preferences from localStorage
        function loadPreferences() {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                currentFilters = JSON.parse(saved);
                console.log('Loaded saved preferences');
            } else {
                // Use default preset
                applyPreset(DEFAULT_PRESET, false);
            }
        }

        // Save preferences to localStorage
        function savePreferences() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentFilters));

            // Show success message
            const statusEl = document.getElementById('activeFilterStatus');
            const originalText = statusEl.textContent;
            statusEl.textContent = '✓ Preferences saved!';
            statusEl.parentElement.classList.add('alert-success');
            statusEl.parentElement.classList.remove('alert-info');

            setTimeout(() => {
                statusEl.textContent = originalText;
                statusEl.parentElement.classList.remove('alert-success');
                statusEl.parentElement.classList.add('alert-info');
            }, 2000);
        }

        // Apply a preset filter
        function applyPreset(presetName, save = true) {
            const preset = filterPresets[presetName];
            if (!preset) return;

            currentFilters = {};

            // Enable all alert types in included categories
            for (const [level, types] of Object.entries(alertTypesByLevel)) {
                if (preset.includeCategories.includes(level)) {
                    types.forEach(type => {
                        // Check if explicitly excluded
                        if (!preset.excludeTypes || !preset.excludeTypes.includes(type)) {
                            currentFilters[type] = true;
                        }
                    });
                }
            }

            renderAlertTypes();
            updateStatus();

            if (save) {
                savePreferences();
            }
        }

        // Reset to default settings
        function resetToDefaults() {
            if (confirm('Reset to default filter settings (Office Default)?')) {
                applyPreset(DEFAULT_PRESET, true);
            }
        }

        // Toggle individual alert type
        function toggleAlertType(alertType) {
            // Toggle state
            const newState = currentFilters[alertType] === true ? undefined : true;
            currentFilters[alertType] = newState;

            // Update DOM immediately for instant visual feedback
            const elementId = `alert_${alertType.replace(/\s+/g, '_')}`;
            const checkbox = document.getElementById(elementId);

            if (checkbox) {
                const card = checkbox.closest('.alert-type-card');

                if (card) {
                    if (newState === true) {
                        // Enable: remove disabled class, check the box
                        card.classList.remove('disabled');
                        checkbox.checked = true;
                    } else {
                        // Disable: add disabled class, uncheck the box
                        card.classList.add('disabled');
                        checkbox.checked = false;
                    }
                }
            }

            updateStatus();
        }

        // Render all alert types
        function renderAlertTypes() {
            const container = document.getElementById('alertTypesContainer');
            let htmlContent = '';

            for (const [level, types] of Object.entries(alertTypesByLevel)) {
                const color = IMPACT_COLORS[level];
                const levelName = level.charAt(0) + level.slice(1).toLowerCase();
                const safeLevel = escapeHtml(level);

                htmlContent += html`
                    <div class="row mb-4">
                        <div class="col-12">
                            <h4 class="border-bottom pb-2">
                                <span class="badge bg-${raw(color)} impact-badge">${levelName}</span>
                                ${level} Impact Alerts
                                <button class="btn btn-sm btn-outline-secondary ms-2" data-toggle-level="${safeLevel}" data-enable="true">
                                    Enable All
                                </button>
                                <button class="btn btn-sm btn-outline-secondary" data-toggle-level="${safeLevel}" data-enable="false">
                                    Disable All
                                </button>
                            </h4>
                        </div>
                `;

                types.forEach(type => {
                    const isEnabled = currentFilters[type] === true;
                    const description = ALERT_DESCRIPTIONS[type] || 'Official NOAA weather alert type.';
                    const safeType = escapeHtml(type);
                    const safeTypeId = escapeHtml(type.replace(/\s+/g, '_'));

                    htmlContent += html`
                        <div class="col-md-6 col-lg-4 mb-3">
                            <div class="card alert-type-card ${raw(!isEnabled ? 'disabled' : '')}">
                                <div class="card-body">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox"
                                               id="alert_${safeTypeId}"
                                               data-alert-type="${safeType}"
                                               ${raw(isEnabled ? 'checked' : '')}>
                                        <label class="form-check-label" for="alert_${safeTypeId}">
                                            <strong>${type}</strong>
                                        </label>
                                    </div>
                                    <p class="text-muted small mb-0 mt-2">${description}</p>
                                </div>
                            </div>
                        </div>
                    `;
                });

                htmlContent += '</div>';
            }

            container.innerHTML = htmlContent;
        }

        // Toggle all alerts in a level
        function toggleLevel(level, enable) {
            const types = alertTypesByLevel[level];
            if (!types) return;

            types.forEach(type => {
                currentFilters[type] = enable;
            });

            renderAlertTypes();
            updateStatus();
        }

        // Update status display
        function updateStatus() {
            const totalTypes = Object.values(alertTypesByLevel).flat().length;
            const enabledTypes = Object.values(currentFilters).filter(v => v === true).length;

            document.getElementById('enabledCount').textContent = enabledTypes;
            document.getElementById('totalCount').textContent = totalTypes;

            // Determine which preset matches current config (if any)
            let matchingPreset = 'Custom';
            for (const [name, preset] of Object.entries(filterPresets)) {
                if (isPresetMatch(preset)) {
                    matchingPreset = preset.name;
                    break;
                }
            }

            document.getElementById('activeFilterStatus').textContent = matchingPreset;
        }

        // Check if current config matches a preset
        function isPresetMatch(preset) {
            const enabledTypes = Object.entries(currentFilters)
                .filter(([type, enabled]) => enabled === true)
                .map(([type]) => type);

            for (const [level, types] of Object.entries(alertTypesByLevel)) {
                for (const type of types) {
                    const shouldBeEnabled = preset.includeCategories.includes(level) &&
                                          (!preset.excludeTypes || !preset.excludeTypes.includes(type));
                    const isEnabled = currentFilters[type] === true;

                    if (shouldBeEnabled !== isEnabled) {
                        return false;
                    }
                }
            }

            return true;
        }

        // Event delegation for dynamically generated elements
        document.addEventListener('click', function(e) {
            // Preset buttons
            if (e.target.closest('[data-preset]')) {
                const preset = e.target.closest('[data-preset]').dataset.preset;
                applyPreset(preset);
            }
            // Toggle level buttons
            if (e.target.closest('[data-toggle-level]')) {
                const btn = e.target.closest('[data-toggle-level]');
                const level = btn.dataset.toggleLevel;
                const enable = btn.dataset.enable === 'true';
                toggleLevel(level, enable);
            }
        });

        document.addEventListener('change', function(e) {
            // Alert type toggles
            if (e.target.dataset.alertType) {
                toggleAlertType(e.target.dataset.alertType);
            }
        });

        // Static button event listeners
        document.getElementById('resetDefaultsBtn').addEventListener('click', resetToDefaults);
        document.getElementById('savePrefsBtn').addEventListener('click', savePreferences);

        // Initialize
        loadData();
