/**
 * Express Application Configuration
 * Sets up middleware, routes, and error handling
 */

const express = require('express');
const cors = require('cors');
const config = require('./config/config');
const { getDatabase } = require('./config/database');

// Import routes
const sitesRouter = require('./routes/sites');
// const advisoriesRouter = require('./routes/advisories');
const statusRouter = require('./routes/status');
// const noticesRouter = require('./routes/notices');

// Create Express app
const app = express();

// Middleware
app.use(cors({ origin: config.cors.origin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
// Temporarily disabled until MySQL conversion complete:
// app.use('/api/advisories', advisoriesRouter);
app.use('/api/status', statusRouter);
// app.use('/api/notices', noticesRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Storm Scout API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      sites: '/api/sites',
      advisories: '/api/advisories',
      status: '/api/status',
      notices: '/api/notices'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
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

// Initialize database connection
getDatabase();

module.exports = app;
