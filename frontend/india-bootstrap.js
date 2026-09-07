/* Load the India boundary before the map renderer so cells never paint outside India. */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const api = params.get('api') || 'http://localhost:8000';
  const boundaryUrl = `${api}/api/v1/spatial/india-boundaries`;
  const cacheKey = 'sih26012-india-boundary-v2';

  function installBoundaryFetch(geo) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === boundaryUrl || url.includes('/api/v1/spatial/india-boundaries')) {
        return Promise.resolve(new Response(JSON.stringify(geo), {
          status: 200,
          headers: {'Content-Type': 'application/json'}
        }));
      }
      return originalFetch(input, init);
    };
  }

  function loadMap() {
    const script = document.createElement('script');
    script.src = `map.js?v=20260907e`;
    script.defer = false;
    document.body.appendChild(script);
  }

  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch (_) {}
  if (cached?.features?.length) {
    installBoundaryFetch(cached);
    loadMap();
    // Refresh the cache in the background without delaying the visible map.
    fetch(boundaryUrl, {cache: 'no-store'})
      .then(r => r.ok ? r.json() : null)
      .then(geo => { if (geo?.features?.length) localStorage.setItem(cacheKey, JSON.stringify(geo)); })
      .catch(() => {});
    return;
  }

  fetch(boundaryUrl, {cache: 'no-store'})
    .then(r => { if (!r.ok) throw new Error(`India boundary request failed (${r.status})`); return r.json(); })
    .then(geo => {
      if (!geo?.features?.length) throw new Error('India boundary is empty');
      localStorage.setItem(cacheKey, JSON.stringify(geo));
      installBoundaryFetch(geo);
      loadMap();
    })
    .catch(err => {
      console.error(err);
      const hint = document.getElementById('searchHint');
      if (hint) hint.textContent = 'India boundary could not be loaded. Start FastAPI/PostGIS; cells are intentionally withheld to prevent rendering outside India.';
    });
})();
