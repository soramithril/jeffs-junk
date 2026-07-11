// ─── DISPATCH (Bin Rental routing) ───
// Depends on app.js globals: db, toast, todayStr, fd, dbToJob, crewMembers,
// crewAvatarColor, refreshDashJobs, renderLiveJobs.
// Called by render('dispatch') in app.js.
var YARD_LATLNG = {lat: 44.3683, lng: -79.6831};
var _dispatchCityTimes = {};
var _dispatchDate = null;
var _dispatchJobsCache = [];
var _dispatchGeofences = {};
var _dispatchOsrmInflight = false;

async function dispatchLoadCityTimes(){
  var r = await db.from('city_drive_times').select('*');
  if(!r.error && r.data){
    _dispatchCityTimes = {};
    r.data.forEach(function(row){ _dispatchCityTimes[row.city] = row.minutes; });
  }
}
function dispatchCityMins(city){
  if(!city) return 20;
  var m = _dispatchCityTimes[city];
  return (typeof m === 'number') ? m : 20;
}
function dispatchJobMins(j){
  if(j._driveMins != null) return j._driveMins;
  return dispatchCityMins(j.city);
}
function dispatchEstimateMinutes(job, kind){
  var c = dispatchJobMins(job);
  if(kind === 'standalone-pickup')   return 2*c + 5 + 12 + 6;  // hookup + dump + dump→yard
  if(kind === 'standalone-delivery') return 2*c + 5;            // drop
  if(kind === 'swap-pickup')         return 2*c + 5 + 12;       // skip dump→yard return
  if(kind === 'swap-delivery')       return 2*c + 5;
  return 0;
}
var DISPATCH_COMBO_MAX_KM = 15; // pickup→delivery legs farther apart than this aren't worth combining
function dispatchHaversineKm(a, b){
  if(!a || !b) return Infinity;
  var R = 6371, dLat = (b.lat-a.lat)*Math.PI/180, dLng = (b.lng-a.lng)*Math.PI/180;
  var la1 = a.lat*Math.PI/180, la2 = b.lat*Math.PI/180;
  var h = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.sqrt(h));
}
function dispatchJobAddrStr(j){
  var a = (j.address||'').trim();
  if(!a) return '';
  return a + ', ' + (j.city||'').trim() + ', ON, Canada';
}
// Resolved coordinate for a job: geofence coord (best) else cached geocode of its address.
function dispatchJobCoord(j){
  if(j._lat != null && j._lng != null) return {lat:j._lat, lng:j._lng};
  var addr = dispatchJobAddrStr(j);
  if(addr && geoCache[addr]) return geoCache[addr];
  return null;
}
// Pair pickups with deliveries by REAL proximity: same property first (on-site swap),
// then globally nearest under DISPATCH_COMBO_MAX_KM so the best swaps win the match.
function dispatchFindSwaps(jobsList){
  var pickups = jobsList.filter(function(j){return j._isPickup;});
  var deliveries = jobsList.filter(function(j){return j._isDelivery;});
  var cand = [];
  pickups.forEach(function(p){
    var pAddr = dispatchJobAddrStr(p), pc = dispatchJobCoord(p);
    deliveries.forEach(function(d){
      var dist = (pAddr && pAddr === dispatchJobAddrStr(d)) ? 0 : dispatchHaversineKm(pc, dispatchJobCoord(d));
      if(dist <= DISPATCH_COMBO_MAX_KM) cand.push({p:p.id, d:d.id, dist:dist});
    });
  });
  cand.sort(function(a,b){return a.dist - b.dist;});
  var partner = {}, used = {};
  cand.forEach(function(c){
    if(used[c.p] || used[c.d]) return;
    partner[c.p] = c.d; partner[c.d] = c.p;
    used[c.p] = true; used[c.d] = true;
  });
  return partner;
}
// Reorders a list so every combo pair is back-to-back (pickup immediately
// followed by its delivery partner); non-combo cards keep their order.
function dispatchGroupCombos(list){
  var byId = {}; list.forEach(function(j){ byId[j.id]=j; });
  var done = {}, out = [];
  list.forEach(function(j){
    if(done[j.id]) return;
    var p = j._partnerId && byId[j._partnerId];
    if(p && !done[p.id]){
      var pick = j._isPickup ? j : p, drop = j._isPickup ? p : j;
      out.push(pick); done[pick.id] = true;
      out.push(drop); done[drop.id] = true;
    } else { out.push(j); done[j.id] = true; }
  });
  return out;
}
// Orders one lane's legs: timed drops first (by time), then combos (kept strictly
// back-to-back), then loose drops, then loose pickups (soft 9:30 preference).
// Returns {jobs, warnings}. Nothing is dropped — the final pass catches everything.
function dispatchOrderLaneJobs(jobs){
  var warnings = [];
  var byId = {}; jobs.forEach(function(j){ byId[j.id]=j; });
  var done = {}, ordered = [];
  function emit(j){ if(!j || done[j.id]) return; ordered.push(j); done[j.id] = true; }
  function emitPair(j){
    if(!j || done[j.id]) return;
    var p = j._partnerId && byId[j._partnerId];
    if(p && !done[p.id]){
      var pick = j._isPickup ? j : p, drop = j._isPickup ? p : j;
      emit(pick); emit(drop);
    } else emit(j);
  }
  var fixed = jobs.filter(function(j){ return j._isDelivery && j.binDropoffTime; })
    .sort(function(a,b){ return dispatchParseClock(a.binDropoffTime) - dispatchParseClock(b.binDropoffTime); });
  for(var i=1;i<fixed.length;i++){
    if(fixed[i].binDropoffTime === fixed[i-1].binDropoffTime) warnings.push('Two timed drops at '+ft(fixed[i].binDropoffTime));
  }
  fixed.forEach(emitPair);                                                  // 1. timed drops first (+ partners)
  jobs.forEach(function(j){ if(!done[j.id] && j._partnerId) emitPair(j); }); // 2. remaining combos, back-to-back
  jobs.forEach(function(j){ if(!done[j.id] && j._isDelivery) emit(j); });    // 3. loose drops
  jobs.forEach(function(j){ if(!done[j.id]) emit(j); });                     // 4. loose pickups last
  return {jobs: ordered, warnings: warnings};
}
async function dispatchLoadJobs(dateISO){
  var r = await db.from('jobs').select('*').eq('service','Bin Rental').neq('status','Cancelled')
    .or('bin_dropoff.eq.'+dateISO+',bin_pickup.eq.'+dateISO);
  if(r.error){ console.error('Dispatch jobs error:', r.error); return []; }
  return (r.data||[]).map(dbToJob);
}
async function dispatchLoadGeofences(jobIds){
  if(!jobIds.length) return {};
  var r = await db.from('geofences').select('job_id,lat,lng,drive_minutes_from_yard').in('job_id', jobIds);
  if(r.error) return {};
  var map = {};
  (r.data||[]).forEach(function(g){ map[g.job_id] = g; });
  return map;
}
async function dispatchEnsureDriveMins(jobId, geofence){
  if(geofence.drive_minutes_from_yard != null) return geofence.drive_minutes_from_yard;
  if(!geofence.lat || !geofence.lng) return null;
  try {
    var url = 'https://router.project-osrm.org/route/v1/driving/' +
      YARD_LATLNG.lng + ',' + YARD_LATLNG.lat + ';' +
      geofence.lng + ',' + geofence.lat + '?overview=false';
    var resp = await fetch(url);
    var json = await resp.json();
    if(json.routes && json.routes[0]){
      var mins = Math.round(json.routes[0].duration / 60);
      await db.from('geofences').update({drive_minutes_from_yard: mins}).eq('job_id', jobId);
      return mins;
    }
  } catch(e){ console.warn('OSRM failed for', jobId, e); }
  return null;
}
async function dispatchFillUnknownDriveTimes(){
  if(_dispatchOsrmInflight) return;
  _dispatchOsrmInflight = true;
  try {
    var queue = [];
    _dispatchJobsCache.forEach(function(j){
      var g = _dispatchGeofences[j.id];
      if(g && g.drive_minutes_from_yard == null && g.lat && g.lng){
        queue.push({jobId: j.id, geofence: g});
      }
    });
    var anyFilled = false;
    for(var i=0; i<queue.length; i++){
      var mins = await dispatchEnsureDriveMins(queue[i].jobId, queue[i].geofence);
      if(mins != null){
        queue[i].geofence.drive_minutes_from_yard = mins;
        anyFilled = true;
      }
      if(i < queue.length - 1) await new Promise(function(r){ setTimeout(r, 1500); });
    }
    if(anyFilled) renderDispatch();
  } finally { _dispatchOsrmInflight = false; }
}
var _dispatchGeoInflight = false;
// Geocodes addresses that have no coordinate yet (so combo matching can use real
// distance), one per ~1.2s to respect Nominatim, then re-renders once.
function dispatchFillMissingCoords(){
  if(_dispatchGeoInflight) return;
  var queue = [];
  _dispatchJobsCache.forEach(function(j){
    if(dispatchJobCoord(j)) return;
    var addr = dispatchJobAddrStr(j);
    if(addr && queue.indexOf(addr) < 0) queue.push(addr);
  });
  if(!queue.length) return;
  _dispatchGeoInflight = true;
  var i = 0, anyFilled = false;
  (function next(){
    if(i >= queue.length){
      _dispatchGeoInflight = false;
      if(anyFilled) renderDispatch();
      return;
    }
    geocode(queue[i], function(r){
      if(r) anyFilled = true;
      i++;
      setTimeout(next, 1200);
    });
  })();
}
function dispatchFmtTotal(mins){
  if(!mins) return '0m';
  var h = Math.floor(mins/60), m = mins % 60;
  return (h?h+'h ':'') + (m?m+'m':(h?'':'0m'));
}
function _dPad2(n){ return n<10 ? '0'+n : ''+n; }
function dispatchFmtClock(totalMins){
  totalMins = Math.round(totalMins);
  var h = Math.floor(totalMins/60), m = ((totalMins % 60) + 60) % 60;
  var ampm = h >= 12 ? 'pm' : 'am';
  var h12 = h % 12; if(h12 === 0) h12 = 12;
  return h12 + ':' + _dPad2(m) + ampm;
}
function dispatchParseClock(s){
  if(!s) return null;
  var p = s.split(':');
  if(p.length !== 2) return null;
  var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if(isNaN(h) || isNaN(m)) return null;
  return h*60 + m;
}
function dispatchGetWorkingIds(){
  if(!_dispatchDate) return [];
  try { return JSON.parse(localStorage.getItem('dispatch_working_'+_dispatchDate)||'[]'); }
  catch(e){ return []; }
}
function dispatchSetWorkingIds(ids){
  if(!_dispatchDate) return;
  localStorage.setItem('dispatch_working_'+_dispatchDate, JSON.stringify(ids));
}
function dispatchToggleWorking(crewId){
  var ids = dispatchGetWorkingIds();
  var i = ids.indexOf(crewId);
  if(i>=0) ids.splice(i,1); else ids.push(crewId);
  dispatchSetWorkingIds(ids);
  renderDispatch();
}
function dispatchGetLaneStart(crewId){
  if(!_dispatchDate) return '08:00';
  return localStorage.getItem('dispatch_start_'+_dispatchDate+'_'+crewId) || '08:00';
}
function dispatchSetLaneStart(crewId, time){
  if(!_dispatchDate) return;
  localStorage.setItem('dispatch_start_'+_dispatchDate+'_'+crewId, time);
  renderDispatch();
}
function dispatchShiftDate(days){
  var d = new Date((_dispatchDate || todayStr())+'T00:00:00');
  d.setDate(d.getDate() + days);
  _dispatchDate = d.toISOString().split('T')[0];
  renderDispatch();
}
async function dispatchAssignJob(jobId, crewId, leg){
  _dispatchMenu = null; // close any open Assign/Move menu on assignment
  var col = leg === 'pickup' ? 'pickup_crew_id' : 'dropoff_crew_id';
  var update = {}; update[col] = crewId || null;
  var local = _dispatchJobsCache.find(function(j){return j.id===jobId;});
  if(local){
    if(leg === 'pickup') local.pickupCrewId = crewId || null;
    else local.dropoffCrewId = crewId || null;
    // Keep assigned_crew_ids in sync (union of per-leg) so the dashboard / job detail / leaderboard see the assignment.
    var u = [];
    if(local.dropoffCrewId) u.push(local.dropoffCrewId);
    if(local.pickupCrewId && u.indexOf(local.pickupCrewId) < 0) u.push(local.pickupCrewId);
    update.assigned_crew_ids = u;
    local.assignedCrewIds = u;
  }
  var r = await db.from('jobs').update(update).eq('job_id', jobId);
  if(r.error){ toast('Assign error: '+r.error.message); return; }
  if(typeof refreshDashJobs==='function') refreshDashJobs();
  if(typeof renderLiveJobs==='function') renderLiveJobs();
  renderDispatch();
}
async function dispatchBalanceRoutes(mode){
  mode = mode || 'fill';
  var working = dispatchGetWorkingIds();
  if(!working.length){ toast('Pick at least one driver first.'); return; }
  function legAssigned(j){ return j._isPickup ? (j.pickupCrewId||'') : (j.dropoffCrewId||''); }
  var partner = dispatchFindSwaps(_dispatchJobsCache);
  var seen = {};
  var units = [];
  _dispatchJobsCache.forEach(function(j){
    if(seen[j.id]) return;
    var pId = partner[j.id];
    if(pId){
      var p = _dispatchJobsCache.find(function(jj){return jj.id===pId;});
      units.push({jobs:[j, p], total:(j._estMinutes||0)+(p._estMinutes||0)});
      seen[j.id] = true; seen[pId] = true;
    } else {
      units.push({jobs:[j], total:j._estMinutes||0});
      seen[j.id] = true;
    }
  });
  var totals = {}; working.forEach(function(id){ totals[id]=0; });
  var unitsToAssign;
  if(mode === 'all'){
    if(!confirm('Re-balance ALL bin jobs across '+working.length+' driver(s)? This REPLACES your current assignments.')) return;
    unitsToAssign = units;
  } else {
    // Fill only: keep existing assignments, seed lane loads from them, distribute only the unassigned jobs
    _dispatchJobsCache.forEach(function(j){ var c=legAssigned(j); if(c && totals[c]!=null) totals[c]+=(j._estMinutes||0); });
    unitsToAssign = units.filter(function(u){ return u.jobs.every(function(j){ return !legAssigned(j); }); });
    if(!unitsToAssign.length){ toast('All jobs are already assigned — nothing to fill.'); return; }
  }
  unitsToAssign.sort(function(a,b){return b.total - a.total;});
  var assignments = [];
  unitsToAssign.forEach(function(u){
    var best = working[0];
    working.forEach(function(id){ if(totals[id] < totals[best]) best = id; });
    u.jobs.forEach(function(j){
      assignments.push({jobId: j.id, crewId: best, leg: j._isPickup ? 'pickup' : 'dropoff'});
    });
    totals[best] += u.total;
  });
  // Build per-job aggregated update (covers swap pairs that touch both legs)
  var perJob = {};
  assignments.forEach(function(a){
    if(!perJob[a.jobId]) perJob[a.jobId] = {};
    perJob[a.jobId][a.leg === 'pickup' ? 'pickup_crew_id' : 'dropoff_crew_id'] = a.crewId;
  });
  for(var jid in perJob){
    var u2 = perJob[jid];
    var local = _dispatchJobsCache.find(function(j){return j.id===jid;});
    var dropC = (u2.dropoff_crew_id !== undefined) ? u2.dropoff_crew_id : (local ? local.dropoffCrewId : null);
    var pickC = (u2.pickup_crew_id  !== undefined) ? u2.pickup_crew_id  : (local ? local.pickupCrewId  : null);
    var union = [];
    if(dropC) union.push(dropC);
    if(pickC && union.indexOf(pickC) < 0) union.push(pickC);
    u2.assigned_crew_ids = union;
    await db.from('jobs').update(u2).eq('job_id', jid);
  }
  if(typeof refreshDashJobs==='function') refreshDashJobs();
  if(typeof renderLiveJobs==='function') renderLiveJobs();
  toast((mode==='all'?'Re-balanced ':'Filled ')+assignments.length+' assignment(s) across '+working.length+' driver(s).');
  renderDispatch();
}
function dispatchOnDragStart(ev, jobId, leg){
  ev.dataTransfer.setData('text/plain', JSON.stringify({jobId:jobId, leg:leg}));
  ev.currentTarget.style.opacity = '0.4';
}
function dispatchOnDragEnd(ev){ ev.currentTarget.style.opacity = '1'; }
function dispatchOnDragOver(ev){ ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; }
function dispatchOnDrop(ev, crewId){
  ev.preventDefault();
  var raw = ev.dataTransfer.getData('text/plain');
  if(!raw) return;
  try {
    var data = JSON.parse(raw);
    if(data && data.jobId) dispatchAssignJob(data.jobId, crewId, data.leg);
  } catch(e){ console.error('drop parse error:', e); }
}
var _dispatchMenu = null; // open Assign/Move menu key (jobId:leg) — only one at a time
function dispatchToggleCardMenu(key){
  _dispatchMenu = (_dispatchMenu === key) ? null : key;
  renderDispatch();
}
// Tappable stop card: PICKUP/DROP pill, 🔁 combo ribbon, ~Nm, customer, and an
// Assign/Move ▾ menu whose options call the existing dispatchAssignJob. Drag-to-assign
// is preserved as a bonus.
function dispatchRenderCard(j, clockStartMins){
  var isPickup = !!j._isPickup;
  var leg = isPickup ? 'pickup' : 'dropoff';
  var legLabel = isPickup ? 'PICKUP' : 'DROP';
  var legBg = isPickup ? '#0d6efd' : '#eab308';
  var comboCol = j._comboColor || '#22c55e';
  var working = dispatchGetWorkingIds();
  var assigned = isPickup ? (j.pickupCrewId||'') : (j.dropoffCrewId||'');
  var key = j.id + ':' + leg;
  var menuOpen = (_dispatchMenu === key);
  var sub = [];
  if(j.city) sub.push(escHtml(j.city));
  var tm = (!isPickup && j.binDropoffTime) ? ft(j.binDropoffTime) : '';
  if(tm) sub.push(tm);
  var opts = '';
  working.forEach(function(id){
    var c = crewMembers.find(function(cm){return cm.id===id;}); if(!c) return;
    var col = c.color || crewAvatarColor(c.id);
    opts += '<button onclick="event.stopPropagation();dispatchAssignJob(\''+j.id+'\',\''+id+'\',\''+leg+'\')" style="display:flex;width:100%;align-items:center;gap:8px;min-height:42px;padding:0 13px;border:none;border-bottom:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;'+(assigned===id?'font-weight:800;':'font-weight:600;')+'cursor:pointer;font-family:inherit;text-align:left"><span style="width:9px;height:9px;border-radius:50%;flex:none;background:'+col+'"></span>'+escHtml(c.name)+(assigned===id?' ✓':'')+'</button>';
  });
  if(assigned) opts += '<button onclick="event.stopPropagation();dispatchAssignJob(\''+j.id+'\',\'\',\''+leg+'\')" style="display:block;width:100%;min-height:40px;padding:0 13px;border:none;background:var(--surface);font-size:13px;color:var(--muted);cursor:pointer;font-family:inherit;text-align:left">↩ Unassign</button>';
  if(!opts) opts = '<div style="padding:12px 13px;font-size:12px;color:var(--muted)">No drivers working — toggle one above.</div>';
  var menu = menuOpen ? '<div style="position:absolute;left:10px;right:10px;z-index:6;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,.18);overflow:hidden;margin-top:5px">'+opts+'</div>' : '';
  var cardBorder = j._partnerId ? 'border:1px solid '+comboCol+'66;border-left:4px solid '+comboCol : 'border:1px solid var(--border);border-left:4px solid '+legBg;
  var cardBg = j._partnerId ? comboCol+'14' : 'var(--surface)';
  var clockTxt = (typeof clockStartMins === 'number') ? '<div style="font-size:10px;color:#16a34a;font-weight:700;margin-bottom:5px">'+dispatchFmtClock(clockStartMins)+'&ndash;'+dispatchFmtClock(clockStartMins + j._estMinutes)+'</div>' : '';
  return '<div draggable="true" ondragstart="dispatchOnDragStart(event,\''+j.id+'\',\''+leg+'\')" ondragend="dispatchOnDragEnd(event)" style="position:relative;background:'+cardBg+';'+cardBorder+';border-radius:11px;padding:11px 12px;margin-bottom:8px;box-shadow:0 1px 2px rgba(0,0,0,.04);cursor:grab">'
    +'<div style="display:flex;align-items:center;gap:7px;margin-bottom:7px">'
      +'<span style="font-size:10px;font-weight:800;color:#fff;background:'+legBg+';padding:2px 8px;border-radius:5px;letter-spacing:.3px">'+legLabel+'</span>'
      +(j._partnerId?'<span style="font-size:10.5px;font-weight:700;color:#15803d;background:rgba(34,197,94,.12);padding:2px 7px;border-radius:5px">🔁 Combo</span>':'')
      +'<span style="margin-left:auto;font-size:11.5px;color:var(--muted);font-weight:600">~'+j._estMinutes+'m</span>'
    +'</div>'
    +clockTxt
    +'<div style="font-size:13.5px;font-weight:700;color:var(--text)">'+escHtml(j.name||'—')+' <span style="font-size:11px;color:var(--muted);font-weight:500">#'+j.id+'</span></div>'
    +'<div style="font-size:12px;color:var(--muted);margin-bottom:9px">'+(sub.length?sub.join(' &middot; '):'&mdash;')+'</div>'
    +'<button onclick="event.stopPropagation();dispatchToggleCardMenu(\''+key+'\')" style="width:100%;min-height:40px;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">'+(assigned?'Move &#9662;':'👤 Assign &#9662;')+'</button>'
    +menu
  +'</div>';
}
// Google Maps directions URL through every stop in a lane, in dispatch order.
// Origin is omitted so Maps starts from the driver's current location; the last
// stop is the destination and the rest become ordered waypoints.
function dispatchMapsRouteUrl(orderedJobs){
  var stops = (orderedJobs||[]).map(function(j){ return ((j.address||'')+(j.city?', '+j.city:'')).trim(); }).filter(function(a){return a;});
  if(!stops.length) return null;
  var dest = encodeURIComponent(stops[stops.length-1]);
  var url = 'https://www.google.com/maps/dir/?api=1&destination='+dest+'&travelmode=driving';
  var way = stops.slice(0,-1);
  // Google caps the free directions URL at 9 waypoints (+ destination = 10 stops)
  if(way.length > 9) way = way.slice(0, 9);
  if(way.length) url += '&waypoints='+way.map(encodeURIComponent).join('%7C');
  return url;
}

