/* Pune pilot integration layer.
 * Loaded before the India map renderer and captures the Leaflet map instance.
 * It keeps the national map unchanged at normal zooms, then reveals the
 * prepared Pune ALU coverage only after the user zooms into the pilot area.
 */
(() => {
  'use strict';
  if (!window.L || window.__sihPuneIntegrationInstalled) return;
  window.__sihPuneIntegrationInstalled = true;

  const API = (() => {
    const q = new URLSearchParams(location.search).get('api');
    if (q) return q.replace(/\/$/, '');
    if (location.hostname.endsWith('.app.github.dev')) {
      return `https://${location.hostname.replace(/-\d+\.app\.github\.dev$/, '-8000.app.github.dev')}`;
    }
    return 'http://localhost:8000';
  })();

  const PILOT = { center: [18.5074, 73.8077], zoomReveal: 12, gridReveal: 17 };
  const STATUS = {
    GREEN: '#22c55e',
    YELLOW: '#facc15',
    RED: '#ef4444',
    WHITE: '#ffffff'
  };
  const TOKENS = [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ']
    .flatMap(a => [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(b => a + b))
    .filter(t => /[A-Z]/.test(t) && /[0-9]/.test(t)).slice(0, 100);
  const parentBoundsFallback = [[18.5069,73.8072],[18.5079,73.8082]];

  let activeMap = null;
  let meta = null;
  let grid = null;
  let gridByKey = new Map();
  let canvas = null;
  let ctx = null;
  let frame = 0;
  let loading = false;
  let loaded = false;

  function pointInBounds(lat, lon, bounds) {
    return lat >= bounds[0][0] && lat <= bounds[1][0] && lon >= bounds[0][1] && lon <= bounds[1][1];
  }
  function nearPilot() {
    if (!activeMap) return false;
    const b = activeMap.getBounds();
    const pad = 0.18;
    return b.getNorth() >= PILOT.center[0] - pad && b.getSouth() <= PILOT.center[0] + pad &&
           b.getEast() >= PILOT.center[1] - pad && b.getWest() <= PILOT.center[1] + pad;
  }
  async function getJson(path) {
    const r = await fetch(API + path, { headers: { Accept: 'application/json' }, cache: 'force-cache' });
    if (!r.ok) throw Error(`Pune coverage HTTP ${r.status}`);
    return r.json();
  }
  function ensureCanvas() {
    if (canvas || !activeMap) return;
    canvas = document.createElement('canvas');
    canvas.className = 'pune-coverage-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:445;pointer-events:none;';
    activeMap.getPane('overlayPane').appendChild(canvas);
    ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  }
  function resizeCanvas() {
    const size = activeMap.getSize();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(size.x));
    const h = Math.max(1, Math.floor(size.y));
    if (canvas.width !== Math.floor(w * d) || canvas.height !== Math.floor(h * d)) {
      canvas.width = Math.floor(w * d);
      canvas.height = Math.floor(h * d);
    }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return [w, h];
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(draw); }
  function draw() {
    frame = 0;
    if (!ctx || !activeMap) return;
    const [w, h] = resizeCanvas();
    ctx.clearRect(0, 0, w, h);
    if (!meta || !nearPilot() || activeMap.getZoom() < PILOT.zoomReveal) return;

    const bounds = L.latLngBounds(meta.bbox || parentBoundsFallback);
    const sw = activeMap.latLngToContainerPoint(bounds.getSouthWest());
    const ne = activeMap.latLngToContainerPoint(bounds.getNorthEast());
    if (activeMap.getZoom() < PILOT.gridReveal || !grid) {
      ctx.globalAlpha = .15;
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.strokeRect(sw.x, ne.y, ne.x - sw.x, sw.y - ne.y);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      return;
    }

    const cellW = (ne.x - sw.x) / 100;
    const cellH = (sw.y - ne.y) / 100;
    if (cellW <= 0 || cellH <= 0) return;
    for (const item of grid) {
      const x = sw.x + item.col * cellW;
      const y = ne.y + item.row * cellH;
      if (x > w || y > h || x + cellW < 0 || y + cellH < 0) continue;
      ctx.fillStyle = STATUS[item.status] || STATUS.WHITE;
      ctx.globalAlpha = item.status === 'WHITE' ? .0 : .64;
      ctx.fillRect(x, y, Math.max(1, cellW + .25), Math.max(1, cellH + .25));
      if (cellW >= 3) {
        ctx.globalAlpha = .28;
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = .45;
        ctx.strokeRect(x, y, cellW, cellH);
      }
    }
    ctx.globalAlpha = 1;
  }

  async function loadCoverage() {
    if (loading || loaded || !activeMap || !nearPilot() || activeMap.getZoom() < PILOT.zoomReveal) return;
    loading = true;
    try {
      meta = await getJson('/api/v1/pune-demo/alu-catalog');
      if (activeMap.getZoom() >= PILOT.gridReveal && nearPilot()) {
        const compact = await getJson('/api/v1/pune-demo/alu-catalog/coverage-grid?level=1m2');
        grid = compact.items || [];
        gridByKey = new Map(grid.map(x => [`${x.row}:${x.col}`, x]));
      }
      loaded = true;
      ensureCanvas();
      schedule();
    } catch (e) {
      console.warn('Pune ALU coverage overlay unavailable:', e);
    } finally {
      loading = false;
    }
  }

  function pilotAluAt(lat, lon) {
    if (!meta || !pointInBounds(lat, lon, meta.bbox)) return null;
    const bounds = meta.bbox;
    const col = Math.max(0, Math.min(99, Math.floor((lon - bounds[0][1]) / (bounds[1][1] - bounds[0][1]) * 100)));
    const row = Math.max(0, Math.min(99, Math.floor((lat - bounds[0][0]) / (bounds[1][0] - bounds[0][0]) * 100)));
    const item = gridByKey.get(`${row}:${col}`);
    return item ? item.alu_id : null;
  }

  function setupMap(map) {
    if (!map || map.__sihPuneCoverageReady) return;
    map.__sihPuneCoverageReady = true;
    activeMap = map;
    ensureCanvas();
    map.on('zoom move resize', () => { loadCoverage(); schedule(); });
    map.on('click', e => {
      if (activeMap.getZoom() < 20 || !meta || !grid) return;
      const alu = pilotAluAt(e.latlng.lat, e.latlng.lng);
      if (!alu) return;
      const target = new URL('pune-demo/', location.href);
      target.searchParams.set('alu', alu);
      target.searchParams.set('from', 'india-map');
      window.location.href = target.href;
    });
    setTimeout(() => { loadCoverage(); schedule(); }, 1000);
  }

  const originalMap = L.map;
  L.map = function(...args) {
    const map = originalMap.apply(this, args);
    setTimeout(() => setupMap(map), 0);
    return map;
  };
})();
