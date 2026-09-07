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
    script.src = 'map.js?v=20260907k';
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

  // Only the new national cache is trusted for immediate loading. The older
  // narrower cache remains a last-resort fallback if the national source is down.
  if (cached) {
    install(cached);
    loadMap();
  }

  (async () => {
    // On a fresh browser, fetch the national polygon before starting map.js so
    // the first renderer state already contains POK and Aksai Chin.
    if (!cached) {
      try {
        const geo = await getJson(nationalBoundary);
        if (geo) {
          try { localStorage.setItem(cacheKey, JSON.stringify(geo)); } catch (_) {}
          install(geo);
          loadMap();
          return;
        }
      } catch (error) {
        console.warn('LGD-derived India national boundary unavailable', error);
      }

      // Source/network fallback only when the national source is unavailable.
      try {
        const legacy = normalize(JSON.parse(localStorage.getItem(legacyKey) || 'null'));
        if (legacy) {
          install(legacy);
          loadMap();
          return;
        }
      } catch (_) {}

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
      return;
    }

    // Refresh national cache in the background. The already-loaded map is left
    // untouched, so there is no basemap/UI change during normal use.
    try {
      const geo = await getJson(nationalBoundary);
      if (geo) {
        try { localStorage.setItem(cacheKey, JSON.stringify(geo)); } catch (_) {}
      }
    } catch (error) {
      console.warn('LGD-derived India national boundary refresh failed', error);
    }
  })();
})();
