        let allNotices = [];

        async function loadNotices() {
            try {
                const data = await API.getActiveNotices();
                allNotices = data;
                renderNotices(data);
            } catch (error) {
                document.getElementById('noticesContainer').innerHTML =
                    renderErrorHtml('Failed to load notices');
            }
        }

        function renderNotices(notices) {
            const container = document.getElementById('noticesContainer');
            if (notices.length === 0) {
                container.innerHTML = renderEmptyHtml('bell-slash', 'No active notices', 'No government or local notices are currently in effect.');
                return;
            }

            container.innerHTML = notices.map(notice => html`
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
                                        <i class="bi bi-calendar"></i> Effective: ${raw(formatDate(notice.effective_time))}
                                    </small>
                                </div>
                                <div class="col-md-6">
                                    <small class="text-muted">
                                        <i class="bi bi-geo"></i> Affected States: ${notice.affected_states || 'N/A'}
                                    </small>
                                </div>
                            </div>
                            ${raw(notice.source_url ? `<a href="${escapeHtml(notice.source_url)}" target="_blank" class="btn btn-sm btn-outline-primary mt-2">View Source <i class="bi bi-box-arrow-up-right"></i></a>` : '')}
                        </div>
                    </div>
                </div>
            `).join('');
        }

        function filterNotices() {
            const jurisdiction = document.getElementById('jurisdictionFilter').value;

            const filtered = allNotices.filter(notice => {
                if (jurisdiction && notice.jurisdiction_type !== jurisdiction) return false;
                return true;
            });

            renderNotices(filtered);
        }

        document.getElementById('jurisdictionFilter').addEventListener('change', filterNotices);

        loadNotices();
