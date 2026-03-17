#!/usr/bin/env node
/**
 * Generates: Storm Scout - Agile Breakdown.pptx
 * Run: NODE_PATH=$(npm root -g) node docs/generate-agile-pptx.js
 */
const pptxgen = require('pptxgenjs');
const fs = require('fs');
const path = require('path');

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.author = 'Storm Scout Team';
pres.title = 'Storm Scout - Retrospective Agile Breakdown';

// ─── Brand Colors ───
const NAVY = '1B2845';
const GREEN = '7AB648';
const DARK_GREEN = '5A9A30';
const LIGHT_NAVY = '2A3F65';
const ICE = 'E8EDF5';
const WARM_GRAY = 'F5F6F8';
const WHITE = 'FFFFFF';
const DARK_TEXT = '1E2A3A';
const MED_TEXT = '4A5568';
const LIGHT_TEXT = '8896A6';
const RED = 'DC3545';
const ORANGE = 'E67E22';
const YELLOW = 'D4A017';
const BLUE = '3B82F6';

// ─── Helpers ───
const makeShadow = () => ({ type: 'outer', blur: 4, offset: 2, angle: 135, color: '000000', opacity: 0.1 });

function addFooter(slide, slideNum) {
    slide.addText('Storm Scout  |  Retrospective Agile Breakdown  |  March 2026', {
        x: 0.5, y: 5.2, w: 9, h: 0.35, fontSize: 9, color: LIGHT_TEXT, fontFace: 'Arial'
    });
}

// ══════════════════════════════════════════════════════════════
// SLIDE 1: Title
// ══════════════════════════════════════════════════════════════
let s1 = pres.addSlide();
s1.background = { color: NAVY };

// Accent bar at top
s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: GREEN } });

s1.addText('STORM SCOUT', {
    x: 0.8, y: 1.2, w: 8.4, h: 1.0, fontSize: 48, fontFace: 'Arial Black',
    color: WHITE, bold: true, charSpacing: 4
});
s1.addText('Retrospective Agile Breakdown', {
    x: 0.8, y: 2.1, w: 8.4, h: 0.6, fontSize: 24, fontFace: 'Arial',
    color: GREEN, bold: false
});
s1.addText('Reverse-engineering a vibe-coded application into traditional agile artifacts', {
    x: 0.8, y: 2.8, w: 7, h: 0.5, fontSize: 14, fontFace: 'Arial',
    color: '8BA0BE', italic: true
});

// Key metrics row
const metricY = 3.8;
const metrics = [
    { val: '15', label: 'Epics', x: 0.8 },
    { val: '~80', label: 'User Stories', x: 2.6 },
    { val: '439', label: 'Story Points', x: 4.4 },
    { val: '10', label: 'Sprints', x: 6.2 },
    { val: '5', label: 'Team Members', x: 8.0 }
];
metrics.forEach(m => {
    s1.addText(m.val, { x: m.x, y: metricY, w: 1.5, h: 0.55, fontSize: 32, fontFace: 'Arial',
        color: GREEN, bold: true, align: 'center', margin: 0 });
    s1.addText(m.label, { x: m.x, y: metricY + 0.55, w: 1.5, h: 0.3, fontSize: 11, fontFace: 'Arial',
        color: '8BA0BE', align: 'center', margin: 0 });
});

s1.addText('March 2026', {
    x: 0.8, y: 5.0, w: 3, h: 0.4, fontSize: 12, fontFace: 'Arial', color: '6B7D95'
});

// ══════════════════════════════════════════════════════════════
// SLIDE 2: What is Storm Scout?
// ══════════════════════════════════════════════════════════════
let s2 = pres.addSlide();
s2.background = { color: WARM_GRAY };
s2.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: GREEN } });

s2.addText('What is Storm Scout?', {
    x: 0.6, y: 0.3, w: 9, h: 0.7, fontSize: 32, fontFace: 'Arial Black', color: NAVY, margin: 0
});

s2.addText('An office-focused weather advisory dashboard for operations teams that consolidates real-time NOAA weather alerts by geographic location.', {
    x: 0.6, y: 1.1, w: 8.5, h: 0.6, fontSize: 14, fontFace: 'Arial', color: MED_TEXT, italic: true
});

