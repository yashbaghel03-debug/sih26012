/* India WebGIS — responsive independent spatial-cell renderer. */
(() => {
'use strict';
const API_BASE=new URLSearchParams(location.search).get('api')||'http://localhost:8000';
const INDIA_BOUNDS=[[6.4,67.8],[37.7,97.7]];
const INDIA_CACHE='sih26012-india-boundary-v3';
const R=6378137,WORLD=2*Math.PI*R,ROOT_X=7570000,ROOT_Y=700000,ROOT_COLS=400;
const BASE36='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',LETTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZ',DIGITS='0123456789';
const LEVELS=[
 {name:'100km2',label:'100 km²',side:10000,depth:0,zoom:5},
 {name:'1km2',label:'1 km²',side:1000,depth:1,zoom:9},
 {name:'0.01km2',label:'0.01 km²',side:100,depth:2,zoom:13},
 {name:'0.0001km2',label:'0.0001 km²',side:10,depth:3,zoom:17},
 {name:'1m2',label:'1 m²',side:1,depth:4,zoom:21},
 {name:'0.1m2',label:'0.1 m²',side:Math.sqrt(.1),depth:5,zoom:25}
];
const TOKENS=[];
for(const a of BASE36)for(const b of BASE36)if((/[A-Z]/.test(a)&&/\d/.test(b))||(/\d/.test(a)&&/[A-Z]/.test(b)))TOKENS.push(a+b);
const TOKEN_TO_INDEX=new Map(TOKENS.slice(0,100).map((v,i)=>[v,i]));
const TERMINAL=[[0,0],[.34,0],[.68,0],[0,.34],[.34,.34],[.68,.34],[0,.68],[.34,.68],[.68,.68],[.315,.315]];
function b36(n,w){let s='';do{s=BASE36[n%36]+s;n=Math.floor(n/36)}while(n);return s.padStart(w,'0')}
function rootCode(ix,iy){const flat=iy*ROOT_COLS+ix,b=Math.floor(flat/36**4),r=flat%36**4;return LETTERS[Math.floor(b/10)]+DIGITS[b%10]+b36(r,4)}
function rootFromCode(code){if(!/^[A-Z]\d[0-9A-Z]{4}$/.test(code))throw Error('Invalid 6-character ALU root');let b=LETTERS.indexOf(code[0])*10+DIGITS.indexOf(code[1]),r=0;for(const c of code.slice(2))r=r*36+BASE36.indexOf(c);const flat=b*36**4+r;return{ix:flat%ROOT_COLS,iy:Math.floor(flat/ROOT_COLS)}}
function merc(lat,lon){lat=Math.max(-85.0511,Math.min(85.0511,lat));return[R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))]}
function inv(x,y){return[180/Math.PI*(2*Math.atan(Math.exp(y/R))-Math.PI/2),180*x/(Math.PI*R)]}
function worldPx(z){return 256*2**z}
function screen(mx,my,z,o){const w=worldPx(z);return[(mx/WORLD+.5)*w-o.x,(.5-my/WORLD)*w-o.y]}
function pointRing(lat,lon,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const x1=ring[i][0],y1=ring[i][1],x2=ring[j][0],y2=ring[j][1],hit=((y1>lat)!=(y2>lat))&&(lon<(x2-x1)*(lat-y1)/(y2-y1)+x1);if(hit)inside=!inside}return inside}
function contains(lat,lon,f){const g=f.geometry;if(!g)return false;const poly=p=>pointRing(lat,lon,p[0])&&p.slice(1).every(r=>!pointRing(lat,lon,r));return g.type==='Polygon'?poly(g.coordinates):g.type==='MultiPolygon'?g.coordinates.some(poly):false}
function inIndia(lat,lon){if(lat<INDIA_BOUNDS[0][0]||lat>INDIA_BOUNDS[1][0]||lon<INDIA_BOUNDS[0][1]||lon>INDIA_BOUNDS[1][1])return false;if(!indiaGeometry.length)return false;return indiaGeometry.some(f=>contains(lat,lon,f))}
function pathRing(ctx,ring,z,o){if(!ring.length)return;let p=screen(...merc(ring[0][1],ring[0][0]),z,o);ctx.moveTo(p[0],p[1]);for(let i=1;i<ring.length;i++){p=screen(...merc(ring[i][1],ring[i][0]),z,o);ctx.lineTo(p[0],p[1])}ctx.closePath()}
function clipIndia(ctx,z,o){if(!indiaGeometry.length)return false;ctx.beginPath();for(const f of indiaGeometry){const g=f.geometry;if(g.type==='Polygon')for(const r of g.coordinates)pathRing(ctx,r,z,o);else if(g.type==='MultiPolygon')for(const p of g.coordinates)for(const r of p)pathRing(ctx,r,z,o)}ctx.clip('evenodd');return true}
function activeLevel(){let l=LEVELS[0];for(const x of LEVELS)if(map.getZoom()>=x.zoom)l=x;return l}
function visibleMerc(){const b=map.getBounds(),a=merc(b.getSouth(),b.getWest()),c=merc(b.getNorth(),b.getEast());return{minX:Math.min(a[0],c[0]),maxX:Math.max(a[0],c[0]),minY:Math.min(a[1],c[1]),maxY:Math.max(a[1],c[1])}}
function cellAt(lat,lon){const level=activeLevel(),[mx,my]=merc(lat,lon),ix=Math.floor((mx-ROOT_X)/10000),iy=Math.floor((my-ROOT_Y)/10000);if(ix<0||iy<0||ix>=ROOT_COLS||!inIndia(lat,lon))return null;let lx=mx-(ROOT_X+ix*10000),ly=my-(ROOT_Y+iy*10000),side=10000,path=[];for(let d=0;d<level.depth;d++){if(d<4){const s=side/10,dx=Math.max(0,Math.min(9,Math.floor(lx/s))),dy=Math.max(0,Math.min(9,Math.floor(ly/s)));path.push(dy*10+dx);lx-=dx*s;ly-=dy*s;side=s}else{const t=Math.sqrt(.1);let hit=-1;for(let k=0;k<10;k++){const p=TERMINAL[k];if(lx>=p[0]&&lx<=p[0]+t&&ly>=p[1]&&ly<=p[1]+t){hit=k;break}}if(hit<0)return null;path.push(hit)}}return{ix,iy,path,code:[rootCode(ix,iy),...path.map(i=>TOKENS[i])].join('-'),level}}
function cellMercator(ix,iy,path){let x=ROOT_X+ix*10000,y=ROOT_Y+iy*10000,side=10000;for(let d=0;d<path.length;d++){const k=path[d];if(d<4){const s=side/10;x+=(k%10)*s;y+=Math.floor(k/10)*s;side=s}else{const p=TERMINAL[k];x+=p[0];y+=p[1];side=Math.sqrt(.1)}}return{x1:x,y1:y,x2:x+side,y2:y+side,side,area:side*side}}
const map=L.map('map',{minZoom:5,maxZoom:29,zoomControl:true,maxBounds:INDIA_BOUNDS,maxBoundsViscosity:.95,zoomAnimation:false,fadeAnimation:false}).fitBounds(INDIA_BOUNDS,{animate:false,padding:[8,8]});
const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:29,maxNativeZoom:19,attribution:'© OpenStreetMap contributors'});
const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:29,maxNativeZoom:19,attribution:'Tiles © Esri'});
const physical=L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,maxNativeZoom:17,attribution:'© OpenTopoMap contributors'});
street.addTo(map);
L.control.layers({'Street / GPS':street,'Physical / Terrain':physical,'Satellite':satellite},{} ,{collapsed:false,position:'topright'}).addTo(map);
const boundaryLayer=L.geoJSON(null,{style:{weight:2,color:'#111827',fill:false,opacity:.9},interactive:false}).addTo(map),highlightLayer=L.layerGroup().addTo(map);
const canvas=L.DomUtil.create('canvas','alu-grid-canvas');canvas.style.position='absolute';canvas.style.left='0';canvas.style.top='0';canvas.style.pointerEvents='none';canvas.style.zIndex='450';map.getPane('overlayPane').appendChild(canvas);
const tooltip=document.getElementById('cellTooltip'),searchInput=document.getElementById('aluSearch'),searchResult=document.getElementById('searchResult'),searchHint=document.getElementById('searchHint');
let indiaGeometry=[],metaCache=new Map(),hoverToken=0,frame=0;
function useBoundary(geo){if(!geo?.features?.length)return false;indiaGeometry=geo.features;boundaryLayer.clearLayers();boundaryLayer.addData(geo);return true}
function loadCachedBoundary(){try{const geo=JSON.parse(localStorage.getItem(INDIA_CACHE)||'null');return useBoundary(geo)}catch(_){return false}}
function resizeCanvas(){const s=map.getSize(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.floor(s.x*d));canvas.height=Math.max(1,Math.floor(s.y*d));canvas.style.width=s.x+'px';canvas.style.height=s.y+'px';return d}
function paint(){
  const size=map.getSize(),d=resizeCanvas(),ctx=canvas.getContext('2d');
  ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,size.x,size.y);
  if(!indiaGeometry.length)return;
  const z=map.getZoom(),o=map.getPixelOrigin(),v=visibleMerc(),level=activeLevel(),unit=level.depth<5?level.side:level.side;
  const px=unit*worldPx(z)/WORLD;
  const stride=Math.max(1,Math.ceil(0.85/Math.max(px,.0001)));
  const minX=Math.floor((v.minX-unit*2)/unit),maxX=Math.ceil((v.maxX+unit*2)/unit),minY=Math.floor((v.minY-unit*2)/unit),maxY=Math.ceil((v.maxY+unit*2)/unit);
  ctx.save();
  if(!clipIndia(ctx,z,o)){ctx.restore();return}
  ctx.strokeStyle='rgba(31,78,121,.50)';ctx.lineWidth=1;ctx.beginPath();
  for(let gx=minX;gx<=maxX;gx+=stride){const x=gx*unit,a=screen(x,v.minY-unit,z,o),sx=Math.round(a[0])+.5;ctx.moveTo(sx,0);ctx.lineTo(sx,size.y)}
  for(let gy=minY;gy<=maxY;gy+=stride){const y=gy*unit,a=screen(v.minX-unit,y,z,o),sy=Math.round(a[1])+.5;ctx.moveTo(0,sy);ctx.lineTo(size.x,sy)}
  ctx.stroke();ctx.restore();
}
function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;paint()})}
map.on('move zoom resize',schedule);window.addEventListener('resize',()=>{map.invalidateSize({pan:false});schedule()},{passive:true});
async function openALU(cell){const u=new URL('alu-details.html',location.href);u.searchParams.set('alu',cell.code);u.searchParams.set('lat',cell.lat||'');u.searchParams.set('lng',cell.lng||'');window.location.href=u.href}
async function hover(e){const h=cellAt(e.latlng.lat,e.latlng.lng);if(!h){tooltip.classList.add('hidden');return}tooltip.classList.remove('hidden');tooltip.style.left=Math.min(innerWidth-300,Math.max(10,e.originalEvent.clientX+14))+'px';tooltip.style.top=Math.min(innerHeight-105,Math.max(10,e.originalEvent.clientY+14))+'px';tooltip.innerHTML='<b>'+h.code+'</b><br>Area: '+(h.level.side*h.level.side)+' m²<br>ULPIN: checking…';const t=++hoverToken;if(metaCache.has(h.code)){const d=metaCache.get(h.code);tooltip.innerHTML='<b>'+h.code+'</b><br>Area: '+(d.area_m2??h.level.side*h.level.side)+' m²<br>ULPIN: '+(d.ulpin||'Not linked');return}try{const r=await fetch(API_BASE+'/api/v1/spatial/cell-info/'+encodeURIComponent(h.code),{cache:'force-cache'});const d=r.ok?await r.json():{};metaCache.set(h.code,d);if(t===hoverToken)tooltip.innerHTML='<b>'+h.code+'</b><br>Area: '+(d.area_m2??h.level.side*h.level.side)+' m²<br>ULPIN: '+(d.ulpin||'Not linked')}catch(_){metaCache.set(h.code,{area_m2:h.level.side*h.level.side,ulpin:'Not linked'});if(t===hoverToken)tooltip.innerHTML='<b>'+h.code+'</b><br>Area: '+h.level.side*h.level.side+' m²<br>ULPIN: Not linked'}}
map.on('mousemove',hover);
map.on('click',e=>{const h=cellAt(e.latlng.lat,e.latlng.lng);if(!h)return;h.lat=e.latlng.lat.toFixed(7);h.lng=e.latlng.lng.toFixed(7);openALU(h)});
map.on('mouseout',()=>{hoverToken++;tooltip.classList.add('hidden')});
function parseALU(v){const p=v.trim().toUpperCase().split('-').filter(Boolean);if(p.length<1||p.length>6)throw Error('Enter a 6-character root plus up to five 2-character hierarchy segments');const r=rootFromCode(p[0]),path=p.slice(1).map((t,i)=>{if(!TOKEN_TO_INDEX.has(t)||!/^[A-Z0-9]{2}$/.test(t)||!/[A-Z]/.test(t)||!/[0-9]/.test(t))throw Error('Invalid 2-character mixed base36 hierarchy segment');const n=TOKEN_TO_INDEX.get(t);if(i===4&&n>=10)throw Error('Final 0.1 m² refinement has ten terminal children');return n});return{ix:r.ix,iy:r.iy,path,code:p.join('-')}}
document.getElementById('aluSearchForm')?.addEventListener('submit',e=>{e.preventDefault();try{const t=parseALU(searchInput.value),c=cellMercator(t.ix,t.iy,t.path),a=inv(c.x1,c.y1),b=inv(c.x2,c.y2),ll=[[a[0],a[1]],[b[0],b[1]]];highlightLayer.clearLayers();const r=L.rectangle(ll,{weight:4,color:'#ef4444',fill:false,dashArray:'8 6',interactive:false}).addTo(highlightLayer);searchResult.classList.remove('hidden');searchResult.innerHTML='<b>'+t.code+'</b><br>Located ALU cell · click the highlighted cell to open details';map.flyToBounds(r.getBounds().pad(.55),{duration:.9,maxZoom:29})}catch(err){searchHint.textContent=err.message||'Invalid ALU code'}});
async function fetchBoundary(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('boundary '+r.status);const geo=await r.json();if(geo?.type==='Feature')return{type:'FeatureCollection',features:[geo]};if(!geo?.features?.length)throw Error('India boundary is empty');return geo}
async function loadBoundaries(){
  if(loadCachedBoundary()){searchHint.textContent='Grid is always visible and clipped strictly to India.';schedule()}
  const sources=[API_BASE+'/api/v1/spatial/india-boundaries','https://raw.githubusercontent.com/johan/world.geo.json/master/countries/IND.geo.json'];
  for(const url of sources){try{const geo=await fetchBoundary(url);if(useBoundary(geo)){try{localStorage.setItem(INDIA_CACHE,JSON.stringify(geo))}catch(_){ }searchHint.textContent='Grid is always visible and clipped strictly to India.';schedule();return}}catch(err){console.warn('India boundary source failed',url,err)}}
  searchHint.textContent=indiaGeometry.length?'Grid is clipped to the cached India boundary.':'India boundary could not be loaded; map remains available but grid is paused.';schedule()
}
loadBoundaries();loadCachedBoundary();schedule();
})();
