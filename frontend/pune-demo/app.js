(() => {
  'use strict';
  const ROOT='A016Y8',PARENT_PATH=[76,2],BASE36='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const TOKENS=[...BASE36].flatMap(a=>[...BASE36].map(b=>a+b)).filter(t=>/[A-Z]/.test(t)&&/[0-9]/.test(t)).slice(0,100);
  const PILOT_BOUNDS=[[18.506974,73.807223],[18.507824,73.808073]],KOTHRUD_CENTER=[18.507399,73.807648];
  const API=(()=>{const q=new URLSearchParams(location.search).get('api');if(q)return q.replace(/\/$/,'');if(location.hostname.endsWith('.app.github.dev'))return `https://${location.hostname.replace(/-\d+\.app\.github\.dev$/,'-8000.app.github.dev')}`;return 'http://localhost:8000'})();
  const STATUS={GREEN:{cls:'green',label:'Green — 19–21 / 21 fields',color:'#22c55e'},YELLOW:{cls:'yellow',label:'Yellow — 15–18 / 21 fields',color:'#facc15'},RED:{cls:'red',label:'Red — fewer than 15 / 21 fields',color:'#ef4444'},WHITE:{cls:'white',label:'White — not searched / controversial boundary',color:'#ffffff'}};
  const map=L.map('map',{zoomControl:true,minZoom:18,maxZoom:22,maxBounds:PILOT_BOUNDS,maxBoundsViscosity:1,center:KOTHRUD_CENTER,zoom:20});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:22,attribution:'© OpenStreetMap contributors'}).addTo(map);
  map.fitBounds(PILOT_BOUNDS,{padding:[16,16],animate:false});map.setMinZoom(map.getZoom());map.setMaxBounds(PILOT_BOUNDS);
  const canvas=L.DomUtil.create('canvas','pune-coverage-canvas');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:445;pointer-events:auto';map.getPane('overlayPane').appendChild(canvas);const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
  function stableAvailable(row,col){const v=(row*37+col*17+row*col*3)%100;if(v<55)return 19+((row+col)%3);if(v<82)return 15+((row*3+col)%4);return 8+((row*5+col*7)%7)}
  function classify(n){return n>=19?'GREEN':n>=15?'YELLOW':'RED'}
  function aluId(row,col){const tenM=Math.floor(row/10)*10+Math.floor(col/10),oneM=(row%10)*10+(col%10);return [ROOT,TOKENS[PARENT_PATH[0]],TOKENS[PARENT_PATH[1]],TOKENS[tenM],TOKENS[oneM]].join('-')}
  const cells=[];for(let row=0;row<100;row++)for(let col=0;col<100;col++){const available=stableAvailable(row,col);cells.push({row,col,alu_id:aluId(row,col),available_fields:available,total_fields:21,status:classify(available)})}const cellById=new Map(cells.map(c=>[c.alu_id,c]));
  function resizeCanvas(){const size=map.getSize(),d=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.floor(size.x)),h=Math.max(1,Math.floor(size.y));if(canvas.width!==Math.floor(w*d)||canvas.height!==Math.floor(h*d)){canvas.width=Math.floor(w*d);canvas.height=Math.floor(h*d)}canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;ctx.setTransform(d,0,0,d,0,0);return size}
  function draw(){
    const size=resizeCanvas();
    ctx.clearRect(0,0,size.x,size.y);
    const sw=map.latLngToContainerPoint(L.latLng(PILOT_BOUNDS[0][0],PILOT_BOUNDS[0][1]));
    const ne=map.latLngToContainerPoint(L.latLng(PILOT_BOUNDS[1][0],PILOT_BOUNDS[1][1]));
    const width=ne.x-sw.x,height=sw.y-ne.y;
    if(width<=0||height<=0)return;
    const cw=width/100,ch=height/100;
    if(cw<2)return;

    // ALU grid: visible enough to read the spatial structure, but transparent
    // enough that roads, buildings and map labels remain the dominant layer.
    ctx.save();
    ctx.lineCap='butt';
    ctx.setLineDash([]);

    // Minor 1 m² cell boundaries.
    ctx.strokeStyle='rgba(71,85,105,.14)';
    ctx.lineWidth=.65;
    ctx.beginPath();
    for(let i=1;i<100;i++){
      if(i%10===0)continue;
      const x=sw.x+i*cw;ctx.moveTo(x,ne.y);ctx.lineTo(x,sw.y);
    }
    for(let i=1;i<100;i++){
      if(i%10===0)continue;
      const y=ne.y+i*ch;ctx.moveTo(sw.x,y);ctx.lineTo(ne.x,y);
    }
    ctx.stroke();

    // Every 10th line gives the hierarchy a subtle visual rhythm.
    ctx.strokeStyle='rgba(71,85,105,.20)';
    ctx.lineWidth=.75;
    ctx.beginPath();
    for(let i=10;i<100;i+=10){
      const x=sw.x+i*cw;ctx.moveTo(x,ne.y);ctx.lineTo(x,sw.y);
      const y=ne.y+i*ch;ctx.moveTo(sw.x,y);ctx.lineTo(ne.x,y);
    }
    ctx.stroke();

    // Clean pilot extent border, slightly stronger than internal cell lines.
    ctx.strokeStyle='rgba(71,85,105,.30)';
    ctx.lineWidth=1;
    ctx.strokeRect(sw.x,ne.y,width,height);
    ctx.restore();
  }
  let raf=0;function scheduleDraw(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw()})}map.on('move zoom resize',scheduleDraw);window.addEventListener('resize',scheduleDraw,{passive:true});
  function cellAt(latlng){if(latlng.lat<PILOT_BOUNDS[0][0]||latlng.lat>PILOT_BOUNDS[1][0]||latlng.lng<PILOT_BOUNDS[0][1]||latlng.lng>PILOT_BOUNDS[1][1])return null;const row=Math.max(0,Math.min(99,Math.floor((latlng.lat-PILOT_BOUNDS[0][0])/(PILOT_BOUNDS[1][0]-PILOT_BOUNDS[0][0])*100))),col=Math.max(0,Math.min(99,Math.floor((latlng.lng-PILOT_BOUNDS[0][1])/(PILOT_BOUNDS[1][1]-PILOT_BOUNDS[0][1])*100)));return cells[row*100+col]||null}
  function esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
  function fieldClass(s){return s==='N/D'?'red':s==='N/A'?'gray':'green'}
  function valueHtml(field){if(field.status==='N/D')return '<span class="nd-value">N/D — not publicly verified</span>';if(field.status==='N/A')return '<span class="na-value">N/A — not applicable</span>';return `<em class="fictional-value">${esc(field.value)}</em>`}
  function openModal(detail){const old=document.getElementById('aluDetailModal');if(old)old.remove();const key=detail.coverage_status||classify(Number(detail.available_fields||0)),meta=STATUS[key]||STATUS.RED,available=Number(detail.available_fields||0),tone=meta.color.replace('#','');const modal=document.createElement('div');modal.id='aluDetailModal';modal.className='alu-detail-modal';modal.innerHTML=`<div class="alu-detail-backdrop"></div><div class="alu-detail-panel"><button class="alu-detail-close" aria-label="Close">×</button><div class="alu-detail-head status-${meta.cls}" style="background:#${tone}1a;border:1px solid #${tone}55"><div><div class="alu-detail-kicker">ALU DETAILS · PUNE PILOT</div><h2>${esc(detail.alu)}</h2><p>${esc(detail.grid_level||'1 m²')} · real geographic context · project spatial index</p></div><span class="pill ${meta.cls}">${esc(meta.label)}</span></div><div class="coverage-score"><strong>${available}/21 fields available</strong><span>${esc(meta.label)}</span><small>Only fields marked N/D or N/A are excluded.</small></div><div class="alu-parent"><div><b>Parent ULPIN</b><strong>${esc(detail.ulpin)}</strong></div><span>Demo reference only — no government ULPIN imported.</span></div><div class="alu-meta"><div><b>Location</b><span>${esc(detail.location?.locality)}, ${esc(detail.location?.district)}, ${esc(detail.location?.state)}</span></div><div><b>ALU ID</b><span>${esc(detail.alu)}</span></div><div><b>Grid Level</b><span>${esc(detail.grid_level||'1 m²')}</span></div><div><b>Coordinates</b><span>${esc(detail.location?.lat)}° N · ${esc(detail.location?.lng)}° E</span></div><div><b>Display tolerance</b><span>${esc(detail.accuracy||'±0.05 m display tolerance — not a survey accuracy claim')}</span></div><div><b>AI confidence</b><span>${esc(detail.ai_confidence||'DEMO')}</span></div></div><div class="alu-fields">${(detail.fields||[]).map(f=>`<article class="alu-field ${fieldClass(f.status)}"><div class="alu-field-top"><b>${esc(f.label)}</b><span class="pill ${f.status==='N/D'?'red':f.status==='N/A'?'gray':'green'}">${esc(f.status)}</span></div><div class="alu-field-value">${valueHtml(f)}</div><small>${esc(f.source_id||f.source||'Linked demo source')}</small>${f.is_fictional?'<span class="fictional-tag">FICTIONAL DEMO DATA</span>':''}</article>`).join('')}</div><div class="alu-demo-note">${esc(detail.provenance_note||detail.note||'Property attributes are fictional demo records; geographic context is real.')}</div></div>`;document.body.appendChild(modal);modal.querySelector('.alu-detail-backdrop').onclick=()=>modal.remove();modal.querySelector('.alu-detail-close').onclick=()=>modal.remove()}
  async function showDetails(id){try{const r=await fetch(API+`/api/v1/pune-demo/alu-catalog/cells/${encodeURIComponent(id)}/details`,{cache:'force-cache'});if(!r.ok)throw Error('detail unavailable');openModal(await r.json())}catch(_){const cell=cellById.get(id);const n=cell?.available_fields||19;const fallbackFields=Array.from({length:21},(_,i)=>({label:`${i+1}. Information field`,status:i<n?'AVAILABLE':(i%2?'N/D':'N/A'),value:['Rakesh Sharma — S/o Ram Prasad','Residential','Private (Freehold)','146.50 m²','Sheet KTH-01 · Plot 001','PUNE-SRO-2025-10001','Sale Deed','2025-03-14','None recorded','None recorded','PMC-BP-2025-0101','OC-PMC-2025-0301','Paid','KTH-TAX-500001','Residential R2','AVAILABLE','Electricity: Available; Water: Municipal network','General urban area','None recorded','₹5,180,000','MH-CIT-2026-70001 · Completed'][i],source_id:'Linked fictional demo source',is_fictional:true}));openModal({alu:id,grid_level:'1 m²',available_fields:n,coverage_status:classify(n),ulpin:'N/D — official ULPIN not imported',location:{locality:'Kothrud',district:'Pune',state:'Maharashtra',lat:KOTHRUD_CENTER[0],lng:KOTHRUD_CENTER[1]},fields:fallbackFields,provenance_note:'All property attributes shown here are fictional demo records. The underlying geographic context is real.'})}}
  const hover=L.DomUtil.create('div','pune-hover-tooltip');hover.style.display='none';document.body.appendChild(hover);let lastHoverId=null,hoverSeq=0;function positionHover(e){hover.style.left=`${e.clientX+14}px`;hover.style.top=`${e.clientY+14}px`}
  async function updateHover(e){const cell=cellAt(map.containerPointToLatLng([e.offsetX,e.offsetY]));if(!cell){hover.style.display='none';lastHoverId=null;hoverSeq++;return}positionHover(e);hover.style.display='block';hover.innerHTML=`<div class="pune-hover-title">ALU ID</div><strong>${esc(cell.alu_id)}</strong><div class="pune-hover-row"><span>ULPIN</span><b>Loading…</b></div><div class="pune-hover-row"><span>Coverage</span><b>${cell.available_fields}/21 fields</b></div>`;if(cell.alu_id===lastHoverId)return;lastHoverId=cell.alu_id;const seq=++hoverSeq;try{const r=await fetch(API+`/api/v1/pune-demo/alu-catalog/cells/${encodeURIComponent(cell.alu_id)}/details`,{cache:'force-cache'});if(seq!==hoverSeq||cell.alu_id!==lastHoverId)return;if(!r.ok)throw Error('unavailable');const d=await r.json();hover.innerHTML=`<div class="pune-hover-title">ALU ID</div><strong>${esc(d.alu)}</strong><div class="pune-hover-row"><span>ULPIN</span><b>${esc(d.ulpin)}</b></div><div class="pune-hover-row"><span>Coverage</span><b>${esc(d.available_fields||0)}/21 fields</b></div>`}catch(_){if(seq!==hoverSeq)return;hover.innerHTML=`<div class="pune-hover-title">ALU ID</div><strong>${esc(cell.alu_id)}</strong><div class="pune-hover-row"><span>ULPIN</span><b>N/D — not imported</b></div><div class="pune-hover-row"><span>Coverage</span><b>${cell.available_fields}/21 fields</b></div>`}}
  map.getContainer().addEventListener('mousemove',updateHover);map.getContainer().addEventListener('mouseleave',()=>{hover.style.display='none';lastHoverId=null;hoverSeq++});canvas.addEventListener('click',e=>{const cell=cellAt(map.containerPointToLatLng([e.offsetX,e.offsetY]));if(cell)showDetails(cell.alu_id)});
  const searchHint=document.getElementById('puneSearchHint');
  document.getElementById('puneSearchForm')?.addEventListener('submit',e=>{e.preventDefault();const q=document.getElementById('puneAluSearch').value.trim().toUpperCase(),cell=cellById.get(q);if(!cell){if(searchHint)searchHint.textContent='ALU not found in the 10,000-cell Pune pilot catalog.';return}const lat=PILOT_BOUNDS[0][0]+(PILOT_BOUNDS[1][0]-PILOT_BOUNDS[0][0])*(cell.row+.5)/100,lng=PILOT_BOUNDS[0][1]+(PILOT_BOUNDS[1][1]-PILOT_BOUNDS[0][1])*(cell.col+.5)/100;map.setView([lat,lng],22,{animate:true});if(searchHint)searchHint.textContent=`${cell.alu_id} · ${STATUS[cell.status].label}`;showDetails(cell.alu_id)});
  scheduleDraw();fetch(API+'/api/v1/pune-demo/alu-catalog/coverage-grid?level=1m2',{cache:'force-cache'}).then(r=>r.ok?r.json():null).then(data=>{if(!data?.items)return;for(const item of data.items){const cell=cellById.get(item.alu_id);if(!cell)continue;cell.status=item.status;cell.available_fields=item.available_fields;cell.total_fields=item.total_fields||21}scheduleDraw()}).catch(()=>{});
})();