// Feature cards - 2 columns
const features = [
    { title: 'Real-Time Ingestion', desc: 'NOAA data every 15 min with circuit breaker resilience', col: 0 },
    { title: '300 US Offices', desc: 'Pre-loaded locations with UGC geographic matching', col: 1 },
    { title: '96 Alert Types', desc: 'Mapped to 5 impact levels (Critical to Info)', col: 0 },
    { title: 'Interactive Map', desc: 'Leaflet with severity-colored marker clustering', col: 1 },
    { title: 'Export & Reports', desc: 'CSV, incident reports, executive briefings', col: 0 },
    { title: 'Filter System', desc: '5 presets with 96 toggleable alert types', col: 1 }
];
features.forEach((f, i) => {
    const row = Math.floor(i / 2);
    const x = f.col === 0 ? 0.6 : 5.1;
    const y = 1.95 + row * 1.05;
    s2.addShape(pres.shapes.RECTANGLE, { x, y, w: 4.3, h: 0.9, fill: { color: WHITE }, shadow: makeShadow() });
    s2.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.07, h: 0.9, fill: { color: GREEN } });
    s2.addText(f.title, { x: x + 0.2, y, w: 3.9, h: 0.4, fontSize: 13, fontFace: 'Arial', color: NAVY, bold: true, margin: [4, 0, 0, 0] });
    s2.addText(f.desc, { x: x + 0.2, y: y + 0.4, w: 3.9, h: 0.4, fontSize: 11, fontFace: 'Arial', color: MED_TEXT, margin: [0, 0, 4, 0] });
});

// Tech stack bar
s2.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 5.05, w: 8.8, h: 0.4, fill: { color: NAVY } });
s2.addText('Node.js 20  +  Express  +  MySQL 8  +  Bootstrap 5  +  Leaflet  +  Vanilla JS (no build step)', {
    x: 0.6, y: 5.05, w: 8.8, h: 0.4, fontSize: 11, fontFace: 'Arial', color: WHITE, align: 'center', valign: 'middle'
});
addFooter(s2, 2);

// ══════════════════════════════════════════════════════════════
// SLIDE 3: Team & Timeline
// ══════════════════════════════════════════════════════════════
let s3 = pres.addSlide();
s3.background = { color: WARM_GRAY };
s3.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: GREEN } });

s3.addText('Team & Timeline', {
    x: 0.6, y: 0.3, w: 9, h: 0.7, fontSize: 32, fontFace: 'Arial Black', color: NAVY, margin: 0
});

// Team composition - left side
s3.addText('TEAM COMPOSITION', { x: 0.6, y: 1.2, w: 4, h: 0.35, fontSize: 12, fontFace: 'Arial', color: GREEN, bold: true, charSpacing: 2 });

const teamRoles = [
    { role: 'Backend Engineers', count: '2', focus: 'API, ingestion, database' },
    { role: 'Frontend Engineers', count: '2', focus: 'Dashboard, map, filters' },
    { role: 'Full-Stack / DevOps', count: '1', focus: 'CI/CD, deploy, infra' }
];
teamRoles.forEach((t, i) => {
    const y = 1.7 + i * 0.8;
    s3.addShape(pres.shapes.RECTANGLE, { x: 0.6, y, w: 4.2, h: 0.65, fill: { color: WHITE }, shadow: makeShadow() });
    s3.addText(t.count, { x: 0.7, y, w: 0.6, h: 0.65, fontSize: 24, fontFace: 'Arial', color: GREEN, bold: true, align: 'center', valign: 'middle' });
    s3.addText(t.role, { x: 1.4, y: y + 0.05, w: 3.2, h: 0.3, fontSize: 13, fontFace: 'Arial', color: NAVY, bold: true, margin: 0 });
    s3.addText(t.focus, { x: 1.4, y: y + 0.32, w: 3.2, h: 0.25, fontSize: 10, fontFace: 'Arial', color: LIGHT_TEXT, margin: 0 });
});

