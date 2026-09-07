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
let hoveredCode=null;
let redrawFrame=0;

const R=6378137;
const WORLD_CIRCUMFERENCE=2*Math.PI*R;
const ROOT_ORIGIN_X=7570000;
const ROOT_ORIGIN_Y=700000;
const ROOT_COLS=4000;
const BASE36='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS='0123456789';

// Actual ALU rounds only. Area is divided by 100 for every normal round:
// 1 km² -> 0.01 km² -> 0.0001 km² -> 0.000001 km² (1 m²).
// The final 1 m² -> 0.1 m² step uses sqrt(0.1) m square footprints.
const LEVELS=[
 {name:'1km2',display:'1 km²',side:1000,depth:0,minZoom:8},
 {name:'0.01km2',display:'0.01 km²',side:100,depth:1,minZoom:13},
 {name:'0.0001km2',display:'0.0001 km²',side:10,depth:2,minZoom:17},
 {name:'0.000001km2',display:'1 m²',side:1,depth:3,minZoom:21},
 {name:'0.1m2',display:'0.1 m²',side:Math.sqrt(0.1),depth:4,minZoom:25}
];

// Ten equal-area final square footprints. They intentionally represent the
// terminal Riemann-style sampling units; ten congruent squares cannot form a
// gapless 1 m² square tessellation without overlap/gaps.
const FINAL_PLACEMENTS=[[0,0],[0.3,0],[0.6,0],[0,0.3],[0.3,0.3],[0.6,0.3],[0,0.6],[0.3,0.6],[0.6,0.6],[0.35,0.35]];
const CHILD_TOKENS=[];
for(const a of BASE36)for(const b of BASE36)if((/[A-Z]/.test(a)&&/\d/.test(b))||(/\d/.test(a)&&/[A-Z]/.test(b)))CHILD_TOKENS.push(a+b);
const TOKEN_TO_INDEX=new Map(CHILD_TOKENS.slice(0,100).map((t,i)=>[t,i]));

function b36(n,width){let out='';do{out=BASE36[n%36]+out;n=Math.floor(n/36);}while(n>0);return out.padStart(width,'0');}
function fromB36(s){let n=0;for(const ch of s.toUpperCase()){const d=BASE36.indexOf(ch);if(d<0)throw Error('Invalid base36 code');n=n*36+d;}return n;}
function rootCode(ix,iy){if(ix<0||ix>=ROOT_COLS||iy<0)throw Error('ALU root outside India index extent');const flat=iy*ROOT_COLS+ix;const bucket=Math.floor(flat/(36**4)),rem=flat%(36**4);return `${ALPHABET[Math.floor(bucket/10)]}${DIGITS[bucket%10]}${b36(rem,4)}`;}
function rootFromCode(code){if(!/^[A-Z]\d[0-9A-Z]{4}$/.test(code))throw Error('Root ALU must be 6 characters: one letter + one number + four base36 characters');const bucket=ALPHABET.indexOf(code[0])*10+DIGITS.indexOf(code[1]);const flat=bucket*(36**4)+fromB36(code.slice(2));return {ix:flat%ROOT_COLS,iy:Math.floor(flat/ROOT_COLS)};}
function cellId(ix,iy,path){return [rootCode(ix,iy),...path.map(i=>CHILD_TOKENS[i])].join('-');}
function merc(lat,lon){lat=Math.max(-85.0511287798,Math.min(85.0511287798,lat));return [R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];}
function inv(x,y){return [180/Math.PI*(2*Math.atan(Math.exp(y/R))-Math.PI/2),180/Math.PI*x/R];}
function worldPixel(x,y,z){const s=256*Math.pow(2,z);return [(x/WORLD_CIRCUMFERENCE+0.5)*s,(0.5-y/WORLD_CIRCUMFERENCE)*s];}
function containerFromMercator(x,y){const p=worldPixel(x,y,map.getZoom()),o=map.getPixelOrigin();return [p[0]-o.x,p[1]-o.y];}
function boundsFromMercator(x1,y1,x2,y2){const a=inv(Math.min(x1,x2),Math.min(y1,y2)),b=inv(Math.max(x1,x2),Math.max(y1,y2));return [[a[0],a[1]],[b[0],b[1]]];}