async function renderDispatch(){
  var host = document.getElementById('view-dispatch');
  if(!host) return;
  if(!Object.keys(_dispatchCityTimes).length) await dispatchLoadCityTimes();
  if(!_dispatchDate) _dispatchDate = todayStr();
  var workingIds = dispatchGetWorkingIds();
  var todayJobs = await dispatchLoadJobs(_dispatchDate);
  _dispatchJobsCache = todayJobs;
  _dispatchGeofences = await dispatchLoadGeofences(todayJobs.map(function(j){return j.id;}));
  todayJobs.forEach(function(j){
    j._isPickup = (j.binPickup === _dispatchDate);
    j._isDelivery = (j.binDropoff === _dispatchDate && !j._isPickup);
    var g = _dispatchGeofences[j.id];
    if(g){
      if(g.drive_minutes_from_yard != null) j._driveMins = g.drive_minutes_from_yard;
      if(g.lat != null && g.lng != null){ j._lat = g.lat; j._lng = g.lng; }
    }
  });
  // Any driver who already has a stop assigned for this date is, by definition, working
  // today — auto-toggle them on (and persist) so the toggle row, lanes, and the assign
  // menu all show them without the user having to click them on manually.
  (function(){
    var changed = false;
    todayJobs.forEach(function(j){
      var c = j._isPickup ? j.pickupCrewId : j.dropoffCrewId;
      if(c && workingIds.indexOf(c) < 0){ workingIds.push(c); changed = true; }
    });
    if(changed) dispatchSetWorkingIds(workingIds);
  })();
  var swapPartner = dispatchFindSwaps(todayJobs);
  todayJobs.forEach(function(j){
    var partnerId = swapPartner[j.id];
    var kind = partnerId ? (j._isPickup?'swap-pickup':'swap-delivery') : (j._isPickup?'standalone-pickup':'standalone-delivery');
    j._kind = kind;
    j._partnerId = partnerId || null;
    j._estMinutes = dispatchEstimateMinutes(j, kind);
  });
  // Give each combo pair a shared color so the two linked cards are obvious.
  var comboPalette = ['#22c55e','#0ea5e9','#a855f7','#f97316','#ec4899','#14b8a6','#eab308'];
  var _ci = 0, _seenPair = {};
  todayJobs.forEach(function(j){
    if(j._partnerId && !_seenPair[j.id]){
      var col = comboPalette[_ci++ % comboPalette.length];
      j._comboColor = col;
      var p = todayJobs.find(function(x){return x.id===j._partnerId;});
      if(p) p._comboColor = col;
      _seenPair[j.id] = true; _seenPair[j._partnerId] = true;
    }
  });
  var laneSet = {};
  workingIds.forEach(function(id){ laneSet[id] = true; });
  todayJobs.forEach(function(j){ var c = j._isPickup ? j.pickupCrewId : j.dropoffCrewId; if(c) laneSet[c]=true; });
  var laneIds = Object.keys(laneSet);
  var byLane = {}; laneIds.forEach(function(id){ byLane[id]=[]; });
  var unassigned = [];
  todayJobs.forEach(function(j){
    var c = j._isPickup ? j.pickupCrewId : j.dropoffCrewId;
    if(c && byLane[c]) byLane[c].push(j); else unassigned.push(j);
  });
  var totalMins = todayJobs.reduce(function(s,j){return s+(j._estMinutes||0);},0);
  var swapPairs = Object.keys(swapPartner).length / 2;
  var _vm = dispatchGetViewMode();
  if(_vm === 'canvas'){
    // Full-page canvas: all controls live inside the board (dcvMount builds them)
    host.innerHTML = '<div id="dcv-host"></div>';
    dcvMount();
    dispatchFillUnknownDriveTimes();
    dispatchFillMissingCoords();
    return;
  }
  var html = '<div class="page-header">';
  html += '<div><div class="page-title page-title-sm">Dispatch &mdash; '+fd(_dispatchDate)+'</div>';
  html += '<div class="page-sub" data-tour="dispatch-summary">'+todayJobs.length+' bin jobs &middot; est '+dispatchFmtTotal(totalMins)+(swapPairs?' &middot; '+swapPairs+' combo pair'+(swapPairs>1?'s':'')+' found':'')+'</div></div>';
  html += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">';
  // Connected date stepper
  html += '<div style="display:inline-flex;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">';
  html += '<button onclick="dispatchShiftDate(-1)" title="Previous day" style="background:transparent;border:0;padding:8px 14px;color:var(--text);cursor:pointer;font-size:18px;line-height:1;border-right:1px solid var(--border);font-family:inherit">&lsaquo;</button>';
  html += '<input type="date" value="'+_dispatchDate+'" onchange="_dispatchDate=this.value;renderDispatch()" style="background:transparent;border:0;color:var(--text);padding:8px 14px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;min-width:140px;text-align:center">';
  html += '<button onclick="dispatchShiftDate(1)" title="Next day" style="background:transparent;border:0;padding:8px 14px;color:var(--text);cursor:pointer;font-size:18px;line-height:1;border-left:1px solid var(--border);font-family:inherit">&rsaquo;</button>';
  html += '</div>';
  // Today button (always shown)
  html += '<button onclick="_dispatchDate=null;renderDispatch()" style="background:transparent;border:1px solid var(--border);color:var(--text);padding:8px 14px;border-radius:10px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer">Today</button>';
  // Canvas / List view toggle
  html += '<div style="display:inline-flex;background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">';
  html += '<button onclick="dispatchSetViewMode(\'canvas\')" style="border:0;padding:8px 14px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;background:'+(_vm==='canvas'?'#1a1a2e':'transparent')+';color:'+(_vm==='canvas'?'#fff':'var(--text)')+'">Canvas</button>';
  html += '<button onclick="dispatchSetViewMode(\'list\')" style="border:0;border-left:1px solid var(--border);padding:8px 14px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;background:'+(_vm==='list'?'#1a1a2e':'transparent')+';color:'+(_vm==='list'?'#fff':'var(--text)')+'">List</button>';
  html += '</div>';
  // Balance routes (primary action, icon, pushed to right via margin-left:auto)
  html += '<div style="display:inline-flex;gap:8px;margin-left:auto">';
  html += '<button data-tour="dispatch-fill" onclick="dispatchBalanceRoutes(\'fill\')" title="Assign only the jobs that have no driver yet — keeps your manual assignments" style="background:#22c55e;color:#fff;border:0;padding:8px 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit">';
  html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>';
  html += 'Fill unassigned';
  html += '</button>';
  html += '<button onclick="dispatchBalanceRoutes(\'all\')" title="Clear everything and re-balance all jobs from scratch" style="background:transparent;border:1px solid var(--border);color:var(--text);padding:8px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Re-balance all</button>';
  html += '</div>';
  html += '</div></div>';
  // Numbered steps + P/D legend
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;font-size:12px;color:var(--muted)">';
  html += '<span style="background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:3px 10px"><strong style="color:var(--text)">1.</strong> Pick a date</span>';
  html += '<span style="color:var(--border)">&rsaquo;</span>';
  html += '<span style="background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:3px 10px"><strong style="color:var(--text)">2.</strong> Pick who&rsquo;s working</span>';
  html += '<span style="color:var(--border)">&rsaquo;</span>';
  html += '<span style="background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:3px 10px"><strong style="color:var(--text)">3.</strong> Assign each stop</span>';
  html += '<span style="margin-left:6px"><span style="display:inline-flex;width:16px;height:16px;border-radius:4px;background:rgba(13,110,253,.18);color:#0d6efd;font-size:10px;font-weight:700;align-items:center;justify-content:center;vertical-align:-3px">P</span> = pickup &nbsp; <span style="display:inline-flex;width:16px;height:16px;border-radius:4px;background:rgba(234,179,8,.18);color:#eab308;font-size:10px;font-weight:700;align-items:center;justify-content:center;vertical-align:-3px">D</span> = delivery &nbsp;&middot;&nbsp; times are rough estimates</span>';
  html += '</div>';
  html += '<div data-tour="dispatch-combo-info" style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px">';
  html += '<div style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#22c55e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;font-family:Georgia,serif">i</div>';
  html += '<div style="font-size:13px;line-height:1.5;color:var(--text)">';
  html += '<span style="display:inline-block;font-size:10px;font-weight:700;color:#22c55e;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);padding:1px 6px;border-radius:4px;margin-right:6px;vertical-align:1px">COMBO</span>';
  html += '<strong>= one trip handles both a pickup and a delivery.</strong> The empty bin coming out of the dump goes straight to the next customer instead of returning to the yard. Saves ~6&ndash;10 min per pair. The system flags pickup/delivery pairs within 10 min of each other &mdash; keep both legs on the same driver to capture the savings.';
  html += '</div></div>';
  html += '<div data-tour="dispatch-working" style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Working today &mdash; click to toggle</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
  if(!crewMembers.length){
    html += '<div style="font-size:13px;color:var(--muted);font-style:italic">No crew members yet.</div>';
  } else {
    crewMembers.forEach(function(c){
      var on = workingIds.indexOf(c.id) >= 0;
      var color = c.color || crewAvatarColor(c.id);
      var bg = on ? color+'22' : 'var(--surface)';
      var fg = on ? color : 'var(--text)';
      // Flag crew who are booked off / partly booked on the dispatch date
      var cst = (typeof crewStatusForDate==='function') ? crewStatusForDate(c.id, _dispatchDate) : {state:'free',label:''};
      var lbl = (cst.label||'').replace(/"/g,'&quot;');
      var offTag = cst.state==='off' ? ' <span style="font-size:11px" title="Booked off '+fd(_dispatchDate)+': '+lbl+'">🚫</span>'
                 : cst.state==='partial' ? ' <span style="font-size:11px" title="Partly booked '+fd(_dispatchDate)+': '+lbl+'">⏱</span>' : '';
      html += '<button onclick="dispatchToggleWorking(\''+c.id+'\')" title="'+(cst.state!=='free'?lbl:'Available')+'" style="border:1px solid '+color+';background:'+bg+';color:'+fg+';padding:6px 12px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">'+(on?'&#10003; ':'')+c.name+offTag+'</button>';
    });
  }
  html += '</div></div>';
  html += '<div data-tour="dispatch-unassigned" ondragover="dispatchOnDragOver(event)" ondrop="dispatchOnDrop(event, null)" style="background:var(--surface2);border:1px dashed var(--border);border-radius:10px;padding:10px 12px;margin-bottom:14px;min-height:60px">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Unassigned ('+unassigned.length+')</div>';
  if(!unassigned.length){
    html += '<div style="font-size:13px;color:var(--muted);font-style:italic">No unassigned jobs. Drag a card here to unassign.</div>';
  } else {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:9px">';
    dispatchGroupCombos(unassigned).forEach(function(j){ html += dispatchRenderCard(j); });
    html += '</div>';
  }
  html += '</div>';
  if(laneIds.length){
    html += '<div data-tour="dispatch-lanes" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">';
    laneIds.forEach(function(id){
      var crew = crewMembers.find(function(c){return c.id===id;});
      if(!crew) return;
      var laneJobs = byLane[id] || [];
      var laneTotal = laneJobs.reduce(function(s,j){return s+(j._estMinutes||0);},0);
      var color = crew.color || crewAvatarColor(crew.id);
      var startTime = dispatchGetLaneStart(id);
      var startMins = dispatchParseClock(startTime) || 480;
      var ord = laneJobs.length ? dispatchOrderLaneJobs(laneJobs) : null;
      var routeUrl = ord ? dispatchMapsRouteUrl(ord.jobs) : null;
      var _pct = Math.min(Math.round(laneTotal/480*100),100);
      var _barCol = _pct<60?'#22c55e':(_pct<90?'#f59e0b':'#dc3545');
      var _noteCol = _pct>=90?'#dc3545':(_pct>=60?'#c2410c':'#15803d');
      var _note = laneTotal ? (_pct+'% of an 8-hr day') : 'Empty &mdash; add stops';
      html += '<div ondragover="dispatchOnDragOver(event)" ondrop="dispatchOnDrop(event, \''+id+'\')" style="background:var(--surface);border:1px solid var(--border);border-radius:13px;overflow:hidden;min-height:120px">';
      // lane header: avatar + name/count + load bar
      html += '<div style="padding:12px 13px;border-bottom:1px solid var(--border)">';
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">';
      html += (typeof teamAvatar==='function') ? teamAvatar(crew.name, color, 34)
        : '<div style="width:34px;height:34px;border-radius:50%;background:'+color+';color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;flex:none">'+(crew.name||'?').trim().charAt(0).toUpperCase()+'</div>';
      html += '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14.5px;color:var(--text)">'+escHtml(crew.name)+'</div><div style="font-size:11px;color:var(--muted)">'+laneJobs.length+' stop'+(laneJobs.length===1?'':'s')+' &middot; starts '+dispatchFmtClock(startMins)+'</div></div>';
      html += '<span style="font-size:13px;font-weight:700;color:'+_noteCol+';white-space:nowrap">'+dispatchFmtTotal(laneTotal)+'</span>';
      html += '</div>';
      html += '<div style="height:8px;border-radius:5px;background:var(--surface2);overflow:hidden;margin-bottom:5px"><div style="height:100%;width:'+_pct+'%;background:'+_barCol+';border-radius:5px"></div></div>';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><span style="font-size:11px;font-weight:600;color:'+_noteCol+'">'+_note+'</span><span style="display:inline-flex;align-items:center;gap:8px">';
      html += '<span style="font-size:10px;color:var(--muted);display:inline-flex;align-items:center;gap:5px">Start <input type="time" value="'+startTime+'" onchange="dispatchSetLaneStart(\''+id+'\', this.value)" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:3px 6px;border-radius:4px;font-size:11px;font-family:inherit"></span>';
      if(routeUrl) html += '<a href="'+routeUrl+'" target="_blank" rel="noopener" title="Open this driver\'s stops in order in Google Maps" style="font-size:11px;font-weight:600;color:#0d6efd;background:rgba(13,110,253,.08);border:1px solid rgba(13,110,253,.35);border-radius:6px;padding:3px 8px;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;gap:4px">'+lineIcon('directions',13)+' Maps</a>';
      html += '</span></div>';
      html += '</div>';
      // lane body: stops
      html += '<div style="padding:11px">';
      if(!laneJobs.length){
        html += '<div style="font-size:12.5px;color:var(--muted);text-align:center;padding:16px;font-style:italic">No stops yet &mdash; assign one above.</div>';
      } else {
        var warns = ord.warnings;
        var clock = startMins;
        ord.jobs.forEach(function(j){
          if(j._isDelivery && j.binDropoffTime){
            var ft2 = dispatchParseClock(j.binDropoffTime);
            if(clock > ft2 + 5) warns.push('May miss '+ft(j.binDropoffTime)+' drop');
            clock = Math.max(clock, ft2);
          }
          html += dispatchRenderCard(j, clock);
          clock += j._estMinutes;
        });
        if(warns.length){
          html += '<div style="margin-top:6px;font-size:11px;color:#d97706;background:#f59e0b18;border:1px solid #f59e0b55;border-radius:6px;padding:4px 8px;line-height:1.4">&#9888; '+warns.join('; ')+'</div>';
        }
      }
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:30px;color:var(--muted);font-size:14px">Pick at least one driver above to start dispatching.</div>';
  }
  host.innerHTML = html;
  dispatchFillUnknownDriveTimes();
  dispatchFillMissingCoords();
}

// ═══════════════════ CANVAS VIEW (v408) ═══════════════════
// Node-canvas redesign of the dispatch board ("Canvas Redesign Options" design).
// Jobs are dark ticket-stub cards, crew are capacity cards; dragging the ○ port
// from a job onto a crew card assigns that leg through the existing
// dispatchAssignJob (same DB writes as the List view). Pan by dragging empty
// canvas, wheel to zoom, click a card for the inspector. The List view is the
// old board, one toggle away.

function dispatchGetViewMode(){
  return localStorage.getItem('dispatch_view') === 'list' ? 'list' : 'canvas';
}
function dispatchSetViewMode(m){
  localStorage.setItem('dispatch_view', m);
  renderDispatch();
}

var DCV_JOB_W = 250, DCV_CREW_W = 228;
var DCV_THEMES = {
  forest:  {name:'Forest',  canvas:'#0b1710', surface:'#12241a', border:'#1e3a29', ink:'#e6f3ea', sub:'#8bab97', chip:'#12241a', chipbd:'#20402d', track:'#183021', dot:'rgba(52,209,127,.11)',  stub:'linear-gradient(160deg,#34d17f,#0b6b34)', stubtext:'#04160c', accent:'#34d17f'},
  steel:   {name:'Steel',   canvas:'#141a23', surface:'#1d2431', border:'#2b3547', ink:'#e5ebf3', sub:'#93a1b5', chip:'#1a2130', chipbd:'#2f3b4f', track:'#212a3a', dot:'rgba(160,180,210,.10)', stub:'linear-gradient(160deg,#22c55e,#12833f)', stubtext:'#ffffff', accent:'#22c55e'},
  obsidian:{name:'Obsidian',canvas:'#08090b', surface:'#131417', border:'#23252b', ink:'#f4f5f7', sub:'#8d9096', chip:'#141519', chipbd:'#26282f', track:'#1b1d22', dot:'rgba(47,229,127,.08)',  stub:'linear-gradient(160deg,#2fe57f,#0f9a4f)', stubtext:'#04160c', accent:'#2fe57f'}
};
var _dcv = {
  view: {tx:60, ty:40, scale:1},
  posByDate: {},
  fitByDate: {},
  theme: localStorage.getItem('dispatch_canvas_theme') || 'forest',
  selId: null,
  played: false,
  suppressEdges: false,
  drag: null,
  els: null
};
function dcvTheme(){ return DCV_THEMES[_dcv.theme] || DCV_THEMES.forest; }
function dcvSetTheme(key){
  if(!DCV_THEMES[key]) return;
  _dcv.theme = key;
  localStorage.setItem('dispatch_canvas_theme', key);
  renderDispatch();
}
function dcvRgba(hex, a){
  var h = (hex||'#22c55e').replace('#','');
  if(h.length === 3) h = h.split('').map(function(c){return c+c;}).join('');
  var n = parseInt(h, 16);
  return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';
}
function dcvInitials(name){
  var p = (name||'?').trim().split(/\s+/);
  return (p[0].charAt(0) + (p[1]?p[1].charAt(0):'')).toUpperCase();
}
function dcvJobById(jobId){
  return _dispatchJobsCache.find(function(j){ return String(j.id) === String(jobId); });
}
function dcvLegOf(jobId){
  var j = dcvJobById(jobId);
  return (j && j._isPickup) ? 'pickup' : 'dropoff';
}
function dcvJobCrewId(j){ return j._isPickup ? (j.pickupCrewId||'') : (j.dropoffCrewId||''); }
// Crew shown on the canvas: everyone toggled "working today" plus anyone who
// already has a stop assigned on this date (mirrors the board's lane logic).
function dcvCrewNodes(){
  var set = {};
  dispatchGetWorkingIds().forEach(function(id){ set[id] = true; });
  _dispatchJobsCache.forEach(function(j){ var c = dcvJobCrewId(j); if(c) set[c] = true; });
  return crewMembers.filter(function(c){ return set[c.id]; });
}
// Seed positions once per date (combo pairs placed adjacent), then leave them
// alone so user drags survive every re-render. Missing nodes just get seeded.
function dcvPositions(){
  var key = _dispatchDate || 'd';
  if(!_dcv.posByDate[key]) _dcv.posByDate[key] = {};
  var pos = _dcv.posByDate[key];
  var order = dispatchGroupCombos(_dispatchJobsCache.slice());
  var perCol = 5;
  var cols = Math.max(1, Math.ceil(order.length/perCol));
  order.forEach(function(j, i){
    var k = 'j:'+j.id;
    if(pos[k]) return;
    pos[k] = {x: 40 + Math.floor(i/perCol)*292, y: 40 + (i%perCol)*128};
  });
  var crewX = 40 + cols*292 + 120;
  dcvCrewNodes().forEach(function(c, i){
    var k = 'c:'+c.id;
    if(pos[k]) return;
    pos[k] = {x: crewX, y: 40 + i*206};
  });
  return pos;
}
function dcvNodeEl(key){
  if(!_dcv.els || !_dcv.els.world) return null;
  return _dcv.els.world.querySelector('[data-node="'+key+'"]');
}

// ---------- card builders (theme colors baked in; rebuilt on every render) ----------
function dcvJobCardHtml(j, T, p, selected){
  var num = parseInt(j.binSize, 10);
  var numTxt = isNaN(num) ? 'BIN' : String(num);
  var isSwap = !!j._partnerId;
  var svc = isSwap ? 'Swap' : (j._isPickup ? 'Pickup' : 'Drop');
  var svcCol = isSwap ? T.accent : (j._isPickup ? '#60a5fa' : '#eab308');
  var win = (!j._isPickup && j.binDropoffTime) ? dispatchFmtClock(dispatchParseClock(j.binDropoffTime)) : '~'+(j._estMinutes||0)+'m';
  var outline = selected ? 'outline:2px solid '+T.accent+';outline-offset:2px;' : '';
  var h = '<div data-node="j:'+j.id+'" style="position:absolute;top:0;left:0;width:'+DCV_JOB_W+'px;cursor:grab;transform:translate('+p.x+'px,'+p.y+'px)">';
  h += '<div data-card style="'+outline+'background:'+T.surface+';border:1px solid '+T.border+';border-radius:12px;box-shadow:0 8px 22px rgba(0,0,0,.4);overflow:hidden;display:flex;position:relative">';
  h += '<div style="width:62px;flex:0 0 auto;background:'+T.stub+';display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 4px">';
  h += '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:'+(isNaN(num)?'21':'30')+'px;line-height:.8;letter-spacing:.5px;color:'+T.stubtext+'">'+numTxt+'</div>';
  if(!isNaN(num)) h += '<div style="font-size:8px;font-weight:800;letter-spacing:2px;color:'+T.stubtext+';opacity:.9">YD</div>';
  h += '</div>';
  h += '<div style="width:0;flex:0 0 auto;border-left:2px dashed '+T.border+';margin:7px 0"></div>';
  h += '<div style="flex:1;min-width:0;padding:8px 12px">';
  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">';
  h += '<span style="font-family:ui-monospace,monospace;font-size:9px;font-weight:700;letter-spacing:.4px;color:'+T.sub+'">#'+j.id+'</span>';
  h += '<span style="width:4px;height:4px;border-radius:50%;background:'+svcCol+';flex:0 0 auto"></span>';
  h += '<span style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:'+svcCol+'">'+svc+'</span>';
  if(isSwap) h += '<span title="Combo pair" style="font-size:9px">🔁</span>';
  h += '<span style="margin-left:auto;font-size:10px;color:'+T.sub+';font-family:ui-monospace,monospace">'+win+'</span>';
  h += '</div>';
  h += '<div style="font-size:16px;font-weight:800;letter-spacing:-.3px;color:'+T.ink+';line-height:1.06;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(j.city||'—')+'</div>';
  h += '<div style="display:flex;align-items:center;gap:4px;margin-top:1px">';
  h += '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="'+T.sub+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;opacity:.75"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  h += '<span style="font-size:11px;color:'+T.sub+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml((j.address||'—')+(j.name?' · '+j.name:''))+'</span>';
  h += '</div></div></div>';
  h += '<div data-port="out" data-node="j:'+j.id+'" title="Drag onto a crew card to assign" style="position:absolute;right:-8px;top:38px;width:15px;height:15px;border-radius:50%;background:'+T.surface+';border:2.5px solid '+T.accent+';cursor:crosshair;box-shadow:0 0 0 3px '+dcvRgba(T.accent,0.16)+'"></div>';
  h += '</div>';
  return h;
}
function dcvCrewCardHtml(c, T, p, selected){
  var col = c.color || crewAvatarColor(c.id);
  var laneJobs = _dispatchJobsCache.filter(function(j){ return dcvJobCrewId(j) === c.id; });
  var total = laneJobs.reduce(function(s,j){ return s+(j._estMinutes||0); }, 0);
  var pct = Math.min(Math.round(total/480*100), 100);
  var barCol = pct < 60 ? '#22c55e' : (pct < 90 ? '#f59e0b' : '#dc3545');
  var startMins = dispatchParseClock(dispatchGetLaneStart(c.id)) || 480;
  var outline = selected ? 'outline:2px solid '+T.accent+';outline-offset:2px;' : '';
  var h = '<div data-node="c:'+c.id+'" style="position:absolute;top:0;left:0;width:'+DCV_CREW_W+'px;cursor:grab;transform:translate('+p.x+'px,'+p.y+'px)">';
  h += '<div data-card style="'+outline+'background:'+T.surface+';border:1px solid '+T.border+';border-radius:15px;box-shadow:0 8px 26px rgba(0,0,0,.35);overflow:hidden">';
  h += '<div style="height:4px;background:'+col+'"></div>';
  h += '<div style="display:flex;align-items:center;gap:12px;padding:13px 14px">';
  h += '<span style="width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex:0 0 auto;background:'+col+';box-shadow:0 2px 7px rgba(0,0,0,.22)">'+escHtml(dcvInitials(c.name))+'</span>';
  h += '<div style="min-width:0;flex:1">';
  h += '<div style="font-size:15.5px;font-weight:800;letter-spacing:-.2px;color:'+T.ink+';line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(c.name)+'</div>';
  h += '<div style="font-size:11px;color:'+T.sub+';margin-top:2px">starts '+dispatchFmtClock(startMins)+'</div>';
  h += '</div>';
  h += '<span style="width:10px;height:10px;border-radius:50%;flex:0 0 auto;background:'+col+'"></span>';
  h += '</div>';
  h += '<div style="padding:0 14px 13px">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">';
  h += '<span style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:'+T.sub+'">Today\'s load</span>';
  h += '<span style="font-size:11px;color:'+T.sub+';font-family:ui-monospace,monospace"><span style="color:'+T.accent+';font-weight:800">'+laneJobs.length+'</span> stop'+(laneJobs.length===1?'':'s')+' · '+dispatchFmtTotal(total)+'</span>';
  h += '</div>';
  h += '<div style="height:8px;background:'+T.track+';border-radius:6px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+barCol+';border-radius:6px;transition:width .4s cubic-bezier(.4,0,.2,1)"></div></div>';
  h += '</div></div>';
  h += '<div data-port="in" data-node="c:'+c.id+'" style="position:absolute;left:-8px;top:32px;width:15px;height:15px;border-radius:50%;background:'+T.surface+';border:2.5px solid '+T.accent+';box-shadow:0 0 0 3px '+dcvRgba(T.accent,0.14)+'"></div>';
  h += '</div>';
  return h;
}

// ---------- mount ----------
function dcvMount(){
  var hostEl = document.getElementById('dcv-host');
  if(!hostEl) return;
  var T = dcvTheme();
  var pos = dcvPositions();
  var crewNodes = dcvCrewNodes();
  // Drop a stale selection (node gone after date change / data reload)
  if(_dcv.selId){
    var sid = _dcv.selId;
    var alive = sid.indexOf('j:') === 0 ? !!dcvJobById(sid.slice(2))
      : crewNodes.some(function(c){ return 'c:'+c.id === sid; });
    if(!alive) _dcv.selId = null;
  }
  _dcv.suppressEdges = false;
  _dcv.drag = null;
  var unassignedCount = _dispatchJobsCache.filter(function(j){ return !dcvJobCrewId(j); }).length;
  // Full-page shell: fixed beside the sidebar; on mobile it sits below the 56px top bar
  if(!document.getElementById('dcv-style')){
    var st = document.createElement('style');
    st.id = 'dcv-style';
    st.textContent = '#dcv-shell{position:fixed;top:0;right:0;bottom:0;left:var(--sidebar-w,0px);z-index:140;display:flex;flex-direction:column}'
      + '@media(max-width:900px){#dcv-shell{top:56px}}';
    document.head.appendChild(st);
  }
  var totalMins = _dispatchJobsCache.reduce(function(s,j){ return s+(j._estMinutes||0); }, 0);
  var comboPairs = _dispatchJobsCache.filter(function(j){ return j._partnerId; }).length/2;
  var workingIds = dispatchGetWorkingIds();
  var h = '<div id="dcv-shell" style="background:'+T.canvas+'">';
  // top bar — the old page-header controls, themed and moved inside
  h += '<div style="flex:0 0 auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 16px;background:'+T.surface+';border-bottom:1px solid '+T.border+'">';
  h += '<div style="line-height:1.15;margin-right:4px"><div style="font-size:15px;font-weight:800;color:'+T.ink+';letter-spacing:-.2px">Dispatch</div>';
  h += '<div style="font-size:10.5px;color:'+T.sub+'">'+_dispatchJobsCache.length+' bin jobs · est '+dispatchFmtTotal(totalMins)+(comboPairs?' · '+comboPairs+' combo pair'+(comboPairs>1?'s':''):'')+'</div></div>';
  h += '<div style="display:inline-flex;align-items:center;border:1px solid '+T.border+';border-radius:10px;overflow:hidden">';
  h += '<button onclick="dispatchShiftDate(-1)" title="Previous day" style="background:transparent;border:0;padding:7px 12px;color:'+T.ink+';cursor:pointer;font-size:17px;line-height:1;border-right:1px solid '+T.border+';font-family:inherit">&lsaquo;</button>';
  h += '<input type="date" value="'+(_dispatchDate||todayStr())+'" onchange="_dispatchDate=this.value;renderDispatch()" style="background:transparent;border:0;color:'+T.ink+';color-scheme:dark;padding:7px 10px;font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;min-width:130px;text-align:center">';
  h += '<button onclick="dispatchShiftDate(1)" title="Next day" style="background:transparent;border:0;padding:7px 12px;color:'+T.ink+';cursor:pointer;font-size:17px;line-height:1;border-left:1px solid '+T.border+';font-family:inherit">&rsaquo;</button>';
  h += '</div>';
  h += '<button onclick="_dispatchDate=null;renderDispatch()" style="background:transparent;border:1px solid '+T.border+';color:'+T.ink+';padding:7px 13px;border-radius:10px;font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer">Today</button>';
  h += '<div style="display:inline-flex;border:1px solid '+T.border+';border-radius:10px;overflow:hidden">';
  h += '<button onclick="dispatchSetViewMode(\'canvas\')" style="border:0;padding:7px 13px;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;background:'+T.accent+';color:#04160c">Canvas</button>';
  h += '<button onclick="dispatchSetViewMode(\'list\')" style="border:0;border-left:1px solid '+T.border+';padding:7px 13px;font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;background:transparent;color:'+T.ink+'">List</button>';
  h += '</div>';
  h += '<div style="display:inline-flex;gap:8px;margin-left:auto">';
  h += '<button onclick="dispatchBalanceRoutes(\'fill\')" title="Assign only the jobs that have no driver yet — keeps your manual assignments" style="background:#22c55e;color:#fff;border:0;padding:7px 15px;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Fill unassigned</button>';
  h += '<button onclick="dispatchBalanceRoutes(\'all\')" title="Clear everything and re-balance all jobs from scratch" style="background:transparent;border:1px solid '+T.border+';color:'+T.ink+';padding:7px 13px;border-radius:10px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit">Re-balance all</button>';
  h += '</div>';
  h += '</div>';
  // crew strip — the old "Working today" toggles, themed and moved inside
  h += '<div style="flex:0 0 auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 16px;background:'+T.chip+';border-bottom:1px solid '+T.border+'">';
  h += '<span style="font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:'+T.sub+'">Working today</span>';
  if(!crewMembers.length){
    h += '<span style="font-size:12px;color:'+T.sub+';font-style:italic">No crew members yet.</span>';
  } else {
    crewMembers.forEach(function(c){
      var on = workingIds.indexOf(c.id) >= 0;
      var color = c.color || crewAvatarColor(c.id);
      var cst = (typeof crewStatusForDate==='function') ? crewStatusForDate(c.id, _dispatchDate) : {state:'free', label:''};
      var lbl = (cst.label||'').replace(/"/g,'&quot;');
      var offTag = cst.state==='off' ? ' <span style="font-size:10px" title="Booked off: '+lbl+'">🚫</span>'
                 : cst.state==='partial' ? ' <span style="font-size:10px" title="Partly booked: '+lbl+'">⏱</span>' : '';
      h += '<button onclick="dispatchToggleWorking(\''+c.id+'\')" title="'+(cst.state!=='free'?lbl:'Available')+'" style="border:1px solid '+(on?color:T.chipbd)+';background:'+(on?dcvRgba(color,0.16):'transparent')+';color:'+(on?color:T.sub)+';padding:5px 11px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">'+(on?'&#10003; ':'')+escHtml(c.name)+offTag+'</button>';
    });
  }
  h += '</div>';
  // stage
  h += '<div id="dcv-vp" style="position:relative;flex:1;min-height:0;overflow:hidden;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;background-color:'+T.canvas+'">';
  h += '<div id="dcv-world" style="position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform">';
  h += '<svg id="dcv-svg" style="position:absolute;top:0;left:0;overflow:visible;pointer-events:none"></svg>';
  _dispatchJobsCache.forEach(function(j){ h += dcvJobCardHtml(j, T, pos['j:'+j.id], _dcv.selId === 'j:'+j.id); });
  crewNodes.forEach(function(c){ h += dcvCrewCardHtml(c, T, pos['c:'+c.id], _dcv.selId === 'c:'+c.id); });
  h += '</div>';
  // in-canvas header: date + legend chips
  function chip(inner){ return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:'+T.sub+';background:'+T.chip+';border:1px solid '+T.chipbd+';border-radius:99px;padding:3px 9px">'+inner+'</span>'; }
  h += '<div style="position:absolute;top:16px;left:18px;z-index:20;pointer-events:none">';
  h += '<div style="display:flex;gap:7px;flex-wrap:wrap;max-width:460px">';
  h += chip('<span style="width:8px;height:8px;border-radius:50%;background:#60a5fa"></span>Pickup');
  h += chip('<span style="width:8px;height:8px;border-radius:50%;background:#eab308"></span>Drop');
  h += chip('<span style="width:8px;height:8px;border-radius:50%;background:'+T.accent+'"></span>Swap = combo pair');
  if(unassignedCount) h += chip('<span style="width:8px;height:8px;border-radius:50%;background:#f59e0b"></span>'+unassignedCount+' unassigned');
  h += chip('drag ○ from a job onto a crew card to assign');
  h += '</div></div>';
  // empty-state hint
  if(!_dispatchJobsCache.length || !crewNodes.length){
    var msg = !_dispatchJobsCache.length ? 'No bin jobs on this date.' : 'No drivers yet — toggle who\'s working above.';
    h += '<div style="position:absolute;left:50%;bottom:24px;transform:translateX(-50%);z-index:20;pointer-events:none;background:'+T.chip+';border:1px solid '+T.chipbd+';color:'+T.sub+';font-size:12.5px;font-weight:600;border-radius:99px;padding:8px 16px;white-space:nowrap">'+msg+'</div>';
  }
  // inspector shell
  h += '<div id="dcv-insp" data-dcv-ui style="position:absolute;top:14px;right:14px;bottom:14px;width:300px;background:#fff;border:1px solid #e9ecef;border-radius:16px;box-shadow:0 20px 50px rgba(26,26,46,.14);transform:translateX(340px);transition:transform .3s cubic-bezier(.16,1,.3,1);z-index:70;display:flex;flex-direction:column;overflow:hidden;color:#1a1a2e">'+dcvInspectorHtml()+'</div>';
  // zoom dock
  h += '<div data-dcv-ui style="position:absolute;left:16px;bottom:16px;z-index:60;display:flex;align-items:center;gap:4px;background:#fff;border:1px solid #e9ecef;border-radius:12px;padding:5px;box-shadow:0 8px 24px rgba(26,26,46,.1)">';
  h += '<button onclick="dcvZoomBy(0.87)" style="width:32px;height:32px;border-radius:8px;border:none;background:transparent;color:#495057;cursor:pointer;font-size:19px;line-height:1;display:flex;align-items:center;justify-content:center">−</button>';
  h += '<span id="dcv-zoom" style="min-width:48px;text-align:center;font-size:12px;font-weight:700;color:#1a1a2e;font-family:ui-monospace,monospace">100%</span>';
  h += '<button onclick="dcvZoomBy(1.15)" style="width:32px;height:32px;border-radius:8px;border:none;background:transparent;color:#495057;cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center">+</button>';
  h += '<span style="width:1px;height:20px;background:#e9ecef;margin:0 3px"></span>';
  h += '<button onclick="dcvFit()" title="Fit everything in view" style="height:32px;padding:0 11px;border-radius:8px;border:none;background:transparent;color:#495057;cursor:pointer;font-size:11.5px;font-weight:700;font-family:inherit">Fit</button>';
  h += '<button onclick="dcvReset()" title="Back to 100%" style="height:32px;padding:0 11px;border-radius:8px;border:none;background:transparent;color:#495057;cursor:pointer;font-size:11.5px;font-weight:700;font-family:inherit">Reset</button>';
  h += '</div>';
  // theme swatches
  h += '<div data-dcv-ui style="position:absolute;right:16px;bottom:16px;z-index:60;display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e9ecef;border-radius:12px;padding:6px 10px;box-shadow:0 8px 24px rgba(26,26,46,.1)">';
  h += '<span style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#adb5bd">Look</span>';
  ['forest','steel','obsidian'].forEach(function(key){
    var t = DCV_THEMES[key], active = (_dcv.theme === key);
    h += '<button onclick="dcvSetTheme(\''+key+'\')" title="'+t.name+'" style="width:25px;height:25px;border-radius:7px;border:1px solid '+(active?t.accent:'#d4d8dd')+';'+(active?'box-shadow:0 0 0 2px '+t.accent+';':'')+'background:'+t.canvas+';cursor:pointer;padding:0;position:relative;overflow:hidden"><span style="position:absolute;left:4px;right:4px;bottom:4px;height:7px;border-radius:2px;background:'+t.accent+'"></span></button>';
  });
  h += '<span style="font-size:11.5px;font-weight:700;color:#495057;min-width:56px">'+T.name+'</span>';
  h += '</div>';
  h += '</div>'; // /stage
  h += '</div>'; // /shell
  hostEl.innerHTML = h;
  _dcv.els = {
    vp: document.getElementById('dcv-vp'),
    world: document.getElementById('dcv-world'),
    svg: document.getElementById('dcv-svg'),
    insp: document.getElementById('dcv-insp'),
    zoom: document.getElementById('dcv-zoom')
  };
  _dcv.els.vp.addEventListener('pointerdown', dcvDown);
  _dcv.els.vp.addEventListener('wheel', dcvWheel, {passive:false});
  var dateKey = _dispatchDate || 'd';
  if(!_dcv.fitByDate[dateKey] && _dispatchJobsCache.length){
    _dcv.fitByDate[dateKey] = true;
    dcvFit();
  } else {
    dcvApplyView();
  }
  dcvUpdateZoomLabel();
  dcvSyncInspector();
  if(!_dcv.played) dcvAnimateIn();
  else dcvDrawEdges();
}
// ---------- view transform / edges ----------
function dcvApplyView(){
  var e = _dcv.els;
  if(!e || !e.world) return;
  var v = _dcv.view, T = dcvTheme();
  e.world.style.transform = 'translate('+v.tx+'px,'+v.ty+'px) scale('+v.scale+')';
  var size = 26*v.scale;
  e.vp.style.backgroundImage = 'radial-gradient('+T.dot+' 1px, transparent 1px)';
  e.vp.style.backgroundSize = size+'px '+size+'px';
  e.vp.style.backgroundPosition = v.tx+'px '+v.ty+'px';
}
function dcvAnchor(key, side){
  var pos = _dcv.posByDate[_dispatchDate || 'd'];
  var p = pos && pos[key];
  if(!p) return null;
  if(side === 'out') return {x: p.x + DCV_JOB_W - 0.5, y: p.y + 45.5};
  return {x: p.x - 0.5, y: p.y + 39.5};
}
function dcvPathD(a, b){
  var dx = Math.max(40, Math.abs(b.x-a.x)*0.5);
  return 'M '+a.x+' '+a.y+' C '+(a.x+dx)+' '+a.y+', '+(b.x-dx)+' '+b.y+', '+b.x+' '+b.y;
}
function dcvDrawEdges(){
  var svg = _dcv.els && _dcv.els.svg;
  if(!svg) return;
  if(_dcv.suppressEdges){ svg.innerHTML = ''; return; }
  var col = dcvTheme().accent;
  var inner = '';
  _dispatchJobsCache.forEach(function(j){
    var cid = dcvJobCrewId(j);
    if(!cid) return;
    var a = dcvAnchor('j:'+j.id, 'out'), b = dcvAnchor('c:'+cid, 'in');
    if(!a || !b) return;
    inner += '<path d="'+dcvPathD(a,b)+'" fill="none" stroke="'+col+'" stroke-width="2.2" stroke-linecap="round" opacity="0.95"/>';
    inner += '<circle cx="'+a.x+'" cy="'+a.y+'" r="3.4" fill="'+col+'"/><circle cx="'+b.x+'" cy="'+b.y+'" r="3.4" fill="'+col+'"/>';
  });
  if(_dcv.drag && _dcv.drag.type === 'conn'){
    var a2 = dcvAnchor(_dcv.drag.from, 'out'), b2 = _dcv.drag.cur;
    if(a2 && b2) inner += '<path d="'+dcvPathD(a2,b2)+'" fill="none" stroke="'+col+'" stroke-width="2.2" stroke-dasharray="6 5" opacity="0.9"/><circle cx="'+b2.x+'" cy="'+b2.y+'" r="4" fill="'+col+'"/>';
  }
  svg.innerHTML = inner;
}

// ---------- pointer ----------
function dcvDown(e){
  if(e.button != null && e.button !== 0) return;
  var vp = _dcv.els && _dcv.els.vp;
  if(!vp) return;
  if(e.target.closest('[data-dcv-ui]')) return; // inspector / dock / swatches
  var rect = vp.getBoundingClientRect();
  _dcv.rect = rect;
  var v = _dcv.view;
  var port = e.target.closest('[data-port="out"]');
  var nodeEl = e.target.closest('[data-node]');
  if(port){
    _dcv.drag = {type:'conn', from:port.getAttribute('data-node'), cur:{x:(e.clientX-rect.left-v.tx)/v.scale, y:(e.clientY-rect.top-v.ty)/v.scale}, moved:0};
  } else if(nodeEl){
    _dcv.drag = {type:'node', id:nodeEl.getAttribute('data-node'), el:nodeEl, lastX:e.clientX, lastY:e.clientY, moved:0};
    nodeEl.style.zIndex = '30';
  } else {
    _dcv.drag = {type:'pan', lastX:e.clientX, lastY:e.clientY, moved:0};
    vp.style.cursor = 'grabbing';
  }
  window.addEventListener('pointermove', dcvMove);
  window.addEventListener('pointerup', dcvUp);
  e.preventDefault();
}
function dcvMove(e){
  var d = _dcv.drag;
  if(!d) return;
  var v = _dcv.view;
  if(d.type === 'pan'){
    var dx = e.clientX-d.lastX, dy = e.clientY-d.lastY;
    v.tx += dx; v.ty += dy;
    d.lastX = e.clientX; d.lastY = e.clientY;
    d.moved += Math.abs(dx)+Math.abs(dy);
    dcvApplyView();
  } else if(d.type === 'node'){
    var ndx = (e.clientX-d.lastX)/v.scale, ndy = (e.clientY-d.lastY)/v.scale;
    var pos = _dcv.posByDate[_dispatchDate || 'd'];
    var p = pos && pos[d.id];
    if(p){
      p.x += ndx; p.y += ndy;
      if(d.el) d.el.style.transform = 'translate('+p.x+'px,'+p.y+'px)';
    }
    d.lastX = e.clientX; d.lastY = e.clientY;
    d.moved += Math.abs(ndx)+Math.abs(ndy);
    dcvDrawEdges();
  } else if(d.type === 'conn'){
    d.cur = {x:(e.clientX-_dcv.rect.left-v.tx)/v.scale, y:(e.clientY-_dcv.rect.top-v.ty)/v.scale};
    d.moved += 1;
    dcvDrawEdges();
  }
}
function dcvUp(e){
  var d = _dcv.drag;
  _dcv.drag = null;
  window.removeEventListener('pointermove', dcvMove);
  window.removeEventListener('pointerup', dcvUp);
  var vp = _dcv.els && _dcv.els.vp;
  if(vp) vp.style.cursor = 'grab';
  if(!d) return;
  if(d.type === 'node'){
    if(d.el) d.el.style.zIndex = '';
    if(d.moved < 4) dcvSelect(d.id);
  } else if(d.type === 'conn'){
    var t = document.elementFromPoint(e.clientX, e.clientY);
    var tn = t && t.closest('[data-node]');
    if(tn && tn.getAttribute('data-node').indexOf('c:') === 0){
      dispatchAssignJob(d.from.slice(2), tn.getAttribute('data-node').slice(2), dcvLegOf(d.from.slice(2)));
    } else if(d.moved < 4){
      dcvSelect(d.from);
    }
    dcvDrawEdges();
  }
}
function dcvWheel(e){
  var vp = _dcv.els && _dcv.els.vp;
  if(!vp) return;
  e.preventDefault();
  var rect = vp.getBoundingClientRect();
  var v = _dcv.view;
  var f = e.deltaY < 0 ? 1.12 : 0.89;
  var cx = e.clientX-rect.left, cy = e.clientY-rect.top;
  var wx = (cx-v.tx)/v.scale, wy = (cy-v.ty)/v.scale;
  v.scale = Math.max(0.4, Math.min(2, v.scale*f));
  v.tx = cx-wx*v.scale; v.ty = cy-wy*v.scale;
  dcvApplyView(); dcvUpdateZoomLabel();
}

// ---------- zoom / fit ----------
function dcvUpdateZoomLabel(){
  if(_dcv.els && _dcv.els.zoom) _dcv.els.zoom.textContent = Math.round(_dcv.view.scale*100)+'%';
}
function dcvZoomBy(f){
  var vp = _dcv.els && _dcv.els.vp;
  if(!vp) return;
  var rect = vp.getBoundingClientRect();
  var v = _dcv.view;
  var cx = rect.width/2, cy = rect.height/2;
  var wx = (cx-v.tx)/v.scale, wy = (cy-v.ty)/v.scale;
  v.scale = Math.max(0.4, Math.min(2, v.scale*f));
  v.tx = cx-wx*v.scale; v.ty = cy-wy*v.scale;
  dcvApplyView(); dcvUpdateZoomLabel();
}
function dcvFit(){
  var e = _dcv.els;
  if(!e || !e.vp) return;
  var pos = dcvPositions();
  var keys = Object.keys(pos).filter(function(k){ return !!dcvNodeEl(k); });
  if(!keys.length){ dcvApplyView(); return; }
  var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  keys.forEach(function(k){
    var el = dcvNodeEl(k), p = pos[k];
    var w = el.offsetWidth || 220, hh = el.offsetHeight || 100;
    if(p.x < minx) minx = p.x;
    if(p.y < miny) miny = p.y;
    if(p.x+w > maxx) maxx = p.x+w;
    if(p.y+hh > maxy) maxy = p.y+hh;
  });
  var rect = e.vp.getBoundingClientRect(), pad = 70;
  var s = Math.max(0.4, Math.min(1.4, Math.min((rect.width-pad*2)/(maxx-minx), (rect.height-pad*2)/(maxy-miny))));
  var v = _dcv.view;
  v.scale = s;
  v.tx = (rect.width-(maxx-minx)*s)/2 - minx*s;
  v.ty = (rect.height-(maxy-miny)*s)/2 - miny*s;
  dcvApplyView(); dcvUpdateZoomLabel();
}
function dcvReset(){
  _dcv.view = {tx:60, ty:40, scale:1};
  dcvApplyView(); dcvUpdateZoomLabel();
}

// ---------- selection / inspector ----------
function dcvSelect(id){
  _dcv.selId = id;
  var T = dcvTheme();
  var world = _dcv.els && _dcv.els.world;
  if(world){
    [].slice.call(world.querySelectorAll('[data-node]')).forEach(function(el){
      var card = el.querySelector('[data-card]');
      if(!card) return;
      if(el.getAttribute('data-node') === id){ card.style.outline = '2px solid '+T.accent; card.style.outlineOffset = '2px'; }
      else card.style.outline = 'none';
    });
  }
  dcvSyncInspector();
}
function dcvCloseInspector(){
  _dcv.selId = null;
  var world = _dcv.els && _dcv.els.world;
  if(world) [].slice.call(world.querySelectorAll('[data-card]')).forEach(function(card){ card.style.outline = 'none'; });
  dcvSyncInspector();
}
function dcvSyncInspector(){
  var insp = _dcv.els && _dcv.els.insp;
  if(!insp) return;
  if(_dcv.selId){
    insp.innerHTML = dcvInspectorHtml();
    insp.style.transform = 'translateX(0)';
  } else {
    insp.style.transform = 'translateX(340px)';
  }
}
function dcvFocusSel(){
  var id = _dcv.selId;
  if(!id) return;
  var pos = _dcv.posByDate[_dispatchDate || 'd'];
  var p = pos && pos[id];
  var vp = _dcv.els && _dcv.els.vp;
  if(!p || !vp) return;
  var el = dcvNodeEl(id);
  var w = (el && el.offsetWidth) || 220, hh = (el && el.offsetHeight) || 100;
  var rect = vp.getBoundingClientRect();
  var v = _dcv.view;
  if(v.scale < 1) v.scale = 1;
  v.tx = rect.width/2 - (p.x+w/2)*v.scale;
  v.ty = rect.height/2 - (p.y+hh/2)*v.scale;
  dcvApplyView(); dcvUpdateZoomLabel();
}
function dcvUnassignSel(){
  var id = _dcv.selId;
  if(!id || id.indexOf('j:') !== 0) return;
  var jid = id.slice(2);
  dispatchAssignJob(jid, '', dcvLegOf(jid));
}
function dcvInspectorHtml(){
  var id = _dcv.selId;
  if(!id) return '';
  function head(dotCol, label){
    return '<div style="display:flex;align-items:center;gap:10px;padding:15px 16px;border-bottom:1px solid #eef0f2;flex:0 0 auto">'
      +'<span style="width:11px;height:11px;border-radius:4px;background:'+dotCol+';flex:0 0 auto"></span>'
      +'<span style="font-size:10.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#868e96">'+label+'</span>'
      +'<button onclick="dcvCloseInspector()" style="margin-left:auto;width:26px;height:26px;border-radius:8px;border:1px solid #e9ecef;background:#f8f9fa;color:#868e96;cursor:pointer;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center">×</button></div>';
  }
  function row(k, v){
    return '<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #f1f3f5">'
      +'<span style="font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#adb5bd;flex:0 0 90px">'+k+'</span>'
      +'<span style="font-size:13px;color:#343a40;font-weight:600;min-width:0">'+v+'</span></div>';
  }
  var h = '';
  if(id.indexOf('j:') === 0){
    var j = dcvJobById(id.slice(2));
    if(!j) return '';
    var isSwap = !!j._partnerId;
    var svc = isSwap ? 'Swap (combo)' : (j._isPickup ? 'Pickup' : 'Drop');
    var svcCol = isSwap ? dcvTheme().accent : (j._isPickup ? '#60a5fa' : '#eab308');
    var cid = dcvJobCrewId(j);
    var cr = cid && crewMembers.find(function(c){ return c.id === cid; });
    var partner = j._partnerId ? dcvJobById(j._partnerId) : null;
    h += head(svcCol, 'Job · Bin rental');
    h += '<div style="padding:16px;overflow-y:auto;flex:1">';
    h += '<div style="font-size:19px;font-weight:800;color:#1a1a2e;letter-spacing:-.3px;margin-bottom:3px">'+escHtml(j.name||'—')+' <span style="font-size:12px;color:#adb5bd;font-weight:600">#'+j.id+'</span></div>';
    h += '<div style="font-size:12.5px;color:#868e96;margin-bottom:16px">'+escHtml((j.address||'—')+(j.city?', '+j.city:''))+'</div>';
    h += row('Type', escHtml(svc));
    h += row('Bin size', escHtml(j.binSize||'—'));
    h += row('Window', (!j._isPickup && j.binDropoffTime) ? dispatchFmtClock(dispatchParseClock(j.binDropoffTime)) : 'Flexible');
    h += row('Est. time', '~'+(j._estMinutes||0)+'m');
    if(partner) h += row('Combo with', escHtml(partner.name||('#'+partner.id)));
    h += row('Driver', cr ? escHtml(cr.name) : '<span style="color:#d97706">Unassigned — drag its ○ onto a crew card</span>');
    h += '<div style="display:flex;gap:8px;margin-top:18px">';
    h += '<button onclick="dcvFocusSel()" style="flex:1;padding:10px;border-radius:10px;border:1px solid #e9ecef;background:#f8f9fa;color:#343a40;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer">Focus</button>';
    if(cid) h += '<button onclick="dcvUnassignSel()" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(220,53,69,.3);background:rgba(220,53,69,.07);color:#dc3545;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer">Unassign</button>';
    h += '</div></div>';
    return h;
  }
  var c = crewMembers.find(function(x){ return x.id === id.slice(2); });
  if(!c) return '';
  var col = c.color || crewAvatarColor(c.id);
  var laneJobs = _dispatchJobsCache.filter(function(x){ return dcvJobCrewId(x) === c.id; });
  var total = laneJobs.reduce(function(s,x){ return s+(x._estMinutes||0); }, 0);
  var startTime = dispatchGetLaneStart(c.id);
  var startMins = dispatchParseClock(startTime) || 480;
  var ord = laneJobs.length ? dispatchOrderLaneJobs(laneJobs) : {jobs:[], warnings:[]};
  var routeUrl = laneJobs.length ? dispatchMapsRouteUrl(ord.jobs) : null;
  h += head(col, 'Crew member');
  h += '<div style="padding:16px;overflow-y:auto;flex:1">';
  h += '<div style="font-size:19px;font-weight:800;color:#1a1a2e;letter-spacing:-.3px;margin-bottom:3px">'+escHtml(c.name)+'</div>';
  h += '<div style="font-size:12.5px;color:#868e96;margin-bottom:16px">'+laneJobs.length+' stop'+(laneJobs.length===1?'':'s')+' · '+dispatchFmtTotal(total)+' est</div>';
  h += row('Starts', '<input type="time" value="'+startTime+'" onchange="dispatchSetLaneStart(\''+c.id+'\', this.value)" style="background:#f8f9fa;border:1px solid #e9ecef;color:#343a40;padding:4px 8px;border-radius:6px;font-size:12px;font-family:inherit">');
  h += '<div style="font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#adb5bd;margin:14px 0 2px">Route — in order</div>';
  if(!ord.jobs.length){
    h += '<div style="font-size:12.5px;color:#868e96;font-style:italic;padding:10px 0">No stops yet — drag a job\'s ○ onto this card.</div>';
  } else {
    var warns = ord.warnings.slice();
    var clock = startMins;
    ord.jobs.forEach(function(x){
      if(x._isDelivery && x.binDropoffTime){
        var ft2 = dispatchParseClock(x.binDropoffTime);
        if(clock > ft2 + 5) warns.push('May miss '+ft(x.binDropoffTime)+' drop');
        clock = Math.max(clock, ft2);
      }
      var legBg = x._isPickup ? '#0d6efd' : '#eab308';
      h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f1f3f5">';
      h += '<span style="font-family:ui-monospace,monospace;font-size:10.5px;color:#868e96;flex:0 0 100px">'+dispatchFmtClock(clock)+'–'+dispatchFmtClock(clock + (x._estMinutes||0))+'</span>';
      h += '<span style="font-size:12.5px;font-weight:600;color:#343a40;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(x.name||x.city||'—')+'</span>';
      h += '<span style="font-size:9px;font-weight:800;color:#fff;background:'+legBg+';padding:2px 6px;border-radius:4px;flex:0 0 auto">'+(x._isPickup?'PICKUP':'DROP')+'</span>';
      h += '</div>';
      clock += (x._estMinutes||0);
    });
    if(warns.length) h += '<div style="margin-top:8px;font-size:11px;color:#d97706;background:#f59e0b18;border:1px solid #f59e0b55;border-radius:6px;padding:4px 8px;line-height:1.4">&#9888; '+warns.join('; ')+'</div>';
  }
  h += '<div style="display:flex;gap:8px;margin-top:18px">';
  h += '<button onclick="dcvFocusSel()" style="flex:1;padding:10px;border-radius:10px;border:1px solid #e9ecef;background:#f8f9fa;color:#343a40;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer">Focus</button>';
  if(routeUrl) h += '<a href="'+routeUrl+'" target="_blank" rel="noopener" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(13,110,253,.35);background:rgba(13,110,253,.08);color:#0d6efd;font-size:12.5px;font-weight:700;text-align:center;text-decoration:none">Open in Maps</a>';
  h += '</div></div>';
  return h;
}

// ---------- intro animation (plays once per visit, like the design's Generate) ----------
function dcvAnimateIn(){
  _dcv.played = true;
  var world = _dcv.els && _dcv.els.world;
  if(!world) return;
  _dcv.suppressEdges = true;
  if(_dcv.els.svg) _dcv.els.svg.innerHTML = '';
  var nodes = [].slice.call(world.querySelectorAll('[data-node]')).filter(function(el){ return !!el.querySelector('[data-card]'); });
  if(!nodes.length){ _dcv.suppressEdges = false; dcvDrawEdges(); return; }
  var stagger = Math.min(120, Math.max(45, Math.floor(1700/nodes.length)));
  var variants = [
    [{opacity:0, transform:'translateY(22px) scale(.95)'}, {opacity:1, transform:'none'}],
    [{opacity:0, transform:'translateX(-28px) scale(.97)'}, {opacity:1, transform:'none'}],
    [{opacity:0, transform:'scale(.78)'}, {opacity:1, transform:'scale(1.04)'}, {opacity:1, transform:'scale(1)'}],
    [{opacity:0, transform:'translateY(-20px) scale(.96)'}, {opacity:1, transform:'none'}]
  ];
  nodes.forEach(function(el){
    var card = el.querySelector('[data-card]');
    if(card) card.style.opacity = '0';
    var port = el.querySelector('[data-port]');
    if(port) port.style.transform = 'scale(0)';
  });
  nodes.forEach(function(el, idx){
    setTimeout(function(){
      var card = el.querySelector('[data-card]');
      if(card){
        card.style.opacity = '1';
        try{ card.animate(variants[idx % variants.length], {duration:440, easing:'cubic-bezier(.16,1,.3,1)', fill:'both'}); }catch(err){}
      }
      var port = el.querySelector('[data-port]');
      if(port){
        setTimeout(function(){
          port.style.transform = 'scale(1)';
          try{ port.animate([{transform:'scale(0)'},{transform:'scale(1.3)'},{transform:'scale(1)'}], {duration:360, easing:'cubic-bezier(.16,1,.3,1)', fill:'both'}); }catch(err){}
        }, 220);
      }
    }, idx*stagger);
  });
  setTimeout(function(){
    _dcv.suppressEdges = false;
    dcvDrawEdges();
    var svg = _dcv.els && _dcv.els.svg;
    if(!svg) return;
    [].slice.call(svg.querySelectorAll('path')).forEach(function(pth, i){
      var len = 600;
      try{ len = pth.getTotalLength(); }catch(err){}
      pth.style.strokeDasharray = len;
      pth.style.strokeDashoffset = len;
      try{ pth.animate([{strokeDashoffset:len},{strokeDashoffset:0}], {duration:520, delay:i*90, easing:'cubic-bezier(.4,0,.2,1)', fill:'forwards'}); }catch(err){ pth.style.strokeDashoffset = 0; }
    });
    [].slice.call(svg.querySelectorAll('circle')).forEach(function(cc, i){
      cc.style.opacity = '0';
      try{ cc.animate([{opacity:0},{opacity:1}], {duration:260, delay:140+i*40, fill:'forwards'}); }catch(err){ cc.style.opacity = '1'; }
    });
  }, nodes.length*stagger + 320);
}
