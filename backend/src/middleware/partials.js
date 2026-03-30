/**
 * Server-side HTML partial injection middleware.
 *
 * Replaces <!-- include:filename.html --> markers in HTML files with the
 * contents of frontend/partials/filename.html. Handles nav active state
 * by adding the "active" class to the link matching the requested page.
 *
 * Partials are cached in memory; in development mode the cache is bypassed
 * so edits are reflected immediately on reload.
 */

const fs = require('fs');
const path = require('path');

const INCLUDE_RE = /<!--\s*include:(\S+)\s*-->/g;

/**
 * Create the partial-injection middleware.
 * @param {string} frontendPath - Absolute path to the frontend/ directory
 * @param {{ isDev?: boolean }} [opts]
 */
function createPartialsMiddleware(frontendPath, opts = {}) {
    const partialsDir = path.join(frontendPath, 'partials');
    const cache = new Map();

    function readPartial(filename) {
        if (!opts.isDev && cache.has(filename)) return cache.get(filename);

        const filePath = path.join(partialsDir, filename);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            cache.set(filename, content);
            return content;
        } catch {
            console.warn(`[partials] Could not read partial: ${filename}`);
            return `<!-- partial not found: ${filename} -->`;
        }
    }

    /**
     * Given the nav partial HTML and the requested page filename (e.g. "offices"),
     * add class="active" to the matching nav link.
     */
    function activateNavLink(html, pageName) {
        // office-detail page highlights the "offices" nav link
        const navKey = pageName === 'office-detail' ? 'offices' : pageName;
        return html
            .replace(new RegExp(`data-nav="${navKey}"`), `data-nav="${navKey}" aria-current="page"`)
            .replace(new RegExp(`(<a class="nav-link)(.*?data-nav="${navKey}")`), `$1 active$2`);
    }

    return function partialsMiddleware(req, res, next) {
        // Only intercept .html requests (or bare paths that resolve to .html)
        const urlPath = req.path;
        if (!urlPath.endsWith('.html') && urlPath !== '/' && !urlPath.endsWith('/')) {
            return next();
        }

        // Determine the HTML file to read
        let htmlFile;
        if (urlPath === '/' || urlPath.endsWith('/')) {
            htmlFile = path.join(frontendPath, urlPath, 'index.html');
        } else {
            htmlFile = path.join(frontendPath, urlPath);
        }

        // Only process if the file exists
        if (!fs.existsSync(htmlFile)) return next();

        let html = fs.readFileSync(htmlFile, 'utf8');

        // Determine active page name from the URL (e.g. "/offices.html" → "offices")
        const basename = path.basename(htmlFile, '.html'); // "index", "offices", etc.

        // Replace all <!-- include:filename.html --> markers
        html = html.replace(INCLUDE_RE, (match, filename) => {
            let partial = readPartial(filename);

            // If this is the nav partial, activate the correct link
            if (filename === 'nav.html') {
                partial = activateNavLink(partial, basename);
            }

            return partial;
        });

        // Set appropriate headers for HTML
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(html);
    };
}

module.exports = { createPartialsMiddleware };
