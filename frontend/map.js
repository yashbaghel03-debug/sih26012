const API_BASE=new URLSearchParams(location.search).get('api')||'http://localhost:8000';
const INDIA_BOUNDS=[[6.5,68],[37.5,97.5]];
const map=L.map('map',{minZoom:4,maxZoom:31,zoomControl:true,maxBounds:INDIA_BOUNDS,maxBoundsViscosity:0.15,zoomAnimation:true,fadeAnimation:false}).fitBounds(INDIA_BOUNDS);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,maxNativeZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
const boundaryLayer=L.geoJSON(null,{style:{weight:2,fill:false}}).addTo(map);
const finalNumberLayer=L.layerGroup().addTo(map);
const zoomInfo=document.getElementById('zoomInfo'),levelInfo=document.getElementById('levelInfo'),popup=document.getElementById('cellPopup');
const finishBtn=document.getElementById('finishSearch'),clearBtn=document.getElementById('clearSearch'),statusEl=document.getElementById('searchStatus');
const numberPanel=document.getElementById('numberPanel'),numberSummary=document.getElementById('numberSummary'),numberList=document.getElementById('numberList'),closeNumbers=document.getElementById('closeNumbers');

// One active level at a time. Every cell at that level has exactly the same
// dimensions in the Web-Mercator working coordinate system.
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

