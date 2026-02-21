/**
 * Export and Reporting System - Phase 3
 * Handles CSV, PDF, and Excel exports
 */

const StormScoutExport = {
    /**
     * Export sites data to CSV
     * @param {Array} sites - Array of site objects
     * @param {string} filename - Output filename (without extension)
     */
    exportSitesToCSV(sites, filename = 'storm-scout-sites') {
        const headers = [
            'Site Code', 'Name', 'City', 'State',
            'Highest Severity', 'Advisory Count', 'New Alerts',
            'Operational Status', 'Weather Impact'
        ];
        
        const rows = sites.map(site => [
            site.site_code || '',
            site.name || '',
            site.city || '',
            site.state || '',
            site.highest_severity || '',
            site.advisory_count || 0,
            site.new_count || 0,
            site.operational_status || '',
            site.weather_impact_level || ''
        ]);
        
        this.downloadCSV(headers, rows, filename);
    },
    
    /**
     * Export advisories to CSV
     * @param {Array} advisories - Array of advisory objects
     * @param {string} filename - Output filename
     */
    exportAdvisoriesToCSV(advisories, filename = 'storm-scout-advisories') {
        const headers = [
            'Site Code', 'Site Name', 'City', 'State',
            'Advisory Type', 'Severity', 'Action',
            'Start Time', 'End Time', 'Source'
        ];
        
        const rows = advisories.map(adv => [
            adv.site_code || '',
            adv.site_name || '',
            adv.city || '',
            adv.state || '',
            adv.advisory_type || '',
            adv.severity || '',
            adv.vtec_action || adv.action || '',
            this.formatDateTime(adv.start_time),
            this.formatDateTime(adv.end_time),
            adv.source || ''
        ]);
        
        this.downloadCSV(headers, rows, filename);
    },
    
    /**
     * Download CSV file
     * @param {Array} headers - Column headers
     * @param {Array} rows - Data rows
     * @param {string} filename - Output filename
     */
    downloadCSV(headers, rows, filename) {
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => this.escapeCSV(cell)).join(','))
        ].join('\n');
        
        this.downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;');
    },
    
    /**
     * Escape CSV cell content
     * @param {*} cell - Cell value
     * @returns {string} Escaped value
     */
    escapeCSV(cell) {
        if (cell === null || cell === undefined) return '';
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    },
    
    /**
     * Export to HTML report (can be printed to PDF)
     * @param {Object} data - Report data
     * @param {string} reportType - Type of report
     */
    generateHTMLReport(data, reportType = 'incident') {
        const timestamp = new Date().toLocaleString();
        let reportHTML = '';
        
        switch (reportType) {
            case 'incident':
                reportHTML = this.generateIncidentReport(data, timestamp);
                break;
            case 'summary':
                reportHTML = this.generateSiteSummary(data, timestamp);
                break;
            case 'executive':
                reportHTML = this.generateExecutiveBriefing(data, timestamp);
                break;
            default:
                reportHTML = this.generateIncidentReport(data, timestamp);
        }
        
        // Open in new window for printing
        const printWindow = window.open('', '_blank');
        printWindow.document.write(reportHTML);
        printWindow.document.close();
        
        // Trigger print dialog after load
        setTimeout(() => {
            printWindow.print();
        }, 500);
    },
    
    /**
     * Generate Incident Report
     */
    generateIncidentReport(data, timestamp) {
        const { sites, advisories } = data;
        
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Storm Scout - Incident Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #333; border-bottom: 3px solid #dc3545; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .severity-extreme { background-color: #fdd; }
        .severity-severe { background-color: #fed; }
        .severity-moderate { background-color: #ffc; }
        .header-info { margin: 20px 0; color: #666; }
        @media print {
            body { margin: 20px; }
            button { display: none; }
        }
    </style>
</head>
<body>
    <h1>🌩️ Storm Scout - Incident Report</h1>
    <div class="header-info">
        <strong>Generated:</strong> ${timestamp}<br>
        <strong>Report Type:</strong> Incident Report<br>
        <strong>Sites Affected:</strong> ${sites.length}
    </div>
    
    <h2>Impacted Sites Summary</h2>
    <table>
        <thead>
            <tr>
                <th>Site Code</th>
                <th>Name</th>
                <th>Location</th>
                <th>Highest Severity</th>
                <th>Alert Count</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            ${sites.map(site => `
                <tr class="severity-${(site.highest_severity || '').toLowerCase()}">
                    <td><strong>${site.site_code}</strong></td>
                    <td>${site.name}</td>
                    <td>${site.city}, ${site.state}</td>
                    <td>${site.highest_severity || 'N/A'}</td>
                    <td>${site.advisory_count || 0}</td>
                    <td>${site.operational_status || 'Unknown'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    
    <h2>Active Advisories Detail</h2>
    <table>
        <thead>
            <tr>
                <th>Site</th>
                <th>Advisory Type</th>
                <th>Severity</th>
                <th>Start Time</th>
                <th>End Time</th>
            </tr>
        </thead>
        <tbody>
            ${advisories.slice(0, 50).map(adv => `
                <tr>
                    <td><strong>${adv.site_code}</strong> - ${adv.site_name}</td>
                    <td>${adv.advisory_type}</td>
                    <td>${adv.severity}</td>
                    <td>${this.formatDateTime(adv.start_time)}</td>
                    <td>${this.formatDateTime(adv.end_time)}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    
    <p style="margin-top: 40px; color: #666; font-size: 12px;">
        Report generated by Storm Scout | IMT Operations Tool<br>
        For internal use only
    </p>
</body>
</html>
        `;
    },
    
    /**
     * Generate Site Impact Summary
     */
    generateSiteSummary(data, timestamp) {
        const { sites } = data;
        
        // Group by severity
        const bySeverity = {
            Extreme: sites.filter(s => s.highest_severity === 'Extreme'),
            Severe: sites.filter(s => s.highest_severity === 'Severe'),
            Moderate: sites.filter(s => s.highest_severity === 'Moderate'),
            Minor: sites.filter(s => s.highest_severity === 'Minor')
        };
        
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Storm Scout - Site Impact Summary</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #333; border-bottom: 3px solid #1B2845; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
        .summary-card { border: 2px solid #ddd; padding: 20px; text-align: center; border-radius: 8px; }
        .count { font-size: 48px; font-weight: bold; }
        .extreme { border-color: #dc3545; color: #dc3545; }
        .severe { border-color: #fd7e14; color: #fd7e14; }
        .moderate { border-color: #ffc107; color: #856404; }
        .minor { border-color: #6c757d; color: #6c757d; }
        ul { line-height: 1.8; }
        @media print {
            body { margin: 20px; }
            .summary-grid { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <h1>📊 Storm Scout - Site Impact Summary</h1>
    <p><strong>Generated:</strong> ${timestamp}</p>
    
    <div class="summary-grid">
        <div class="summary-card extreme">
            <div class="count">${bySeverity.Extreme.length}</div>
            <div>EXTREME</div>
        </div>
        <div class="summary-card severe">
            <div class="count">${bySeverity.Severe.length}</div>
            <div>SEVERE</div>
        </div>
        <div class="summary-card moderate">
            <div class="count">${bySeverity.Moderate.length}</div>
            <div>MODERATE</div>
        </div>
        <div class="summary-card minor">
            <div class="count">${bySeverity.Minor.length}</div>
            <div>MINOR</div>
        </div>
    </div>
    
    ${Object.entries(bySeverity).map(([severity, sitesInCat]) => 
        sitesInCat.length > 0 ? `
        <h2>${severity} Impact Sites (${sitesInCat.length})</h2>
        <ul>
            ${sitesInCat.map(site => `
                <li><strong>${site.site_code}</strong> - ${site.name} (${site.city}, ${site.state}) - ${site.advisory_count} alerts</li>
            `).join('')}
        </ul>
        ` : ''
    ).join('')}
</body>
</html>
        `;
    },
    
    /**
     * Generate Executive Briefing
     */
    generateExecutiveBriefing(data, timestamp) {
        const { sites, overview } = data;
        
        const criticalSites = sites.filter(s => 
            s.highest_severity === 'Extreme' || s.highest_severity === 'Severe'
        );
        
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Storm Scout - Executive Briefing</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #333; border-bottom: 3px solid #1B2845; padding-bottom: 10px; }
        .executive-summary { background: #f8f9fa; padding: 20px; margin: 20px 0; border-left: 4px solid #1B2845; }
        .key-points { margin: 20px 0; }
        .key-points li { margin: 10px 0; }
        .critical-sites { background: #fdd; padding: 15px; margin: 20px 0; border-left: 4px solid #dc3545; }
        @media print {
            body { margin: 20px; }
        }
    </style>
</head>
<body>
    <h1>📋 Storm Scout - Executive Briefing</h1>
    <p><strong>Date/Time:</strong> ${timestamp}</p>
    
    <div class="executive-summary">
        <h2>Executive Summary</h2>
        <p><strong>Total Sites Monitored:</strong> ${overview?.total_sites || 219}</p>
        <p><strong>Sites with Active Weather Advisories:</strong> ${sites.length}</p>
        <p><strong>Critical Attention Required:</strong> ${criticalSites.length} sites</p>
    </div>
    
    <h2>Key Points</h2>
    <ul class="key-points">
        <li><strong>${sites.filter(s => s.highest_severity === 'Extreme').length}</strong> sites under EXTREME weather conditions requiring immediate action</li>
        <li><strong>${sites.filter(s => s.highest_severity === 'Severe').length}</strong> sites experiencing SEVERE weather impacts</li>
        <li><strong>${sites.filter(s => s.operational_status === 'Closed').length}</strong> sites currently closed due to weather</li>
        <li><strong>${sites.filter(s => s.new_count > 0).reduce((sum, s) => sum + s.new_count, 0)}</strong> new weather alerts issued in the last 2 hours</li>
    </ul>
    
    ${criticalSites.length > 0 ? `
    <div class="critical-sites">
        <h2>⚠️ Critical Sites Requiring Immediate Attention</h2>
        <ul>
            ${criticalSites.map(site => `
                <li><strong>${site.site_code}</strong> - ${site.name}, ${site.state} 
                    <br>Status: <strong>${site.highest_severity}</strong> | 
                    ${site.advisory_count} active alerts | 
                    Ops Status: ${site.operational_status || 'Pending'}
                </li>
            `).join('')}
        </ul>
    </div>
    ` : '<p><em>No critical sites at this time.</em></p>'}
    
    <h2>Recommendations</h2>
    <ul>
        ${criticalSites.length > 0 ? 
            '<li>Review operational status for sites under extreme/severe weather conditions</li>' : ''}
        <li>Monitor sites with multiple active advisories for potential escalation</li>
        <li>Coordinate with local site management for real-time updates</li>
        <li>Prepare communication for affected test-takers if needed</li>
    </ul>
    
    <p style="margin-top: 40px; color: #666; font-size: 12px;">
        This briefing is generated automatically from Storm Scout real-time data.<br>
        For detailed information, access the Storm Scout dashboard at https://your-domain.example.com
    </p>
</body>
</html>
        `;
    },
    
    /**
     * Download a file
     * @param {string} content - File content
     * @param {string} filename - Filename
     * @param {string} mimeType - MIME type
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    },
    
    /**
     * Format date/time for export
     * @param {string} dateStr - ISO date string
     * @returns {string} Formatted date
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleString();
    },
    
    /**
     * Add export buttons to a page
     * @param {string} containerId - ID of container element
     * @param {Function} getDataFunc - Function that returns data to export
     * @param {string} dataType - Type of data ('sites' or 'advisories')
     */
    addExportButtons(containerId, getDataFunc, dataType = 'sites') {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'btn-group';
        buttonGroup.innerHTML = `
            <button type="button" class="btn btn-sm btn-outline-primary dropdown-toggle" data-bs-toggle="dropdown">
                <i class="bi bi-download"></i> Export
            </button>
            <ul class="dropdown-menu">
                <li><a class="dropdown-item export-csv" href="#"><i class="bi bi-filetype-csv"></i> Export CSV</a></li>
                <li><a class="dropdown-item export-incident" href="#"><i class="bi bi-file-earmark-text"></i> Incident Report</a></li>
                <li><a class="dropdown-item export-summary" href="#"><i class="bi bi-file-earmark-bar-graph"></i> Site Summary</a></li>
                <li><a class="dropdown-item export-executive" href="#"><i class="bi bi-file-earmark-person"></i> Executive Briefing</a></li>
            </ul>
        `;
        
        container.appendChild(buttonGroup);
        
        // Add event listeners
        buttonGroup.querySelector('.export-csv').addEventListener('click', (e) => {
            e.preventDefault();
            const data = getDataFunc();
            if (dataType === 'sites') {
                this.exportSitesToCSV(data);
            } else if (dataType === 'advisories') {
                this.exportAdvisoriesToCSV(data);
            }
        });
        
        buttonGroup.querySelector('.export-incident').addEventListener('click', (e) => {
            e.preventDefault();
            const data = getDataFunc();
            this.generateHTMLReport(data, 'incident');
        });
        
        buttonGroup.querySelector('.export-summary').addEventListener('click', (e) => {
            e.preventDefault();
            const data = getDataFunc();
            this.generateHTMLReport(data, 'summary');
        });
        
        buttonGroup.querySelector('.export-executive').addEventListener('click', (e) => {
            e.preventDefault();
            const data = getDataFunc();
            this.generateHTMLReport(data, 'executive');
        });
    },
    
    /**
     * Generate shareable link with current filter state
     * @returns {string} Full URL with filter parameters
     */
    generateShareableLink() {
        const baseUrl = window.location.origin + window.location.pathname;
        const params = new URLSearchParams();
        
        // Get current filter state from localStorage
        const filterPreset = localStorage.getItem('selectedFilterPreset') || 'CUSTOM';
        const customFilters = localStorage.getItem('customFilters');
        
        if (filterPreset !== 'CUSTOM') {
            params.set('preset', filterPreset);
        } else if (customFilters) {
            try {
                const filters = JSON.parse(customFilters);
                params.set('filters', btoa(JSON.stringify(filters))); // Base64 encode
            } catch (e) {
                console.error('Error encoding filters:', e);
            }
        }
        
        // Add current page context
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('weather_impact')) {
            params.set('weather_impact', urlParams.get('weather_impact'));
        }
        if (urlParams.has('status')) {
            params.set('status', urlParams.get('status'));
        }
        
        return baseUrl + (params.toString() ? '?' + params.toString() : '');
    },
    
    /**
     * Copy shareable link to clipboard
     */
    async copyShareableLink() {
        const link = this.generateShareableLink();
        
        try {
            await navigator.clipboard.writeText(link);
            this.showNotification('✓ Link copied to clipboard', 'success');
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = link;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            
            try {
                document.execCommand('copy');
                this.showNotification('✓ Link copied to clipboard', 'success');
                return true;
            } catch (err2) {
                this.showNotification('✗ Failed to copy link', 'error');
                return false;
            } finally {
                document.body.removeChild(textArea);
            }
        }
    },
    
    /**
     * Open browser print dialog for PDF export
     */
    printToPDF() {
        // Add print-specific class to body
        document.body.classList.add('print-mode');
        
        // Trigger print dialog
        window.print();
        
        // Remove print mode class after print dialog closes
        setTimeout(() => {
            document.body.classList.remove('print-mode');
        }, 1000);
        
        this.showNotification('Print dialog opened', 'success');
    },
    
    /**
     * Show notification toast
     * @param {string} message
     * @param {string} type - 'success' or 'error'
     */
    showNotification(message, type = 'success') {
        // Remove existing notification if present
        const existing = document.getElementById('export-notification');
        if (existing) {
            existing.remove();
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.id = 'export-notification';
        notification.className = `export-notification export-notification-${type}`;
        notification.textContent = message;
        notification.setAttribute('role', 'alert');
        notification.setAttribute('aria-live', 'polite');

        document.body.appendChild(notification);

        // Show notification
        setTimeout(() => notification.classList.add('show'), 10);

        // Hide and remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },
    
    /**
     * Apply URL parameters to filter state (for shareable links)
     */
    applyURLFilters() {
        const params = new URLSearchParams(window.location.search);
        
        // Apply preset filter
        if (params.has('preset')) {
            const preset = params.get('preset');
            localStorage.setItem('selectedFilterPreset', preset);
            console.log('Applied filter preset from URL:', preset);
        }
        
        // Apply custom filters
        if (params.has('filters')) {
            try {
                const filtersJSON = atob(params.get('filters'));
                const filters = JSON.parse(filtersJSON);
                localStorage.setItem('customFilters', JSON.stringify(filters));
                localStorage.setItem('selectedFilterPreset', 'CUSTOM');
                console.log('Applied custom filters from URL');
            } catch (e) {
                console.error('Error decoding URL filters:', e);
            }
        }
    }
};

// Auto-apply URL filters on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => StormScoutExport.applyURLFilters());
} else {
    StormScoutExport.applyURLFilters();
}
