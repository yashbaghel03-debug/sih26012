/* India WebGIS viewport renderer — hierarchical ALU cells only. */
const API_BASE = new URLSearchParams(location.search).get('api') || 'http://localhost:8000';
const INDIA_BOUNDS = [[6.5, 68], [37.5, 97.5]];
const R = 6378137;
const WORLD = 2 * Math.PI * R;
const ROOT_ORIGIN_X = 7570000;
const ROOT_ORIGIN_Y = 700000;
const ROOT_COLS = 4000;
const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const MAX_RENDER_CELLS = 28000;
const PADDING_CELLS = 2;
const MIN_VISIBLE_PX = 0.55;
const LEVELS = [
  { name: '1km2', label: '1 km²', side: 1000, depth: 0, triggerZoom: 7 },
  { name: '0.01km2', label: '0.01 km²', side: 100, depth: 1, triggerZoom: 11 },
  { name: '0.0001km2', label: '0.0001 km²', side: 10, depth: 2, triggerZoom: 15 },
  { name: '1m2', label: '1 m²', side: 1, depth: 3, triggerZoom: 19 },
  { name: '0.1m2', label: '0.1 m²', side: Math.sqrt(0.1), depth: 4, triggerZoom: 23 }
];
const CHILD_TOKENS = [];
for (const a of BASE36) for (const b of BASE36) {
  if ((/[A-Z]/.test(a) && /\d/.test(b)) || (/\d/.test(a) && /[A-Z]/.test(b))) CHILD_TOKENS.push(a + b);
}
const TOKEN_TO_INDEX = new Map(CHILD_TOKENS.slice(0, 100).map((v, i) => [v, i]));
const TERMINAL_PLACEMENTS = [
  [0.000, 0.000], [0.340, 0.000], [0.680, 0.000],
  [0.000, 0.340], [0.340, 0.340], [0.680, 0.340],
  [0.000, 0.680], [0.340, 0.680], [0.680, 0.680], [0.340, 0.340]
];
function b36(n, width) {
  let out = '';
  do { out = BASE36[n % 36] + out; n = Math.floor(n / 36); } while (n);
  return out.padStart(width, '0');
}
function rootCode(ix, iy) {
  const flat = iy * ROOT_COLS + ix;
  const bucket = Math.floor(flat / (36 ** 4));
  const remainder = flat % (36 ** 4);
  return `${ALPHABET[Math.floor(bucket / 10)]}${DIGITS[bucket % 10]}${b36(remainder, 4)}`;
}
function rootFromCode(code) {
  if (!/^[A-Z]\d[0-9A-Z]{4}$/.test(code)) throw new Error('Root ALU must be 6 characters and contain a letter plus a number.');
  const bucket = ALPHABET.indexOf(code[0]) * 10 + DIGITS.indexOf(code[1]);
  let remainder = 0;
  for (const ch of code.slice(2)) remainder = remainder * 36 + BASE36.indexOf(ch);
  const flat = bucket * (36 ** 4) + remainder;
  return { ix: flat % ROOT_COLS, iy: Math.floor(flat / ROOT_COLS) };
}
function cellId(ix, iy, path) { return [rootCode(ix, iy), ...path.map(i => CHILD_TOKENS[i])].join('-'); }
function merc(lat, lon) {
  lat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
}
function invMerc(x, y) {
  return [180 / Math.PI * (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2), 180 / Math.PI * x / R];
}
function worldPx(z) { return 256 * 2 ** z; }
function screenXY(mx, my, z, origin) {
  const size = worldPx(z);
  return [(mx / WORLD + 0.5) * size - origin.x, (0.5 - my / WORLD) * size - origin.y];
}
function cellBounds(ix, iy, path) {
  let side = 1000;
  let x = ROOT_ORIGIN_X + ix * side;
  let y = ROOT_ORIGIN_Y + iy * side;
  for (let d = 0; d < path.length; d++) {
    if (d < 3) {
      const child = side / 10;
      const k = path[d];
      x += (k % 10) * child;
      y += Math.floor(k / 10) * child;
      side = child;
    } else {
      const [ox, oy] = TERMINAL_PLACEMENTS[path[d]];
      x += ox; y += oy; side = Math.sqrt(0.1);
    }
  }
  return { x1: x, y1: y, x2: x + side, y2: y + side, side, area: side * side };
}
function boundsToLatLng(c) {
  const a = invMerc(c.x1, c.y1), b = invMerc(c.x2, c.y2);
  return [[a[0], a[1]], [b[0], b[1]]];
}
function activeLevel() {
  let level = LEVELS[0];
  for (const candidate of LEVELS) if (map.getZoom() >= candidate.triggerZoom) level = candidate;
  return level;
}
function projectedPixels(level) { return level.side * worldPx(map.getZoom()) / WORLD; }
function viewportMercator() {
  const b = map.getBounds(), sw = merc(b.getSouth(), b.getWest()), ne = merc(b.getNorth(), b.getEast());
  return { minX: Math.min(sw[0], ne[0]), maxX: Math.max(sw[0], ne[0]), minY: Math.min(sw[1], ne[1]), maxY: Math.max(sw[1], ne[1]) };
}
function estimatedCount(level) {
  const v = viewportMercator();
  const side = level.depth < 4 ? level.side : 1;
  const nx = Math.ceil((v.maxX - v.minX) / side) + 2 * PADDING_CELLS;
  const ny = Math.ceil((v.maxY - v.minY) / side) + 2 * PADDING_CELLS;
  return nx * ny * (level.depth === 4 ? 10 : 1);
}
function chooseLevel() {
  let index = LEVELS.indexOf(activeLevel());
  while (index > 0) {
    const level = LEVELS[index];
    if (projectedPixels(level) >= MIN_VISIBLE_PX && estimatedCount(level) <= MAX_RENDER_CELLS) break;
    index -= 1;
  }
  return LEVELS[index];
}
function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const hit = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
function featureContains(lat, lon, feature) {
  const g = feature.geometry;
  if (!g) return false;
  const polygon = p => pointInRing(lat, lon, p[0]) && p.slice(1).every(r => !pointInRing(lat, lon, r));
  if (g.type === 'Polygon') return polygon(g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some(polygon);
  return false;
}
function pointInIndia(lat, lon) {
  return indiaBoxes.some(box => lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon) && indiaGeometry.some(f => featureContains(lat, lon, f));
}
function addRing(ctx, ring, z, origin) {
  if (!ring.length) return;
  let p = screenXY(...merc(ring[0][1], ring[0][0]), z, origin); ctx.moveTo(p[0], p[1]);
  for (let i = 1; i < ring.length; i++) { p = screenXY(...merc(ring[i][1], ring[i][0]), z, origin); ctx.lineTo(p[0], p[1]); }
  ctx.closePath();
}
function clipIndia(ctx, z, origin) {
  ctx.beginPath();
  for (const f of indiaGeometry) {
    const g = f.geometry;
    if (g.type === 'Polygon') for (const ring of g.coordinates) addRing(ctx, ring, z, origin);
    if (g.type === 'MultiPolygon') for (const poly of g.coordinates) for (const ring of poly) addRing(ctx, ring, z, origin);
  }
  ctx.clip('evenodd');
}
const GridCanvas = L.Layer.extend({
  onAdd(m) {
    this._map = m; this._canvas = L.DomUtil.create('canvas', 'alu-grid-canvas'); m.getPane('overlayPane').appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d', { alpha: true }); this._ctx.imageSmoothingEnabled = false; this.resize();
  },
  onRemove() { this._canvas.remove(); },
  resize() {
    const size = this._map.getSize(), dpr = window.devicePixelRatio || 1;
    this._canvas.width = Math.max(1, Math.floor(size.x * dpr)); this._canvas.height = Math.max(1, Math.floor(size.y * dpr));
    this._canvas.style.width = `${size.x}px`; this._canvas.style.height = `${size.y}px`; this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },
  schedule() { if (this._frame) cancelAnimationFrame(this._frame); this._frame = requestAnimationFrame(() => this.render()); },
  render() {
    if (!indiaGeometry.length) return;
    this.resize();
    const ctx = this._ctx, size = this._map.getSize(), z = this._map.getZoom(), level = chooseLevel(), origin = this._map.getPixelOrigin(), v = viewportMercator();
    ctx.clearRect(0, 0, size.x, size.y); ctx.save(); clipIndia(ctx, z, origin); ctx.strokeStyle = 'rgba(31,78,121,0.45)'; ctx.lineWidth = 1; ctx.beginPath();
    if (level.depth < 4) {
      const side = level.side;
      const minX = Math.floor((v.minX - side * PADDING_CELLS) / side), maxX = Math.ceil((v.maxX + side * PADDING_CELLS) / side);
      const minY = Math.floor((v.minY - side * PADDING_CELLS) / side), maxY = Math.ceil((v.maxY + side * PADDING_CELLS) / side);
      const count = (maxX - minX + 1) * (maxY - minY + 1);
      const stride = count > MAX_RENDER_CELLS ? Math.ceil(Math.sqrt(count / MAX_RENDER_CELLS)) : 1;
      for (let gy = minY; gy <= maxY; gy += stride) for (let gx = minX; gx <= maxX; gx += stride) {
        const x = gx * side, y = gy * side, p1 = screenXY(x, y, z, origin), p2 = screenXY(x + side, y + side, z, origin);
        const sx = Math.min(p1[0], p2[0]), sy = Math.min(p1[1], p2[1]), w = Math.abs(p2[0] - p1[0]), h = Math.abs(p2[1] - p1[1]);
        if (sx > size.x || sy > size.y || sx + w < 0 || sy + h < 0) continue;
        ctx.rect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.max(1, w), Math.max(1, h));
      }
    } else {
      const side = 1, terminal = Math.sqrt(0.1);
      const minX = Math.floor((v.minX - side * PADDING_CELLS) / side), maxX = Math.ceil((v.maxX + side * PADDING_CELLS) / side);
      const minY = Math.floor((v.minY - side * PADDING_CELLS) / side), maxY = Math.ceil((v.maxY + side * PADDING_CELLS) / side);
      for (let gy = minY; gy <= maxY; gy++) for (let gx = minX; gx <= maxX; gx++) for (const [ox, oy] of TERMINAL_PLACEMENTS) {
        const x = gx + ox, y = gy + oy, p1 = screenXY(x, y, z, origin), p2 = screenXY(x + terminal, y + terminal, z, origin);
        const sx = Math.min(p1[0], p2[0]), sy = Math.min(p1[1], p2[1]), w = Math.abs(p2[0] - p1[0]), h = Math.abs(p2[1] - p1[1]);
        if (sx > size.x || sy > size.y || sx + w < 0 || sy + h < 0 || w < MIN_VISIBLE_PX) continue;
        ctx.rect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.max(1, w), Math.max(1, h));
      }
    }
    ctx.stroke(); ctx.restore();
  }
});
const map = L.map('map', { minZoom: 5, maxZoom: 25, zoomControl: true, maxBounds: INDIA_BOUNDS, maxBoundsViscosity: 0.9, zoomAnimation: true, fadeAnimation: false });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, maxNativeZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
const boundaryLayer = L.geoJSON(null, { style: { weight: 2, color: '#111827', fill: false, opacity: 0.9 } }).addTo(map);
const highlightLayer = L.layerGroup().addTo(map);
const gridCanvas = new GridCanvas().addTo(map);
const tooltip = document.getElementById('cellTooltip');
const searchInput = document.getElementById('aluSearch');
const searchResult = document.getElementById('searchResult');
const searchHint = document.getElementById('searchHint');
let indiaGeometry = [], indiaBoxes = [], metaCache = new Map(), hoveredCode = null, hoverRequest = 0;
function scheduleRender() { gridCanvas.schedule(); }
map.on('move zoom resize', scheduleRender); window.addEventListener('resize', scheduleRender);
function parseALU(value) {
  const parts = value.trim().toUpperCase().split('-').filter(Boolean);
  if (parts.length < 1 || parts.length > 5) throw new Error('Use one 6-character root plus up to four 2-character hierarchy segments.');
  const [root, ...tokens] = parts, pos = rootFromCode(root);
  if (tokens.some(t => !/^[0-9A-Z]{2}$/.test(t) || !/[A-Z]/.test(t) || !/\d/.test(t) || !TOKEN_TO_INDEX.has(t))) throw new Error('Every hierarchy segment must be a valid mixed alphanumeric base36 token.');
  if (tokens.length === 4 && TOKEN_TO_INDEX.get(tokens[3]) >= 10) throw new Error('The final 0.1 m² refinement has exactly 10 terminal children.');
  return { ix: pos.ix, iy: pos.iy, path: tokens.map(t => TOKEN_TO_INDEX.get(t)), code: parts.join('-'), level: LEVELS[tokens.length] };
}
function hoverCell(lat, lon) {
  const level = chooseLevel(), [mx, my] = merc(lat, lon);
  const rootIx = Math.floor((mx - ROOT_ORIGIN_X) / 1000), rootIy = Math.floor((my - ROOT_ORIGIN_Y) / 1000);
  if (rootIx < 0 || rootIy < 0 || rootIx >= ROOT_COLS) return null;
  let lx = mx - (ROOT_ORIGIN_X + rootIx * 1000), ly = my - (ROOT_ORIGIN_Y + rootIy * 1000), side = 1000, path = [];
  for (let d = 0; d < level.depth; d++) {
    if (d < 3) { const child = side / 10, dx = Math.floor(lx / child), dy = Math.floor(ly / child); if (dx < 0 || dy < 0 || dx > 9 || dy > 9) return null; path.push(dy * 10 + dx); lx -= dx * child; ly -= dy * child; side = child; }
    else { const s = Math.sqrt(0.1); let found = -1; for (let i = 0; i < TERMINAL_PLACEMENTS.length; i++) { const [ox, oy] = TERMINAL_PLACEMENTS[i]; if (lx >= ox && lx <= ox + s && ly >= oy && ly <= oy + s) { found = i; break; } } if (found < 0) return null; path.push(found); }
  }
  return { ix: rootIx, iy: rootIy, path, code: cellId(rootIx, rootIy, path), level };
}
async function showHover(evt, hit) {
  hoveredCode = hit.code; tooltip.classList.remove('hidden');
  tooltip.style.left = `${Math.min(innerWidth - 330, Math.max(10, evt.clientX + 14))}px`; tooltip.style.top = `${Math.min(innerHeight - 110, Math.max(10, evt.clientY + 14))}px`;
  tooltip.innerHTML = `<b>${hit.code}</b><br>Area: ${hit.level.side * hit.level.side} m²<br>ULPIN: checking…`;
  const token = ++hoverRequest;
  if (metaCache.has(hit.code)) { const d = metaCache.get(hit.code); tooltip.innerHTML = `<b>${hit.code}</b><br>Area: ${d.area_m2 ?? hit.level.side * hit.level.side} m²<br>ULPIN: ${d.ulpin ?? 'Not linked'}`; return; }
  try { const r = await fetch(`${API_BASE}/api/v1/spatial/cell-info/${encodeURIComponent(hit.code)}`); const d = r.ok ? await r.json() : { ulpin: 'Not linked' }; metaCache.set(hit.code, d); if (token === hoverRequest && hoveredCode === hit.code) tooltip.innerHTML = `<b>${hit.code}</b><br>Area: ${d.area_m2 ?? hit.level.side * hit.level.side} m²<br>ULPIN: ${d.ulpin ?? 'Not linked'}`; }
  catch (_) { metaCache.set(hit.code, { ulpin: 'Not linked' }); if (token === hoverRequest && hoveredCode === hit.code) tooltip.innerHTML = `<b>${hit.code}</b><br>Area: ${hit.level.side * hit.level.side} m²<br>ULPIN: Not linked`; }
}
map.on('mousemove', e => { if (!pointInIndia(e.latlng.lat, e.latlng.lng)) { hoveredCode = null; hoverRequest++; tooltip.classList.add('hidden'); return; } const hit = hoverCell(e.latlng.lat, e.latlng.lng); if (hit) showHover(e.originalEvent, hit); });
map.on('mouseout', () => { hoveredCode = null; hoverRequest++; tooltip.classList.add('hidden'); });
function focusCell(target) {
  highlightLayer.clearLayers(); const c = cellBounds(target.ix, target.iy, target.path);
  const rect = L.rectangle(boundsToLatLng(c), { weight: 4, color: '#ef4444', fill: false, dashArray: '8 6', interactive: false }).addTo(highlightLayer);
  searchResult.classList.remove('hidden'); searchResult.innerHTML = `<b>${target.code}</b><br>${target.level.label} · ${c.area.toPrecision(8)} m²`;
  map.flyToBounds(rect.getBounds().pad(0.65), { duration: 1.25, easeLinearity: 0.2, maxZoom: 25 }); setTimeout(() => highlightLayer.clearLayers(), 3500);
}
document.getElementById('aluSearchForm').addEventListener('submit', e => { e.preventDefault(); try { focusCell(parseALU(searchInput.value)); searchHint.textContent = 'ALU found. Map is flying to the cell…'; } catch (err) { searchHint.textContent = err.message; } });
async function loadBoundaries() {
  try {
    const response = await fetch(`${API_BASE}/api/v1/spatial/india-boundaries`); if (!response.ok) throw new Error(`Boundary API returned ${response.status}`);
    const data = await response.json(); indiaGeometry = data.features || []; boundaryLayer.addData(data);
    indiaBoxes = indiaGeometry.map(f => { const pts = [], walk = x => Array.isArray(x[0]) ? x.forEach(walk) : pts.push(x); walk(f.geometry.coordinates); const lats = pts.map(p => p[1]), lons = pts.map(p => p[0]); return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) }; });
    map.fitBounds(INDIA_BOUNDS, { padding: [10, 10] }); scheduleRender();
  } catch (err) { searchHint.textContent = `India boundary service unavailable: ${err.message}`; }
}
loadBoundaries();
