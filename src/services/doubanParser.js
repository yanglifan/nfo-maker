const cheerio = require('cheerio');
const { SELECTORS } = require('../constants/selectors');

function parse(html, url) {
  const $ = cheerio.load(html);

  // Extract doubanId from URL
  const idMatch = url.match(/subject\/(\d+)/);
  const doubanId = idMatch ? idMatch[1] : '';

  // Title
  const fullTitle = $(SELECTORS.TITLE).text().trim();

  // Year
  const yearText = $(SELECTORS.YEAR).text().trim();
  const year = yearText.replace(/[()（）]/g, '');

  // Split Chinese title and original title
  const { title: rawTitle, originalTitle } = splitTitle(fullTitle);

  // Convert Chinese season numbers to Arabic: 第一季 -> 第1季
  const title = convertChineseSeasonNum(rawTitle);

  // Directors
  const directors = [];
  $(SELECTORS.DIRECTOR).each((_, el) => {
    directors.push($(el).text().trim());
  });

  // Writers - extracted from #info block
  const writers = extractInfoField($, '编剧');

  // Actors - extract name and celebrity URL from v:starring links (limit to first 10)
  const actors = [];
  let actorCount = 0;
  $(SELECTORS.STARRING).each((_, el) => {
    if (actorCount >= 10) return; // limit to 10 actors

    const name = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (name) {
      // Extract personage ID from URL: https://www.douban.com/personage/27260288/
      // Or legacy format: https://movie.douban.com/celebrity/1234567/
      const personageMatch = href.match(/personage\/(\d+)/);
      const celebrityMatch = href.match(/celebrity\/(\d+)/);
      const celebId = personageMatch ? personageMatch[1] : (celebrityMatch ? celebrityMatch[1] : '');
      const celebUrl = personageMatch
        ? `https://www.douban.com/personage/${personageMatch[1]}/`
        : (celebrityMatch ? `https://movie.douban.com/celebrity/${celebrityMatch[1]}/` : '');
      actors.push({ name, role: '', celebId, celebUrl });
      actorCount++;
    }
  });

  // Genres
  const genres = [];
  $(SELECTORS.GENRE).each((_, el) => {
    genres.push($(el).text().trim());
  });

  // Release date
  let releaseDate = '';
  const releaseDateEl = $(SELECTORS.RELEASE_DATE).first();
  if (releaseDateEl.length) {
    const raw = releaseDateEl.attr('content') || releaseDateEl.text().trim();
    // Extract date part, e.g., "1994-09-10(多伦多电影节)" -> "1994-09-10"
    const dateMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);
    releaseDate = dateMatch ? dateMatch[1] : raw.replace(/\(.*\)/, '').trim();
  }

  // Runtime
  let runtime = '';
  const runtimeEl = $(SELECTORS.RUNTIME).first();
  if (runtimeEl.length) {
    const content = runtimeEl.attr('content');
    if (content) {
      runtime = content;
    } else {
      const text = runtimeEl.text().trim();
      const numMatch = text.match(/(\d+)/);
      runtime = numMatch ? numMatch[1] : text;
    }
  }

  // Rating
  const rating = $(SELECTORS.RATING).text().trim();

  // Plot summary
  let plot = '';
  const summaryEl = $(SELECTORS.SUMMARY);
  if (summaryEl.length) {
    // Sometimes the full summary is hidden, try to get the longest one
    plot = summaryEl.text().trim().replace(/\s+/g, ' ');
  }

  // Poster - convert to large photo format
  let poster = '';
  const posterEl = $(SELECTORS.POSTER);
  if (posterEl.length) {
    poster = posterEl.attr('src') || '';
    if (poster) {
      // Convert s_ratio_poster or other thumbnail formats to /photo/l/ large size
      poster = poster.replace(/\/view\/photo\/[^/]+\//, '/view/photo/l/');
      // Convert to .webp format
      poster = poster.replace(/\.(jpg|jpeg|png|gif)$/i, '.webp');
    }
  }

  // Fanart (landscape cover) - extract from photos page URL
  // Will be fetched separately in doubanScraper
  let fanart = '';
  const photosUrl = `${url}photos/`;

  // Countries
  const countriesRaw = extractInfoText($, '制片国家/地区');
  const countries = countriesRaw ? countriesRaw.split('/').map(s => s.trim()).filter(Boolean) : [];

  // Languages
  const languagesRaw = extractInfoText($, '语言');
  const languages = languagesRaw ? languagesRaw.split('/').map(s => s.trim()).filter(Boolean) : [];

  // Episodes count
  const episodesRaw = extractInfoText($, '集数');
  const episodes = episodesRaw ? episodesRaw.trim() : null;

  // Episode runtime
  const episodeRuntime = extractInfoText($, '单集片长');

  // Auto-detect type: movie vs tvshow
  const type = detectType($, episodes, episodeRuntime, genres);

  // If it's a TV show and no runtime from v:runtime, try episode runtime
  if (type === 'tvshow' && !runtime && episodeRuntime) {
    const numMatch = episodeRuntime.match(/(\d+)/);
    if (numMatch) runtime = numMatch[1];
  }

  return {
    type,
    doubanId,
    title,
    originalTitle,
    year,
    releaseDate,
    plot,
    rating,
    genres,
    directors,
    writers,
    actors,
    countries,
    languages,
    runtime,
    poster,
    fanart,
    photosUrl,
    episodes,
  };
}

