/**
 * page-filters.js
 * Filter settings page — lets users configure which of the 96 NOAA alert
 * types to include; saves preferences to localStorage.
 *
 * Key responsibilities:
 *   - Fetches the full NOAA alert-type taxonomy (grouped by impact level)
 *     and the available filter presets from the backend API
 *   - Loads existing preferences from localStorage (STORAGE_KEY) and
 *     falls back to the DEFAULT_PRESET when no saved state is found
 *   - Renders a toggle card for each alert type, grouped by impact level
 *     (CRITICAL, HIGH, MODERATE, LOW, INFO)
 *   - Supports preset application (Standard, Minimal, Full, Custom) and
 *     per-level bulk enable/disable
 *   - Persists the current toggle state to localStorage on save; the
 *     AlertFilters utility reads this key on all other pages
 *
 * State variables:
 *   alertTypesByLevel - Object keyed by impact level; value is string[] of types
 *   filterPresets     - Named preset configs fetched from the backend
 *   currentFilters    - Map of alertType → true|undefined (undefined = disabled)
 *
 * External dependencies (globals):
 *   API_BASE_URL, html, raw, escapeHtml, renderEmptyHtml, renderErrorHtml
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

const STORAGE_KEY = 'stormScout_alertFilters';
const DEFAULT_PRESET = 'CUSTOM';

let alertTypesByLevel = {};
let filterPresets = {};
let currentFilters = {};
let dirty = false;

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
    CRITICAL: 'danger',
    HIGH: 'warning',
    MODERATE: 'info',
    LOW: 'secondary',
    INFO: 'light'
};

// Map backend category names to canonical NOAA severity labels
const IMPACT_LABELS = {
    CRITICAL: 'Extreme',
    HIGH: 'Severe',
    MODERATE: 'Moderate',
    LOW: 'Minor',
    INFO: 'Informational'
};

/**
 * Fetch alert-type taxonomy and filter presets from the API, then
 * restore saved preferences and render the full settings page.
 * Both fetch calls are sequential (presets depend on knowing the type list
 * to validate categories) and failures show an inline error.
 *
 * @returns {Promise<void>}
 */
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
        document.getElementById('alertTypesContainer').innerHTML = renderErrorHtml(
            'Failed to load alert types. Please refresh the page.'
        );
    }
}

/**
 * Restore saved filter preferences from localStorage into currentFilters.
 * Falls back to the DEFAULT_PRESET when no saved state exists (e.g. first visit).
 * The save=false argument prevents applyPreset from immediately re-saving,
 * which would overwrite existing preferences before the user has a chance to
 * review them.
 *
 * @returns {void}
 */
function loadPreferences() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                currentFilters = parsed;
            } else {
                applyPreset(DEFAULT_PRESET, false);
            }
        } else {
            applyPreset(DEFAULT_PRESET, false);
        }
    } catch (e) {
        console.warn('[AlertFilters] localStorage unavailable or corrupt:', e.message);
        applyPreset(DEFAULT_PRESET, false);
    }
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
 * Persist the current toggle state to localStorage and show a 2-second
 * success confirmation in the status element.
 * Saving to localStorage means the preference is instantly available to
 * AlertFilters on all other pages without a round-trip to the server.
 *
 * @returns {void}
 */
function savePreferences() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentFilters));
    try {
        localStorage.setItem('stormScout_settingsApplied', 'alert');
    } catch (e) {
        /* ignore */
    }

    dirty = false;
    updateSaveButton();

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

/**
 * Apply a named filter preset to currentFilters and re-render.
 * Preset application logic:
 *   1. Reset currentFilters to an empty object (all disabled)
 *   2. For each impact level in the preset's includeCategories, enable every
 *      alert type in that level unless it appears in excludeTypes
 * This additive model (enable-then-exclude) keeps preset definitions concise
 * since most presets include whole levels with only a few exceptions.
 *
 * @param {string}  presetName - Key in filterPresets (e.g. 'STANDARD', 'FULL')
 * @param {boolean} [save=true] - Whether to immediately persist to localStorage
 * @returns {void}
 */
