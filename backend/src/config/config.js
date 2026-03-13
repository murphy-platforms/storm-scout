/**
 * Configuration Module
 * Loads and exports application configuration
 */

require('dotenv').config();

// Fail-fast startup validation — production only. (closes #98)
// Skipped in development so local dev works without a full .env.
// Setup scripts (init-db, seed-db) run with NODE_ENV=development by default
// and are intentionally excluded from this check.
if (process.env.NODE_ENV === 'production') {
  const REQUIRED_ENV_VARS = ['DB_USER', 'DB_PASSWORD', 'DB_NAME', 'NOAA_API_USER_AGENT', 'API_KEY'];
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    process.stderr.write(
      `[FATAL] Missing required environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}\n` +
      `Copy backend/.env.production.example to backend/.env.production and fill in all values.\n`
    );
    process.exit(1);
  }
}

const config = {
  // Server configuration
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  
  // Database configuration (MySQL)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // DB_SSL=true enforces TLS with certificate verification. Required when
    // the app and DB communicate over TCP rather than a Unix socket. (closes #97)
    ssl: process.env.DB_SSL === 'true'
  },
  
  // Ingestion configuration
  ingestion: {
    enabled: process.env.INGESTION_ENABLED === 'true',
    intervalMinutes: parseInt(process.env.INGESTION_INTERVAL_MINUTES) || 15
  },
  
  // NOAA API configuration
  noaa: {
    baseUrl: process.env.NOAA_API_BASE_URL || 'https://api.weather.gov',
    // User-Agent is REQUIRED by NOAA API - must be set in environment
    userAgent: process.env.NOAA_API_USER_AGENT || null
  },
  
  // CORS configuration
  // Fails closed: if CORS_ORIGIN is not set, all cross-origin requests are
  // blocked (origin: false). Never defaults to '*'.
  // Supports comma-separated origins: CORS_ORIGIN=https://a.com,https://b.com
  cors: {
    origin: (() => {
      const raw = process.env.CORS_ORIGIN;
      if (!raw) return false;
      const origins = raw.split(',').map(o => o.trim()).filter(Boolean);
      return origins.length === 1 ? origins[0] : origins;
    })()
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  
  // Static files configuration
  staticFiles: {
    path: process.env.STATIC_FILES_PATH || null
  }
};

module.exports = config;