/**
 * Convert a Chinese numeral string to an Arabic number.
 * Handles values 一 through 九十九.
 */
function chineseNumToArabic(str) {
  const digits = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };

  if (digits[str]) return digits[str];    // 一~九
  if (str === '十') return 10;            // 十

  if (str.startsWith('十')) {             // 十一~十九
    return 10 + (digits[str[1]] || 0);
  }

  const tenIdx = str.indexOf('十');
  if (tenIdx > 0) {                       // 二十~九十九
    const tens = digits[str[0]] * 10;
    const ones = str[tenIdx + 1] ? digits[str[tenIdx + 1]] || 0 : 0;
    return tens + ones;
  }

  return null;
}

/**
 * Replace Chinese season number in title: 第一季 -> 第1季
 */
function convertChineseSeasonNum(title) {
  return title.replace(/第([一二三四五六七八九十]+)季/g, (match, chNum) => {
    const num = chineseNumToArabic(chNum);
    return num !== null ? `第${num}季` : match;
  });
}

/**
 * Split full title into Chinese title and original title.
 * Douban titles can be like "肖申克的救赎 The Shawshank Redemption"
 */
function splitTitle(fullTitle) {
  if (!fullTitle) return { title: '', originalTitle: '' };

  // Check if there's a mix of CJK and non-CJK characters
  const cjkMatch = fullTitle.match(/^([\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u3000-\u303f\uff00-\uffef\s·：:，,！!？?（）()—\-\d]+)\s+(.+)$/u);

  if (cjkMatch) {
    return {
      title: cjkMatch[1].trim(),
      originalTitle: cjkMatch[2].trim(),
    };
  }

  return { title: fullTitle, originalTitle: '' };
}

/**
 * Extract writers/other linked fields from #info block
 */
function extractInfoField($, labelText) {
  const results = [];
  const infoBlock = $(SELECTORS.INFO_BLOCK);

  infoBlock.find(SELECTORS.INFO_LABEL).each((_, el) => {
    const label = $(el).text().trim();
    if (label.includes(labelText)) {
      // Get all sibling <a> tags until the next <br> or <span class="pl">
      let current = $(el).next();
      while (current.length && !current.is('br') && !current.hasClass('pl')) {
        if (current.is('a')) {
          const text = current.text().trim();
          if (text) results.push(text);
        } else if (current.is('span') && current.hasClass('attrs')) {
          current.find('a').each((_, a) => {
            const text = $(a).text().trim();
            if (text) results.push(text);
          });
        }
        current = current.next();
      }
    }
  });

  return results;
}

/**
 * Extract plain text value from #info block for a given label.
 * Used for country, language, episodes, etc.
 */
function extractInfoText($, labelText) {
  const infoHtml = $(SELECTORS.INFO_BLOCK).html();
  if (!infoHtml) return '';

  // Split by <br> tags to process line by line
  const lines = infoHtml.split(/<br\s*\/?>/i);

  for (const line of lines) {
    if (line.includes(labelText)) {
      // Load this line fragment and extract the text after the label
      const $line = cheerio.load(`<div>${line}</div>`);
      const fullText = $line('div').text().trim();
      // Remove the label prefix (e.g., "制片国家/地区:")
      const colonIndex = fullText.indexOf(':');
      if (colonIndex !== -1) {
        return fullText.substring(colonIndex + 1).trim();
      }
      // Try Chinese colon
      const cnColonIndex = fullText.indexOf('：');
      if (cnColonIndex !== -1) {
        return fullText.substring(cnColonIndex + 1).trim();
      }
      // Fallback: remove the label text
      return fullText.replace(new RegExp(`.*${labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：]?\\s*`), '').trim();
    }
  }

  return '';
}

/**
 * Detect whether the subject is a movie or TV show.
 */
function detectType($, episodes, episodeRuntime, genres) {
  // If has episode count, it's a TV show
  if (episodes) return 'tvshow';

  // If has episode runtime field, it's a TV show
  if (episodeRuntime) return 'tvshow';

  // Check genres for TV-specific types
  const tvGenres = ['真人秀', '综艺', '脱口秀'];
  if (genres.some(g => tvGenres.includes(g))) return 'tvshow';

  return 'movie';
}

module.exports = { parse };
