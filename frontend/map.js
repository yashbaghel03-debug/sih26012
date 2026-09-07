const INDIA_BOUNDS=[[6.5,68],[37.5,97.5]];
const map=L.map('map',{minZoom:4,maxZoom:24,zoomControl:true}).fitBounds(INDIA_BOUNDS);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);

const levels=[
  {name:'1 km',metersX:1000,metersY:1000,minZoom:10},
  {name:'100 m',metersX:100,metersY:100,minZoom:14},
  {name:'10 m',metersX:10,metersY:10,minZoom:17},
  {name:'1 m',metersX:1,metersY:1,minZoom:20},
  {name:'0.1 m²',metersX:0.1,metersY:1,minZoom:24}
];
let gridLayer=L.layerGroup().addTo(map);
const zoomInfo=document.getElementById('zoomInfo'),levelInfo=document.getElementById('levelInfo'),popup=document.getElementById('cellPopup');

function webMercator(lat,lon){const R=6378137, x=R*lon*Math.PI/180, y=R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));return [x,y]}
function inverse(x,y){const R=6378137;return [180/Math.PI*(2*Math.atan(Math.exp(y/R))-Math.PI/2),180/Math.PI*x/R]}
function currentLevel(z){let chosen=levels[0];for(const l of levels)if(z>=l.minZoom)chosen=l;return chosen}
function idPart(v){return v<0?'m'+Math.abs(v):'p'+v}
function renderGrid(){
  gridLayer.clearLayers();
  const z=map.getZoom(), level=currentLevel(z), b=map.getBounds();
  zoomInfo.textContent=`Zoom ${z}`;levelInfo.textContent=`Active grid: ${level.name}`;
  const sw=webMercator(b.getSouth(),b.getWest()), ne=webMercator(b.getNorth(),b.getEast());
  const ix0=Math.floor(sw[0]/level.metersX), ix1=Math.ceil(ne[0]/level.metersX);
  const iy0=Math.floor(sw[1]/level.metersY), iy1=Math.ceil(ne[1]/level.metersY);
  const count=(ix1-ix0+1)*(iy1-iy0+1);
  if(count>2500){popup.style.display='block';popup.textContent='Grid suppressed for performance. Zoom further in to render fewer cells.';return}
  popup.style.display='none';
  for(let ix=ix0;ix<=ix1;ix++)for(let iy=iy0;iy<=iy1;iy++){
    const a=inverse(ix*level.metersX,iy*level.metersY), c=inverse((ix+1)*level.metersX,(iy+1)*level.metersY);
    const id=`ALU-${level.name.replace(' ','')}-x${idPart(ix)}-y${idPart(iy)}`;
    const rect=L.rectangle([[a[0],a[1]],[c[0],c[1]]],{weight:1,fillOpacity:0,interactive:true});
    rect.on('click',()=>{popup.style.display='block';popup.innerHTML=`<b>${id}</b><br>Level: ${level.name}<br>Logical size: ${level.metersX} m × ${level.metersY} m<br>Area: ${(level.metersX*level.metersY).toFixed(1)} m²`;});
    rect.addTo(gridLayer);
  }
}
map.on('zoomend moveend',renderGrid);renderGrid();
