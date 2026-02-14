/**
 * PWA Registration and Installation
 * Handles service worker registration and install prompt
 */

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('[PWA] Service Worker registered:', registration.scope);
                
                // Check for updates periodically
                setInterval(() => {
                    registration.update();
                }, 60 * 60 * 1000); // Check every hour
            })
            .catch((error) => {
                console.error('[PWA] Service Worker registration failed:', error);
            });
    });
}

// Handle install prompt
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show install button if it exists
    const installButton = document.getElementById('pwa-install-btn');
    if (installButton) {
        installButton.style.display = 'block';
    }
});

// Install button click handler
function installPWA() {
    if (!deferredPrompt) {
        console.log('[PWA] Install prompt not available');
        return;
    }
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('[PWA] User accepted the install prompt');
        } else {
            console.log('[PWA] User dismissed the install prompt');
        }
        deferredPrompt = null;
        
        // Hide install button
        const installButton = document.getElementById('pwa-install-btn');
        if (installButton) {
            installButton.style.display = 'none';
        }
    });
}

// Track if app is running as PWA
function isRunningAsPWA() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
}

// Show PWA banner if not installed
window.addEventListener('load', () => {
    if (!isRunningAsPWA() && deferredPrompt) {
        // Could show a custom install banner here
        console.log('[PWA] App can be installed');
    }
    
    if (isRunningAsPWA()) {
        console.log('[PWA] Running as installed app');
        // Hide browser-specific UI elements if needed
        document.body.classList.add('pwa-installed');
    }
});

// Handle offline/online status
window.addEventListener('online', () => {
    console.log('[PWA] Back online');
    document.body.classList.remove('offline');
    
    // Show notification
    showConnectivityNotification('You are back online', 'success');
});

window.addEventListener('offline', () => {
    console.log('[PWA] Went offline');
    document.body.classList.add('offline');
    
    // Show notification
    showConnectivityNotification('You are offline. Some features may be unavailable.', 'warning');
});

/**
 * Show connectivity notification
 */
function showConnectivityNotification(message, type = 'info') {
    // Check if there's a notification container
    let container = document.getElementById('connectivity-notification');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'connectivity-notification';
        container.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            z-index: 9999;
            max-width: 300px;
        `;
        document.body.appendChild(container);
    }
    
    const alertClass = type === 'success' ? 'alert-success' : 
                      type === 'warning' ? 'alert-warning' : 'alert-info';
    
    container.innerHTML = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const alert = container.querySelector('.alert');
        if (alert) {
            alert.classList.remove('show');
            setTimeout(() => {
                container.innerHTML = '';
            }, 150);
        }
    }, 5000);
}

// Export functions for global use
window.PWA = {
    install: installPWA,
    isInstalled: isRunningAsPWA,
    canInstall: () => deferredPrompt !== null
};
