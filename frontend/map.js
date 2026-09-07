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
let indiaGeometry=[]; let hoveredCode=null; let redrawFrame=0;
const R=6378137,WORLD=2*Math.PI*R,ROOT_ORIGIN_X=7570000,ROOT_ORIGIN_Y=700000,ROOT_COLS=4000;
const BASE36='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ',DIGITS='0123456789';
const LEVELS=[
 {name:'1km2',display:'1 km²',side:1000,depth:0,minZoom:8},
 {name:'0.01km2',display:'0.01 km²',side:100,depth:1,minZoom:13},
 {name:'0.0001km2',display:'0.0001 km²',side:10,depth:2,minZoom:17},
 {name:'0.000001km2',display:'1 m²',side:1,depth:3,minZoom:21},
 {name:'0.1m2',display:'0.1 m²',side:Math.sqrt(0.1),depth:4,minZoom:25}
];
const FINAL_PLACEMENTS=[[0,0],[0.3,0],[0.6,0],[0,0.3],[0.3,0.3],[0.6,0.3],[0,0.6],[0.3,0.6],[0.6,0.6],[0.35,0.35]];
const CHILD_TOKENS=[];for(const a of BASE36)for(const b of BASE36)if((/[A-Z]/.test(a)&&/\d/.test(b))||(/\d/.test(a)&&/[A-Z]/.test(b)))CHILD_TOKENS.push(a+b);const TOKEN_TO_INDEX=new Map(CHILD_TOKENS.slice(0,100).map((t,i)=>[t,i]));
function b36(n,width){let out='';do{out=BASE36[n%36]+out;n=Math.floor(n/36);}while(n>0);return out.padStart(width,'0');}
function fromB36(s){let n=0;for(const ch of s){const d=BASE36.indexOf(ch);if(d<0)throw Error('Invalid base36 code');n=n*36+d;}return n;}
function rootCode(ix,iy){if(ix<0||ix>=ROOT_COLS||iy<0)throw Error('Root ALU outside indexed India extent');const flat=iy*ROOT_COLS+ix,bucket=Math.floor(flat/(36**4)),rem=flat%(36**4);return `${ALPHABET[Math.floor(bucket/10)]}${DIGITS[bucket%10]}${b36(rem,4)}`;}
function rootFromCode(code){if(!/^[A-Z]\d[0-9A-Z]{4}$/.test(code))throw Error('ALU root must be 6 characters with at least one letter and one number');const bucket=ALPHABET.indexOf(code[0])*10+DIGITS.indexOf(code[1]),flat=bucket*(36**4)+fromB36(code.slice(2));return {ix:flat%ROOT_COLS,iy:Math.floor(flat/ROOT_COLS)};}
function cellId(ix,iy,path){return [rootCode(ix,iy),...path.map(i=>CHILD_TOKENS[i])].join('-');}
function merc(lat,lon){lat=Math.max(-85.05112878,Math.min(85.05112878,lat));return [R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];}
function inv(x,y){return [180/Math.PI*(2*Math.atan(Math.exp(y/R))-Math.PI/2),180/Math.PI*x/R];}
function worldPixel(x,y,z){const s=256*2**z;return [(x/WORLD+0.5)*s,(0.5-y/WORLD)*s];}
function containerFromMercator(x,y){const p=worldPixel(x,y,map.getZoom()),o=map.getPixelOrigin();return [p[0]-o.x,p[1]-o.y];}
function boundsFromMercator(x1,y1,x2,y2){const a=inv(Math.min(x1,x2),Math.min(y1,y2)),b=inv(Math.max(x1,x2),Math.max(y1,y2));return [[a[0],a[1]],[b[0],b[1]]];}
function cellGeometry(ix,iy,path){let x=ROOT_ORIGIN_X+ix*1000,y=ROOT_ORIGIN_Y+iy*1000,side=1000;for(let d=0;d<path.length;d++){const k=path[d];if(d<3){const child=side/10;x+=(k%10)*child;y+=Math.floor(k/10)*child;side=child;}else{const [ox,oy]=FINAL_PLACEMENTS[k];side=Math.sqrt(0.1);x+=ox;y+=oy;}}return {x1:x,y1:y,x2:x+side,y2:y+side,side,area:side*side};}
function currentLevel(){let chosen=LEVELS[0];for(const l of LEVELS)if(map.getZoom()>=l.minZoom)chosen=l;return chosen;}
function codeAtPoint(lat,lon){if(!pointInIndia(lat,lon))return null;const level=currentLevel(),[mx,my]=merc(lat,lon);const ix=Math.floor((mx-ROOT_ORIGIN_X)/1000),iy=Math.floor((my-ROOT_ORIGIN_Y)/1000);if(ix<0||iy<0||ix>=ROOT_COLS)return null;let lx=mx-(ROOT_ORIGIN_X+ix*1000),ly=my-(ROOT_ORIGIN_Y+iy*1000),side=1000,path=[];for(let d=0;d<level.depth;d++){if(d<3){const child=side/10,dx=Math.floor(lx/child),dy=Math.floor(ly/child);if(dx<0||dx>9||dy<0||dy>9)return null;path.push(dy*10+dx);lx-=dx*child;ly-=dy*child;side=child;}else{const s=Math.sqrt(0.1);let hit=-1;for(let i=0;i<FINAL_PLACEMENTS.length;i++){const [ox,oy]=FINAL_PLACEMENTS[i];if(lx>=ox&&lx<=ox+s&&ly>=oy&&ly<=oy+s){hit=i;break;}}if(hit<0)return null;path.push(hit);}}return {ix,iy,path,level,code:cellId(ix,iy,path)};}
function pointInRing(lat,lon,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];const intersect=((yi>lat)!=(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi);if(intersect)inside=!inside;}return inside;}
function polygonContains(lat,lon,poly){if(!pointInRing(lat,lon,poly[0]))return false;for(let i=1;i<poly.length;i++)if(pointInRing(lat,lon,poly[i]))return false;return true;}
function featureContains(lat,lon,f){const g=f.geometry;if(g.type==='Polygon')return polygonContains(lat,lon,g.coordinates);if(g.type==='MultiPolygon')return g.coordinates.some(poly=>polygonContains(lat,lon,poly));return false;}
function pointInIndia(lat,lon){return indiaGeometry.some(f=>featureContains(lat,lon,f));}
function addRing(ctx,ring){const [lon0,lat0]=ring[0],p0=containerFromMercator(...merc(lat0,lon0));ctx.moveTo(p0[0],p0[1]);for(let i=1;i<ring.length;i++){const [lon,lat]=ring[i],p=containerFromMercator(...merc(lat,lon));ctx.lineTo(p[0],p[1]);}ctx.closePath();}
function clipIndia(ctx){ctx.beginPath();for(const f of indiaGeometry){const g=f.geometry;if(g.type==='Polygon')for(const ring of g.coordinates)addRing(ctx,ring);else if(g.type==='MultiPolygon')for(const poly of g.coordinates)for(const ring of poly)addRing(ctx,ring);}ctx.clip('evenodd');}
const GridCanvas=L.Layer.extend({
 onAdd(map){this._map=map;this._canvas=L.DomUtil.create('canvas','alu-grid-canvas');map.getPane('overlayPane').appendChild(this._canvas);this._ctx=this._canvas.getContext('2d');this._ctx.imageSmoothingEnabled=false;this.resize();map.on('move zoom resize viewreset',this.schedule,this);this.redraw();},
 onRemove(map){map.off('move zoom resize viewreset',this.schedule,this);this._canvas.remove();},
 schedule(){cancelAnimationFrame(redrawFrame);redrawFrame=requestAnimationFrame(()=>this.redraw());},
 resize(){const s=this._map.getSize(),d=window.devicePixelRatio||1;this._canvas.width=Math.max(1,Math.floor(s.x*d));this._canvas.height=Math.max(1,Math.floor(s.y*d));this._canvas.style.width=`${s.x}px`;this._canvas.style.height=`${s.y}px`;this._ctx.setTransform(d,0,0,d,0,0);},
 redraw(){if(!this._map||!this._ctx||!indiaGeometry.length)return;this.resize();const ctx=this._ctx,s=this._map.getSize(),level=currentLevel(),b=this._map.getBounds();ctx.clearRect(0,0,s.x,s.y);clipIndia(ctx);const sw=merc(b.getSouth(),b.getWest()),ne=merc(b.getNorth(),b.getEast());let minRx=Math.max(0,Math.floor((sw[0]-ROOT_ORIGIN_X)/1000)-1),maxRx=Math.min(ROOT_COLS-1,Math.ceil((ne[0]-ROOT_ORIGIN_X)/1000)+1),minRy=Math.max(0,Math.floor((sw[1]-ROOT_ORIGIN_Y)/1000)-1),maxRy=Math.ceil((ne[1]-ROOT_ORIGIN_Y)/1000)+1;if(level.depth===0){const pp1=containerFromMercator(ROOT_ORIGIN_X+minRx*1000,ROOT_ORIGIN_Y+minRy*1000),pp2=containerFromMercator(ROOT_ORIGIN_X+(minRx+1)*1000,ROOT_ORIGIN_Y+(minRy+1)*1000);if(Math.min(Math.abs(pp2[0]-pp1[0]),Math.abs(pp2[1]-pp1[1]))<0.9)return;}
  ctx.strokeStyle='rgba(31,78,121,0.52)';ctx.lineWidth=1;ctx.beginPath();
  for(let iy=minRy;iy<=maxRy;iy++)for(let ix=minRx;ix<=maxRx;ix++)this.drawRoot(ctx,ix,iy,level,b);
  ctx.stroke();
 },
 drawRoot(ctx,ix,iy,level,b){if(level.depth===0){this.rect(ctx,cellGeometry(ix,iy,[]));return;}const rootX=ROOT_ORIGIN_X+ix*1000,rootY=ROOT_ORIGIN_Y+iy*1000;let sw=merc(b.getSouth(),b.getWest()),ne=merc(b.getNorth(),b.getEast()),side=level.side;let lx0=Math.max(0,Math.floor((sw[0]-rootX)/side)-1),lx1=Math.min(1000/side-1,Math.floor((ne[0]-rootX)/side)+1),ly0=Math.max(0,Math.floor((sw[1]-rootY)/side)-1),ly1=Math.min(1000/side-1,Math.floor((ne[1]-rootY)/side)+1);if(level.depth<4){for(let ly=ly0;ly<=ly1;ly++)for(let lx=lx0;lx<=lx1;lx++){let qx=lx,qy=ly,path=[];for(let d=level.depth-1;d>=0;d--){const p10=10**d,dx=Math.floor(qx/p10),dy=Math.floor(qy/p10);path.push(dy*10+dx);qx-=dx*p10;qy-=dy*p10;}path.reverse();this.rect(ctx,cellGeometry(ix,iy,path));}}else{const pSide=1;const plx0=Math.max(0,Math.floor((sw[0]-rootX)/pSide)-1),plx1=Math.min(999,Math.floor((ne[0]-rootX)/pSide)+1),ply0=Math.max(0,Math.floor((sw[1]-rootY)/pSide)-1),ply1=Math.min(999,Math.floor((ne[1]-rootY)/pSide)+1);for(let py=ply0;py<=ply1;py++)for(let px=plx0;px<=plx1;px++){const qx=Math.floor(px),qy=Math.floor(py),path=[];for(let d=2;d>=0;d--){const p10=10**d,dx=Math.floor(qx/p10),dy=Math.floor(qy/p10);path.push(dy*10+dx);qx-=dx*p10;qy-=dy*p10;}path.reverse();for(let k=0;k<10;k++)this.rect(ctx,cellGeometry(ix,iy,[...path,k]));}}},
 rect(ctx,c){const p1=containerFromMercator(c.x1,c.y1),p2=containerFromMercator(c.x2,c.y2),x=Math.min(p1[0],p2[0]),y=Math.min(p1[1],p2[1]),w=Math.abs(p2[0]-p1[0]),h=Math.abs(p2[1]-p1[1]),s=this._map.getSize();if(x+w<0||x>s.x||y+h<0||y>s.y||Math.max(w,h)<0.7)return;ctx.rect(Math.round(x)+0.5,Math.round(y)+0.5,Math.max(1,w),Math.max(1,h));}
});
new GridCanvas().addTo(map);
const metaCache=new Map();
async function getMeta(code){if(metaCache.has(code))return metaCache.get(code);try{const r=await fetch(`${API_BASE}/api/v1/spatial/cell-info/${encodeURIComponent(code)}`);if(!r.ok)throw Error();const d=await r.json();metaCache.set(code,d);return d;}catch(_){const d={ulpin:'Not linked'};metaCache.set(code,d);return d;}}
async function showHover(evt,hit){hoveredCode=hit.code;tooltip.classList.remove('hidden');tooltip.style.left=`${Math.min(innerWidth-300,Math.max(10,evt.clientX+14))}px`;tooltip.style.top=`${Math.min(innerHeight-90,Math.max(10,evt.clientY+14))}px`;tooltip.innerHTML=`<b>${hit.code}</b><br>Area: ${hit.level.name==='0.1m2'?'0.1':hit.level.side*hit.level.side} m²<br>ULPIN: checking…`;const d=await getMeta(hit.code);if(hoveredCode===hit.code)tooltip.innerHTML=`<b>${hit.code}</b><br>Area: ${d.area_m2??hit.level.side*hit.level.side} m²<br>ULPIN: ${d.ulpin??'Not linked'}`;}
map.on('mousemove',e=>{const hit=codeAtPoint(e.latlng.lat,e.latlng.lng);if(hit)showHover(e.originalEvent,hit);else{hoveredCode=null;tooltip.classList.add('hidden');}});map.on('mouseout',()=>{hoveredCode=null;tooltip.classList.add('hidden');});
async function searchTarget(code){const target=parseALU(code);highlightLayer.clearLayers();const c=cellGeometry(target.ix,target.iy,target.path);const r=L.rectangle(boundsFromMercator(c.x1,c.y1,c.x2,c.y2),{weight:4,color:'#ef4444',fill:false,dashArray:'8 6',interactive:false}).addTo(highlightLayer);searchResult.classList.remove('hidden');searchResult.innerHTML=`<b>${target.code}</b><br>${target.level.display} · ${c.area.toPrecision(8)} m²<br>Locating…`;map.flyToBounds(r.getBounds().pad(0.55),{duration:1.5,easeLinearity:0.2,maxZoom:31});const d=await getMeta(target.code);searchResult.innerHTML=`<b>${target.code}</b><br>${target.level.display} · ${c.area.toPrecision(8)} m²<br>ULPIN: ${d.ulpin??'Not linked'}`;}
document.getElementById('aluSearchForm')?.addEventListener('submit',e=>{e.preventDefault();try{searchHint.textContent='';searchTarget(searchInput.value);}catch(err){searchHint.textContent=err.message;searchInput.focus();}});
function parseALU(raw){const parts=raw.trim().toUpperCase().split('-');if(parts.length<1||parts.length>5)throw Error('ALU must be a 6-character root plus up to four 2-character hierarchy segments.');if(!/^[A-Z]\d[0-9A-Z]{4}$/.test(parts[0]))throw Error('Root ALU must contain a letter and a number.');const root=rootFromCode(parts[0]),path=[];for(let i=1;i<parts.length;i++){const idx=TOKEN_TO_INDEX.get(parts[i]);if(idx===undefined)throw Error(`Invalid hierarchy segment: ${parts[i]}`);path.push(idx);}if(path.length===4&&path[3]>=10)throw Error('Final ALU segment has ten terminal units.');const level=LEVELS[path.length];return {ix:root.ix,iy:root.iy,path,level,code:cellId(root.ix,root.iy,path)};}
async function loadBoundaries(){try{const r=await fetch(`${API_BASE}/api/v1/spatial/india-boundaries`);if(!r.ok)throw Error();const d=await r.json();indiaGeometry=d.features||[];boundaryLayer.addData(d);gridCanvasSchedule();}catch(_){searchHint.textContent='India boundary unavailable — start PostGIS + FastAPI.';}}
function gridCanvasSchedule(){/* layer instance is not stored; a map move triggers redraw */map.fire('viewreset');}
map.on('moveend zoomend',()=>map.fire('viewreset'));loadBoundaries();
