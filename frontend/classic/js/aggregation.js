/**
 * Storm Scout Aggregation Logic - Phase 1
 * Groups advisories by site, deduplicates multi-zone alerts, calculates urgency
 */

const SiteAggregator = {
    /**
     * Get severity rank for sorting (higher = more severe)
     */
    getSeverityRank(severity) {
        const ranks = { 'Extreme': 4, 'Severe': 3, 'Moderate': 2, 'Minor': 1, 'Unknown': 0 };
        return ranks[severity] || 0;
    },

    /**
     * Calculate urgency score for prioritization
     */
    calculateUrgency(advisory) {
        let score = 0;
        
        // Severity weight (most important factor)
        const severityPoints = { 'Extreme': 1000, 'Severe': 500, 'Moderate': 100, 'Minor': 20 };
        score += severityPoints[advisory.severity] || 0;
        
        // Action weight - NEW and UPG alerts are more urgent
        if (advisory.vtec_action === 'NEW') score += 50;
        if (advisory.vtec_action === 'UPG') score += 75;
        
        // Recency - newer alerts are more urgent
        if (advisory.last_updated) {
            const hoursOld = (Date.now() - new Date(advisory.last_updated)) / 3600000;
            score += Math.max(0, 24 - hoursOld) * 2;
        }
        
        // Time to expiration - sooner expiration = higher score
        if (advisory.expires) {
            const hoursToExpire = (new Date(advisory.expires) - Date.now()) / 3600000;
            if (hoursToExpire > 0 && hoursToExpire < 6) score += 30;
        }
        
        return score;
    },

    /**
     * Deduplicate multi-zone alerts
     * Groups alerts with same (site_id, advisory_type, severity, issued time window)
     */
    deduplicateMultiZone(advisories) {
        const dedupMap = new Map();
        
        advisories.forEach(adv => {
            // Create deduplication key
            const issuedTime = adv.issued_time || adv.last_updated || '';
            const timeWindow = issuedTime ? new Date(issuedTime).toISOString().slice(0, 13) : 'unknown';
            const key = `${adv.site_id}-${adv.advisory_type}-${adv.severity}-${timeWindow}`;
            
            if (!dedupMap.has(key)) {
                // First occurrence - create representative alert
                dedupMap.set(key, {
                    ...adv,
                    is_representative: true,
                    zone_count: 1,
                    zones: [adv.source || 'Unknown'],
                    related_ids: [adv.id],
                    highest_urgency: this.calculateUrgency(adv)
                });
            } else {
                // Duplicate zone - add to existing
                const existing = dedupMap.get(key);
                existing.zone_count++;
                if (adv.source && !existing.zones.includes(adv.source)) {
                    existing.zones.push(adv.source);
                }
                existing.related_ids.push(adv.id);
                
                // Keep the most urgent version
                const urgency = this.calculateUrgency(adv);
                if (urgency > existing.highest_urgency) {
                    existing.highest_urgency = urgency;
                    // Update with more urgent data
                    existing.expires = adv.expires;
                    existing.vtec_action = adv.vtec_action;
                }
            }
        });
        
        return Array.from(dedupMap.values());
    },

    /**
     * Group advisories by site and calculate summaries
     */
    aggregateBySite(advisories, options = {}) {
        const { deduplicateZones = true } = options;
        
        // First, deduplicate multi-zone alerts if enabled
        const processedAdvisories = deduplicateZones 
            ? this.deduplicateMultiZone(advisories) 
            : advisories;
        
        // Group by site
        const siteMap = new Map();
        
        processedAdvisories.forEach(adv => {
            const siteId = adv.site_id;
            
            if (!siteMap.has(siteId)) {
                siteMap.set(siteId, {
                    site_id: siteId,
                    site_code: adv.site_code,
                    site_name: adv.site_name,
                    city: adv.city,
                    state: adv.state,
                    advisories: [],
                    highest_severity: null,
                    highest_severity_rank: 0,
                    unique_types: new Set(),
                    total_zone_count: 0,
                    unique_advisory_count: 0,
                    new_count: 0,
                    continued_count: 0,
                    urgency_score: 0
                });
            }
            
            const site = siteMap.get(siteId);
            site.advisories.push(adv);
            site.unique_types.add(adv.advisory_type);
            site.total_zone_count += (adv.zone_count || 1);
            site.unique_advisory_count++;
            
            // Count NEW vs CONTINUED
            if (adv.vtec_action === 'NEW') {
                site.new_count++;
            } else if (adv.vtec_action === 'CON') {
                site.continued_count++;
            }
            
            // Track highest severity
            const severityRank = this.getSeverityRank(adv.severity);
            if (severityRank > site.highest_severity_rank) {
                site.highest_severity = adv.severity;
                site.highest_severity_rank = severityRank;
            }
            
            // Add to urgency score
            site.urgency_score += this.calculateUrgency(adv);
        });
        
        // Convert to array and enhance
        const sites = Array.from(siteMap.values()).map(site => {
            // Group advisories by type
            const typeGroups = {};
            site.advisories.forEach(adv => {
                const type = adv.advisory_type;
                if (!typeGroups[type]) {
                    typeGroups[type] = {
                        type,
                        severity: adv.severity,
                        count: 0,
                        zone_count: 0,
                        expires: adv.expires,
                        vtec_action: adv.vtec_action,
                        representative: adv
                    };
                }
                typeGroups[type].count++;
                typeGroups[type].zone_count += (adv.zone_count || 1);
            });
            
            return {
                ...site,
                unique_types: Array.from(site.unique_types),
                type_groups: Object.values(typeGroups).sort((a, b) => 
                    this.getSeverityRank(b.severity) - this.getSeverityRank(a.severity)
                ),
                // Find the highest severity advisory for display
                highest_severity_advisory: site.advisories.find(adv => 
                    adv.severity === site.highest_severity
                )
            };
        });
        
        // Sort by urgency score (highest first)
        return sites.sort((a, b) => b.urgency_score - a.urgency_score);
    },

    /**
     * Group sites by severity level for dashboard
     */
    groupBySeverity(sites) {
        return {
            critical: sites.filter(s => s.highest_severity === 'Extreme' || s.highest_severity === 'Severe'),
            elevated: sites.filter(s => s.highest_severity === 'Moderate'),
            monitoring: sites.filter(s => s.highest_severity === 'Minor')
        };
    },

    /**
     * Get summary statistics
     */
    getSummaryStats(advisories, sites) {
        return {
            total_advisories: advisories.length,
            unique_sites: sites.length,
            critical_sites: sites.filter(s => s.highest_severity === 'Extreme' || s.highest_severity === 'Severe').length,
            elevated_sites: sites.filter(s => s.highest_severity === 'Moderate').length,
            monitoring_sites: sites.filter(s => s.highest_severity === 'Minor').length,
            new_alerts: advisories.filter(a => a.vtec_action === 'NEW').length,
            avg_alerts_per_site: sites.length > 0 ? (advisories.length / sites.length).toFixed(1) : 0
        };
    },

    /**
     * Check if filters are hiding critical alerts
     */
    getFilterWarning(allAdvisories, filteredAdvisories) {
        const hiddenCount = allAdvisories.length - filteredAdvisories.length;
        
        if (hiddenCount === 0) {
            return null;
        }
        
        // Check for hidden critical alerts
        const hiddenAdvisories = allAdvisories.filter(a => !filteredAdvisories.includes(a));
        const criticalHidden = hiddenAdvisories.filter(a => 
            a.severity === 'Extreme' || a.severity === 'Severe'
        ).length;
        
        return {
            hidden_count: hiddenCount,
            critical_hidden: criticalHidden,
            has_critical: criticalHidden > 0
        };
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SiteAggregator;
}
