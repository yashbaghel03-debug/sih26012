const API_BASE=new URLSearchParams(location.search).get('api')||'http://localhost:8000';
const INDIA_BOUNDS=[[6.5,68],[37.5,97.5]];
const map=L.map('map',{minZoom:4,maxZoom:31,zoomControl:true,maxBounds:INDIA_BOUNDS,maxBoundsViscosity:0.35,zoomAnimation:true,fadeAnimation:false}).fitBounds(INDIA_BOUNDS);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,maxNativeZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
const boundaryLayer=L.geoJSON(null,{style:{weight:2,color:'#111827',fill:false,opacity:0.85}}).addTo(map);
const gridLayer=L.layerGroup().addTo(map);
const highlightLayer=L.layerGroup().addTo(map);
const tooltip=document.getElementById('cellTooltip');
const searchResult=document.getElementById('searchResult');
const searchInput=document.getElementById('aluSearch');
const searchHint=document.getElementById('searchHint');
let indiaGeometry=[];
const metaCache=new Map();
let redrawFrame=0;

// One active level at a time. The final 0.1 m² unit is rendered as a true square
// of side sqrt(0.1) metres, so every cell at the active level has the same size.
const LEVELS=[
 {name:'500km',display:'500 km',size:500000,minZoom:4},
 {name:'250km',display:'250 km',size:250000,minZoom:6},
 {name:'100km',display:'100 km',size:100000,minZoom:8},
 {name:'50km',display:'50 km',size:50000,minZoom:9},
 {name:'10km',display:'10 km',size:10000,minZoom:10},
 {name:'1km',display:'1 km',size:1000,minZoom:12},
 {name:'100m',display:'100 m',size:100,minZoom:15},
 {name:'10m',display:'10 m',size:10,minZoom:18},
 {name:'1m',display:'1 m',size:1,minZoom:22},
 {name:'0.1m2',display:'0.1 m²',size:Math.sqrt(0.1),minZoom:31}
];
const LEVEL_BY_NAME=new Map(LEVELS.map(l=>[l.name,l]));

function currentLevel(){let chosen=LEVELS[0];for(const l of LEVELS)if(map.getZoom()>=l.minZoom)chosen=l;return chosen;}
const R=6378137;
function mercator(lat,lon){lat=Math.max(-85.0511287798,Math.min(85.0511287798,lat));return [R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];}
function inverse(x,y){return [180/Math.PI*(2*Math.atan(Math.exp(y/R))-Math.PI/2),180/Math.PI*x/R];}
function idPart(v){return v<0?'n'+Math.abs(v):'p'+v;}
function decodePart(s){if(!/^[pn]\d+$/.test(s))throw new Error('Invalid ALU coordinate');return (s[0]==='n'?-1:1)*Number(s.slice(1));}
function cellId(level,ix,iy){return `ALU-${level.name}-x${idPart(ix)}-y${idPart(iy)}`;}
function cellLatLngBounds(level,ix,iy){const a=inverse(ix*level.size,iy*level.size),b=inverse((ix+1)*level.size,(iy+1)*level.size);return [[a[0],a[1]],[b[0],b[1]]];}

function addRingPath(ctx,ring){for(let i=0;i<ring.length;i++){const [lon,lat]=ring[i],p=map.latLngToContainerPoint([lat,lon]);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}ctx.closePath();}
function buildIndiaClip(ctx){
 ctx.beginPath();
 for(const feature of indiaGeometry){const g=feature.geometry;if(!g)continue;
  if(g.type==='Polygon')for(const ring of g.coordinates)addRingPath(ctx,ring);
  else if(g.type==='MultiPolygon')for(const poly of g.coordinates)for(const ring of poly)addRingPath(ctx,ring);
 }
 ctx.clip('evenodd');
}

const GridCanvas=L.Layer.extend({
 onAdd(map){this._map=map;this._canvas=L.DomUtil.create('canvas','alu-grid-canvas');map.getPane('overlayPane').appendChild(this._canvas);this._ctx=this._canvas.getContext('2d');this._ctx.imageSmoothingEnabled=false;this.resize();map.on('move zoom resize viewreset',this.schedule,this);this.redraw();},
 onRemove(map){map.off('move zoom resize viewreset',this.schedule,this);this._canvas.remove();},
 schedule(){cancelAnimationFrame(redrawFrame);redrawFrame=requestAnimationFrame(()=>this.redraw());},
 resize(){const s=this._map.getSize(),d=window.devicePixelRatio||1;this._canvas.width=Math.max(1,Math.floor(s.x*d));this._canvas.height=Math.max(1,Math.floor(s.y*d));this._canvas.style.width=`${s.x}px`;this._canvas.style.height=`${s.y}px`;this._ctx.setTransform(d,0,0,d,0,0);},
 redraw(){if(!this._map||!this._ctx||!indiaGeometry.length)return;this.resize();const ctx=this._ctx,s=this._map.getSize(),level=currentLevel(),b=this._map.getBounds();ctx.clearRect(0,0,s.x,s.y);buildIndiaClip(ctx);
  const sw=mercator(b.getSouth(),b.getWest()),ne=mercator(b.getNorth(),b.getEast());
  const ix0=Math.floor(sw[0]/level.size)-1,ix1=Math.ceil(ne[0]/level.size)+1,iy0=Math.floor(sw[1]/level.size)-1,iy1=Math.ceil(ne[1]/level.size)+1;
  const count=(ix1-ix0+1)*(iy1-iy0+1);if(count>120000)return;
  ctx.strokeStyle='rgba(37,99,235,0.58)';ctx.lineWidth=1;ctx.beginPath();
  for(let iy=iy0;iy<=iy1;iy++)for(let ix=ix0;ix<=ix1;ix++){
   const swp=this._map.latLngToContainerPoint(cellLatLngBounds(level,ix,iy)[0]);
   const nep=this._map.latLngToContainerPoint(cellLatLngBounds(level,ix,iy)[1]);
   const x=Math.min(swp.x,nep.x),y=Math.min(swp.y,nep.y),w=Math.abs(nep.x-swp.x),h=Math.abs(nep.y-swp.y);
   if(x+w<0||x>s.x||y+h<0||y>s.y)continue;
   // Every cell is an independent rectangle; there are no continuous global grid lines.
   ctx.rect(Math.round(x)+0.5,Math.round(y)+0.5,Math.max(1,Math.round(w)-1),Math.max(1,Math.round(h)-1));
  }
  ctx.stroke();
 }
});
const gridCanvas=new GridCanvas();gridCanvas.addTo(map);

