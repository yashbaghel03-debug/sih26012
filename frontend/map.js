const API_BASE=new URLSearchParams(location.search).get('api')||'http://localhost:8000';
const INDIA_BOUNDS=[[6.5,68],[37.5,97.5]];
const map=L.map('map',{minZoom:4,maxZoom:31,zoomControl:true,maxBounds:INDIA_BOUNDS,maxBoundsViscosity:0.35,zoomAnimation:true,fadeAnimation:false}).fitBounds(INDIA_BOUNDS);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,maxNativeZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
const boundaryLayer=L.geoJSON(null,{style:{weight:2,color:'#111827',fill:false,opacity:0.85}}).addTo(map);
const highlightLayer=L.layerGroup().addTo(map);
const tooltip=document.getElementById('cellTooltip');
const searchResult=document.getElementById('searchResult');
const searchInput=document.getElementById('aluSearch');
const searchHint=document.getElementById('searchHint');
let indiaGeometry=[];
let indiaBoundsBoxes=[];
let hoveredCode=null;
let renderHandle=0;
let renderTimer=0;

const R=6378137;
const WORLD=2*Math.PI*R;
const ROOT_ORIGIN_X=7570000;
const ROOT_ORIGIN_Y=700000;
const ROOT_COLS=4000;
const BASE36='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS='0123456789';
const MAX_RENDER_CELLS=45000;

const LEVELS=[
  {name:'500km',display:'500 km',side:500000,depth:0},
  {name:'250km',display:'250 km',side:250000,depth:0},
  {name:'100km',display:'100 km',side:100000,depth:0},
  {name:'50km',display:'50 km',side:50000,depth:0},
  {name:'10km',display:'10 km',side:10000,depth:0},
  {name:'1km2',display:'1 km²',side:1000,depth:0},
  {name:'0.01km2',display:'0.01 km²',side:100,depth:1},
  {name:'0.0001km2',display:'0.0001 km²',side:10,depth:2},
  {name:'1m2',display:'1 m²',side:1,depth:3},
  {name:'0.1m2',display:'0.1 m²',side:Math.sqrt(0.1),depth:4}
];

const CHILD_TOKENS=[];
for(const a of BASE36)for(const b of BASE36){const ok=(/[A-Z]/.test(a)&&/\d/.test(b))||(/\d/.test(a)&&/[A-Z]/.test(b));if(ok)CHILD_TOKENS.push(a+b);}
const CHILD_TOKEN_INDEX=new Map(CHILD_TOKENS.map((v,i)=>[v,i]));
const FINAL_PLACEMENTS=[[0,0],[0.34,0],[0.68,0],[0,0.34],[0.34,0.34],[0.68,0.34],[0,0.68],[0.34,0.68],[0.68,0.68],[0.34,0.34]];