const R=6378137;
function webMercator(lat,lon){return [R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];}
function inverse(x,y){return [180/Math.PI*(2*Math.atan(Math.exp(y/R))-Math.PI/2),180/Math.PI*x/R];}
function currentLevel(z){let chosen=levels[0];for(const l of levels)if(z>=l.minZoom)chosen=l;return chosen;}
function idPart(v){return v<0?'m'+Math.abs(v):'p'+v;}
function cellId(level,ix,iy){return `ALU-${level.name}-x${idPart(ix)}-y${idPart(iy)}`;}
function showCell(level,ix,iy,area,searchNumber=null){popup.style.display='block';popup.innerHTML=`<b>${searchNumber?`Search #${searchNumber}<br>`:''}${cellId(level,ix,iy)}</b><br>Level: ${level.display}<br>Logical size: ${level.metersX} m × ${level.metersY} m<br>Area: ${area} m²`;}

// High-performance local canvas grid. There is no per-zoom network request and
// no "loading" state. The full visible grid is redrawn from deterministic math.
const GridCanvas=L.Layer.extend({
  onAdd:function(map){
    this._map=map;
    this._canvas=L.DomUtil.create('canvas','alu-grid-canvas');
    const pane=map.getPane('overlayPane');
    pane.appendChild(this._canvas);
    L.DomUtil.setPosition(this._canvas,L.point(0,0));
    this._ctx=this._canvas.getContext('2d');
    this._ctx.imageSmoothingEnabled=false;
    this._resize();
    map.on('move zoom resize viewreset',this._redraw,this);
    this._redraw();
  },
  onRemove:function(map){map.off('move zoom resize viewreset',this._redraw,this);this._canvas.remove();},
  _resize:function(){
    const s=this._map.getSize(),d=window.devicePixelRatio||1;
    this._canvas.width=Math.max(1,Math.floor(s.x*d));
    this._canvas.height=Math.max(1,Math.floor(s.y*d));
    this._canvas.style.width=`${s.x}px`;this._canvas.style.height=`${s.y}px`;
    this._ctx.setTransform(d,0,0,d,0,0);
  },
  _redraw:function(){
    if(!this._map||!this._ctx)return;
    this._resize();
    const ctx=this._ctx,s=this._map.getSize();
    ctx.clearRect(0,0,s.x,s.y);
    const z=this._map.getZoom(),level=currentLevel(z),b=this._map.getBounds();
    zoomInfo.textContent=`Zoom ${Number(z).toFixed(2)}`;
    levelInfo.textContent=`Visible grid: ${level.display}${level.canonical?' · canonical ALU':''}`;

    const sw=webMercator(b.getSouth(),b.getWest()),ne=webMercator(b.getNorth(),b.getEast());
    const ix0=Math.floor(sw[0]/level.metersX)-1,ix1=Math.ceil(ne[0]/level.metersX)+1;
    const iy0=Math.floor(sw[1]/level.metersY)-1,iy1=Math.ceil(ne[1]/level.metersY)+1;
    const cells=Math.max(0,ix1-ix0+1)*Math.max(0,iy1-iy0+1);

    // At every zoom, draw every cell intersecting the window. The canvas keeps
    // thousands of cells cheap and avoids the mixed-size SVG effect.
    if(cells>500000){levelInfo.textContent=`Visible grid: ${level.display} · ${cells.toLocaleString()} cells`;return;}

    const origin=this._map.getPixelOrigin(),pz=this._map.getZoom();
    ctx.lineWidth=1;
    ctx.strokeStyle='rgba(37,99,235,0.48)';
    ctx.beginPath();
    for(let ix=ix0;ix<=ix1;ix++){
      const x0=ix*level.metersX,x1=(ix+1)*level.metersX;
      const p0=this._map.project(L.latLng(inverse(x0,0)),pz),p1=this._map.project(L.latLng(inverse(x1,0)),pz);
      const px0=p0.x-origin.x,px1=p1.x-origin.x;
      if(px1<0||px0>s.x)continue;
      ctx.moveTo(Math.round(px0)+0.5,0);ctx.lineTo(Math.round(px0)+0.5,s.y);
    }
    for(let iy=iy0;iy<=iy1;iy++){
      const y0=iy*level.metersY,y1=(iy+1)*level.metersY;
      const p0=this._map.project(L.latLng(inverse(0,y0)[0],0),pz),p1=this._map.project(L.latLng(inverse(0,y1)[0],0),pz);
      const py0=p0.y-origin.y,py1=p1.y-origin.y;
      if(py1<0||py0>s.y)continue;
      ctx.moveTo(0,Math.round(py0)+0.5);ctx.lineTo(s.x,Math.round(py0)+0.5);
    }
    ctx.stroke();
  }
});
const gridCanvas=new GridCanvas();gridCanvas.addTo(map);

// Convert a click on the screen to exactly one active grid cell.
map.on('click',e=>{
  const level=currentLevel(map.getZoom());
  const [mx,my]=webMercator(e.latlng.lat,e.latlng.lng);
  const ix=Math.floor(mx/level.metersX),iy=Math.floor(my/level.metersY);
  showCell(level,ix,iy,level.metersX*level.metersY);
});

function localNumbering(b){
 const level=levels.at(-1),sw=webMercator(b.getSouth(),b.getWest()),ne=webMercator(b.getNorth(),b.getEast());
 const xmin=Math.floor(sw[0]/0.1),xmax=Math.ceil(ne[0]/0.1),ymin=Math.floor(sw[1]/1),ymax=Math.ceil(ne[1]/1),nx=xmax-xmin,ny=ymax-ymin,total=nx*ny;
 const n=Math.min(total,1000),items=[];
 for(let seq=0;seq<n;seq++){const iy=ymax-1-Math.floor(seq/nx),ix=xmin+(seq%nx);items.push({search_number:seq+1,ix,iy,alu_id:cellId(level,ix,iy)});}
 return {total_cells:total,items};
}

async function finishSearch(){
 const z=map.getZoom(),b=map.getBounds();
 if(z<31){statusEl.textContent='Zoom to 31 (the finest level) before finishing the search.';return;}
 finishBtn.disabled=true;statusEl.textContent='Numbering visible 0.1 m² cells…';finalNumberLayer.clearLayers();
 let data;
 try{
  const u=new URL(`${API_BASE}/api/v1/spatial/search-numbering`);for(const [k,v] of [['west',b.getWest()],['south',b.getSouth()],['east',b.getEast()],['north',b.getNorth()],['limit',1000]])u.searchParams.set(k,v);
  const r=await fetch(u);if(!r.ok)throw Error(`HTTP ${r.status}`);data=await r.json();
 }catch(_){data=localNumbering(b);}
 numberSummary.innerHTML=`<b>${Number(data.total_cells).toLocaleString()}</b> visible 0.1 m² cells.<br>Numbering starts with the north-west edge cell, including partially visible edge cells. Showing the first ${data.items.length.toLocaleString()} numbers.`;
 numberList.innerHTML=data.items.map(item=>`<div class="number-row"><b>#${item.search_number}</b><span>${item.alu_id}<br>index (${item.ix}, ${item.iy})</span></div>`).join('')+(data.items.length<data.total_cells?`<div class="number-more">More cells exist in the finished window; narrow the search window to enumerate them all.</div>`:'');
 numberPanel.classList.remove('hidden');statusEl.textContent='Search finished. 0.1 m² numbering is ready.';
 if(data.items.length){const first=data.items[0],level=levels.at(-1);const a=inverse(first.ix*0.1,first.iy*1),c=inverse((first.ix+1)*0.1,(first.iy+1)*1);const r=L.rectangle([a,c],{weight:3,color:'#dc2626',fill:true,fillOpacity:0.08});r.on('click',()=>showCell(level,first.ix,first.iy,0.1,first.search_number));r.addTo(finalNumberLayer);}
 finishBtn.disabled=false;
}
finishBtn?.addEventListener('click',finishSearch);clearBtn?.addEventListener('click',()=>{finalNumberLayer.clearLayers();numberPanel.classList.add('hidden');statusEl.textContent='Numbering cleared. You can continue navigating.';});closeNumbers?.addEventListener('click',()=>numberPanel.classList.add('hidden'));

// PostGIS is used for the real India boundary once per session. Grid rendering
// never waits for this request.
async function loadBoundaries(){try{const r=await fetch(`${API_BASE}/api/v1/spatial/india-boundaries`);if(r.ok)boundaryLayer.addData(await r.json());}catch(_){} }
loadBoundaries();
