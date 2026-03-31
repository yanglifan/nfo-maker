const urlInput = document.getElementById('urlInput');
const parseBtn = document.getElementById('parseBtn');
const errorMsg = document.getElementById('errorMsg');
const loading = document.getElementById('loading');
const previewSection = document.getElementById('previewSection');
const downloadBtn = document.getElementById('downloadBtn');
const copyBtn = document.getElementById('copyBtn');
const typeMovie = document.getElementById('typeMovie');
const typeTvshow = document.getElementById('typeTvshow');
const xmlPreview = document.getElementById('xmlPreview');
const xmlContent = document.getElementById('xmlContent');

const DOUBAN_URL_REGEX = /^https?:\/\/(www\.)?movie\.douban\.com\/subject\/(\d+)\/?/;

let currentData = null;
let currentXml = '';

// Parse button click
parseBtn.addEventListener('click', handleParse);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleParse();
});

// Download button
downloadBtn.addEventListener('click', handleDownload);

// Copy button
copyBtn.addEventListener('click', handleCopy);

// Type switch
typeMovie.addEventListener('change', handleTypeChange);
typeTvshow.addEventListener('change', handleTypeChange);

async function handleParse() {
  const url = urlInput.value.trim();

  // Frontend validation
  if (!url) {
    showError('请输入豆瓣电影/剧集 URL');
    return;
  }
  if (!DOUBAN_URL_REGEX.test(url)) {
    showError('URL 格式不正确，请输入豆瓣电影链接，如: https://movie.douban.com/subject/1292052/');
    return;
  }

  hideError();
  hidePreview();
  showLoading();
  disableInput(true);

  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const result = await response.json();

    if (!result.success) {
      showError(result.error || '解析失败，请重试');
      return;
    }

    currentData = result.data;
    renderPreview(currentData);
    await generateXmlPreview();
  } catch (err) {
    showError('网络请求失败，请检查网络连接后重试');
  } finally {
    hideLoading();
    disableInput(false);
  }
}

function renderPreview(data) {
  // Poster
  const posterEl = document.getElementById('previewPoster');
  if (data.poster) {
    posterEl.src = data.poster;
    posterEl.style.display = 'block';
  } else {
    posterEl.style.display = 'none';
  }

  // Title
  document.getElementById('previewTitle').textContent = data.title || '';
  document.getElementById('previewOrigTitle').textContent = data.originalTitle || '';

  // Info fields
  document.getElementById('previewGenres').textContent = (data.genres || []).join(' / ') || '-';
  document.getElementById('previewDirectors').textContent = (data.directors || []).join(' / ') || '-';
  document.getElementById('previewWriters').textContent = (data.writers || []).join(' / ') || '-';
  document.getElementById('previewYear').textContent = data.year || '-';
  document.getElementById('previewRating').textContent = data.rating ? `${data.rating} / 10` : '-';
  document.getElementById('previewCountries').textContent = (data.countries || []).join(' / ') || '-';
  document.getElementById('previewRuntime').textContent = data.runtime ? `${data.runtime} 分钟` : '-';

  // Episodes (TV show only)
  const episodesRow = document.getElementById('episodesRow');
  if (data.episodes) {
    document.getElementById('previewEpisodes').textContent = data.episodes;
    episodesRow.style.display = '';
  } else {
    episodesRow.style.display = 'none';
  }

  // Plot
  document.getElementById('previewPlot').textContent = data.plot || '暂无简介';

  // Actors
  const actorNames = (data.actors || []).map(a => a.name).join(' / ');
  document.getElementById('previewActors').textContent = actorNames || '-';

  // Type switch
  if (data.type === 'tvshow') {
    typeTvshow.checked = true;
  } else {
    typeMovie.checked = true;
  }

  previewSection.style.display = '';
}

async function generateXmlPreview() {
  if (!currentData) return;

  const type = document.querySelector('input[name="nfoType"]:checked').value;

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: currentData, type }),
    });

    currentXml = await response.text();
    xmlContent.textContent = currentXml;
    xmlPreview.style.display = '';
  } catch (err) {
    console.error('Failed to generate XML preview:', err);
  }
}

function handleTypeChange() {
  if (currentData) {
    generateXmlPreview();
  }
}

function handleDownload() {
  if (!currentXml) return;

  const type = document.querySelector('input[name="nfoType"]:checked').value;
  const filename = type === 'tvshow' ? 'tvshow.nfo' : 'movie.nfo';

  const blob = new Blob([currentXml], { type: 'application/xml; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function handleCopy() {
  if (!currentXml) return;

  try {
    await navigator.clipboard.writeText(currentXml);
    const origText = copyBtn.textContent;
    copyBtn.textContent = '已复制!';
    setTimeout(() => { copyBtn.textContent = origText; }, 2000);
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = currentXml;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);

    const origText = copyBtn.textContent;
    copyBtn.textContent = '已复制!';
    setTimeout(() => { copyBtn.textContent = origText; }, 2000);
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = '';
}

function hideError() {
  errorMsg.style.display = 'none';
}

function showLoading() {
  loading.style.display = '';
}

function hideLoading() {
  loading.style.display = 'none';
}

function hidePreview() {
  previewSection.style.display = 'none';
  xmlPreview.style.display = 'none';
  currentXml = '';
}

function disableInput(disabled) {
  urlInput.disabled = disabled;
  parseBtn.disabled = disabled;
  parseBtn.textContent = disabled ? '解析中...' : '解析';
}
