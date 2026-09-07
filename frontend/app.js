const state = { api: 'http://localhost:8000', parcels: [], selected: null };
const $ = (id) => document.getElementById(id);

function api(path, options = {}) {
  return fetch(`${state.api}${path}`, options).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || `API error ${r.status}`);
    return data;
  });
}

function gradeClass(grade = '') { return grade.toLowerCase(); }
function statusClass(status = '') { return status.toLowerCase() === 'usable' ? 'usable' : status.toLowerCase() === 'n/a' ? 'na' : 'nd'; }
function esc(value) { return String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function connect() {
  state.api = $('apiBase').value.trim().replace(/\/$/, '');
  $('apiMessage').textContent = 'Connecting…';
  $('apiDot').className = 'dot';
  try {
    await api('/health');
    const data = await api('/api/v1/parcels');
    state.parcels = data.parcels || [];
    $('parcelCount').textContent = state.parcels.length;
    $('healthBadge').textContent = 'API connected';
    $('healthBadge').className = 'health ok';
    $('apiDot').className = 'dot ok';
    $('apiMessage').textContent = 'FastAPI is reachable. Dashboard data is live from the backend.';
    renderParcels();
  } catch (err) {
    $('healthBadge').textContent = 'API offline';
    $('healthBadge').className = 'health bad';
    $('apiDot').className = 'dot bad';
    $('apiMessage').textContent = `${err.message}. Start the FastAPI service and try Connect again.`;
    $('parcelGrid').innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

function renderParcels() {
  $('parcelGrid').innerHTML = state.parcels.map(p => `
    <button class="parcel-card ${state.selected === p.parcel_id ? 'active' : ''}" data-id="${esc(p.parcel_id)}">
      <strong>${esc(p.parcel_id)}</strong>
      <div class="location">${esc(p.location)}</div>
      <div class="land">${esc(p.land_type)} · ${esc(p.area_sq_m)} m²</div>
    </button>`).join('');
  document.querySelectorAll('.parcel-card').forEach(btn => btn.addEventListener('click', () => selectParcel(btn.dataset.id)));
}

async function selectParcel(parcelId) {
  state.selected = parcelId;
  renderParcels();
  $('selectedLabel').textContent = parcelId;
  $('parcelDetails').classList.remove('hidden');
  $('categoriesPanel').classList.remove('hidden');
  $('categoryBody').innerHTML = '<tr><td colspan="6">Loading assignment…</td></tr>';
  try {
    const [detail, assignment, categories] = await Promise.all([
      api(`/api/v1/parcels/${encodeURIComponent(parcelId)}`),
      api(`/api/v1/parcels/${encodeURIComponent(parcelId)}/assignment`),
      api(`/api/v1/parcels/${encodeURIComponent(parcelId)}/categories`)
    ]);
    renderDetail(detail, assignment);
    renderCategories(categories.categories || []);
  } catch (err) {
    $('categoryBody').innerHTML = `<tr><td colspan="6" class="error">${esc(err.message)}</td></tr>`;
  }
}

function renderDetail(detail, assignment) {
  $('parcelTitle').textContent = `${detail.parcel_id} · ${detail.ulpin}`;
  const grade = assignment.grade || assignment.status || '—';
  $('gradeBadge').textContent = grade.toUpperCase();
  $('gradeBadge').className = `grade ${gradeClass(grade)}`;
  $('parcelMeta').innerHTML = [
    ['Description', detail.description], ['Land type', detail.land_type], ['Area', `${detail.area_sq_m} m²`],
    ['Location', detail.location], ['ULPIN', detail.ulpin], ['API status', 'Live backend result']
  ].map(([k,v]) => `<div class="meta"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');

  const score = Number(assignment.score ?? assignment.usable_count ?? 0);
  const usable = Number(assignment.usable_count ?? score);
  const na = Number(assignment.na_count ?? 0);
  const nd = Number(assignment.nd_count ?? Math.max(0, 21 - usable - na));
  $('scoreValue').textContent = score;
  $('scoreFill').style.width = `${Math.max(0, Math.min(100, score / 21 * 100))}%`;
  $('usableCount').textContent = usable;
  $('naCount').textContent = na;
  $('ndCount').textContent = nd;
}

function renderCategories(rows) {
  $('categoryBody').innerHTML = rows.map((r, i) => `
    <tr>
      <td>${esc(r.category_no ?? i + 1)}</td>
      <td><strong>${esc(r.category)}</strong></td>
      <td>${esc(r.value)}</td>
      <td><span class="chip ${statusClass(r.status)}">${esc(r.status)}</span></td>
      <td>${esc(r.source_ref)}</td>
      <td>${esc(r.retrieved_at)}</td>
    </tr>`).join('');
}

async function inspectCell() {
  const id = $('cellId').value.trim();
  $('cellOutput').textContent = 'Loading…';
  try {
    const data = await api(`/api/v1/spatial/cells/${encodeURIComponent(id)}`);
    $('cellOutput').textContent = JSON.stringify(data, null, 2);
  } catch (err) { $('cellOutput').textContent = err.message; }
}

async function runRounds() {
  $('roundBtn').disabled = true;
  $('roundBtn').textContent = 'Processing…';
  $('roundOutput').innerHTML = '<div class="round-empty">Running 1km → 100m → 10m → 1m → 0.1m²…</div>';
  try {
    const data = await api('/api/v1/rounds/demo', { method: 'POST' });
    $('roundOutput').innerHTML = (data.rounds || []).map(r => `
      <div class="round-row"><strong>${esc(r.level)}</strong><span>${esc(r.processed ?? r.completed_cells ?? 0)} cells</span><span class="status-complete">${esc(r.status || 'complete')}</span></div>`).join('');
  } catch (err) {
    $('roundOutput').innerHTML = `<div class="error">${esc(err.message)}</div>`;
  } finally {
    $('roundBtn').disabled = false;
    $('roundBtn').textContent = 'Run demo rounds';
  }
}

$('connectBtn').addEventListener('click', connect);
$('cellBtn').addEventListener('click', inspectCell);
$('roundBtn').addEventListener('click', runRounds);
$('cellId').addEventListener('keydown', e => { if (e.key === 'Enter') inspectCell(); });
connect();
