/**
 * Trends Component for Phase 3
 * Displays historical trends and analysis
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
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
            worsening: '⬆️',
            improving: '⬇️',
            stable: '➡️'
        };

        const classes = {
            worsening: 'bg-danger',
            improving: 'bg-success',
            stable: 'bg-info'
        };

        const labels = {
            worsening: 'Worsening',
            improving: 'Improving',
            stable: 'Stable'
        };

        const icon = icons[trend.trend] || '';
        const badgeClass = classes[trend.trend] || 'bg-secondary';
        const label = labels[trend.trend] || trend.trend;

        const title = `${trend.first_severity} → ${trend.last_severity} (${trend.duration_hours}h)`;

        return `<span class="badge ${badgeClass}" title="${title}">${icon} ${label}</span>`;
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
        const changeText =
            trend.advisory_change > 0
                ? `+${trend.advisory_change} alerts`
                : trend.advisory_change < 0
                  ? `${trend.advisory_change} alerts`
                  : 'No change in alert count';

        return `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title mb-0">
                                <strong>${trend.office.office_code}</strong> - ${trend.office.name}
                            </h5>
                            ${trendIcon}
                        </div>
                        <p class="card-text">
                            <i class="bi bi-geo-alt"></i> ${trend.office.city}, ${trend.office.state}<br>
                            <i class="bi bi-arrow-right-circle"></i> ${trend.first_severity} → ${trend.last_severity}<br>
                            <i class="bi bi-clock"></i> ${trend.duration_hours} hours<br>
                            <i class="bi bi-bar-chart"></i> ${changeText}
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
        const severityRank = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 };
        const maxRank = 4;

        let chartHTML = '<div class="trend-chart">';
        chartHTML += '<div class="chart-y-axis">';
        chartHTML += '<div>Extreme</div><div>Severe</div><div>Moderate</div><div>Minor</div>';
        chartHTML += '</div>';
        chartHTML += '<div class="chart-bars">';

        history.forEach((snapshot, index) => {
            const rank = severityRank[snapshot.highest_severity] || 0;
            const height = (rank / maxRank) * 100;
            const severityClass = snapshot.highest_severity.toLowerCase();
            const date = new Date(snapshot.snapshot_time).toLocaleDateString();

            chartHTML += `
                <div class="chart-bar-container">
                    <div class="chart-bar severity-${severityClass}" 
                         style="height: ${height}%" 
                         title="${snapshot.highest_severity} - ${snapshot.advisory_count} alerts (${date})">
                    </div>
                    <div class="chart-label">${date}</div>
                </div>
            `;
        });

        chartHTML += '</div></div>';

        container.innerHTML = chartHTML;
    },

    /**
     * Render trend summary section for office detail page
     * @param {string} containerId - ID of container element
     * @param {number} officeId - Office ID
     * @param {number} days - Days of history to show
     */
    async renderOfficeTrendSection(containerId, officeId, days = 7) {
        const container = document.getElementById(containerId);
        if (!container) return;

        try {
            container.innerHTML =
                '<div class="text-center"><span class="spinner-border spinner-border-sm"></span> Loading trends...</div>';

            const trendData = await API.getOfficeTrend(officeId, days);

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

            container.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title">
                            <i class="bi bi-graph-up-arrow"></i> ${days}-Day Trend ${badge}
                        </h5>
                        <div class="row">
                            <div class="col-md-6">
                                <p class="mb-2">
                                    <strong>Severity Change:</strong><br>
                                    ${trendData.first_severity} → ${trendData.last_severity}
                                </p>
                                <p class="mb-2">
                                    <strong>Alert Count Change:</strong><br>
                                    ${trendData.first_count} → ${trendData.last_count} 
                                    (${trendData.advisory_change > 0 ? '+' : ''}${trendData.advisory_change})
                                </p>
                                <p class="mb-0">
                                    <strong>Duration:</strong> ${trendData.duration_hours} hours
                                </p>
                            </div>
                            <div class="col-md-6">
                                <div id="trendChartContainer"></div>
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
