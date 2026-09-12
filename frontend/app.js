const state = { api: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:8000' : window.location.origin, parcels: [], selected: null, sites: [] };
const $ = (id) => document.getElementById(id);

function api(path, options = {}) {
  return fetch(`${state.api}${path}`, options).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || `API error ${r.status}`);
    return data;
  });
}
function gradeClass(color = '') { return String(color).toLowerCase(); }
function statusClass(status = '') { const s = String(status).toLowerCase(); return s === 'available' ? 'usable' : s === 'na' ? 'na' : 'nd'; }
function statusLabel(status = '') { return status === 'available' ? 'Usable' : status === 'na' ? 'N/A' : status === 'nd' ? 'N/D' : String(status).toUpperCase(); }
function esc(value) { return String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function connect() {
  state.api = $('apiBase').value.trim().replace(/\/$/, '');
  $('apiMessage').textContent = 'Connecting…'; $('apiDot').className = 'dot';
  try {
    await api('/health');
    const data = await api('/api/v1/parcels');
    state.parcels = data.parcels || [];
    $('parcelCount').textContent = state.parcels.length;
    $('healthBadge').textContent = 'API connected'; $('healthBadge').className = 'health ok'; $('apiDot').className = 'dot ok';
    $('apiMessage').textContent = 'FastAPI is reachable. Dashboard data is live from the backend.';
    renderParcels();
  } catch (err) {
    $('healthBadge').textContent = 'API offline'; $('healthBadge').className = 'health bad'; $('apiDot').className = 'dot bad';
    $('apiMessage').textContent = `${err.message}. Start the FastAPI service and try Connect again.`;
    $('parcelGrid').innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

function renderParcels() {
  $('parcelGrid').innerHTML = state.parcels.map(p => `
    <button class="parcel-card ${state.selected === p.parcel_id ? 'active' : ''}" data-id="${esc(p.parcel_id)}">
      <strong>${esc(p.parcel_id)}</strong><div class="location">${esc(p.location)}</div>
      <div class="land">${esc(p.land_type)} · ${esc(p.area_sq_m)} m²</div>
    </button>`).join('');
  document.querySelectorAll('.parcel-card').forEach(btn => btn.addEventListener('click', () => selectParcel(btn.dataset.id)));
}

function renderSiteConfigs() {
  const grid = $('siteConfigGrid');
  if (!state.sites.length) {
    grid.innerHTML = '<div class="empty-state">No external sites configured yet.</div>';
    return;
  }

  grid.innerHTML = state.sites.map(site => `
    <div class="site-config-card ${site.enabled ? 'enabled' : 'disabled'}">
      <div class="site-card-header">
        <div>
          <div class="eyebrow">${esc(site.id)}</div>
          <h3>${esc(site.name)}</h3>
        </div>
        <label class="toggle">
          <input type="checkbox" data-site-toggle="${esc(site.id)}" ${site.enabled ? 'checked' : ''} />
          <span>Enabled</span>
        </label>
      </div>
      <div class="site-card-body">
        <label>
          <span>Display name</span>
          <input data-site-field="name" data-site-id="${esc(site.id)}" value="${esc(site.name)}" />
        </label>
        <label>
          <span>Base URL</span>
          <input data-site-field="base_url" data-site-id="${esc(site.id)}" value="${esc(site.base_url)}" />
        </label>
        <label>
          <span>API key</span>
          <input data-site-field="api_key" data-site-id="${esc(site.id)}" value="${esc(site.api_key)}" placeholder="Optional API key" />
        </label>
      </div>
      <div class="site-card-actions">
        <button class="secondary" data-site-test="${esc(site.id)}">Test connection</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-site-field]').forEach(input => {
    input.addEventListener('input', (event) => {
      const site = state.sites.find(item => item.id === event.target.dataset.siteId);
      if (site) site[event.target.dataset.siteField] = event.target.value;
    });
  });

  grid.querySelectorAll('[data-site-toggle]').forEach(input => {
    input.addEventListener('change', (event) => {
      const site = state.sites.find(item => item.id === event.target.dataset.siteToggle);
      if (site) site.enabled = event.target.checked;
    });
  });

  grid.querySelectorAll('[data-site-test]').forEach(button => {
    button.addEventListener('click', () => testSite(button.dataset.siteTest));
  });
}

async function loadSiteConfigs() {
  try {
    const data = await api('/api/v1/admin/site-configs');
    state.sites = data.sites || [];
    renderSiteConfigs();
  } catch (err) {
    $('siteConfigGrid').innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

async function saveSiteConfigs() {
  $('saveSettingsBtn').disabled = true;
  $('saveSettingsBtn').textContent = 'Saving…';
  try {
    await api('/api/v1/admin/site-configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sites: state.sites })
    });
    $('apiMessage').textContent = 'Saved site settings successfully.';
  } catch (err) {
    $('apiMessage').textContent = err.message;
  } finally {
    $('saveSettingsBtn').disabled = false;
    $('saveSettingsBtn').textContent = 'Save all settings';
  }
}

async function testSite(siteId) {
  const site = state.sites.find(item => item.id === siteId);
  if (!site) return;
  const button = document.querySelector(`[data-site-test="${CSS.escape(siteId)}"]`);
  if (button) {
    button.disabled = true;
    button.textContent = 'Testing…';
  }

  try {
    const result = await api('/api/v1/admin/site-configs/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(site)
    });
    const message = result.reachable ? `Connected successfully (${result.http_status})` : `Connection failed: ${result.error}`;
    $('apiMessage').textContent = `${site.name}: ${message}`;
  } catch (err) {
    $('apiMessage').textContent = `${site.name}: ${err.message}`;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Test connection';
    }
  }
}

async function selectParcel(parcelId) {
  state.selected = parcelId; renderParcels(); $('selectedLabel').textContent = parcelId;
  $('parcelDetails').classList.remove('hidden'); $('categoriesPanel').classList.remove('hidden');
  $('categoryBody').innerHTML = '<tr><td colspan="6">Loading assignment…</td></tr>';
  try {
    const [detail, assignment, categories] = await Promise.all([
      api(`/api/v1/parcels/${encodeURIComponent(parcelId)}`),
      api(`/api/v1/parcels/${encodeURIComponent(parcelId)}/assignment`),
      api(`/api/v1/parcels/${encodeURIComponent(parcelId)}/categories`)
    ]);
    renderDetail(detail, assignment); renderCategories(categories.categories || []);
  } catch (err) { $('categoryBody').innerHTML = `<tr><td colspan="6" class="error">${esc(err.message)}</td></tr>`; }
}

function renderDetail(detail, assignment) {
  $('parcelTitle').textContent = `${detail.parcel_id} · ${detail.ulpin}`;
  const color = assignment.color || 'red';
  $('gradeBadge').textContent = color.toUpperCase(); $('gradeBadge').className = `grade ${gradeClass(color)}`;
  $('parcelMeta').innerHTML = [
    ['Description', detail.description], ['Land type', detail.land_type], ['Area', `${detail.area_sq_m} m²`],
    ['Location', detail.location], ['ULPIN', detail.ulpin], ['Retrieved', assignment.retrieved_at]
  ].map(([k,v]) => `<div class="meta"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
  const score = Number(assignment.usable_count ?? 0);
  const breakdown = assignment.breakdown || {};
  const na = Number(breakdown.na ?? breakdown.n_a ?? 0);
  const nd = Number(breakdown.nd ?? breakdown.n_d ?? Math.max(0, 21 - score - na));
  $('scoreValue').textContent = score; $('scoreFill').style.width = `${Math.max(0, Math.min(100, score / 21 * 100))}%`;
  $('usableCount').textContent = score; $('naCount').textContent = na; $('ndCount').textContent = nd;
}

function renderCategories(rows) {
  $('categoryBody').innerHTML = rows.map((r, i) => `
    <tr><td>${esc(r.category_no ?? i + 1)}</td><td><strong>${esc(r.category)}</strong></td><td>${esc(r.value)}</td>
    <td><span class="chip ${statusClass(r.status)}">${esc(statusLabel(r.status))}</span></td>
    <td>${esc(r.source_ref)}</td><td>${esc(r.retrieved_at)}</td></tr>`).join('');
}

async function inspectCell() {
  const id = $('cellId').value.trim(); $('cellOutput').textContent = 'Loading…';
  try { $('cellOutput').textContent = JSON.stringify(await api(`/api/v1/spatial/cells/${encodeURIComponent(id)}`), null, 2); }
  catch (err) { $('cellOutput').textContent = err.message; }
}

async function runRounds() {
  $('roundBtn').disabled = true; $('roundBtn').textContent = 'Processing…';
  $('roundOutput').innerHTML = '<div class="round-empty">Running 1km → 100m → 10m → 1m → 0.1m²…</div>';
  try {
    const data = await api('/api/v1/rounds/demo', { method: 'POST' });
    $('roundOutput').innerHTML = (data.rounds || []).map(r => `
      <div class="round-row"><strong>${esc(r.level)}</strong><span>${esc(r.processed_cells)} / ${esc(r.total_cells)} cells</span>
      <span class="status-complete">${r.completed ? 'Complete' : 'Pending'}</span></div>`).join('');
  } catch (err) { $('roundOutput').innerHTML = `<div class="error">${esc(err.message)}</div>`; }
  finally { $('roundBtn').disabled = false; $('roundBtn').textContent = 'Run demo rounds'; }
}

$('connectBtn').addEventListener('click', connect); $('cellBtn').addEventListener('click', inspectCell); $('roundBtn').addEventListener('click', runRounds); $('saveSettingsBtn').addEventListener('click', saveSiteConfigs);
$('cellId').addEventListener('keydown', e => { if (e.key === 'Enter') inspectCell(); });
loadSiteConfigs();
connect();
