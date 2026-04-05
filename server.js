const express = require('express');
const path = require('path');
const apiRoutes = require('./src/routes/api');
const cronRoutes = require('./src/routes/cron');
const { scanDirectory } = require('./src/services/batchScanner');
const scanScheduler = require('./src/services/scanScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', apiRoutes);
app.use('/api/cron', cronRoutes);

// Manual scan trigger API
app.post('/api/scan', async (req, res) => {
  try {
    const { dirs, interval, limit } = req.body;

    if (!dirs || !Array.isArray(dirs) || dirs.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请提供要扫描的目录列表 (dirs)'
      });
    }

    const requestInterval = parseInt(interval, 10) || 3;
    const maxFiles = parseInt(limit, 10) || Infinity;

    // Run scan in background
    const scanPromise = (async () => {
      const results = [];
      for (const dir of dirs) {
        try {
          const stats = await scanDirectory(dir, {
            requestInterval,
            limit: maxFiles
          });
          results.push({ dir, stats });
        } catch (err) {
          results.push({ dir, error: err.message });
        }
      }
      console.log('[Scan Complete]', JSON.stringify(results));
    })();

    res.json({
      success: true,
      message: '扫描任务已启动，将在后台运行'
    });

    // Don't wait for scan to complete
    scanPromise.catch(err => console.error('Background scan error:', err));
  } catch (err) {
    console.error('Scan API error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`NFO Maker server running at http://localhost:${PORT}`);
  scanScheduler.initialize();
});
