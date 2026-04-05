const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', '..', 'data', 'logs');
const RETENTION_DAYS = 30;

/**
 * Ensure logs directory exists.
 */
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Get today's log file path.
 */
function getTodayLogPath() {
  const today = new Date().toISOString().split('T')[0];
  return path.join(LOGS_DIR, `scan-${today}.jsonl`);
}

/**
 * Get log file path for a specific date.
 */
function getDateLogPath(dateStr) {
  return path.join(LOGS_DIR, `scan-${dateStr}.jsonl`);
}

/**
 * Write a log entry to today's JSONL file.
 * @param {object} entry - Log entry object
 */
function writeLog(entry) {
  ensureLogsDir();
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(getTodayLogPath(), line, 'utf8');

  // Async cleanup, don't block
  setImmediate(() => cleanup());
}

/**
 * Read log entries.
 * @param {object} options
 * @param {string} [options.date] - Single date YYYY-MM-DD
 * @param {string} [options.startDate] - Start date range
 * @param {string} [options.endDate] - End date range
 * @param {number} [options.limit] - Max entries to return (default 30)
 * @returns {Array} Log entries sorted by timestamp desc
 */
function readLogs(options = {}) {
  ensureLogsDir();
  const { date, startDate, endDate, limit = 30 } = options;

  let files = [];

  if (date) {
    const p = getDateLogPath(date);
    if (fs.existsSync(p)) files.push(p);
  } else {
    // Collect files in date range or recent files
    const today = new Date();
    const daysToScan = endDate ? daysBetween(startDate || earliestDate(), endDate) : 30;

    for (let i = 0; i < daysToScan; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const p = getDateLogPath(dateStr);
      if (fs.existsSync(p)) files.push(p);
    }
  }

  // Read all lines from all files
  const entries = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8').trim();
      if (content) {
        for (const line of content.split('\n')) {
          if (line.trim()) {
            try {
              entries.push(JSON.parse(line));
            } catch {
              // Skip malformed lines
            }
          }
        }
      }
    } catch {
      // File read error, skip
    }
  }

  // Sort by timestamp descending
  entries.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  return entries.slice(0, limit);
}

/**
 * Clean up log files older than retention period.
 * @param {number} oldDays - Days to keep (default 30)
 */
function cleanup(oldDays = RETENTION_DAYS) {
  ensureLogsDir();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - oldDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  try {
    const files = fs.readdirSync(LOGS_DIR);
    for (const file of files) {
      if (file.startsWith('scan-') && file.endsWith('.jsonl')) {
        const dateStr = file.replace('scan-', '').replace('.jsonl', '');
        if (dateStr < cutoffStr) {
          fs.unlinkSync(path.join(LOGS_DIR, file));
        }
      }
    }
  } catch {
    // Cleanup error, non-critical
  }
}

function daysBetween(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1);
}

function earliestDate() {
  const d = new Date();
  d.setDate(d.getDate() - RETENTION_DAYS);
  return d.toISOString().split('T')[0];
}

module.exports = {
  writeLog,
  readLogs,
  cleanup,
  LOGS_DIR
};
