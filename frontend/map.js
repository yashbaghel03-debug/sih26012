const API_BASE=new URLSearchParams(location.search).get('api')||'http://localhost:8000';
const INDIA_BOUNDS=[[6.5,68],[37.5,97.5]];
const map=L.map('map',{minZoom:4,maxZoom:24,zoomControl:true}).fitBounds(INDIA_BOUNDS);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
const boundaryLayer=L.geoJSON(null,{style:{weight:1.5,fillOpacity:0.03}}).addTo(map);
const gridLayer=L.geoJSON(null,{style:{weight:1,color:'#2563eb',fillOpacity:0},onEachFeature:(f,l)=>l.on('click',()=>showCell(f.properties))}).addTo(map);
const zoomInfo=document.getElementById('zoomInfo'),levelInfo=document.getElementById('levelInfo'),popup=document.getElementById('cellPopup');

async function loadBoundaries(){
  try{const r=await fetch(`${API_BASE}/api/v1/spatial/india-boundaries`);if(!r.ok)throw Error(await r.text());const data=await r.json();boundaryLayer.addData(data);}
  catch(e){popup.style.display='block';popup.textContent=`India boundary API unavailable. Start PostGIS + FastAPI. ${e.message}`;}
}
function showCell(p){popup.style.display='block';popup.innerHTML=`<b>ALU grid cell</b><br>Level: ${p.level}<br>Index: (${p.ix}, ${p.iy})<br>Size: ${p.width_m} m × ${p.height_m} m<br>Area: ${p.area_m2} m²`;}
async function renderGrid(){
  const z=map.getZoom(), b=map.getBounds();
  zoomInfo.textContent=`Zoom ${z}`;
  if(z<10){gridLayer.clearLayers();levelInfo.textContent='Active grid: off — zoom in';return;}
  levelInfo.textContent='Loading PostGIS vector grid…';
  const u=new URL(`${API_BASE}/api/v1/spatial/grid`);u.searchParams.set('west',b.getWest());u.searchParams.set('south',b.getSouth());u.searchParams.set('east',b.getEast());u.searchParams.set('north',b.getNorth());u.searchParams.set('zoom',z);
  try{const r=await fetch(u);if(!r.ok)throw Error(await r.text());const data=await r.json();gridLayer.clearLayers();gridLayer.addData(data);levelInfo.textContent=`Active grid: ${data.level} · ${data.count} cells · ${data.area_m2} m²/cell`;}
  catch(e){gridLayer.clearLayers();levelInfo.textContent='Grid unavailable';popup.style.display='block';popup.textContent=e.message;}
}
map.on('zoomend moveend',renderGrid);
loadBoundaries();renderGrid();
