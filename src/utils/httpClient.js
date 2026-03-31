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

async function fetchPage(url, retries = 3) {
  const ua = randomUA();

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
      if (result1.body.includes('v:itemreviewed') || result1.body.includes('id="info"')) {
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
      if (result2.body.includes('v:itemreviewed') || result2.body.includes('id="info"')) {
        return result2.body;
      }

      // If the POST redirect didn't land on the target, try one more GET
      const result3 = await fetchFollowRedirects(url, { ua }, result2.cookies);
      if (result3.body.includes('v:itemreviewed') || result3.body.includes('id="info"')) {
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

module.exports = { fetchPage };
