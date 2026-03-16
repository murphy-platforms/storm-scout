#!/usr/bin/env node
/**
 * Generates: Storm Scout - Retrospective Agile Breakdown.docx
 * Run: node docs/generate-agile-docx.js
 */

const fs = require('fs');
const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    Header, Footer, AlignmentType, LevelFormat,
    TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
    PageNumber, PageBreak
} = require('docx');

// ─── Colors ───
const NAVY = '1B2845';
const GREEN = '7AB648';
const RED = 'DC3545';
const ORANGE = 'FD7E14';
const YELLOW = 'FFC107';
const BLUE = '0D6EFD';
const LIGHT_GRAY = 'F8F9FA';
const MEDIUM_GRAY = 'E9ECEF';
const DARK_GRAY = '6C757D';
const WHITE = 'FFFFFF';

// ─── Table helpers ───
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

const TABLE_WIDTH = 9360; // US Letter with 1" margins

function headerCell(text, width) {
    return new TableCell({
        borders,
        width: { size: width, type: WidthType.DXA },
        shading: { fill: NAVY, type: ShadingType.CLEAR },
        margins: cellMargins,
        verticalAlign: 'center',
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: WHITE, font: 'Arial', size: 20 })] })]
    });
}

function cell(text, width, opts = {}) {
    const fill = opts.fill || undefined;
    const bold = opts.bold || false;
    const color = opts.color || '333333';
    const shadingObj = fill ? { fill, type: ShadingType.CLEAR } : undefined;
    return new TableCell({
        borders,
        width: { size: width, type: WidthType.DXA },
        shading: shadingObj,
        margins: cellMargins,
        children: [new Paragraph({
            alignment: opts.align || AlignmentType.LEFT,
            children: [new TextRun({ text: String(text), bold, color, font: 'Arial', size: 20 })]
        })]
    });
}

function row(cells) { return new TableRow({ children: cells }); }

// ─── Spacing helpers ───
function spacer(size = 120) { return new Paragraph({ spacing: { after: size }, children: [] }); }

function heading1(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 180 },
        children: [new TextRun({ text, bold: true, font: 'Arial', size: 32, color: NAVY })]
    });
}

function heading2(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 140 },
        children: [new TextRun({ text, bold: true, font: 'Arial', size: 26, color: NAVY })]
    });
}

function heading3(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text, bold: true, font: 'Arial', size: 22, color: '444444' })]
    });
}

function para(text, opts = {}) {
    return new Paragraph({
        spacing: { after: opts.after || 120 },
        alignment: opts.align || AlignmentType.LEFT,
        children: [new TextRun({ text, font: 'Arial', size: opts.size || 20, color: opts.color || '333333', bold: opts.bold || false, italics: opts.italics || false })]
    });
}

function richPara(runs, opts = {}) {
    return new Paragraph({
        spacing: { after: opts.after || 120 },
        alignment: opts.align || AlignmentType.LEFT,
        children: runs.map(r => new TextRun({ font: 'Arial', size: 20, color: '333333', ...r }))
    });
}

function bulletItem(text, ref = 'bullets', level = 0) {
    return new Paragraph({
        numbering: { reference: ref, level },
        spacing: { after: 60 },
        children: [new TextRun({ text, font: 'Arial', size: 20, color: '333333' })]
    });
}

function numberedItem(text, ref = 'numbers', level = 0) {
    return new Paragraph({
        numbering: { reference: ref, level },
        spacing: { after: 60 },
        children: [new TextRun({ text, font: 'Arial', size: 20, color: '333333' })]
    });
}

// ─── User Story helper ───
function userStory(id, title, points, asA, iWant, soThat, criteria) {
    const items = [];
    items.push(heading3(`${id}: ${title} (${points} pts)`));
    items.push(richPara([
        { text: 'As a ', italics: true },
        { text: asA, italics: true, bold: true },
        { text: ', I want ', italics: true },
        { text: iWant, italics: true },
        { text: ', so that ', italics: true },
        { text: soThat, italics: true }
    ]));
    items.push(para('Acceptance Criteria:', { bold: true }));
    criteria.forEach(c => items.push(bulletItem(c, 'ac_bullets')));
    items.push(spacer(80));
    return items;
}

// ─── Sprint table helper ───
function sprintTable(stories) {
    const colWidths = [5500, 1200, 2660];
    const rows = [
        row([headerCell('Story', colWidths[0]), headerCell('Points', colWidths[1]), headerCell('Assignee', colWidths[2])])
    ];
    let total = 0;
    stories.forEach(s => {
        total += s.pts;
        rows.push(row([cell(s.name, colWidths[0]), cell(String(s.pts), colWidths[1], { align: AlignmentType.CENTER }), cell(s.assignee, colWidths[2])]));
    });
    rows.push(row([
        cell('Sprint Total', colWidths[0], { bold: true, fill: LIGHT_GRAY }),
        cell(String(total), colWidths[1], { bold: true, fill: LIGHT_GRAY, align: AlignmentType.CENTER }),
        cell('', colWidths[2], { fill: LIGHT_GRAY })
    ]));
    return new Table({ width: { size: TABLE_WIDTH, type: WidthType.DXA }, columnWidths: colWidths, rows });
}

