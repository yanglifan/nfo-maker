const { fetchPage } = require('../utils/httpClient');
const { parse } = require('./doubanParser');

/**
 * Fetch and parse a Douban movie/TV page.
 * @param {string} url - Douban subject URL
 * @returns {Promise<object>} Parsed structured data
 */
async function scrape(url) {
  const html = await fetchPage(url);
  const data = parse(html, url);
  return data;
}

module.exports = { scrape };
