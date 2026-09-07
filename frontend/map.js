const API_BASE=new URLSearchParams(location.search).get('api')||'http://localhost:8000';
const INDIA_BOUNDS=[[6.5,68],[37.5,97.5]];
const map=L.map('map',{minZoom:4,maxZoom:31,zoomControl:true}).fitBounds(INDIA_BOUNDS);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
const boundaryLayer=L.geoJSON(null,{style:{weight:2,fill:false}}).addTo(map);
const gridLayer=L.layerGroup().addTo(map);
const zoomInfo=document.getElementById('zoomInfo'),levelInfo=document.getElementById('levelInfo'),popup=document.getElementById('cellPopup');

// Country-scale display grid keeps India visibly partitioned. Canonical ALU levels take over as we zoom in.
const levels=[
 {name:'500 km',metersX:500000,metersY:500000,minZoom:4},
 {name:'250 km',metersX:250000,metersY:250000,minZoom:6},
 {name:'100 km',metersX:100000,metersY:100000,minZoom:8},
 {name:'50 km',metersX:50000,metersY:50000,minZoom:9},
 {name:'10 km',metersX:10000,metersY:10000,minZoom:10},
 {name:'1 km',metersX:1000,metersY:1000,minZoom:12,canonical:true},
 {name:'100 m',metersX:100,metersY:100,minZoom:15,canonical:true},
 {name:'10 m',metersX:10,metersY:10,minZoom:18,canonical:true},
 {name:'1 m',metersX:1,metersY:1,minZoom:22,canonical:true},
 {name:'0.1 m²',metersX:0.1,metersY:1,minZoom:27,canonical:true}
];
function webMercator(lat,lon){const R=6378137;return [R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];}
function inverse(x,y){const R=6378137;return [180/Math.PI*(2*Math.atan(Math.exp(y/R))-Math.PI/2),180/Math.PI*x/R];}
function currentLevel(z){let chosen=levels[0];for(const l of levels)if(z>=l.minZoom)chosen=l;return chosen;}
function idPart(v){return v<0?'m'+Math.abs(v):'p'+v;}
function cellId(l,ix,iy){return `ALU-${l.name.replace(/\s/g,'')}-x${idPart(ix)}-y${idPart(iy)}`;}
function showCell(level,ix,iy,area){popup.style.display='block';popup.innerHTML=`<b>${cellId(level,ix,iy)}</b><br>Level: ${level.name}<br>Logical size: ${level.metersX} m × ${level.metersY} m<br>Area: ${area} m²`;}

async function renderGrid(){
 const level=currentLevel(map.getZoom()),b=map.getBounds();
 zoomInfo.textContent=`Zoom ${map.getZoom()}`;
 levelInfo.textContent=`Active grid: ${level.name}${level.canonical?' · canonical ALU':''}`;
 gridLayer.clearLayers();
 // PostGIS is authoritative when available.
 try{
  const u=new URL(`${API_BASE}/api/v1/spatial/grid`);u.searchParams.set('west',b.getWest());u.searchParams.set('south',b.getSouth());u.searchParams.set('east',b.getEast());u.searchParams.set('north',b.getNorth());u.searchParams.set('zoom',map.getZoom());
  const r=await fetch(u);if(!r.ok)throw Error(`HTTP ${r.status}`);const data=await r.json();
  if(data.level===level.name || data.level===level.name.replace('²','2')){
   L.geoJSON(data,{style:{weight:1,color:'#2563eb',fill:false},onEachFeature:(f,l)=>{const p=f.properties;l.on('click',()=>showCell(level,p.ix,p.iy,p.area_m2));}}).addTo(gridLayer);
   popup.style.display='none';return;
  }
 }catch(_){/* local fallback below */}

 // Local fallback makes the hierarchy visible even before FastAPI/PostGIS is running.
 const sw=webMercator(b.getSouth(),b.getWest()),ne=webMercator(b.getNorth(),b.getEast());
 const ix0=Math.floor(sw[0]/level.metersX),ix1=Math.ceil(ne[0]/level.metersX)-1;
 const iy0=Math.floor(sw[1]/level.metersY),iy1=Math.ceil(ne[1]/level.metersY)-1;
 const nx=Math.max(0,ix1-ix0+1),ny=Math.max(0,iy1-iy0+1),count=nx*ny;
 if(count>1800){levelInfo.textContent=`${level.name} selected · zoom further for cell rendering`;return;}
 for(let ix=ix0;ix<=ix1;ix++)for(let iy=iy0;iy<=iy1;iy++){
  const a=inverse(ix*level.metersX,iy*level.metersY),c=inverse((ix+1)*level.metersX,(iy+1)*level.metersY);
  const rect=L.rectangle([a,c],{weight:1,color:'#2563eb',fill:false,interactive:true});
  rect.on('click',()=>showCell(level,ix,iy,level.metersX*level.metersY));rect.addTo(gridLayer);
 }
 popup.style.display='none';
}
async function loadBoundaries(){
 try{const r=await fetch(`${API_BASE}/api/v1/spatial/india-boundaries`);if(!r.ok)throw Error(`HTTP ${r.status}`);boundaryLayer.addData(await r.json());}
 catch(_){/* OSM remains visible; official boundary appears after PostGIS is started. */}
}
map.on('zoomend moveend',renderGrid);renderGrid();loadBoundaries();
