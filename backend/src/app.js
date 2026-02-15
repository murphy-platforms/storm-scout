/**
 * Express Application Configuration
 * Sets up middleware, routes, and error handling
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const config = require('./config/config');
const { apiLimiter, writeLimiter } = require('./middleware/rateLimiter');

// Import routes
const sitesRouter = require('./routes/sites');
const advisoriesRouter = require('./routes/advisories');
const statusRouter = require('./routes/status');
const noticesRouter = require('./routes/notices');
const filtersRouter = require('./routes/filters');
const operationalStatusRouter = require('./routes/operational-status');
const trendsRouter = require('./routes/trends');
const historyRouter = require('./routes/history');

// Create Express app
const app = express();

// Middleware
// Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",  // Required for Google Analytics inline script
        "cdn.jsdelivr.net",
        "www.googletagmanager.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",  // Bootstrap uses inline styles
        "cdn.jsdelivr.net"
      ],
      fontSrc: [
        "'self'",
        "cdn.jsdelivr.net"  // Bootstrap Icons
      ],
      imgSrc: [
        "'self'",
        "data:",  // For inline images and icons
        "www.googletagmanager.com"
      ],
      connectSrc: [
        "'self'",
        "www.google-analytics.com",
        "region1.google-analytics.com",
        "*.google-analytics.com"
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: config.env === 'production' ? [] : null
    }
  },
  // HSTS: enforce HTTPS in production
  strictTransportSecurity: config.env === 'production' ? {
    maxAge: 31536000,  // 1 year
    includeSubDomains: true
  } : false
}));

app.use(cors({ origin: config.cors.origin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting - apply to all /api routes
app.use('/api', apiLimiter);

// Stricter rate limiting for write operations
app.use('/api/operational-status', writeLimiter);

// Serve static files (if path configured)
if (config.staticFiles.path) {
  const publicPath = path.resolve(config.staticFiles.path);
  console.log(`Serving static files from: ${publicPath}`);
  app.use(express.static(publicPath));
}

// Request logging middleware (development)
if (config.env === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint (enhanced with database and ingestion status)
app.get('/health', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { getDatabase } = require('./config/database');
  
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.env,
    checks: {
      database: { status: 'unknown' },
      ingestion: { status: 'unknown' }
    }
  };
  
  try {
    // Check database connection
    const db = getDatabase();
    await db.query('SELECT 1');
    health.checks.database = { 
      status: 'ok',
      message: 'Database connection successful'
    };
  } catch (error) {
    health.status = 'degraded';
    health.checks.database = {
      status: 'error',
      message: error.message
    };
  }
  
  try {
    // Check last ingestion time
    const ingestionFile = path.join(__dirname, '../.last-ingestion.json');
    if (fs.existsSync(ingestionFile)) {
      const data = JSON.parse(fs.readFileSync(ingestionFile, 'utf8'));
      const lastUpdate = new Date(data.lastUpdated);
      const minutesAgo = (Date.now() - lastUpdate.getTime()) / (1000 * 60);
      
      health.checks.ingestion = {
        status: minutesAgo <= 30 ? 'ok' : 'stale',
        lastUpdated: data.lastUpdated,
        minutesAgo: Math.round(minutesAgo),
        message: minutesAgo <= 30 
          ? 'Ingestion is current' 
          : `Last ingestion was ${Math.round(minutesAgo)} minutes ago (expected: <= 30 min)`
      };
      
      if (minutesAgo > 30) {
        health.status = 'degraded';
      }
    } else {
      health.checks.ingestion = {
        status: 'unknown',
        message: 'No ingestion history found (ingestion may not have run yet)'
      };
    }
  } catch (error) {
    health.checks.ingestion = {
      status: 'error',
      message: `Error checking ingestion status: ${error.message}`
    };
  }
  
  // Set HTTP status based on overall health
  const httpStatus = health.status === 'ok' ? 200 : 503;
  res.status(httpStatus).json(health);
});

// API routes
app.use('/api/sites', sitesRouter);
app.use('/api/advisories', advisoriesRouter);
app.use('/api/status', statusRouter);
app.use('/api/notices', noticesRouter);
app.use('/api/filters', filtersRouter);
app.use('/api/operational-status', operationalStatusRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/history', historyRouter);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Storm Scout API',
    version: '1.0.0',
    endpoints: {
      health: '/health (Database + Ingestion status)',
      sites: '/api/sites',
      advisories: '/api/advisories',
      status: '/api/status',
      notices: '/api/notices',
      filters: '/api/filters',
      operational_status: '/api/operational-status',
      trends: '/api/trends',
      history: '/api/history'
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: config.env === 'development' ? err.message : 'Internal server error'
  });
});

// Serve index.html for all other non-API routes (SPA fallback)
// This must be last to avoid catching API routes
if (config.staticFiles.path) {
  app.get('*', (req, res) => {
    const indexPath = path.resolve(config.staticFiles.path, 'index.html');
    res.sendFile(indexPath);
  });
}

module.exports = app;