// ═══════════════════════════════════════════════════════════════
// BUILD DOCUMENT
// ═══════════════════════════════════════════════════════════════
async function main() {
    const children = [];

    // ── Title Page ──
    children.push(spacer(2400));
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: 'Storm Scout', font: 'Arial', size: 56, bold: true, color: NAVY })]
    }));
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: 'Retrospective Agile Breakdown', font: 'Arial', size: 36, color: DARK_GRAY })]
    }));
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: 'Reverse-engineered from a vibe-coded application into traditional agile artifacts:', font: 'Arial', size: 22, color: DARK_GRAY, italics: true })]
    }));
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [new TextRun({ text: 'Epics, User Stories, Story Points, and Sprint Planning', font: 'Arial', size: 22, color: DARK_GRAY, italics: true })]
    }));

    // Project summary box
    const summaryColWidths = [3120, 3120, 3120];
    children.push(new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: summaryColWidths,
        rows: [
            row([
                cell('15 Epics', summaryColWidths[0], { bold: true, fill: LIGHT_GRAY, align: AlignmentType.CENTER }),
                cell('~80 User Stories', summaryColWidths[1], { bold: true, fill: LIGHT_GRAY, align: AlignmentType.CENTER }),
                cell('439 Story Points', summaryColWidths[2], { bold: true, fill: LIGHT_GRAY, align: AlignmentType.CENTER })
            ]),
            row([
                cell('10 Sprints (20 weeks)', summaryColWidths[0], { fill: LIGHT_GRAY, align: AlignmentType.CENTER }),
                cell('5-Person Team', summaryColWidths[1], { fill: LIGHT_GRAY, align: AlignmentType.CENTER }),
                cell('~44 pts/sprint velocity', summaryColWidths[2], { fill: LIGHT_GRAY, align: AlignmentType.CENTER })
            ])
        ]
    }));

    children.push(spacer(1200));
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'March 2026', font: 'Arial', size: 24, color: DARK_GRAY })]
    }));

    // ── Page break + TOC ──
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading1('Table of Contents'));
    children.push(new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }));
    children.push(new Paragraph({ children: [new PageBreak()] }));

    // ══════════════════════════════════════════════════════════
    // SECTION 1: Definition of Done
    // ══════════════════════════════════════════════════════════
    children.push(heading1('Definition of Done (Project-Wide)'));
    children.push(para('A story is considered "Done" when ALL of the following are true:'));
    const dodItems = [
        'Code is implemented and follows project coding standards (ESLint strict, Prettier formatted)',
        'Unit tests written and passing with coverage meeting thresholds (58% branches, 72% functions, 65% lines)',
        'Integration tests written for API endpoints using supertest',
        'No ESLint warnings or Prettier violations',
        'Code reviewed and approved by at least one other team member',
        'Feature works in Chrome, Firefox, Safari, and Edge (latest versions)',
        'Responsive design verified at mobile (375px), tablet (768px), and desktop (1200px+) breakpoints',
        'Accessibility: ARIA labels present, keyboard navigation works, focus management correct',
        'Documentation updated (API docs, architecture docs, or frontend guide as applicable)',
        'Pre-commit hooks pass (Husky + lint-staged)',
        'CI pipeline green (lint + format check + npm audit + tests)',
        'Feature demonstrated to Product Owner'
    ];
    dodItems.forEach(item => children.push(numberedItem(item, 'dod_numbers')));

    // ══════════════════════════════════════════════════════════
    // SECTION 2: Epics Overview
    // ══════════════════════════════════════════════════════════
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading1('Epics Overview'));

    const epicColWidths = [600, 4260, 1800, 1800];
    const epicData = [
        ['E1', 'Project Foundation & Infrastructure', '34', '1-2'],
        ['E2', 'Database Schema & Data Layer', '37', '1-3'],
        ['E3', 'NOAA Data Ingestion Pipeline', '52', '3-5'],
        ['E4', 'Core API Endpoints', '42', '3-5'],
        ['E5', 'Dashboard Overview UI', '34', '5-7'],
        ['E6', 'Advisory & Office List Pages', '31', '6-7'],
        ['E7', 'Interactive Map View', '21', '7-8'],
        ['E8', 'Filter System & Configuration', '26', '7-8'],
        ['E9', 'Export & Reporting', '21', '8-9'],
        ['E10', 'Operational Status & Observations', '18', '8-9'],
        ['E11', 'Trends & Historical Data', '18', '9-10'],
        ['E12', 'Admin, Alerting & Notices', '23', '9-10'],
        ['E13', 'Security, Performance & Resilience', '29', '10-11'],
        ['E14', 'Testing, CI/CD & DevOps', '34', '11-12'],
        ['E15', 'Documentation, Legal & Polish', '16', '12'],
    ];
    const epicRows = [row([headerCell('#', epicColWidths[0]), headerCell('Epic', epicColWidths[1]), headerCell('Story Points', epicColWidths[2]), headerCell('Sprint(s)', epicColWidths[3])])];
    epicData.forEach((e, i) => {
        const fill = i % 2 === 0 ? undefined : LIGHT_GRAY;
        epicRows.push(row([
            cell(e[0], epicColWidths[0], { bold: true, fill }),
            cell(e[1], epicColWidths[1], { fill }),
            cell(e[2], epicColWidths[2], { align: AlignmentType.CENTER, fill }),
            cell(e[3], epicColWidths[3], { align: AlignmentType.CENTER, fill })
        ]));
    });
    epicRows.push(row([
        cell('', epicColWidths[0], { fill: NAVY }),
        cell('TOTAL', epicColWidths[1], { bold: true, color: WHITE, fill: NAVY }),
        cell('439', epicColWidths[2], { bold: true, color: WHITE, fill: NAVY, align: AlignmentType.CENTER }),
        cell('10 sprints', epicColWidths[3], { bold: true, color: WHITE, fill: NAVY, align: AlignmentType.CENTER })
    ]));
    children.push(new Table({ width: { size: TABLE_WIDTH, type: WidthType.DXA }, columnWidths: epicColWidths, rows: epicRows }));

    // ══════════════════════════════════════════════════════════
    // SECTION 3: All Epics with User Stories
    // ══════════════════════════════════════════════════════════
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading1('Epics & User Stories'));

    // ── Epic E1 ──
    children.push(heading2('Epic E1: Project Foundation & Infrastructure (34 pts)'));
    children.push(...userStory('E1-S1', 'Express Server Bootstrap', 5, 'System Administrator',
        'a Node.js Express server that starts on a configurable port with environment-based configuration',
        'I can run the application in development and production environments',
        ['Server starts on PORT from .env (default 3000)', 'Configuration module reads from environment variables with sensible defaults', 'npm start and npm run dev (nodemon) both work', 'Server prints startup banner with environment, port, and API URL', 'dotenv loaded for local development']));

    children.push(...userStory('E1-S2', 'Graceful Shutdown', 3, 'System Administrator',
        'the server to shut down gracefully on SIGTERM/SIGINT',
        'in-flight requests complete and database connections are released cleanly',
        ['SIGTERM and SIGINT handlers registered', 'Shutdown sequence: stop HTTP (30s) -> stop scheduler -> wait ingestion (60s) -> close DB', 'Process exits with code 0 after clean shutdown', 'Safety timeout prevents indefinite hang']));

    children.push(...userStory('E1-S3', 'Static Frontend Serving & Subpath Support', 3, 'System Administrator',
        'the Express server to serve frontend static files and support deployment at a subpath',
        'the app works behind reverse proxies with path prefixes',
        ['Frontend directory served as static files', 'BASE_PATH env var strips prefix from incoming requests', 'API calls use relative paths for subpath compatibility', 'Trust proxy configurable via TRUST_PROXY env var']));

    children.push(...userStory('E1-S4', 'CORS, Compression & Base Middleware', 3, 'System Administrator',
        'CORS enabled, gzip compression active, and JSON body parsing configured',
        'the API is accessible cross-origin and responses are efficiently compressed',
        ['CORS enabled for configurable origins', 'Gzip compression applied (~85% reduction)', 'JSON and URL-encoded body parsers configured']));

    children.push(...userStory('E1-S5', 'ESLint & Prettier Configuration', 2, 'developer',
        'strict ESLint and Prettier rules enforced across the codebase',
        'code quality and formatting are consistent',
        ['ESLint configured with strict rules for backend src/', 'Prettier configured for both backend and frontend', 'npm run lint and npm run format:check commands work']));

    children.push(...userStory('E1-S6', 'Husky Pre-Commit Hooks', 2, 'developer',
        'pre-commit hooks that auto-format staged files',
        'no unformatted code enters the repository',
        ['Husky installed and configured at repo root', 'lint-staged runs Prettier on staged .js files', 'Hook failure prevents commit']));

    children.push(...userStory('E1-S7', 'Docker Compose for Local Development', 3, 'developer',
        'a Docker Compose setup with MariaDB',
        'I can run the database locally without installing MySQL',
        ['docker-compose.yml with MariaDB service', 'Database configurable via environment', 'Data volume persisted between restarts']));

    children.push(...userStory('E1-S8', 'GitHub Actions CI Pipeline', 5, 'developer',
        'a CI pipeline that runs linting, formatting checks, auditing, and tests on every push and PR',
        'code quality is enforced automatically',
        ['Lint job: Node 20, npm ci, lint, format:check', 'Test job: npm ci, npm audit --audit-level=high, npm test', 'Jobs run in parallel', 'Triggered on push to main and all PRs']));

    children.push(...userStory('E1-S9', 'Project README & Contributing Guide', 3, 'developer',
        'comprehensive README and CONTRIBUTING docs',
        'new team members can onboard quickly',
        ['README covers: overview, setup, env vars, npm scripts', 'CONTRIBUTING.md covers: workflow, standards, PR process', 'LICENSE (MIT) included']));

    children.push(...userStory('E1-S10', 'Service Worker Shell', 5, 'Operations Manager',
        'a service worker registered for the frontend',
        'the app loads faster on repeat visits',
        ['sw.js registered in frontend', 'Caches static assets for faster load', 'Graceful fallback when offline']));

    // ── Epic E2 ──
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading2('Epic E2: Database Schema & Data Layer (37 pts)'));

    children.push(...userStory('E2-S1', 'Database Initialization & Connection Pool', 5, 'System Administrator',
        'the application to initialize a MySQL/MariaDB connection pool with retry logic',
        'the database connection is resilient to transient failures',
        ['Connection pool with 40 connections', 'Retry logic with exponential backoff', 'Pool exhaustion returns 503 with Retry-After header', 'Per-connection statement timeouts', 'SSL/TLS support for remote databases', 'Clean pool shutdown on server stop']));

    children.push(...userStory('E2-S2', 'Schema Migration System', 5, 'System Administrator',
        'a versioned migration system with idempotent up/down migrations',
        'database schema changes are tracked, repeatable, and reversible',
        ['schema_migrations table tracks applied migrations', 'npm run migrate applies pending migrations', 'npm run migrate:status shows applied/pending', 'npm run migrate:baseline marks existing schema', 'Each migration is idempotent (safe to re-run)']));

    children.push(...userStory('E2-S3', 'Offices Table & 300 Office Seed Data', 8, 'developer',
        'an offices table seeded with 300 US office locations including coordinates, UGC codes, and observation station IDs',
        'the system can match weather alerts to geographic locations',
        ['offices table with id, office_code, name, city, state, region, lat/lng, ugc_codes, observation_station', 'Seed script populates 300 offices from JSON', 'Each office has valid coordinates', 'UGC codes mapped per office for NOAA matching', 'Import script can load from CSV']));

    children.push(...userStory('E2-S4', 'Advisories Table & Model', 5, 'developer',
        'an advisories table and model for storing NOAA weather alerts',
        'ingested alerts persist and can be queried',
        ['advisories table with external_id, vtec_event_id, office_id, severity, headline, description, etc.', 'Advisory model with CRUD, find by external_id, find active, find by office', 'Unique constraint on external_id', 'Pagination support in list queries']));

    children.push(...userStory('E2-S5', 'Office Status & Observations Tables', 5, 'developer',
        'tables for tracking per-office operational status and weather observations',
        'the dashboard can display current conditions and impact levels',
        ['office_status table: operational_status, weather_impact_level, advisory_count', 'office_observations table: temperature, humidity, wind, conditions', 'Models with upsert operations', 'OfficeStatus model has getImpactedOffices, getSummary']));

    children.push(...userStory('E2-S6', 'Supporting Tables', 5, 'developer',
        'tables for alert types, notices, advisory history, audit logging, and ingestion events',
        'the system supports filtering, compliance, trend analysis, and operational monitoring',
        ['alert_types, notices, advisory_history, audit_log, ingestion_events tables', 'Models for each table with appropriate query methods', 'Unit tests for all models']));

    children.push(...userStory('E2-S7', 'NOAA Alert Types Configuration', 4, 'Operations Analyst',
        'all 96 NOAA alert types categorized into 5 impact levels',
        'alerts can be filtered and prioritized by severity',
        ['CRITICAL: 13 types (Tornado Warning, Hurricane Warning, etc.)', 'HIGH, MODERATE, LOW, INFO: ~20 types each', 'Helper functions: getImpactLevel(), getAllByLevel()', 'Used by normalizer and filter system']));

    // ── Epic E3 ──
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading2('Epic E3: NOAA Data Ingestion Pipeline (52 pts)'));

    children.push(...userStory('E3-S1', 'NOAA API Client with Rate Limiting', 8, 'developer',
        'an HTTP client for the NOAA Weather API with rate limiting and retry logic',
        'API calls respect rate limits and recover from transient failures',
        ['Axios-based HTTP client for api.weather.gov', '500ms minimum between requests', 'Retry up to 3 times with exponential backoff', 'Retryable status codes: 408, 429, 5xx', 'User-Agent header set per NOAA requirements']));

    children.push(...userStory('E3-S2', 'Circuit Breaker for NOAA API', 5, 'System Administrator',
        'a circuit breaker on NOAA API calls',
        'the system stops hammering a failing API and recovers automatically',
        ['Three states: CLOSED, OPEN, HALF_OPEN', 'Opens after 3 consecutive failures', '60-second recovery timeout', 'HALF_OPEN requires 2 successes to close', 'Circuit state exposed in health endpoint']));

    children.push(...userStory('E3-S3', 'Alert Normalizer & Impact Calculator', 5, 'developer',
        'raw NOAA API responses normalized into a consistent internal format',
        'downstream code works with clean, predictable data',
        ['normalizeNOAAAlert() extracts all fields from raw payload', 'calculateWeatherImpact() returns impact level from severity matrix', 'calculateHighestWeatherImpact() finds worst across multiple advisories', 'Handles missing/null fields gracefully']));

    children.push(...userStory('E3-S4', 'VTEC Event ID Extraction', 3, 'developer',
        'VTEC identifiers extracted from NOAA alerts',
        'related alerts across time can be linked and deduplicated',
        ['Parse VTEC strings from alert description/parameters', 'Extract action, office, phenomena, significance, tracking number', 'Compose vtec_event_id for deduplication', 'Handle alerts without VTEC gracefully']));

    children.push(...userStory('E3-S5', 'UGC Geographic Matching', 8, 'Operations Manager',
        'weather alerts matched to offices using UGC geographic codes with county and state fallback',
        'every relevant alert appears on the correct office dashboard',
        ['Primary match: alert UGC codes intersect office UGC codes', 'Fallback 1: county-level match', 'Fallback 2: state-level match', 'Bulk pre-fetch optimization', 'One alert can match multiple offices']));

    children.push(...userStory('E3-S6', '3-Strategy Deduplication', 5, 'developer',
        'ingested alerts deduplicated using three strategies',
        'duplicate alerts are not inserted',
        ['Strategy 1: external_id match', 'Strategy 2: VTEC event ID match', 'Strategy 3: Natural key fallback', 'Existing alerts updated rather than re-inserted', 'Dedup stats logged per cycle']));

    children.push(...userStory('E3-S7', 'Main Ingestion Orchestrator', 8, 'System Administrator',
        'a main ingestion function that fetches, normalizes, deduplicates, matches, and persists alerts',
        'the database stays consistent even if ingestion partially fails',
        ['Fetches all active alerts from NOAA', 'Applies normalizer, UGC matching, dedup strategies', 'Inserts/updates alerts, updates office_status', 'Fetches weather observations', 'Records ingestion event', 'Handles partial failures']));

    children.push(...userStory('E3-S8', 'Scheduled Ingestion via node-cron', 3, 'System Administrator',
        'ingestion to run automatically every 15 minutes',
        'the dashboard always shows near-real-time weather data',
        ['node-cron runs ingestion every 15 minutes (configurable)', 'Scheduler start/stop programmatically', 'INGESTION_ENABLED env var toggle', 'Manual trigger via npm run ingest']));

    children.push(...userStory('E3-S9', 'Expired Advisory Cleanup', 3, 'System Administrator',
        'expired advisories cleaned up and stale payloads nullified',
        'the database does not grow unbounded',
        ['removeExpiredAdvisories() deletes expired alerts', 'Stale raw_payload fields nullified', 'Cleanup runs as part of each ingestion cycle', 'Cleanup failure does not abort ingestion']));

    children.push(...userStory('E3-S10', 'Historical Snapshot Capture', 4, 'Product Owner',
        'system-wide advisory snapshots captured every 6 hours',
        'we can analyze trends over time',
        ['Snapshot captures per-office advisory counts by severity', 'Stored in advisory_history and system_snapshots tables', 'Capture script can run standalone', 'Data feeds trends API endpoints']));

    // ── Epic E4 ──
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading2('Epic E4: Core API Endpoints (42 pts)'));

    children.push(...userStory('E4-S1', 'Advisories API', 5, 'Operations Analyst',
        'API endpoints to list advisories with filtering, pagination, and detail views',
        'the frontend can display advisory data flexibly',
        ['GET /api/advisories - list all with pagination', 'GET /api/advisories/active - non-expired only', 'GET /api/advisories/recent - last 24 hours', 'GET /api/advisories/:id - single detail', 'Filtering by state, severity, event_type, office_id', 'Input validation on all parameters']));

    children.push(...userStory('E4-S2', 'Offices API', 5, 'Operations Manager',
        'API endpoints to query offices by various criteria',
        'I can find offices by location, state, or region',
        ['GET /api/offices - list all', 'GET /api/offices/:id - detail with advisories', 'GET /api/offices/nearby?lat=&lng=&radius= - Haversine distance search', 'GET /api/offices/states, /regions - lookup lists', 'Input validation, integration tests']));

    children.push(...userStory('E4-S3', 'Status & Health API', 5, 'System Administrator',
        'status and health endpoints',
        'monitoring tools and the frontend can check system health',
        ['GET /api/status - dashboard overview with counts', 'GET /api/status/impacted - impacted offices list', 'GET /api/health - DB connectivity, ingestion status, circuit breaker', 'GET /api/version - app version from package.json']));

    children.push(...userStory('E4-S4', 'Operational Status API', 3, 'Operations Manager',
        'API endpoints for per-office operational status',
        'I can see which offices are operating normally vs. impacted',
        ['GET /api/operational-status - summary of all offices', 'GET /api/operational-status/:officeId - single office', 'GET /api/operational-status/impacted - impacted only', 'Returns: status, impact_level, severity, count, reason']));

    children.push(...userStory('E4-S5', 'Observations API', 3, 'Operations Manager',
        'API endpoints for current weather observations at each office',
        'the dashboard can show temperature, humidity, and wind',
        ['GET /api/observations - all offices latest', 'GET /api/observations/:officeId - single office', 'Returns: temperature, humidity, wind, conditions, observation_time']));

    children.push(...userStory('E4-S6', 'Notices API', 3, 'Operations Manager',
        'API endpoints for government/emergency notices',
        'relevant notices appear on the dashboard',
        ['GET /api/notices - all active notices', 'GET /api/notices?jurisdiction=state - filtered', 'Input validation on query params']));

    children.push(...userStory('E4-S7', 'Trends & History API', 5, 'Product Owner',
        'API endpoints for trend data and historical overview',
        'reports can show how weather impacts have changed over time',
        ['GET /api/trends - system-wide trends', 'GET /api/trends/:officeId - per-office trends', 'GET /api/history/overview - direction indicators with % change', 'GET /api/history/availability - date ranges with data']));

    children.push(...userStory('E4-S8', 'Filters API', 3, 'Operations Analyst',
        'API endpoints serving filter presets and alert type lists',
        'the frontend filter system can be configured dynamically',
        ['GET /api/filters - all preset configs', 'GET /api/filters/types/all - 96 alert types by impact level', 'Used by frontend AlertFilters module']));

    children.push(...userStory('E4-S9', 'Admin API', 5, 'System Administrator',
        'admin endpoints to control ingestion and view audit logs',
        'I can manage the system during maintenance windows',
        ['POST /api/admin/ingestion/pause and /resume', 'GET /api/admin/health - detailed diagnostics', 'GET /api/admin/audit - audit log entries', 'Protected by API key (timing-safe comparison)']));

    children.push(...userStory('E4-S10', 'Input Validation Layer', 5, 'developer',
        'centralized input validation using express-validator on all endpoints',
        'invalid input is rejected with clear error messages',
        ['Validator modules per route group', 'Common validators for pagination, state codes, severity, dates', '400 responses with structured error messages', 'Unit tests for validators']));

    // ── Epic E5 ──
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading2('Epic E5: Dashboard Overview UI (34 pts)'));

    children.push(...userStory('E5-S1', 'Dashboard Layout & Navigation Shell', 5, 'Operations Manager',
        'a responsive navigation bar and page layout shared across all pages',
        'I can navigate the application consistently',
        ['Bootstrap 5.3 navbar with links to all 9 pages', 'Responsive hamburger menu on mobile', 'Skip-to-content accessibility link', 'Footer with version display']));

    children.push(...userStory('E5-S2', 'XSS-Safe HTML Templating', 3, 'developer',
        'a tagged template literal system that auto-escapes HTML',
        'user-supplied data is rendered safely without XSS vulnerabilities',
        ['html tagged template auto-escapes interpolated values', 'raw() function for trusted HTML', 'escapeHtml() utility for manual escaping', 'Used consistently across all page JavaScript']));

    children.push(...userStory('E5-S3', 'API Client Module with Caching', 5, 'developer',
        'a frontend API client with timeout handling and localStorage caching',
        'API calls are resilient and repeat visits are fast',
        ['API object with methods for all endpoints', '30-second AbortController timeout', 'localStorage caching with 5-minute TTL', 'Relative URL base for subpath compatibility']));

    children.push(...userStory('E5-S4', 'Weather Impact Summary Cards', 5, 'Operations Manager',
        'a 4-column grid of weather impact cards showing counts by severity',
        'I can see at a glance how many offices are affected at each level',
        ['Four cards: Extreme (red), Severe (orange), Moderate (yellow), Minor (blue)', 'Each shows count of affected offices', 'Cards are clickable (link to filtered offices page)', 'Responsive: stacks on tablet/mobile']));

    children.push(...userStory('E5-S5', 'Impacted Offices by Severity - Collapsible Sections', 5, 'Operations Manager',
        'impacted offices grouped by severity in collapsible sections',
        'I can focus on critical offices first',
        ['Grouped into Extreme, Severe, Moderate, Minor sections', 'Extreme/Severe expanded by default; others collapsed', 'Office cards show: name, severity, advisory count, temperature', 'Empty sections hidden']));

    children.push(...userStory('E5-S6', 'Operational Status Cards & Statistics', 3, 'Operations Manager',
        'operational status summary cards and detailed statistics',
        'I can see the overall operational posture',
        ['Status cards: Normal, Monitoring, Impacted, Closed', 'Detailed statistics section with advisory breakdowns', 'Refreshes on each data update cycle']));

    children.push(...userStory('E5-S7', 'Update Banner with Countdown Timer', 5, 'Operations Manager',
        'a banner showing when data was last updated and a countdown to the next update',
        'I know how fresh the data is',
        ['Shows last updated timestamp in local timezone', 'Countdown timer updates every second', 'Polls /health when countdown expires', 'Auto-reloads when ingestion completes', 'Reusable UpdateBanner module']));

    children.push(...userStory('E5-S8', 'Office Aggregation & Severity Ranking', 3, 'developer',
        'an aggregation module that groups advisories by office and ranks by severity',
        'the dashboard displays offices in priority order',
        ['Groups advisories by office', 'Severity ranking: Extreme > Severe > Moderate > Minor', 'Multi-zone deduplication', 'Used by dashboard, offices, and map pages']));

    // ── Epics E6-E15 (condensed summaries) ──
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading2('Epic E6: Advisory & Office List Pages (31 pts)'));
    children.push(...userStory('E6-S1', 'Active Advisories Page - Card & Table Views', 8, 'Operations Analyst',
        'an advisories page with card and table view toggle, search, and filters',
        'I can find specific advisories quickly',
        ['Card view with severity badges, headlines, affected offices', 'Table view: sortable columns', 'Toggle persisted in localStorage', 'Deduplication toggle for multi-zone alerts', 'Search by headline, event type, or office']));

    children.push(...userStory('E6-S2', 'Advisory Filtering & Sorting', 5, 'Operations Analyst',
        'to filter advisories by state, severity, and preset, and sort by criteria',
        'I can narrow down to advisories I care about',
        ['State, severity, preset dropdown filters', 'Sort: onset time, severity, event type, office count', 'Filters combinable (AND logic)', 'Filter state reflected in URL parameters']));

    children.push(...userStory('E6-S3', 'Impacted Offices Page', 5, 'Operations Manager',
        'a page listing all offices with their current weather impact',
        'I can see every impacted office at once',
        ['Office cards with severity, advisory count, operational status', 'Search, state filter, impact/status filters, sort options', 'URL parameter support for deep linking', 'Cards link to office detail page']));

    children.push(...userStory('E6-S4', 'Office Detail Page', 8, 'Operations Manager',
        'a detail page for each office showing header, highest alert, impact summary, timeline, and all advisories',
        'I can understand the full weather situation at a specific location',
        ['Header with office info and coordinates', 'Highest alert card with full details', 'Impact summary by severity', 'Chronological alert timeline', 'All advisories with modal detail view']));

    children.push(...userStory('E6-S5', 'Utility Functions Module', 5, 'developer',
        'a shared utilities module with common formatting, display, and helper functions',
        'all pages use consistent logic',
        ['escapeHtml, truncate, cToF, isStale, timeAgo, formatDate', 'getSeverityBadge, renderEmptyHtml, renderErrorHtml', 'showError, debounce utilities']));

    // ── E7 ──
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading2('Epic E7: Interactive Map View (21 pts)'));
    children.push(...userStory('E7-S1', 'Leaflet Map & Office Markers', 8, 'Operations Manager',
        'an interactive map showing all office locations with color-coded markers',
        'I can see geographic weather impact at a glance',
        ['Leaflet map centered on US', 'Markers color-coded by highest severity', 'Custom CSS div icons', 'OpenStreetMap tile layer']));

    children.push(...userStory('E7-S2', 'Marker Clustering', 5, 'Operations Manager',
        'markers to cluster when zoomed out with severity-aware badges',
        'dense areas remain readable',
        ['MarkerCluster with 60px radius', 'Cluster colored by highest-severity child', 'Smooth zoom-in on click']));

    children.push(...userStory('E7-S3', 'Map Popups', 5, 'Operations Manager',
        'to click a marker and see office details with temperature and advisories',
        'I can get details without leaving the map',
        ['Popup shows: name, city/state, temperature, advisory count', 'Link to office detail page', 'Popup styled consistently with theme']));

    children.push(...userStory('E7-S4', 'Map Controls', 3, 'Operations Manager',
        'checkboxes to filter markers by severity and fit/reset buttons',
        'I can focus on specific severity levels',
        ['Severity checkboxes for each level', 'Fit to markers button', 'Reset view button']));

    // ── E8 ──
    children.push(heading2('Epic E8: Filter System & Configuration (26 pts)'));
    children.push(...userStory('E8-S1', 'Alert Filter Engine & localStorage', 8, 'Operations Analyst',
        'a client-side alert filter system with 5 presets that persists in localStorage',
        'I only see alert types relevant to my role',
        ['5 presets: Office Default, Operations, Executive, Safety, Full', 'Each preset defines which of 96 alert types are enabled', 'Selection saved to localStorage', 'AlertFilters module with init(), applyFilters(), isEnabled()']));

    children.push(...userStory('E8-S2', 'Filter Configuration Page', 8, 'Operations Analyst',
        'a dedicated page to configure which alert types are visible',
        'I can customize exactly what I see across the dashboard',
        ['5 preset buttons at top', '96+ toggles organized by impact level', 'Enable All / Disable All per level', 'Save button persists to localStorage']));

    children.push(...userStory('E8-S3', 'Cross-Page Filter Application', 5, 'Operations Analyst',
        'filter settings to apply across all pages',
        'I get a consistent filtered view everywhere',
        ['Dashboard, advisories, offices, map all respect filters', 'Filter indicator badge in nav', 'Changes take effect on next page load']));

    children.push(...userStory('E8-S4', 'Shareable Links', 5, 'Operations Analyst',
        'to generate shareable URLs that encode my current filter state',
        'I can send a colleague a link to exactly what I see',
        ['URL encodes active preset and custom types', 'Opening shared link applies encoded filters', 'Copy link button on advisories/offices pages']));

    // ── E9 ──
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading2('Epic E9: Export & Reporting (21 pts)'));
    children.push(...userStory('E9-S1', 'CSV Export', 5, 'Operations Analyst',
        'to export offices or advisories to CSV',
        'I can analyze data in Excel or share with colleagues',
        ['Export Offices CSV and Export Advisories CSV buttons', 'CSV properly escapes commas, quotes, newlines', 'Filename includes date', 'Respects current filters']));

    children.push(...userStory('E9-S2', 'HTML Report Generation', 8, 'Product Owner',
        'to generate formatted HTML reports (incident, summary, executive briefing)',
        'I can share professional weather impact reports with stakeholders',
        ['Incident Report: per-office breakdown', 'Summary Report: overview stats', 'Executive Briefing: high-level overview', 'Print-optimized with Storm Scout branding']));

    children.push(...userStory('E9-S3', 'Export Dropdown UI', 3, 'Operations Analyst',
        'an export dropdown menu on the dashboard',
        'I can choose my export format quickly',
        ['Bootstrap dropdown with all export options', 'Works on mobile (touch-friendly)']));

    children.push(...userStory('E9-S4', 'Print-Optimized CSS', 2, 'Product Owner',
        'print styles that produce clean PDFs from browser print',
        'printed reports look professional',
        ['Hides nav, footer, buttons, countdown timer', 'Page breaks between sections', 'Colors adjusted for print']));

    children.push(...userStory('E9-S5', 'Version Display Module', 3, 'Operations Manager',
        'the app version and release date displayed in the footer',
        'I know which version I am running',
        ['version.js fetches /api/version', 'Cached after first fetch', 'Graceful fallback if unavailable']));

    // ── E10 ──
    children.push(heading2('Epic E10: Operational Status & Observations (18 pts)'));
    children.push(...userStory('E10-S1', 'Weather Observation Display', 5, 'Operations Manager',
        'current weather conditions displayed for each office',
        'I can understand conditions beyond just alerts',
        ['Temperature in Fahrenheit, humidity, wind', 'Freshness indicator for stale data', 'Shown on dashboard cards, detail page, map popups']));

    children.push(...userStory('E10-S2', 'Office Status Calculation', 5, 'Operations Manager',
        'each office operational status automatically calculated from active advisories',
        'I can see which offices might need action',
        ['Status levels: Normal, Monitoring, Impacted, Critical', 'Status reason generated from advisories', 'Updated after each ingestion cycle']));

    children.push(...userStory('E10-S3', 'Government Notices Page', 5, 'Operations Manager',
        'a page displaying government and emergency notices',
        'I can see relevant government communications',
        ['Notice cards with title, body, jurisdiction, source', 'Jurisdiction filter dropdown', 'Sorted by effective date']));

    children.push(...userStory('E10-S4', 'Analytics & Trends Frontend', 3, 'developer',
        'frontend modules for loading and displaying trend data',
        'dashboard cards can show trend indicators',
        ['Fetch trend data from /api/trends', 'Direction indicators (up/down/stable)', 'Sparkline rendering for dashboard cards']));

    // ── E11-E15 (more condensed) ──
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading2('Epic E11: Trends & Historical Data (18 pts)'));
    children.push(...userStory('E11-S1', 'System-Wide Trend Calculation', 5, 'Product Owner', 'trend calculations comparing current to historical averages', 'reports show whether weather activity is increasing or decreasing', ['Trend direction: UP, DOWN, STABLE', 'Percentage change from snapshots', 'Trends for total, by severity, by region']));
    children.push(...userStory('E11-S2', 'Per-Office Trend Data', 5, 'Operations Analyst', 'trend data for individual offices', 'I can see if an office is experiencing changes', ['Per-office counts over time', 'Severity breakdown per office', 'Sparkline data for visualization']));
    children.push(...userStory('E11-S3', 'Historical Overview with Direction', 5, 'Product Owner', 'historical overview with trend direction and percentage changes', 'executive briefings include data-driven analysis', ['Current vs previous period comparisons', '24h and 7d period windows', 'Direction: increasing/decreasing/stable']));
    children.push(...userStory('E11-S4', 'System Snapshots', 3, 'System Administrator', 'periodic system snapshots stored for analysis', 'we retain historical data after advisories expire', ['system_snapshots table with aggregate counts', 'Captured every 6 hours', 'Feeds history API endpoints']));

    children.push(heading2('Epic E12: Admin, Alerting & Notices (23 pts)'));
    children.push(...userStory('E12-S1', 'Webhook Alert System', 8, 'System Administrator', 'webhook notifications for system events', 'the ops team is notified via Slack/Discord/Teams', ['Alert types: failure, recovery, partial, cleanup, DB error, anomaly', 'Per-type throttling (5-min window)', 'Auto recovery notifications', 'Slack/Discord/Teams compatible payloads']));
    children.push(...userStory('E12-S2', 'Admin Ingestion Control', 3, 'System Administrator', 'to pause and resume ingestion via API', 'I can perform maintenance without stopping the server', ['POST pause/resume endpoints', 'Protected by API key', 'State reflected in /health']));
    children.push(...userStory('E12-S3', 'Audit Logging', 5, 'System Administrator', 'significant system actions logged to audit table', 'I can review what happened for compliance', ['AuditLog model records action, entity, details', 'GET /api/admin/audit with pagination', 'Entries immutable']));
    children.push(...userStory('E12-S4', 'Prometheus Metrics', 5, 'System Administrator', 'Prometheus-compatible metrics exposed', 'I can monitor with standard observability tools', ['GET /metrics endpoint', 'HTTP request count, duration, connections', 'Custom: ingestion duration, alert count, circuit breaker']));
    children.push(...userStory('E12-S5', 'Ingestion Event Tracking', 2, 'System Administrator', 'each ingestion cycle stats persisted', 'I can review ingestion performance over time', ['IngestionEvent records start, complete, counts, errors', 'Latest event queryable for health']));

    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading2('Epic E13: Security, Performance & Resilience (29 pts)'));
    children.push(...userStory('E13-S1', 'Helmet.js Security Headers', 3, 'System Administrator', 'comprehensive security headers on all responses', 'the application is protected against common vulnerabilities', ['CSP, HSTS, X-Frame-Options, X-Content-Type-Options', 'CSP allows Leaflet tiles and CDN resources']));
    children.push(...userStory('E13-S2', 'API Key Auth (Timing-Safe)', 3, 'System Administrator', 'admin endpoints protected by API key with timing-safe comparison', 'unauthorized access is prevented', ['crypto.timingSafeEqual for comparison', 'Returns 401 with generic error', 'Applied to admin and write endpoints']));
    children.push(...userStory('E13-S3', 'Rate Limiting', 3, 'System Administrator', 'rate limiting on API endpoints', 'the system is protected from abuse', ['General: 30,000/60min; Write: 20/15min', 'Rate limit headers returned', '429 when exceeded']));
    children.push(...userStory('E13-S4', 'In-Memory Cache Layer', 5, 'developer', 'a 3-tier caching strategy', 'responses are fast and DB is not overloaded', ['Server: node-cache with per-endpoint TTLs', 'Client: localStorage 5-min TTL', 'HTTP: Cache-Control headers', 'Cache invalidated after ingestion']));
    children.push(...userStory('E13-S5', 'Database Resilience', 5, 'System Administrator', 'the database layer to handle failures gracefully', 'the application recovers without crashing', ['40-connection pool, retry with backoff', 'Pool exhaustion: 503 + Retry-After', 'Statement timeouts, SSL/TLS support']));
    children.push(...userStory('E13-S6', 'Responsive Design & Mobile', 5, 'Operations Manager', 'the dashboard to work well on tablets and phones', 'I can check weather status from any device', ['Mobile-first CSS with breakpoints', '44x44px minimum touch targets', 'Cards stack on mobile, grid on desktop', 'Tested on iOS Safari and Android Chrome']));
    children.push(...userStory('E13-S7', 'Accessibility', 5, 'Operations Manager', 'the application to be keyboard-navigable and screen-reader friendly', 'all team members can use it regardless of ability', ['Skip-to-content link', 'ARIA labels on all interactive elements', 'Keyboard navigation, focus management', 'Colors supplemented with text labels']));

    children.push(heading2('Epic E14: Testing, CI/CD & DevOps (34 pts)'));
    children.push(...userStory('E14-S1', 'Unit Tests - Models', 8, 'developer', 'unit tests for all 8 model modules', 'data layer logic is verified', ['Tests for all model CRUD methods', 'Database calls mocked', 'Edge cases: nulls, duplicates, missing records']));
    children.push(...userStory('E14-S2', 'Unit Tests - Middleware, Utils, Ingestion', 8, 'developer', 'unit tests for middleware, utilities, and ingestion', 'cross-cutting concerns are verified', ['Tests for apiKey, validate, metrics middleware', 'Tests for cache, alerting, cleanup, normalizer, api-client', '20 unit test files, coverage thresholds enforced']));
    children.push(...userStory('E14-S3', 'Integration Tests - All Routes', 8, 'developer', 'integration tests for all 10 route modules using supertest', 'API endpoints return correct responses', ['11 integration test files', 'HTTP assertions: status codes, structure, errors', 'Tests run without external dependencies']));
    children.push(...userStory('E14-S4', 'Smoke & Post-Deploy Tests', 3, 'System Administrator', 'smoke tests before deploy and UI verification after', 'deployments are validated automatically', ['Pre-deploy: 11 checks', 'Post-deploy: 22 checks', 'Exit codes for CI integration']));
    children.push(...userStory('E14-S5', 'Deployment Script', 5, 'System Administrator', 'an automated deployment script', 'deployments are safe and repeatable', ['SSH, pause ingestion, rsync, npm install, migrate, resume, health check', 'Colored output, fails fast on error', 'DEPLOY.md documentation']));
    children.push(...userStory('E14-S6', 'systemd, nginx, Backup', 2, 'System Administrator', 'service, proxy config, and backup scripts', 'production operations are standardized', ['systemd service file', 'nginx.conf.example', 'backup.sh and verify-backup.sh']));

    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading2('Epic E15: Documentation, Legal & Polish (16 pts)'));
    children.push(...userStory('E15-S1', 'Data Sources Page', 3, 'Operations Manager', 'a Data Sources page explaining where data comes from', 'I understand the system data quality', ['NOAA source explanation', 'Data processing methodology', 'Version history displayed']));
    children.push(...userStory('E15-S2', 'Legal Disclaimer Page', 1, 'Product Owner', 'a legal disclaimer page', 'the application clearly states its limitations', ['disclaimer.html with legal text', 'Linked from footer', 'States: not a substitute for official NWS warnings']));
    children.push(...userStory('E15-S3', 'Architecture & Tech Docs', 5, 'developer', 'comprehensive technical documentation', 'the system is maintainable', ['ARCHITECTURE.md, DATA-DICTIONARY.md, api.md', 'security/ docs, FRONTEND-GUIDE.md', 'QUICK-REFERENCE.md cheat sheet']));
    children.push(...userStory('E15-S4', 'CHANGELOG & Security Policy', 2, 'developer', 'a changelog and security policy', 'the project follows best practices', ['CHANGELOG.md with versioned notes', 'SECURITY.md with reporting process', 'DEVELOPMENT-PROCESS.md']));
    children.push(...userStory('E15-S5', 'Maintenance Scripts', 5, 'System Administrator', 'maintenance scripts for office data and cleanup', 'I can manage data without direct SQL', ['import-offices.js, fetch-ugc-codes.js, validate-ugc-codes.js', 'backfill-vtec.js, cleanup-duplicates.js', 'All documented with usage instructions']));

    // ══════════════════════════════════════════════════════════
    // SECTION 4: Sprint Planning
    // ══════════════════════════════════════════════════════════
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading1('Sprint Planning'));
    children.push(para('Team: 5 people (2 backend, 2 frontend, 1 full-stack/DevOps). 2-week sprints. Target velocity: 40-50 points.'));

    // Sprint 1
    children.push(heading2('Sprint 1: Foundation (44 pts)'));
    children.push(para('Goal: Establish project infrastructure, database, and development tooling.', { italics: true }));
    children.push(sprintTable([
        { name: 'E1-S1: Express Server Bootstrap', pts: 5, assignee: 'Backend' },
        { name: 'E1-S2: Graceful Shutdown', pts: 3, assignee: 'Backend' },
        { name: 'E1-S3: Static Frontend Serving & Subpath', pts: 3, assignee: 'Full-Stack' },
        { name: 'E1-S4: CORS, Compression & Middleware', pts: 3, assignee: 'Backend' },
        { name: 'E1-S5: ESLint & Prettier', pts: 2, assignee: 'Full-Stack' },
        { name: 'E1-S6: Husky Pre-Commit Hooks', pts: 2, assignee: 'Full-Stack' },
        { name: 'E1-S7: Docker Compose', pts: 3, assignee: 'Full-Stack' },
        { name: 'E2-S1: DB Init & Connection Pool', pts: 5, assignee: 'Backend' },
        { name: 'E2-S2: Schema Migration System', pts: 5, assignee: 'Backend' },
        { name: 'E5-S1: Dashboard Layout & Nav Shell', pts: 5, assignee: 'Frontend' },
        { name: 'E5-S2: XSS-Safe HTML Templating', pts: 3, assignee: 'Frontend' },
        { name: 'E6-S5: Utility Functions Module', pts: 5, assignee: 'Frontend' }
    ]));

    // Sprint 2
    children.push(heading2('Sprint 2: Data Schema & Seed Data (43 pts)'));
    children.push(para('Goal: Complete database schema, seed office data, and build API client foundation.', { italics: true }));
    children.push(sprintTable([
        { name: 'E2-S3: Offices Table & 300 Office Seed Data', pts: 8, assignee: 'Backend' },
        { name: 'E2-S4: Advisories Table & Model', pts: 5, assignee: 'Backend' },
        { name: 'E2-S5: Office Status & Observations Tables', pts: 5, assignee: 'Backend' },
        { name: 'E2-S6: Supporting Tables (6 tables)', pts: 5, assignee: 'Backend' },
        { name: 'E2-S7: NOAA Alert Types Config (96 types)', pts: 4, assignee: 'Backend' },
        { name: 'E1-S9: README & Contributing Guide', pts: 3, assignee: 'Full-Stack' },
        { name: 'E5-S3: Frontend API Client with Caching', pts: 5, assignee: 'Frontend' },
        { name: 'E1-S8: GitHub Actions CI Pipeline', pts: 5, assignee: 'Full-Stack' },
        { name: 'E1-S10: Service Worker Shell', pts: 3, assignee: 'Frontend' }
    ]));

    // Sprint 3
    children.push(heading2('Sprint 3: Ingestion Pipeline - Core (45 pts)'));
    children.push(para('Goal: Build the NOAA API client, normalizer, and geographic matching engine.', { italics: true }));
    children.push(sprintTable([
        { name: 'E3-S1: NOAA API Client with Rate Limiting', pts: 8, assignee: 'Backend' },
        { name: 'E3-S2: Circuit Breaker', pts: 5, assignee: 'Backend' },
        { name: 'E3-S3: Alert Normalizer & Impact Calculator', pts: 5, assignee: 'Backend' },
        { name: 'E3-S4: VTEC Event ID Extraction', pts: 3, assignee: 'Backend' },
        { name: 'E3-S5: UGC Geographic Matching', pts: 8, assignee: 'Backend' },
        { name: 'E3-S6: 3-Strategy Deduplication', pts: 5, assignee: 'Backend' },
        { name: 'E4-S10: Input Validation Layer', pts: 5, assignee: 'Full-Stack' },
        { name: 'E13-S2: API Key Auth (Timing-Safe)', pts: 3, assignee: 'Full-Stack' },
        { name: 'E13-S3: Rate Limiting', pts: 3, assignee: 'Full-Stack' }
    ]));

    // Sprint 4
    children.push(heading2('Sprint 4: Ingestion Orchestration (41 pts)'));
    children.push(para('Goal: Complete ingestion orchestrator, scheduler, cleanup, and core API endpoints.', { italics: true }));
    children.push(sprintTable([
        { name: 'E3-S7: Main Ingestion Orchestrator', pts: 8, assignee: 'Backend' },
        { name: 'E3-S8: Scheduled Ingestion (node-cron)', pts: 3, assignee: 'Backend' },
        { name: 'E3-S9: Expired Advisory Cleanup', pts: 3, assignee: 'Backend' },
        { name: 'E3-S10: Historical Snapshot Capture', pts: 4, assignee: 'Backend' },
        { name: 'E4-S1: Advisories API', pts: 5, assignee: 'Backend' },
        { name: 'E4-S2: Offices API', pts: 5, assignee: 'Backend' },
        { name: 'E4-S3: Status & Health API', pts: 5, assignee: 'Full-Stack' },
        { name: 'E4-S4: Operational Status API', pts: 3, assignee: 'Backend' },
        { name: 'E13-S1: Helmet.js Security Headers', pts: 3, assignee: 'Full-Stack' },
        { name: 'E13-S4: In-Memory Cache Layer (part 1)', pts: 2, assignee: 'Backend' }
    ]));

    // Sprint 5
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading2('Sprint 5: APIs & Dashboard Core (43 pts)'));
    children.push(para('Goal: Complete all API endpoints and build the dashboard overview.', { italics: true }));
    children.push(sprintTable([
        { name: 'E4-S5: Observations API', pts: 3, assignee: 'Backend' },
        { name: 'E4-S6: Notices API', pts: 3, assignee: 'Backend' },
        { name: 'E4-S7: Trends & History API', pts: 5, assignee: 'Backend' },
        { name: 'E4-S8: Filters API', pts: 3, assignee: 'Backend' },
        { name: 'E4-S9: Admin API', pts: 5, assignee: 'Backend' },
        { name: 'E5-S4: Weather Impact Summary Cards', pts: 5, assignee: 'Frontend' },
        { name: 'E5-S5: Impacted Offices by Severity', pts: 5, assignee: 'Frontend' },
        { name: 'E5-S6: Operational Status Cards', pts: 3, assignee: 'Frontend' },
        { name: 'E5-S7: Update Banner with Countdown', pts: 5, assignee: 'Frontend' },
        { name: 'E5-S8: Aggregation & Severity Ranking', pts: 3, assignee: 'Frontend' },
        { name: 'E13-S4: Cache - Client & HTTP tiers', pts: 3, assignee: 'Full-Stack' }
    ]));

    // Sprint 6
    children.push(heading2('Sprint 6: Advisory & Office Pages (46 pts)'));
    children.push(para('Goal: Build the advisories and offices list pages with full filtering.', { italics: true }));
    children.push(sprintTable([
        { name: 'E6-S1: Advisories Page - Card & Table', pts: 8, assignee: 'Frontend' },
        { name: 'E6-S2: Advisory Filtering & Sorting', pts: 5, assignee: 'Frontend' },
        { name: 'E6-S3: Impacted Offices Page', pts: 5, assignee: 'Frontend' },
        { name: 'E6-S4: Office Detail Page', pts: 8, assignee: 'Frontend' },
        { name: 'E10-S1: Weather Observation Display', pts: 5, assignee: 'Frontend' },
        { name: 'E10-S2: Office Status Calculation', pts: 5, assignee: 'Backend' },
        { name: 'E13-S5: Database Resilience', pts: 5, assignee: 'Backend' },
        { name: 'E12-S5: Ingestion Event Tracking', pts: 2, assignee: 'Backend' },
        { name: 'E10-S4: Analytics & Trends Frontend', pts: 3, assignee: 'Frontend' }
    ]));

    // Sprint 7
    children.push(heading2('Sprint 7: Map & Filter System (47 pts)'));
    children.push(para('Goal: Build the interactive map and full filter configuration system.', { italics: true }));
    children.push(sprintTable([
        { name: 'E7-S1: Leaflet Map & Office Markers', pts: 8, assignee: 'Frontend' },
        { name: 'E7-S2: Marker Clustering', pts: 5, assignee: 'Frontend' },
        { name: 'E7-S3: Map Popups with Office Info', pts: 5, assignee: 'Frontend' },
        { name: 'E7-S4: Map Controls', pts: 3, assignee: 'Frontend' },
        { name: 'E8-S1: Alert Filter Engine & Presets', pts: 8, assignee: 'Frontend' },
        { name: 'E8-S2: Filter Configuration Page', pts: 8, assignee: 'Frontend' },
        { name: 'E8-S3: Cross-Page Filter Application', pts: 5, assignee: 'Full-Stack' },
        { name: 'E8-S4: Shareable Links', pts: 5, assignee: 'Frontend' }
    ]));

    // Sprint 8
    children.push(heading2('Sprint 8: Export, Reporting & Notices (42 pts)'));
    children.push(para('Goal: Build export system, reports, notices page, and alerting.', { italics: true }));
    children.push(sprintTable([
        { name: 'E9-S1: CSV Export (Offices & Advisories)', pts: 5, assignee: 'Frontend' },
        { name: 'E9-S2: HTML Report Generation', pts: 8, assignee: 'Frontend' },
        { name: 'E9-S3: Export Dropdown UI', pts: 3, assignee: 'Frontend' },
        { name: 'E9-S4: Print-Optimized CSS', pts: 2, assignee: 'Frontend' },
        { name: 'E9-S5: Version Display Module', pts: 3, assignee: 'Frontend' },
        { name: 'E10-S3: Government Notices Page', pts: 5, assignee: 'Frontend' },
        { name: 'E12-S1: Webhook Alert System', pts: 8, assignee: 'Backend' },
        { name: 'E12-S2: Admin Ingestion Control', pts: 3, assignee: 'Backend' },
        { name: 'E12-S3: Audit Logging', pts: 5, assignee: 'Backend' }
    ]));

    // Sprint 9
    children.push(heading2('Sprint 9: Trends, History & Metrics (44 pts)'));
    children.push(para('Goal: Build trend analysis, historical data, and Prometheus metrics.', { italics: true }));
    children.push(sprintTable([
        { name: 'E11-S1: System-Wide Trend Calculation', pts: 5, assignee: 'Backend' },
        { name: 'E11-S2: Per-Office Trend Data', pts: 5, assignee: 'Backend' },
        { name: 'E11-S3: Historical Overview with Direction', pts: 5, assignee: 'Backend' },
        { name: 'E11-S4: System Snapshots & Capture', pts: 3, assignee: 'Backend' },
        { name: 'E12-S4: Prometheus Metrics', pts: 5, assignee: 'Backend' },
        { name: 'E13-S6: Responsive Design & Mobile', pts: 5, assignee: 'Frontend' },
        { name: 'E13-S7: Accessibility', pts: 5, assignee: 'Frontend' },
        { name: 'E15-S1: Data Sources Page', pts: 3, assignee: 'Frontend' },
        { name: 'E15-S2: Legal Disclaimer Page', pts: 1, assignee: 'Frontend' },
        { name: 'E15-S4: CHANGELOG, Security Policy', pts: 2, assignee: 'Full-Stack' }
    ]));

    // Sprint 10
    children.push(heading2('Sprint 10: Testing & Quality (44 pts)'));
    children.push(para('Goal: Comprehensive test coverage and documentation.', { italics: true }));
    children.push(sprintTable([
        { name: 'E14-S1: Unit Tests - Models (8 models)', pts: 8, assignee: 'Backend' },
        { name: 'E14-S2: Unit Tests - Middleware, Utils, Ingestion', pts: 8, assignee: 'Backend' },
        { name: 'E14-S3: Integration Tests - All Routes', pts: 8, assignee: 'Backend' },
        { name: 'E14-S4: Smoke & Post-Deploy Tests', pts: 3, assignee: 'Full-Stack' },
        { name: 'E15-S3: Architecture & Tech Docs', pts: 5, assignee: 'Full-Stack' },
        { name: 'E15-S5: Maintenance Scripts & Data Tools', pts: 5, assignee: 'Full-Stack' },
        { name: 'E14-S5: Deployment Script & Infrastructure', pts: 5, assignee: 'Full-Stack' },
        { name: 'E14-S6: systemd, nginx, Backup', pts: 2, assignee: 'Full-Stack' }
    ]));

    // ══════════════════════════════════════════════════════════
    // SECTION 5: Summary
    // ══════════════════════════════════════════════════════════
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading1('Summary'));

    const sumColWidths = [1500, 5060, 1400, 1400];
    const summaryRows = [
        row([headerCell('Sprint', sumColWidths[0]), headerCell('Goal', sumColWidths[1]), headerCell('Points', sumColWidths[2]), headerCell('Velocity', sumColWidths[3])]),
        row([cell('1', sumColWidths[0], { align: AlignmentType.CENTER }), cell('Foundation', sumColWidths[1]), cell('44', sumColWidths[2], { align: AlignmentType.CENTER }), cell('44', sumColWidths[3], { align: AlignmentType.CENTER })]),
        row([cell('2', sumColWidths[0], { align: AlignmentType.CENTER, fill: LIGHT_GRAY }), cell('Data Schema & Seed Data', sumColWidths[1], { fill: LIGHT_GRAY }), cell('43', sumColWidths[2], { align: AlignmentType.CENTER, fill: LIGHT_GRAY }), cell('43', sumColWidths[3], { align: AlignmentType.CENTER, fill: LIGHT_GRAY })]),
        row([cell('3', sumColWidths[0], { align: AlignmentType.CENTER }), cell('Ingestion Pipeline - Core', sumColWidths[1]), cell('45', sumColWidths[2], { align: AlignmentType.CENTER }), cell('45', sumColWidths[3], { align: AlignmentType.CENTER })]),
        row([cell('4', sumColWidths[0], { align: AlignmentType.CENTER, fill: LIGHT_GRAY }), cell('Ingestion Orchestration', sumColWidths[1], { fill: LIGHT_GRAY }), cell('41', sumColWidths[2], { align: AlignmentType.CENTER, fill: LIGHT_GRAY }), cell('41', sumColWidths[3], { align: AlignmentType.CENTER, fill: LIGHT_GRAY })]),
        row([cell('5', sumColWidths[0], { align: AlignmentType.CENTER }), cell('APIs & Dashboard Core', sumColWidths[1]), cell('43', sumColWidths[2], { align: AlignmentType.CENTER }), cell('43', sumColWidths[3], { align: AlignmentType.CENTER })]),
        row([cell('6', sumColWidths[0], { align: AlignmentType.CENTER, fill: LIGHT_GRAY }), cell('Advisory & Office Pages', sumColWidths[1], { fill: LIGHT_GRAY }), cell('46', sumColWidths[2], { align: AlignmentType.CENTER, fill: LIGHT_GRAY }), cell('46', sumColWidths[3], { align: AlignmentType.CENTER, fill: LIGHT_GRAY })]),
        row([cell('7', sumColWidths[0], { align: AlignmentType.CENTER }), cell('Map & Filter System', sumColWidths[1]), cell('47', sumColWidths[2], { align: AlignmentType.CENTER }), cell('47', sumColWidths[3], { align: AlignmentType.CENTER })]),
        row([cell('8', sumColWidths[0], { align: AlignmentType.CENTER, fill: LIGHT_GRAY }), cell('Export, Reporting & Notices', sumColWidths[1], { fill: LIGHT_GRAY }), cell('42', sumColWidths[2], { align: AlignmentType.CENTER, fill: LIGHT_GRAY }), cell('42', sumColWidths[3], { align: AlignmentType.CENTER, fill: LIGHT_GRAY })]),
        row([cell('9', sumColWidths[0], { align: AlignmentType.CENTER }), cell('Trends, History & Metrics', sumColWidths[1]), cell('44', sumColWidths[2], { align: AlignmentType.CENTER }), cell('44', sumColWidths[3], { align: AlignmentType.CENTER })]),
        row([cell('10', sumColWidths[0], { align: AlignmentType.CENTER, fill: LIGHT_GRAY }), cell('Testing & Quality', sumColWidths[1], { fill: LIGHT_GRAY }), cell('44', sumColWidths[2], { align: AlignmentType.CENTER, fill: LIGHT_GRAY }), cell('44', sumColWidths[3], { align: AlignmentType.CENTER, fill: LIGHT_GRAY })]),
        row([cell('', sumColWidths[0], { fill: NAVY }), cell('TOTAL', sumColWidths[1], { bold: true, color: WHITE, fill: NAVY }), cell('439', sumColWidths[2], { bold: true, color: WHITE, fill: NAVY, align: AlignmentType.CENTER }), cell('~44 avg', sumColWidths[3], { bold: true, color: WHITE, fill: NAVY, align: AlignmentType.CENTER })])
    ];
    children.push(new Table({ width: { size: TABLE_WIDTH, type: WidthType.DXA }, columnWidths: sumColWidths, rows: summaryRows }));

    children.push(spacer(200));
    children.push(heading2('Story Point Distribution by Epic'));

    const distColWidths = [4680, 2340, 2340];
    const distRows = [row([headerCell('Epic', distColWidths[0]), headerCell('Points', distColWidths[1]), headerCell('% of Total', distColWidths[2])])];
    const distData = [
        ['E1: Foundation & Infrastructure', 34, 7.7],
        ['E2: Database Schema & Data Layer', 37, 8.4],
        ['E3: NOAA Ingestion Pipeline', 52, 11.8],
        ['E4: Core API Endpoints', 42, 9.6],
        ['E5: Dashboard Overview UI', 34, 7.7],
        ['E6: Advisory & Office List Pages', 31, 7.1],
        ['E7: Interactive Map View', 21, 4.8],
        ['E8: Filter System & Configuration', 26, 5.9],
        ['E9: Export & Reporting', 21, 4.8],
        ['E10: Operational Status & Observations', 18, 4.1],
        ['E11: Trends & Historical Data', 18, 4.1],
        ['E12: Admin, Alerting & Notices', 23, 5.2],
        ['E13: Security, Performance & Resilience', 29, 6.6],
        ['E14: Testing, CI/CD & DevOps', 34, 7.7],
        ['E15: Documentation, Legal & Polish', 16, 3.6]
    ];
    distData.forEach((d, i) => {
        const fill = i % 2 === 0 ? undefined : LIGHT_GRAY;
        distRows.push(row([
            cell(d[0], distColWidths[0], { fill }),
            cell(String(d[1]), distColWidths[1], { align: AlignmentType.CENTER, fill }),
            cell(d[2] + '%', distColWidths[2], { align: AlignmentType.CENTER, fill })
        ]));
    });
    children.push(new Table({ width: { size: TABLE_WIDTH, type: WidthType.DXA }, columnWidths: distColWidths, rows: distRows }));

    children.push(spacer(300));
    children.push(richPara([
        { text: 'Team: ', bold: true },
        { text: '5 people (2 backend, 2 frontend, 1 full-stack/DevOps)' }
    ]));
    children.push(richPara([
        { text: 'Velocity: ', bold: true },
        { text: '~40-50 points per sprint (2-week sprints)' }
    ]));
    children.push(richPara([
        { text: 'Duration: ', bold: true },
        { text: '10 sprints = 20 weeks (approximately 5 months)' }
    ]));

    // ═══════════════════════════════════════════════════════════
    // ASSEMBLE DOCUMENT
    // ═══════════════════════════════════════════════════════════
    const doc = new Document({
        styles: {
            default: { document: { run: { font: 'Arial', size: 20 } } },
            paragraphStyles: [
                { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                    run: { size: 32, bold: true, font: 'Arial', color: NAVY },
                    paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 } },
                { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                    run: { size: 26, bold: true, font: 'Arial', color: NAVY },
                    paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 } },
                { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                    run: { size: 22, bold: true, font: 'Arial', color: '444444' },
                    paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } }
            ]
        },
        numbering: {
            config: [
                { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
                { reference: 'ac_bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
                { reference: 'dod_numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
                { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
            ]
        },
        sections: [{
            properties: {
                page: {
                    size: { width: 12240, height: 15840 },
                    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
                }
            },
            headers: {
                default: new Header({
                    children: [new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [new TextRun({ text: 'Storm Scout \u2014 Retrospective Agile Breakdown', font: 'Arial', size: 16, color: DARK_GRAY, italics: true })]
                    })]
                })
            },
            footers: {
                default: new Footer({
                    children: [new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: 'Page ', font: 'Arial', size: 16, color: DARK_GRAY }),
                            new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: DARK_GRAY }),
                            new TextRun({ text: '  |  March 2026  |  Confidential', font: 'Arial', size: 16, color: DARK_GRAY })
                        ]
                    })]
                })
            },
            children
        }]
    });

    const buffer = await Packer.toBuffer(doc);
    const outputPath = './docs/Storm Scout - Retrospective Agile Breakdown.docx';
    fs.writeFileSync(outputPath, buffer);
    console.log(`Document created: ${outputPath}`);
    console.log(`Size: ${(buffer.length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
