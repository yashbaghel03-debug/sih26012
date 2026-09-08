(() => {
  'use strict';
  const ROOT='A016Y8',PARENT_PATH=[76,2],BASE36='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const TOKENS=[...BASE36].flatMap(a=>[...BASE36].map(b=>a+b)).filter(t=>/[A-Z]/.test(t)&&/[0-9]/.test(t)).slice(0,100);
  const KOTHRUD_CENTER=[18.507399,73.807648];
  const PILOT_BOUNDS=[[18.506974,73.807223],[18.507824,73.808073]];
  const PILOT_NAME='Vanaz Corner / Paud Road, Kothrud, Pune';
  const STATUS={GREEN:{cls:'green',label:'Green — verified/public context',color:'#22c55e'},YELLOW:{cls:'yellow',label:'Yellow — contextual / partial',color:'#facc15'},RED:{cls:'red',label:'Red — not verified',color:'#ef4444'},WHITE:{cls:'white',label:'White — not searched',color:'#ffffff'}};
  const SOURCES={OSM_VANAZ:'OpenStreetMap-derived Vanaz Corner transport feature',PMRCL_METRO:'Maharashtra Metro Rail Corporation — Vanaz alignment / station documentation',UNION_BANK:'Union Bank, Pushpa Apartment, Paud Road, Vanaz Corner address reference',MH_LAND:'Maharashtra Mahabhumi land-record services / Mahabhunakasha'};

  function contextFor(row,col){
    const lat=PILOT_BOUNDS[0][0]+(PILOT_BOUNDS[1][0]-PILOT_BOUNDS[0][0])*(row+.5)/100;
    const lng=PILOT_BOUNDS[0][1]+(PILOT_BOUNDS[1][1]-PILOT_BOUNDS[0][1])*(col+.5)/100;
    if(Math.abs(lat-18.50730)<0.000115)return {type:'transport',label:'Transport corridor — Paud Road / Pune Metro context',source:SOURCES.PMRCL_METRO};
    if(Math.abs(lng-73.80772)<0.000075)return {type:'road',label:'Road / access corridor — Vanaz Corner context',source:SOURCES.OSM_VANAZ};
    return {type:'built',label:'Built-up urban context — parcel use not cadastral-verified',source:SOURCES.OSM_VANAZ};
  }
  function classify(n){return n>=19?'GREEN':n>=15?'YELLOW':'RED'}
  function aluId(row,col){const tenM=Math.floor(row/10)*10+Math.floor(col/10),oneM=(row%10)*10+(col%10);return [ROOT,TOKENS[PARENT_PATH[0]],TOKENS[PARENT_PATH[1]],TOKENS[tenM],TOKENS[oneM]].join('-')}
  const cells=[];
  for(let row=0;row<100;row++)for(let col=0;col<100;col++){const context=contextFor(row,col);const available=context.type==='transport'?4:2;cells.push({row,col,alu_id:aluId(row,col),available_fields:available,total_fields:21,status:classify(available),context});}
  const cellById=new Map(cells.map(c=>[c.alu_id,c]));

  const map=L.map('map',{zoomControl:true,minZoom:18,maxZoom:22,maxBounds:PILOT_BOUNDS,maxBoundsViscosity:1,center:KOTHRUD_CENTER,zoom:20});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:22,maxNativeZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  map.fitBounds(PILOT_BOUNDS,{padding:[0,0],animate:false});
  map.setMinZoom(map.getZoom());
  map.setMaxBounds(PILOT_BOUNDS);
  setTimeout(()=>map.invalidateSize({pan:false}),0);

  const canvas=L.DomUtil.create('canvas','pune-coverage-canvas');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:445;pointer-events:auto;background:transparent !important';
  map.getPane('overlayPane').appendChild(canvas);
  const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
  function resizeCanvas(){const size=map.getSize(),d=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.floor(size.x)),h=Math.max(1,Math.floor(size.y));if(canvas.width!==Math.floor(w*d)||canvas.height!==Math.floor(h*d)){canvas.width=Math.floor(w*d);canvas.height=Math.floor(h*d)}canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;ctx.setTransform(d,0,0,d,0,0);return size}
  function draw(){const size=resizeCanvas();ctx.clearRect(0,0,size.x,size.y);const sw=map.latLngToContainerPoint(L.latLng(PILOT_BOUNDS[0][0],PILOT_BOUNDS[0][1])),ne=map.latLngToContainerPoint(L.latLng(PILOT_BOUNDS[1][0],PILOT_BOUNDS[1][1])),width=ne.x-sw.x,height=sw.y-ne.y;if(width<=0||height<=0)return;const cw=width/100,ch=height/100;if(cw>=2){ctx.save();ctx.strokeStyle='rgba(51,65,85,.14)';ctx.lineWidth=.65;ctx.beginPath();for(let i=1;i<100;i++){const x=sw.x+i*cw;ctx.moveTo(x,ne.y);ctx.lineTo(x,sw.y)}for(let i=1;i<100;i++){const y=ne.y+i*ch;ctx.moveTo(sw.x,y);ctx.lineTo(ne.x,y)}ctx.stroke();ctx.strokeStyle='rgba(51,65,85,.22)';ctx.lineWidth=.8;ctx.beginPath();for(let i=10;i<100;i+=10){const x=sw.x+i*cw;ctx.moveTo(x,ne.y);ctx.lineTo(x,sw.y);const y=ne.y+i*ch;ctx.moveTo(sw.x,y);ctx.lineTo(ne.x,y)}ctx.stroke();ctx.strokeStyle='rgba(51,65,85,.32)';ctx.lineWidth=1;ctx.strokeRect(sw.x,ne.y,width,height);ctx.restore()}}
  let raf=0;function scheduleDraw(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw()})}map.on('move zoom resize',scheduleDraw);window.addEventListener('resize',scheduleDraw,{passive:true});

  function cellAt(latlng){if(latlng.lat<PILOT_BOUNDS[0][0]||latlng.lat>PILOT_BOUNDS[1][0]||latlng.lng<PILOT_BOUNDS[0][1]||latlng.lng>PILOT_BOUNDS[1][1])return null;const row=Math.max(0,Math.min(99,Math.floor((latlng.lat-PILOT_BOUNDS[0][0])/(PILOT_BOUNDS[1][0]-PILOT_BOUNDS[0][0])*100))),col=Math.max(0,Math.min(99,Math.floor((latlng.lng-PILOT_BOUNDS[0][1])/(PILOT_BOUNDS[1][1]-PILOT_BOUNDS[0][1])*100)));return cells[row*100+col]||null}
  function esc(v){return String(v??'').replace(/[&<>\\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;',"'":'&#39;'}[c]))}
  function fieldClass(s){return s==='N/D'?'red':s==='N/A'?'gray':'green'}
  function valueHtml(f){if(f.status==='N/D')return '<span class="nd-value">N/D — not publicly verified</span>';if(f.status==='N/A')return '<span class="na-value">N/A — not applicable</span>';return `<span class="fictional-value">${esc(f.value)}</span>`}
  function detailForCell(cell){const c=cell.context;const use=c.type==='transport'?'Transport / Road + Metro corridor':c.type==='road'?'Road / access corridor':'Built-up urban area';const fields=[
    {label:'1. Spatial context',value:c.label,status:'AVAILABLE',source_id:c.source},
    {label:'2. Land Use',value:use,status:'AVAILABLE',source_id:c.source},
    {label:'3. Cadastral parcel',value:'N/D — official Mahabhunakasha parcel geometry not imported',status:'N/D',source_id:SOURCES.MH_LAND},
    {label:'4. Ownership (RoR)',value:'N/D — private owner record not imported',status:'N/D',source_id:SOURCES.MH_LAND},
    {label:'5. Survey / CTS',value:'N/D — cell-level survey/CTS match not verified',status:'N/D',source_id:SOURCES.MH_LAND},
    {label:'6. ULPIN',value:'N/D — official ULPIN not imported',status:'N/D',source_id:SOURCES.MH_LAND},
    {label:'7. Road / transport feature',value:c.type==='transport'?'Paud Road / Pune Metro corridor':c.type==='road'?'Vanaz Corner access road':'No named road claim for this cell',status:c.type==='built'?'N/D':'AVAILABLE',source_id:c.source},
    {label:'8. Nearby landmark context',value:'Vanaz Corner transport node',status:'AVAILABLE',source_id:SOURCES.OSM_VANAZ},
    {label:'9. Union Bank / Pushpa Apartment',value:'Nearby mapped address reference',status:'AVAILABLE',source_id:SOURCES.UNION_BANK},
    {label:'10. Metro infrastructure',value:'Vanaz metro alignment documented',status:'AVAILABLE',source_id:SOURCES.PMRCL_METRO},
    {label:'11. Property Tax',value:'N/D — parcel PID not imported',status:'N/D',source_id:'PMC_PROPERTY_TAX'},
    {label:'12. Registration Deed',value:'N/D — deed not imported',status:'N/D',source_id:'MH_REGISTRATION'},
    {label:'13. Building Permission',value:'N/D — parcel permit not imported',status:'N/D',source_id:'PMC_BUILDING'},
    {label:'14. Occupancy Certificate',value:'N/D — parcel OC not imported',status:'N/D',source_id:'PMC_BUILDING'},
    {label:'15. Zoning',value:'N/D — DP zoning not verified for this cell',status:'N/D',source_id:'PMC_DP_PLAN'},
    {label:'16. Utilities',value:'N/D — parcel-linked utility record not imported',status:'N/D',source_id:'UTILITY_INFRA'},
    {label:'17. Infrastructure',value:'Urban transport/infrastructure context available from map',status:'AVAILABLE',source_id:c.source},
    {label:'18. Environmental Zone',value:'N/D — not verified',status:'N/D',source_id:'ENVIRONMENTAL_LAYER'},
    {label:'19. Restriction Zone',value:'N/D — not verified',status:'N/D',source_id:'LEGAL_ENCUMBRANCE'},
    {label:'20. Market Value',value:'N/D — no verified valuation imported',status:'N/D',source_id:'MH_REGISTRATION'},
    {label:'21. Demo integration record',value:'Fictional integration shell only — not a government record',status:'N/A',source_id:'DEMO'}
  ];const available=fields.filter(f=>f.status==='AVAILABLE').length;return {alu:cell.alu_id,grid_level:'1 m²',available_fields:available,total_fields:21,coverage_status:classify(available),ulpin:'N/D — official ULPIN not imported',location:{locality:'Kothrud / Vanaz Corner',district:'Pune',state:'Maharashtra',lat:KOTHRUD_CENTER[0],lng:KOTHRUD_CENTER[1]},accuracy:'Map-context classification only; not a cadastral survey claim',ai_confidence:'PUBLIC GEOGRAPHIC CONTEXT / CELL-LEVEL CADASTRAL ATTRIBUTES NOT VERIFIED',fields,provenance_note:'This Pune pilot intentionally separates real geographic context from unverified cadastral/private attributes. Public references identify Vanaz Corner as a transport node, Paud Road as the local road context, and the Pune Metro Vanaz alignment; private ownership, parcel boundaries, ULPIN, deed, tax and legal fields remain N/D until matched to official records.'}}
  function openModal(detail){const old=document.getElementById('aluDetailModal');if(old)old.remove();const key=detail.coverage_status||classify(Number(detail.available_fields||0)),meta=STATUS[key]||STATUS.RED,available=Number(detail.available_fields||0),tone=meta.color.replace('#','');const modal=document.createElement('div');modal.id='aluDetailModal';modal.className='alu-detail-modal';modal.innerHTML=`<div class="alu-detail-backdrop"></div><div class="alu-detail-panel"><button class="alu-detail-close" aria-label="Close">×</button><div class="alu-detail-head status-${meta.cls}" style="background:#${tone}1a;border:1px solid #${tone}55"><div><div class="alu-detail-kicker">ALU DETAILS · PUNE PILOT</div><h2>${esc(detail.alu)}</h2><p>${esc(detail.grid_level||'1 m²')} · real map context · evidence-aware data</p></div><span class="pill ${meta.cls}">${esc(meta.label)}</span></div><div class="coverage-score"><strong>${available}/21 fields available</strong><span>${esc(meta.label)}</span><small>Available means supported by the public geographic/context references used in this pilot.</small></div><div class="alu-parent"><div><b>Pune pilot</b><strong>${esc(PILOT_NAME)}</strong></div><span>No private ownership claim is made for this cell.</span></div><div class="alu-meta"><div><b>Location</b><span>${esc(detail.location?.locality)}, ${esc(detail.location?.district)}, ${esc(detail.location?.state)}</span></div><div><b>ALU ID</b><span>${esc(detail.alu)}</span></div><div><b>Grid Level</b><span>${esc(detail.grid_level||'1 m²')}</span></div><div><b>Reference coordinates</b><span>${esc(detail.location?.lat)}° N · ${esc(detail.location?.lng)}° E</span></div><div><b>Reference precision</b><span>${esc(detail.accuracy)}</span></div><div><b>Evidence level</b><span>${esc(detail.ai_confidence)}</span></div></div><div class="alu-fields">${(detail.fields||[]).map(f=>`<article class="alu-field ${fieldClass(f.status)}"><div class="alu-field-top"><b>${esc(f.label)}</b><span class="pill ${f.status==='N/D'?'red':f.status==='N/A'?'gray':'green'}">${esc(f.status)}</span></div><div class="alu-field-value">${valueHtml(f)}</div><small>${esc(f.source_id||'Public reference')}</small></article>`).join('')}</div><div class="alu-demo-note">${esc(detail.provenance_note)}</div></div>`;document.body.appendChild(modal);modal.querySelector('.alu-detail-backdrop').onclick=()=>modal.remove();modal.querySelector('.alu-detail-close').onclick=()=>modal.remove()}
  function showDetails(id){const cell=cellById.get(id);if(cell)openModal(detailForCell(cell))}
  const hover=L.DomUtil.create('div','pune-hover-tooltip');hover.style.display='none';document.body.appendChild(hover);function positionHover(e){hover.style.left=`${e.clientX+14}px`;hover.style.top=`${e.clientY+14}px`}function updateHover(e){const cell=cellAt(map.containerPointToLatLng([e.offsetX,e.offsetY]));if(!cell){hover.style.display='none';return}positionHover(e);hover.style.display='block';hover.innerHTML=`<div class="pune-hover-title">ALU ID</div><strong>${esc(cell.alu_id)}</strong><div class="pune-hover-row"><span>Context</span><b>${esc(cell.context.label)}</b></div><div class="pune-hover-row"><span>Verified fields</span><b>${cell.available_fields}/21</b></div>`}map.getContainer().addEventListener('mousemove',updateHover);map.getContainer().addEventListener('mouseleave',()=>{hover.style.display='none'});canvas.addEventListener('click',e=>{const cell=cellAt(map.containerPointToLatLng([e.offsetX,e.offsetY]));if(cell)showDetails(cell.alu_id)});
  const searchHint=document.getElementById('puneSearchHint');document.getElementById('puneSearchForm')?.addEventListener('submit',e=>{e.preventDefault();const q=document.getElementById('puneAluSearch').value.trim().toUpperCase(),cell=cellById.get(q);if(!cell){if(searchHint)searchHint.textContent='ALU not found in the 10,000-cell Pune pilot catalog.';return}const lat=PILOT_BOUNDS[0][0]+(PILOT_BOUNDS[1][0]-PILOT_BOUNDS[0][0])*(cell.row+.5)/100,lng=PILOT_BOUNDS[0][1]+(PILOT_BOUNDS[1][1]-PILOT_BOUNDS[0][1])*(cell.col+.5)/100;map.setView([lat,lng],20,{animate:true});if(searchHint)searchHint.textContent=`${cell.alu_id} · ${cell.context.label}`;showDetails(cell.alu_id)});
  scheduleDraw();
})();
