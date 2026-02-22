# Storm Scout Roadmap

This document outlines planned improvements, features, and technical debt for Storm Scout.

## Current Version: 1.7.0

**Production URL**: https://teammurphy.rocks  
**Last Updated**: February 21, 2026

---

## High Priority

### Performance & Scalability

- [x] **Add In-Memory Caching** ✅ (Completed 2026-02-14)
  - Implemented with node-cache (in-memory, no Redis needed)
  - Cache `/api/status/overview` response (15-minute TTL)
  - Cache `/api/sites` (1-hour TTL for static data)
  - Cache `/api/advisories/active` (15-minute TTL)
  - Auto-invalidation after NOAA ingestion
  - ~100x faster response times on cache hits
  - **Effort**: Medium | **Impact**: High

- [x] **Implement API Rate Limiting** ✅ (Completed 2026-02-14)
  - Protects against abuse and DDoS
  - 500 requests/15 min for general API
  - 20 requests/15 min for write operations
  - Health checks exempt from limiting
  - Returns 429 with retry info when exceeded
  - **Effort**: Low | **Impact**: High

- [ ] **Add Pagination to Advisories**
  - Handle large result sets efficiently
  - Add `?page=1&limit=50` query params
  - Improve frontend performance with large datasets
  - **Effort**: Medium | **Impact**: Medium

### Testing & Quality

- [ ] **Add Unit Tests**
  - Test models (Advisory, Site, Notice)
  - Test utility functions (normalizer, VTEC extraction)
  - Use Jest testing framework
  - Target 80%+ coverage for critical paths
  - **Effort**: High | **Impact**: High

- [ ] **Add Integration Tests**
  - Test all API endpoints
  - Validate response formats
  - Test error handling
  - **Effort**: Medium | **Impact**: Medium

- [ ] **Setup ESLint + Prettier**
  - Enforce code style consistency
  - Catch common errors
  - Auto-format on commit
  - **Effort**: Low | **Impact**: Medium

### Security

- [x] **Add Input Validation** ✅ (Completed 2026-02-14)
  - Implemented with express-validator
  - Validates all query params, route params, and request bodies
  - Sanitizes strings (trim, uppercase for states)
  - Type coercion for integers with range limits
  - Consistent 400 error responses with field-level details
  - **Effort**: Medium | **Impact**: High