// Timeline - right side
s3.addText('PROJECT TIMELINE', { x: 5.3, y: 1.2, w: 4, h: 0.35, fontSize: 12, fontFace: 'Arial', color: GREEN, bold: true, charSpacing: 2 });

const timeline = [
    { label: 'Sprint Duration', value: '2 weeks' },
    { label: 'Total Sprints', value: '10' },
    { label: 'Total Duration', value: '20 weeks (~5 months)' },
    { label: 'Story Points', value: '439 total' },
    { label: 'Avg Velocity', value: '~44 pts/sprint' }
];
s3.addShape(pres.shapes.RECTANGLE, { x: 5.3, y: 1.7, w: 4.1, h: 2.4, fill: { color: WHITE }, shadow: makeShadow() });
timeline.forEach((t, i) => {
    const y = 1.8 + i * 0.44;
    s3.addText(t.label, { x: 5.5, y, w: 2, h: 0.35, fontSize: 12, fontFace: 'Arial', color: MED_TEXT, margin: 0 });
    s3.addText(t.value, { x: 7.5, y, w: 1.8, h: 0.35, fontSize: 12, fontFace: 'Arial', color: NAVY, bold: true, align: 'right', margin: 0 });
});

// User personas
s3.addText('USER PERSONAS', { x: 0.6, y: 4.3, w: 4, h: 0.35, fontSize: 12, fontFace: 'Arial', color: GREEN, bold: true, charSpacing: 2 });
const personas = [
    { name: 'Operations Manager', desc: 'Primary dashboard viewer' },
    { name: 'Operations Analyst', desc: 'Power user (filters, export)' },
    { name: 'System Administrator', desc: 'Deploy, monitor, maintain' },
    { name: 'Product Owner', desc: 'Stakeholder reports' }
];
personas.forEach((p, i) => {
    const x = 0.6 + i * 2.3;
    s3.addText(p.name, { x, y: 4.7, w: 2.1, h: 0.3, fontSize: 10, fontFace: 'Arial', color: NAVY, bold: true, margin: 0 });
    s3.addText(p.desc, { x, y: 4.95, w: 2.1, h: 0.25, fontSize: 9, fontFace: 'Arial', color: LIGHT_TEXT, margin: 0 });
});
addFooter(s3, 3);

// ══════════════════════════════════════════════════════════════
// SLIDE 4: Epics Overview
// ══════════════════════════════════════════════════════════════
let s4 = pres.addSlide();
s4.background = { color: WARM_GRAY };
s4.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: GREEN } });

s4.addText('Epics Overview', {
    x: 0.6, y: 0.2, w: 9, h: 0.6, fontSize: 32, fontFace: 'Arial Black', color: NAVY, margin: 0
});

const epicTableHeader = [
    [
        { text: '#', options: { fill: { color: NAVY }, color: WHITE, bold: true, fontSize: 10, fontFace: 'Arial', align: 'center' } },
        { text: 'Epic', options: { fill: { color: NAVY }, color: WHITE, bold: true, fontSize: 10, fontFace: 'Arial' } },
        { text: 'Points', options: { fill: { color: NAVY }, color: WHITE, bold: true, fontSize: 10, fontFace: 'Arial', align: 'center' } },
        { text: 'Sprints', options: { fill: { color: NAVY }, color: WHITE, bold: true, fontSize: 10, fontFace: 'Arial', align: 'center' } }
    ]
];

const epicRows = [
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
    ['E15', 'Documentation, Legal & Polish', '16', '12']
];

