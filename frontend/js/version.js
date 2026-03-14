/**
 * Storm Scout Version Display
 * Populates the #appVersion footer element on all pages.
 * Requires api.js to be loaded first (uses API.getVersion()).
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */
document.addEventListener('DOMContentLoaded', async () => {
    const el = document.getElementById('appVersion');
    if (!el) return;

    try {
        const info = await API.getVersion();
        if (!info || !info.version) return;

        // Format release date as "Mon DD, YYYY"
        let dateStr = '';
        if (info.released) {
            const d = new Date(info.released + 'T00:00:00');
            dateStr = d.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        }

        el.textContent = dateStr ? `v${info.version} · ${dateStr}` : `v${info.version}`;
    } catch (e) {
        // Silently fail — version display is non-critical
    }
});
