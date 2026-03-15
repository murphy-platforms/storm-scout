/** @jest-environment jsdom */

/**
 * Unit tests for frontend/js/utils.js
 * Pure utility functions — no API or backend dependencies
 */

const {
  escapeHtml, raw, html,
  getSeverityBadge, getStatusBadge,
  getActionBadge, getActionBadgeWithTime, VTEC_ACTION_CONFIG,
  formatDate, cToF, timeAgo, isStale,
  truncate, debounce,
  renderEmptyHtml, renderErrorHtml, renderTemperatureHTML,
  formatLocalTime
} = require('../../../../frontend/js/utils');

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe('escapeHtml', () => {
  test('escapes all five HTML special characters', () => {
    expect(escapeHtml('&<>"\''))
      .toBe('&amp;&lt;&gt;&quot;&#039;');
  });

  test('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  test('converts numbers to string', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  test('handles nested HTML tags', () => {
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  test('passes through plain text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

// ---------------------------------------------------------------------------
// raw + html tagged template
// ---------------------------------------------------------------------------
describe('html tagged template', () => {
  test('auto-escapes interpolated values', () => {
    const userInput = '<b>bold</b>';
    const result = html`<div>${userInput}</div>`;
    expect(result).toBe('<div>&lt;b&gt;bold&lt;/b&gt;</div>');
  });

  test('raw() bypasses escaping', () => {
    const trusted = '<span class="badge">OK</span>';
    const result = html`<div>${raw(trusted)}</div>`;
    expect(result).toBe(`<div>${trusted}</div>`);
  });

  test('mixes escaped and raw content', () => {
    const name = '<evil>';
    const badge = '<span>badge</span>';
    const result = html`<p>${name} ${raw(badge)}</p>`;
    expect(result).toBe('<p>&lt;evil&gt; <span>badge</span></p>');
  });

  test('handles null interpolation', () => {
    const result = html`<div>${null}</div>`;
    expect(result).toBe('<div></div>');
  });

  test('handles empty template', () => {
    const result = html`<div></div>`;
    expect(result).toBe('<div></div>');
  });
});

// ---------------------------------------------------------------------------
// getSeverityBadge / getStatusBadge
// ---------------------------------------------------------------------------
describe('getSeverityBadge', () => {
  test('returns correct class for each severity', () => {
    expect(getSeverityBadge('Extreme')).toBe('severity-extreme');
    expect(getSeverityBadge('Severe')).toBe('severity-severe');
    expect(getSeverityBadge('Moderate')).toBe('severity-moderate');
    expect(getSeverityBadge('Minor')).toBe('severity-minor');
    expect(getSeverityBadge('Unknown')).toBe('bg-light text-dark');
  });

  test('returns fallback for unrecognised severity', () => {
    expect(getSeverityBadge('MadeUp')).toBe('bg-light text-dark');
  });
});

describe('getStatusBadge', () => {
  test('returns correct class for each status', () => {
    expect(getStatusBadge('Closed')).toBe('bg-danger');
    expect(getStatusBadge('At Risk')).toBe('bg-warning text-dark');
    expect(getStatusBadge('Open')).toBe('bg-success');
    expect(getStatusBadge('active')).toBe('bg-success');
    expect(getStatusBadge('expired')).toBe('bg-secondary');
  });

  test('returns fallback for unknown status', () => {
    expect(getStatusBadge('xyz')).toBe('bg-secondary');
  });
});

// ---------------------------------------------------------------------------
// getActionBadge / getActionBadgeWithTime
// ---------------------------------------------------------------------------
describe('getActionBadge', () => {
  test('returns badge for each known VTEC action', () => {
    for (const code of Object.keys(VTEC_ACTION_CONFIG)) {
      const badge = getActionBadge(code);
      expect(badge).toContain('badge');
      expect(badge).toContain(VTEC_ACTION_CONFIG[code].label);
    }
  });

  test('returns dash badge for null action', () => {
    const badge = getActionBadge(null);
    expect(badge).toContain('-');
    expect(badge).toContain('No VTEC action code');
  });

  test('returns generic badge for unknown action code', () => {
    const badge = getActionBadge('ZZZ');
    expect(badge).toContain('ZZZ');
    expect(badge).toContain('badge');
  });
});

describe('getActionBadgeWithTime', () => {
  test('uses animated class for recent NEW alerts', () => {
    const adv = { vtec_action: 'NEW', last_updated: new Date().toISOString() };
    const badge = getActionBadgeWithTime(adv);
    expect(badge).toContain('action-badge-new');
  });

  test('uses bg-success class for old NEW alerts (>2hr)', () => {
    const old = new Date(Date.now() - 3 * 3600000).toISOString();
    const adv = { vtec_action: 'NEW', last_updated: old };
    const badge = getActionBadgeWithTime(adv);
    expect(badge).toContain('bg-success');
  });

  test('returns dash badge when vtec_action is null', () => {
    const badge = getActionBadgeWithTime({ vtec_action: null });
    expect(badge).toContain('-');
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  test('formats valid ISO date', () => {
    const result = formatDate('2026-03-15T12:00:00Z');
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
  });

  test('returns N/A for null', () => {
    expect(formatDate(null)).toBe('N/A');
  });

  test('returns original string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

// ---------------------------------------------------------------------------
// cToF
// ---------------------------------------------------------------------------
describe('cToF', () => {
  test('converts 0°C to 32°F', () => {
    expect(cToF(0)).toBe(32);
  });

  test('converts 100°C to 212°F', () => {
    expect(cToF(100)).toBe(212);
  });

  test('converts negative temperatures', () => {
    expect(cToF(-40)).toBe(-40); // -40 is the crossover point
  });

  test('returns null for null input', () => {
    expect(cToF(null)).toBeNull();
  });

  test('handles string numeric input', () => {
    expect(cToF('25')).toBe(77);
  });
});

// ---------------------------------------------------------------------------
// timeAgo
// ---------------------------------------------------------------------------
describe('timeAgo', () => {
  test('returns empty string for null', () => {
    expect(timeAgo(null)).toBe('');
  });

  test('returns "just now" for current time', () => {
    expect(timeAgo(new Date().toISOString())).toBe('just now');
  });

  test('returns minutes for recent times', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(timeAgo(fiveMinAgo)).toBe('5 min ago');
  });

  test('returns hours for older times', () => {
    const threeHrsAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(timeAgo(threeHrsAgo)).toBe('3 hr ago');
  });

  test('returns days for very old times', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600000).toISOString();
    expect(timeAgo(twoDaysAgo)).toBe('2 day ago');
  });
});

// ---------------------------------------------------------------------------
// isStale
// ---------------------------------------------------------------------------
describe('isStale', () => {
  test('returns true for null', () => {
    expect(isStale(null)).toBe(true);
  });

  test('returns false for recent observation', () => {
    const recent = new Date(Date.now() - 30 * 60000).toISOString();
    expect(isStale(recent)).toBe(false);
  });

  test('returns true for observation older than 90 minutes', () => {
    const old = new Date(Date.now() - 100 * 60000).toISOString();
    expect(isStale(old)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------
describe('truncate', () => {
  test('returns string unchanged if shorter than max', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  test('truncates and adds ellipsis if over max', () => {
    expect(truncate('hello world', 5)).toBe('hello…');
  });

  test('returns empty string for null', () => {
    expect(truncate(null, 10)).toBe('');
  });

  test('returns empty string for empty input', () => {
    expect(truncate('', 10)).toBe('');
  });

  test('handles exact length (no truncation)', () => {
    expect(truncate('12345', 5)).toBe('12345');
  });
});

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------
describe('debounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('fires after wait period', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('resets timer on subsequent calls', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);

    debounced();
    jest.advanceTimersByTime(200);
    debounced(); // reset
    jest.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// renderEmptyHtml / renderErrorHtml
// ---------------------------------------------------------------------------
describe('renderEmptyHtml', () => {
  test('includes icon and escaped title', () => {
    const result = renderEmptyHtml('cloud-sun', 'No data <found>');
    expect(result).toContain('bi-cloud-sun');
    expect(result).toContain('No data &lt;found&gt;');
    expect(result).not.toContain('<found>');
  });

  test('includes subtitle when provided', () => {
    const result = renderEmptyHtml('info', 'Title', 'Sub text');
    expect(result).toContain('Sub text');
  });

  test('omits subtitle when not provided', () => {
    const result = renderEmptyHtml('info', 'Title');
    expect(result).not.toContain('<p class="mb-0');
  });
});

describe('renderErrorHtml', () => {
  test('includes escaped error message', () => {
    const result = renderErrorHtml('Error: <script>');
    expect(result).toContain('alert-danger');
    expect(result).toContain('Error: &lt;script&gt;');
  });
});

// ---------------------------------------------------------------------------
// renderTemperatureHTML
// ---------------------------------------------------------------------------
describe('renderTemperatureHTML', () => {
  test('returns empty string for null observation', () => {
    expect(renderTemperatureHTML(null)).toBe('');
  });

  test('returns empty string for null temperature', () => {
    expect(renderTemperatureHTML({ temperature_c: null })).toBe('');
  });

  test('renders temperature for fresh observation', () => {
    const obs = {
      temperature_c: 25,
      observed_at: new Date().toISOString(),
      station_id: 'KJFK'
    };
    const result = renderTemperatureHTML(obs);
    expect(result).toContain('77°F');
    expect(result).toContain('25°C');
    expect(result).not.toContain('OFFLINE');
  });

  test('shows OFFLINE for stale observation', () => {
    const obs = {
      temperature_c: 10,
      observed_at: new Date(Date.now() - 120 * 60000).toISOString(),
      station_id: 'KORD'
    };
    const result = renderTemperatureHTML(obs);
    expect(result).toContain('OFFLINE');
    expect(result).toContain('KORD');
  });
});

// ---------------------------------------------------------------------------
// formatLocalTime
// ---------------------------------------------------------------------------
describe('formatLocalTime', () => {
  test('returns "Never" for null', () => {
    expect(formatLocalTime(null)).toBe('Never');
  });

  test('formats valid ISO string', () => {
    const result = formatLocalTime('2026-03-15T12:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('Never');
  });
});