const tableData = epicTableHeader.concat(epicRows.map((r, i) => {
    const bg = i % 2 === 0 ? WHITE : ICE;
    return [
        { text: r[0], options: { fill: { color: bg }, color: NAVY, bold: true, fontSize: 9, fontFace: 'Arial', align: 'center' } },
        { text: r[1], options: { fill: { color: bg }, color: DARK_TEXT, fontSize: 9, fontFace: 'Arial' } },
        { text: r[2], options: { fill: { color: bg }, color: NAVY, bold: true, fontSize: 9, fontFace: 'Arial', align: 'center' } },
        { text: r[3], options: { fill: { color: bg }, color: MED_TEXT, fontSize: 9, fontFace: 'Arial', align: 'center' } }
    ];
})).concat([[
    { text: '', options: { fill: { color: NAVY } } },
    { text: 'TOTAL', options: { fill: { color: NAVY }, color: WHITE, bold: true, fontSize: 10, fontFace: 'Arial' } },
    { text: '439', options: { fill: { color: NAVY }, color: GREEN, bold: true, fontSize: 10, fontFace: 'Arial', align: 'center' } },
    { text: '10 sprints', options: { fill: { color: NAVY }, color: WHITE, bold: true, fontSize: 10, fontFace: 'Arial', align: 'center' } }
]]);

s4.addTable(tableData, {
    x: 0.6, y: 0.85, w: 8.8,
    colW: [0.6, 4.8, 1.0, 1.0],
    border: { pt: 0.5, color: 'DEE2E6' },
    rowH: [0.28].concat(Array(15).fill(0.25)).concat([0.28])
});

addFooter(s4, 4);

// ══════════════════════════════════════════════════════════════
// SLIDE 5: Story Point Distribution (Chart)
// ══════════════════════════════════════════════════════════════
let s5 = pres.addSlide();
s5.background = { color: WARM_GRAY };
s5.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: GREEN } });

s5.addText('Story Point Distribution by Epic', {
    x: 0.6, y: 0.2, w: 9, h: 0.6, fontSize: 32, fontFace: 'Arial Black', color: NAVY, margin: 0
});

s5.addChart(pres.charts.BAR, [{
    name: 'Story Points',
    labels: ['E3: Ingestion', 'E4: API', 'E2: Database', 'E1: Foundation', 'E5: Dashboard', 'E14: Testing', 'E6: List Pages', 'E13: Security', 'E8: Filters', 'E12: Admin', 'E7: Map', 'E9: Export', 'E11: Trends', 'E10: Status', 'E15: Docs'],
    values: [52, 42, 37, 34, 34, 34, 31, 29, 26, 23, 21, 21, 18, 18, 16]
}], {
    x: 0.4, y: 0.9, w: 9.2, h: 4.2,
    barDir: 'bar',
    chartColors: [GREEN],
    chartArea: { fill: { color: WHITE }, roundedCorners: true },
    catAxisLabelColor: DARK_TEXT,
    catAxisLabelFontSize: 9,
    valAxisLabelColor: LIGHT_TEXT,
    valAxisLabelFontSize: 8,
    valGridLine: { color: 'E2E8F0', size: 0.5 },
    catGridLine: { style: 'none' },
    showValue: true,
    dataLabelPosition: 'outEnd',
    dataLabelColor: NAVY,
    dataLabelFontSize: 9,
    showLegend: false
});

addFooter(s5, 5);

// ══════════════════════════════════════════════════════════════
// SLIDE 6: Sprint Roadmap
// ══════════════════════════════════════════════════════════════
let s6 = pres.addSlide();
s6.background = { color: WARM_GRAY };
s6.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: GREEN } });

s6.addText('Sprint Roadmap', {
    x: 0.6, y: 0.2, w: 9, h: 0.6, fontSize: 32, fontFace: 'Arial Black', color: NAVY, margin: 0
});

const sprints = [
    { num: '1', goal: 'Foundation', pts: 44, focus: 'Express, DB init, CI, Nav shell' },
    { num: '2', goal: 'Data Schema', pts: 43, focus: 'Tables, seed data, API client' },
    { num: '3', goal: 'Ingestion Core', pts: 45, focus: 'NOAA client, normalizer, UGC matching' },
    { num: '4', goal: 'Orchestration', pts: 41, focus: 'Orchestrator, scheduler, core APIs' },
    { num: '5', goal: 'APIs & Dashboard', pts: 43, focus: 'All APIs, impact cards, countdown' },
    { num: '6', goal: 'List Pages', pts: 46, focus: 'Advisories, offices, detail pages' },
    { num: '7', goal: 'Map & Filters', pts: 47, focus: 'Leaflet map, filter engine, presets' },
    { num: '8', goal: 'Export & Reports', pts: 42, focus: 'CSV, HTML reports, alerting' },
    { num: '9', goal: 'Trends & Polish', pts: 44, focus: 'History, metrics, responsive, a11y' },
    { num: '10', goal: 'Testing & Quality', pts: 44, focus: '162+ tests, deploy scripts, docs' }
];

