/**
 * Admin API Routes
 * Protected endpoints for operational control (pause/resume ingestion).
 * All routes require a valid API key via requireApiKey middleware.
 */

const express = require('express');
const router = express.Router();
const { requireApiKey } = require('../middleware/apiKey');
const { startScheduler, stopScheduler, getSchedulerStatus, waitForIngestionIdle } = require('../ingestion/scheduler');

// All admin routes require API key authentication
router.use(requireApiKey);

/**
 * POST /api/admin/pause-ingestion
 * Stops the ingestion scheduler and waits for any active cycle to finish.
 * Used by deploy.sh before deploying new code/migrations. (closes #112)
 */
router.post('/pause-ingestion', async (req, res) => {
  try {
    const status = getSchedulerStatus();

    if (!status.ingestion.running) {
      return res.json({
        success: true,
        message: 'Ingestion scheduler was not running — nothing to pause',
        status: getSchedulerStatus()
      });
    }

    // Stop the scheduler from queuing new runs
    stopScheduler();
    console.log('[Admin] Ingestion scheduler paused via API');

    // If a cycle is actively in progress, wait for it to finish (up to 5 min)
    if (status.ingestion.inProgress) {
      console.log('[Admin] Waiting for active ingestion cycle to complete...');
      await waitForIngestionIdle(5 * 60 * 1000);
      console.log('[Admin] Active ingestion cycle finished');
    }

    res.json({
      success: true,
      message: 'Ingestion paused. Active cycle (if any) has completed.',
      status: getSchedulerStatus()
    });
  } catch (error) {
    console.error('[Admin] Failed to pause ingestion:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/resume-ingestion
 * Restarts the ingestion scheduler after a deploy pause.
 */
router.post('/resume-ingestion', (req, res) => {
  try {
    const status = getSchedulerStatus();

    if (status.ingestion.running) {
      return res.json({
        success: true,
        message: 'Ingestion scheduler is already running — nothing to resume',
        status
      });
    }

    startScheduler();
    console.log('[Admin] Ingestion scheduler resumed via API');

    res.json({
      success: true,
      message: 'Ingestion scheduler resumed',
      status: getSchedulerStatus()
    });
  } catch (error) {
    console.error('[Admin] Failed to resume ingestion:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/status
 * Returns current scheduler and ingestion status.
 */
router.get('/status', (req, res) => {
  res.json({ success: true, status: getSchedulerStatus() });
});

module.exports = router;
