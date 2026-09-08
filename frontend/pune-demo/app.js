(() => {
  'use strict';

  const API = (() => {
    const q = new URLSearchParams(location.search).get('api');
    if (q) return q.replace(/\/$/, '');
    if (location.hostname.endsWith('.app.github.dev')) return `https://${location.hostname.replace(/-\d+\.app\.github\.dev$/, '-8000.app.github.dev')}`;
    return 'http://localhost:8000';
  })();

  const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const TOKENS = [...BASE36].flatMap(a => [...BASE36].map(b => a + b)).filter(t => /[A-Z]/.test(t) && /[0-9]/.test(t)).slice(0, 100);
  const ROOT = 'A016Y8';
  const PARENT_PATH = [76, 2];
  const PILOT_BOUNDS = [[18.5071852443, 73.8073803738], [18.5080371001, 73.8082786891]];
  const STATUS = {
    GREEN: { cls: 'green', color: '#22c55e', label: 'Green — 19–21 / 21 fields' },
    YELLOW: { cls: 'yellow', color: '#facc15', label: 'Yellow — 15–18 / 21 fields' },
    RED: { cls: 'red', color: '#ef4444', label: 'Red — fewer than 15 / 21 fields' },
    WHITE: { cls: 'white', color: '#ffffff', label: 'White — not searched / controversial boundary' }
  };

  const map = L.map('map', { zoomControl: true, minZoom: 15, maxZoom: 22, center: [18.507611, 73.807829], zoom: 20 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22, attribution: '© OpenStreetMap contributors' }).addTo(map);
  map.fitBounds(PILOT_BOUNDS, { padding: [40, 40], animate: false });

  const searchControl = L.control({ position: 'topleft' });
  searchControl.onAdd = () => {
    const el = L.DomUtil.create('div', 'pune-search-control leaflet-control');
    el.innerHTML = `<form id="puneSearchForm" class="pune-search-form" autocomplete="off"><input id="puneAluSearch" type="search" placeholder="Enter ALU code" aria-label="Enter ALU code"><button type="submit">Search</button></form><div id="puneSearchHint" class="pune-search-hint">Search the 6-character root + hierarchy segments.</div>`;
    L.DomEvent.disableClickPropagation(el);
    return el;
  };
  searchControl.addTo(map);

  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const el = L.DomUtil.create('div', 'pune-legend leaflet-control');
    el.innerHTML = `<strong>ALU data completeness</strong><div><i class="swatch green"></i> Green — 19–21 of 21 fields</div><div><i class="swatch yellow"></i> Yellow — 15–18 of 21 fields</div><div><i class="swatch red"></i> Red — fewer than 15 of 21 fields</div><div><i class="swatch white"></i> White — not searched / controversial boundary</div>`;
    return el;
  };
  legend.addTo(map);

  const pilotCard = L.control({ position: 'bottomleft' });
  pilotCard.onAdd = () => {
    const el = L.DomUtil.create('div', 'pune-info-control leaflet-control');
    el.innerHTML = `<strong>Kothrud / Kothrud-South</strong><span>Prepared pilot · 10,000 × 1 m² ALUs · 100,000 × 0.1 m² logical</span>`;
    return el;
  };
  pilotCard.addTo(map);

  const canvas = L.DomUtil.create('canvas', 'pune-coverage-canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:445;pointer-events:auto;';
  map.getPane('overlayPane').appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

  function stableAvailable(row, col) {
    const v = (row * 37 + col * 17 + row * col * 3) % 100;
    if (v < 55) return 19 + ((row + col) % 3);
    if (v < 82) return 15 + ((row * 3 + col) % 4);
    return 8 + ((row * 5 + col * 7) % 7);
  }
  function classify(n) { return n >= 19 ? 'GREEN' : n >= 15 ? 'YELLOW' : 'RED'; }
  function aluId(row, col) {
    const tenM = Math.floor(row / 10) * 10 + Math.floor(col / 10);
    const oneM = (row % 10) * 10 + (col % 10);
    return [ROOT, TOKENS[PARENT_PATH[0]], TOKENS[PARENT_PATH[1]], TOKENS[tenM], TOKENS[oneM]].join('-');
  }

  const cells = [];
  for (let row = 0; row < 100; row++) {
    for (let col = 0; col < 100; col++) {
      const available = stableAvailable(row, col);
      cells.push({ row, col, alu_id: aluId(row, col), available_fields: available, total_fields: 21, status: classify(available) });
    }
  }
  const cellById = new Map(cells.map(c => [c.alu_id, c]));

  function resizeCanvas() {
    const size = map.getSize(), d = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(size.x)), height = Math.max(1, Math.floor(size.y));
    if (canvas.width !== Math.floor(width * d) || canvas.height !== Math.floor(height * d)) { canvas.width = Math.floor(width * d); canvas.height = Math.floor(height * d); }
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; ctx.setTransform(d, 0, 0, d, 0, 0);
    return size;
  }

  function draw() {
    const size = resizeCanvas();
    ctx.clearRect(0, 0, size.x, size.y);
    const sw = map.latLngToContainerPoint(L.latLng(PILOT_BOUNDS[0][0], PILOT_BOUNDS[0][1]));
    const ne = map.latLngToContainerPoint(L.latLng(PILOT_BOUNDS[1][0], PILOT_BOUNDS[1][1]));
    const width = ne.x - sw.x, height = sw.y - ne.y;
    if (width <= 0 || height <= 0) return;
    const cw = width / 100, ch = height / 100;

    for (const cell of cells) {
      const x = sw.x + cell.col * cw, y = ne.y + cell.row * ch;
      if (x > size.x || y > size.y || x + cw < 0 || y + ch < 0) continue;
      const meta = STATUS[cell.status];
      ctx.globalAlpha = .66;
      ctx.fillStyle = meta.color;
      ctx.fillRect(x, y, Math.max(1, cw + .2), Math.max(1, ch + .2));
    }
    ctx.globalAlpha = 1;
    if (cw >= 3) {
      ctx.strokeStyle = 'rgba(30,41,59,.35)'; ctx.lineWidth = .45; ctx.beginPath();
      for (let i = 0; i <= 100; i++) { const x = sw.x + i * cw; ctx.moveTo(x, ne.y); ctx.lineTo(x, sw.y); }
      for (let i = 0; i <= 100; i++) { const y = ne.y + i * ch; ctx.moveTo(sw.x, y); ctx.lineTo(ne.x, y); }
      ctx.stroke();
    }
  }
  let raf = 0;
  function scheduleDraw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
  map.on('move zoom resize', scheduleDraw);
  window.addEventListener('resize', scheduleDraw, { passive: true });

  function cellAt(latlng) {
    if (latlng.lat < PILOT_BOUNDS[0][0] || latlng.lat > PILOT_BOUNDS[1][0] || latlng.lng < PILOT_BOUNDS[0][1] || latlng.lng > PILOT_BOUNDS[1][1]) return null;
    const row = Math.max(0, Math.min(99, Math.floor((latlng.lat - PILOT_BOUNDS[0][0]) / (PILOT_BOUNDS[1][0] - PILOT_BOUNDS[0][0]) * 100)));
    const col = Math.max(0, Math.min(99, Math.floor((latlng.lng - PILOT_BOUNDS[0][1]) / (PILOT_BOUNDS[1][1] - PILOT_BOUNDS[0][1]) * 100)));
    return cells[row * 100 + col] || null;
  }

  function esc(v) { return String(v ?? 'N/D').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c])); }
  function fieldClass(s) { return s === 'N/D' ? 'red' : s === 'N/A' ? 'gray' : 'green'; }

  function openModal(detail) {
    const old = document.getElementById('aluDetailModal'); if (old) old.remove();
    const key = detail.coverage_status || classify(Number(detail.available_fields || 0));
    const meta = STATUS[key] || STATUS.RED;
    const available = Number(detail.available_fields || 0);
    const modal = document.createElement('div'); modal.id = 'aluDetailModal'; modal.className = 'alu-detail-modal';
    modal.innerHTML = `<div class="alu-detail-backdrop"></div><div class="alu-detail-panel"><button class="alu-detail-close" aria-label="Close">×</button><div class="alu-detail-head"><div><div class="alu-detail-kicker">ALU DETAILS · PUNE PILOT</div><h2>${esc(detail.alu)}</h2><p>${esc(detail.grid_level || '1 m²')} · deterministic project spatial index</p></div><span class="pill ${meta.cls}">${esc(meta.label)}</span></div><div class="coverage-score"><strong>${available}/21 fields available</strong><span>${esc(meta.label)}</span><small>Only fields marked N/D or N/A are excluded.</small></div><div class="alu-parent"><div><b>Parent ULPIN</b><strong>${esc(detail.ulpin)}</strong></div><span>Demo reference only — no government ULPIN imported.</span></div><div class="alu-meta"><div><b>Location</b><span>${esc(detail.location?.locality)}, ${esc(detail.location?.district)}, ${esc(detail.location?.state)}</span></div><div><b>ALU ID</b><span>${esc(detail.alu)}</span></div><div><b>Grid Level</b><span>${esc(detail.grid_level || '1 m²')}</span></div><div><b>Coordinates</b><span>${esc(detail.location?.lat)}° N · ${esc(detail.location?.lng)}° E</span></div><div><b>Display tolerance</b><span>${esc(detail.accuracy)}</span></div><div><b>AI confidence</b><span>${esc(detail.ai_confidence)}</span></div></div><div class="alu-fields">${(detail.fields || []).map(f => { const c=fieldClass(f.status); const shown=f.status==='N/D'?'N/D — not publicly verified':f.status==='N/A'?'N/A — not applicable':f.value; return `<article class="alu-field ${c}"><div class="alu-field-top"><b>${esc(f.label)}</b><span class="pill ${c}">${esc(f.status)}</span></div><div class="alu-field-value">${esc(shown).replace(/\n/g,'<br>')}</div><small>${esc(f.source)}</small></article>`; }).join('')}</div><div class="alu-demo-note">${esc(detail.note || 'Deterministic fictional demo attributes for reconciliation testing.')}</div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('.alu-detail-backdrop').onclick = () => modal.remove();
    modal.querySelector('.alu-detail-close').onclick = () => modal.remove();
  }

  async function showDetails(id) {
    try {
      const r = await fetch(API + `/api/v1/pune-demo/alu-catalog/cells/${encodeURIComponent(id)}/details`, { cache: 'force-cache' });
      if (!r.ok) throw new Error('detail unavailable');
      openModal(await r.json());
    } catch (_) {
      const cell = cellById.get(id);
      openModal({
        alu: id, grid_level: '1 m²', available_fields: cell?.available_fields || 0,
        coverage_status: cell ? classify(cell.available_fields) : 'RED',
        ulpin: 'N/D — government ULPIN not imported into fictional demo',
        location: { locality: 'Kothrud', district: 'Pune', state: 'Maharashtra', lat: 18.507611, lng: 73.807829 },
        accuracy: '±0.05 m display tolerance — not a survey accuracy claim', ai_confidence: 'DEMO',
        fields: Array.from({length:21}, (_,i) => ({ label: `${i+1}. Information field`, status: i < (cell?.available_fields || 0) ? 'AVAILABLE' : 'N/D', value: i < (cell?.available_fields || 0) ? 'Deterministic demo value' : '', source: 'Demo reconciliation layer' })),
        note: 'Backend detail was unavailable; this fallback keeps the same deterministic map coverage score.'
      });
    }
  }

  canvas.addEventListener('click', e => { const cell = cellAt(map.containerPointToLatLng([e.offsetX, e.offsetY])); if (cell) showDetails(cell.alu_id); });

  document.addEventListener('submit', e => {
    if (e.target?.id !== 'puneSearchForm') return;
    e.preventDefault();
    const q = document.getElementById('puneAluSearch').value.trim().toUpperCase();
    const hint = document.getElementById('puneSearchHint');
    const cell = cellById.get(q);
    if (!cell) { hint.textContent = 'ALU not found in the 10,000-cell Pune pilot catalog.'; return; }
    const lat = PILOT_BOUNDS[0][0] + (PILOT_BOUNDS[1][0] - PILOT_BOUNDS[0][0]) * (cell.row + .5) / 100;
    const lng = PILOT_BOUNDS[0][1] + (PILOT_BOUNDS[1][1] - PILOT_BOUNDS[0][1]) * (cell.col + .5) / 100;
    map.setView([lat, lng], 22, { animate: true });
    hint.textContent = `${cell.alu_id} · ${STATUS[cell.status].label}`;
    showDetails(cell.alu_id);
  });

  // The 10,000-cell visual loads immediately without waiting for the API.
  // The API then replaces the provisional colors with its exact 21-field classification.
  scheduleDraw();
  fetch(API + '/api/v1/pune-demo/alu-catalog/coverage-grid?level=1m2', { cache: 'force-cache' })
    .then(r => r.ok ? r.json() : null).then(data => {
      if (!data?.items) return;
      for (const item of data.items) {
        const cell = cellById.get(item.alu_id); if (!cell) continue;
        cell.status = item.status; cell.available_fields = item.available_fields; cell.total_fields = item.total_fields || 21;
      }
      scheduleDraw();
    }).catch(() => {});
})();
