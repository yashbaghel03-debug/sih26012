/* Pune pilot integration layer.
 * Loaded before the India map renderer and captures the Leaflet map instance.
 * The national map stays unchanged at normal zooms; the prepared Pune ALU
 * coverage appears only when the user zooms into the pilot area.
 */
(() => {
  'use strict';
  if (!window.L || window.__sihPuneIntegrationInstalled) return;
  window.__sihPuneIntegrationInstalled = true;

  const API = (() => {
    const q = new URLSearchParams(location.search).get('api');
    if (q) return q.replace(/\/$/, '');
    if (location.hostname.endsWith('.app.github.dev')) return `https://${location.hostname.replace(/-\d+\.app\.github\.dev$/, '-8000.app.github.dev')}`;
    return 'http://localhost:8000';
  })();

  const PILOT = { center: [18.5074, 73.8077], zoomReveal: 12, gridReveal: 18 };
  const STATUS = { GREEN:'#22c55e', YELLOW:'#facc15', RED:'#ef4444', WHITE:'#ffffff' };
  const parentBoundsFallback = [[18.5069,73.8072],[18.5079,73.8082]];

  let activeMap = null, meta = null, grid = null, gridByKey = new Map();
  let canvas = null, ctx = null, frame = 0, metaLoading = false, gridLoading = false, gridLoaded = false;

  function pointInBounds(lat, lon, bounds) { return lat >= bounds[0][0] && lat <= bounds[1][0] && lon >= bounds[0][1] && lon <= bounds[1][1]; }
  function nearPilot() {
    if (!activeMap) return false;
    const b = activeMap.getBounds(), pad = 0.18;
    return b.getNorth() >= PILOT.center[0]-pad && b.getSouth() <= PILOT.center[0]+pad && b.getEast() >= PILOT.center[1]-pad && b.getWest() <= PILOT.center[1+0];
  }
  async function getJson(path) {
    const r = await fetch(API + path, { headers:{Accept:'application/json'}, cache:'force-cache' });
    if (!r.ok) throw Error(`Pune coverage HTTP ${r.status}`);
    return r.json();
  }
  function ensureCanvas() {
    if (canvas || !activeMap) return;
    canvas = document.createElement('canvas');
    canvas.className = 'pune-coverage-canvas';
    canvas.setAttribute('aria-hidden','true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:445;pointer-events:none;';
    activeMap.getPane('overlayPane').appendChild(canvas);
    ctx = canvas.getContext('2d',{alpha:true,desynchronized:true});
  }
  function resizeCanvas() {
    const s = activeMap.getSize(), d = Math.min(window.devicePixelRatio||1,2), w = Math.max(1,Math.floor(s.x)), h = Math.max(1,Math.floor(s.y));
    if (canvas.width !== Math.floor(w*d) || canvas.height !== Math.floor(h*d)) { canvas.width=Math.floor(w*d); canvas.height=Math.floor(h*d); }
    canvas.style.width=w+'px'; canvas.style.height=h+'px'; ctx.setTransform(d,0,0,d,0,0); return [w,h];
  }
  function schedule(){ if(!frame) frame=requestAnimationFrame(draw); }
  function draw(){
    frame=0; if(!ctx||!activeMap)return;
    const [w,h]=resizeCanvas(); ctx.clearRect(0,0,w,h);
    if(!meta||!nearPilot()||activeMap.getZoom()<PILOT.zoomReveal)return;
    const bounds=L.latLngBounds(meta.bbox||parentBoundsFallback);
    const sw=activeMap.latLngToContainerPoint(bounds.getSouthWest()), ne=activeMap.latLngToContainerPoint(bounds.getNorthEast());
    if(activeMap.getZoom()<PILOT.gridReveal||!grid){
      ctx.globalAlpha=.2;ctx.strokeStyle='#b45309';ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.strokeRect(sw.x,ne.y,ne.x-sw.x,sw.y-ne.y);ctx.setLineDash([]);ctx.globalAlpha=1;return;
    }
    const cellW=(ne.x-sw.x)/100, cellH=(sw.y-ne.y)/100;
    if(cellW<=0||cellH<=0)return;
    for(const item of grid){
      const x=sw.x+item.col*cellW, y=ne.y+item.row*cellH;
      if(x>w||y>h||x+cellW<0||y+cellH<0)continue;
      ctx.fillStyle=STATUS[item.status]||STATUS.WHITE;ctx.globalAlpha=item.status==='WHITE'?0:.64;ctx.fillRect(x,y,Math.max(1,cellW+.2),Math.max(1,cellH+.2));
      if(cellW>=3){ctx.globalAlpha=.28;ctx.strokeStyle='#334155';ctx.lineWidth=.45;ctx.strokeRect(x,y,cellW,cellH);}
    }
    ctx.globalAlpha=1;
  }
  async function loadMeta(){
    if(meta||metaLoading||!activeMap||!nearPilot()||activeMap.getZoom()<PILOT.zoomReveal)return;
    metaLoading=true;try{meta=await getJson('/api/v1/pune-demo/alu-catalog');ensureCanvas();schedule();}catch(e){console.warn('Pune ALU metadata unavailable:',e)}finally{metaLoading=false;}
  }
  async function loadGrid(){
    if(gridLoaded||gridLoading||!meta||!activeMap||!nearPilot()||activeMap.getZoom()<PILOT.gridReveal)return;
    gridLoading=true;try{const compact=await getJson('/api/v1/pune-demo/alu-catalog/coverage-grid?level=1m2');grid=compact.items||[];gridByKey=new Map(grid.map(x=>[`${x.row}:${x.col}`,x]));gridLoaded=true;schedule();}catch(e){console.warn('Pune ALU coverage grid unavailable:',e)}finally{gridLoading=false;}
  }
  function loadCoverage(){loadMeta();loadGrid();schedule();}
  function pilotAluAt(lat,lon){
    if(!meta||!grid||!pointInBounds(lat,lon,meta.bbox))return null;
    const b=meta.bbox,col=Math.max(0,Math.min(99,Math.floor((lon-b[0][1])/(b[1][1]-b[0][1])*100))),row=Math.max(0,Math.min(99,Math.floor((lat-b[0][0])/(b[1][0]-b[0][0])*100))),item=gridByKey.get(`${row}:${col}`);
    return item?item.alu_id:null;
  }
  function setupMap(map){
    if(!map||map.__sihPuneCoverageReady)return;
    map.__sihPuneCoverageReady=true;activeMap=map;ensureCanvas();
    map.on('zoom move resize',loadCoverage);
    map.getContainer().addEventListener('click',e=>{
      if(map.getZoom()<20||!meta||!grid)return;
      const rect=map.getContainer().getBoundingClientRect(),pt=map.containerPointToLatLng([e.clientX-rect.left,e.clientY-rect.top]),alu=pilotAluAt(pt.lat,pt.lng);
      if(!alu)return;
      e.preventDefault();e.stopPropagation();
      const target=new URL('pune-demo/',location.href);target.searchParams.set('alu',alu);target.searchParams.set('from','india-map');window.location.href=target.href;
    },true);
    setTimeout(loadCoverage,800);
  }
  const originalMap=L.map;
  L.map=function(...args){const map=originalMap.apply(this,args);setTimeout(()=>setupMap(map),0);return map;};
})();
