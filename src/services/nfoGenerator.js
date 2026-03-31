/**
 * Escape special XML characters in text content.
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate a single XML element line.
 */
function xmlTag(tag, value, indent = '  ') {
  if (value === null || value === undefined || value === '') return '';
  return `${indent}<${tag}>${escapeXml(value)}</${tag}>\n`;
}

/**
 * Generate NFO XML from structured data.
 * @param {object} data - Parsed douban data
 * @returns {{ xml: string, filename: string }}
 */
function generate(data) {
  const type = data.type || 'movie';
  const rootTag = type === 'tvshow' ? 'tvshow' : 'movie';
  const filename = type === 'tvshow' ? 'tvshow.nfo' : 'movie.nfo';

  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  xml += `<${rootTag}>\n`;

  // Title
  xml += xmlTag('title', data.title);
  xml += xmlTag('originaltitle', data.originalTitle || data.title);

  // Year and date
  xml += xmlTag('year', data.year);
  xml += xmlTag('releasedate', data.releaseDate);

  // Plot
  xml += xmlTag('plot', data.plot);

  // Rating
  xml += xmlTag('rating', data.rating);

  // Douban ID
  if (data.doubanId) {
    xml += `  <uniqueid type="douban">${escapeXml(data.doubanId)}</uniqueid>\n`;
    xml += xmlTag('doubanid', data.doubanId);
  }

  // Genres
  if (data.genres && data.genres.length > 0) {
    for (const genre of data.genres) {
      xml += xmlTag('genre', genre);
    }
  }

  // Directors
  if (data.directors && data.directors.length > 0) {
    for (const director of data.directors) {
      xml += xmlTag('director', director);
    }
  }

  // Writers (credits) - for movies
  if (data.writers && data.writers.length > 0) {
    for (const writer of data.writers) {
      xml += xmlTag('credits', writer);
    }
  }

  // Actors
  if (data.actors && data.actors.length > 0) {
    for (const actor of data.actors) {
      xml += '  <actor>\n';
      xml += xmlTag('name', actor.name, '    ');
      xml += xmlTag('role', actor.role, '    ');
      xml += '  </actor>\n';
    }
  }

  // Countries
  if (data.countries && data.countries.length > 0) {
    for (const country of data.countries) {
      xml += xmlTag('country', country);
    }
  }

  // Runtime
  xml += xmlTag('runtime', data.runtime);

  // Episodes (TV shows only)
  if (type === 'tvshow' && data.episodes) {
    xml += xmlTag('episodes', data.episodes);
  }

  // Poster
  xml += xmlTag('poster', data.poster);

  xml += `</${rootTag}>\n`;

  return { xml, filename };
}

module.exports = { generate };
