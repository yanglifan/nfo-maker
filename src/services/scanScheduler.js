const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { scanDirectory } = require('./batchScanner');
const logManager = require('./logManager');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'scan-config.json');

// Default config
const DEFAULTS = {
  enabled: true,
  cron: '0 2 * * *',
  scanDirs: [],
  requestInterval: 3,
  limit: 1000,
  scanOnStart: true
};

class ScanScheduler {
  constructor() {
    this.config = null;
    this.cronTask = null;
    this.isRunning = false;
    this.lastRun = null;
    this.nextRun = null;
  }

  /**
   * Initialize scheduler. Called once at server startup.
   */
  initialize() {
    this._loadOrCreateConfig();

    // Ensure data directory exists
    const dataDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    console.log(`[Scheduler] Config loaded: enabled=${this.config.enabled}, cron=${this.config.cron}`);

    // Scan on start
    if (this.config.scanOnStart && this.config.enabled && this.config.scanDirs.length > 0) {
      this._executeScan('startup');
    }

    // Register cron
    this.reloadCron();
  }

  /**
   * Load config from file or create from env vars.
   */
  _loadOrCreateConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        this.config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        // Merge with defaults for any missing fields
        this.config = { ...DEFAULTS, ...this.config };
        return;
      } catch (err) {
        console.warn(`[Scheduler] Config file corrupted, using defaults: ${err.message}`);
      }
    }

    // Create from env vars
    this.config = {
      enabled: true,
      cron: process.env.SCAN_CRON || DEFAULTS.cron,
      scanDirs: (process.env.SCAN_DIRS || '')
        .split(',')
        .map(d => d.trim())
        .filter(Boolean),
      requestInterval: parseInt(process.env.SCAN_INTERVAL, 10) || DEFAULTS.requestInterval,
      limit: parseInt(process.env.SCAN_LIMIT, 10) || DEFAULTS.limit,
      scanOnStart: process.env.SCAN_ON_START !== 'false'
    };

    // If no env vars set, use empty defaults
    if (!process.env.SCAN_DIRS) {
      this.config.scanDirs = DEFAULTS.scanDirs;
    }

    this._saveConfig();
  }

  /**
   * Save config to file.
   */
  _saveConfig() {
    const dataDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf8');
  }

  /**
   * Reload cron task with current config.
   */
  reloadCron() {
    // Stop existing task
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
    }

    if (!this.config.enabled || !this.config.cron || this.config.scanDirs.length === 0) {
      console.log('[Scheduler] Cron disabled or no dirs configured');
      this.nextRun = null;
      return;
    }

    if (!cron.validate(this.config.cron)) {
      console.error(`[Scheduler] Invalid cron expression: ${this.config.cron}`);
      return;
    }

    this.cronTask = cron.schedule(this.config.cron, () => {
      this._executeScan('cron');
    });

    this.cronTask.start();
    this._updateNextRun();
    console.log(`[Scheduler] Cron registered: ${this.config.cron}, next run: ${this.nextRun}`);
  }

  /**
   * Trigger a scan manually.
   */
  triggerScan(trigger = 'manual') {
    if (this.isRunning) {
      return { success: false, message: '扫描进行中，请稍后再试' };
    }

    // Fire and forget
    this._executeScan(trigger).catch(err => {
      console.error('[Scheduler] Scan error:', err.message);
    });

    return { success: true, message: '扫描任务已启动' };
  }

  /**
   * Internal scan execution.
   */
  async _executeScan(trigger) {
    if (this.isRunning) return;
    this.isRunning = true;

    const startTime = Date.now();
    const startIso = new Date().toISOString();

    console.log(`[Scheduler] Scan started: trigger=${trigger}, dirs=${this.config.scanDirs.join(', ')}`);

    logManager.writeLog({
      timestamp: startIso,
      type: 'scan_start',
      trigger
    });

    const details = [];
    let totalDirs = this.config.scanDirs.length;
    let updatedDirs = 0;
    let skippedDirs = 0;

    for (const dir of this.config.scanDirs) {
      try {
        const stats = await scanDirectory(dir, {
          dryRun: false,
          requestInterval: this.config.requestInterval,
          limit: this.config.limit,
          onProgress: (progress) => {
            if (progress.current % 10 === 0) {
              console.log(`  [${dir}] Progress: ${progress.current}/${progress.total} (success: ${progress.success}, failed: ${progress.failed})`);
            }
          }
        });

        if (stats.total === 0) {
          skippedDirs++;
          // Skip recording skipped dirs per user request
        } else {
          updatedDirs++;
          details.push({
            dir,
            status: stats.failed > 0 && stats.success === 0 ? 'error' : 'updated',
            success: stats.success,
            failed: stats.failed
          });
        }
      } catch (err) {
        skippedDirs++;
        details.push({
          dir,
          status: 'error',
          success: 0,
          failed: 1,
          error: err.message
        });
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const endIso = new Date().toISOString();

    logManager.writeLog({
      timestamp: endIso,
      type: 'scan_end',
      trigger,
      duration,
      totalDirs,
      updatedDirs,
      skippedDirs,
      details
    });

    this.lastRun = {
      startTime: startIso,
      endTime: endIso,
      duration,
      totalDirs,
      updatedDirs,
      skippedDirs,
      details
    };

    this.isRunning = false;
    this._updateNextRun();

    console.log(`[Scheduler] Scan completed: duration=${duration}s, updated=${updatedDirs}, skipped=${skippedDirs}`);
  }

  /**
   * Get current config.
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update config and reload cron.
   */
  setConfig(newConfig) {
    // Validate
    if (newConfig.cron && !cron.validate(newConfig.cron)) {
      return { success: false, error: `无效的 cron 表达式: ${newConfig.cron}` };
    }

    if (newConfig.scanDirs && (!Array.isArray(newConfig.scanDirs) || newConfig.scanDirs.length === 0)) {
      return { success: false, error: '至少需要一个扫描目录' };
    }

    // Update
    this.config = { ...this.config, ...newConfig };
    this.config.requestInterval = Math.max(1, parseInt(this.config.requestInterval, 10) || 3);
    this.config.limit = Math.max(1, parseInt(this.config.limit, 10) || 1000);

    this._saveConfig();
    this.reloadCron();

    return { success: true, message: '配置已更新' };
  }

  /**
   * Get current status.
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      running: this.isRunning,
      nextRun: this.nextRun,
      lastRun: this.lastRun
    };
  }

  /**
   * Update next run time.
   */
  _updateNextRun() {
    if (this.cronTask && this.config.enabled) {
      // Calculate next run manually from cron expression
      try {
        const parts = this.config.cron.split(/\s+/);
        const now = new Date();
        const next = new Date(now);

        const hour = parts[1] === '*' ? now.getHours() + 1 : parseInt(parts[1], 10);
        const minute = parts[0] === '*' ? 0 : parseInt(parts[0], 10);

        next.setHours(hour, minute, 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        this.nextRun = next.toISOString();
      } catch {
        this.nextRun = null;
      }
    } else {
      this.nextRun = null;
    }
  }
}

// Singleton
const scheduler = new ScanScheduler();
module.exports = scheduler;
