/**
 * page-notices.js
 * Notices page — displays active government and operational notices.
 *
 * Key responsibilities:
 *   - Fetches all currently active notices from the API
 *   - Renders each notice as a card with jurisdiction, type, description,
 *     effective date, affected states, and an optional source link
 *   - Supports filtering by jurisdiction type (Federal, State, Local)
 *
 * State variables:
 *   allNotices - Full list of active notices; filtered client-side on change
 *
 * External dependencies (globals):
 *   API, html, raw, escapeHtml, formatDate, renderEmptyHtml, renderErrorHtml
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

let allNotices = [];

/**
 * Fetch all active notices from the API and perform the initial render.
 * On error, an inline error message is displayed in the container element.
 *
 * @returns {Promise<void>}
 */
async function loadNotices() {
    try {
        const data = await API.getActiveNotices();
        allNotices = data;
        renderNotices(data);
    } catch (error) {
        document.getElementById('noticesContainer').innerHTML = renderErrorHtml('Failed to load notices');
    }
}

/**
 * Render the provided notices list into the notices container.
 * Shows an empty-state placeholder when the list is empty.
 *
 * @param {Array<Object>} notices - Notice records to render; each record
 *   has at minimum: title, jurisdiction_type, jurisdiction, notice_type,
 *   description, effective_time, affected_states, and optionally source_url
 * @returns {void}
 */
function renderNotices(notices) {
    const container = document.getElementById('noticesContainer');
    if (notices.length === 0) {
        container.innerHTML = renderEmptyHtml(
            'bell-slash',
            'No active notices',
            'No government or local notices are currently in effect.'
        );
        return;
    }

    container.innerHTML = notices
        .map(
            (notice) => html`
                <div class="col-12 mb-3">
                    <div class="card">
                        <div class="card-header card-header-notice">
                            <h5 class="mb-0">
                                <i class="bi bi-megaphone"></i> ${notice.title}
                                <span class="badge bg-secondary float-end">${notice.jurisdiction_type}</span>
                            </h5>
                        </div>
                        <div class="card-body">
                            <h6 class="card-subtitle mb-2 text-muted">
                                ${notice.jurisdiction} | ${notice.notice_type}
                            </h6>
                            <p class="card-text">${notice.description || 'No description available'}</p>
                            <div class="row">
                                <div class="col-md-6">
                                    <small class="text-muted">
                                        <i class="bi bi-calendar"></i> Effective:
                                        ${raw(formatDate(notice.effective_time))}
                                    </small>
                                </div>
                                <div class="col-md-6">
                                    <small class="text-muted">
                                        <i class="bi bi-geo"></i> Affected States: ${notice.affected_states || 'N/A'}
                                    </small>
                                </div>
                            </div>
                            ${raw(
                                notice.source_url
                                    ? `<a href="${escapeHtml(notice.source_url)}" target="_blank" class="btn btn-sm btn-outline-primary mt-2">View Source <i class="bi bi-box-arrow-up-right"></i></a>`
                                    : ''
                            )}
                        </div>
                    </div>
                </div>
            `
        )
        .join('');
}

/**
 * Filter the cached notice list by jurisdiction type and re-render.
 * Filtering is performed client-side against the full allNotices array
 * so no additional API call is needed when the dropdown changes.
 *
 * @returns {void}
 */
function filterNotices() {
    const jurisdiction = document.getElementById('jurisdictionFilter').value;

    const filtered = allNotices.filter((notice) => {
        if (jurisdiction && notice.jurisdiction_type !== jurisdiction) return false;
        return true;
    });

    renderNotices(filtered);
}

document.getElementById('jurisdictionFilter').addEventListener('change', filterNotices);

loadNotices();
