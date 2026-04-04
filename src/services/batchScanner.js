const fs = require('fs');
const path = require('path');
const { parseFilename, isVideoFile } = require('../utils/filenameParser');
const { searchDouban, findBestMatch } = require('./doubanSearcher');
const { scrape } = require('./doubanScraper');
const { generate } = require('./nfoGenerator');

// Directories to skip (system/cache folders)
const SKIP_DIRS = new Set([
  '@eadir', '.@__thumb', '.#recycle', '.trash',
  '#recycle', 'tmp', 'temp', '.hidden'
]);

/**
 * Recursively find all video files that don't have corresponding NFO files.
 * @param {string} dir - Directory to scan
 * @returns {Array<{videoPath: string, dir: string, filename: string}>}
 */
function findVideosWithoutNfo(dir) {
  const results = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip system directories
        if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
        results.push(...findVideosWithoutNfo(fullPath));
      } else if (entry.isFile() && isVideoFile(entry.name)) {
        // Check if this directory already has NFO files
        const dirHasNfo = hasAnyNfoFile(dir);

        if (!dirHasNfo) {
          results.push({
            videoPath: fullPath,
            dir: dir,
            filename: entry.name
          });
        }
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}: ${err.message}`);
  }

  return results;
}

/**
 * Check if directory has any NFO file.
 */
function hasAnyNfoFile(dir) {
  try {
    const files = fs.readdirSync(dir);
    return files.some(f => f.toLowerCase().endsWith('.nfo'));
  } catch {
    return false;
  }
}

/**
 * Count video files in a directory.
 */
function countVideoFiles(dir) {
  try {
    const files = fs.readdirSync(dir);
    return files.filter(f => isVideoFile(f)).length;
  } catch {
    return 0;
  }
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format timestamp for logging.
 */
function logTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Process a single video file: parse filename -> search douban -> scrape -> generate NFO.
 * @param {object} videoInfo - { videoPath, dir, filename }
 * @param {boolean} dryRun - If true, only log what would be done
 * @param {number} requestInterval - Seconds between requests
 * @returns {Promise<{success: boolean, nfoPath?: string, error?: string}>}
 */
async function processVideoFile(videoInfo, dryRun = false, requestInterval = 3) {
  const { videoPath, dir, filename } = videoInfo;
  const log = (msg) => console.log(`[${logTimestamp()}] ${msg}`);

  log(`处理: ${filename}`);

  // Step 1: Parse filename
  const parsed = parseFilename(filename);
  log(`  解析结果: title="${parsed.title}", type="${parsed.type}"${parsed.year ? `, year="${parsed.year}"` : ''}${parsed.season ? `, season=${parsed.season}` : ''}${parsed.episode ? `, episode=${parsed.episode}` : ''}`);

  if (parsed.type === 'unknown' || !parsed.title) {
    log(`  跳过: 无法解析文件名`);
    return { success: false, error: '无法解析文件名' };
  }

  if (dryRun) {
    log(`  [Dry Run] 将搜索 "${parsed.title}" 并生成 NFO`);
    return { success: true };
  }

  // Step 2: Search Douban
  log(`  搜索豆瓣: "${parsed.title}"`);
  let searchResults;
  try {
    searchResults = await searchDouban(parsed.title);
    log(`  找到 ${searchResults.length} 个结果`);
  } catch (err) {
    log(`  搜索失败: ${err.message}`);
    return { success: false, error: `搜索失败: ${err.message}` };
  }

  if (searchResults.length === 0) {
    log(`  未找到匹配结果`);
    return { success: false, error: '未找到匹配结果' };
  }

  // Step 3: Find best match
  const bestMatch = findBestMatch(searchResults, parsed);
  if (!bestMatch) {
    log(`  无合适的匹配结果`);
    return { success: false, error: '无合适的匹配结果' };
  }

  log(`  最佳匹配: ${bestMatch.title} (${bestMatch.year}) - ID: ${bestMatch.doubanId}`);

  // Step 4: Scrape Douban detail page
  log(`  抓取详情页...`);
  let doubanData;
  try {
    doubanData = await scrape(bestMatch.url, { requestInterval });
    log(`  详情抓取成功: ${doubanData.title}`);
  } catch (err) {
    log(`  详情抓取失败: ${err.message}`);
    return { success: false, error: `详情抓取失败: ${err.message}` };
  }

  // Override type if detected from filename
  if (parsed.type === 'tvshow') {
    doubanData.type = 'tvshow';
  }

  // Step 5: Generate NFO
  const { xml, filename: nfoFilename } = generate(doubanData);

  // Determine actual NFO filename
  const videoCount = countVideoFiles(dir);
  let finalNfoFilename = nfoFilename;

  if (videoCount > 1 && nfoFilename === 'movie.nfo') {
    // Multiple videos in directory - use video filename as base
    finalNfoFilename = filename.replace(/\.[^.]+$/, '') + '.nfo';
  }

  if (doubanData.type === 'tvshow' && videoCount === 1) {
    finalNfoFilename = 'tvshow.nfo';
  }

  const nfoPath = path.join(dir, finalNfoFilename);

  // Step 6: Write NFO file
  try {
    fs.writeFileSync(nfoPath, xml, 'utf8');
    log(`  NFO 已生成: ${nfoPath}`);
    return { success: true, nfoPath };
  } catch (err) {
    log(`  写入 NFO 失败: ${err.message}`);
    return { success: false, error: `写入 NFO 失败: ${err.message}` };
  }
}

/**
 * Scan directory and process all videos without NFO files.
 * @param {string} dir - Directory to scan
 * @param {object} options - { dryRun, requestInterval, limit, onProgress }
 * @returns {Promise<{total: number, processed: number, success: number, failed: number, errors: Array}>}
 */
async function scanDirectory(dir, options = {}) {
  const {
    dryRun = false,
    requestInterval = 3,
    limit = Infinity,
    onProgress = null
  } = options;

  const log = (msg) => console.log(`[${logTimestamp()}] ${msg}`);

  log(`开始扫描目录: ${dir}`);

  // Find all videos without NFO
  const videos = findVideosWithoutNfo(dir);
  log(`发现 ${videos.length} 个视频文件缺少 NFO`);

  if (videos.length === 0) {
    log('所有视频文件都已有 NFO，无需处理');
    return { total: 0, processed: 0, success: 0, failed: 0, errors: [] };
  }

  const stats = {
    total: videos.length,
    processed: 0,
    success: 0,
    failed: 0,
    errors: []
  };

  // Process each video
  const toProcess = videos.slice(0, limit);

  for (let i = 0; i < toProcess.length; i++) {
    const video = toProcess[i];
    stats.processed++;

    if (onProgress) {
      onProgress({
        current: stats.processed,
        total: stats.total,
        filename: video.filename,
        ...stats
      });
    }

    const result = await processVideoFile(video, dryRun, requestInterval);

    if (result.success) {
      stats.success++;
    } else {
      stats.failed++;
      stats.errors.push({
        filename: video.filename,
        error: result.error
      });
    }

    // Wait between requests to avoid being blocked
    if (i < toProcess.length - 1 && !dryRun) {
      await sleep(requestInterval * 1000);
    }
  }

  // Print summary
  log('='.repeat(50));
  log('扫描完成');
  log(`总计: ${stats.total} 个文件`);
  log(`成功: ${stats.success}`);
  log(`失败: ${stats.failed}`);
  if (stats.errors.length > 0) {
    log('失败详情:');
    for (const err of stats.errors) {
      log(`  - ${err.filename}: ${err.error}`);
    }
  }
  log('='.repeat(50));

  return stats;
}

module.exports = {
  scanDirectory,
  findVideosWithoutNfo,
  processVideoFile,
  hasAnyNfoFile
};
