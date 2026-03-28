/**
 * page-locations.js
 * Location settings page — lets users configure which of the 302 monitored
 * locations to include in dashboard views; saves preferences to localStorage.
 *
 * Key responsibilities:
 *   - Fetches all offices from the backend API via LocationFilters.init()
 *   - Loads existing preferences from localStorage and renders a toggle card
 *     for each office, grouped by state in collapsible accordion sections
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

// US state name lookup for display
const STATE_NAMES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
    OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
    WY: 'Wyoming', PR: 'Puerto Rico', GU: 'Guam', VI: 'Virgin Islands',
    AS: 'American Samoa', MP: 'Northern Mariana Islands'
};

/**
 * Initialize LocationFilters and render the page.
 * @returns {Promise<void>}
 */
async function loadData() {
    try {
        const success = await LocationFilters.init();
        if (!success) throw new Error('Failed to initialize location filters');

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
    if (confirm('Reset all locations to enabled? You\'ll need to save to keep changes.')) {
        enableAllLocations();
    }
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
 * Update the counter badge for a specific state accordion header.
 * @param {string} stateCode
 */
function updateStateCounter(stateCode) {
    const counter = document.getElementById(`state-count-${CSS.escape(stateCode)}`);
    if (counter) {
        const { enabled, total } = LocationFilters.getStateCount(stateCode);
        const icon = enabled === total ? 'bi-check-circle-fill' : enabled === 0 ? 'bi-x-circle' : 'bi-dash-circle';
        counter.innerHTML = `<i class="bi ${icon}"></i> ${enabled}/${total}`;
        counter.className = `badge ${enabled === total ? 'bg-success' : enabled === 0 ? 'bg-secondary' : 'bg-warning text-dark'}`;
    }
}

/**
 * Render the full location grid grouped by state in an accordion.
 */
function renderLocations() {
    const container = document.getElementById('locationsContainer');
    const officesByState = LocationFilters.getOfficesByState();
    const states = Object.keys(officesByState).sort();
    const term = searchTerm.toLowerCase().trim();

    let htmlContent = '<div class="accordion" id="locationAccordion">';

    let visibleOfficeCount = 0;

    states.forEach((stateCode) => {
        let offices = officesByState[stateCode];

        // Apply search filter
        if (term) {
            offices = offices.filter((o) =>
                o.name.toLowerCase().includes(term) ||
                o.city.toLowerCase().includes(term) ||
                (o.office_code && o.office_code.toLowerCase().includes(term)) ||
                stateCode.toLowerCase().includes(term) ||
                (STATE_NAMES[stateCode] && STATE_NAMES[stateCode].toLowerCase().includes(term))
            );
        }

        if (offices.length === 0) return;

        visibleOfficeCount += offices.length;

        const { enabled, total } = LocationFilters.getStateCount(stateCode);
        const stateName = STATE_NAMES[stateCode] || stateCode;
        const safeState = escapeHtml(stateCode);
        const badgeClass = enabled === total ? 'bg-success' : enabled === 0 ? 'bg-secondary' : 'bg-warning text-dark';
        const badgeIcon = enabled === total ? 'bi-check-circle-fill' : enabled === 0 ? 'bi-x-circle' : 'bi-dash-circle';
        // Expand accordion item if searching
        const isExpanded = term.length > 0;

        htmlContent += html`
            <div class="accordion-item">
                <h2 class="accordion-header" id="heading-${safeState}">
                    <button class="accordion-button ${raw(isExpanded ? '' : 'collapsed')}"
                            type="button"
                            data-bs-toggle="collapse"
                            data-bs-target="#collapse-${safeState}"
                            aria-expanded="${raw(isExpanded ? 'true' : 'false')}"
                            aria-controls="collapse-${safeState}">
                        <span class="me-2 fw-bold">${stateName}</span>
                        <span class="badge ${raw(badgeClass)} me-2" id="state-count-${safeState}">${raw(`<i class="bi ${badgeIcon}"></i>`)} ${raw(String(enabled))}/${raw(String(total))}</span>
                        <span class="text-muted small">(${safeState})</span>
                    </button>
                </h2>
                <div id="collapse-${safeState}"
                     class="accordion-collapse collapse ${raw(isExpanded ? 'show' : '')}"
                     aria-labelledby="heading-${safeState}">
                    <div class="accordion-body">
                        <div class="mb-2">
                            <button class="btn btn-sm btn-outline-secondary me-1"
                                    data-toggle-state="${safeState}" data-enable="true"
                                    aria-label="${raw(`Enable all offices in ${escapeHtml(stateName)}`)}">
                                <i class="bi bi-check-all"></i> Enable All ${safeState}
                            </button>
                            <button class="btn btn-sm btn-outline-secondary"
                                    data-toggle-state="${safeState}" data-enable="false"
                                    aria-label="${raw(`Disable all offices in ${escapeHtml(stateName)}`)}">
                                <i class="bi bi-x-lg"></i> Disable All ${safeState}
                            </button>
                        </div>
                        <div class="row">
        `;

        offices.forEach((office) => {
            const isEnabled = LocationFilters.shouldIncludeOffice(office.id);
            const safeId = escapeHtml(office.id);
            const safeName = escapeHtml(office.name);
            const safeCity = escapeHtml(office.city);
            const safeZip = escapeHtml(office.office_code || '');

            htmlContent += html`
                <div class="col-sm-6 col-lg-4 mb-3">
                    <div class="card location-card ${raw(!isEnabled ? 'disabled' : '')}"
                         data-office-id="${safeId}">
                        <div class="card-body py-2 px-3">
                            <div class="form-check form-switch">
                                <input class="form-check-input"
                                       type="checkbox"
                                       id="loc_${safeId}"
                                       data-office-id="${safeId}"
                                       aria-label="${raw(`Enable monitoring for ${escapeHtml(office.name)}, ${escapeHtml(office.city)}, ${escapeHtml(office.state)}`)}"
                                       ${raw(isEnabled ? 'checked' : '')} />
                                <label class="form-check-label" for="loc_${safeId}">
                                    <strong>${safeName}</strong>
                                </label>
                            </div>
                            <p class="text-muted small mb-0 mt-1">
                                <i class="bi bi-geo-alt"></i> ${safeCity}, ${safeState}${raw(safeZip ? ' &middot; ' : '')}${safeZip}
                            </p>
                        </div>
                    </div>
                </div>
            `;
        });

        htmlContent += `
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    htmlContent += '</div>';

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
    document.getElementById('activeLocationStatus').textContent = LocationFilters.getFilterStatus();
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
 * Jump to a state's accordion section and expand it.
 * @param {string} stateCode
 */
function jumpToState(stateCode) {
    if (!stateCode) return;
    const collapseEl = document.getElementById(`collapse-${stateCode}`);
    if (collapseEl) {
        // Expand the accordion item
        const bsCollapse = new bootstrap.Collapse(collapseEl, { toggle: false });
        bsCollapse.show();

        // Scroll into view
        const heading = document.getElementById(`heading-${stateCode}`);
        if (heading) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// ---------------------------------------------------------------------------
// Event delegation for dynamically generated elements
// ---------------------------------------------------------------------------
document.addEventListener('click', function (e) {
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
document.getElementById('enableAllBtn').addEventListener('click', enableAllLocations);
document.getElementById('disableAllBtn').addEventListener('click', disableAllLocations);
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
