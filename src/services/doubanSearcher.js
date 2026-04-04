const cheerio = require('cheerio');
const { fetchPage } = require('../utils/httpClient');
const { SEARCH_SELECTORS } = require('../constants/searchSelectors');

/**
 * Search Douban for a movie/TV show by query string.
 * @param {string} query - Search query (title + optional year)
 * @returns {Promise<Array<{title: string, year: string, rating: string, doubanId: string, url: string}>>}
 */
async function searchDouban(query) {
  const searchUrl = `https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(query)}`;

  const html = await fetchPage(searchUrl, 3, searchContentValidator);
  return parseSearchResults(html);
}

/**
 * Validate search results page content.
 */
function searchContentValidator(body) {
  return body.includes('search-list') ||
    body.includes('class="result') ||
    body.includes('subject-cast') ||
    body.includes('rating_num');
}

/**
 * Parse search results HTML and extract structured data.
 */
function parseSearchResults(html) {
  const $ = cheerio.load(html);
  const results = [];

  // Try multiple selector strategies for result items
  const resultItems = $(SEARCH_SELECTORS.RESULT_LIST).find(SEARCH_SELECTORS.RESULT_ITEM);

  if (resultItems.length === 0) {
    // Fallback: look for any links containing /subject/
    $('a[href*="/subject/"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const idMatch = href.match(SEARCH_SELECTORS.SUBJECT_URL_PATTERN);
      if (!idMatch) return;

      const doubanId = idMatch[1];
      const title = $el.text().trim();
      if (!title) return;

      // Try to get year from parent or sibling elements
      let year = '';
      const parent = $el.closest('.result, .item');
      if (parent.length) {
        const yearText = parent.find(SEARCH_SELECTORS.YEAR).text().trim() ||
          parent.find('.year').text().trim();
        year = yearText.replace(/[()（）]/g, '');
      }

      // Try to get rating
      let rating = '';
      if (parent.length) {
        rating = parent.find(SEARCH_SELECTORS.RATING).text().trim() ||
          parent.find('.rating_num').text().trim();
      }

      results.push({
        title,
        year,
        rating,
        doubanId,
        url: `https://movie.douban.com/subject/${doubanId}/`
      });
    });
  } else {
    resultItems.each((_, item) => {
      const $item = $(item);

      // Extract title and link
      const linkEl = $item.find(SEARCH_SELECTORS.RESULT_LINK).first();
      if (!linkEl.length) return;

      const href = linkEl.attr('href') || '';
      const idMatch = href.match(SEARCH_SELECTORS.SUBJECT_URL_PATTERN);
      if (!idMatch) return;

      const doubanId = idMatch[1];
      const title = linkEl.text().trim();

      // Extract year from cast info
      let year = '';
      const castInfo = $item.find(SEARCH_SELECTORS.CAST_INFO).text().trim() ||
        $item.find('.subject-cast').text().trim();
      if (castInfo) {
        const yearMatch = castInfo.match(/(\d{4})/);
        if (yearMatch) year = yearMatch[1];
      }

      // Extract rating
      let rating = $item.find(SEARCH_SELECTORS.RATING).text().trim() ||
        $item.find('.rating_num').text().trim();

      results.push({
        title,
        year,
        rating,
        doubanId,
        url: `https://movie.douban.com/subject/${doubanId}/`
      });
    });
  }

  return results;
}

/**
 * Calculate string similarity (Levenshtein distance based).
 */
function stringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  str1 = str1.toLowerCase();
  str2 = str2.toLowerCase();

  if (str1 === str2) return 1;
  if (str1.includes(str2) || str2.includes(str1)) return 0.8;

  // Simple character overlap ratio
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  let matches = 0;
  for (const char of shorter) {
    if (longer.includes(char)) matches++;
  }

  return matches / longer.length;
}

/**
 * Find the best matching result from search results based on parsed filename.
 * @param {Array} results - Search results from parseSearchResults
 * @param {object} parsedFilename - Output from parseFilename
 * @returns {object|null} Best match or null if no good match
 */
function findBestMatch(results, parsedFilename) {
  if (!results || results.length === 0) return null;

  let bestScore = 0;
  let bestResult = null;

  for (const result of results) {
    let score = 0;

    // Title similarity (most important factor)
    const titleSimilarity = stringSimilarity(parsedFilename.title, result.title);
    score += titleSimilarity * 100;

    // Year match bonus
    if (parsedFilename.year && result.year === parsedFilename.year) {
      score += 50;
    } else if (parsedFilename.year && result.year) {
      // Partial year match (within 1-2 years)
      const yearDiff = Math.abs(parseInt(parsedFilename.year) - parseInt(result.year));
      if (yearDiff <= 1) score += 20;
      else if (yearDiff <= 2) score += 10;
    }

    // Rating bonus (prefer higher rated)
    if (result.rating) {
      const ratingNum = parseFloat(result.rating);
      if (!isNaN(ratingNum)) {
        score += ratingNum * 5;
      }
    }

    // Exact title match bonus
    if (parsedFilename.title.toLowerCase() === result.title.toLowerCase()) {
      score += 30;
    }

    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
    }
  }

  // Minimum threshold to avoid false matches
  if (bestScore < 30) return null;

  return bestResult;
}

module.exports = { searchDouban, findBestMatch, parseSearchResults, stringSimilarity };