function showTooltip(e,level,ix,iy){const id=cellId(level,ix,iy),cached=metaCache.get(id);tooltip.classList.remove('hidden');tooltip.innerHTML=`<b>${id}</b><br>Area: ${(level.size*level.size).toPrecision(7)} m²<br>ULPIN: ${cached?.ulpin||'checking…'}`;tooltip.style.left=`${Math.min(window.innerWidth-330,Math.max(10,e.originalEvent.clientX+14))}px`;tooltip.style.top=`${Math.min(window.innerHeight-100,Math.max(10,e.originalEvent.clientY+14))}px`;
 if(!cached){metaCache.set(id,{ulpin:'checking…'});fetch(`${API_BASE}/api/v1/spatial/cell-info/${encodeURIComponent(id)}`).then(r=>r.ok?r.json():Promise.reject()).then(data=>metaCache.set(id,{ulpin:data.ulpin||'Not linked'})).catch(()=>metaCache.set(id,{ulpin:'Not linked'}));}
}
function bindHover(rect,level,ix,iy){rect.on('mouseover',e=>showTooltip(e,level,ix,iy));rect.on('mousemove',e=>showTooltip(e,level,ix,iy));rect.on('mouseout',()=>tooltip.classList.add('hidden'));rect.on('click',()=>searchCell(level,ix,iy));}

// Build lightweight interactive rectangles only for the currently visible window.
// Rendering is local and immediate; PostGIS is used only for authoritative India boundary/ULPIN metadata.
function rebuildInteractiveCells(){gridLayer.clearLayers();if(!indiaGeometry.length)return;const level=currentLevel(),b=map.getBounds(),sw=mercator(b.getSouth(),b.getWest()),ne=mercator(b.getNorth(),b.getEast());const ix0=Math.floor(sw[0]/level.size)-1,ix1=Math.ceil(ne[0]/level.size)+1,iy0=Math.floor(sw[1]/level.size)-1,iy1=Math.ceil(ne[1]/level.size)+1;const count=(ix1-ix0+1)*(iy1-iy0+1);if(count>2500)return;
 for(let iy=iy0;iy<=iy1;iy++)for(let ix=ix0;ix<=ix1;ix++){
  const bounds=cellLatLngBounds(level,ix,iy),center=[(bounds[0][0]+bounds[1][0])/2,(bounds[0][1]+bounds[1][1])/2];
  const p=turf.point([center[1],center[0]]);if(!indiaGeometry.some(f=>turf.booleanPointInPolygon(p,f)))continue;
  const r=L.rectangle(bounds,{weight:0,opacity:0,fill:true,fillOpacity:0,interactive:true});bindHover(r,level,ix,iy);r.addTo(gridLayer);
 }
}
function searchCell(level,ix,iy){highlightLayer.clearLayers();const r=L.rectangle(cellLatLngBounds(level,ix,iy),{weight:4,color:'#ef4444',fill:false,dashArray:'8 5'}).addTo(highlightLayer);searchResult.classList.remove('hidden');searchResult.innerHTML=`<b>${cellId(level,ix,iy)}</b><br>${level.display} · ${(level.size*level.size).toPrecision(7)} m²`;map.flyToBounds(r.getBounds().pad(0.45),{duration:1.35,easeLinearity:0.2,maxZoom:31});}
function parseALU(value){const raw=value.trim().toLowerCase().replace(/\s+/g,'');const m=raw.match(/^alu-([0-9]+km|[0-9]+m|0\.1m2)-x([pn]\d+)-y([pn]\d+)$/);if(!m)throw new Error('Use an ALU such as ALU-1km-xp0-yp0');const level=LEVEL_BY_NAME.get(m[1]);if(!level)throw new Error('Unknown ALU level');return {level,ix:decodePart(m[2]),iy:decodePart(m[3])};}
document.getElementById('aluSearchForm')?.addEventListener('submit',e=>{e.preventDefault();try{const q=parseALU(searchInput.value);searchCell(q.level,q.ix,q.iy);}catch(err){searchHint.textContent=err.message;searchInput.focus();}});

async function loadBoundaries(){try{const r=await fetch(`${API_BASE}/api/v1/spatial/india-boundaries`);if(!r.ok)throw Error();const data=await r.json();indiaGeometry=data.features||[];boundaryLayer.addData(data);gridCanvas.schedule();rebuildInteractiveCells();}catch(_){searchHint.textContent='India boundary unavailable — start PostGIS + FastAPI.';}}
map.on('moveend zoomend',()=>{gridCanvas.schedule();rebuildInteractiveCells();});
loadBoundaries();