function b36(n,width){let s='';do{s=BASE36[n%36]+s;n=Math.floor(n/36);}while(n);return s.padStart(width,'0');}
function fromB36(s){let n=0;for(const ch of s){const d=BASE36.indexOf(ch);if(d<0)throw Error('Invalid base-36 code');n=n*36+d;}return n;}
function rootCode(ix,iy){const flat=iy*ROOT_COLS+ix,bucket=Math.floor(flat/(36**4)),rem=flat%(36**4);return `${ALPHABET[Math.floor(bucket/10)]}${DIGITS[bucket%10]}${b36(rem,4)}`;}
function rootFromCode(code){if(!/^[A-Z]\d[0-9A-Z]{4}$/.test(code))throw Error('ALU root must be 6 characters with at least one alphabet and one number.');const bucket=ALPHABET.indexOf(code[0])*10+DIGITS.indexOf(code[1]);const flat=bucket*(36**4)+fromB36(code.slice(2));return {ix:flat%ROOT_COLS,iy:Math.floor(flat/ROOT_COLS)};}
function cellId(ix,iy,path){return [rootCode(ix,iy),...path.map(i=>CHILD_TOKENS[i])].join('-');}
function merc(lat,lon){lat=Math.max(-85.05112878,Math.min(85.05112878,lat));return [R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];}
function inv(x,y){return [180/Math.PI*(2*Math.atan(Math.exp(y/R))-Math.PI/2),180/Math.PI*x/R];}
function worldPx(z){return 256*2**z;}
function screenXY(mx,my,z,origin){const s=worldPx(z);return [(mx/WORLD+0.5)*s-origin.x,(0.5-my/WORLD)*s-origin.y];}
function boundsFromMercator(x1,y1,x2,y2){const a=inv(Math.min(x1,x2),Math.min(y1,y2)),b=inv(Math.max(x1,x2),Math.max(y1,y2));return [[a[0],a[1]],[b[0],b[1]]];}
function cellGeometry(ix,iy,path){let x=ROOT_ORIGIN_X+ix*1000,y=ROOT_ORIGIN_Y+iy*1000,side=1000;for(let d=0;d<path.length;d++){const k=path[d];if(d<3){const child=side/10;x+=(k%10)*child;y+=Math.floor(k/10)*child;side=child;}else{const [ox,oy]=FINAL_PLACEMENTS[k];side=Math.sqrt(0.1);x+=ox;y+=oy;}}return {x1:x,y1:y,x2:x+side,y2:y+side,side,area:side*side};}
function currentZoomLevel(){let chosen=LEVELS[0];for(const l of LEVELS)if(map.getZoom()>=l.depth*4+8)chosen=l;return chosen;}
function projectedCellSize(level){return level.side*worldPx(map.getZoom())/WORLD;}
function visibleCellsForLevel(level){const b=map.getBounds(),sw=merc(b.getSouth(),b.getWest()),ne=merc(b.getNorth(),b.getEast());const nx=Math.ceil((ne[0]-sw[0])/level.side)+4,ny=Math.ceil((ne[1]-sw[1])/level.side)+4;return nx*ny*(level.depth===4?10:1);}
function chooseRenderLevel(){let desired=currentZoomLevel();let idx=LEVELS.indexOf(desired);for(;idx>=0;idx--){const l=LEVELS[idx];if(projectedCellSize(l)>=0.9&&visibleCellsForLevel(l)<=MAX_RENDER_CELLS)return l;}return LEVELS[0];}

function pointInRing(lat,lon,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];const hit=((yi>lat)!=(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi);if(hit)inside=!inside;}return inside;}
function featureContains(lat,lon,f){const g=f.geometry;if(!g)return false;if(g.type==='Polygon'){if(!pointInRing(lat,lon,g.coordinates[0]))return false;for(let i=1;i<g.coordinates.length;i++)if(pointInRing(lat,lon,g.coordinates[i]))return false;return true;}if(g.type==='MultiPolygon')return g.coordinates.some(poly=>{if(!pointInRing(lat,lon,poly[0]))return false;for(let i=1;i<poly.length;i++)if(pointInRing(lat,lon,poly[i]))return false;return true;});return false;}
function pointInIndia(lat,lon){for(const b of indiaBoundsBoxes)if(lat>=b.minLat&&lat<=b.maxLat&&lon>=b.minLon&&lon<=b.maxLon)for(const f of indiaGeometry)if(featureContains(lat,lon,f))return true;return false;}

function addRing(ctx,ring,z,origin){if(!ring.length)return;let p=screenXY(...merc(ring[0][1],ring[0][0]),z,origin);ctx.moveTo(p[0],p[1]);for(let i=1;i<ring.length;i++){p=screenXY(...merc(ring[i][1],ring[i][0]),z,origin);ctx.lineTo(p[0],p[1]);}ctx.closePath();}
function clipIndia(ctx,z,origin){ctx.beginPath();for(const f of indiaGeometry){const g=f.geometry;if(g.type==='Polygon')for(const ring of g.coordinates)addRing(ctx,ring,z,origin);else if(g.type==='MultiPolygon')for(const poly of g.coordinates)for(const ring of poly)addRing(ctx,ring,z,origin);}ctx.clip('evenodd');}

