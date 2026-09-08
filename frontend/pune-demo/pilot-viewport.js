(() => {
  'use strict';
  if (!window.L || window.__sihPuneViewportInstalled) return;
  window.__sihPuneViewportInstalled = true;

  const PILOT_BOUNDS = [[18.5071852443, 73.8073803738], [18.5080371001, 73.8082786891]];
  const originalMap = L.map;

  L.map = function (...args) {
    const map = originalMap.apply(this, args);
    setTimeout(() => {
      try {
        map.options.zoomSnap = 0.1;
        map.options.zoomDelta = 0.1;
        map.fitBounds(PILOT_BOUNDS, { padding: [0, 0], animate: false });
        map.setMinZoom(map.getZoom());
        map.setMaxBounds(PILOT_BOUNDS);

        if (!map.getPane('pune-frame')) {
          map.createPane('pune-frame');
          map.getPane('pune-frame').style.zIndex = '650';
          map.getPane('pune-frame').style.pointerEvents = 'none';
        }

        L.rectangle(PILOT_BOUNDS, {
          pane: 'pune-frame',
          color: '#334155',
          weight: 2.2,
          opacity: 0.82,
          fill: false,
          interactive: false
        }).addTo(map);
      } catch (error) {
        console.warn('Pune pilot viewport setup failed:', error);
      }
    }, 0);
    return map;
  };
})();
