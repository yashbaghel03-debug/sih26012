(() => {
'use strict';
const params=new URLSearchParams(location.search);
const api=params.get('api')||location.origin;
const alu=params.get('alu')||'';
const lat=params.get('lat'),lng=params.get('lng');
const $=id=>document.getElementById(id);
const esc=v=>String(v??'—').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
$('alu').textContent=alu||'Unknown';
$('openMap').href='index.html'+(alu?'?alu='+encodeURIComponent(alu):'');
$('viewMapBottom').href='index.html'+(alu?'?alu='+encodeURIComponent(alu):'');
if(lat&&lng)$('coords').textContent=Number(lat).toFixed(6)+'° N, '+Number(lng).toFixed(6)+'° E';
$('streetView').addEventListener('click',()=>{if(!(lat&&lng))return;window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`,'_blank','noopener');});
$('copyAlu').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(alu);$('copyAlu').textContent='Copied';setTimeout(()=>$('copyAlu').textContent='Copy ALU ID',1200)}catch(_){}});
$('rawToggle').addEventListener('click',()=>{$('rawData').classList.toggle('hidden');$('rawToggle').textContent=$('rawData').classList.contains('hidden')?'Show raw reference fields':'Hide raw reference fields'});
function addCard(label,value){$('cards').insertAdjacentHTML('beforeend',`<article class="field"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></article>`)}
function titleCase(s){return String(s).replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase())}
async function load(){
  if(!alu){$('cards').innerHTML='<div class="error">No ALU code was supplied. Return to the map and click an ALU cell.</div>';return}
  try{
    const r=await fetch(api+'/api/v1/spatial/cell-info/'+encodeURIComponent(alu),{cache:'no-store'});
    if(!r.ok)throw new Error('Reference API returned '+r.status);
    const d=await r.json(),ref=d.reference||{},fields=ref.fields||{};
    $('ulpin').textContent=d.ulpin||'Not linked';
    $('subtitle').textContent=(d.level||'ALU')+' · '+Number(d.area_m2||0).toLocaleString()+' m² cell';
    $('area').textContent=Number(d.area_m2||0).toLocaleString()+' m²';
    if(ref.centroid)$('coords').textContent=Number(ref.centroid.lat).toFixed(6)+'° N, '+Number(ref.centroid.lng).toFixed(6)+'° E';
    $('status').textContent=d.parcel_id?'Linked to cadastral parcel':'Not linked';
    $('bar').style.width=d.parcel_id?'100%':'25%';
    $('source').textContent=ref.source||'No cadastral source available';
    const standard=[
      ['1. Ownership (RoR)',fields.owner||'Not linked'],['2. Land Use',fields.land_use||'Not linked'],['3. Land Type',fields.land_type||'Not linked'],['4. Area (Cadastral)',fields.area_m2?Number(fields.area_m2).toLocaleString()+' m²':'Not linked'],['5. Cadastral Map','Not linked'],
      ['6. Registration Details',fields.registration_no||'Not linked'],['7. Deed Type',fields.deed_type||'Not linked'],['8. Registration Date',fields.registration_date||'Not linked'],['9. Encumbrance',fields.encumbrance||'Not linked'],['10. Litigation',fields.litigation||'Not linked'],
      ['11. Building Permission',fields.building_permission||'Not linked'],['12. Occupancy',fields.occupancy||'Not linked'],['13. Property Tax',fields.property_tax||'Not linked'],['14. Tax ID / PID',fields.tax_id||'Not linked'],['15. Zoning / Land Use Zone',fields.zone||'Not linked'],
      ['16. Infrastructure',fields.infrastructure||'Not linked'],['17. Utilities',fields.utilities||'Not linked'],['18. Environmental Zone',fields.environmental_zone||'Not linked'],['19. Restriction Zone',fields.restriction_zone||'Not linked'],['20. Market Value',fields.market_value||'Not linked']
    ];
    standard.forEach(x=>addCard(x[0],x[1]));
    addCard('21. Spatial Reference','ALU '+alu+' · '+(d.width_m||'—')+' m × '+(d.height_m||'—')+' m');
    $('rawData').textContent=JSON.stringify(ref.properties||{},null,2);
  }catch(err){
    $('status').textContent='Reference unavailable';$('bar').style.width='15%';$('source').textContent='Unavailable';
    $('cards').innerHTML=`<div class="error">The ALU cell is valid, but no cadastral/reference record could be loaded. No fabricated ownership, ULPIN, registration or valuation data is shown.</div>`;
    $('rawData').textContent=err.message||String(err);
  }
}
load();
})();
