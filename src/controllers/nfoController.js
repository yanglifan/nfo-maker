const { validateDoubanUrl } = require('../utils/validator');
const { scrape } = require('../services/doubanScraper');
const { generate } = require('../services/nfoGenerator');

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
    const { url, data: inputData, type } = req.body;
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

    const { xml, filename } = generate(data);

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