// Two columns of 5 sprints
sprints.forEach((sp, i) => {
    const col = i < 5 ? 0 : 1;
    const row = i % 5;
    const x = col === 0 ? 0.5 : 5.15;
    const y = 0.95 + row * 0.88;

    s6.addShape(pres.shapes.RECTANGLE, { x, y, w: 4.4, h: 0.75, fill: { color: WHITE }, shadow: makeShadow() });

    // Sprint number circle
    s6.addShape(pres.shapes.OVAL, { x: x + 0.1, y: y + 0.12, w: 0.5, h: 0.5, fill: { color: NAVY } });
    s6.addText(sp.num, { x: x + 0.1, y: y + 0.12, w: 0.5, h: 0.5, fontSize: 14, fontFace: 'Arial', color: WHITE, bold: true, align: 'center', valign: 'middle' });

    // Sprint info
    s6.addText(sp.goal, { x: x + 0.75, y: y + 0.05, w: 2.8, h: 0.3, fontSize: 12, fontFace: 'Arial', color: NAVY, bold: true, margin: 0 });
    s6.addText(sp.focus, { x: x + 0.75, y: y + 0.35, w: 2.8, h: 0.3, fontSize: 9, fontFace: 'Arial', color: LIGHT_TEXT, margin: 0 });

    // Points badge
    s6.addShape(pres.shapes.RECTANGLE, { x: x + 3.7, y: y + 0.18, w: 0.6, h: 0.35, fill: { color: GREEN } });
    s6.addText(String(sp.pts), { x: x + 3.7, y: y + 0.18, w: 0.6, h: 0.35, fontSize: 12, fontFace: 'Arial', color: WHITE, bold: true, align: 'center', valign: 'middle' });
});

addFooter(s6, 6);

// ══════════════════════════════════════════════════════════════
// SLIDE 7: Velocity & Burndown
// ══════════════════════════════════════════════════════════════
let s7 = pres.addSlide();
s7.background = { color: WARM_GRAY };
s7.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: GREEN } });

s7.addText('Sprint Velocity', {
    x: 0.6, y: 0.2, w: 9, h: 0.6, fontSize: 32, fontFace: 'Arial Black', color: NAVY, margin: 0
});

s7.addChart(pres.charts.BAR, [{
    name: 'Story Points',
    labels: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'],
    values: [44, 43, 45, 41, 43, 46, 47, 42, 44, 44]
}], {
    x: 0.4, y: 0.9, w: 5.8, h: 3.8,
    barDir: 'col',
    chartColors: [GREEN],
    chartArea: { fill: { color: WHITE }, roundedCorners: true },
    catAxisLabelColor: DARK_TEXT,
    valAxisLabelColor: LIGHT_TEXT,
    valGridLine: { color: 'E2E8F0', size: 0.5 },
    catGridLine: { style: 'none' },
    showValue: true,
    dataLabelPosition: 'outEnd',
    dataLabelColor: NAVY,
    dataLabelFontSize: 10,
    showLegend: false,
    valAxisMinVal: 35,
    valAxisMaxVal: 50
});

// Side stats
const statsX = 6.6;
s7.addShape(pres.shapes.RECTANGLE, { x: statsX, y: 1.0, w: 3.0, h: 3.6, fill: { color: WHITE }, shadow: makeShadow() });

s7.addText('VELOCITY METRICS', { x: statsX + 0.15, y: 1.1, w: 2.7, h: 0.35, fontSize: 11, fontFace: 'Arial', color: GREEN, bold: true, charSpacing: 2 });