const GridCanvas=L.Layer.extend({
  onAdd(map){this._map=map;this._canvas=L.DomUtil.create('canvas','alu-grid-canvas');map.getPane('overlayPane').appendChild(this._canvas);this._ctx=this._canvas.getContext('2d',{alpha:true});this._ctx.imageSmoothingEnabled=false;this.resize();},
  onRemove(){this._canvas.remove();},
  resize(){const s=this._map.getSize(),d=window.devicePixelRatio||1;this._canvas.width=Math.max(1,Math.floor(s.x*d));this._canvas.height=Math.max(1,Math.floor(s.y*d));this._canvas.style.width=`${s.x}px`;this._canvas.style.height=`${s.y}px`;this._ctx.setTransform(d,0,0,d,0,0);},
  schedule(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{cancelAnimationFrame(renderHandle);renderHandle=requestAnimationFrame(()=>this.render());},35);},
  render(){if(!indiaGeometry.length)return;this.resize();const ctx=this._ctx,s=this._map.getSize(),z=this._map.getZoom(),level=chooseRenderLevel(),b=this._map.getBounds(),origin=this._map.getPixelOrigin();ctx.clearRect(0,0,s.x,s.y);ctx.save();clipIndia(ctx,z,origin);
    const sw=merc(b.getSouth(),b.getWest()),ne=merc(b.getNorth(),b.getEast());
    const minX=Math.floor(sw[0]/level.side)-1,maxX=Math.ceil(ne[0]/level.side)+1,minY=Math.floor(sw[1]/level.side)-1,maxY=Math.ceil(ne[1]/level.side)+1;
    const total=visibleCellsForLevel(level);
    if(total>MAX_RENDER_CELLS){ctx.restore();return;}
    ctx.strokeStyle='rgba(31,78,121,0.5)';ctx.lineWidth=1;ctx.beginPath();
    if(level.depth<4){
      for(let iy=minY;iy<=maxY;iy++)for(let ix=minX;ix<=maxX;ix++){
        const x1=ix*level.side,y1=iy*level.side,x2=x1+level.side,y2=y1+level.side,p1=screenXY(x1,y1,z,origin),p2=screenXY(x2,y2,z,origin);const x=Math.min(p1[0],p2[0]),y=Math.min(p1[1],p2[1]),w=Math.abs(p2[0]-p1[0]),h=Math.abs(p2[1]-p1[1]);if(x+w<0||x>s.x||y+h<0||y>s.y)continue;ctx.rect(Math.round(x)+.5,Math.round(y)+.5,Math.max(1,w),Math.max(1,h));
      }
    }else{
      const p0=Math.sqrt(0.1);for(let py=minY;py<=maxY;py++)for(let px=minX;px<=maxX;px++)for(const [ox,oy] of FINAL_PLACEMENTS){const x1=px+ox,y1=py+oy,x2=x1+p0,y2=y1+p0,p1=screenXY(x1,y1,z,origin),p2=screenXY(x2,y2,z,origin),x=Math.min(p1[0],p2[0]),y=Math.min(p1[1],p2[1]),w=Math.abs(p2[0]-p1[0]),h=Math.abs(p2[1]-p1[1]);if(x+w<0||x>s.x||y+h<0||y>s.y||w<0.9)continue;ctx.rect(Math.round(x)+.5,Math.round(y)+.5,Math.max(1,w),Math.max(1,h));}
    }
    ctx.stroke();ctx.restore();
  }
});
const gridCanvas=new GridCanvas();gridCanvas.addTo(map);

const metaCache=new Map();
let hoverRequest=0;
async function showHover(evt,hit){hoveredCode=hit.code;tooltip.classList.remove('hidden');tooltip.style.left=`${Math.min(innerWidth-310,Math.max(10,evt.clientX+14))}px`;tooltip.style.top=`${Math.min(innerHeight-100,Math.max(10,evt.clientY+14))}px`;tooltip.innerHTML=`<b>${hit.code}</b><br>Area: ${(hit.level.side*hit.level.side).toPrecision(8)} m²<br>ULPIN: checking…`;const requestId=++hoverRequest;setTimeout(async()=>{if(requestId!==hoverRequest||hoveredCode!==hit.code)return;if(metaCache.has(hit.code)){const d=metaCache.get(hit.code);tooltip.innerHTML=`<b>${hit.code}</b><br>Area: ${d.area_m2??hit.level.side*hit.level.side} m²<br>ULPIN: ${d.ulpin??'Not linked'}`;return;}try{const r=await fetch(`${API_BASE}/api/v1/spatial/cell-info/${encodeURIComponent(hit.code)}`);const d=r.ok?await r.json():{ulpin:'Not linked'};metaCache.set(hit.code,d);if(hoveredCode===hit.code)tooltip.innerHTML=`<b>${hit.code}</b><br>Area: ${d.area_m2??hit.level.side*hit.level.side} m²<br>ULPIN: ${d.ulpin??'Not linked'}`;}catch(_){metaCache.set(hit.code,{ulpin:'Not linked'});}},120);}
map.on('mousemove',e=>{const {lat,lng}=e.latlng;if(!pointInIndia(lat,lng)){hoveredCode=null;tooltip.classList.add('hidden');return;}const hit=pointCell(chooseRenderLevel(),...merc(lat,lng));if(hit)showHover(e.originalEvent,hit);});
map.on('mouseout',()=>{hoveredCode=null;hoverRequest++;tooltip.classList.add('hidden');});
function pointCell(level,mx,my){const ix=Math.floor((mx-ROOT_ORIGIN_X)/1000),iy=Math.floor((my-ROOT_ORIGIN_Y)/1000);if(ix<0||iy<0||ix>=ROOT_COLS)return null;let lx=mx-(ROOT_ORIGIN_X+ix*1000),ly=my-(ROOT_ORIGIN_Y+iy*1000),side=1000,path=[];for(let d=0;d<level.depth;d++){if(d<3){const child=side/10,dx=Math.floor(lx/child),dy=Math.floor(ly/child);if(dx<0||dx>9||dy<0||dy>9)return null;path.push(dy*10+dx);lx-=dx*child;ly-=dy*child;side=child;}else{const s=Math.sqrt(.1);let hit=-1;for(let i=0;i<FINAL_PLACEMENTS.length;i++){const [ox,oy]=FINAL_PLACEMENTS[i];if(lx>=ox&&lx<=ox+s&&ly>=oy&&ly<=oy+s){hit=i;break;}}if(hit<0)return null;path.push(hit);}}return {ix,iy,path,code:cellId(ix,iy,path),level};}

