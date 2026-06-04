// ── DAMAGE REPORTS ─────────────────────────────────────────
// Standalone module. Depends on app.js globals: db, toast, crewMembers, jobs,
// binItems, vehicles, _uploadPhotoToCloudinary, _cloudinaryConfigured,
// _cloudinaryDeliveryUrl, closeM, todayStr, fd, fm, currentUser.
// Called by render('damage'). A bug here only affects this page.

var damageReports = [];
var _damageLoaded = false;
var _damagePhotos = [];
var _damageEditId = null;
var _damageFilter = 'all';
var _damageQuery = '';

function _dEsc(s){ return (s == null ? '' : (''+s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function _damageVehicles(){ return (typeof vehicles !== 'undefined' && vehicles) ? vehicles : (typeof dashVehicles !== 'undefined' && dashVehicles ? dashVehicles : []); }

async function loadDamageReports(){
  var r = await db.from('damage_reports').select('*').order('created_at',{ascending:false});
  if(r.error){ console.error('damage load error', r.error); return; }
  damageReports = r.data || [];
  _damageLoaded = true;
}

async function renderDamageReports(){
  var host = document.getElementById('damage-list');
  if(!host) return;
  if(!_damageLoaded){ host.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">Loading…</div>'; await loadDamageReports(); }
  var open = damageReports.filter(function(d){ return d.status !== 'resolved'; }).length;
  var resolved = damageReports.filter(function(d){ return d.status === 'resolved'; }).length;
  var sub = document.getElementById('damage-sub');
  if(sub) sub.textContent = damageReports.length + ' report' + (damageReports.length===1?'':'s') + ' · ' + open + ' open · ' + resolved + ' resolved';
  var fc = document.getElementById('damage-filters');
  if(fc){
    var defs = [{k:'all',l:'All',n:damageReports.length},{k:'open',l:'Open',n:open},{k:'resolved',l:'Resolved',n:resolved}];
    fc.innerHTML = defs.map(function(d){
      var on = _damageFilter===d.k;
      return '<button class="filter-chip'+(on?' active':'')+'" onclick="damageSetFilter(\''+d.k+'\')">'+d.l+' ('+d.n+')</button>';
    }).join('');
  }
  var q = _damageQuery.toLowerCase();
  var list = damageReports.filter(function(d){
    if(_damageFilter==='open' && d.status==='resolved') return false;
    if(_damageFilter==='resolved' && d.status!=='resolved') return false;
    if(!q) return true;
    return ((d.customer_name||'')+' '+(d.what_damaged||'')+' '+(d.description||'')+' '+(d.job_id||'')+' '+(d.crew_name||'')+' '+(d.address||'')).toLowerCase().indexOf(q)>=0;
  });
  if(!list.length){
    host.innerHTML = '<div style="text-align:center;padding:50px 20px;color:var(--muted)"><div style="font-size:40px;margin-bottom:10px">✅</div><div style="font-size:15px">'+(damageReports.length?'No reports match your filter.':'No damage reports yet. Click “+ New Damage Report” to log one.')+'</div></div>';
    return;
  }
  host.innerHTML = list.map(damageCardHtml).join('');
}

function damageCardHtml(d){
  var photos = d.photos || [];
  var thumb = photos.length
    ? '<img src="'+_cloudinaryDeliveryUrl(photos[0],{width:200})+'" alt="" style="width:74px;height:74px;object-fit:cover;border-radius:10px;flex-shrink:0">'
    : '<div style="width:74px;height:74px;border-radius:10px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">⚠️</div>';
  var statusBadge = d.status==='resolved'
    ? '<span style="font-size:11px;font-weight:700;background:rgba(34,197,94,.13);color:#22c55e;border-radius:6px;padding:2px 9px">✓ Resolved</span>'
    : '<span style="font-size:11px;font-weight:700;background:rgba(220,53,69,.12);color:#dc3545;border-radius:6px;padding:2px 9px">● Open</span>';
  var morePhotos = photos.length>1 ? '<span style="font-size:10px;color:var(--muted)">+'+(photos.length-1)+' photo'+(photos.length-1>1?'s':'')+'</span>' : '';
  var costStr = (d.cost!=null && d.cost!=='') ? fm(d.cost) : '';
  return '<div class="chart-card" style="padding:14px 16px;margin-bottom:12px;display:flex;gap:14px;align-items:flex-start;cursor:pointer" onclick="openDamageDetail(\''+d.id+'\')">'
    + thumb
    + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">'
        + '<span style="font-weight:700;font-size:15px;color:var(--text)">'+_dEsc(d.what_damaged||'Damage')+'</span>'
        + statusBadge + morePhotos
      + '</div>'
      + (d.description?'<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.45;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">'+_dEsc(d.description)+'</div>':'')
      + '<div style="font-size:11px;color:var(--muted);margin-top:6px;display:flex;gap:12px;flex-wrap:wrap">'
        + (d.job_id?'<span>🧾 Job '+_dEsc(d.job_id)+'</span>':'')
        + (d.customer_name?'<span>👤 '+_dEsc(d.customer_name)+'</span>':'')
        + (d.crew_name?'<span>🧑‍🔧 '+_dEsc(d.crew_name)+'</span>':'')
        + (d.incident_date?'<span>📅 '+fd(d.incident_date)+'</span>':'')
        + (costStr?'<span>💰 '+costStr+'</span>':'')
      + '</div>'
    + '</div>'
  + '</div>';
}

function damageSetFilter(f){ _damageFilter=f; renderDamageReports(); }
function damageSearch(v){ _damageQuery=v; renderDamageReports(); }

// ── Job link search (in-memory recent jobs) ──
function damageJobSearch(v){
  var q=(v||'').toLowerCase().trim();
  var box=document.getElementById('dmg-job-results');
  if(!box) return;
  if(q.length<2){ box.style.display='none'; box.innerHTML=''; return; }
  var matches = (typeof jobs!=='undefined'?jobs:[]).filter(function(j){
    return ((j.id||'')+' '+(j.name||'')+' '+(j.address||'')).toLowerCase().indexOf(q)>=0;
  }).slice(0,8);
  if(!matches.length){ box.style.display='none'; box.innerHTML=''; return; }
  box.innerHTML = matches.map(function(j){
    return '<div style="padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px" onmousedown="damagePickJob(\''+_dEsc(j.id)+'\')"><strong>'+_dEsc(j.id)+'</strong> · '+_dEsc(j.name||'')+(j.address?' <span style="color:var(--muted)">'+_dEsc(j.address)+'</span>':'')+'</div>';
  }).join('');
  box.style.display='block';
}
function damagePickJob(jobId){
  var j=(typeof jobs!=='undefined'?jobs:[]).find(function(x){return x.id===jobId;});
  document.getElementById('dmg-job').value=jobId;
  if(j){
    document.getElementById('dmg-customer').value=(j.names&&j.names.length?j.names.join(', '):(j.name||''));
    document.getElementById('dmg-address').value=(j.address||'')+(j.city?', '+j.city:'');
  }
  var box=document.getElementById('dmg-job-results'); if(box){ box.style.display='none'; box.innerHTML=''; }
}

function _damagePopulateSelects(){
  var crew=document.getElementById('dmg-crew');
  if(crew) crew.innerHTML='<option value="">— Select crew member —</option>'+(crewMembers||[]).map(function(c){return '<option value="'+c.id+'">'+_dEsc(c.name)+'</option>';}).join('');
  var bin=document.getElementById('dmg-bin');
  if(bin) bin.innerHTML='<option value="">— None —</option>'+(binItems||[]).map(function(b){return '<option value="'+b.bid+'">Bin '+_dEsc(b.num||b.bid)+(b.size?' · '+_dEsc(b.size):'')+'</option>';}).join('');
  var veh=document.getElementById('dmg-vehicle');
  if(veh) veh.innerHTML='<option value="">— None —</option>'+_damageVehicles().map(function(v){return '<option value="'+v.vid+'">'+_dEsc(v.name||v.vid)+'</option>';}).join('');
}

function _damageResetForm(){
  ['dmg-job','dmg-customer','dmg-address','dmg-what','dmg-desc','dmg-cost'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  var box=document.getElementById('dmg-job-results'); if(box){ box.style.display='none'; box.innerHTML=''; }
}

function openDamageReport(jobId){
  _damageEditId=null; _damagePhotos=[];
  _damageResetForm(); _damagePopulateSelects();
  document.getElementById('dmg-title').textContent='Report Damage';
  var del=document.getElementById('dmg-del-btn'); if(del) del.style.display='none';
  document.getElementById('dmg-date').value=todayStr();
  document.getElementById('dmg-status').value='open';
  document.getElementById('dmg-crew').value='';
  document.getElementById('dmg-bin').value='';
  document.getElementById('dmg-vehicle').value='';
  if(jobId){
    document.getElementById('dmg-job').value=jobId;
    var j=(typeof jobs!=='undefined'?jobs:[]).find(function(x){return x.id===jobId;});
    if(j){
      document.getElementById('dmg-customer').value=(j.names&&j.names.length?j.names.join(', '):(j.name||''));
      document.getElementById('dmg-address').value=(j.address||'')+(j.city?', '+j.city:'');
    }
  }
  _renderDamagePhotos();
  document.getElementById('damage-modal').classList.add('open');
}

function openDamageEdit(id){
  var d=damageReports.find(function(x){return x.id===id;});
  if(!d) return;
  _damageEditId=id; _damagePhotos=(d.photos||[]).slice();
  _damageResetForm(); _damagePopulateSelects();
  document.getElementById('dmg-title').textContent='Edit Damage Report';
  var del=document.getElementById('dmg-del-btn'); if(del) del.style.display='';
  document.getElementById('dmg-job').value=d.job_id||'';
  document.getElementById('dmg-customer').value=d.customer_name||'';
  document.getElementById('dmg-address').value=d.address||'';
  document.getElementById('dmg-what').value=d.what_damaged||'';
  document.getElementById('dmg-desc').value=d.description||'';
  document.getElementById('dmg-crew').value=d.crew_member_id||'';
  document.getElementById('dmg-date').value=d.incident_date||'';
  document.getElementById('dmg-cost').value=(d.cost!=null?d.cost:'');
  document.getElementById('dmg-status').value=d.status||'open';
  document.getElementById('dmg-bin').value=d.bin_bid||'';
  document.getElementById('dmg-vehicle').value=d.vehicle_vid||'';
  _renderDamagePhotos();
  document.getElementById('damage-modal').classList.add('open');
}
function openDamageDetail(id){ openDamageEdit(id); }

async function damageAddPhotos(inp){
  if(!inp.files || !inp.files.length) return;
  if(!_cloudinaryConfigured()){ toast('Photo upload not configured — add Cloudinary settings in app.js','error'); inp.value=''; return; }
  var grid=document.getElementById('dmg-photos-grid');
  var files=[].slice.call(inp.files); inp.value='';
  for(var i=0;i<files.length;i++){
    var ph=document.createElement('div'); ph.className='photo-thumb photo-thumb-uploading'; ph.textContent='Uploading…';
    if(grid) grid.appendChild(ph);
    try{ var url=await _uploadPhotoToCloudinary(files[i]); _damagePhotos.push(url); ph.remove(); _renderDamagePhotos(); }
    catch(err){ console.error('damage photo upload failed', err); ph.textContent='❌ Failed'; (function(p){ setTimeout(function(){ p.remove(); }, 2500); })(ph); toast('Photo upload failed: '+err.message,'error'); }
  }
}
function _renderDamagePhotos(){
  var grid=document.getElementById('dmg-photos-grid'); if(!grid) return;
  grid.innerHTML=_damagePhotos.map(function(url,i){
    return '<div class="photo-thumb"><img src="'+_cloudinaryDeliveryUrl(url,{width:200})+'" alt="" loading="lazy"><button type="button" class="photo-thumb-remove" onclick="_removeDamagePhoto('+i+')" title="Remove">×</button></div>';
  }).join('');
}
function _removeDamagePhoto(i){ _damagePhotos.splice(i,1); _renderDamagePhotos(); }

async function saveDamageReport(){
  var what=(document.getElementById('dmg-what').value||'').trim();
  if(!what){ toast('Please enter what was damaged.','error'); return; }
  var crewId=document.getElementById('dmg-crew').value||null;
  var crewName=(function(){ var c=(crewMembers||[]).find(function(x){return x.id===crewId;}); return c?c.name:null; })();
  var costRaw=document.getElementById('dmg-cost').value;
  var rec={
    job_id: (document.getElementById('dmg-job').value||'').trim() || null,
    customer_name: (document.getElementById('dmg-customer').value||'').trim() || null,
    address: (document.getElementById('dmg-address').value||'').trim() || null,
    what_damaged: what,
    description: (document.getElementById('dmg-desc').value||'').trim() || null,
    crew_member_id: crewId,
    crew_name: crewName,
    incident_date: document.getElementById('dmg-date').value || null,
    cost: (costRaw===''||costRaw==null) ? null : parseFloat(costRaw),
    status: document.getElementById('dmg-status').value || 'open',
    bin_bid: document.getElementById('dmg-bin').value || null,
    vehicle_vid: document.getElementById('dmg-vehicle').value || null,
    photos: _damagePhotos.slice()
  };
  var btn=document.getElementById('dmg-save-btn'); if(btn){ btn.disabled=true; btn.textContent='Saving…'; }
  var r;
  if(_damageEditId){
    r=await db.from('damage_reports').update(rec).eq('id', _damageEditId);
  } else {
    rec.created_by=(typeof currentUser!=='undefined' && currentUser && currentUser.displayName) ? currentUser.displayName : null;
    r=await db.from('damage_reports').insert(rec);
  }
  if(btn){ btn.disabled=false; btn.textContent='Save report'; }
  if(r.error){ toast('Save failed: '+r.error.message,'error'); return; }
  closeM('damage-modal');
  await loadDamageReports();
  renderDamageReports();
  toast(_damageEditId?'Damage report updated.':'Damage report saved.');
}

async function delDamageReport(){
  if(!_damageEditId) return;
  if(!confirm('Delete this damage report? This cannot be undone.')) return;
  var r=await db.from('damage_reports').delete().eq('id', _damageEditId);
  if(r.error){ toast('Delete failed: '+r.error.message,'error'); return; }
  closeM('damage-modal');
  await loadDamageReports();
  renderDamageReports();
  toast('Damage report deleted.');
}