const vStats = [
    { label: 'Average', value: '43.9' },
    { label: 'Minimum', value: '41 (S4)' },
    { label: 'Maximum', value: '47 (S7)' },
    { label: 'Std Dev', value: '1.8' },
    { label: 'Consistency', value: '96%' }
];
vStats.forEach((vs, i) => {
    const y = 1.6 + i * 0.55;
    s7.addText(vs.value, { x: statsX + 0.3, y, w: 2.4, h: 0.3, fontSize: 20, fontFace: 'Arial', color: NAVY, bold: true, margin: 0 });
    s7.addText(vs.label, { x: statsX + 0.3, y: y + 0.28, w: 2.4, h: 0.2, fontSize: 10, fontFace: 'Arial', color: LIGHT_TEXT, margin: 0 });
});

addFooter(s7, 7);

// ══════════════════════════════════════════════════════════════
// SLIDE 8: Effort by Category (Pie)
// ══════════════════════════════════════════════════════════════
let s8 = pres.addSlide();
s8.background = { color: WARM_GRAY };
s8.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: GREEN } });

s8.addText('Effort Allocation by Category', {
    x: 0.6, y: 0.2, w: 9, h: 0.6, fontSize: 32, fontFace: 'Arial Black', color: NAVY, margin: 0
});

s8.addChart(pres.charts.DOUGHNUT, [{
    name: 'Category',
    labels: ['Backend (E2+E3+E4)', 'Frontend UI (E5+E6+E7)', 'Features (E8-E12)', 'Infrastructure (E1+E13+E14)', 'Docs (E15)'],
    values: [131, 86, 106, 97, 16]
}], {
    x: 0.3, y: 0.9, w: 5.5, h: 4.2,
    chartColors: [NAVY, GREEN, ORANGE, BLUE, LIGHT_TEXT],
    showPercent: true,
    showLegend: true,
    legendPos: 'b',
    legendFontSize: 10,
    dataLabelFontSize: 11,
    dataLabelColor: WHITE
});

// Side breakdown
s8.addShape(pres.shapes.RECTANGLE, { x: 6.1, y: 1.0, w: 3.5, h: 3.8, fill: { color: WHITE }, shadow: makeShadow() });
s8.addText('BREAKDOWN', { x: 6.3, y: 1.1, w: 3.1, h: 0.35, fontSize: 11, fontFace: 'Arial', color: GREEN, bold: true, charSpacing: 2 });

const categories = [
    { name: 'Backend Core', pts: '131 pts (30%)', color: NAVY, desc: 'Database, ingestion, APIs' },
    { name: 'Frontend UI', pts: '86 pts (20%)', color: GREEN, desc: 'Dashboard, pages, map' },
    { name: 'Features', pts: '106 pts (24%)', color: ORANGE, desc: 'Filters, export, admin, status' },
    { name: 'Infrastructure', pts: '97 pts (22%)', color: BLUE, desc: 'Foundation, security, testing' },
    { name: 'Documentation', pts: '16 pts (4%)', color: LIGHT_TEXT, desc: 'Docs, legal, polish' }
];
categories.forEach((c, i) => {
    const y = 1.55 + i * 0.62;
    s8.addShape(pres.shapes.RECTANGLE, { x: 6.3, y: y + 0.02, w: 0.25, h: 0.25, fill: { color: c.color } });
    s8.addText(c.name, { x: 6.65, y, w: 2.7, h: 0.25, fontSize: 11, fontFace: 'Arial', color: NAVY, bold: true, margin: 0 });
    s8.addText(c.pts, { x: 6.65, y: y + 0.22, w: 2.7, h: 0.2, fontSize: 9, fontFace: 'Arial', color: MED_TEXT, margin: 0 });
});

addFooter(s8, 8);

// ══════════════════════════════════════════════════════════════
// SLIDE 9: Definition of Done
// ══════════════════════════════════════════════════════════════
let s9 = pres.addSlide();
s9.background = { color: WARM_GRAY };
s9.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: GREEN } });

s9.addText('Definition of Done', {
    x: 0.6, y: 0.2, w: 9, h: 0.6, fontSize: 32, fontFace: 'Arial Black', color: NAVY, margin: 0
});