- [x] **Implement Helmet.js** ✅ (Completed 2026-02-15)
  - Security headers configured in `app.js` (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
  - `script-src-attr 'none'` blocks inline event handlers (primary XSS vector)
  - `object-src 'none'`, `base-uri 'self'` for additional hardening
  - CSP uses `'unsafe-inline'` for scripts/styles (GA + Bootstrap requirement)
  - **Effort**: Low | **Impact**: Medium

- [x] **Database Backup Automation** ✅ (Completed 2026-02-15)
  - Automated daily backups via cPanel at 2:00 AM EST (7-day retention)
  - Restore procedures documented in AGENTS.md (full DB, partial table, per-scenario)
  - Manual weekly backup workflow documented (SSH + phpMyAdmin)
  - Pre-deployment backup requirement established
  - **Effort**: Low | **Impact**: High

---

## Medium Priority

### Features

- [ ] **Complete Local Emergency Data Ingestion**
  - Implement state/local emergency management feeds
  - Add FEMA disaster declarations
  - Support county/city evacuation orders
  - See `backend/src/ingestion/local-ingestor.js`
  - **Effort**: High | **Impact**: Medium

- [ ] **Email Notifications**
  - Alert stakeholders on critical events
  - Configurable notification rules
  - Support for multiple recipients
  - Use SendGrid or similar service
  - **Effort**: Medium | **Impact**: Medium

- [ ] **Historical Data Archive**
  - Archive expired advisories for analysis
  - Separate archive database or table
  - Trend analysis and reporting
  - **Effort**: Medium | **Impact**: Low

- [ ] **WebSocket Support**
  - Real-time updates without page refresh
  - Push new advisories to connected clients
  - Reduce polling load on server
  - **Effort**: High | **Impact**: Medium

- [ ] **Grid.js Data Table Integration** ([#52](https://github.com/Prometric-Site-Engineering/storm-scout/issues/52))
  - Replace static `<table>` in advisories.html with Grid.js interactive tables
  - Per-column sorting, global search, pagination via API
  - ~12KB, framework-agnostic — fits no-heavy-framework architecture
  - Preserves existing severity colors and filter presets
  - **Selected over**: Simple-DataTables, List.js, DataTables (jQuery), Tabulator
  - **Effort**: Medium | **Impact**: Medium

### Developer Experience

- [ ] **CI/CD Pipeline**
  - GitHub Actions for automated testing
  - Automatic deployment on merge to main
  - Run tests on pull requests
  - **Effort**: Medium | **Impact**: Medium

- [ ] **Structured Logging**
  - Replace console.log with Winston or Pino
  - Log levels (debug, info, warn, error)
  - Structured JSON logs for parsing
  - **Effort**: Medium | **Impact**: Medium

- [ ] **API Documentation with Swagger**
  - Interactive API documentation
  - Auto-generate from code annotations
  - Test endpoints directly in browser
  - **Effort**: Medium | **Impact**: Low

### Architecture Improvements

- [ ] **Service Layer Pattern**
  - Separate business logic from routes
  - Improve testability
  - Better code organization
  - **Effort**: High | **Impact**: Medium

- [ ] **Centralized Error Handling**
  - Error handling middleware
  - Consistent error responses
  - Better error logging
  - **Effort**: Low | **Impact**: Medium

- [ ] **API Versioning**
  - Prepare for breaking changes
  - Support `/api/v1/` and `/api/v2/` simultaneously
  - Deprecation warnings
  - **Effort**: Medium | **Impact**: Low

---

## Low Priority

### Frontend Enhancements

- [ ] **Service Worker for Offline Support**
  - Cache assets for offline viewing
  - Show cached data when server unreachable
  - PWA capabilities
  - **Effort**: Medium | **Impact**: Low

- [ ] **Advanced Filtering UI**
  - Filter by date range
  - Filter by multiple states
  - Save custom filter combinations
  - **Effort**: Medium | **Impact**: Low

- [ ] **Data Visualization**
  - Charts showing alerts over time
  - Geographic heat map of impacted areas
  - Severity distribution graphs
  - **Effort**: High | **Impact**: Low

- [ ] **Dark Mode**
  - User preference for dark theme
  - Automatic based on system preference
  - **Effort**: Low | **Impact**: Low

### Mobile

- [ ] **Responsive Design Improvements**
  - Better mobile table layouts
  - Touch-friendly UI elements
  - Mobile-optimized navigation
  - **Effort**: Medium | **Impact**: Low

- [ ] **Native Mobile App**
  - React Native or Flutter app
  - Push notifications
  - Offline capabilities
  - **Effort**: Very High | **Impact**: Low

### Advanced Features

- [ ] **Alert Correlation**
  - Link related advisories across sites
  - Identify large-scale weather events
  - Multi-site impact analysis
  - **Effort**: High | **Impact**: Low

- [ ] **Predictive Analytics**
  - Forecast site closures based on weather patterns
  - Machine learning for impact prediction
  - Historical trend analysis
  - **Effort**: Very High | **Impact**: Low

- [ ] **Multi-Tenant Support**
  - Support multiple organizations
  - Custom branding per tenant
  - Separate data isolation
  - **Effort**: Very High | **Impact**: Low

---

## Technical Debt

### Code Quality

- [ ] **Refactor Large Route Files**
  - Break down routes into smaller handlers
  - Extract business logic to services
  - **Effort**: Medium

- [ ] **Standardize Error Responses**
  - Consistent error format across all endpoints
  - Include error codes for programmatic handling
  - **Effort**: Low

- [ ] **Remove Unused Code**
  - Clean up old DEPLOYMENT-*.md files
  - Remove commented-out code
  - **Effort**: Low

### Database

- [x] **Review and Optimize Indexes** ✅ (Completed 2026-02-14)
  - Added composite index `idx_advisories_status_severity`
  - API response time improved 21% (676ms → 535ms)
  - **Effort**: Low

- [ ] **Add Database Migrations Framework**
  - Use a tool like Knex.js or Sequelize migrations
  - Track schema changes over time
  - Easier rollback capabilities
  - **Effort**: Medium

### Documentation

- [ ] **Add JSDoc Comments**
  - Document all functions with JSDoc
  - Auto-generate API reference
  - **Effort**: Medium

- [ ] **Create Architecture Diagrams**
  - System architecture overview
  - Data flow diagrams
  - Database schema diagram
  - **Effort**: Low

---

## Recently Completed

### v1.7.0 (February 21, 2026)
- ✅ Prometric visual alignment across entire frontend
- ✅ Brand CSS variables: `--pm-navy`, `--pm-green`, `--pm-text`
- ✅ Navbar, footer, buttons, accents, tooltips, mobile, export reports updated
- ✅ Severity indicator colors (red/orange/yellow/green) intentionally preserved

### v1.6.4 (February 21, 2026)
- ✅ Temperature + station status on site cards, dashboard, map, and table view
- ✅ NOAA alert headlines on all card types and table view
- ✅ Celsius added to all temperature displays (°F/°C)
- ✅ Dashboard layout reorder (Weather Impact Assessment moved to top)
- ✅ Table view default sort by site code ascending
- ✅ Summary panel split: separate Critical (red) / Severe (orange) counts

### v1.6.0–1.6.3 (February 15–20, 2026)
- ✅ Beta UI archived; dead script references cleaned up
- ✅ IMT severity alignment (internal categories instead of NOAA raw severity)
- ✅ 4-tier severity grouping aligned across dashboard
- ✅ Helmet.js security headers (CSP, HSTS, X-Frame-Options)
- ✅ CSP compliance: all inline event handlers replaced with addEventListener
- ✅ CWA field added to all sites; NWS Forecast links updated
- ✅ 10 new testing centers added (220→230), 1 duplicate removed (→229)
- ✅ Site data verification against physical addresses
- ✅ Database backup automation via cPanel (daily, 7-day retention)

### v1.5.0 (February 14, 2026)
- ✅ In-memory caching with node-cache
- ✅ Cached endpoints: status/overview, sites, advisories/active
- ✅ Auto-invalidation after NOAA ingestion
- ✅ ~100x faster response times on cache hits
- ✅ Input validation with express-validator
- ✅ API rate limiting (500 req/15 min)
- ✅ Removed all flashing animations for accessibility

### v1.4.1 (February 14, 2026)
- ✅ Severity validation in normalizer.js (defaults Unknown to Minor)
- ✅ Database CHECK constraint on severity column
- ✅ Composite index for status+severity queries (21% perf improvement)
- ✅ Beta UI notices.html page
- ✅ Self-hosted Inter font (removed Google Fonts CDN dependency)
- ✅ All QA review bugs closed (BUG-PROD-001 through BUG-PROD-009)

### v1.1.0 (February 13, 2026)
- ✅ Added update banner to all pages
- ✅ Created comprehensive documentation (deployment, API, VTEC)
- ✅ Documented SSH deployment best practices
- ✅ Documented API usage patterns

### v1.0.0 (February 12, 2026)
- ✅ VTEC event ID deduplication system
- ✅ VTEC action code extraction and display
- ✅ Action badges on advisories page
- ✅ Eliminated ~40 duplicate alerts system-wide

### Pre-v1.0
- ✅ Alert filtering system (68 NOAA alert types, 5 impact levels)
- ✅ Custom filter presets (Site Default, Operations, Executive, Safety, Full)
- ✅ 219 US testing center locations
- ✅ Real-time NOAA weather data ingestion (15-minute intervals)
- ✅ Automated advisory cleanup
- ✅ Operational status calculation (Open/Closed/At Risk)

---

## Ideas / Brainstorming

**Under Consideration** - not yet prioritized:

- Multi-language support for international sites
- Integration with calendar systems (Google Calendar, Outlook)
- SMS alerts via Twilio
- Slack/Teams integration for notifications
- Weather radar overlay on map view
- Airport weather integration (METAR/TAF)
- Traffic impact correlation
- Integration with facility management systems
- Custom reporting and analytics dashboard
- Export data to Excel/CSV

---

## Contributing

If you'd like to contribute to any of these items:

1. Check if there's an existing GitHub issue
2. If not, create an issue referencing this roadmap item
3. Discuss approach before starting major work
4. Submit a pull request when ready

## Roadmap Notes

- **Effort Estimates**: Low (< 1 day), Medium (1-3 days), High (3-7 days), Very High (> 1 week)
- **Impact**: How much value this adds to users/system
- Priorities may shift based on user feedback and operational needs
- Items are not necessarily in order within each priority level

---

**Questions or suggestions?** Open a GitHub issue or contact the IMT Operations team.

**Last Reviewed**: February 21, 2026
