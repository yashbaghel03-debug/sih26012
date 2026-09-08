(() => {
  'use strict';

  const ROOT = 'A016Y8';
  const PARENT_PATH = [76, 2];
  const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const TOKENS = [...BASE36]
    .flatMap(a => [...BASE36].map(b => a + b))
    .filter(t => /[A-Z]/.test(t) && /[0-9]/.test(t))
    .slice(0, 100);
  const PILOT_BOUNDS = [[18.5071852443, 73.8073803738], [18.5080371001, 73.8082786891]];
  const API = (() => {
    const q = new URLSearchParams(location.search).get('api');
    if (q) return q.replace(/\/$/, '');
    if (location.hostname.endsWith('.app.github.dev')) return `https://${location.hostname.replace(/-\d+\.app\.github\.dev$/, '-8000.app.github.dev')}`;
    return 'http://localhost:8000';
  })();

  function makeAlu(row, col) {
    const tenM = Math.floor(row / 10) * 10 + Math.floor(col / 10);
    const oneM = (row % 10) * 10 + (col % 10);
    return [ROOT, TOKENS[PARENT_PATH[0]], TOKENS[PARENT_PATH[1]], TOKENS[tenM], TOKENS[oneM]].join('-');
  }

  function getCell(lat, lng) {
    if (lat < PILOT_BOUNDS[0][0] || lat > PILOT_BOUNDS[1][0] || lng < PILOT_BOUNDS[0][1] || lng > PILOT_BOUNDS[1][1]) return null;
    const row = Math.max(0, Math.min(99, Math.floor((lat - PILOT_BOUNDS[0][0]) / (PILOT_BOUNDS[1][0] - PILOT_BOUNDS[0][0]) * 100)));
    const col = Math.max(0, Math.min(99, Math.floor((lng - PILOT_BOUNDS[0][1]) / (PILOT_BOUNDS[1][1] - PILOT_BOUNDS[1][1] + (PILOT_BOUNDS[1][1] - PILOT_BOUNDS[0][1])) * 100)));
    return { row, col, alu: makeAlu(row, col) };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  }

  function install(map) {
    if (!map || map.__puneHoverInstalled) return;
    map.__puneHoverInstalled = true;

    const tooltip = L.DomUtil.create('div', 'pune-hover-tooltip');
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    let lastAlu = null;
    let requestId = 0;

    function position(e) {
      tooltip.style.left = `${e.clientX + 14}px`;
      tooltip.style.top = `${e.clientY + 14}px`;
    }

    async function update(cell, e) {
      if (!cell) {
        tooltip.style.display = 'none';
        lastAlu = null;
        return;
      }
      position(e);
      tooltip.style.display = 'block';
      tooltip.innerHTML = `<div class="pune-hover-title">ALU ID</div><strong>${escapeHtml(cell.alu)}</strong><div class="pune-hover-row"><span>ULPIN</span><b>Loading…</b></div>`;
      if (cell.alu === lastAlu) return;
      lastAlu = cell.alu;
      const id = ++requestId;
      try {
        const r = await fetch(`${API}/api/v1/pune-demo/alu-catalog/cells/${encodeURIComponent(cell.alu)}/details`, { cache: 'force-cache' });
        if (id !== requestId || cell.alu !== lastAlu) return;
        if (!r.ok) throw new Error('unavailable');
        const detail = await r.json();
        tooltip.innerHTML = `<div class="pune-hover-title">ALU ID</div><strong>${escapeHtml(detail.alu)}</strong><div class="pune-hover-row"><span>ULPIN</span><b>${escapeHtml(detail.ulpin)}</b></div><div class="pune-hover-row"><span>Coverage</span><b>${escapeHtml(detail.available_fields ?? 0)}/21 fields</b></div>`;
      } catch (_) {
        if (id !== requestId || cell.alu !== lastAlu) return;
        tooltip.innerHTML = `<div class="pune-hover-title">ALU ID</div><strong>${escapeHtml(cell.alu)}</strong><div class="pune-hover-row"><span>ULPIN</span><b>N/D — not imported</b></div>`;
      }
    }

    map.getContainer().addEventListener('mousemove', e => {
      const rect = map.getContainer().getBoundingClientRect();
      const point = map.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top]);
      update(getCell(point.lat, point.lng), e);
    });
    map.getContainer().addEventListener('mouseleave', () => { tooltip.style.display = 'none'; lastAlu = null; requestId++; });
  }

  const originalMap = L.map;
  L.map = function(...args) {
    const map = originalMap.apply(this, args);
    setTimeout(() => install(map), 0);
    return map;
  };
})();
