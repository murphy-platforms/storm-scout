/**
 * Notices API Routes
 * Endpoints for government/emergency notices
 */

const express = require('express');
const router = express.Router();
const NoticeModel = require('../models/notice');

/**
 * GET /api/notices
 * Get all notices with optional filters
 * Query params: jurisdiction_type, notice_type, state, active_only
 */
router.get('/', (req, res) => {
  try {
    const { jurisdiction_type, notice_type, state, active_only } = req.query;
    
    let notices;
    if (active_only === 'true') {
      notices = NoticeModel.getActive({ jurisdiction_type, notice_type, state });
    } else {
      notices = NoticeModel.getAll({ jurisdiction_type, notice_type, state });
    }
    
    res.json({ success: true, data: notices, count: notices.length });
  } catch (error) {
    console.error('Error fetching notices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/notices/active
 * Get active notices only
 * Query params: jurisdiction_type, state
 */
router.get('/active', (req, res) => {
  try {
    const { jurisdiction_type, state } = req.query;
    const notices = NoticeModel.getActive({ jurisdiction_type, state });
    res.json({ success: true, data: notices, count: notices.length });
  } catch (error) {
    console.error('Error fetching active notices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/notices/stats
 * Get notice statistics
 */
router.get('/stats', (req, res) => {
  try {
    const byType = NoticeModel.getCountByType(true);
    res.json({ success: true, data: { by_type: byType } });
  } catch (error) {
    console.error('Error fetching notice stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/notices/:id
 * Get notice by ID
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const notice = NoticeModel.getById(id);
    
    if (!notice) {
      return res.status(404).json({ success: false, error: 'Notice not found' });
    }
    
    res.json({ success: true, data: notice });
  } catch (error) {
    console.error('Error fetching notice:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
