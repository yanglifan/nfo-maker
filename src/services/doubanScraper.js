const { fetchPage, fetchCelebrityPhoto, fetchFanart } = require('../utils/httpClient');
const { parse } = require('./doubanParser');

/**
 * Fetch and populate actor photos from their celebrity pages.
 * Uses concurrent requests with controlled concurrency.
 * @param {object} data - Parsed douban data with actors that have celebUrl
 * @param {number} requestInterval - Seconds between request batches
 */
async function fetchActorPhotos(data, requestInterval = 3) {
  if (!data.actors || data.actors.length === 0) return;

  // Filter actors that have celebUrl
  const actorsToFetch = data.actors.filter(a => a.celebUrl);
  if (actorsToFetch.length === 0) return;

  // Fetch photos concurrently with limited concurrency
  const CONCURRENCY = 3; // max 3 concurrent requests
  const results = [];

  for (let i = 0; i < actorsToFetch.length; i += CONCURRENCY) {
    const batch = actorsToFetch.slice(i, i + CONCURRENCY);
    const batchPromises = batch.map(async (actor) => {
      try {
        const photoUrl = await fetchCelebrityPhoto(actor.celebUrl);
        return { actor, photoUrl };
      } catch {
        return { actor, photoUrl: '' };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Wait between batches
    if (i + CONCURRENCY < actorsToFetch.length && requestInterval > 0) {
      await new Promise(resolve => setTimeout(resolve, requestInterval * 1000));
    }
  }

  // Apply results to original actors array
  for (const { actor, photoUrl } of results) {
    if (photoUrl) {
      actor.thumb = photoUrl;
    }
  }
}

/**
 * Fetch and parse a Douban movie/TV page.
 * @param {string} url - Douban subject URL
 * @param {object} options - { requestInterval }
 * @returns {Promise<object>} Parsed structured data
 */
async function scrape(url, options = {}) {
  const { requestInterval = 3 } = options;
  const html = await fetchPage(url);
  const data = parse(html, url);

  // Fetch actor photos if actors have celebUrl
  await fetchActorPhotos(data, requestInterval);

  // Fetch fanart (landscape cover) - pass already-fetched HTML to avoid re-fetching
  data.fanart = await fetchFanart(url, html);

  return data;
}

module.exports = { scrape };