function cellGeometry(ix,iy,path){
 let x=ROOT_ORIGIN_X+ix*1000,y=ROOT_ORIGIN_Y+iy*1000,side=1000;
 for(let depth=0;depth<path.length;depth++){
  const idx=path[depth];
  if(depth<3){const child=side/10;x+=(idx%10)*child;y+=Math.floor(idx/10)*child;side=child;}
  else {const [ox,oy]=FINAL_PLACEMENTS[idx],s=Math.sqrt(0.1);x+=ox;y+=oy;side=s;}
 }
 return {x1:x,y1:y,x2:x+side,y2:y+side,side,area:side*side};
}
function codeAtPoint(lat,lon,level=currentLevel()){
 const [mx,my]=merc(lat,lon);let rx=Math.floor((mx-ROOT_ORIGIN_X)/1000),ry=Math.floor((my-ROOT_ORIGIN_Y)/1000);
 if(rx<0||ry<0||rx>=ROOT_COLS)return null;
 let lx=mx-(ROOT_ORIGIN_X+rx*1000),ly=my-(ROOT_ORIGIN_Y+ry*1000),side=1000,path=[];
 for(let d=0;d<level.depth;d++){
  if(d<3){const child=side/10,dx=Math.floor(lx/child),dy=Math.floor(ly/child);if(dx<0||dx>9||dy<0||dy>9)return null;const idx=dy*10+dx;path.push(idx);lx-=dx*child;ly-=dy*child;side=child;}
  else {const s=Math.sqrt(0.1);let found=-1;for(let i=0;i<FINAL_PLACEMENTS.length;i++){const [ox,oy]=FINAL_PLACEMENTS[i];if(lx>=ox&&lx<=ox+s&&ly>=oy&&ly<=oy+s){found=i;break;}}if(found<0)return null;path.push(found);}
 }
 return {ix:rx,iy:ry,path,level,code:cellId(rx,ry,path)};
}
function currentLevel(){let chosen=LEVELS[0];for(const l of LEVELS)if(map.getZoom()>=l.minZoom)chosen=l;return chosen;}
function parseALU(raw){const value=raw.trim().toUpperCase();const parts=value.split('-');if(parts.length<1||!/^\w{6}$/.test(parts[0]))throw Error('Enter a 6-character root code followed by hierarchy segments.');if(!/^[A-Z]\d[0-9A-Z]{4}$/.test(parts[0]))throw Error('Every ALU root must contain a letter and a number.');const root=rootFromCode(parts[0]);const path=[];for(let i=1;i<parts.length;i++){const index=TOKEN_TO_INDEX.get(parts[i]);if(index===undefined)throw Error(`Invalid hierarchy segment: ${parts[i]}`);path.push(index);}if(path.length>4)throw Error('ALU hierarchy is too deep.');const level=LEVELS[path.length];if(level.name==='0.1m2'&&path.at(-1)>=10)throw Error('Final ALU segment must identify one of ten terminal units.');return {ix:root.ix,iy:root.iy,path,level,code:cellId(root.ix,root.iy,path)};}

function addRing(ctx,ring){ctx.moveTo(...containerFromMercator(...merc(ring[0][1],ring[0][0])));for(let i=1;i<ring.length;i++){const [lon,lat]=ring[i],p=containerFromMercator(...merc(lat,lon));ctx.lineTo(p[0],p[1]);}ctx.closePath();}
function clipIndia(ctx){ctx.beginPath();for(const f of indiaGeometry){const g=f.geometry;if(g.type==='Polygon')for(const ring of g.coordinates)addRing(ctx,ring);else if(g.type==='MultiPolygon')for(const poly of g.coordinates)for(const ring of poly)addRing(ctx,ring);}ctx.clip('evenodd');}

