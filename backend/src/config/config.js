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
    userAgent: process.env.NOAA_API_USER_AGENT || 'StormScout/1.0 (contact@example.com)'
  },
  
  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || '*'
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

module.exports = config;
