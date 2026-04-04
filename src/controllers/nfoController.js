const { validateDoubanUrl } = require('../utils/validator');
const { scrape } = require('../services/doubanScraper');
const { generate } = require('../services/nfoGenerator');
const { downloadImage } = require('../utils/httpClient');
const fs = require('fs');
const path = require('path');

async function parseDouban(req, res) {
  try {
    const { url } = req.body;
    const validation = validateDoubanUrl(url);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const data = await scrape(url, { requestInterval: 3 });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Parse error:', err.message);
    const status = err.message.includes('404') ? 404
      : err.message.includes('403') ? 503
      : err.message.includes('超时') ? 503
      : 500;
    res.status(status).json({ success: false, error: err.message });
  }
}

async function generateNfo(req, res) {
  try {
    const { url, data: inputData, type, downloadImages, targetDir } = req.body;
    let data;

    if (inputData) {
      data = inputData;
      if (type) data.type = type;
    } else if (url) {
      const validation = validateDoubanUrl(url);
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error });
      }
      data = await scrape(url, { requestInterval: 3 });
      if (type) data.type = type;
    } else {
      return res.status(400).json({ success: false, error: '请提供豆瓣 URL 或影视数据' });
    }

    // Download images to local files if requested
    let localPoster = '';
    let localFanart = '';

    if (downloadImages && targetDir) {
      // Ensure target directory exists
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Download poster
      if (data.poster) {
        const posterPath = path.join(targetDir, 'poster.jpg');
        const success = await downloadImage(data.poster, posterPath);
        if (success) {
          localPoster = 'poster.jpg';
        }
      }

      // Download fanart
      if (data.fanart) {
        const fanartPath = path.join(targetDir, 'fanart.jpg');
        const success = await downloadImage(data.fanart, fanartPath);
        if (success) {
          localFanart = 'fanart.jpg';
        }
      }

      // Update data to use local paths if download succeeded
      if (localPoster) {
        data.poster = localPoster;
      }
      if (localFanart) {
        data.fanart = localFanart;
      }
    }

    const { xml, filename } = generate(data);

    // If downloading images, return both NFO and image paths
    if (downloadImages && targetDir) {
      return res.json({
        success: true,
        xml,
        filename,
        images: {
          poster: localPoster || null,
          fanart: localFanart || null,
        }
      });
    }

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(xml);
  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { parseDouban, generateNfo };