function searchCell(target){const c=cellGeometry(target.ix,target.iy,target.path);const r=L.rectangle(boundsFromMercator(c.x1,c.y1,c.x2,c.y2),{weight:4,color:'#ef4444',fill:false,dashArray:'8 6',interactive:false}).addTo(highlightLayer);searchResult.classList.remove('hidden');searchResult.innerHTML=`<b>${target.code}</b><br>${target.level.display} · ${c.area.toPrecision(8)} m²`;map.flyToBounds(r.getBounds().pad(.55),{duration:1.4,easeLinearity:.2,maxZoom:31});}
function parseALU(raw){const parts=raw.trim().toUpperCase().split('-').filter(Boolean);if(parts.length<1||parts.length>5)throw Error('ALU must contain one 6-character root plus up to four hierarchy segments.');if(!/^[A-Z]\d[0-9A-Z]{4}$/.test(parts[0]))throw Error('Root ALU must contain 6 alpha-numeric characters, including a letter and a number.');const root=rootFromCode(parts[0]),path=[];for(let i=1;i<parts.length;i++){const k=CHILD_TOKEN_INDEX.get(parts[i]);if(k===undefined)throw Error(`Invalid hierarchy segment: ${parts[i]}`);path.push(k);}const level=LEVELS[path.length];if(!level)throw Error('ALU hierarchy is too deep.');return {code:parts.join('-'),ix:root.ix,iy:root.iy,path,level};}
document.getElementById('aluSearchForm')?.addEventListener('submit',e=>{e.preventDefault();try{searchHint.textContent='';highlightLayer.clearLayers();searchCell(parseALU(searchInput.value));}catch(err){searchHint.textContent=err.message;searchInput.focus();}});

async function loadBoundaries(){try{const r=await fetch(`${API_BASE}/api/v1/spatial/india-boundaries`);if(!r.ok)throw Error();const data=await r.json();indiaGeometry=data.features||[];indiaBoundsBoxes=[];for(const f of indiaGeometry){let minLat=90,maxLat=-90,minLon=180,maxLon=-180;const scan=g=>{if(g.type==='Polygon')for(const ring of g.coordinates)for(const [lon,lat] of ring){minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);minLon=Math.min(minLon,lon);maxLon=Math.max(maxLon,lon);}else if(g.type==='MultiPolygon')for(const poly of g.coordinates)for(const ring of poly)for(const [lon,lat] of ring){minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);minLon=Math.min(minLon,lon);maxLon=Math.max(maxLon,lon);}};scan(f.geometry);indiaBoundsBoxes.push({minLat,maxLat,minLon,maxLon});}boundaryLayer.addData(data);gridCanvas.schedule();}catch(_){searchHint.textContent='India boundary unavailable — start PostGIS + FastAPI.';}}
map.on('zoomend moveend',()=>gridCanvas.schedule());
loadBoundaries();
