/**
 * Storm Scout Service Worker
 * Enables offline functionality and caching for PWA
 */

const CACHE_NAME = 'storm-scout-v1';
const RUNTIME_CACHE = 'storm-scout-runtime';

// Assets to cache immediately
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/advisories.html',
    '/sites.html',
    '/map.html',
    '/site-detail.html',
    '/notices.html',
    '/filters.html',
    '/sources.html',
    '/css/style.css',
    '/js/api.js',
    '/js/utils.js',
    '/js/aggregation.js',
    '/js/trends.js',
    '/js/export.js',
    '/js/alert-filters.js',
    '/js/update-banner.js',
    '/manifest.json'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
    console.log('[SW] Install event');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Precaching assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activate event');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - network first, then cache fallback
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip cross-origin requests
    if (url.origin !== location.origin) {
        return;
    }
    
    // API requests: Network first, cache fallback
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstStrategy(request));
        return;
    }
    
    // Static assets: Cache first, network fallback
    event.respondWith(cacheFirstStrategy(request));
});

/**
 * Network first strategy for API calls
 * Tries network, falls back to cache if offline
 */
async function networkFirstStrategy(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    
    try {
        // Try network first
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // Network failed, try cache
        console.log('[SW] Network failed, using cache:', request.url);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return offline page for HTML requests
        if (request.headers.get('accept').includes('text/html')) {
            return new Response(getOfflinePage(), {
                headers: { 'Content-Type': 'text/html' }
            });
        }
        
        // Return offline JSON for API requests
        return new Response(JSON.stringify({
            success: false,
            error: 'Offline - no cached data available',
            offline: true
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Cache first strategy for static assets
 * Uses cache, updates in background
 */
async function cacheFirstStrategy(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        // Return cached response and update cache in background
        fetch(request).then((response) => {
            if (response && response.status === 200) {
                cache.put(request, response);
            }
        });
        
        return cachedResponse;
    }
    
    // Not in cache, fetch from network
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.error('[SW] Fetch failed:', error);
        
        // Return offline page for HTML requests
        if (request.headers.get('accept').includes('text/html')) {
            return new Response(getOfflinePage(), {
                headers: { 'Content-Type': 'text/html' }
            });
        }
        
        throw error;
    }
}

/**
 * Generate offline fallback page
 */
function getOfflinePage() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Storm Scout - Offline</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            padding: 20px;
        }
        .offline-container {
            max-width: 500px;
        }
        h1 {
            font-size: 3rem;
            margin: 0 0 1rem 0;
        }
        p {
            font-size: 1.2rem;
            margin: 0 0 2rem 0;
            opacity: 0.9;
        }
        button {
            background: white;
            color: #667eea;
            border: none;
            padding: 12px 30px;
            font-size: 1rem;
            border-radius: 25px;
            cursor: pointer;
            font-weight: bold;
        }
        button:hover {
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="offline-container">
        <h1>⚡ Offline</h1>
        <p>You're currently offline. Storm Scout needs an internet connection to fetch the latest weather data.</p>
        <p>Some previously viewed pages may still be available from cache.</p>
        <button onclick="window.location.reload()">Try Again</button>
    </div>
</body>
</html>
    `;
}

// Handle messages from clients
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((name) => caches.delete(name))
                );
            })
        );
    }
});