const dodItems = [
    'Code implemented following project standards (ESLint, Prettier)',
    'Unit tests passing with coverage thresholds (58% branches, 72% functions, 65% lines)',
    'Integration tests written for API endpoints (supertest)',
    'Code reviewed and approved by at least one team member',
    'Works in Chrome, Firefox, Safari, and Edge',
    'Responsive design verified at mobile, tablet, and desktop',
    'Accessibility verified: ARIA labels, keyboard nav, focus management',
    'Documentation updated (API docs, architecture, frontend guide)',
    'Pre-commit hooks and CI pipeline passing',
    'Feature demonstrated to Product Owner'
];

// Two columns
dodItems.forEach((item, i) => {
    const col = i < 5 ? 0 : 1;
    const row = i % 5;
    const x = col === 0 ? 0.5 : 5.0;
    const y = 0.95 + row * 0.82;

    s9.addShape(pres.shapes.RECTANGLE, { x, y, w: 4.6, h: 0.7, fill: { color: WHITE }, shadow: makeShadow() });
    s9.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.06, h: 0.7, fill: { color: GREEN } });

    // Number
    s9.addText(String(i + 1), { x: x + 0.15, y, w: 0.4, h: 0.7, fontSize: 16, fontFace: 'Arial', color: GREEN, bold: true, valign: 'middle', align: 'center' });

    s9.addText(item, { x: x + 0.55, y, w: 3.9, h: 0.7, fontSize: 10, fontFace: 'Arial', color: DARK_TEXT, valign: 'middle', margin: [0, 8, 0, 0] });
});

addFooter(s9, 9);

// ══════════════════════════════════════════════════════════════
// SLIDE 10: Key Takeaways
// ══════════════════════════════════════════════════════════════
let s10 = pres.addSlide();
s10.background = { color: NAVY };
s10.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: GREEN } });

s10.addText('Key Takeaways', {
    x: 0.6, y: 0.3, w: 9, h: 0.7, fontSize: 36, fontFace: 'Arial Black', color: WHITE, margin: 0
});

const takeaways = [
    { title: 'Vibe-coded in weeks, formally ~5 months', desc: 'AI-assisted development compressed what would take a 5-person team 20 weeks into a fraction of the time and cost.' },
    { title: 'Ingestion pipeline is the complexity center', desc: 'At 52 story points (12% of total), the NOAA data pipeline with UGC matching, VTEC dedup, and circuit breakers is the hardest subsystem.' },
    { title: 'Remarkably consistent velocity target', desc: 'All 10 sprints fall within 41-47 points (std dev 1.8), indicating well-sized stories and balanced workload distribution.' },
    { title: 'Production-grade non-functional requirements', desc: 'Security headers, timing-safe auth, rate limiting, graceful shutdown, 3-tier caching, 162+ tests, CI/CD pipeline.' }
];

takeaways.forEach((t, i) => {
    const y = 1.2 + i * 1.05;
    s10.addShape(pres.shapes.RECTANGLE, { x: 0.6, y, w: 8.8, h: 0.85, fill: { color: LIGHT_NAVY } });
    s10.addShape(pres.shapes.RECTANGLE, { x: 0.6, y, w: 0.07, h: 0.85, fill: { color: GREEN } });
    s10.addText(t.title, { x: 0.85, y: y + 0.05, w: 8.3, h: 0.3, fontSize: 14, fontFace: 'Arial', color: GREEN, bold: true, margin: 0 });
    s10.addText(t.desc, { x: 0.85, y: y + 0.38, w: 8.3, h: 0.4, fontSize: 11, fontFace: 'Arial', color: '8BA0BE', margin: 0 });
});

s10.addText('Storm Scout  |  Retrospective Agile Breakdown  |  March 2026', {
    x: 0.5, y: 5.2, w: 9, h: 0.35, fontSize: 9, color: '6B7D95', fontFace: 'Arial'
});

// ═══════════════════════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════════════════════
const outputPath = path.join(__dirname, 'Storm Scout - Agile Breakdown.pptx');
pres.writeFile({ fileName: outputPath }).then(() => {
    const stats = fs.statSync(outputPath);
    console.log(`Presentation created: ${outputPath}`);
    console.log(`Size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`Slides: 10`);
}).catch(console.error);
