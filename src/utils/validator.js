const DOUBAN_URL_REGEX = /^https?:\/\/(www\.)?movie\.douban\.com\/subject\/(\d+)\/?/;

function validateDoubanUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, doubanId: null, error: '请输入豆瓣电影/剧集 URL' };
  }

  const match = url.trim().match(DOUBAN_URL_REGEX);
  if (!match) {
    return {
      valid: false,
      doubanId: null,
      error: 'URL 格式不正确，请输入豆瓣电影链接，如: https://movie.douban.com/subject/1292052/'
    };
  }

  return { valid: true, doubanId: match[2], error: null };
}

module.exports = { validateDoubanUrl };