function applyPreset(presetName, save = true) {
    const preset = filterPresets[presetName];
    if (!preset) return;

    currentFilters = {};

    // Enable all alert types in included categories
    for (const [level, types] of Object.entries(alertTypesByLevel)) {
        if (preset.includeCategories.includes(level)) {
            types.forEach((type) => {
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

/**
 * Prompt the user for confirmation, then reset to the DEFAULT_PRESET.
 * The confirmation dialog prevents accidental resets of carefully customised
 * configurations.
 *
 * @returns {void}
 */
function resetToDefaults() {
    if (confirm('Reset to default filter settings (Office Default)?')) {
        applyPreset(DEFAULT_PRESET, true);
    }
}

/**
 * Toggle a single alert type between enabled (true) and disabled (undefined).
 * Undefined rather than false is used for the disabled state to keep the stored
 * object sparse — only enabled types are written, matching how AlertFilters
 * reads preferences on other pages.
 * The DOM card is updated immediately (without a full re-render) for instant
 * visual feedback.
 *
 * @param {string} alertType - NOAA alert type string to toggle
 * @returns {void}
 */
function toggleAlertType(alertType) {
    // Toggle state
    const newState = currentFilters[alertType] === true ? undefined : true;
    currentFilters[alertType] = newState;
    markDirty();

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

/**
 * Re-render the full alert-type grid from alertTypesByLevel and currentFilters.
 * Each impact level gets a section heading with bulk enable/disable buttons,
 * followed by one toggle card per alert type.
 *
 * @returns {void}
 */
function renderAlertTypes() {
    const container = document.getElementById('alertTypesContainer');
    let htmlContent = '';

    for (const [level, types] of Object.entries(alertTypesByLevel)) {
        const color = IMPACT_COLORS[level];
        const levelName = IMPACT_LABELS[level] || level.charAt(0) + level.slice(1).toLowerCase();
        const safeLevel = escapeHtml(level);

        htmlContent += html`
            <div class="row mb-4">
                <div class="col-12">
                    <h4 class="border-bottom pb-2">
                        <span class="badge bg-${raw(color)} impact-badge">${levelName}</span>
                        ${levelName} Alerts
                        <button
                            class="btn btn-sm btn-outline-secondary ms-2"
                            data-toggle-level="${safeLevel}"
                            data-enable="true"
                        >
                            Enable All
                        </button>
                        <button
                            class="btn btn-sm btn-outline-secondary"
                            data-toggle-level="${safeLevel}"
                            data-enable="false"
                        >
                            Disable All
                        </button>
                    </h4>
                </div>
            </div>
        `;

        htmlContent += '<div class="row">';

        types.forEach((type) => {
            const isEnabled = currentFilters[type] === true;
            const description = ALERT_DESCRIPTIONS[type] || 'Official NOAA weather alert type.';
            const safeType = escapeHtml(type);
            const safeTypeId = escapeHtml(type.replace(/\s+/g, '_'));

            htmlContent += html`
                <div class="col-sm-6 col-lg-4 mb-3">
                    <div class="card alert-type-card ${raw(!isEnabled ? 'disabled' : '')}">
                        <div class="card-body">
                            <div class="form-check form-switch">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    id="alert_${safeTypeId}"
                                    data-alert-type="${safeType}"
                                    ${raw(isEnabled ? 'checked' : '')}
                                />
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

/**
 * Bulk-enable or bulk-disable all alert types within an impact level.
 *
 * @param {string}  level  - Impact level key (e.g. 'CRITICAL', 'HIGH')
 * @param {boolean} enable - True to enable all types; false to disable
 * @returns {void}
 */
function toggleLevel(level, enable) {
    const types = alertTypesByLevel[level];
    if (!types) return;

    types.forEach((type) => {
        currentFilters[type] = enable;
    });

    markDirty();
    renderAlertTypes();
    updateStatus();
}

/**
 * Refresh the enabled-count display and detect whether the current
 * filter configuration exactly matches a known preset.
 * The preset label ("Standard", "Full", etc.) is shown in the status bar
 * so users know which preset is active without opening the dropdown.
 *
 * @returns {void}
 */
function updateStatus() {
    const totalTypes = Object.values(alertTypesByLevel).flat().length;
    const enabledTypes = Object.values(currentFilters).filter((v) => v === true).length;

    document.getElementById('enabledCount').textContent = enabledTypes;
    document.getElementById('totalCount').textContent = totalTypes;

    // Determine which preset matches current config (if any)
    let matchingPresetName = 'Custom';
    let matchingPresetKey = null;
    for (const [key, preset] of Object.entries(filterPresets)) {
        if (isPresetMatch(preset)) {
            matchingPresetName = preset.name;
            matchingPresetKey = key;
            break;
        }
    }

    document.getElementById('activeFilterStatus').textContent = matchingPresetName;

    // Highlight the matching preset button
    document.querySelectorAll('[data-preset]').forEach((btn) => {
        const key = btn.dataset.preset;
        const isActive = key === matchingPresetKey;
        btn.classList.remove('btn-outline-primary', 'btn-outline-success', 'btn-success');
        if (isActive) {
            btn.classList.add('btn-success');
        } else if (key === 'CUSTOM') {
            btn.classList.add('btn-outline-success');
        } else {
            btn.classList.add('btn-outline-primary');
        }
    });
}

/**
 * Test whether the current currentFilters state exactly matches a preset.
 * Iterates every known alert type and compares its expected state (derived
 * from the preset's includeCategories and excludeTypes) against the actual
 * state in currentFilters. A single mismatch returns false.
 *
 * @param {Object} preset - Preset config object with includeCategories and
 *                          optional excludeTypes arrays
 * @returns {boolean} True if currentFilters matches the preset exactly
 */
function isPresetMatch(preset) {
    const enabledTypes = Object.entries(currentFilters)
        .filter(([type, enabled]) => enabled === true)
        .map(([type]) => type);

    for (const [level, types] of Object.entries(alertTypesByLevel)) {
        for (const type of types) {
            const shouldBeEnabled =
                preset.includeCategories.includes(level) &&
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
document.addEventListener('click', function (e) {
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

document.addEventListener('change', function (e) {
    // Alert type toggles
    if (e.target.dataset.alertType) {
        toggleAlertType(e.target.dataset.alertType);
    }
});

// Static button event listeners
document.getElementById('resetDefaultsBtn').addEventListener('click', resetToDefaults);
document.getElementById('savePrefsBtn').addEventListener('click', savePreferences);

// Warn before navigating away with unsaved changes
window.addEventListener('beforeunload', function (e) {
    if (dirty) {
        e.preventDefault();
    }
});

// Initialize
loadData();
initHelpIconKeyboard();
