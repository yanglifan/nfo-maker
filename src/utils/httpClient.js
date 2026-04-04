const fetch = require('node-fetch');
const crypto = require('crypto');
const cheerio = require('cheerio');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function randomBid() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let bid = '';
  for (let i = 0; i < 11; i++) {
    bid += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return bid;
}

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sha512(str) {
  return crypto.createHash('sha512').update(str, 'utf8').digest('hex');
}

function solveChallenge(challenge, difficulty = 4) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  while (true) {
    nonce++;
    const hash = sha512(challenge + nonce);
    if (hash.substring(0, difficulty) === target) {
      return nonce;
    }
  }
}

function extractChallenge(html) {
  if (!html.includes('id="sec"') || !html.includes('id="tok"')) {
    return null;
  }
  const $ = cheerio.load(html);
  const tok = $('#tok').val();
  const cha = $('#cha').val();
  const red = $('#red').val();
  if (!tok || !cha) return null;
  return { tok, cha, red };
}

/**
 * Follow redirects manually, collecting cookies across domains.
 * Returns { status, body, cookies, finalUrl }
 */
async function fetchFollowRedirects(url, options, cookies) {
  const ua = options.ua || randomUA();
  let currentUrl = url;
  let cookieStr = cookies || '';

  for (let i = 0; i < 5; i++) {
    const resp = await fetch(currentUrl, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cookie': cookieStr,
        ...(options.extraHeaders || {}),
      },
      body: options.body || undefined,
      timeout: 15000,
      redirect: 'manual',
    });

    // Collect cookies
    const setCookies = resp.headers.raw()['set-cookie'] || [];
    for (const sc of setCookies) {
      const kv = sc.split(';')[0].trim();
      cookieStr += '; ' + kv;
    }

    if ([301, 302, 303, 307].includes(resp.status)) {
      const location = resp.headers.get('location');
      await resp.text(); // consume body
      if (!location) break;
      currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
      // Switch to GET after redirect (except 307)
      if (resp.status !== 307) {
        options = { ...options, method: 'GET', body: undefined, extraHeaders: {} };
      }
      continue;
    }

    const body = await resp.text();
    return { status: resp.status, body, cookies: cookieStr, finalUrl: currentUrl };
  }

  throw new Error('重定向次数过多');
}

/**
 * Default content validator for movie/TV show main pages.
 */
function defaultContentValidator(body) {
  return body.includes('v:itemreviewed') || body.includes('id="info"');
}

async function fetchPage(url, retries = 3, contentValidator) {
  const ua = randomUA();
  const isValidContent = contentValidator || defaultContentValidator;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const cookies = `bid=${randomBid()}`;

      // Step 1: GET the target URL, follow redirects
      const result1 = await fetchFollowRedirects(url, { ua }, cookies);

      if (result1.status === 404) {
        throw new Error('豆瓣页面不存在 (404)');
      }
      if (result1.status === 403) {
        throw new Error('豆瓣访问被限制 (403)');
      }

      // Check if we got the real page directly
      if (isValidContent(result1.body)) {
        return result1.body;
      }

      // Check for challenge page
      const challenge = extractChallenge(result1.body);
      if (!challenge) {
        // Unknown page, retry
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, attempt * 2000));
          continue;
        }
        throw new Error('无法解析豆瓣页面，请稍后再试');
      }

      // Step 2: Solve the proof-of-work
      const nonce = solveChallenge(challenge.cha, 4);

      // Step 3: POST solution to the challenge page's domain (sec.douban.com)
      const challengeOrigin = new URL(result1.finalUrl).origin;
      const postUrl = challengeOrigin + '/c';

      const formBody = new URLSearchParams({
        tok: challenge.tok,
        cha: challenge.cha,
        sol: String(nonce),
        red: challenge.red || url,
      });

      const result2 = await fetchFollowRedirects(postUrl, {
        ua,
        method: 'POST',
        body: formBody.toString(),
        extraHeaders: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': challengeOrigin,
          'Referer': result1.finalUrl,
        },
      }, result1.cookies);

      // After POST + redirect, we should have the real page
      if (isValidContent(result2.body)) {
        return result2.body;
      }

      // If the POST redirect didn't land on the target, try one more GET
      const result3 = await fetchFollowRedirects(url, { ua }, result2.cookies);
      if (isValidContent(result3.body)) {
        return result3.body;
      }

      // Still failed
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 2000));
        continue;
      }
      throw new Error('豆瓣验证通过但页面获取失败，请重试');
    } catch (err) {
      if (err.type === 'request-timeout') {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, attempt * 1000));
          continue;
        }
        throw new Error('请求超时，请稍后再试');
      }
      if (attempt >= retries) throw err;
    }
  }
}

