/**
 * Server Entry Point
 * Starts the Express server and ingestion scheduler
 */

const app = require('./app');
const config = require('./config/config');
const { startScheduler, stopScheduler, waitForIngestionIdle } = require('./ingestion/scheduler');
const { initDatabase, closeDatabase } = require('./config/database');

const PORT = config.port;

// Hoisted to module scope so gracefulShutdown can reference it
let server;

/**
 * Graceful shutdown handler.
 * Order: stop HTTP → stop scheduler → wait for ingestion idle → close DB pool.
 * Each stage prevents new work entering before the prior stage drains.
 */
async function gracefulShutdown(signal) {
  console.log(`\n\n${signal} received. Shutting down gracefully...`);

  // 1. Stop accepting new HTTP connections; wait up to 30s for in-flight requests
  await new Promise((resolve) => {
    server.close(() => {
      console.log('HTTP server closed.');
      resolve();
    });
    // Safety timeout: force-resolve after 30s if connections are stuck
    setTimeout(resolve, 30000).unref();
  });

  // 2. Stop scheduler from firing a new ingestion cycle
  stopScheduler();

  // 3. Wait for any active ingestion cycle to complete (up to 60s)
  try {
    await waitForIngestionIdle(60000);
    console.log('Ingestion idle — proceeding with shutdown.');
  } catch (e) {
    console.warn('Shutdown: timed out waiting for ingestion —', e.message);
  }

  // 4. Release DB connection pool cleanly (pool.end() drains active connections)
  await closeDatabase();

  console.log('Shutdown complete.');
  process.exit(0);
}

// Initialize database and start server
async function startServer() {
  await initDatabase();

  server = app.listen(PORT, () => {
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

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
}

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
