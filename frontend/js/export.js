/**
 * Export and Reporting System - Phase 3
 * Handles CSV, PDF, and Excel exports
 */

const StormScoutExport = {
    /**
     * Export offices data to CSV
     * @param {Array} offices - Array of office objects
     * @param {string} filename - Output filename (without extension)
     */
    exportOfficesToCSV(offices, filename = 'storm-scout-offices') {
        const headers = [
            'Office Code', 'Name', 'City', 'State',
            'Highest Severity', 'Advisory Count', 'New Alerts',
            'Operational Status', 'Weather Impact'
        ];

        const rows = offices.map(office => [
            office.office_code || '',
            office.name || '',
            office.city || '',
            office.state || '',
            office.highest_severity || '',
            office.advisory_count || 0,
            office.new_count || 0,
            office.operational_status || '',
            office.weather_impact_level || ''
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
            'Office Code', 'Office Name', 'City', 'State',
            'Advisory Type', 'Severity', 'Action',
            'Start Time', 'End Time', 'Source'
        ];

        const rows = advisories.map(adv => [
            adv.office_code || '',
            adv.office_name || '',
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
                reportHTML = this.generateOfficeSummary(data, timestamp);
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
        const { offices, advisories } = data;

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
        <strong>Generated:</strong> ${escapeHtml(timestamp)}<br>
        <strong>Report Type:</strong> Incident Report<br>
        <strong>Offices Affected:</strong> ${offices.length}
    </div>

    <h2>Impacted Offices Summary</h2>
    <table>
        <thead>
            <tr>
                <th>Office Code</th>
                <th>Name</th>
                <th>Location</th>
                <th>Highest Severity</th>
                <th>Alert Count</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            ${offices.map(office => `
                <tr class="severity-${escapeHtml((office.highest_severity || '').toLowerCase())}">
                    <td><strong>${escapeHtml(office.office_code)}</strong></td>
                    <td>${escapeHtml(office.name)}</td>
                    <td>${escapeHtml(office.city)}, ${escapeHtml(office.state)}</td>
                    <td>${escapeHtml(office.highest_severity || 'N/A')}</td>
                    <td>${office.advisory_count || 0}</td>
                    <td>${escapeHtml(office.operational_status || 'Unknown')}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <h2>Active Advisories Detail</h2>
    <table>
        <thead>
            <tr>
                <th>Office</th>
                <th>Advisory Type</th>
                <th>Severity</th>
                <th>Start Time</th>
                <th>End Time</th>
            </tr>
        </thead>
        <tbody>
            ${advisories.slice(0, 50).map(adv => `
                <tr>
                    <td><strong>${escapeHtml(adv.office_code)}</strong> - ${escapeHtml(adv.office_name)}</td>
                    <td>${escapeHtml(adv.advisory_type)}</td>
                    <td>${escapeHtml(adv.severity)}</td>
                    <td>${escapeHtml(this.formatDateTime(adv.start_time))}</td>
                    <td>${escapeHtml(this.formatDateTime(adv.end_time))}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <p style="margin-top: 40px; color: #666; font-size: 12px;">
        Weather data sourced from NOAA/NWS (public domain). Report generated by Storm Scout.<br>
        Generated: ${escapeHtml(timestamp)}
    </p>
</body>
</html>
        `;
    },

    /**
     * Generate Office Impact Summary
     */
    generateOfficeSummary(data, timestamp) {
        const { offices } = data;

        // Group by severity
        const bySeverity = {
            Extreme: offices.filter(s => s.highest_severity === 'Extreme'),
            Severe: offices.filter(s => s.highest_severity === 'Severe'),
            Moderate: offices.filter(s => s.highest_severity === 'Moderate'),
            Minor: offices.filter(s => s.highest_severity === 'Minor')
        };

        return `
<!DOCTYPE html>
<html>
<head>
    <title>Storm Scout - Office Impact Summary</title>
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
    <h1>📊 Storm Scout - Office Impact Summary</h1>
    <p><strong>Generated:</strong> ${escapeHtml(timestamp)}</p>

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

    ${Object.entries(bySeverity).map(([severity, officesInCat]) =>
        officesInCat.length > 0 ? `
        <h2>${escapeHtml(severity)} Impact Offices (${officesInCat.length})</h2>
        <ul>
            ${officesInCat.map(office => `
                <li><strong>${escapeHtml(office.office_code)}</strong> - ${escapeHtml(office.name)} (${escapeHtml(office.city)}, ${escapeHtml(office.state)}) - ${office.advisory_count} alerts</li>
            `).join('')}
        </ul>
        ` : ''
    ).join('')}

    <p style="margin-top: 40px; color: #666; font-size: 12px;">
        Weather data sourced from NOAA/NWS (public domain). Report generated by Storm Scout.<br>
        Generated: ${escapeHtml(timestamp)}
    </p>
</body>
</html>
        `;
    },

    /**
     * Generate Executive Briefing
     */
    generateExecutiveBriefing(data, timestamp) {
        const { offices, overview } = data;

        const criticalOffices = offices.filter(s =>
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
        .critical-offices { background: #fdd; padding: 15px; margin: 20px 0; border-left: 4px solid #dc3545; }
        @media print {
            body { margin: 20px; }
        }
    </style>
</head>
<body>
    <h1>📋 Storm Scout - Executive Briefing</h1>
    <p><strong>Date/Time:</strong> ${escapeHtml(timestamp)}</p>

    <div class="executive-summary">
        <h2>Executive Summary</h2>
        <p><strong>Total Offices Monitored:</strong> ${overview?.total_offices || 300}</p>
        <p><strong>Offices with Active Weather Advisories:</strong> ${offices.length}</p>
        <p><strong>Critical Attention Required:</strong> ${criticalOffices.length} offices</p>
    </div>

    <h2>Key Points</h2>
    <ul class="key-points">
        <li><strong>${offices.filter(s => s.highest_severity === 'Extreme').length}</strong> offices under EXTREME weather conditions requiring immediate action</li>
        <li><strong>${offices.filter(s => s.highest_severity === 'Severe').length}</strong> offices experiencing SEVERE weather impacts</li>
        <li><strong>${offices.filter(s => s.operational_status === 'Closed').length}</strong> offices currently closed due to weather</li>
        <li><strong>${offices.filter(s => s.new_count > 0).reduce((sum, s) => sum + s.new_count, 0)}</strong> new weather alerts issued in the last 2 hours</li>
    </ul>

    ${criticalOffices.length > 0 ? `
    <div class="critical-offices">
        <h2>⚠️ Critical Offices Requiring Immediate Attention</h2>
        <ul>
            ${criticalOffices.map(office => `
                <li><strong>${escapeHtml(office.office_code)}</strong> - ${escapeHtml(office.name)}, ${escapeHtml(office.state)}
                    <br>Status: <strong>${escapeHtml(office.highest_severity)}</strong> |
                    ${office.advisory_count} active alerts |
                    Ops Status: ${escapeHtml(office.operational_status || 'Pending')}
                </li>
            `).join('')}
        </ul>
    </div>
    ` : '<p><em>No critical offices at this time.</em></p>'}

    <h2>Recommendations</h2>
    <ul>
        ${criticalOffices.length > 0 ?
            '<li>Review operational status for offices under extreme/severe weather conditions</li>' : ''}
        <li>Monitor offices with multiple active advisories for potential escalation</li>
        <li>Coordinate with local office management for real-time updates</li>
    </ul>

    <p style="margin-top: 40px; color: #666; font-size: 12px;">
        Weather data sourced from NOAA/NWS (public domain). Report generated by Storm Scout.<br>
        Generated: ${escapeHtml(timestamp)}
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
     * @param {string} dataType - Type of data ('offices' or 'advisories')
     */
    addExportButtons(containerId, getDataFunc, dataType = 'offices') {
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
                <li><a class="dropdown-item export-summary" href="#"><i class="bi bi-file-earmark-bar-graph"></i> Office Summary</a></li>
                <li><a class="dropdown-item export-executive" href="#"><i class="bi bi-file-earmark-person"></i> Executive Briefing</a></li>
            </ul>
        `;
        
        container.appendChild(buttonGroup);
        
        // Add event listeners
        buttonGroup.querySelector('.export-csv').addEventListener('click', (e) => {
            e.preventDefault();
            const data = getDataFunc();
            if (dataType === 'offices') {
                this.exportOfficesToCSV(data);
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
