const API_BASE=new URLSearchParams(location.search).get('api')||'http://localhost:8000';
const INDIA_BOUNDS=[[6.5,68],[37.5,97.5]];
const map=L.map('map',{minZoom:4,maxZoom:31,zoomControl:true,maxBounds:INDIA_BOUNDS,maxBoundsViscosity:0.15}).fitBounds(INDIA_BOUNDS);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,maxNativeZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
const boundaryLayer=L.geoJSON(null,{style:{weight:2,fill:false}}).addTo(map);
const gridLayer=L.layerGroup().addTo(map);
const finalNumberLayer=L.layerGroup().addTo(map);
const zoomInfo=document.getElementById('zoomInfo'),levelInfo=document.getElementById('levelInfo'),popup=document.getElementById('cellPopup');
const finishBtn=document.getElementById('finishSearch'),clearBtn=document.getElementById('clearSearch'),statusEl=document.getElementById('searchStatus');
const numberPanel=document.getElementById('numberPanel'),numberSummary=document.getElementById('numberSummary'),numberList=document.getElementById('numberList'),closeNumbers=document.getElementById('closeNumbers');

const levels=[
 {name:'500km',display:'500 km',metersX:500000,metersY:500000,minZoom:4},
 {name:'250km',display:'250 km',metersX:250000,metersY:250000,minZoom:6},
 {name:'100km',display:'100 km',metersX:100000,metersY:100000,minZoom:8},
 {name:'50km',display:'50 km',metersX:50000,metersY:50000,minZoom:9},
 {name:'10km',display:'10 km',metersX:10000,metersY:10000,minZoom:10},
 {name:'1km',display:'1 km',metersX:1000,metersY:1000,minZoom:12,canonical:true},
 {name:'100m',display:'100 m',metersX:100,metersY:100,minZoom:15,canonical:true},
 {name:'10m',display:'10 m',metersX:10,metersY:10,minZoom:18,canonical:true},
 {name:'1m',display:'1 m',metersX:1,metersY:1,minZoom:22,canonical:true},
 {name:'0.1m2',display:'0.1 m²',metersX:0.1,metersY:1,minZoom:31,canonical:true}
];
function webMercator(lat,lon){const R=6378137;return [R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];}
function inverse(x,y){const R=6378137;return [180/Math.PI*(2*Math.atan(Math.exp(y/R))-Math.PI/2),180/Math.PI*x/R];}
function currentLevel(z){let chosen=levels[0];for(const l of levels)if(z>=l.minZoom)chosen=l;return chosen;}
function idPart(v){return v<0?'m'+Math.abs(v):'p'+v;}
function cellId(level,ix,iy){return `ALU-${level.name}-x${idPart(ix)}-y${idPart(iy)}`;}
function showCell(level,ix,iy,area,searchNumber=null){popup.style.display='block';popup.innerHTML=`<b>${searchNumber?`Search #${searchNumber}<br>`:''}${cellId(level,ix,iy)}</b><br>Level: ${level.display}<br>Logical size: ${level.metersX} m × ${level.metersY} m<br>Area: ${area} m²`;}

async function renderGrid(){
 const level=currentLevel(map.getZoom()),b=map.getBounds();
 zoomInfo.textContent=`Zoom ${map.getZoom()}`;
 levelInfo.textContent=`Visible window grid: ${level.display}`;
 gridLayer.clearLayers();
 try{
  const u=new URL(`${API_BASE}/api/v1/spatial/grid`);for(const [k,v] of [['west',b.getWest()],['south',b.getSouth()],['east',b.getEast()],['north',b.getNorth()],['zoom',map.getZoom()]])u.searchParams.set(k,v);
  const r=await fetch(u);if(!r.ok)throw Error(`HTTP ${r.status}`);const data=await r.json();
  if(data.level===level.name){
   const layer=L.geoJSON(data,{style:{weight:1,color:'#2563eb',fill:false,opacity:0.8},onEachFeature:(f,l)=>{const p=f.properties;l.on('click',()=>showCell(level,p.ix,p.iy,p.area_m2));}});layer.addTo(gridLayer);
   if(data.truncated)levelInfo.textContent=`Visible window grid: ${level.display} · first 1500 cells (zoom further to see all)`;
   return;
  }
 }catch(_){/* local fallback below */}
 const sw=webMercator(b.getSouth(),b.getWest()),ne=webMercator(b.getNorth(),b.getEast());
 const ix0=Math.floor(sw[0]/level.metersX),ix1=Math.ceil(ne[0]/level.metersX)-1;
 const iy0=Math.floor(sw[1]/level.metersY),iy1=Math.ceil(ne[1]/level.metersY)-1;
 const nx=Math.max(0,ix1-ix0+1),ny=Math.max(0,iy1-iy0+1),count=nx*ny;
 if(count>1500){levelInfo.textContent=`Visible window grid: ${level.display} · ${count.toLocaleString()} cells, zoom further`;return;}
 for(let iy=iy1;iy>=iy0;iy--)for(let ix=ix0;ix<=ix1;ix++){
  const a=inverse(ix*level.metersX,iy*level.metersY),c=inverse((ix+1)*level.metersX,(iy+1)*level.metersY);
  const rect=L.rectangle([a,c],{weight:1,color:'#2563eb',fill:false,interactive:true});rect.on('click',()=>showCell(level,ix,iy,level.metersX*level.metersY));rect.addTo(gridLayer);
 }
}

function localNumbering(b){
 const level=levels.at(-1),sw=webMercator(b.getSouth(),b.getWest()),ne=webMercator(b.getNorth(),b.getEast());
 const xmin=Math.floor(sw[0]/0.1),xmax=Math.ceil(ne[0]/0.1),ymin=Math.floor(sw[1]/1),ymax=Math.ceil(ne[1]/1),nx=xmax-xmin,ny=ymax-ymin,total=nx*ny;
 const n=Math.min(total,1000),items=[];
 for(let seq=0;seq<n;seq++){const iy=ymax-1-Math.floor(seq/nx),ix=xmin+(seq%nx);items.push({search_number:seq+1,ix,iy,alu_id:cellId(level,ix,iy)});}
 return {total_cells:total,items};
}

async function finishSearch(){
 const z=map.getZoom(),b=map.getBounds();
 if(z<31){statusEl.textContent='Zoom to 31 (the finest level) before finishing the search. This keeps final numbering limited to the exact visible window.';return;}
 finishBtn.disabled=true;statusEl.textContent='Numbering visible 0.1 m² cells from the north-west edge…';finalNumberLayer.clearLayers();
 try{
  const u=new URL(`${API_BASE}/api/v1/spatial/search-numbering`);for(const [k,v] of [['west',b.getWest()],['south',b.getSouth()],['east',b.getEast()],['north',b.getNorth()],['limit',1000]])u.searchParams.set(k,v);
  const r=await fetch(u);if(!r.ok)throw Error(`HTTP ${r.status}`);var data=await r.json();
 }catch(_){data=localNumbering(b);}
 numberSummary.innerHTML=`<b>${Number(data.total_cells).toLocaleString()}</b> visible 0.1 m² cells.<br>Numbering starts with the north-west edge cell, even when that cell is only partially visible. Showing the first ${data.items.length.toLocaleString()} numbers.`;
 numberList.innerHTML=data.items.map(item=>`<div class="number-row"><b>#${item.search_number}</b><span>${item.alu_id}<br>index (${item.ix}, ${item.iy})</span></div>`).join('')+(data.items.length<data.total_cells?`<div class="number-more">More cells exist in the finished window; zoom/pan to a smaller search window to enumerate them all.</div>`:'');
 numberPanel.classList.remove('hidden');statusEl.textContent='Search finished. 0.1 m² numbering is ready.';
 // Highlight the first numbered (north-west) cell so the starting rule is visible.
 if(data.items.length){const first=data.items[0],level=levels.at(-1);const a=inverse(first.ix*0.1,first.iy*1),c=inverse((first.ix+1)*0.1,(first.iy+1)*1);const r=L.rectangle([a,c],{weight:3,color:'#dc2626',fill:true,fillOpacity:0.08});r.on('click',()=>showCell(level,first.ix,first.iy,0.1,first.search_number));r.addTo(finalNumberLayer);}
 finishBtn.disabled=false;
}
finishBtn?.addEventListener('click',finishSearch);clearBtn?.addEventListener('click',()=>{finalNumberLayer.clearLayers();numberPanel.classList.add('hidden');statusEl.textContent='Numbering cleared. You can continue navigating.';});closeNumbers?.addEventListener('click',()=>numberPanel.classList.add('hidden'));
map.on('zoomend moveend',renderGrid);renderGrid();
async function loadBoundaries(){try{const r=await fetch(`${API_BASE}/api/v1/spatial/india-boundaries`);if(r.ok)boundaryLayer.addData(await r.json());}catch(_){}}
loadBoundaries();
