/**
 * page-locations.js
 * Location settings page — lets users configure which of the 302 monitored
 * locations to include in dashboard views; saves preferences to localStorage.
 *
 * Key responsibilities:
 *   - Fetches all offices from the backend API via LocationFilters.init()
 *   - Loads existing preferences from localStorage and renders a toggle card
 *     for each office, grouped by state in flat sections
 *   - Supports search by name/city/zip, bulk enable/disable per state,
 *     and global enable/disable all
 *   - Persists the current toggle state to localStorage on save; the
 *     LocationFilters utility reads this key on all other pages
 *
 * State variables:
 *   searchTerm - Current free-text search filter (debounced)
 *
 * External dependencies (globals):
 *   API_BASE_URL, LocationFilters, html, raw, escapeHtml, debounce,
 *   renderEmptyHtml, renderErrorHtml, showToast
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

let searchTerm = '';
let dirty = false;

/** @type {Object<string, string>} office_id (string) → highest severity level */
let advisorySeverityMap = {};

const SEVERITY_RANK = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 };

// Non-CONUS state/territory codes (excluded by Continental US preset)
const NON_CONUS = ['AK', 'HI', 'PR', 'GU', 'VI', 'AS', 'MP'];

// Geographic presets — state-code arrays, no backend needed
const LOCATION_PRESETS = {
    ALL: {
        name: 'All Locations',
        icon: 'bi-globe',
        states: null // null = enable all
    },
    CONUS: {
        name: 'Continental US',
        icon: 'bi-map',
        states: null, // computed at apply time: all states minus NON_CONUS
        excludeStates: NON_CONUS
    },
    EAST_COAST: {
        name: 'East Coast',
        icon: 'bi-sunrise',
        states: [
            'ME',
            'NH',
            'VT',
            'MA',
            'RI',
            'CT',
            'NY',
            'NJ',
            'PA',
            'DE',
            'MD',
            'DC',
            'VA',
            'WV',
            'NC',
            'SC',
            'GA',
            'FL'
        ]
    },
    GULF_COAST: {
        name: 'Gulf Coast',
        icon: 'bi-water',
        states: ['TX', 'LA', 'MS', 'AL', 'FL']
    },
    TORNADO_ALLEY: {
        name: 'Tornado Alley',
        icon: 'bi-tornado',
        states: ['TX', 'OK', 'KS', 'NE', 'SD', 'ND', 'IA', 'MO']
    },
    HURRICANE: {
        name: 'Hurricane Zone',
        icon: 'bi-tropical-storm',
        states: ['FL', 'GA', 'SC', 'NC', 'VA', 'TX', 'LA', 'MS', 'AL', 'PR', 'VI', 'GU']
    }
};

// US state name lookup for display
const STATE_NAMES = {
    AL: 'Alabama',
    AK: 'Alaska',
    AZ: 'Arizona',
    AR: 'Arkansas',
    CA: 'California',
    CO: 'Colorado',
    CT: 'Connecticut',
    DE: 'Delaware',
    DC: 'District of Columbia',
    FL: 'Florida',
    GA: 'Georgia',
    HI: 'Hawaii',
    ID: 'Idaho',
    IL: 'Illinois',
    IN: 'Indiana',
    IA: 'Iowa',
    KS: 'Kansas',
    KY: 'Kentucky',
    LA: 'Louisiana',
    ME: 'Maine',
    MD: 'Maryland',
    MA: 'Massachusetts',
    MI: 'Michigan',
    MN: 'Minnesota',
    MS: 'Mississippi',
    MO: 'Missouri',
    MT: 'Montana',
    NE: 'Nebraska',
    NV: 'Nevada',
    NH: 'New Hampshire',
    NJ: 'New Jersey',
    NM: 'New Mexico',
    NY: 'New York',
    NC: 'North Carolina',
    ND: 'North Dakota',
    OH: 'Ohio',
    OK: 'Oklahoma',
    OR: 'Oregon',
    PA: 'Pennsylvania',
    RI: 'Rhode Island',
    SC: 'South Carolina',
    SD: 'South Dakota',
    TN: 'Tennessee',
    TX: 'Texas',
    UT: 'Utah',
    VT: 'Vermont',
    VA: 'Virginia',
    WA: 'Washington',
    WV: 'West Virginia',
    WI: 'Wisconsin',
    WY: 'Wyoming',
    PR: 'Puerto Rico',
    GU: 'Guam',
    VI: 'Virgin Islands',
    AS: 'American Samoa',
    MP: 'Northern Mariana Islands'
};