const GridCanvas=L.Layer.extend({
 onAdd(map){this._map=map;this._canvas=L.DomUtil.create('canvas','alu-grid-canvas');map.getPane('overlayPane').appendChild(this._canvas);this._ctx=this._canvas.getContext('2d');this._ctx.imageSmoothingEnabled=false;this.resize();map.on('move zoom resize viewreset',this.schedule,this);this.redraw();},
 onRemove(map){map.off('move zoom resize viewreset',this.schedule,this);this._canvas.remove();},
 schedule(){cancelAnimationFrame(redrawFrame);redrawFrame=requestAnimationFrame(()=>this.redraw());},
 resize(){const s=this._map.getSize(),d=window.devicePixelRatio||1;this._canvas.width=Math.max(1,Math.floor(s.x*d));this._canvas.height=Math.max(1,Math.floor(s.y*d));this._canvas.style.width=`${s.x}px`;this._canvas.style.height=`${s.y}px`;this._ctx.setTransform(d,0,0,d,0,0);},
 redraw(){if(!this._map||!indiaGeometry.length)return;this.resize();const ctx=this._ctx,s=this._map.getSize(),level=currentLevel(),b=this._map.getBounds();ctx.clearRect(0,0,s.x,s.y);clipIndia(ctx);
  const sw=merc(b.getSouth(),b.getWest()),ne=merc(b.getNorth(),b.getEast());
  let minRx=Math.floor((sw[0]-ROOT_ORIGIN_X)/1000)-1,maxRx=Math.ceil((ne[0]-ROOT_ORIGIN_X)/1000)+1,minRy=Math.floor((sw[1]-ROOT_ORIGIN_Y)/1000)-1,maxRy=Math.ceil((ne[1]-ROOT_ORIGIN_Y)/1000)+1;
  minRx=Math.max(0,minRx);minRy=Math.max(0,minRy);maxRx=Math.min(ROOT_COLS-1,maxRx);
  // At low zoom a 1 km cell is sub-pixel; drawing millions of invisible edges is
  // wasteful. The cells are still addressable/searchable; we render when visible.
  const a=containerFromMercator(ROOT_ORIGIN_X+minRx*1000,ROOT_ORIGIN_Y+minRy*1000),bb=containerFromMercator(ROOT_ORIGIN_X+(minRx+1)*1000,ROOT_ORIGIN_Y+(minRy+1)*1000);
  const approxPx=Math.min(Math.abs(bb[0]-a[0]),Math.abs(bb[1]-a[1]));
  if(level.depth===0&&approxPx<0.9)return;
  const rootCount=Math.max(0,maxRx-minRx+1)*Math.max(0,maxRy-minRy+1);
  if(rootCount>180000&&level.depth===0)return;
  ctx.strokeStyle='rgba(31,78,121,0.48)';ctx.lineWidth=1;ctx.beginPath();
  for(let iy=minRy;iy<=maxRy;iy++)for(let ix=minRx;ix<=maxRx;ix++){
    const rootX=ROOT_ORIGIN_X+ix*1000,rootY=ROOT_ORIGIN_Y+iy*1000;
    if(level.depth===0){const c=cellGeometry(ix,iy,[]);this.rect(ctx,c);}
    else this.drawDescendants(ctx,ix,iy,level,rootX,rootY);
  }
  ctx.stroke();
 },
 rect(ctx,c){const p1=containerFromMercator(c.x1,c.y1),p2=containerFromMercator(c.x2,c.y2);const x=Math.min(p1[0],p2[0]),y=Math.min(p1[1],p2[1]),w=Math.abs(p2[0]-p1[0]),h=Math.abs(p2[1]-p1[1]);if(x+w<0||x>this._map.getSize().x||y+h<0||y>this._map.getSize().y)return;if(Math.max(w,h)<0.7)return;ctx.rect(Math.round(x)+0.5,Math.round(y)+0.5,Math.max(1,w),Math.max(1,h));},
 drawDescendants(ctx,ix,iy,level,rootX,rootY){const path=[];const visit=(depth,limit)=>{if(depth===limit){this.rect(ctx,cellGeometry(ix,iy,path));return;}for(let i=0;i<100;i++){path.push(i);visit(depth+1,limit);path.pop();if(limit===4&&depth===3&&i===9)break;}};
  // Do not materialize a huge full subtree when the active round would create
  // too many screen cells. Switch to the direct visible descendant path range.
  const estimated=level.depth===1?100:level.depth===2?10000:level.depth===3?1000000:10000000;
  if(estimated>5000){
    const b=this._map.getBounds(),sw=merc(b.getSouth(),b.getWest()),ne=merc(b.getNorth(),b.getEast());
    const side=level.side;const lx0=Math.max(0,Math.floor((sw[0]-rootX)/side)-1),lx1=Math.min(Math.ceil(1000/side)-1,Math.floor((ne[0]-rootX)/side)+1),ly0=Math.max(0,Math.floor((sw[1]-rootY)/side)-1),ly1=Math.min(Math.ceil(1000/side)-1,Math.floor((ne[1]-rootY)/side)+1);
    for(let ly=ly0;ly<=ly1;ly++)for(let lx=lx0;lx<=lx1;lx++){const p=[];let qx=lx,qy=ly;for(let d=level.depth-1;d>=0;d--){const dx=Math.floor(qx/Math.pow(10,d)),dy=Math.floor(qy/Math.pow(10,d));const idx=dy*10+dx;p.push(idx);qx-=dx*Math.pow(10,d);qy-=dy*Math.pow(10,d);}p.reverse();this.rect(ctx,cellGeometry(ix,iy,p));}
  }else visit(0,level.depth);
 }
});
const gridCanvas=new GridCanvas();gridCanvas.addTo(map);

