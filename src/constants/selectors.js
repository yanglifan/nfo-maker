const SELECTORS = {
  TITLE: 'h1 > span[property="v:itemreviewed"]',
  YEAR: 'h1 .year',
  DIRECTOR: 'a[rel="v:directedBy"]',
  STARRING: 'a[rel="v:starring"]',
  GENRE: 'span[property="v:genre"]',
  RELEASE_DATE: 'span[property="v:initialReleaseDate"]',
  RUNTIME: 'span[property="v:runtime"]',
  RATING: 'strong[property="v:average"]',
  SUMMARY: 'span[property="v:summary"]',
  POSTER: '#mainpic img',
  INFO_BLOCK: '#info',
  INFO_LABEL: 'span.pl',
};

module.exports = { SELECTORS };
