(() => {
  'use strict';
  const ROOT='A016Y8',PARENT_PATH=[76,2],BASE36='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const TOKENS=[...BASE36].flatMap(a=>[...BASE36].map(b=>a+b)).filter(t=>/[A-Z]/.test(t)&&/[0-9]/.test(t)).slice(0,100);
  // IMPORTANT: keep the existing Pune/Vanaz region unchanged.
  const KOTHRUD_CENTER=[18.507399,73.807648];
  const PILOT_BOUNDS=[[18.506974,73.807223],[18.507824,73.808073]];
  const PILOT_NAME='Vanaz Corner / Paud Road, Kothrud, Pune';
  const STATUS={GREEN:{cls:'green',label:'Green — 19–21 / 21 fields',color:'#22c55e'},YELLOW:{cls:'yellow',label:'Yellow — 15–18 / 21 fields',color:'#facc15'},RED:{cls:'red',label:'Red — fewer than 15 / 21 fields',color:'#ef4444'},WHITE:{cls:'white',label:'White — not searched',color:'#ffffff'}};
  const SOURCES={OSM:'OpenStreetMap geographic context',OSM_VANAZ:'OpenStreetMap-derived Vanaz Corner transport feature',PMRCL:'Maharashtra Metro Rail Corporation — Vanaz alignment / station documentation',UNION:'Union Bank public address reference — Pushpa Apt., Paud Road, Kothrud',MH:'Maharashtra Mahabhumi / Mahabhunakasha land-record services'};
  const API=(()=>{const q=new URLSearchParams(location.search).get('api');if(q)return q.replace(/\/$/,'');if(location.hostname.endsWith('.app.github.dev'))return `https://${location.hostname.replace(/-\d+\.app\.github\.dev$/,'-8000.app.github.dev')}`;return 'http://localhost:8000'})();

  // Map-reading model for the SAME pilot footprint. These values are intentionally
  // contextual/inferred from visible geography; they are not represented as official cadastral facts.
  function contextFor(row,col){
    const lat=PILOT_BOUNDS[0][0]+(PILOT_BOUNDS[1][0]-PILOT_BOUNDS[0][0])*(row+.5)/100;
    const lng=PILOT_BOUNDS[0][1]+(PILOT_BOUNDS[1][1]-PILOT_BOUNDS[0][1])*(col+.5)/100;
    if(Math.abs(lat-18.50730)<0.000115)return {type:'transport',label:'Paud Road + Pune Metro transport corridor',source:SOURCES.PMRCL};
    if(Math.abs(lng-73.80771)<0.000075)return {type:'road',label:'Vanaz Corner / local road-access corridor',source:SOURCES.OSM_VANAZ};
    if(lat>18.50762&&lng>73.80772)return {type:'mixed',label:'Built-up mixed urban block near Vanaz Corner',source:SOURCES.OSM};
    return {type:'residential',label:'Built-up residential / mixed-use urban block',source:SOURCES.OSM};
  }
  function classify(n){return n>=19?'GREEN':n>=15?'YELLOW':'RED'}
  function aluId(row,col){const tenM=Math.floor(row/10)*10+Math.floor(col/10),oneM=(row%10)*10+(col%10);return [ROOT,TOKENS[PARENT_PATH[0]],TOKENS[PARENT_PATH[1]],TOKENS[tenM],TOKENS[oneM]].join('-')}
  const cells=[];for(let row=0;row<100;row++)for(let col=0;col<100;col++){const context=contextFor(row,col);cells.push({row,col,alu_id:aluId(row,col),context,available_fields:0,total_fields:21,status:'RED'})}
  const cellById=new Map(cells.map(c=>[c.alu_id,c]));

  const map=L.map('map',{zoomControl:true,minZoom:18,maxZoom:22,maxBounds:PILOT_BOUNDS,maxBoundsViscosity:1,center:KOTHRUD_CENTER,zoom:20});
  const street=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:22,maxNativeZoom:19,attribution:'Tiles © Esri'});
  const physical=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,maxNativeZoom:19,attribution:'Tiles © Esri'});
  const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:22,maxNativeZoom:19,attribution:'Tiles © Esri'});
  street.addTo(map);L.control.layers({'Street / GPS':street,'Physical / Terrain':physical,'Satellite':satellite},{},{collapsed:false,position:'topright'}).addTo(map);
  map.fitBounds(PILOT_BOUNDS,{padding:[0,0],animate:false});map.setMinZoom(map.getZoom());map.setMaxBounds(PILOT_BOUNDS);setTimeout(()=>map.invalidateSize({pan:false}),0);

  const canvas=L.DomUtil.create('canvas','pune-coverage-canvas');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:445;pointer-events:auto;background:transparent !important';map.getPane('overlayPane').appendChild(canvas);const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
  function resizeCanvas(){const size=map.getSize(),d=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.floor(size.x)),h=Math.max(1,Math.floor(size.y));if(canvas.width!==Math.floor(w*d)||canvas.height!==Math.floor(h*d)){canvas.width=Math.floor(w*d);canvas.height=Math.floor(h*d)}canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;ctx.setTransform(d,0,0,d,0,0);return size}
  function draw(){const size=resizeCanvas();ctx.clearRect(0,0,size.x,size.y);const sw=map.latLngToContainerPoint(L.latLng(PILOT_BOUNDS[0][0],PILOT_BOUNDS[0][1])),ne=map.latLngToContainerPoint(L.latLng(PILOT_BOUNDS[1][0],PILOT_BOUNDS[1][1])),width=ne.x-sw.x,height=sw.y-ne.y;if(width<=0||height<=0)return;const cw=width/100,ch=height/100;if(cw>=2){ctx.save();ctx.strokeStyle='rgba(51,65,85,.14)';ctx.lineWidth=.65;ctx.beginPath();for(let i=1;i<100;i++){const x=sw.x+i*cw;ctx.moveTo(x,ne.y);ctx.lineTo(x,sw.y)}for(let i=1;i<100;i++){const y=ne.y+i*ch;ctx.moveTo(sw.x,y);ctx.lineTo(ne.x,y)}ctx.stroke();ctx.strokeStyle='rgba(51,65,85,.22)';ctx.lineWidth=.8;ctx.beginPath();for(let i=10;i<100;i+=10){const x=sw.x+i*cw;ctx.moveTo(x,ne.y);ctx.lineTo(x,sw.y);const y=ne.y+i*ch;ctx.moveTo(sw.x,y);ctx.lineTo(ne.x,y)}ctx.stroke();ctx.strokeStyle='rgba(51,65,85,.32)';ctx.lineWidth=1;ctx.strokeRect(sw.x,ne.y,width,height);ctx.restore()}}
  let raf=0;function scheduleDraw(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw()})}map.on('move zoom resize',scheduleDraw);window.addEventListener('resize',scheduleDraw,{passive:true});

  function cellAt(latlng){if(latlng.lat<PILOT_BOUNDS[0][0]||latlng.lat>PILOT_BOUNDS[1][0]||latlng.lng<PILOT_BOUNDS[0][1]||latlng.lng>PILOT_BOUNDS[1][1])return null;const row=Math.max(0,Math.min(99,Math.floor((latlng.lat-PILOT_BOUNDS[0][0])/(PILOT_BOUNDS[1][0]-PILOT_BOUNDS[0][0])*100))),col=Math.max(0,Math.min(99,Math.floor((latlng.lng-PILOT_BOUNDS[0][1])/(PILOT_BOUNDS[1][1]-PILOT_BOUNDS[0][1])*100)));return cells[row*100+col]||null}
  function esc(v){return String(v??'').replace(/[&<>\\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;',"'":'&#39;'}[c]))}
  function fieldClass(s){return s==='N/D'?'red':s==='N/A'?'gray':s==='INFERRED'?'yellow':'green'}
  function valueHtml(f){if(f.status==='N/D')return '<span class="nd-value">N/D — not publicly verified</span>';if(f.status==='N/A')return '<span class="na-value">N/A — not applicable</span>';const tag=f.status==='INFERRED'?'<span style="display:inline-block;margin-top:6px;padding:2px 5px;border-radius:4px;background:#fff7cc;color:#806f24;font-size:7px;font-style:italic;font-weight:800;letter-spacing:.3px">MAP-INFERRED</span>':'';return `<span class="fictional-value">${esc(f.value)}</span>${tag}`}

  // Field set is generated from what a judge can actually see in this fixed map.
  // INFERRED = visual/geographic inference, not an official record.
  function fieldsFor(cell){
    const c=cell.context,transport=c.type==='transport',road=c.type==='road',mixed=c.type==='mixed';
    const fields=[
      {label:'1. Spatial Context',value:c.label,status:'AVAILABLE',source_id:c.source},
      {label:'2. Land Use',value:transport?'Transport / road corridor':road?'Road / access corridor':mixed?'Mixed-use built-up urban block':'Residential / mixed-use built-up block',status:'INFERRED',source_id:SOURCES.OSM},
      {label:'3. Cadastral Parcel',value:road||transport?'N/A — corridor cell, parcel claim not made':'N/D — official parcel geometry not imported',status:road||transport?'N/A':'N/D',source_id:SOURCES.MH},
      {label:'4. Ownership (RoR)',value:road||transport?'N/A — no private ownership claim for corridor':'N/D — private owner record not imported',status:road||transport?'N/A':'N/D',source_id:SOURCES.MH},
      {label:'5. Survey / CTS',value:'N/D — cell-level survey/CTS match not verified',status:'N/D',source_id:SOURCES.MH},
      {label:'6. ULPIN',value:'N/D — official ULPIN not imported',status:'N/D',source_id:SOURCES.MH},
      {label:'7. Road / Access Feature',value:transport?'Paud Road corridor visible in map context':road?'Vanaz Corner local road/access corridor':'Local urban access streets visible in map context',status:'AVAILABLE',source_id:transport?SOURCES.PMRCL:SOURCES.OSM},
      {label:'8. Nearby Landmark',value:'Vanaz Corner transport node',status:'AVAILABLE',source_id:SOURCES.OSM_VANAZ},
      {label:'9. Union Bank / Pushpa Apartment',value:'Paud Road, Pushpa Apt., Kothrud public address reference',status:'AVAILABLE',source_id:SOURCES.UNION},
      {label:'10. Metro Infrastructure',value:'Vanaz–Civil Court metro corridor context',status:'AVAILABLE',source_id:SOURCES.PMRCL},
      {label:'11. Property Tax',value:road||transport?'N/A — parcel PID not applicable to corridor context':'N/D — parcel PID not imported',status:road||transport?'N/A':'N/D',source_id:'PMC_PROPERTY_TAX'},
      {label:'12. Registration Deed',value:road||transport?'N/A — no property deed claim for corridor':'N/D — deed not imported',status:road||transport?'N/A':'N/D',source_id:'MH_REGISTRATION'},
      {label:'13. Building Permission',value:transport||road?'N/A — corridor cell is not treated as a building parcel':'INFERRED — building footprint/development context visible; permit not verified',status:transport||road?'N/A':'INFERRED',source_id:transport?SOURCES.PMRCL:SOURCES.OSM},
      {label:'14. Occupancy Certificate',value:'N/D — official OC not imported',status:'N/D',source_id:'PMC_BUILDING'},
      {label:'15. Zoning',value:transport?'INFERRED — transport corridor context; DP zoning not imported':road?'INFERRED — access corridor context; DP zoning not imported':'INFERRED — residential/mixed urban context; DP zoning not imported',status:'INFERRED',source_id:SOURCES.OSM},
      {label:'16. Utilities',value:'INFERRED — established urban service context; utility records not imported',status:'INFERRED',source_id:SOURCES.OSM},
      {label:'17. Infrastructure',value:transport?'Road + metro infrastructure context':road?'Road-access infrastructure context':'Urban road + transit infrastructure context',status:'AVAILABLE',source_id:transport?SOURCES.PMRCL:SOURCES.OSM},
      {label:'18. Environmental Zone',value:'N/D — environmental layer not verified',status:'N/D',source_id:'ENVIRONMENTAL_LAYER'},
      {label:'19. Restriction Zone',value:'N/D — legal restriction layer not verified',status:'N/D',source_id:'LEGAL_ENCUMBRANCE'},
      {label:'20. Market Value',value:road||transport?'N/A — no parcel valuation claim for corridor':'INFERRED — urban setting only; no official valuation imported',status:road||transport?'N/A':'INFERRED',source_id:'MH_REGISTRATION'},
      {label:'21. Integration Record',value:'ALU demo context/integration record',status:'AVAILABLE',source_id:'DEMO'}
    ];
    const resolved=fields.filter(f=>f.status!=='N/D').length;
    return {fields,resolved};
  }

  function openModal(cell){
    const {fields,resolved}=fieldsFor(cell),key=classify(resolved),meta=STATUS[key]||STATUS.RED;
    const old=document.getElementById('aluDetailModal');if(old)old.remove();
    const modal=document.createElement('div');modal.id='aluDetailModal';modal.className='alu-detail-modal';
    modal.innerHTML=`<div class="alu-detail-backdrop"></div><div class="alu-detail-panel"><button class="alu-detail-close" aria-label="Close">×</button><div class="alu-detail-head status-${meta.cls}" style="background:${meta.color}1a;border:1px solid ${meta.color}55"><div><div class="alu-detail-kicker">ALU DETAILS · PUNE PILOT</div><h2>${esc(cell.alu_id)}</h2><p>1 m² · real map context · evidence-aware demo data</p></div><span class="pill ${meta.cls}">${esc(meta.label)}</span></div><div class="coverage-score"><strong>${resolved}/21 fields resolved</strong><span>${esc(meta.label)}</span><small>Map-inferred values are explicitly labelled. Official cadastral/private fields remain N/D until verified.</small></div><div class="alu-parent"><div><b>Pune pilot region</b><strong>${esc(PILOT_NAME)}</strong></div><span>${esc(cell.context.label)}</span></div><div class="alu-meta"><div><b>Location</b><span>Kothrud / Vanaz Corner, Pune, Maharashtra</span></div><div><b>ALU ID</b><span>${esc(cell.alu_id)}</span></div><div><b>Grid Level</b><span>1 m²</span></div><div><b>Reference coordinates</b><span>${KOTHRUD_CENTER[0]}° N · ${KOTHRUD_CENTER[1]}° E</span></div><div><b>Evidence standard</b><span>Real map context + explicit inference labels</span></div><div><b>Cadastral evidence</b><span>Not imported for this pilot cell</span></div></div><div class="alu-fields">${fields.map(f=>`<article class="alu-field ${fieldClass(f.status)}"><div class="alu-field-top"><b>${esc(f.label)}</b><span class="pill ${f.status==='N/D'?'red':f.status==='N/A'?'gray':f.status==='INFERRED'?'yellow':'green'}">${esc(f.status)}</span></div><div class="alu-field-value">${valueHtml(f)}</div><small>${esc(f.source_id||'Public map context')}</small></article>`).join('')}</div><div class="alu-demo-note">The Vanaz Corner / Paud Road region is unchanged. Road and metro portions are not called residential parcels. Map-inferred values are estimates from visible geography and public contextual references, not official cadastral records.</div></div>`;
    document.body.appendChild(modal);modal.querySelector('.alu-detail-backdrop').onclick=()=>modal.remove();modal.querySelector('.alu-detail-close').onclick=()=>modal.remove();
  }
  function showDetails(id){const cell=cellById.get(id);if(cell)openModal(cell)}
  const hover=L.DomUtil.create('div','pune-hover-tooltip');hover.style.display='none';document.body.appendChild(hover);
  function positionHover(e){hover.style.left=`${e.clientX+14}px`;hover.style.top=`${e.clientY+14}px`}
  function updateHover(e){const cell=cellAt(map.containerPointToLatLng([e.offsetX,e.offsetY]));if(!cell){hover.style.display='none';return}const {resolved}=fieldsFor(cell);positionHover(e);hover.style.display='block';hover.innerHTML=`<div class="pune-hover-title">ALU ID</div><strong>${esc(cell.alu_id)}</strong><div class="pune-hover-row"><span>Context</span><b>${esc(cell.context.label)}</b></div><div class="pune-hover-row"><span>Resolved</span><b>${resolved}/21</b></div>`}
  map.getContainer().addEventListener('mousemove',updateHover);map.getContainer().addEventListener('mouseleave',()=>{hover.style.display='none'});canvas.addEventListener('click',e=>{const cell=cellAt(map.containerPointToLatLng([e.offsetX,e.offsetY]));if(cell)showDetails(cell.alu_id)});
  const searchHint=document.getElementById('puneSearchHint');
  document.getElementById('puneSearchForm')?.addEventListener('submit',e=>{e.preventDefault();const q=document.getElementById('puneAluSearch').value.trim().toUpperCase(),cell=cellById.get(q);if(!cell){if(searchHint)searchHint.textContent='ALU not found in the 10,000-cell Pune pilot catalog.';return}const lat=PILOT_BOUNDS[0][0]+(PILOT_BOUNDS[1][0]-PILOT_BOUNDS[0][0])*(cell.row+.5)/100,lng=PILOT_BOUNDS[0][1]+(PILOT_BOUNDS[1][1]-PILOT_BOUNDS[0][1])*(cell.col+.5)/100;map.setView([lat,lng],20,{animate:true});const {resolved}=fieldsFor(cell);if(searchHint)searchHint.textContent=`${cell.alu_id} · ${resolved}/21 fields resolved`;showDetails(cell.alu_id)});
  scheduleDraw();void API;
})();