/**
 * Initialize LocationFilters and render the page.
 * @returns {Promise<void>}
 */
async function loadData() {
    try {
        const [success, advisories] = await Promise.all([
            LocationFilters.init(),
            API.getActiveAdvisories().catch(() => [])
        ]);
        if (!success) throw new Error('Failed to initialize location filters');

        // Build office → highest severity map (cached fetch, no extra network cost)
        const advData = Array.isArray(advisories) ? advisories : advisories?.data || [];
        advData.forEach((adv) => {
            const key = String(adv.office_id);
            const severity = typeof adv.severity === 'string' ? adv.severity : '';
            const rank = SEVERITY_RANK[severity] || 0;
            if (rank > (SEVERITY_RANK[advisorySeverityMap[key]] || 0)) {
                advisorySeverityMap[key] = severity;
            }
        });

        renderLocations();
        updateStatus();
        populateStateFilter();
    } catch (error) {
        console.error('Failed to load data:', error);
        document.getElementById('locationsContainer').innerHTML = renderErrorHtml(
            'Failed to load locations. Please refresh the page.'
        );
    }
}

/**
 * Persist location preferences to localStorage and show success feedback.
 */
function savePreferences() {
    try {
        localStorage.setItem(LocationFilters.STORAGE_KEY, JSON.stringify(LocationFilters.userFilters));
        localStorage.setItem('stormScout_settingsApplied', 'location');
    } catch (e) {
        showToast('Unable to save preferences — localStorage may be full.', 'warning');
        return;
    }

    dirty = false;
    updateSaveButton();

    // Show success message
    const statusEl = document.getElementById('activeLocationStatus');
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

/**
 * Mark the page as having unsaved changes.
 */
function markDirty() {
    dirty = true;
    updateSaveButton();
}

/**
 * Update the Save button appearance based on dirty state.
 */
function updateSaveButton() {
    const btn = document.getElementById('savePrefsBtn');
    if (!btn) return;
    if (dirty) {
        btn.innerHTML = '<i class="bi bi-check-circle"></i> Save Preferences *';
        btn.classList.add('btn-warning');
        btn.classList.remove('btn-success');
    } else {
        btn.innerHTML = '<i class="bi bi-check-circle"></i> Save Preferences';
        btn.classList.add('btn-success');
        btn.classList.remove('btn-warning');
    }
}

/**
 * Enable all locations and re-render.
 */
function enableAllLocations() {
    LocationFilters.enableAll();
    markDirty();
    renderLocations();
    updateStatus();
}

/**
 * Disable all locations and re-render.
 */
function disableAllLocations() {
    LocationFilters.disableAll();
    markDirty();
    renderLocations();
    updateStatus();
}

/**
 * Reset to defaults (all enabled) with confirmation.
 */
function resetToDefaults() {
    if (confirm("Reset all locations to enabled? You'll need to save to keep changes.")) {
        applyLocationPreset('ALL');
    }
}

/**
 * Apply a geographic preset — enables offices in the preset's states, disables the rest.
 * @param {string} presetName - Key from LOCATION_PRESETS
 */
function applyLocationPreset(presetName) {
    if (!Object.hasOwn(LOCATION_PRESETS, presetName)) return;
    const preset = LOCATION_PRESETS[presetName];

    if (preset.states === null && !preset.excludeStates) {
        // "All Locations" — enable everything
        LocationFilters.enableAll();
    } else {
        // Start with all disabled, then enable matching states
        LocationFilters.disableAll();
        const allStates = LocationFilters.getStates();
        const targetStates = preset.states ? preset.states : allStates.filter((s) => !preset.excludeStates.includes(s));
        targetStates.forEach((state) => LocationFilters.enableByState(state));
    }

    markDirty();
    renderLocations();
    updateStatus();
}

/**
 * Detect which preset matches the current filter configuration.
 * @returns {string} Matching preset name or 'Custom'
 */
function getActivePresetName() {
    const allStates = LocationFilters.getStates();

    // Build enabledStates once (not per-preset) to avoid O(presets * states * offices)
    const enabledStates = new Set();
    allStates.forEach((state) => {
        const { enabled, total } = LocationFilters.getStateCount(state);
        if (enabled === total && total > 0) enabledStates.add(state);
    });

    for (const [key, preset] of Object.entries(LOCATION_PRESETS)) {
        let targetStates;
        if (preset.states === null && !preset.excludeStates) {
            // "All" preset — check if everything is enabled
            if (LocationFilters.isFullView()) return preset.name;
            continue;
        } else if (preset.states === null && preset.excludeStates) {
            // "CONUS" — all minus excluded
            targetStates = allStates.filter((s) => !preset.excludeStates.includes(s));
        } else {
            targetStates = preset.states;
        }

        // Check: every target state fully enabled, every non-target state fully disabled
        const targetSet = new Set(targetStates);
        if (targetSet.size === enabledStates.size && [...targetSet].every((s) => enabledStates.has(s))) {
            return preset.name;
        }
    }

    return 'Custom';
}

/**
 * Toggle a single office and update the DOM immediately.
 * @param {string|number} officeId
 */
function toggleLocation(officeId) {
    LocationFilters.toggleOffice(officeId);
    markDirty();

    const isEnabled = LocationFilters.shouldIncludeOffice(officeId);
    const card = document.querySelector(`[data-office-id="${CSS.escape(String(officeId))}"]`);

    if (card) {
        const checkbox = card.querySelector('.form-check-input');
        if (isEnabled) {
            card.classList.remove('disabled');
            if (checkbox) checkbox.checked = true;
        } else {
            card.classList.add('disabled');
            if (checkbox) checkbox.checked = false;
        }
    }

    // Update the state-level counter
    const office = LocationFilters.allOffices.find((o) => String(o.id) === String(officeId));
    if (office) {
        updateStateCounter(office.state);
    }

    updateStatus();
}

/**
 * Toggle all offices in a state.
 * @param {string} stateCode
 * @param {boolean} enable
 */
function toggleState(stateCode, enable) {
    if (enable) {
        LocationFilters.enableByState(stateCode);
    } else {
        LocationFilters.disableByState(stateCode);
    }
    markDirty();
    renderLocations();
    updateStatus();
}

/**
 * Update the counter badge for a specific state section heading.
 * @param {string} stateCode
 */
function updateStateCounter(stateCode) {
    const { enabled, total } = LocationFilters.getStateCount(stateCode);

    // Update badge
    const counter = document.getElementById(`state-count-${CSS.escape(stateCode)}`);
    if (counter) {
        const icon = enabled === total ? 'bi-check-circle-fill' : enabled === 0 ? 'bi-x-circle' : 'bi-dash-circle';
        counter.innerHTML = `<i class="bi ${icon}"></i> ${enabled}/${total}`;
        counter.className = `badge ${enabled === total ? 'bg-success' : enabled === 0 ? 'bg-secondary' : 'bg-warning text-dark'}`;
    }

    // Update heading visual hierarchy
    const heading = document.querySelector(`[data-state-heading="${CSS.escape(stateCode)}"]`);
    if (heading) {
        heading.classList.remove('state-all-enabled', 'state-partial', 'state-all-disabled');
        heading.classList.add(
            enabled === total ? 'state-all-enabled' : enabled === 0 ? 'state-all-disabled' : 'state-partial'
        );
    }
}

/**
 * Render the full location grid grouped by state in flat sections.
 * Matches the Alert Filters page pattern: always-visible sections with
 * inline bulk actions and a 3-column card grid.
 */
function renderLocations() {
    const container = document.getElementById('locationsContainer');
    const officesByState = LocationFilters.getOfficesByState();
    const states = Object.keys(officesByState).sort();
    const term = searchTerm.toLowerCase().trim();

    let htmlContent = '';
    let visibleOfficeCount = 0;

    states.forEach((stateCode) => {
        let offices = officesByState[stateCode];

        // Apply search filter
        if (term) {
            offices = offices.filter(
                (o) =>
                    o.name.toLowerCase().includes(term) ||
                    o.city.toLowerCase().includes(term) ||
                    (o.office_code && o.office_code.toLowerCase().includes(term)) ||
                    stateCode.toLowerCase().includes(term) ||
                    (STATE_NAMES[stateCode] && STATE_NAMES[stateCode].toLowerCase().includes(term)) ||
                    (o.observation_station && o.observation_station.toLowerCase().includes(term)) ||
                    (o.station_name && o.station_name.toLowerCase().includes(term))
            );
        }

        if (offices.length === 0) return;

        visibleOfficeCount += offices.length;

        const { enabled, total } = LocationFilters.getStateCount(stateCode);
        const stateName = STATE_NAMES[stateCode] || stateCode;
        const safeState = escapeHtml(stateCode);
        const badgeClass = enabled === total ? 'bg-success' : enabled === 0 ? 'bg-secondary' : 'bg-warning text-dark';
        const badgeIcon = enabled === total ? 'bi-check-circle-fill' : enabled === 0 ? 'bi-x-circle' : 'bi-dash-circle';

        const stateClass =
            enabled === total ? 'state-all-enabled' : enabled === 0 ? 'state-all-disabled' : 'state-partial';

        // State section heading (flat, always visible — matches filters.html pattern)
        htmlContent += html`
            <div class="row mb-2" id="heading-${safeState}">
                <div class="col-12">
                    <h4
                        class="state-section-heading border-bottom pb-2 ${raw(stateClass)}"
                        data-state-heading="${safeState}"
                    >
                        <span class="badge ${raw(badgeClass)} me-2" id="state-count-${safeState}"
                            >${raw(`<i class="bi ${badgeIcon}"></i>`)}
                            ${raw(String(enabled))}/${raw(String(total))}</span
                        >
                        ${stateName}
                        <span class="text-muted small fw-normal">(${safeState})</span>
                        <button
                            class="btn btn-sm btn-outline-secondary ms-2"
                            data-toggle-state="${safeState}"
                            data-enable="true"
                            aria-label="${raw(`Enable all offices in ${escapeHtml(stateName)}`)}"
                        >
                            Enable All
                        </button>
                        <button
                            class="btn btn-sm btn-outline-secondary"
                            data-toggle-state="${safeState}"
                            data-enable="false"
                            aria-label="${raw(`Disable all offices in ${escapeHtml(stateName)}`)}"
                        >
                            Disable All
                        </button>
                    </h4>
                </div>
            </div>
        `;

        // Office cards in 3-column grid
        htmlContent += '<div class="row">';

        offices.forEach((office) => {
            const isEnabled = LocationFilters.shouldIncludeOffice(office.id);
            const safeId = escapeHtml(office.id);
            const safeName = escapeHtml(office.name);
            const safeCity = escapeHtml(office.city);
            const safeZip = escapeHtml(office.office_code || '');
            const safeStation = escapeHtml(office.observation_station || '');
            const safeStationName = escapeHtml(office.station_name || '');

            htmlContent += html`
                <div class="col-sm-6 col-lg-4 mb-3">
                    <div class="card location-card ${raw(!isEnabled ? 'disabled' : '')}" data-office-id="${safeId}">
                        <div class="card-body">
                            <div class="form-check form-switch">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    id="loc_${safeId}"
                                    data-office-id="${safeId}"
                                    aria-label="${raw(
                                        `Enable monitoring for ${escapeHtml(office.name)}, ${escapeHtml(office.city)}, ${escapeHtml(office.state)}`
                                    )}"
                                    ${raw(isEnabled ? 'checked' : '')}
                                />
                                <label class="form-check-label" for="loc_${safeId}">
                                    <strong>${safeName}</strong>
                                </label>
                            </div>
                            <p class="text-muted small mb-0 mt-2">
                                <i class="bi bi-geo-alt"></i> ${safeCity},
                                ${safeState}${raw(safeZip ? ' &middot; ' : '')}${safeZip}
                            </p>
                            ${raw(
                                safeStation
                                    ? `<p class="text-muted small mb-0 mt-1 station-info"><i class="bi bi-broadcast"></i> ${safeStation}${safeStationName ? ` &mdash; ${safeStationName}` : ''}</p>`
                                    : ''
                            )}
                            ${raw((() => {
                                const sev = advisorySeverityMap[String(office.id)];
                                if (!sev) return '';
                                const safeSev = escapeHtml(sev);
                                const cls = escapeHtml(sev.toLowerCase());
                                return `<p class="mb-0 mt-2"><span class="badge severity-${cls}"><i class="bi bi-cloud-lightning-fill"></i> ${safeSev} Advisory</span></p>`;
                            })())}
                        </div>
                    </div>
                </div>
            `;
        });

        htmlContent += '</div>';
    });

    if (visibleOfficeCount === 0 && term) {
        htmlContent = renderEmptyHtml(
            'bi-search',
            'No locations match your search',
            `No offices found matching "${escapeHtml(term)}"`
        );
    }

    container.innerHTML = htmlContent;
}

/**
 * Update the status bar with enabled/total counts.
 */
function updateStatus() {
    const enabled = LocationFilters.getEnabledCount();
    const total = LocationFilters.getTotalCount();

    document.getElementById('enabledLocationCount').textContent = enabled;
    document.getElementById('totalLocationCount').textContent = total;

    const activeName = getActivePresetName();
    document.getElementById('activeLocationStatus').textContent = activeName;

    // Highlight the matching location preset button
    document.querySelectorAll('[data-location-preset]').forEach((btn) => {
        const key = btn.dataset.locationPreset;
        const presetName = LOCATION_PRESETS[key]?.name;
        const isActive = presetName === activeName;
        btn.classList.remove('btn-outline-primary', 'btn-outline-success', 'btn-success');
        if (isActive) {
            btn.classList.add('btn-success');
        } else if (key === 'ALL') {
            btn.classList.add('btn-outline-success');
        } else {
            btn.classList.add('btn-outline-primary');
        }
    });
}

/**
 * Populate the "Jump to State" dropdown.
 */
function populateStateFilter() {
    const select = document.getElementById('stateJumpFilter');
    if (!select) return;

    const states = LocationFilters.getStates();
    states.forEach((stateCode) => {
        const option = document.createElement('option');
        option.value = stateCode;
        option.textContent = `${STATE_NAMES[stateCode] || stateCode} (${stateCode})`;
        select.appendChild(option);
    });
}

/**
 * Jump to a state's section heading and scroll it into view.
 * @param {string} stateCode
 */
function jumpToState(stateCode) {
    if (!stateCode) return;
    const heading = document.getElementById(`heading-${stateCode}`);
    if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ---------------------------------------------------------------------------
// Event delegation for dynamically generated elements
// ---------------------------------------------------------------------------
document.addEventListener('click', function (e) {
    // Preset buttons
    if (e.target.closest('[data-location-preset]')) {
        const preset = e.target.closest('[data-location-preset]').dataset.locationPreset;
        applyLocationPreset(preset);
    }
    // State-level toggle buttons
    if (e.target.closest('[data-toggle-state]')) {
        const btn = e.target.closest('[data-toggle-state]');
        const stateCode = btn.dataset.toggleState;
        const enable = btn.dataset.enable === 'true';
        toggleState(stateCode, enable);
    }
});

document.addEventListener('change', function (e) {
    // Individual office toggles
    if (e.target.dataset.officeId) {
        toggleLocation(e.target.dataset.officeId);
    }
});

// Static button event listeners
document.getElementById('resetDefaultsBtn').addEventListener('click', resetToDefaults);
document.getElementById('savePrefsBtn').addEventListener('click', savePreferences);

// Search with debounce
document.getElementById('locationSearch').addEventListener(
    'input',
    debounce(function (e) {
        searchTerm = e.target.value;
        renderLocations();
    }, 300)
);

// Jump to state
document.getElementById('stateJumpFilter').addEventListener('change', function (e) {
    jumpToState(e.target.value);
    e.target.value = ''; // Reset dropdown
});

// Warn before navigating away with unsaved changes
window.addEventListener('beforeunload', function (e) {
    if (dirty) {
        e.preventDefault();
    }
});

// Initialize
loadData();
initHelpIconKeyboard();
