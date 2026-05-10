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
function dispatchFindSwaps(jobsList){
  var pickups = jobsList.filter(function(j){return j._isPickup;});
  var deliveries = jobsList.filter(function(j){return j._isDelivery;});
  var partner = {};
  var used = {};
  pickups.forEach(function(p){
    if(partner[p.id]) return;
    var pm = dispatchJobMins(p);
    for(var i=0; i<deliveries.length; i++){
      var d = deliveries[i];
      if(used[d.id] || partner[d.id]) continue;
      if(Math.abs(pm - dispatchJobMins(d)) <= 10){
        partner[p.id] = d.id;
        partner[d.id] = p.id;
        used[d.id] = true;
        break;
      }
    }
  });
  return partner;
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
async function dispatchBalanceRoutes(){
  var working = dispatchGetWorkingIds();
  if(!working.length){ toast('Pick at least one driver first.'); return; }
  if(!confirm('Auto-balance today\'s bin jobs across '+working.length+' driver(s)? Existing assignments will be overwritten.')) return;
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
  units.sort(function(a,b){return b.total - a.total;});
  var totals = {}; working.forEach(function(id){ totals[id]=0; });
  var assignments = [];
  units.forEach(function(u){
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
  toast('Balanced '+assignments.length+' assignments across '+working.length+' driver(s).');
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
function dispatchRenderCard(j, clockStartMins){
  var leg = j._isPickup ? 'pickup' : 'dropoff';
  var pinTxt = j._isPickup ? 'P' : 'D';
  var pinBg  = j._isPickup ? 'rgba(13,110,253,.18)' : 'rgba(234,179,8,.18)';
  var pinFg  = j._isPickup ? '#0d6efd' : '#eab308';
  var swapBadge = j._partnerId ? '<span style="display:inline-block;font-size:10px;font-weight:700;color:#22c55e;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);padding:1px 5px;border-radius:4px;margin-left:4px">COMBO</span>' : '';
  var working = dispatchGetWorkingIds();
  var assigned = j._isPickup ? (j.pickupCrewId||'') : (j.dropoffCrewId||'');
  var optsHtml = '<option value="">— Unassigned</option>';
  working.forEach(function(id){
    var c = crewMembers.find(function(cm){return cm.id===id;});
    if(!c) return;
    optsHtml += '<option value="'+id+'"'+(assigned===id?' selected':'')+'>'+c.name+'</option>';
  });
  if(assigned && working.indexOf(assigned)<0){
    var ac = crewMembers.find(function(cm){return cm.id===assigned;});
    if(ac) optsHtml += '<option value="'+assigned+'" selected>'+ac.name+' (not working today)</option>';
  }
  var clockTxt = '';
  if(typeof clockStartMins === 'number'){
    var endMins = clockStartMins + j._estMinutes;
    clockTxt = '<div style="font-size:10px;color:#22c55e;font-weight:700;margin-bottom:4px">'+dispatchFmtClock(clockStartMins)+'–'+dispatchFmtClock(endMins)+'</div>';
  }
  var card = '<div draggable="true" ondragstart="dispatchOnDragStart(event,\''+j.id+'\',\''+leg+'\')" ondragend="dispatchOnDragEnd(event)" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:6px;cursor:grab">';
  card += clockTxt;
  card += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
  card += '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;background:'+pinBg+';color:'+pinFg+';font-size:11px;font-weight:700">'+pinTxt+'</span>';
  card += '<span style="font-weight:700">'+j.id+'</span>'+swapBadge;
  card += '<span style="margin-left:auto;font-weight:600;color:var(--muted)">+'+j._estMinutes+'m</span>';
  card += '</div>';
  card += '<div style="font-size:11px;color:var(--muted);margin-bottom:6px">'+(j.name||'—')+' &middot; '+(j.city||'—')+'</div>';
  card += '<select onchange="dispatchAssignJob(\''+j.id+'\', this.value, \''+leg+'\')" onclick="event.stopPropagation()" style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 6px;border-radius:6px;font-size:11px">'+optsHtml+'</select>';
  card += '</div>';
  return card;
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
    if(g && g.drive_minutes_from_yard != null) j._driveMins = g.drive_minutes_from_yard;
  });
  var swapPartner = dispatchFindSwaps(todayJobs);
  todayJobs.forEach(function(j){
    var partnerId = swapPartner[j.id];
    var kind = partnerId ? (j._isPickup?'swap-pickup':'swap-delivery') : (j._isPickup?'standalone-pickup':'standalone-delivery');
    j._kind = kind;
    j._partnerId = partnerId || null;
    j._estMinutes = dispatchEstimateMinutes(j, kind);
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
  var html = '<div class="page-header">';
  html += '<div><div class="page-title page-title-sm">Dispatch &mdash; '+fd(_dispatchDate)+'</div>';
  html += '<div class="page-sub">'+todayJobs.length+' bin jobs &middot; est '+dispatchFmtTotal(totalMins)+(swapPairs?' &middot; '+swapPairs+' combo pair'+(swapPairs>1?'s':'')+' found':'')+'</div></div>';
  html += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">';
  // Connected date stepper
  html += '<div style="display:inline-flex;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">';
  html += '<button onclick="dispatchShiftDate(-1)" title="Previous day" style="background:transparent;border:0;padding:8px 14px;color:var(--text);cursor:pointer;font-size:18px;line-height:1;border-right:1px solid var(--border);font-family:inherit">&lsaquo;</button>';
  html += '<input type="date" value="'+_dispatchDate+'" onchange="_dispatchDate=this.value;renderDispatch()" style="background:transparent;border:0;color:var(--text);padding:8px 14px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;min-width:140px;text-align:center">';
  html += '<button onclick="dispatchShiftDate(1)" title="Next day" style="background:transparent;border:0;padding:8px 14px;color:var(--text);cursor:pointer;font-size:18px;line-height:1;border-left:1px solid var(--border);font-family:inherit">&rsaquo;</button>';
  html += '</div>';
  // Today button (always shown)
  html += '<button onclick="_dispatchDate=null;renderDispatch()" style="background:transparent;border:1px solid var(--border);color:var(--text);padding:8px 14px;border-radius:10px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer">Today</button>';
  // Balance routes (primary action, icon, pushed to right via margin-left:auto)
  html += '<button onclick="dispatchBalanceRoutes()" style="background:#22c55e;color:#fff;border:0;padding:8px 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin-left:auto;font-family:inherit">';
  html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>';
  html += 'Balance routes';
  html += '</button>';
  html += '</div></div>';
  html += '<div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px">';
  html += '<div style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#22c55e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;font-family:Georgia,serif">i</div>';
  html += '<div style="font-size:13px;line-height:1.5;color:var(--text)">';
  html += '<span style="display:inline-block;font-size:10px;font-weight:700;color:#22c55e;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);padding:1px 6px;border-radius:4px;margin-right:6px;vertical-align:1px">COMBO</span>';
  html += '<strong>= one trip handles both a pickup and a delivery.</strong> The empty bin coming out of the dump goes straight to the next customer instead of returning to the yard. Saves ~6&ndash;10 min per pair. The system flags pickup/delivery pairs within 10 min of each other &mdash; keep both legs on the same driver to capture the savings.';
  html += '</div></div>';
  html += '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px">';
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
      html += '<button onclick="dispatchToggleWorking(\''+c.id+'\')" style="border:1px solid '+color+';background:'+bg+';color:'+fg+';padding:6px 12px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">'+(on?'&#10003; ':'')+c.name+'</button>';
    });
  }
  html += '</div></div>';
  html += '<div ondragover="dispatchOnDragOver(event)" ondrop="dispatchOnDrop(event, null)" style="background:var(--surface2);border:1px dashed var(--border);border-radius:10px;padding:10px 12px;margin-bottom:14px;min-height:60px">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Unassigned ('+unassigned.length+')</div>';
  if(!unassigned.length){
    html += '<div style="font-size:13px;color:var(--muted);font-style:italic">No unassigned jobs. Drag a card here to unassign.</div>';
  } else {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">';
    unassigned.forEach(function(j){ html += dispatchRenderCard(j); });
    html += '</div>';
  }
  html += '</div>';
  if(laneIds.length){
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">';
    laneIds.forEach(function(id){
      var crew = crewMembers.find(function(c){return c.id===id;});
      if(!crew) return;
      var laneJobs = byLane[id] || [];
      var laneTotal = laneJobs.reduce(function(s,j){return s+(j._estMinutes||0);},0);
      var color = crew.color || crewAvatarColor(crew.id);
      var startTime = dispatchGetLaneStart(id);
      var startMins = dispatchParseClock(startTime) || 480;
      html += '<div ondragover="dispatchOnDragOver(event)" ondrop="dispatchOnDrop(event, \''+id+'\')" style="background:var(--surface);border:1px solid var(--border);border-top:3px solid '+color+';border-radius:10px;padding:10px 10px 8px;min-height:120px">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px">';
      html += '<div style="font-weight:700;font-size:14px;color:'+color+'">'+crew.name+'</div>';
      html += '<div style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(34,197,94,.12);color:#22c55e;white-space:nowrap">'+dispatchFmtTotal(laneTotal)+'</div>';
      html += '</div>';
      html += '<div style="font-size:10px;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:6px">Start <input type="time" value="'+startTime+'" onchange="dispatchSetLaneStart(\''+id+'\', this.value)" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:2px 6px;border-radius:4px;font-size:11px;font-family:inherit"></div>';
      if(!laneJobs.length){
        html += '<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px;font-style:italic">No jobs assigned. Drag here.</div>';
      } else {
        var clock = startMins;
        laneJobs.forEach(function(j){
          html += dispatchRenderCard(j, clock);
          clock += j._estMinutes;
        });
      }
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:30px;color:var(--muted);font-size:14px">Pick at least one driver above to start dispatching.</div>';
  }
  host.innerHTML = html;
  dispatchFillUnknownDriveTimes();
}
