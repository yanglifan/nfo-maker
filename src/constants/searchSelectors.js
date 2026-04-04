/**
 * CSS selectors for Douban search results page.
 */
const SEARCH_SELECTORS = {
  // Search result list container
  RESULT_LIST: '.search-list',

  // Single result item
  RESULT_ITEM: '.result',

  // Title link (contains subject URL)
  RESULT_LINK: 'a[href*="/subject/"]',

  // Title text
  TITLE: 'h3 a, .title a, a[href*="/subject/"]',

  // Year and cast info
  CAST_INFO: '.rating_kt',
  YEAR: '.year',

  // Rating
  RATING: '.rating_num',

  // Subject URL pattern for ID extraction
  SUBJECT_URL_PATTERN: /subject\/(\d+)/,
};

module.exports = { SEARCH_SELECTORS };