async function showCellMeta(code){const cached=metaCache.get(code);if(cached)return cached;try{const r=await fetch(`${API_BASE}/api/v1/spatial/cell-info/${encodeURIComponent(code)}`);if(!r.ok)throw Error();const data=await r.json();metaCache.set(code,data);return data;}catch(_){const data={ulpin:'Not linked'};metaCache.set(code,data);return data;}}
const metaCache=new Map();
async function showHover(e,hit){hoveredCode=hit.code;tooltip.classList.remove('hidden');tooltip.style.left=`${Math.min(window.innerWidth-300,Math.max(10,e.clientX+14))}px`;tooltip.style.top=`${Math.min(window.innerHeight-90,Math.max(10,e.clientY+14))}px`;tooltip.innerHTML=`<b>${hit.code}</b><br>Area: ${hit.level.name==='0.1m2'?'0.1':hit.level.side*hit.level.side} m²<br>ULPIN: <span>checking…</span>`;const data=await showCellMeta(hit.code);if(hoveredCode===hit.code)tooltip.innerHTML=`<b>${hit.code}</b><br>Area: ${data.area_m2??hit.level.side*hit.level.side} m²<br>ULPIN: ${data.ulpin??'Not linked'}`;}
map.on('mousemove',e=>{const hit=codeAtPoint(e.latlng.lat,e.latlng.lng);if(!hit){tooltip.classList.add('hidden');return;}showHover(e.originalEvent,hit);});
map.on('mouseout',()=>tooltip.classList.add('hidden'));

function searchCell(target){highlightLayer.clearLayers();const c=cellGeometry(target.ix,target.iy,target.path);const r=L.rectangle(boundsFromMercator(c.x1,c.y1,c.x2,c.y2),{weight:4,color:'#ef4444',fill:false,dashArray:'8 6',interactive:false}).addTo(highlightLayer);const b=r.getBounds();searchResult.classList.remove('hidden');searchResult.innerHTML=`<b>${target.code}</b><br>${target.level.display} · ${c.area.toPrecision(8)} m²`;map.flyToBounds(b.pad(0.55),{duration:1.5,easeLinearity:0.2,maxZoom:31});showCellMeta(target.code).then(d=>{searchResult.innerHTML=`<b>${target.code}</b><br>${target.level.display} · ${c.area.toPrecision(8)} m²<br>ULPIN: ${d.ulpin??'Not linked'}`;});}

document.getElementById('aluSearchForm')?.addEventListener('submit',e=>{e.preventDefault();try{const target=parseALU(searchInput.value);searchHint.textContent='';searchCell(target);}catch(err){searchHint.textContent=err.message;searchInput.focus();}});

async function loadBoundaries(){try{const r=await fetch(`${API_BASE}/api/v1/spatial/india-boundaries`);if(!r.ok)throw Error();const data=await r.json();indiaGeometry=data.features||[];boundaryLayer.addData(data);gridCanvas.schedule();}catch(_){searchHint.textContent='India boundary unavailable — start PostGIS + FastAPI.';}}
map.on('moveend zoomend',()=>gridCanvas.schedule());
loadBoundaries();
