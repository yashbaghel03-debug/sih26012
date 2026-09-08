(() => {
  'use strict';
  const ROOT='A016Y8',PARENT_PATH=[76,2],BASE36='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const TOKENS=[...BASE36].flatMap(a=>[...BASE36].map(b=>a+b)).filter(t=>/[A-Z]/.test(t)&&/[0-9]/.test(t)).slice(0,100);

  // Real public Pune/Kothrud project reference used for the pilot footprint.
  // Public filing references identify Survey Nos. 9 & 10 / CTS 673(P)+675(P),
  // Kothrud, Pune for MahaRERA project P52100048487. The filed coordinate is
  // a reference point only; this demo does not claim it is an official survey polygon.
  const PROJECT_CENTER=[18.498779,73.816864];
  const HALF_M=25;
  const LAT_PER_M=1/111320;
  const LNG_PER_M=1/(111320*Math.cos(PROJECT_CENTER[0]*Math.PI/180));
  const PILOT_BOUNDS=[
    [PROJECT_CENTER[0]-HALF_M*LAT_PER_M,PROJECT_CENTER[1]-HALF_M*LNG_PER_M],
    [PROJECT_CENTER[0]+HALF_M*LAT_PER_M,PROJECT_CENTER[1]+HALF_M*LNG_PER_M]
  ];
  const PROJECT_LABEL='Ketan Heights / Kaivalya · Kothrud';

  const STATUS={GREEN:{cls:'green',label:'Green — 19–21 / 21 fields',color:'#22c55e'},YELLOW:{cls:'yellow',label:'Yellow — 15–18 / 21 fields',color:'#facc15'},RED:{cls:'red',label:'Red — fewer than 15 / 21 fields',color:'#ef4444'},WHITE:{cls:'white',label:'White — not searched / boundary',color:'#ffffff'}};

  const API=(()=>{const q=new URLSearchParams(location.search).get('api');if(q)return q.replace(/\/$/,'');if(location.hostname.endsWith('.app.github.dev'))return `https://${location.hostname.replace(/-\d+\.app\.github\.dev$/,'-8000.app.github.dev')}`;return 'http://localhost:8000'})();

  // Only public-reference-backed fields are considered available. Private
  // owner names, tax IDs, deeds, utilities, legal records and cell-level
  // cadastral facts remain N/D rather than being invented.
  const PUBLIC_FIELDS=[
    {label:'1. Ownership (RoR)',value:'N/D — private ownership not imported',status:'N/D',source_id:'MH_LAND_RECORDS'},
    {label:'2. Land Use',value:'Residential / Group Housing (project-level)',status:'AVAILABLE',source_id:'MAHARERA_P52100048487'},
    {label:'3. Land Type',value:'N/D — cell-level tenure not verified',status:'N/D',source_id:'MH_LAND_RECORDS'},
    {label:'4. Area',value:'2,444.93 m² (project area filed)',status:'AVAILABLE',source_id:'MAHARERA_P52100048487'},
    {label:'5. Cadastral Reference',value:'Survey Nos. 9 & 10 · CTS 673(P) + 675(P)',status:'AVAILABLE',source_id:'MAHARERA_P52100048487'},
    {label:'6. Registration Details',value:'MahaRERA P52100048487',status:'AVAILABLE',source_id:'MAHARERA_P52100048487'},
    {label:'7. Deed Type',value:'N/D — deed not imported',status:'N/D',source_id:'MH_REGISTRATION'},
    {label:'8. Registration Date',value:'03 Jan 2023 (RERA project registration)',status:'AVAILABLE',source_id:'MAHARERA_P52100048487'},
    {label:'9. Encumbrance',value:'N/D — not publicly verified in this pilot',status:'N/D',source_id:'LEGAL_ENCUMBRANCE'},
    {label:'10. Litigation',value:'N/D — not publicly verified in this pilot',status:'N/D',source_id:'LEGAL_ENCUMBRANCE'},
    {label:'11. Building Permission',value:'N/D — PMC permit not imported',status:'N/D',source_id:'PMC_BUILDING'},
    {label:'12. Occupancy Certificate',value:'N/D — project is not presented as completed',status:'N/D',source_id:'PMC_BUILDING'},
    {label:'13. Property Tax',value:'N/D — parcel tax account not imported',status:'N/D',source_id:'PMC_PROPERTY_TAX'},
    {label:'14. Tax ID / PID',value:'N/D — parcel PID not imported',status:'N/D',source_id:'PMC_PROPERTY_TAX'},
    {label:'15. Zoning / Land Use Zone',value:'N/D — cell-level DP zoning not verified',status:'N/D',source_id:'PMC_DP_PLAN'},
    {label:'16. Infrastructure',value:'N/D — parcel-linked infrastructure record not imported',status:'N/D',source_id:'PMC_INFRASTRUCTURE'},
    {label:'17. Utilities',value:'N/D — parcel-linked utility record not imported',status:'N/D',source_id:'UTILITY_INFRA'},
    {label:'18. Environmental Zone',value:'N/D — layer not verified for this cell',status:'N/D',source_id:'ENVIRONMENTAL_LAYER'},
    {label:'19. Restriction Zone',value:'N/D — cell-level restriction not verified',status:'N/D',source_id:'LEGAL_ENCUMBRANCE'},
    {label:'20. Market Value',value:'N/D — no verified valuation imported',status:'N/D',source_id:'MH_REGISTRATION'},
    {label:'21. Citizen / AI Land Service',value:'N/A — no cell-level transaction imported',status:'N/A',source_id:'MH_CITIZEN_SERVICES'}
  ];

  function classify(n){return n>=19?'GREEN':n>=15?'YELLOW':'RED'}
  function aluId(row,col){const tenM=Math.floor(row/10)*10+Math.floor(col/10),oneM=(row%10)*10+(col%10);return [ROOT,TOKENS[PARENT_PATH[0]],TOKENS[PARENT_PATH[1]],TOKENS[tenM],TOKENS[oneM]].join('-')}
  const cells=[];for(let row=0;row<100;row++)for(let col=0;col<100;col++)cells.push({row,col,alu_id:aluId(row,col),available_fields:4,total_fields:21,status:'RED'});
  const cellById=new Map(cells.map(c=>[c.alu_id,c]));

  const map=L.map('map',{zoomControl:true,minZoom:18,maxZoom:22,maxBounds:PILOT_BOUNDS,maxBoundsViscosity:1,center:PROJECT_CENTER,zoom:20});
  const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:22,maxNativeZoom:19,bounds:PILOT_BOUNDS,noWrap:true,attribution:'© OpenStreetMap contributors'}).addTo(map);
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
  function valueHtml(field){if(field.status==='N/D')return '<span class="nd-value">N/D — not publicly verified</span>';if(field.status==='N/A')return '<span class="na-value">N/A — not applicable</span>';return `<span class="fictional-value">${esc(field.value)}</span>`}

  function detailForCell(cell){const fields=PUBLIC_FIELDS.map(f=>({...f}));const available=fields.filter(f=>f.status==='AVAILABLE').length;return {alu:cell.alu_id,grid_level:'1 m²',available_fields:available,coverage_status:classify(available),ulpin:'N/D — official ULPIN not imported',location:{locality:'Kothrud',district:'Pune',state:'Maharashtra',lat:PROJECT_CENTER[0],lng:PROJECT_CENTER[1]},accuracy:'25 m reference window around promoter-filed RERA map pin; not a survey accuracy claim',ai_confidence:'PUBLIC PROJECT REFERENCE / CELL-LEVEL ATTRIBUTES NOT VERIFIED',fields,provenance_note:`${PROJECT_LABEL}. Public filing reference: MahaRERA P52100048487, Survey Nos. 9 & 10 / CTS 673(P)+675(P), project area 2,444.93 m². Geography is real OpenStreetMap context; individual owner, deed, tax, legal, utility and cell-level cadastral attributes are N/D unless publicly verified.`}}

  function openModal(detail){const old=document.getElementById('aluDetailModal');if(old)old.remove();const key=detail.coverage_status||classify(Number(detail.available_fields||0)),meta=STATUS[key]||STATUS.RED,available=Number(detail.available_fields||0),tone=meta.color.replace('#','');const modal=document.createElement('div');modal.id='aluDetailModal';modal.className='alu-detail-modal';modal.innerHTML=`<div class="alu-detail-backdrop"></div><div class="alu-detail-panel"><button class="alu-detail-close" aria-label="Close">×</button><div class="alu-detail-head status-${meta.cls}" style="background:#${tone}1a;border:1px solid #${tone}55"><div><div class="alu-detail-kicker">ALU DETAILS · PUNE PILOT</div><h2>${esc(detail.alu)}</h2><p>${esc(detail.grid_level||'1 m²')} · real geographic context · public reference data</p></div><span class="pill ${meta.cls}">${esc(meta.label)}</span></div><div class="coverage-score"><strong>${available}/21 fields available</strong><span>${esc(meta.label)}</span><small>Only publicly verified project-level fields are marked available.</small></div><div class="alu-parent"><div><b>Parent ULPIN</b><strong>${esc(detail.ulpin)}</strong></div><span>Demo reference only — no government ULPIN imported.</span></div><div class="alu-meta"><div><b>Location</b><span>${esc(detail.location?.locality)}, ${esc(detail.location?.district)}, ${esc(detail.location?.state)}</span></div><div><b>ALU ID</b><span>${esc(detail.alu)}</span></div><div><b>Grid Level</b><span>${esc(detail.grid_level||'1 m²')}</span></div><div><b>Reference coordinates</b><span>${esc(detail.location?.lat)}° N · ${esc(detail.location?.lng)}° E</span></div><div><b>Reference precision</b><span>${esc(detail.accuracy)}</span></div><div><b>Evidence level</b><span>${esc(detail.ai_confidence)}</span></div></div><div class="alu-fields">${(detail.fields||[]).map(f=>`<article class="alu-field ${fieldClass(f.status)}"><div class="alu-field-top"><b>${esc(f.label)}</b><span class="pill ${f.status==='N/D'?'red':f.status==='N/A'?'gray':'green'}">${esc(f.status)}</span></div><div class="alu-field-value">${valueHtml(f)}</div><small>${esc(f.source_id||'Public reference')}</small></article>`).join('')}</div><div class="alu-demo-note">${esc(detail.provenance_note)}</div></div>`;document.body.appendChild(modal);modal.querySelector('.alu-detail-backdrop').onclick=()=>modal.remove();modal.querySelector('.alu-detail-close').onclick=()=>modal.remove()}
  function showDetails(id){const cell=cellById.get(id);if(cell)openModal(detailForCell(cell))}

  const hover=L.DomUtil.create('div','pune-hover-tooltip');hover.style.display='none';document.body.appendChild(hover);function positionHover(e){hover.style.left=`${e.clientX+14}px`;hover.style.top=`${e.clientY+14}px`}
  function updateHover(e){const cell=cellAt(map.containerPointToLatLng([e.offsetX,e.offsetY]));if(!cell){hover.style.display='none';return}positionHover(e);hover.style.display='block';hover.innerHTML=`<div class="pune-hover-title">ALU ID</div><strong>${esc(cell.alu_id)}</strong><div class="pune-hover-row"><span>Reference</span><b>RERA project</b></div><div class="pune-hover-row"><span>Verified fields</span><b>4/21</b></div>`}
  map.getContainer().addEventListener('mousemove',updateHover);map.getContainer().addEventListener('mouseleave',()=>{hover.style.display='none'});
  canvas.addEventListener('click',e=>{const cell=cellAt(map.containerPointToLatLng([e.offsetX,e.offsetY]));if(cell)showDetails(cell.alu_id)});

  const searchHint=document.getElementById('puneSearchHint');
  document.getElementById('puneSearchForm')?.addEventListener('submit',e=>{e.preventDefault();const q=document.getElementById('puneAluSearch').value.trim().toUpperCase(),cell=cellById.get(q);if(!cell){if(searchHint)searchHint.textContent='ALU not found in the 10,000-cell Pune pilot catalog.';return}const lat=PILOT_BOUNDS[0][0]+(PILOT_BOUNDS[1][0]-PILOT_BOUNDS[0][0])*(cell.row+.5)/100,lng=PILOT_BOUNDS[0][1]+(PILOT_BOUNDS[1][1]-PILOT_BOUNDS[0][1])*(cell.col+.5)/100;map.setView([lat,lng],20,{animate:true});if(searchHint)searchHint.textContent=`${cell.alu_id} · 4/21 publicly verified fields`;showDetails(cell.alu_id)});

  scheduleDraw();
  void API;void tiles;
})();