/**
 * Fetch actor photo from celebrity/personage page.
 * Returns the avatar URL or empty string.
 */
async function fetchCelebrityPhoto(celebUrl, retries = 2) {
  const ua = randomUA();
  const cookies = `bid=${randomBid()}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await fetchFollowRedirects(celebUrl, { ua }, cookies);

      if (result.status !== 200) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, attempt * 1000));
          continue;
        }
        return '';
      }

      // Check if we got a challenge page
      const challenge = extractChallenge(result.body);
      let finalBody = result.body;

      if (challenge) {
        // Solve the proof-of-work
        const nonce = solveChallenge(challenge.cha, 4);
        const challengeOrigin = new URL(result.finalUrl).origin;
        const postUrl = challengeOrigin + '/c';

        const formBody = new URLSearchParams({
          tok: challenge.tok,
          cha: challenge.cha,
          sol: String(nonce),
          red: challenge.red || celebUrl,
        });

        const result2 = await fetchFollowRedirects(postUrl, {
          ua,
          method: 'POST',
          body: formBody.toString(),
          extraHeaders: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': challengeOrigin,
            'Referer': result.finalUrl,
          },
        }, result.cookies);

        finalBody = result2.body;
      }

      const $ = cheerio.load(finalBody);
      // Actor avatar selector for personage page - use .avatar class
      const avatarEl = $('img.avatar');
      if (avatarEl.length) {
        let photoUrl = avatarEl.attr('src') || '';
        if (photoUrl) {
          // Convert medium size to large: /m/ -> /l/
          photoUrl = photoUrl.replace(/\/view\/celebrity\/m\//, '/view/celebrity/l/');
          return photoUrl;
        }
      }

      return '';
    } catch {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 1000));
        continue;
      }
      return '';
    }
  }
}

/**
 * Fetch landscape fanart from movie/TV show photos page.
 * Returns the first large photo URL (landscape-oriented) or empty string.
 */
async function fetchFanart(photosUrl, retries = 2) {
  const ua = randomUA();
  const cookies = `bid=${randomBid()}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await fetchFollowRedirects(photosUrl, { ua }, cookies);

      if (result.status !== 200) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, attempt * 1000));
          continue;
        }
        return '';
      }

      // Check if we got a challenge page
      const challenge = extractChallenge(result.body);
      let finalBody = result.body;

      if (challenge) {
        // Solve the proof-of-work
        const nonce = solveChallenge(challenge.cha, 4);
        const challengeOrigin = new URL(result.finalUrl).origin;
        const postUrl = challengeOrigin + '/c';

        const formBody = new URLSearchParams({
          tok: challenge.tok,
          cha: challenge.cha,
          sol: String(nonce),
          red: challenge.red || photosUrl,
        });

        const result2 = await fetchFollowRedirects(postUrl, {
          ua,
          method: 'POST',
          body: formBody.toString(),
          extraHeaders: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': challengeOrigin,
            'Referer': result.finalUrl,
          },
        }, result.cookies);

        finalBody = result2.body;
      }

      const $ = cheerio.load(finalBody);
      // Find photos - typically in .article .photo-item or similar structure
      // Try to get the first large image from the photos page
      let fanartUrl = '';

      // Try selector for large photo (poster section usually has larger images)
      const largePhoto = $('.article a.cover').first();
      if (largePhoto.length) {
        fanartUrl = largePhoto.attr('href') || '';
        // The href might be the photo detail page, we need the actual image
        if (fanartUrl) {
          // Extract image from photo detail page
          const imgResult = await fetchFollowRedirects(fanartUrl, { ua }, result.cookies);
          if (imgResult.status === 200) {
            const $$ = cheerio.load(imgResult.body);
            const img = $$('#mainpic img').first();
            if (img.length) {
              fanartUrl = img.attr('src') || '';
              // Convert to large size and webp format
              fanartUrl = fanartUrl.replace(/\/view\/photo\/[^/]+\//, '/view/photo/l/');
              fanartUrl = fanartUrl.replace(/\.(jpg|jpeg|png|gif)$/i, '.webp');
            }
          }
        }
      }

      // Fallback: try direct image from photos list
      if (!fanartUrl) {
        const photoImg = $('.article .photo-list img').first();
        if (photoImg.length) {
          fanartUrl = photoImg.attr('src') || '';
          // Convert to large size and webp format
          fanartUrl = fanartUrl.replace(/\/view\/photo\/[^/]+\//, '/view/photo/l/');
          fanartUrl = fanartUrl.replace(/\.(jpg|jpeg|png|gif)$/i, '.webp');
        }
      }

      return fanartUrl;
    } catch {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 1000));
        continue;
      }
      return '';
    }
  }
}

module.exports = { fetchPage, fetchCelebrityPhoto, fetchFanart, fetchFollowRedirects };
