/**
 * Parse video filename to extract title, year, season, episode info.
 * Removes resolution, codec, subtitle and other noise from filenames.
 */

/**
 * Chinese numeral to Arabic number conversion.
 */
const chineseNumMap = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '百': 100
};

function chineseNumToArabic(str) {
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  if (chineseNumMap[str]) return chineseNumMap[str];
  if (str === '十') return 10;
  if (str.startsWith('十')) return 10 + (chineseNumMap[str[1]] || 0);
  const tenIdx = str.indexOf('十');
  if (tenIdx > 0) {
    const tens = (chineseNumMap[str[0]] || 0) * 10;
    const ones = str[tenIdx + 1] ? chineseNumMap[str[tenIdx + 1]] || 0 : 0;
    return tens + ones;
  }
  return null;
}

/**
 * Clean title by removing resolution, codec, source, subtitle tags etc.
 */
function cleanTitle(title) {
  return title
    .replace(/[\.\-\s_]+/g, ' ')
    // Resolution tags
    .replace(/\b(1080p|720p|480p|4k|2k|2160p|3d|hdr|sdr|dolby\s*vision)\b/gi, '')
    // Source tags
    .replace(/\b(bluray|blu-?ray|web-?dl|webrip|hdtv|dvdrip|dvd|bdrip|remux)\b/gi, '')
    // Codec tags
    .replace(/\b(x264|x265|h264|h265|hevc|avc|vc1|mpeg|divx|xvid)\b/gi, '')
    // Audio tags
    .replace(/\b(aac|ac3|dts|ma|hdma|truehd|atmos|flac|mp3)\b/gi, '')
    // Subtitle/language tags (common Chinese and English)
    .replace(/\b(chs|cht|eng|cn|us|uk|zh|jp|kr|cor|jpn|kor)\b/gi, '')
    // Chinese subtitle tags
    .replace(/\b(中字|国语|粤语|台配|港配|简中|繁中|双语|双字|特效字|内封字幕)\b/gi, '')
    // Group/encoder names (usually at the end)
    .replace(/\b(chs|frds|tm|swan|hive|crystal|anx|psy|nhd|pter)\b/gi, '')
    // Remove brackets content
    .replace(/[\[\](){}【】（）\u300c\u300d][^\]\)\u300d】]*[\]\)\u300d】]/g, '')
    .trim();
}

/**
 * Parse filename and extract movie/TV info.
 * @param {string} filename - Video filename
 * @returns {{ title: string, year?: string, season?: number, episode?: number, type: string }}
 */
function parseFilename(filename) {
  // Remove extension
  const name = filename.replace(/\.[^.]+$/, '');

  // Pattern 1: TV episode SxxEyy
  const episodeMatch = name.match(/^(.+?)[\.\-\s_]S(\d{2})E(\d{2})/i);
  if (episodeMatch) {
    return {
      title: cleanTitle(episodeMatch[1]),
      season: parseInt(episodeMatch[2], 10),
      episode: parseInt(episodeMatch[3], 10),
      type: 'tvshow'
    };
  }

  // Pattern 2: Chinese season format "第一季", "第二季"
  const chineseSeasonMatch = name.match(/^(.+?)\s*第([一二三四五六七八九十百\d]+)季/);
  if (chineseSeasonMatch) {
    const seasonNum = chineseNumToArabic(chineseSeasonMatch[2]);
    return {
      title: cleanTitle(chineseSeasonMatch[1]),
      season: seasonNum,
      type: 'tvshow'
    };
  }

  // Pattern 3: Season folder Sxx (without episode)
  const seasonMatch = name.match(/^(.+?)[\.\-\s_]S(\d{2})(?![\.\-\s_]E)/i);
  if (seasonMatch) {
    return {
      title: cleanTitle(seasonMatch[1]),
      season: parseInt(seasonMatch[2], 10),
      type: 'tvshow'
    };
  }

  // Pattern 4: Movie with year (most common)
  const movieMatch = name.match(/^(.+?)[\.\-\s_(](\d{4})[\)\.\-\s_]/);
  if (movieMatch) {
    return {
      title: cleanTitle(movieMatch[1]),
      year: movieMatch[2],
      type: 'movie'
    };
  }

  // Pattern 5: Chinese year format "（2020）" or "(2020)"
  const chineseYearMatch = name.match(/^(.+?)[\s_][（(](\d{4})[\)）]/);
  if (chineseYearMatch) {
    return {
      title: cleanTitle(chineseYearMatch[1]),
      year: chineseYearMatch[2],
      type: 'movie'
    };
  }

  // Fallback: return cleaned title with unknown type
  return {
    title: cleanTitle(name),
    type: 'unknown'
  };
}

/**
 * Check if file is a video file.
 */
const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv',
  'webm', 'm4v', 'ts', 'm2ts', 'iso', 'mpg',
  'mpeg', 'vob', 'ogv', '3gp'
]);

function isVideoFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Check if directory already has NFO file.
 */
const NFO_EXTENSIONS = new Set(['nfo']);

function hasNfoFile(dir, fs, path) {
  try {
    const files = fs.readdirSync(dir);
    return files.some(f => NFO_EXTENSIONS.has(f.split('.').pop().toLowerCase()));
  } catch {
    return false;
  }
}

/**
 * Get NFO filename for a video file.
 */
function getNfoFilename(videoFile, videoCountInDir) {
  if (videoCountInDir === 1) {
    // Single video in directory - use standard naming
    return 'movie.nfo'; // Will be overridden to tvshow.nfo if type is tvshow
  }
  // Multiple videos - use video filename as base
  return videoFile.replace(/\.[^.]+$/, '') + '.nfo';
}

module.exports = {
  parseFilename,
  cleanTitle,
  isVideoFile,
  hasNfoFile,
  getNfoFilename,
  chineseNumToArabic
};
