/* Bootstrap the India WebGIS with the LGD-derived national political boundary.
 * Keep the existing map renderer unchanged while supplying it the broader
 * national clipping geometry that includes the requested J&K/Ladakh extent.
 */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const api = params.get('api') || 'http://localhost:8000';
  const apiBoundary = `${api}/api/v1/spatial/india-boundaries`;
  const nationalBoundary = 'https://pub-0429b8e3b5a946e69ea007df844a6f1c.r2.dev/reference/india_boundary.geojson';
  const cacheKey = 'sih26012-india-national-boundary-v5';
  const legacyKey = 'sih26012-official-india-boundary-v4';

  function install(geo) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === apiBoundary || url.includes('/api/v1/spatial/india-boundaries')) {
        return Promise.resolve(new Response(JSON.stringify(geo), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      return originalFetch(input, init);
    };
  }

  function loadMap() {
    const script = document.createElement('script');
    script.src = 'map.js?v=20260907i';
    script.defer = false;
    document.body.appendChild(script);
  }

  function normalize(geo) {
    if (geo?.type === 'Feature') return { type: 'FeatureCollection', features: [geo] };
    return geo?.features?.length ? geo : null;
  }

  async function getJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`boundary ${response.status}`);
    return normalize(await response.json());
  }

  let cached = null;
  let cachedIsNational = false;
  try {
    cached = normalize(JSON.parse(localStorage.getItem(cacheKey) || 'null'));
    cachedIsNational = !!cached;
  } catch (_) {}
  if (!cached) {
    try { cached = normalize(JSON.parse(localStorage.getItem(legacyKey) || 'null')); } catch (_) {}
  }

  // A cached boundary lets the map and its grid paint immediately.
  if (cached) {
    install(cached);
    loadMap();
  }

  (async () => {
    // Refresh/obtain the broader national polygon. When there is no cache,
    // wait for this authoritative-source-derived geometry before starting the
    // renderer so POK/Aksai Chin are included in the first map state.
    try {
      const geo = await getJson(nationalBoundary);
      if (geo) {
        try { localStorage.setItem(cacheKey, JSON.stringify(geo)); } catch (_) {}
        if (!cached) loadMap();
        install(geo);
        return;
      }
    } catch (error) {
      console.warn('LGD-derived India national boundary unavailable', error);
    }

    if (!cached) {
      try {
        const geo = await getJson(apiBoundary);
        if (geo) {
          install(geo);
          loadMap();
          return;
        }
      } catch (error) {
        console.warn('Fallback India boundary unavailable', error);
      }
      document.getElementById('searchHint').textContent = 'India boundary could not be loaded. Start FastAPI/PostGIS or restore network access.';
    } else if (!cachedIsNational) {
      document.getElementById('searchHint').textContent = 'Using cached India boundary while the national boundary is unavailable.';
    }
  })();
})();
