(() => {
'use strict';
const DATA_URL='./data/dinesafe.csv';
const $=id=>document.getElementById(id);
const ui={locate:$('locate'),locSub:$('loc-sub'),radius:$('radius'),maxInspections:$('maxInspections'),foodOnly:$('foodOnly'),status:$('status'),summary:$('summary'),results:$('results'),filters:$('filters'),filterToggle:$('filterToggle'),filterCount:$('filterCount'),modeCurrent:$('locationModeCurrent'),modeAddress:$('locationModeAddress'),currentPanel:$('currentLocationPanel'),addressPanel:$('addressLocationPanel'),manualSub:$('manual-sub'),manualInput:$('manualInput'),manualGo:$('manualGo'),debugText:$('debugText')};
let coords=null,establishments=null,sortMode='newest',locationSource='',permissionState='unknown',permissionStatus=null;
const ua=navigator.userAgent||'';
const isIOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandalone=window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
const browser=/FxiOS/i.test(ua)?'Firefox iOS':/CriOS/i.test(ua)?'Chrome iOS':/EdgiOS/i.test(ua)?'Edge iOS':/Safari/i.test(ua)?'Safari':'Browser';
function setDebug(extra=''){ui.debugText.textContent=[`Secure context: ${window.isSecureContext}`,`Protocol: ${location.protocol}`,`Browser: ${browser}`,`iOS/iPadOS: ${isIOS}`,`Standalone/Home Screen: ${isStandalone}`,`Geolocation API: ${!!navigator.geolocation}`,`Permission state: ${permissionState}`,`Location source: ${locationSource||'none'}`,extra].filter(Boolean).join('\n');}
function status(msg,isError=false){ui.status.className='status show'+(isError?' error':'');ui.status.innerHTML=msg;}
function clearStatus(){ui.status.className='status';ui.status.textContent='';}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function normKey(k){return String(k).toUpperCase().replace(/[^A-Z0-9]/g,'');}
function get(row,aliases){const map={};for(const k of Object.keys(row))map[normKey(k)]=row[k];for(const a of aliases){const v=map[normKey(a)];if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v).trim();}return'';}
function parseNum(v){const n=Number(String(v??'').replace(/[()\[\]]/g,'').trim());return Number.isFinite(n)?n:NaN;}
function parseDate(v){if(!v)return null;const s=String(v).trim();let d=new Date(s+'T12:00:00');if(Number.isNaN(d.getTime()))d=new Date(s);return d&&!Number.isNaN(d.getTime())?d:null;}
function hav(a,b,c,d){const R=6371,r=Math.PI/180,dl=(c-a)*r,dn=(d-b)*r,x=Math.sin(dl/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function parseCSV(text){const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')q=false;else cell+=c;}else if(c==='"')q=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}if(cell.length||row.length){row.push(cell);rows.push(row);}if(!rows.length)return[];const h=rows.shift().map(x=>x.trim());return rows.filter(r=>r.some(v=>String(v).trim())).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));}
async function loadData(){if(establishments)return establishments;status('<span class="spinner"></span>Loading DineSafe establishments…');const r=await fetch(DATA_URL,{cache:'no-store'});if(!r.ok)throw new Error(`DineSafe data file returned ${r.status}`);const rows=parseCSV(await r.text());establishments=rows.map(row=>({id:get(row,['ESTABLISHMENT_ID']),name:get(row,['ESTABLISHMENT_NAME']),address:get(row,['ESTABLISHMENT_ADDRESS']),date:parseDate(get(row,['INSPECTION_DATE'])),result:get(row,['ESTABLISHMENT_STATUS']),inspectionCount:parseNum(get(row,['INSPECTION_COUNT'])),lat:parseNum(get(row,['LATITUDE'])),lon:parseNum(get(row,['LONGITUDE']))})).filter(e=>e.name&&e.date&&Number.isFinite(e.inspectionCount)&&e.inspectionCount>=1&&Number.isFinite(e.lat)&&Number.isFinite(e.lon));if(!establishments.length)throw new Error('The DineSafe file contains no establishments with recorded inspection counts.');const latest=establishments.reduce((m,e)=>!m||e.date>m?e.date:m,null);clearStatus();setDebug(`Establishments loaded: ${establishments.length}\nNewest inspection: ${latest?.toISOString().slice(0,10)||'unknown'}`);return establishments;}
function over12MonthsOld(d){const cutoff=new Date();cutoff.setHours(12,0,0,0);cutoff.setFullYear(cutoff.getFullYear()-1);return d<cutoff;}
function fmtDate(d){const base=new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric'}).format(d);return over12MonthsOld(d)?`${base}/${String(d.getFullYear()).slice(-2)}`:base;}
function ageDays(d){return Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));}
function ageLabel(d){return d===0?'Today':d===1?'Yesterday':d+' days ago';}
function statusClass(s){s=(s||'').toLowerCase();return s.includes('conditional')?'conditional':s.includes('closed')?'closed':'pass';}
function inspectionSummary(e){return e.inspectionCount===1?'First recorded DineSafe inspection':`${e.inspectionCount} recorded DineSafe inspections`;}
function updateFilterCount(){let n=0;if(ui.radius.value!=='2')n++;if(ui.maxInspections.value!=='1')n++;ui.filterCount.textContent=n;ui.filterCount.classList.toggle('show',n>0);}
function render(){updateFilterCount();if(!coords||!establishments)return;const radius=+ui.radius.value,maxInspections=+ui.maxInspections.value,limit=100;let arr=establishments.map(e=>({...e,distance:hav(coords.lat,coords.lon,e.lat,e.lon),days:ageDays(e.date)})).filter(e=>e.distance<=radius&&e.inspectionCount<=maxInspections);arr.sort(sortMode==='closest'?(a,b)=>a.distance-b.distance||b.date-a.date:(a,b)=>b.date-a.date||a.distance-b.distance);const shown=arr.slice(0,limit);ui.summary.textContent=arr.length?`${arr.length.toLocaleString()} matches · showing ${shown.length}`:'No matches';if(!shown.length){ui.results.innerHTML='<div class="empty">No establishments match these filters. Try a larger distance or higher inspection setting.</div>';return;}ui.results.innerHTML=shown.map(e=>{const ds=e.distance<1?Math.round(e.distance*1000)+' m':e.distance.toFixed(1)+' km',map='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(e.name+' '+e.address+', Toronto'),cls=statusClass(e.result);return `<article class="item"><div class="item-top"><div class="maincopy"><h3>${esc(e.name)}</h3><div class="address"><a href="${map}" target="_blank" rel="noopener" aria-label="Open ${esc(e.address)} in Google Maps (opens in a new tab)"><span class="address-text">${esc(e.address)}</span><span class="external-mark" aria-hidden="true">↗</span></a></div></div><div class="distance">${ds}<small>away</small></div></div><div class="inspection"><div class="datebox"><strong>${fmtDate(e.date)}</strong><span>${ageLabel(e.days)}</span></div><div class="inspection-copy"><div class="statusline ${cls}">${esc(e.result||'Inspection recorded')}</div><div class="type">${esc(inspectionSummary(e))}</div></div></div></article>`;}).join('');}
function setLocationMode(mode,focus=false){const current=mode==='current';ui.currentPanel.hidden=!current;ui.addressPanel.hidden=current;ui.modeCurrent.setAttribute('aria-pressed',String(current));ui.modeAddress.setAttribute('aria-pressed',String(!current));if(focus&&!current)setTimeout(()=>ui.manualInput.focus(),0);}
function showManual(focus=false){setLocationMode('address',focus);}
function blockedHelp(){
  if(isIOS&&isStandalone)return 'Location is blocked for this Home Screen web app. Open this site directly in Safari and allow location there, or use Look up address.';
  if(isIOS&&/FxiOS|CriOS|EdgiOS/i.test(ua))return `Location is blocked for ${esc(browser)}. In iPhone Settings, enable Location Services for this browser, or open this site in Safari.`;
  if(isIOS)return 'Location is blocked for this site. In Safari, open the Page Menu → Website Settings → Location → Allow. Also check Settings → Privacy & Security → Location Services → Safari Websites.';
  return 'Location is blocked for this site. Use your browser’s site-permissions control beside the address bar to allow Location, then return here.';
}
function applyPermissionUI(state){
  permissionState=state||'unknown';
  if(coords){ui.locate.textContent='Refresh location';return;}
  if(permissionState==='granted'){
    ui.locate.textContent='Use current location';
    ui.locSub.textContent='Location permission is allowed';
  }else if(permissionState==='prompt'){
    ui.locate.textContent='Allow location';
    ui.locSub.textContent='Your browser will ask for location access';
  }else if(permissionState==='denied'){
    ui.locate.textContent='Location blocked';
    ui.locSub.textContent='Permission must be changed in browser or system settings';
  }else{
    ui.locate.textContent='Allow location';
    ui.locSub.textContent='Tap to request location access';
  }
}
async function readPermissionState(){
  if(!navigator.permissions?.query){applyPermissionUI('unknown');setDebug();return 'unknown';}
  try{
    permissionStatus=await navigator.permissions.query({name:'geolocation'});
    applyPermissionUI(permissionStatus.state);
    permissionStatus.onchange=()=>{
      applyPermissionUI(permissionStatus.state);
      setDebug();
      if(permissionStatus.state==='granted')clearStatus();
    };
    setDebug();
    return permissionStatus.state;
  }catch(e){
    applyPermissionUI('unknown');
    setDebug();
    return 'unknown';
  }
}
async function run(){
  if(!window.isSecureContext){status('Location requires HTTPS.',true);return;}
  if(!navigator.geolocation){status('This browser does not expose geolocation. Use Look up address instead.',true);showManual(true);return;}

  const state=await readPermissionState();
  if(state==='denied'){
    status(blockedHelp(),true);
    applyPermissionUI('denied');
    setDebug();
    return;
  }

  ui.locate.disabled=true;
  ui.locate.textContent=state==='prompt'?'Requesting permission…':'Finding location…';
  clearStatus();
  loadData().catch(()=>{});

  navigator.geolocation.getCurrentPosition(async p=>{
    try{
      coords={lat:p.coords.latitude,lon:p.coords.longitude};
      locationSource='device';
      permissionState='granted';
      ui.locSub.textContent=`Located · about ${Math.round(p.coords.accuracy)} m accuracy`;
      ui.locate.textContent='Refresh location';
      setDebug(`Coordinates: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}\nAccuracy: ${Math.round(p.coords.accuracy)} m`);
      await loadData();render();
    }catch(e){status('DineSafe data could not be loaded: '+esc(e.message),true);}
    finally{ui.locate.disabled=false;}
  },async err=>{
    ui.locate.disabled=false;
    await readPermissionState();
    if(err.code===1){
      applyPermissionUI('denied');
      status(blockedHelp(),true);
    }else if(err.code===2){
      applyPermissionUI(permissionState);
      status('Your device could not determine a location. Check Location Services and network access, then try again.',true);
    }else{
      applyPermissionUI(permissionState);
      status('Location lookup timed out. Try again.',true);
    }
    setDebug(`Geolocation error code: ${err.code}\n${err.message||''}`);
  },{enableHighAccuracy:false,timeout:15000,maximumAge:300000});
}
function parseCoords(s){const m=String(s).trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);if(!m)return null;const lat=+m[1],lon=+m[2];return lat>=43.45&&lat<=44&&lon>=-80&&lon<=-78.8?{lat,lon}:null;}
async function manualLocation(){const q=ui.manualInput.value.trim();if(!q){ui.manualInput.focus();return;}ui.manualGo.disabled=true;ui.manualGo.textContent='Finding…';clearStatus();try{let found=parseCoords(q),label='';if(!found){const u='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ca&viewbox=-79.75,43.95,-79.05,43.50&bounded=1&q='+encodeURIComponent(q+', Toronto, Ontario');const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(`Address lookup returned ${r.status}`);const j=await r.json();if(!j.length)throw new Error('No Toronto location matched that address or intersection.');found={lat:+j[0].lat,lon:+j[0].lon};label=j[0].display_name||q;}coords=found;locationSource='address';ui.manualSub.textContent=label?`Using ${label.split(',').slice(0,2).join(',')}`:`Using ${found.lat.toFixed(4)}, ${found.lon.toFixed(4)}`;setDebug(`Manual coordinates: ${found.lat.toFixed(5)}, ${found.lon.toFixed(5)}`);await loadData();render();}catch(e){status('Address lookup failed: '+esc(e.message)+' You can paste coordinates such as 43.67, -79.35 instead.',true);}finally{ui.manualGo.disabled=false;ui.manualGo.textContent='Find nearby';}}
ui.locate.addEventListener('click',run);ui.modeCurrent.addEventListener('click',()=>setLocationMode('current'));ui.modeAddress.addEventListener('click',()=>setLocationMode('address',true));ui.manualGo.addEventListener('click',manualLocation);ui.manualInput.addEventListener('keydown',e=>{if(e.key==='Enter')manualLocation();});document.querySelectorAll('[data-sort]').forEach(btn=>btn.addEventListener('click',()=>{sortMode=btn.dataset.sort;document.querySelectorAll('[data-sort]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));render();}));ui.filterToggle.addEventListener('click',()=>{const open=!ui.filters.classList.contains('open');ui.filters.classList.toggle('open',open);ui.filterToggle.setAttribute('aria-expanded',String(open));});[ui.radius,ui.maxInspections,ui.foodOnly].forEach(el=>el.addEventListener('change',render));updateFilterCount();setLocationMode('current');setDebug();readPermissionState();
})();
