/**
 * Update Banner Component
 * Displays last updated time and countdown to next update
 * Can be included on any page
 */

const UpdateBanner = {
    nextUpdateTime: null,
    countdownInterval: null,
    
    /**
     * Format timestamp in user's local timezone
     */
    formatLocalTime(isoString) {
        if (!isoString) return 'Never';
        const date = new Date(isoString);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    },
    
    isPollingIngestion: false,
    pollingInterval: null,
    
    /**
     * Calculate and display countdown to next update.
     * When countdown reaches 0, poll /health to detect active ingestion.
     */
    updateCountdown() {
        if (!this.nextUpdateTime) return;
        
        const now = new Date();
        const diff = this.nextUpdateTime - now;
        
        const nextUpdateEl = document.getElementById('nextUpdate');
        if (!nextUpdateEl) return;
        
        if (diff <= 0) {
            nextUpdateEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Refreshing data\u2026';
            // Start polling /health to detect when ingestion finishes
            if (!this.isPollingIngestion) {
                this.startIngestionPolling();
            }
            return;
        }
        
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        nextUpdateEl.textContent = `${minutes}m ${seconds}s`;
    },
    
    /**
     * Poll /health every 10 s while ingestion is expected to be running.
     * When ingestion.active flips to false, refresh the page data.
     */
    startIngestionPolling() {
        this.isPollingIngestion = true;
        this.pollingInterval = setInterval(async () => {
            try {
                const resp = await fetch(`${typeof API !== 'undefined' && API.baseUrl ? API.baseUrl.replace('/api', '') : ''}/health`);
                const health = await resp.json();
                if (health.ingestion && !health.ingestion.active) {
                    // Ingestion finished — stop polling and re-init
                    clearInterval(this.pollingInterval);
                    this.isPollingIngestion = false;
                    this.init();
                }
            } catch (_) { /* network hiccup — keep polling */ }
        }, 10000);
    },
    
    /**
     * Initialize the banner with data from API
     */
    async init() {
        try {
            const overview = await API.getOverview();
            
            // Update last updated time
            const lastUpdatedEl = document.getElementById('lastUpdated');
            if (lastUpdatedEl) {
                lastUpdatedEl.textContent = this.formatLocalTime(overview.last_updated);
            }
            
            // Set up countdown
            if (overview.last_updated && overview.update_interval_minutes) {
                const lastUpdate = new Date(overview.last_updated);
                this.nextUpdateTime = new Date(lastUpdate.getTime() + overview.update_interval_minutes * 60000);
                
                // Clear existing countdown interval
                if (this.countdownInterval) {
                    clearInterval(this.countdownInterval);
                }
                
                // Update countdown immediately and then every second
                this.updateCountdown();
                this.countdownInterval = setInterval(() => this.updateCountdown(), 1000);
            }
        } catch (error) {
            console.error('Failed to load update banner data:', error);
            const lastUpdatedEl = document.getElementById('lastUpdated');
            const nextUpdateEl = document.getElementById('nextUpdate');
            if (lastUpdatedEl) lastUpdatedEl.textContent = 'Error loading';
            if (nextUpdateEl) nextUpdateEl.textContent = 'Unknown';
        }
    },
    
    /**
     * Clear all active intervals and reset polling state.
     * Called on page unload and when the tab is hidden to prevent zombie timers
     * and unnecessary API polling in background tabs. (closes #117)
     */
    destroy() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isPollingIngestion = false;
    },

    /**
     * Render the banner HTML
     * Returns HTML string to be inserted into page
     */
    getHTML() {
        return `
            <div class="alert alert-info mb-3" role="alert">
                <div class="row align-items-center">
                    <div class="col-md-6">
                        <i class="bi bi-clock-history"></i>
                        <strong>Last Updated:</strong> <span id="lastUpdated">Loading...</span>
                    </div>
                    <div class="col-md-6 text-md-end">
                        <i class="bi bi-arrow-repeat"></i>
                        <strong>Next Update:</strong> <span id="nextUpdate">Loading...</span>
                    </div>
                </div>
            </div>
        `;
    }
};

// Auto-initialize if elements are found on page load
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('lastUpdated') || document.getElementById('nextUpdate')) {
        UpdateBanner.init();
    }

    // Clear intervals on page unload to prevent timer leaks across navigations
    window.addEventListener('beforeunload', () => UpdateBanner.destroy());

    // Pause countdown when tab is hidden; resume when it becomes visible again
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            UpdateBanner.destroy();
        } else {
            // Tab is visible again — re-sync with server
            if (document.getElementById('lastUpdated') || document.getElementById('nextUpdate')) {
                UpdateBanner.init();
            }
        }
    });
});
