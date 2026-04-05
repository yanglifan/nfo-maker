(function() {
  'use strict';

  // State
  let config = null;
  let status = null;
  let logs = [];
  let loadedCount = 0;
  const PAGE_SIZE = 30;
  let pollInterval = null;

  // DOM elements
  const $ = (sel) => document.querySelector(sel);

  // Init
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    await Promise.all([loadConfig(), loadStatus(), loadLogs()]);
    bindEvents();
    startPolling();
  }

  // API calls
  async function loadConfig() {
    try {
      const res = await fetch('/api/cron/config');
      const data = await res.json();
      if (data.success) {
        config = data.config;
        renderConfig(config);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }

  async function loadStatus() {
    try {
      const res = await fetch('/api/cron/status');
      const data = await res.json();
      if (data.success) {
        status = data.status;
        renderStatus(status);
      }
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  }

  async function loadLogs(append = false) {
    try {
      const res = await fetch(`/api/cron/logs?limit=${PAGE_SIZE}`);
      const data = await res.json();
      if (data.success) {
        if (append) {
          logs = logs.concat(data.logs);
        } else {
          logs = data.logs;
          loadedCount = data.logs.length;
        }
        renderLogs(logs, append);

        // Show/hide load more
        const btnMore = $('#btn-load-more');
        if (btnMore) {
          btnMore.style.display = data.logs.length >= PAGE_SIZE ? 'block' : 'none';
        }
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  }

  async function saveConfig(newConfig) {
    try {
      const res = await fetch('/api/cron/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await res.json();
      if (data.success) {
        showSaveMsg('配置已更新', 'success');
        await Promise.all([loadConfig(), loadStatus()]);
      } else {
        showSaveMsg(data.error || '保存失败', 'error');
      }
    } catch (err) {
      showSaveMsg('网络错误: ' + err.message, 'error');
    }
  }

  async function triggerScan() {
    const btn = $('#btn-scan');
    btn.disabled = true;
    btn.textContent = '扫描中...';

    try {
      const res = await fetch('/api/cron/scan', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showSaveMsg('扫描任务已启动', 'success');
        await loadStatus();
        // Refresh logs after a short delay
        setTimeout(() => loadLogs(), 2000);
      } else {
        showSaveMsg(data.message || '触发失败', 'error');
        btn.disabled = false;
        btn.textContent = '手动触发扫描';
      }
    } catch (err) {
      showSaveMsg('网络错误: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = '手动触发扫描';
    }
  }

  // Render functions
  function renderConfig(cfg) {
    if (!cfg) return;

    $('#cfg-enabled').checked = cfg.enabled;
    $('#cfg-cron').value = cfg.cron || '';
    $('#cfg-interval').value = cfg.requestInterval || 3;
    $('#cfg-limit').value = cfg.limit || 1000;
    $('#cfg-start').checked = cfg.scanOnStart !== false;

    renderScanDirs(cfg.scanDirs || []);
  }

  function renderScanDirs(dirs) {
    const container = $('#scan-dirs-list');
    container.innerHTML = '';
    dirs.forEach(dir => addScanDirRow(container, dir));

    if (dirs.length === 0) {
      addScanDirRow(container, '');
    }
  }

  function addScanDirRow(container, value) {
    const row = document.createElement('div');
    row.className = 'scan-dir-row';
    row.innerHTML = `
      <input type="text" placeholder="/path/to/media" value="${escapeHtml(value)}">
      <button type="button" class="btn-remove-dir">&times;</button>
    `;
    row.querySelector('.btn-remove-dir').addEventListener('click', () => {
      if (container.children.length > 1) {
        row.remove();
      }
    });
    container.appendChild(row);
  }

  function renderStatus(st) {
    if (!st) return;

    // Enabled status
    const elEnabled = $('#status-enabled');
    elEnabled.textContent = st.enabled ? '已启用' : '已禁用';
    elEnabled.style.color = st.enabled ? '' : '#999';

    // Running status
    const elRunning = $('#status-running');
    const cardRunning = $('#card-running');
    if (!st.enabled) {
      elRunning.textContent = '已禁用';
      cardRunning.className = 'status-card disabled';
    } else if (st.running) {
      elRunning.textContent = '扫描中';
      cardRunning.className = 'status-card running';
    } else {
      elRunning.textContent = '空闲';
      cardRunning.className = 'status-card idle';
    }

    // Next run
    const elNext = $('#status-next');
    if (st.nextRun && st.enabled) {
      elNext.textContent = formatDate(st.nextRun);
    } else {
      elNext.textContent = '--';
    }
  }

  function renderLogs(logEntries, append = false) {
    const tbody = $('#logs-body');
    if (!append) {
      tbody.innerHTML = '';
    }

    // Filter only scan_end entries for table rows
    const endLogs = logEntries.filter(l => l.type === 'scan_end');

    if (endLogs.length === 0 && !append) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;">暂无运行日志</td></tr>';
      return;
    }

    endLogs.forEach((entry, idx) => {
      const globalIdx = append ? tbody.children.length : idx;

      // Main row
      const tr = document.createElement('tr');
      tr.className = 'log-entry';
      tr.dataset.idx = globalIdx;

      const date = formatDateShort(entry.timestamp);
      const trigger = entry.trigger || 'unknown';
      const startTime = formatTime(entry.timestamp);
      const duration = formatDuration(entry.duration || 0);

      tr.innerHTML = `
        <td>${date}</td>
        <td><span class="trigger-badge ${trigger}">${triggerLabel(trigger)}</span></td>
        <td>${startTime}</td>
        <td>${duration}</td>
        <td>${entry.updatedDirs || 0}</td>
        <td>${entry.skippedDirs || 0}</td>
      `;

      tr.addEventListener('click', () => toggleLogDetail(tr, entry));

      tbody.appendChild(tr);

      // Detail row (hidden by default)
      const detailTr = document.createElement('tr');
      detailTr.className = 'log-detail-row';
      detailTr.dataset.parentIdx = globalIdx;

      let detailHtml = '<td colspan="6"><div class="log-detail-content">';
      if (entry.details && entry.details.length > 0) {
        entry.details.forEach(d => {
          const cls = d.status === 'error' ? 'error' : 'updated';
          detailHtml += `<div class="detail-dir ${cls}">`;
          detailHtml += `<strong>${escapeHtml(d.dir)}</strong> - `;
          detailHtml += `成功: ${d.success}, 失败: ${d.failed}`;
          if (d.error) {
            detailHtml += `<br>错误: ${escapeHtml(d.error)}`;
          }
          detailHtml += `</div>`;
        });
      } else {
        detailHtml += '<div class="detail-dir">无更新目录</div>';
      }
      detailHtml += '</div></td>';
      detailTr.innerHTML = detailHtml;

      tbody.appendChild(detailTr);
    });
  }

  function toggleLogDetail(tr, entry) {
    const idx = tr.dataset.idx;
    const detailRow = document.querySelector(`.log-detail-row[data-parent-idx="${idx}"]`);
    if (!detailRow) return;

    const isVisible = detailRow.classList.contains('visible');
    // Hide all others
    document.querySelectorAll('.log-detail-row.visible').forEach(r => r.classList.remove('visible'));
    document.querySelectorAll('.log-entry.expanded').forEach(r => r.classList.remove('expanded'));

    if (!isVisible) {
      detailRow.classList.add('visible');
      tr.classList.add('expanded');
    }
  }

  // Event bindings
  function bindEvents() {
    $('#config-form').addEventListener('submit', (e) => {
      e.preventDefault();
      handleSave();
    });

    $('#btn-scan').addEventListener('click', triggerScan);

    $('#btn-add-dir').addEventListener('click', () => {
      const container = $('#scan-dirs-list');
      addScanDirRow(container, '');
    });

    $('#btn-load-more').addEventListener('click', () => {
      loadLogs(true);
    });
  }

  function handleSave() {
    const dirs = [];
    document.querySelectorAll('#scan-dirs-list .scan-dir-row input').forEach(input => {
      const val = input.value.trim();
      if (val) dirs.push(val);
    });

    if (dirs.length === 0) {
      showSaveMsg('至少需要一个扫描目录', 'error');
      return;
    }

    const newConfig = {
      enabled: $('#cfg-enabled').checked,
      cron: $('#cfg-cron').value.trim(),
      scanDirs: dirs,
      requestInterval: parseInt($('#cfg-interval').value, 10) || 3,
      limit: parseInt($('#cfg-limit').value, 10) || 1000,
      scanOnStart: $('#cfg-start').checked
    };

    saveConfig(newConfig);
  }

  // Helpers
  function showSaveMsg(msg, type) {
    const el = $('#save-msg');
    el.textContent = msg;
    el.className = `save-msg ${type}`;
    setTimeout(() => { el.textContent = ''; }, 3000);
  }

  function formatDate(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${h}:${min}`;
  }

  function formatDateShort(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}-${day}`;
  }

  function formatTime(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  }

  function formatDuration(seconds) {
    if (!seconds) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) {
      return `${m}m${s}s`;
    }
    return `${s}s`;
  }

  function triggerLabel(trigger) {
    const labels = { cron: '定时', manual: '手动', startup: '启动' };
    return labels[trigger] || trigger;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Polling
  function startPolling() {
    stopPolling();
    pollInterval = setInterval(async () => {
      await loadStatus();

      // Adjust polling frequency based on running status
      if (status && status.running) {
        // If running, poll more frequently
        clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
          await loadStatus();
          if (!status || !status.running) {
            // Scan completed, refresh logs and resume normal polling
            await loadLogs();
            startPolling();
          }
        }, 5000);
      }
    }, 30000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

})();
