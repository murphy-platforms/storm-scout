/**
 * Express Application Configuration
 * Sets up middleware, routes, and error handling
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/config');

// Import routes
const sitesRouter = require('./routes/sites');
const advisoriesRouter = require('./routes/advisories');
const statusRouter = require('./routes/status');
const noticesRouter = require('./routes/notices');
const filtersRouter = require('./routes/filters');

// Create Express app
const app = express();

// Middleware
app.use(cors({ origin: config.cors.origin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: config.env
  });
});

// API routes
app.use('/api/sites', sitesRouter);
app.use('/api/advisories', advisoriesRouter);
app.use('/api/status', statusRouter);
app.use('/api/notices', noticesRouter);
app.use('/api/filters', filtersRouter);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Storm Scout API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      sites: '/api/sites',
      advisories: '/api/advisories',
      status: '/api/status',
      notices: '/api/notices',
      filters: '/api/filters'
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
