/**
 * Configuration Module
 * Loads and exports application configuration
 */

require('dotenv').config();

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
    database: process.env.DB_NAME
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
