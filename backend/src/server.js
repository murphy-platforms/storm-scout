/**
 * Server Entry Point
 * Starts the Express server and ingestion scheduler
 */

const app = require('./app');
const config = require('./config/config');
const { startScheduler } = require('./ingestion/scheduler');

const PORT = config.port;

// Start server
const server = app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  Storm Scout API Server                             ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Environment: ${config.env.padEnd(38)} ║`);
  console.log(`║  Port:        ${PORT.toString().padEnd(38)} ║`);
  console.log(`║  API URL:     http://localhost:${PORT.toString().padEnd(24)} ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');
  
  // Start ingestion scheduler if enabled
  if (config.ingestion.enabled) {
    console.log(`✓ Weather data ingestion enabled (every ${config.ingestion.intervalMinutes} minutes)`);
    startScheduler();
  } else {
    console.log('⚠ Weather data ingestion disabled (set INGESTION_ENABLED=true to enable)');
  }
  
  console.log('\nServer is ready to accept requests.\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n\nSIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n\nSIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
