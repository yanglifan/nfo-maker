const express = require('express');
const router = express.Router();
const scheduler = require('../services/scanScheduler');
const logManager = require('../services/logManager');

// GET /api/cron/config - Get current config
router.get('/config', (req, res) => {
  try {
    const config = scheduler.getConfig();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/cron/config - Update config
router.put('/config', (req, res) => {
  try {
    const result = scheduler.setConfig(req.body);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/cron/status - Get current status
router.get('/status', (req, res) => {
  try {
    const status = scheduler.getStatus();
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/cron/logs - Get historical logs
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const date = req.query.date || null;
    const logs = logManager.readLogs({ limit, date });
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/cron/scan - Trigger manual scan
router.post('/scan', (req, res) => {
  try {
    const result = scheduler.triggerScan('manual');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
