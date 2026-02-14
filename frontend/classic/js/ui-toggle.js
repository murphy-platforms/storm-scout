/**
 * UI Version Toggle System
 * Allows users to switch between Beta (new) and Classic (legacy) UI
 */

const UIToggle = {
    STORAGE_KEY: 'stormscout_ui_version',
    VERSIONS: {
        BETA: 'beta',
        CLASSIC: 'classic'
    },
    
    /**
     * Get current UI version preference
     */
    getVersion() {
        return localStorage.getItem(this.STORAGE_KEY) || this.VERSIONS.BETA;
    },
    
    /**
     * Set UI version preference
     */
    setVersion(version) {
        localStorage.setItem(this.STORAGE_KEY, version);
    },
    
    /**
     * Check if currently on Beta UI
     */
    isBeta() {
        return !window.location.pathname.includes('/classic/');
    },
    
    /**
     * Check if currently on Classic UI
     */
    isClassic() {
        return window.location.pathname.includes('/classic/');
    },
    
    /**
     * Get equivalent page URL for the other version
     */
    getToggleUrl() {
        const currentPath = window.location.pathname;
        const currentPage = currentPath.split('/').pop() || 'index.html';
        
        if (this.isClassic()) {
            // Switch to Beta - go up one directory
            return currentPath.replace('/classic/', '/').replace('/classic', '/');
        } else {
            // Switch to Classic - add classic directory
            const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
            return `${basePath}classic/${currentPage}`;
        }
    },
    
    /**
     * Toggle between Beta and Classic UI
     */
    toggle() {
        const newVersion = this.isBeta() ? this.VERSIONS.CLASSIC : this.VERSIONS.BETA;
        this.setVersion(newVersion);
        window.location.href = this.getToggleUrl();
    },
    
    /**
     * Create and inject the toggle button
     */
    createToggleButton() {
        const button = document.createElement('button');
        button.id = 'ui-version-toggle';
        button.className = 'ui-toggle-btn';
        button.setAttribute('aria-label', this.isBeta() ? 'Switch to Classic UI' : 'Try Beta UI');
        
        if (this.isBeta()) {
            button.innerHTML = `
                <span class="toggle-icon">↩️</span>
                <span class="toggle-text">Classic UI</span>
            `;
            button.classList.add('toggle-to-classic');
        } else {
            button.innerHTML = `
                <span class="toggle-icon">✨</span>
                <span class="toggle-text">Try Beta</span>
            `;
            button.classList.add('toggle-to-beta');
        }
        
        button.addEventListener('click', () => this.toggle());
        
        document.body.appendChild(button);
    },
    
    /**
     * Create Beta banner (shown only on Beta UI)
     */
    createBetaBanner() {
        if (!this.isBeta()) return;
        
        const banner = document.createElement('div');
        banner.id = 'beta-banner';
        banner.className = 'beta-banner';
        banner.innerHTML = `
            <div class="beta-banner-content">
                <span class="beta-badge">BETA</span>
                <span class="beta-message">You're previewing the new Storm Scout interface</span>
                <button class="beta-feedback-btn" onclick="UIToggle.openFeedback()">
                    Send Feedback
                </button>
                <button class="beta-dismiss-btn" onclick="UIToggle.dismissBanner()" aria-label="Dismiss banner">
                    ✕
                </button>
            </div>
        `;
        
        // Check if banner was dismissed this session
        if (!sessionStorage.getItem('beta_banner_dismissed')) {
            document.body.insertBefore(banner, document.body.firstChild);
            document.body.classList.add('has-beta-banner');
        }
    },
    
    /**
     * Dismiss the beta banner for this session
     */
    dismissBanner() {
        const banner = document.getElementById('beta-banner');
        if (banner) {
            banner.classList.add('banner-hiding');
            setTimeout(() => {
                banner.remove();
                document.body.classList.remove('has-beta-banner');
            }, 300);
        }
        sessionStorage.setItem('beta_banner_dismissed', 'true');
    },
    
    /**
     * Open feedback form/modal
     */
    openFeedback() {
        // Could open a modal or redirect to a feedback form
        const feedbackUrl = 'mailto:feedback@your-domain.example.com?subject=Storm Scout Beta Feedback';
        window.location.href = feedbackUrl;
    },
    
    /**
     * Inject required styles for toggle components
     */
    injectStyles() {
        const styles = document.createElement('style');
        styles.id = 'ui-toggle-styles';
        styles.textContent = `
            /* UI Toggle Button */
            .ui-toggle-btn {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 9999;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 20px;
                border: none;
                border-radius: 100px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            }
            
            .ui-toggle-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
            }
            
            .ui-toggle-btn:active {
                transform: translateY(0);
            }
            
            .ui-toggle-btn .toggle-icon {
                font-size: 16px;
            }
            
            /* Beta UI: Button to switch to Classic */
            .toggle-to-classic {
                background: rgba(30, 41, 59, 0.95);
                color: #94a3b8;
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
            }
            
            .toggle-to-classic:hover {
                background: rgba(51, 65, 85, 0.95);
                color: #e2e8f0;
            }
            
            /* Classic UI: Button to try Beta */
            .toggle-to-beta {
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                color: white;
            }
            
            .toggle-to-beta:hover {
                background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            }
            
            /* Beta Banner */
            .beta-banner {
                background: linear-gradient(135deg, #1e3a5f 0%, #1e293b 100%);
                border-bottom: 1px solid rgba(59, 130, 246, 0.3);
                padding: 10px 20px;
                position: sticky;
                top: 0;
                z-index: 1000;
                animation: slideDown 0.3s ease;
            }
            
            @keyframes slideDown {
                from {
                    transform: translateY(-100%);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
            
            .beta-banner.banner-hiding {
                animation: slideUp 0.3s ease forwards;
            }
            
            @keyframes slideUp {
                from {
                    transform: translateY(0);
                    opacity: 1;
                }
                to {
                    transform: translateY(-100%);
                    opacity: 0;
                }
            }
            
            .beta-banner-content {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                max-width: 1200px;
                margin: 0 auto;
                flex-wrap: wrap;
            }
            
            .beta-badge {
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                color: white;
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.05em;
            }
            
            .beta-message {
                color: #94a3b8;
                font-size: 14px;
            }
            
            .beta-feedback-btn {
                background: rgba(59, 130, 246, 0.2);
                color: #60a5fa;
                border: 1px solid rgba(59, 130, 246, 0.3);
                padding: 6px 14px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .beta-feedback-btn:hover {
                background: rgba(59, 130, 246, 0.3);
                border-color: rgba(59, 130, 246, 0.5);
            }
            
            .beta-dismiss-btn {
                background: none;
                border: none;
                color: #64748b;
                font-size: 18px;
                cursor: pointer;
                padding: 4px 8px;
                margin-left: 8px;
                transition: color 0.2s ease;
            }
            
            .beta-dismiss-btn:hover {
                color: #94a3b8;
            }
            
            /* Adjust body when banner is present */
            .has-beta-banner .top-bar {
                top: 0;
            }
            
            /* Mobile responsive */
            @media (max-width: 768px) {
                .ui-toggle-btn {
                    bottom: 16px;
                    right: 16px;
                    padding: 10px 16px;
                    font-size: 13px;
                }
                
                .ui-toggle-btn .toggle-text {
                    display: none;
                }
                
                .ui-toggle-btn .toggle-icon {
                    font-size: 20px;
                }
                
                .beta-banner {
                    padding: 8px 12px;
                }
                
                .beta-banner-content {
                    font-size: 12px;
                    gap: 8px;
                }
                
                .beta-message {
                    display: none;
                }
            }
        `;
        
        document.head.appendChild(styles);
    },
    
    /**
     * Initialize the UI toggle system
     */
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this._setup());
        } else {
            this._setup();
        }
    },
    
    _setup() {
        this.injectStyles();
        this.createToggleButton();
        this.createBetaBanner();
    }
};

// Auto-initialize
UIToggle.init();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIToggle;
}
