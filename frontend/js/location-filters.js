/**
 * Location Filter Utilities
 * Shared logic for applying user's location preferences across pages.
 * Mirrors the AlertFilters pattern: localStorage persistence, lazy init,
 * and filter methods consumed by every page in the data pipeline.
 *
 * Data pipeline order: LocationFilters → AlertFilters → page rendering
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

const LocationFilters = {
    STORAGE_KEY: 'stormScout_locationFilters',

    /** @type {Object<string, boolean>} office_id → true (enabled) or false (disabled) */
    userFilters: null,

    /** @type {Array<Object>} All offices from the API */
    allOffices: [],

    /**
     * Initialize: Load all offices from API and restore user preferences.
     * Must be called after API_BASE_URL is available (loaded via api.js).
     * @returns {Promise<boolean>} true on success
     */
    async init() {
        try {
            const response = await fetch(`${API_BASE_URL}/offices`);
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed to load offices');
            this.allOffices = data.data;

            this.loadUserPreferences();
            return true;
        } catch (error) {
            console.error('Failed to load location filters:', error);
            return false;
        }
    },

    /**
     * Load user preferences from localStorage or default to all enabled.
     * Wrapped in try/catch: localStorage may be unavailable (private browsing,
     * quota exceeded, iframe restrictions) or the stored value may be corrupt JSON.
     * On any failure, defaults are applied and the user is notified.
     */
    loadUserPreferences() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    this.userFilters = parsed;
                    this._reconcileNewOffices();
                } else {
                    this.enableAll();
                }
            } else {
                this.enableAll();
            }
        } catch (e) {
            console.warn('[LocationFilters] localStorage unavailable or corrupt:', e.message);
            this.enableAll();
            if (typeof showToast === 'function') {
                showToast('Location preferences could not be loaded — defaults applied.', 'warning');
            }
        }
    },

    /**
     * Enable all offices. Used as the default state.
     */
    enableAll() {
        this.userFilters = {};
        this.allOffices.forEach((office) => {
            this.userFilters[String(office.id)] = true;
        });
    },

    /**
     * Disable all offices.
     */
    disableAll() {
        this.userFilters = {};
        this.allOffices.forEach((office) => {
            this.userFilters[String(office.id)] = false;
        });
    },

    /**
     * Enable all offices in a given state.
     * @param {string} stateCode - 2-letter state code (e.g. 'MD')
     */
    enableByState(stateCode) {
        this.allOffices.forEach((office) => {
            if (office.state === stateCode) {
                this.userFilters[String(office.id)] = true;
            }
        });
    },

    /**
     * Disable all offices in a given state.
     * @param {string} stateCode - 2-letter state code (e.g. 'MD')
     */
    disableByState(stateCode) {
        this.allOffices.forEach((office) => {
            if (office.state === stateCode) {
                this.userFilters[String(office.id)] = false;
            }
        });
    },

    /**
     * Toggle a single office.
     * @param {number|string} officeId
     * @param {boolean} [enabled] - If omitted, toggles current state
     */
    toggleOffice(officeId, enabled) {
        const key = String(officeId);
        // Only toggle if the office exists in the dataset
        if (!this.allOffices.some((o) => String(o.id) === key)) return;
        if (enabled === undefined) {
            this.userFilters[key] = this.userFilters[key] !== true;
        } else {
            this.userFilters[key] = enabled;
        }
    },

    /**
     * Check if an office should be included based on user's location filters.
     * @param {number|string} officeId
     * @returns {boolean}
     */
    shouldIncludeOffice(officeId) {
        if (!this.userFilters) {
            this.loadUserPreferences();
        }
        return this.userFilters[String(officeId)] === true;
    },

    /**
     * Filter an array of office objects based on user preferences.
     * @param {Array<Object>} offices - Array of office objects with an `id` property
     * @returns {Array<Object>}
     */
    filterOffices(offices) {
        if (!this.allOffices.length) return offices;
        return offices.filter((office) => this.shouldIncludeOffice(office.id));
    },

    /**
     * Filter an array of advisories based on user's location preferences.
     * Drops advisories whose office_id is not in the enabled set.
     * This is the key integration point: apply before AlertFilters.filterAdvisories()
     * so advisory counts, overview stats, and map markers all respect location filters.
     * @param {Array<Object>} advisories - Array with office_id property
     * @returns {Array<Object>}
     */
    filterAdvisoriesByLocation(advisories) {
        if (!this.allOffices.length) return advisories;
        if (!this.userFilters) {
            this.loadUserPreferences();
        }
        return advisories.filter((adv) => this.userFilters[String(adv.office_id)] === true);
    },

    /**
     * Get count of enabled offices.
     * @returns {number}
     */
    getEnabledCount() {
        if (!this.userFilters) {
            this.loadUserPreferences();
        }
        return Object.values(this.userFilters).filter((v) => v === true).length;
    },

    /**
     * Get total number of offices.
     * @returns {number}
     */
    getTotalCount() {
        return this.allOffices.length;
    },

    /**
     * Check if location filters are customized (not all locations enabled).
     * @returns {boolean}
     */
    hasActiveFilters() {
        return this.getEnabledCount() !== this.getTotalCount();
    },

    /**
     * Check if all locations are enabled.
     * @returns {boolean}
     */
    isFullView() {
        return !this.hasActiveFilters();
    },

    /**
     * Get human-readable filter status.
     * @returns {string}
     */
    getFilterStatus() {
        const enabled = this.getEnabledCount();
        const total = this.getTotalCount();
        if (enabled === total) return 'All Locations';
        if (enabled === 0) return 'No Locations';
        return `${enabled} of ${total}`;
    },

    /**
     * Get list of unique states from all offices, sorted alphabetically.
     * @returns {Array<string>}
     */
    getStates() {
        const states = [...new Set(this.allOffices.map((o) => o.state))];
        return states.sort();
    },

    /**
     * Get offices grouped by state.
     * @returns {Object<string, Array<Object>>}
     */
    getOfficesByState() {
        const grouped = {};
        this.allOffices.forEach((office) => {
            if (!grouped[office.state]) {
                grouped[office.state] = [];
            }
            grouped[office.state].push(office);
        });
        // Sort offices within each state by name
        for (const state of Object.keys(grouped)) {
            grouped[state].sort((a, b) => a.name.localeCompare(b.name));
        }
        return grouped;
    },

    /**
     * Get count of enabled offices within a specific state.
     * @param {string} stateCode - 2-letter state code
     * @returns {{ enabled: number, total: number }}
     */
    getStateCount(stateCode) {
        const stateOffices = this.allOffices.filter((o) => o.state === stateCode);
        const enabled = stateOffices.filter((o) => this.userFilters[String(o.id)] === true).length;
        return { enabled, total: stateOffices.length };
    },

    /**
     * Reconcile saved preferences with current office list.
     * If new offices were added to the dataset since the user last saved,
     * they are enabled by default. Offices that were removed are cleaned up.
     * @private
     */
    _reconcileNewOffices() {
        const officeIds = new Set(this.allOffices.map((o) => String(o.id)));

        // Enable new offices not in saved preferences
        this.allOffices.forEach((office) => {
            const key = String(office.id);
            if (this.userFilters[key] === undefined) {
                this.userFilters[key] = true;
            }
        });

        // Remove stale office IDs no longer in dataset
        for (const key of Object.keys(this.userFilters)) {
            if (!officeIds.has(key)) {
                delete this.userFilters[key];
            }
        }
    }
};

// Export for Node.js / Jest testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LocationFilters;
}
