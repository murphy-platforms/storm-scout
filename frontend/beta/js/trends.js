/**
 * Trends Component for Phase 3
 * Displays historical trends and analysis
 * 
 * SECURITY: Uses escapeHtml() and html tagged template from utils.js for XSS prevention
 * Requires: utils.js to be loaded before this file
 */

const Trends = {
    /**
     * Render trend indicator badge
     * @param {Object} trend - Trend data from API
     * @returns {string} HTML for trend badge
     */
    renderTrendBadge(trend) {
        if (!trend || trend.trend === 'insufficient_data') {
            return '<span class="badge bg-secondary" title="Not enough data"><i class="bi bi-question-circle"></i> No Data</span>';
        }
        
        const icons = {
            'worsening': '⬆️',
            'improving': '⬇️',
            'stable': '➡️'
        };
        
        const classes = {
            'worsening': 'bg-danger',
            'improving': 'bg-success',
            'stable': 'bg-info'
        };
        
        const labels = {
            'worsening': 'Worsening',
            'improving': 'Improving',
            'stable': 'Stable'
        };
        
        const icon = icons[trend.trend] || '';
        const badgeClass = classes[trend.trend] || 'bg-secondary';
        const label = labels[trend.trend] || escapeHtml(trend.trend);
        
        const title = `${escapeHtml(trend.first_severity)} → ${escapeHtml(trend.last_severity)} (${parseInt(trend.duration_hours) || 0}h)`;
        
        return `<span class="badge ${escapeHtml(badgeClass)}" title="${title}">${icon} ${escapeHtml(label)}</span>`;
    },
    
    /**
     * Render detailed trend card
     * @param {Object} trend - Trend data with site info
     * @returns {string} HTML for trend card
     */
    renderTrendCard(trend) {
        if (!trend || trend.trend === 'insufficient_data') {
            return '';
        }
        
        const trendIcon = this.renderTrendBadge(trend);
        const change = parseInt(trend.advisory_change) || 0;
        const changeText = change > 0 ? 
            `+${change} alerts` : 
            change < 0 ? 
            `${change} alerts` : 
            'No change in alert count';
        
        return html`
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title mb-0">
                                <strong>${trend.site.site_code}</strong> - ${trend.site.name}
                            </h5>
                            ${raw(trendIcon)}
                        </div>
                        <p class="card-text">
                            ${raw('<i class="bi bi-geo-alt"></i>')} ${trend.site.city}, ${trend.site.state}<br>
                            ${raw('<i class="bi bi-arrow-right-circle"></i>')} ${trend.first_severity} → ${trend.last_severity}<br>
                            ${raw('<i class="bi bi-clock"></i>')} ${parseInt(trend.duration_hours) || 0} hours<br>
                            ${raw('<i class="bi bi-bar-chart"></i>')} ${changeText}
                        </p>
                    </div>
                </div>
            </div>
        `;
    },
    
    /**
     * Create a simple chart for trend visualization
     * @param {string} containerId - ID of container element
     * @param {Array} history - Array of historical snapshots
     */
    renderTrendChart(containerId, history) {
        const container = document.getElementById(containerId);
        if (!container || !history || history.length === 0) return;
        
        // Create simple ASCII-style chart (can be replaced with Chart.js later)
        const severityRank = { 'Extreme': 4, 'Severe': 3, 'Moderate': 2, 'Minor': 1 };
        const maxRank = 4;
        
        let chartHTML = '<div class="trend-chart">';
        chartHTML += '<div class="chart-y-axis">';
        chartHTML += '<div>Extreme</div><div>Severe</div><div>Moderate</div><div>Minor</div>';
        chartHTML += '</div>';
        chartHTML += '<div class="chart-bars">';
        
        history.forEach((snapshot, index) => {
            const rank = severityRank[snapshot.highest_severity] || 0;
            const height = (rank / maxRank) * 100;
            const severityClass = escapeHtml((snapshot.highest_severity || '').toLowerCase());
            const date = new Date(snapshot.snapshot_time).toLocaleDateString();
            const alertCount = parseInt(snapshot.advisory_count) || 0;
            
            chartHTML += html`
                <div class="chart-bar-container">
                    <div class="chart-bar severity-${raw(severityClass)}" 
                         style="height: ${raw(height)}%" 
                         title="${snapshot.highest_severity} - ${alertCount} alerts (${date})">
                    </div>
                    <div class="chart-label">${date}</div>
                </div>
            `;
        });
        
        chartHTML += '</div></div>';
        
        container.innerHTML = chartHTML;
    },
    
    /**
     * Render trend summary section for site detail page
     * @param {string} containerId - ID of container element
     * @param {number} siteId - Site ID
     * @param {number} days - Days of history to show
     */
    async renderSiteTrendSection(containerId, siteId, days = 7) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        try {
            container.innerHTML = '<div class="text-center"><span class="spinner-border spinner-border-sm"></span> Loading trends...</div>';
            
            const trendData = await API.getSiteTrend(siteId, days);
            
            if (!trendData || trendData.trend === 'insufficient_data') {
                container.innerHTML = `
                    <div class="alert alert-info">
                        <i class="bi bi-info-circle"></i> Not enough historical data yet. 
                        Trends will appear after multiple data collection cycles.
                    </div>
                `;
                return;
            }
            
            const badge = this.renderTrendBadge(trendData);
            
            const change = parseInt(trendData.advisory_change) || 0;
            container.innerHTML = html`
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title">
                            ${raw('<i class="bi bi-graph-up-arrow"></i>')} ${parseInt(days) || 7}-Day Trend ${raw(badge)}
                        </h5>
                        <div class="row">
                            <div class="col-md-6">
                                <p class="mb-2">
                                    <strong>Severity Change:</strong><br>
                                    ${trendData.first_severity} → ${trendData.last_severity}
                                </p>
                                <p class="mb-2">
                                    <strong>Alert Count Change:</strong><br>
                                    ${parseInt(trendData.first_count) || 0} → ${parseInt(trendData.last_count) || 0} 
                                    (${change > 0 ? '+' : ''}${change})
                                </p>
                                <p class="mb-0">
                                    <strong>Duration:</strong> ${parseInt(trendData.duration_hours) || 0} hours
                                </p>
                            </div>
                            <div class="col-md-6">
                                ${raw('<div id="trendChartContainer"></div>')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Render chart
            if (trendData.history) {
                this.renderTrendChart('trendChartContainer', trendData.history);
            }
            
        } catch (error) {
            console.error('Error loading trends:', error);
            container.innerHTML = `
                <div class="alert alert-warning">
                    <i class="bi bi-exclamation-triangle"></i> Failed to load trend data
                </div>
            `;
        }
    }
};

// Add CSS for trend charts
const trendChartStyles = `
<style>
.trend-chart {
    display: flex;
    align-items: flex-end;
    height: 200px;
    border-left: 2px solid #ddd;
    border-bottom: 2px solid #ddd;
    padding: 10px;
    position: relative;
}

.chart-y-axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    padding-right: 10px;
    font-size: 0.75rem;
    color: #666;
}

.chart-bars {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    flex-grow: 1;
    height: 100%;
}

.chart-bar-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
}

.chart-bar {
    width: 100%;
    min-height: 4px;
    border-radius: 3px 3px 0 0;
    transition: opacity 0.2s;
    cursor: pointer;
}

.chart-bar:hover {
    opacity: 0.8;
}

.chart-bar.severity-extreme {
    background-color: #dc3545;
}

.chart-bar.severity-severe {
    background-color: #fd7e14;
}

.chart-bar.severity-moderate {
    background-color: #ffc107;
}

.chart-bar.severity-minor {
    background-color: #6c757d;
}

.chart-label {
    font-size: 0.65rem;
    color: #666;
    margin-top: 4px;
    text-align: center;
    transform: rotate(-45deg);
    white-space: nowrap;
}
</style>
`;

// Inject styles if not already present
if (!document.getElementById('trend-chart-styles')) {
    const styleEl = document.createElement('div');
    styleEl.id = 'trend-chart-styles';
    styleEl.innerHTML = trendChartStyles;
    document.head.appendChild(styleEl);
}
