/**
 * Alert Filter Utilities
 * Shared logic for applying user's filter preferences across pages
 */

const AlertFilters = {
    STORAGE_KEY: 'stormScout_alertFilters',
    DEFAULT_PRESET: 'CUSTOM',
    
    filterConfigs: {},
    alertTypesByLevel: {},
    userFilters: null,
    
    /**
     * Initialize: Load filter configs and user preferences
     */
    async init() {
        try {
            // Load filter configurations from API
            const response = await fetch(`${API_BASE_URL}/filters`);
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed to load filter configs');
            this.filterConfigs = data.data;

            // Load all alert types by level
            const typesResponse = await fetch(`${API_BASE_URL}/filters/types/all`);
            const typesData = await typesResponse.json();
            if (!typesData.success) throw new Error(typesData.error || 'Failed to load alert types');
            this.alertTypesByLevel = typesData.data;

            // Load user's saved preferences
            this.loadUserPreferences();

            return true;
        } catch (error) {
            console.error('Failed to load filter configs:', error);
            return false;
        }
    },
    
    /**
     * Load user preferences from localStorage or use defaults.
     * Wrapped in try/catch: localStorage may be unavailable (private browsing,
     * quota exceeded, iframe restrictions) or the stored value may be corrupt JSON.
     * On any failure, defaults are applied and the user is notified. (closes #118)
     */
    loadUserPreferences() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                this.userFilters = JSON.parse(saved);
            } else {
                this.applyPreset(this.DEFAULT_PRESET);
            }
        } catch (e) {
            console.warn('[Filters] localStorage unavailable or corrupt:', e.message);
            this.applyPreset(this.DEFAULT_PRESET);
            if (typeof showToast === 'function') {
                showToast('Filter preferences could not be loaded — defaults applied.', 'warning');
            }
        }
    },
    
    /**
     * Apply a preset filter
     */
    applyPreset(presetName) {
        const preset = this.filterConfigs[presetName];
        if (!preset) return;
        
        this.userFilters = {};
        
        // Enable all alert types in included categories
        for (const [level, types] of Object.entries(this.alertTypesByLevel)) {
            if (preset.includeCategories.includes(level)) {
                types.forEach(type => {
                    // Check if explicitly excluded
                    if (!preset.excludeTypes || !preset.excludeTypes.includes(type)) {
                        this.userFilters[type] = true;
                    }
                });
            }
        }
    },
    
    /**
     * Check if an alert type should be included based on user's filters
     */
    shouldIncludeAlertType(alertType) {
        if (!this.userFilters) {
            this.loadUserPreferences();
        }
        
        // Only include if explicitly set to true
        return this.userFilters[alertType] === true;
    },
    
    /**
     * Filter an array of advisories based on user preferences
     */
    filterAdvisories(advisories) {
        return advisories.filter(adv => 
            this.shouldIncludeAlertType(adv.advisory_type)
        );
    },
    
    /**
     * Get count of enabled alert types
     */
    getEnabledCount() {
        if (!this.userFilters) {
            this.loadUserPreferences();
        }
        return Object.values(this.userFilters).filter(v => v === true).length;
    },
    
    /**
     * Check if a preset matches current user filters
     */
    matchesPreset(presetName) {
        const preset = this.filterConfigs[presetName];
        if (!preset) return false;
        
        const expectedFilters = {};
        for (const [level, types] of Object.entries(this.alertTypesByLevel)) {
            if (preset.includeCategories.includes(level)) {
                types.forEach(type => {
                    if (!preset.excludeTypes || !preset.excludeTypes.includes(type)) {
                        expectedFilters[type] = true;
                    }
                });
            }
        }
        
        // Compare with user filters
        const userEnabled = Object.keys(this.userFilters).filter(k => this.userFilters[k] === true).sort();
        const expectedEnabled = Object.keys(expectedFilters).filter(k => expectedFilters[k] === true).sort();
        
        return JSON.stringify(userEnabled) === JSON.stringify(expectedEnabled);
    },
    
    /**
     * Get total number of alert types available
     */
    getTotalAlertTypes() {
        let total = 0;
        for (const types of Object.values(this.alertTypesByLevel)) {
            total += types.length;
        }
        return total;
    },
    
    /**
     * Check if using full view (all alert types enabled)
     */
    isFullView() {
        return this.getEnabledCount() === this.getTotalAlertTypes();
    },
    
    /**
     * Check if filters are customized (not all types enabled)
     */
    hasActiveFilters() {
        return !this.isFullView();
    },
    
    /**
     * Get human-readable filter status
     */
    getFilterStatus() {
        for (const [name, preset] of Object.entries(this.filterConfigs)) {
            if (this.matchesPreset(name)) {
                return preset.name;
            }
        }
        return 'Custom';
    }
};
