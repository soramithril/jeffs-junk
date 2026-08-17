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
    _dispatchCityIndex = {};
    Object.keys(_dispatchCityTimes).forEach(function(name){ _dispatchCityIndex[_dispatchCityNorm(name)] = name; });
  }
}
// Town matching is forgiving: case/space-insensitive, en-dashes unified, and a
// trailing " Township" is dropped ("Ramara Township" → "Ramara"). The alias map
// points hamlets the office types at the table row that covers them (Minesing is
// in Springwater, Shanty Bay is in Oro, …). A town that still doesn't resolve is
// flagged on its card (⚠) instead of silently getting the 20-minute guess.
var _dispatchCityIndex = {};
var DISPATCH_CITY_ALIASES = {
  'essa':'Angus', 'minesing':'Springwater', 'shanty bay':'Oro',
  'horseshoe valley':'Oro-Medonte', 'clearview':'Stayner',
  'adjala-tosorontio':'Alliston', 'adjala':'Alliston',
  'blue mountain':'The Blue Mountains', 'blue mountains':'The Blue Mountains',
  'georgian bay':'Georgian Bay Township'
};
function _dispatchCityNorm(s){
  return String(s||'').toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
}
// Resolves a typed town to its drive-time table row name, or null when unknown.
function dispatchCityResolve(city){
  var n = _dispatchCityNorm(city);
  if(!n) return null;
  var stripped = n.replace(/\s+(township|twp\.?)$/,'');
  var cands = [n, stripped,
    DISPATCH_CITY_ALIASES[n] ? _dispatchCityNorm(DISPATCH_CITY_ALIASES[n]) : null,
    DISPATCH_CITY_ALIASES[stripped] ? _dispatchCityNorm(DISPATCH_CITY_ALIASES[stripped]) : null];
  for(var i=0;i<cands.length;i++){
    if(cands[i] && _dispatchCityIndex[cands[i]]) return _dispatchCityIndex[cands[i]];
  }
  return null;
}
function dispatchCityMins(city){
  var row = dispatchCityResolve(city);
  return row != null ? _dispatchCityTimes[row] : 20;
}
function dispatchCityKnown(city){ return dispatchCityResolve(city) != null; }
function dispatchJobMins(j){
  if(j._driveMins != null) return j._driveMins;
  return dispatchCityMins(j.city);
}
// The dump is 26 Ferndale Dr in Barrie, about 7 minutes from the shop, and it
// only enters the picture on PICKUPS. Once a bin is tipped there the truck can
// take the empty straight to the next customer instead of returning to the yard
// first — that saved hop is exactly what pairing a pickup with a delivery buys.
var DISPATCH_HANDLE_MINS    = 5;   // hooking a full bin, or setting a fresh one down
var DISPATCH_DUMP_MINS      = 20;  // Jake's average time spent inside the dump
var DISPATCH_YARD_DUMP_MINS = 7;   // shop <-> dump hop
var DISPATCH_STACK_HOP_MINS = 10;  // first stacked drop over to the second, they're close
// Every estimate builds from c = one-way drive minutes to the stop's town. The
// dump sits beside the yard, so the run to it from any town also costs about c.
// Each kind is the story of a real trip:
//   standalone-delivery  yard→site, drop, site→yard                    2c + 5
//   standalone-pickup    yard→site, hook, site→dump, tip, dump→yard    2c + 32
// Remote pair (pickup at A + delivery at B, ONE trip — the bin emptied at
// the dump goes straight to B instead of a second trip out):
//   swap-pickup          yard→A, hook, A→dump, tip                     2c + 25
//   swap-delivery        dump→B, drop, B→yard                          2c + 5
// Swap-out (pickup + delivery at the SAME address — arrive with the fresh
// bin, swap it for the full one, ONE visit):
//   swap-delivery-onsite yard→site, drop the fresh bin                 c + 5
//   swap-pickup-onsite   hook, site→dump, tip, dump→yard               c + 32
// Double stack (two far 14-yard drops, regular nested inside a low-wide,
// ONE trip out — see dispatchFindStacks):
//   stack-first          yard→A, drop                                  c + 5
//   stack-second         A→B hop, drop, B→yard                         c + 15
function dispatchEstimateMinutes(job, kind){
  var c = dispatchJobMins(job);
  var handle = DISPATCH_HANDLE_MINS, dump = DISPATCH_DUMP_MINS, home = DISPATCH_YARD_DUMP_MINS;
  if(kind === 'standalone-delivery')  return 2*c + handle;
  if(kind === 'standalone-pickup')    return 2*c + handle + dump + home;
  if(kind === 'swap-pickup')          return 2*c + handle + dump;
  if(kind === 'swap-delivery')        return 2*c + handle;
  if(kind === 'swap-delivery-onsite') return c + handle;
  if(kind === 'swap-pickup-onsite')   return c + handle + dump + home;
  if(kind === 'stack-first')          return c + handle;
  if(kind === 'stack-second')         return c + DISPATCH_STACK_HOP_MINS + handle;
  return 0;
}
// Only Kevin's big truck can haul a loaded 4 or 7 yard bin away. Dropping one
// off is fine for anyone — an empty bin going out is no trouble — so this is a
// pickup-leg rule, tested per leg and never on the job as a whole.
var DISPATCH_BIG_TRUCK_SIZES = [4, 7];
var DISPATCH_BIG_TRUCK_DRIVER = 'Kevin';
function dispatchNeedsBigTruck(j){
  return !!j._isPickup && DISPATCH_BIG_TRUCK_SIZES.indexOf(parseInt(j.binSize, 10)) !== -1;
}
function dispatchBigTruckDriverId(){
  var k = crewMembers.find(function(c){
    return String(c.name||'').trim().toLowerCase() === DISPATCH_BIG_TRUCK_DRIVER.toLowerCase();
  });
  return k ? k.id : null;
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
    var pAddr = dispatchJobAddrStr(p), pc = dispatchJobCoord(p), pTown = dispatchCityResolve(p.city);
    deliveries.forEach(function(d){
      if(pAddr && pAddr === dispatchJobAddrStr(d)){ cand.push({p:p.id, d:d.id, dist:0}); return; }
      var dist = dispatchHaversineKm(pc, dispatchJobCoord(d));
      if(dist <= DISPATCH_COMBO_MAX_KM){ cand.push({p:p.id, d:d.id, dist:dist}); return; }
      // Distance comes back Infinity when either stop has no coordinate yet, and
      // the geocode cache is per-machine — so without this the same day pairs up
      // differently for different people. Same resolved town is the honest stand-in.
      // A measured-but-far pair stays unpaired, which is why this only runs on Infinity.
      if(dist === Infinity && pTown && pTown === dispatchCityResolve(d.city)) cand.push({p:p.id, d:d.id, dist:5});
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
// Double stacking: only 14-yard bins stack (a regular rides inside a low-wide),
// and it only pays off on far runs — Jake's rule of thumb is ~20-30+ minutes out,
// Orillia being the classic case. Two far 14-yard deliveries near each other
// (same resolved town, or within DISPATCH_STACK_MAX_KM when we have coordinates)
// get matched as one trip. Runs after pair matching over the deliveries no pair
// claimed; greedy nearest-first, same shape as dispatchFindSwaps.
var DISPATCH_STACK_MIN_ONEWAY = 22;
var DISPATCH_STACK_MAX_KM = 15;
function dispatchFindStacks(jobsList, taken){
  var ds = jobsList.filter(function(j){
    return j._isDelivery && !taken[j.id] && parseInt(j.binSize,10) === 14
      && dispatchJobMins(j) >= DISPATCH_STACK_MIN_ONEWAY;
  });
  var cand = [];
  for(var i=0;i<ds.length;i++){
    for(var k=i+1;k<ds.length;k++){
      var a = ds[i], b = ds[k];
      var ra = dispatchCityResolve(a.city), rb = dispatchCityResolve(b.city);
      var sameTown = !!(ra && ra === rb);
      var dist = dispatchHaversineKm(dispatchJobCoord(a), dispatchJobCoord(b));
      if(sameTown || dist <= DISPATCH_STACK_MAX_KM)
        cand.push({a:a.id, b:b.id, dist: dist <= DISPATCH_STACK_MAX_KM ? dist : 5});
    }
  }
  cand.sort(function(x,y){return x.dist - y.dist;});
  var partner = {}, used = {};
  cand.forEach(function(c2){
    if(used[c2.a] || used[c2.b]) return;
    partner[c2.a] = c2.b; partner[c2.b] = c2.a;
    used[c2.a] = true; used[c2.b] = true;
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
      var jFirst = j._isPickup || j._kind === 'stack-first';
      var pick = jFirst ? j : p, drop = jFirst ? p : j;
      out.push(pick); done[pick.id] = true;
      out.push(drop); done[drop.id] = true;
    } else { out.push(j); done[j.id] = true; }
  });
  return out;
}
// Orders one lane's legs around the clock. A timed drop is scheduled AT its time
// rather than shoved to the front of the day: flexible work that fits in the run-up
// to it goes first, so a 2pm appointment no longer leaves the truck idle all morning.
// Combos travel as one indivisible unit and stay strictly back-to-back. Priority
// among the flexible work is unchanged — combos, then loose drops, then loose pickups.
// Returns {jobs, warnings}. Nothing is dropped — every unit lands somewhere.
function dispatchOrderLaneJobs(jobs, startMins){
  var warnings = [];
  var byId = {}; jobs.forEach(function(j){ byId[j.id]=j; });
  var claimed = {}, units = [];
  jobs.forEach(function(j){
    if(claimed[j.id]) return;
    var p = j._partnerId && byId[j._partnerId];
    var members;
    if(p && !claimed[p.id]){
      var jFirst = j._isPickup || j._kind === 'stack-first';
      members = jFirst ? [j, p] : [p, j];
    } else members = [j];
    members.forEach(function(m){ claimed[m.id] = true; });
    // dispatchParseClock is null for 'anytime' (and any non-clock text) — those drops
    // are flexible, so they fill gaps instead of anchoring the day to a time.
    var appts = members.filter(function(m){ return m._isDelivery; })
      .map(function(m){ return dispatchParseClock(m.binDropoffTime); })
      .filter(function(t){ return t != null; });
    units.push({
      members: members,
      mins: members.reduce(function(s,m){ return s + (m._estMinutes||0); }, 0),
      appt: appts.length ? Math.min.apply(null, appts) : null,
      rank: members[0]._partnerId ? 0 : (members[0]._isDelivery ? 1 : 2)
    });
  });
  var timed = units.filter(function(u){ return u.appt != null; })
                   .sort(function(a,b){ return a.appt - b.appt; });
  for(var i=1;i<timed.length;i++){
    if(timed[i].appt === timed[i-1].appt){
      var dup = timed[i].members.filter(function(m){
        return m._isDelivery && dispatchParseClock(m.binDropoffTime) === timed[i].appt;
      })[0];
      if(dup) warnings.push('Two timed drops at '+ft(dup.binDropoffTime));
    }
  }
  var flex = units.filter(function(u){ return u.appt == null; })
                  .sort(function(a,b){ return a.rank - b.rank; });
  var ordered = [], clock = (typeof startMins === 'number') ? startMins : 480;
  function place(u){
    u.members.forEach(function(m){ ordered.push(m); });
    clock += u.mins;
  }
  timed.forEach(function(t){
    // Anything flexible that can finish before the appointment goes ahead of it.
    // The clock only moves forward, so a unit that doesn't fit now never will.
    for(var k = 0; k < flex.length; ){
      if(clock + flex[k].mins <= t.appt) place(flex.splice(k, 1)[0]);
      else k++;
    }
    if(clock < t.appt) clock = t.appt;   // arrived early — wait for the appointment
    place(t);
  });
  flex.forEach(place);
  return {jobs: ordered, warnings: warnings};
}
// Walks one driver's day the same way the lane view does: stops in dispatch
// order, clock starting at the lane's start time. Arriving early for a timed
// drop means waiting (counted); arriving 5+ min late is a miss. endMins is
// when the truck finishes the last stop — waiting included — so balancing on
// it treats a 1pm appointment like the real constraint it is.
function dispatchSimulateLane(laneJobs, startMins){
  var ord = dispatchOrderLaneJobs(laneJobs || [], startMins);
  var clock = startMins, wait = 0, misses = 0;
  ord.jobs.forEach(function(j){
    var appt = j._isDelivery ? dispatchParseClock(j.binDropoffTime) : null;
    if(appt != null){
      if(clock > appt + 5) misses++;
      if(appt > clock){ wait += appt - clock; clock = appt; }
    }
    clock += (j._estMinutes||0);
  });
  return {ordered: ord.jobs, warnings: ord.warnings, endMins: clock, waitMins: wait, misses: misses};
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
  // Changing who's working invalidates any plan built from the old driver list.
  if(_dispatchPreview){ _dispatchPreview = null; toast('Preview cleared — the driver list changed.'); }
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
  // A preview is a mock-up: block every write path until it's applied or discarded.
  if(_dispatchPreview){ toast('Apply or discard the preview first.'); return; }
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
// ─── Balancing: plan, apply, preview ───
// The planner is pure — it works out who would get what and writes nothing.
// Fill / Re-balance commit a plan straight away; Preview holds one on screen
// until you Apply or Discard it.
var _dispatchPreview = null; // {date, byJob:{jobId:{leg,crewId}}, moved, before:{crewId:{stops,mins}}}

// Stops, simulated day span (waiting included) and missed timed drops per
// driver, for the leg that runs on this date.
function dispatchLaneStats(jobs){
  var by = {};
  jobs.forEach(function(j){
    var c = j._isPickup ? (j.pickupCrewId||'') : (j.dropoffCrewId||'');
    if(!c) return;
    (by[c] = by[c] || []).push(j);
  });
  var st = {};
  Object.keys(by).forEach(function(c){
    var start = dispatchParseClock(dispatchGetLaneStart(c)) || 480;
    var sim = dispatchSimulateLane(by[c], start);
    st[c] = {stops: by[c].length, mins: sim.endMins - start, misses: sim.misses};
  });
  return st;
}
// What the plan proposes for a job — its real driver when the plan doesn't touch it.
function dispatchProposedCrewId(j){
  var pv = _dispatchPreview && _dispatchPreview.byJob[j.id];
  if(pv) return pv.crewId;
  return j._isPickup ? (j.pickupCrewId||'') : (j.dropoffCrewId||'');
}
// True when this stop would change hands under the plan — the only thing highlighted.
function dispatchJobMoves(j){
  if(!_dispatchPreview) return false;
  var cur = j._isPickup ? (j.pickupCrewId||'') : (j.dropoffCrewId||'');
  return dispatchProposedCrewId(j) !== cur;
}
// Load per driver now vs under the plan — both read the real jobs, nothing is mutated.
function dispatchPreviewStats(){
  var by = {};
  _dispatchJobsCache.forEach(function(j){
    var c = dispatchProposedCrewId(j);
    if(!c) return;
    (by[c] = by[c] || []).push(j);
  });
  var after = {};
  Object.keys(by).forEach(function(c){
    var start = dispatchParseClock(dispatchGetLaneStart(c)) || 480;
    var sim = dispatchSimulateLane(by[c], start);
    after[c] = {stops: by[c].length, mins: sim.endMins - start, misses: sim.misses};
  });
  return {before: dispatchLaneStats(_dispatchJobsCache), after: after};
}
// Appointment-aware balancing. Timed units place first (earliest appointment
// first), the rest longest-first. Each unit tries every working driver and
// lands where it causes no new missed appointments and the earliest simulated
// end of day — so colliding timed drops spread across drivers, and waiting
// for an appointment counts against a lane like the real clock does.
function dispatchPlanBalance(mode){
  var working = dispatchGetWorkingIds();
  if(!working.length) return {error:'Pick at least one driver first.'};
  function legAssigned(j){ return j._isPickup ? (j.pickupCrewId||'') : (j.dropoffCrewId||''); }
  var partner = dispatchFindSwaps(_dispatchJobsCache);
  var _stacks = dispatchFindStacks(_dispatchJobsCache, partner);
  Object.keys(_stacks).forEach(function(id){ partner[id] = _stacks[id]; });
  var seen = {};
  var units = [];
  _dispatchJobsCache.forEach(function(j){
    if(seen[j.id]) return;
    var pId = partner[j.id];
    var p = pId ? _dispatchJobsCache.find(function(jj){return jj.id===pId;}) : null;
    var us = p ? [j, p] : [j];
    us.forEach(function(x){ seen[x.id] = true; });
    var appts = us.filter(function(x){ return x._isDelivery; })
      .map(function(x){ return dispatchParseClock(x.binDropoffTime); })
      .filter(function(t){ return t != null; });
    units.push({jobs: us,
                total: us.reduce(function(s,x){ return s+(x._estMinutes||0); },0),
                appt: appts.length ? Math.min.apply(null, appts) : null,
                needsBig: us.some(dispatchNeedsBigTruck)});
  });
  var lanes = {}; working.forEach(function(id){ lanes[id] = []; });
  var unitsToAssign;
  if(mode === 'all'){
    unitsToAssign = units;
  } else {
    // Fill only: keep existing assignments — they seed each lane's simulated day
    _dispatchJobsCache.forEach(function(j){ var c = legAssigned(j); if(c && lanes[c]) lanes[c].push(j); });
    unitsToAssign = units.filter(function(u){ return u.jobs.every(function(j){ return !legAssigned(j); }); });
    if(!unitsToAssign.length) return {error:'All jobs are already assigned — nothing to fill.'};
  }
  var starts = {}, base = {};
  working.forEach(function(id){
    starts[id] = dispatchParseClock(dispatchGetLaneStart(id)) || 480;
    base[id] = dispatchSimulateLane(lanes[id], starts[id]);
  });
  unitsToAssign.sort(function(a,b){
    if(a.appt != null || b.appt != null){
      if(a.appt == null) return 1;
      if(b.appt == null) return -1;
      return a.appt - b.appt;
    }
    return b.total - a.total;
  });
  var assignments = [], flagged = [];
  var bigId = dispatchBigTruckDriverId();
  var bigWorking = !!bigId && working.indexOf(bigId) >= 0;
  function give(u, id){
    var sim = dispatchSimulateLane(lanes[id].concat(u.jobs), starts[id]);
    lanes[id] = lanes[id].concat(u.jobs);
    base[id] = sim;
    u.jobs.forEach(function(j){
      assignments.push({jobId: j.id, crewId: id, leg: j._isPickup ? 'pickup' : 'dropoff'});
    });
  }
  unitsToAssign.forEach(function(u){
    // A loaded 4 or 7 yard can only leave on the big truck, so those pickups are
    // Kevin's whether or not it balances the day. When he isn't out, leave the stop
    // unassigned and visible rather than quietly routing it to a truck that can't
    // lift it — but never overwrite a driver a person picked on purpose.
    if(u.needsBig){
      if(bigWorking){ give(u, bigId); return; }
      var stuck = u.jobs.filter(dispatchNeedsBigTruck);
      if(!stuck.some(function(j){ return legAssigned(j); })) stuck.forEach(function(j){ flagged.push(j); });
      // Only the pickup is blocked. Anything paired with it — the fresh bin going
      // out, say — can still be run by someone else today, so split the unit rather
      // than stranding the half that is perfectly doable. The leftover leg keeps the
      // paired estimate, which is a shade optimistic once it travels alone.
      var rest = u.jobs.filter(function(j){ return !dispatchNeedsBigTruck(j); });
      if(!rest.length) return;
      u = {jobs: rest, appt: u.appt,
           total: rest.reduce(function(s,x){ return s+(x._estMinutes||0); }, 0)};
    }
    var best = null, bestMiss = 0, bestEnd = 0;
    working.forEach(function(id){
      var sim = dispatchSimulateLane(lanes[id].concat(u.jobs), starts[id]);
      var newMiss = sim.misses - base[id].misses;
      if(best === null || newMiss < bestMiss || (newMiss === bestMiss && sim.endMins < bestEnd)){
        best = id; bestMiss = newMiss; bestEnd = sim.endMins;
      }
    });
    give(u, best);
  });
  return {assignments: assignments, working: working, flagged: flagged};
}
// Writes a plan to the database. Per-job aggregated update covers swap pairs that touch both legs.
async function dispatchApplyPlan(assignments){
  var perJob = {};
  assignments.forEach(function(a){
    if(!perJob[a.jobId]) perJob[a.jobId] = {};
    perJob[a.jobId][a.leg === 'pickup' ? 'pickup_crew_id' : 'dropoff_crew_id'] = a.crewId;
  });
  for(var jid in perJob){
    var u2 = perJob[jid];
    var local = _dispatchJobsCache.find(function(j){return String(j.id)===String(jid);});
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
}
async function dispatchBalanceRoutes(mode){
  mode = mode || 'fill';
  if(_dispatchPreview){ toast('Apply or discard the preview first.'); return; }
  var plan = dispatchPlanBalance(mode);
  if(plan.error){ toast(plan.error); return; }
  if(mode === 'all' && !confirm('Redo the whole day across '+plan.working.length+' driver(s)? This replaces the assignments you have now.')) return;
  await dispatchApplyPlan(plan.assignments);
  toast((mode==='all'?'Redid the day — ':'Filled ')+plan.assignments.length+' stop(s) across '+plan.working.length+' driver(s).'+dispatchBigTruckNote(plan.flagged));
  renderDispatch();
}
// Spells out any 4/7 yard pickups the balancer deliberately refused to place, so a
// short assignment count never reads as "nothing left to do".
function dispatchBigTruckNote(flagged){
  if(!flagged || !flagged.length) return '';
  return ' '+flagged.length+' pickup'+(flagged.length>1?'s':'')+' left for you — only '+
         DISPATCH_BIG_TRUCK_DRIVER+' can haul a 4 or 7 yard away, and he is not working today.';
}
// Mock-up: shows what a full re-balance would look like. Nothing is written until Apply.
function dispatchPreviewBalance(){
  if(_dispatchPreview){ toast('Apply or discard the current preview first.'); return; }
  var plan = dispatchPlanBalance('all');
  if(plan.error){ toast(plan.error); return; }
  var byJob = {}, moved = 0;
  plan.assignments.forEach(function(a){
    byJob[a.jobId] = {leg:a.leg, crewId:a.crewId};
    var j = _dispatchJobsCache.find(function(x){ return String(x.id)===String(a.jobId); });
    var cur = j ? (j._isPickup ? (j.pickupCrewId||'') : (j.dropoffCrewId||'')) : '';
    if(cur !== a.crewId) moved++;
  });
  _dispatchPreview = {date:_dispatchDate, byJob:byJob, moved:moved, flagged:plan.flagged};
  if(plan.flagged && plan.flagged.length) toast(dispatchBigTruckNote(plan.flagged).trim());
  renderDispatch();
}
async function dispatchApplyPreview(){
  var p = _dispatchPreview;
  if(!p) return;
  var assignments = Object.keys(p.byJob).map(function(id){
    return {jobId:id, leg:p.byJob[id].leg, crewId:p.byJob[id].crewId};
  });
  _dispatchPreview = null;
  await dispatchApplyPlan(assignments);
  toast('Plan applied — '+assignments.length+' stop(s) assigned.');
  renderDispatch();
}
function dispatchDiscardPreview(){
  _dispatchPreview = null;
  renderDispatch();
}
// Banner shown in both views while a preview is up: what moves, and before → after per driver.
function dispatchPreviewBannerHtml(){
  var p = _dispatchPreview;
  if(!p) return '';
  var st = dispatchPreviewStats();
  var after = st.after;
  var ids = Object.keys(after);
  Object.keys(st.before).forEach(function(id){ if(ids.indexOf(id) < 0) ids.push(id); });
  var h = '<div style="background:#fff;border:1px solid #e9ecef;border-left:4px solid #f59e0b;border-radius:14px;padding:13px 16px;margin-bottom:14px;box-shadow:0 8px 24px rgba(26,26,46,.10);color:#1a1a2e">';
  h += '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">';
  h += '<div style="line-height:1.25"><div style="font-size:14px;font-weight:800;letter-spacing:-.2px">Preview &mdash; nothing saved yet</div>';
  h += '<div style="font-size:11.5px;color:#868e96">'+p.moved+' stop'+(p.moved===1?'':'s')+' would move &mdash; each driver\'s proposed run is the faded column beside them. Apply to write it, or discard to leave today alone.</div></div>';
  h += '<div style="display:inline-flex;gap:8px;margin-left:auto">';
  h += '<button onclick="dispatchDiscardPreview()" style="background:#f8f9fa;border:1px solid #e9ecef;color:#495057;padding:8px 15px;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Discard</button>';
  h += '<button onclick="dispatchApplyPreview()" style="background:var(--accent);border:0;color:#fff;padding:8px 16px;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Apply this plan</button>';
  h += '</div></div>';
  if(ids.length){
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:11px">';
    ids.forEach(function(id){
      var crew = crewMembers.find(function(c){ return c.id === id; });
      if(!crew) return;
      var col = crew.color || crewAvatarColor(crew.id);
      var b = st.before[id] || {stops:0, mins:0};
      var a = after[id] || {stops:0, mins:0};
      var same = (b.stops === a.stops && b.mins === a.mins);
      h += '<span style="display:inline-flex;align-items:center;gap:7px;background:#f8f9fa;border:1px solid #e9ecef;border-radius:99px;padding:5px 12px;font-size:11.5px">';
      h += '<span style="width:8px;height:8px;border-radius:50%;background:'+col+'"></span>';
      h += '<span style="font-weight:700;color:#343a40">'+escHtml(crew.name)+'</span>';
      h += '<span style="color:#adb5bd;font-family:ui-monospace,monospace">'+b.stops+' &middot; '+dispatchFmtTotal(b.mins)+'</span>';
      h += '<span style="color:#adb5bd">&rarr;</span>';
      h += '<span style="font-weight:700;color:'+(same?'#adb5bd':'#1a1a2e')+';font-family:ui-monospace,monospace">'+a.stops+' &middot; '+dispatchFmtTotal(a.mins)+'</span>'
         + (a.misses?' <span title="Would miss '+a.misses+' timed drop'+(a.misses===1?'':'s')+'" style="color:#dc3545;font-weight:800">&#9888;'+a.misses+'</span>':'');
      h += '</span>';
    });
    h += '</div>';
  }
  h += '</div>';
  return h;
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
  var comboCol = j._comboColor || 'var(--accent)';
  var working = dispatchGetWorkingIds();
  var assigned = isPickup ? (j.pickupCrewId||'') : (j.dropoffCrewId||'');
  var key = j.id + ':' + leg;
  var menuOpen = (_dispatchMenu === key);
  var opts = '';
  working.forEach(function(id){
    var c = crewMembers.find(function(cm){return cm.id===id;}); if(!c) return;
    var col = c.color || crewAvatarColor(c.id);
    opts += '<button onclick="event.stopPropagation();dispatchAssignJob(\''+j.id+'\',\''+id+'\',\''+leg+'\')" style="display:flex;width:100%;align-items:center;gap:8px;min-height:42px;padding:0 13px;border:none;border-bottom:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;'+(assigned===id?'font-weight:800;':'font-weight:600;')+'cursor:pointer;font-family:inherit;text-align:left"><span style="width:9px;height:9px;border-radius:50%;flex:none;background:'+col+'"></span>'+escHtml(c.name)+(assigned===id?' ✓':'')+'</button>';
  });
  if(assigned) opts += '<button onclick="event.stopPropagation();dispatchAssignJob(\''+j.id+'\',\'\',\''+leg+'\')" style="display:block;width:100%;min-height:40px;padding:0 13px;border:none;background:var(--surface);font-size:13px;color:var(--muted);cursor:pointer;font-family:inherit;text-align:left">↩ Unassign</button>';
  if(!opts) opts = '<div style="padding:12px 13px;font-size:12px;color:var(--muted)">No drivers working — toggle one above.</div>';
  var menu = menuOpen ? '<div style="position:absolute;left:10px;right:10px;z-index:6;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,.18);overflow:hidden;margin-top:5px">'+opts+'</div>' : '';
  // The left edge and the faint wash say WHOSE stop this is — that's what stops the
  // board reading as one block of green. Until someone owns it, the leg colour holds
  // the edge instead. Crew colours are always hex, so the alpha suffix is safe here
  // (never append alpha to a var(--...) colour — it silently produces no colour).
  var owner = assigned ? crewMembers.find(function(cm){ return cm.id===assigned; }) : null;
  var ownerCol = owner ? (owner.color || crewAvatarColor(owner.id)) : null;
  var stripe = ownerCol || legBg;
  var cardBg = ownerCol ? ownerCol+'12' : 'var(--surface)';
  var sizeCol = binSizeColor(j.binSize), sizeTxt = binSizeLabel(j.binSize);
  var appt = isPickup ? null : dispatchParseClock(j.binDropoffTime);
  // A 4 or 7 yard can only be hauled away on the big truck. Say so on any such
  // pickup that isn't on Kevin — unassigned, or deliberately moved to someone else.
  var bigWarn = dispatchNeedsBigTruck(j) && assigned !== dispatchBigTruckDriverId();
  var clockTxt = (typeof clockStartMins === 'number')
    ? '<div style="display:inline-block;font-size:12px;font-weight:800;color:#15803d;background:rgba(34,197,94,.13);border-radius:6px;padding:3px 8px;margin-bottom:8px">'
        +dispatchFmtClock(clockStartMins)+' &ndash; '+dispatchFmtClock(clockStartMins + j._estMinutes)+'</div>'
    : '';
  return '<div draggable="true" ondragstart="dispatchOnDragStart(event,\''+j.id+'\',\''+leg+'\')" ondragend="dispatchOnDragEnd(event)" style="position:relative;background:'+cardBg+';border:1px solid var(--border);border-left:5px solid '+stripe+';border-radius:12px;padding:13px 14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.05);cursor:grab">'
    +'<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:9px">'
      +'<span style="font-size:10.5px;font-weight:800;color:#fff;background:'+legBg+';padding:3px 9px;border-radius:5px;letter-spacing:.4px">'+legLabel+'</span>'
      +(sizeTxt?'<span title="Bin size" style="font-size:11px;font-weight:800;color:#fff;background:'+sizeCol+';padding:3px 9px;border-radius:5px">'+sizeTxt+'</span>':'')
      +(j._partnerId?(String(j._kind).indexOf('stack')===0
        ?'<span title="Two far 14-yard drops on one trip — regular bin rides inside the low-wide" style="font-size:10.5px;font-weight:700;color:#7c3aed;background:rgba(124,58,237,.12);padding:3px 8px;border-radius:5px">📦 Double stack</span>'
        :'<span title="Pickup and delivery run together as one trip" style="font-size:10.5px;font-weight:700;color:#15803d;background:rgba(34,197,94,.12);padding:3px 8px;border-radius:5px;border-left:3px solid '+comboCol+'">🔗 Paired</span>'):'')
      +'<span style="margin-left:auto;font-size:13px;font-weight:800;color:var(--text);background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 9px;white-space:nowrap">'
        +(j._cityUnknown?'<span title="Town not in the drive-time list — using a 20 min guess" style="color:#d97706">&#9888; </span>':'')+j._estMinutes+' min</span>'
    +'</div>'
    +(appt!=null?'<div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#fff;background:#be123c;border-radius:7px;padding:5px 10px;margin-bottom:9px">&#9200; Must be dropped at '+ft(j.binDropoffTime)+'</div>':'')
    +(bigWarn?'<div style="font-size:11.5px;font-weight:700;color:#92400e;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:7px;padding:5px 9px;margin-bottom:9px">&#9888; '+DISPATCH_BIG_TRUCK_DRIVER+' only &mdash; a loaded '+sizeTxt+' needs the big truck</div>':'')
    +clockTxt
    +'<div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.3">'+escHtml(j.name||'—')+'</div>'
    +'<div style="font-size:13px;color:var(--text);margin-top:3px;line-height:1.35">'+(j.address?escHtml(j.address):'&mdash;')+'</div>'
    +'<div style="font-size:12.5px;color:var(--muted);margin-top:1px;margin-bottom:11px">'+escHtml(j.city||'')+' <span style="opacity:.6">&middot; #'+j.id+'</span></div>'
    +'<button onclick="event.stopPropagation();dispatchToggleCardMenu(\''+key+'\')" style="width:100%;min-height:42px;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">'+(assigned?'Move &#9662;':'👤 Assign &#9662;')+'</button>'
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
  var stackPartner = dispatchFindStacks(todayJobs, swapPartner);
  todayJobs.forEach(function(j){
    var kind, partnerId = null;
    if(swapPartner[j.id]){
      partnerId = swapPartner[j.id];
      var sp = todayJobs.find(function(x){return x.id===partnerId;});
      // Same address = a swap-out: one visit, not an out-and-back pair.
      var onsite = !!(sp && dispatchJobAddrStr(j) && dispatchJobAddrStr(j) === dispatchJobAddrStr(sp));
      kind = j._isPickup ? (onsite?'swap-pickup-onsite':'swap-pickup') : (onsite?'swap-delivery-onsite':'swap-delivery');
    } else if(stackPartner[j.id]){
      partnerId = stackPartner[j.id];
      var st = todayJobs.find(function(x){return x.id===partnerId;});
      // The nearer drop unloads first; tie-break by id so both members agree.
      var jm = dispatchJobMins(j), sm = st ? dispatchJobMins(st) : jm;
      var first = jm < sm || (jm === sm && String(j.id) < String(st ? st.id : ''));
      kind = first ? 'stack-first' : 'stack-second';
    } else {
      kind = j._isPickup ? 'standalone-pickup' : 'standalone-delivery';
    }
    j._kind = kind;
    j._partnerId = partnerId;
    j._cityUnknown = j._driveMins == null && !dispatchCityKnown(j.city);
    j._estMinutes = dispatchEstimateMinutes(j, kind);
  });
  // Give each combo pair a shared color so the two linked cards are obvious.
  // All hex, never var(--accent) — these get an alpha suffix appended downstream,
  // and a CSS variable with hex tacked on the end resolves to no colour at all.
  var comboPalette = ['#16a34a','#0ea5e9','#a855f7','#f97316','#ec4899','#14b8a6','#eab308'];
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
  // A preview never touches the loaded jobs — the board keeps showing what's really
  // assigned, and the plan is drawn beside it as a ghost column to compare against.
  if(_dispatchPreview && _dispatchPreview.date !== _dispatchDate) _dispatchPreview = null;
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
  var stackPairs = Object.keys(stackPartner).length / 2;
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
  html += '<div class="page-sub" data-tour="dispatch-summary">'+todayJobs.length+' bin jobs &middot; est '+dispatchFmtTotal(totalMins)+(swapPairs?' &middot; '+swapPairs+' paired trip'+(swapPairs>1?'s':'')+' found':'')+(stackPairs?' &middot; '+stackPairs+' double stack'+(stackPairs>1?'s':'')+' suggested':'')+'</div></div>';
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
  html += '<button data-tour="dispatch-fill" onclick="dispatchBalanceRoutes(\'fill\')" title="Assign only the jobs that have no driver yet — keeps your manual assignments" style="background:var(--accent);color:#fff;border:0;padding:8px 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit">';
  html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>';
  html += 'Fill empty stops';
  html += '</button>';
  html += '<button onclick="dispatchPreviewBalance()" title="Draws a suggested plan beside the real one so you can compare. Saves nothing until you press Apply." style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:8px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Show me a plan first</button>';
  html += '<button onclick="dispatchBalanceRoutes(\'all\')" title="Throws away every current assignment and shares the whole day out again from scratch" style="background:#f59e0b18;border:1px solid #f59e0b80;color:#d97706;padding:8px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Redo the whole day</button>';
  html += '</div>';
  html += '</div></div>';
  html += dispatchPreviewBannerHtml();
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
  html += '<div style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;font-family:Georgia,serif">i</div>';
  html += '<div style="font-size:13px;line-height:1.5;color:var(--text)">';
  html += '<span style="display:inline-block;font-size:10px;font-weight:700;color:var(--accent);background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);padding:1px 6px;border-radius:4px;margin-right:6px;vertical-align:1px">PAIRED</span>';
  html += '<strong>= one trip handles both a pickup and a delivery</strong> &mdash; the bin emptied at the dump goes straight to the next customer instead of coming back to the shop first. The dump is only 7 minutes from the yard, so that saves a modest hop on a pair at two different addresses; the real win is a <strong>swap-out</strong>, where the pickup and the drop are the same address and one visit covers both. Keep both legs on the same driver. ';
  html += '<span style="display:inline-block;font-size:10px;font-weight:700;color:#7c3aed;background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.3);padding:1px 6px;border-radius:4px;margin:0 6px;vertical-align:1px">DOUBLE STACK</span>';
  html += '<strong>= two far 14-yard drops ride out together</strong> &mdash; the regular bin nests inside a low-wide, so one trip delivers both. Suggested when two 14s land near each other roughly 20+ min out.';
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
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px">';
    dispatchGroupCombos(unassigned).forEach(function(j){ html += dispatchRenderCard(j); });
    html += '</div>';
  }
  html += '</div>';
  if(laneIds.length){
    html += '<div data-tour="dispatch-lanes" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px">';
    laneIds.forEach(function(id){
      var crew = crewMembers.find(function(c){return c.id===id;});
      if(!crew) return;
      var laneJobs = byLane[id] || [];
      var color = crew.color || crewAvatarColor(crew.id);
      var startTime = dispatchGetLaneStart(id);
      var startMins = dispatchParseClock(startTime) || 480;
      var sim = laneJobs.length ? dispatchSimulateLane(laneJobs, startMins) : null;
      var routeUrl = sim ? dispatchMapsRouteUrl(sim.ordered) : null;
      // The day's span includes waiting for timed drops — that's real clock time.
      var spanMins = sim ? (sim.endMins - startMins) : 0;
      var _pct = Math.min(Math.round(spanMins/480*100),100);
      var _barCol = _pct<60?'var(--accent)':(_pct<90?'#f59e0b':'#dc3545');
      var _noteCol = _pct>=90?'#dc3545':(_pct>=60?'#c2410c':'#15803d');
      var _note = laneJobs.length ? (_pct+'% of an 8-hr day &middot; done ~'+dispatchFmtClock(sim.endMins)+(sim.waitMins?' &middot; '+sim.waitMins+'m waiting':'')) : 'Empty &mdash; add stops';
      html += '<div ondragover="dispatchOnDragOver(event)" ondrop="dispatchOnDrop(event, \''+id+'\')" style="background:var(--surface);border:1px solid var(--border);border-radius:13px;overflow:hidden;min-height:120px">';
      // lane header: avatar + name/count + load bar
      html += '<div style="padding:12px 13px;border-bottom:1px solid var(--border)">';
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">';
      html += (typeof teamAvatar==='function') ? teamAvatar(crew.name, color, 34)
        : '<div style="width:34px;height:34px;border-radius:50%;background:'+color+';color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;flex:none">'+(crew.name||'?').trim().charAt(0).toUpperCase()+'</div>';
      html += '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14.5px;color:var(--text)">'+escHtml(crew.name)+'</div><div style="font-size:11px;color:var(--muted)">'+laneJobs.length+' stop'+(laneJobs.length===1?'':'s')+' &middot; starts '+dispatchFmtClock(startMins)+'</div></div>';
      html += '<span style="font-size:13px;font-weight:700;color:'+_noteCol+';white-space:nowrap">'+dispatchFmtTotal(spanMins)+'</span>';
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
        var warns = sim.warnings;
        var _unkSeen = {};
        laneJobs.forEach(function(uj){
          var uKey = _dispatchCityNorm(uj.city) || '?';
          if(uj._cityUnknown && !_unkSeen[uKey]){ _unkSeen[uKey] = true; warns.push('&ldquo;'+escHtml(uj.city||'?')+'&rdquo; not in the town list &mdash; times use a 20m guess'); }
        });
        var clock = startMins;
        sim.ordered.forEach(function(j){
          var ft2 = j._isDelivery ? dispatchParseClock(j.binDropoffTime) : null;
          if(ft2 != null){
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
var DCV_JOB_H = 66;        // rendered height of a job card
var DCV_CREW_H = 118;      // rendered height of a crew card
var DCV_ROW_PITCH = 82;    // vertical pitch of stacked job cards
var DCV_GROUP_GAP = 300;   // horizontal pitch between crew groups
var DCV_GHOST_DX = 296;    // offset from a group to its proposed (ghost) column
var DCV_GROUP_GAP_CMP = 620; // wider pitch while previewing, to fit the ghost column
var DCV_POOL_PER_COL = 6;  // unassigned cards per column in the pool
var DCV_PAD = 40;          // outer padding of the whole layout
var DCV_HEAD_H = 34;       // title strip above a panel's first card
var DCV_THEMES = {
  forest:  {name:'Forest',  canvas:'#0b1710', surface:'#12241a', border:'#1e3a29', ink:'#e6f3ea', sub:'#8bab97', chip:'#12241a', chipbd:'#20402d', track:'#183021', dot:'rgba(52,209,127,.11)',  stub:'linear-gradient(160deg,#34d17f,#0b6b34)', stubtext:'#04160c', accent:'#34d17f'},
  steel:   {name:'Steel',   canvas:'#141a23', surface:'#1d2431', border:'#2b3547', ink:'#e5ebf3', sub:'#93a1b5', chip:'#1a2130', chipbd:'#2f3b4f', track:'#212a3a', dot:'rgba(160,180,210,.10)', stub:'linear-gradient(160deg,var(--accent),#12833f)', stubtext:'#ffffff', accent:'var(--accent)'},
  obsidian:{name:'Obsidian',canvas:'#08090b', surface:'#131417', border:'#23252b', ink:'#f4f5f7', sub:'#8d9096', chip:'#141519', chipbd:'#26282f', track:'#1b1d22', dot:'rgba(47,229,127,.08)',  stub:'linear-gradient(160deg,#2fe57f,#0f9a4f)', stubtext:'#04160c', accent:'#2fe57f'}
};
var _dcv = {
  view: {tx:60, ty:40, scale:1},
  posByDate: {},
  layout: null,   // positions from the last render — compare mode swaps this out
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
  var h = (hex||'var(--accent)').replace('#','');
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
// One group per driver: their card on top, their stops stacked underneath in the
// order they'd actually run them.
function dcvGroups(){
  return dcvCrewNodes().map(function(c){
    var jobs = _dispatchJobsCache.filter(function(j){ return dcvJobCrewId(j) === c.id; });
    return {crew: c, jobs: jobs.length ? dispatchOrderLaneJobs(jobs, dispatchParseClock(dispatchGetLaneStart(c.id)) || 480).jobs : []};
  });
}
// The same groups as they'd look under the plan — drawn as the faded column beside
// each driver, so the change reads as a difference instead of losing the "before".
function dcvProposedGroups(){
  if(!_dispatchPreview) return [];
  return dcvCrewNodes().map(function(c){
    var jobs = _dispatchJobsCache.filter(function(j){ return dispatchProposedCrewId(j) === c.id; });
    return {crew: c, jobs: jobs.length ? dispatchOrderLaneJobs(jobs, dispatchParseClock(dispatchGetLaneStart(c.id)) || 480).jobs : []};
  });
}
// Where a ghost card sits: one panel to the right, on the same row line as the real stack.
function dcvGhostPos(o, i){
  return {x: o.x + DCV_GHOST_DX, y: o.y + DCV_CREW_H + 16 + i*DCV_ROW_PITCH};
}
// Everything with no driver — combo pairs kept adjacent. A job held by someone who
// is no longer on the crew list has no group to sit in, so it belongs here too:
// every job must land in exactly one place or it would render without a position.
function dcvPoolJobs(){
  var known = {};
  dcvCrewNodes().forEach(function(c){ known[c.id] = true; });
  return dispatchGroupCombos(_dispatchJobsCache.filter(function(j){
    var c = dcvJobCrewId(j);
    return !c || !known[c];
  }));
}
function dcvPoolCols(){
  return Math.max(1, Math.ceil(dcvPoolJobs().length/DCV_POOL_PER_COL));
}
// Layout is automatic so groups can never overlap: unassigned cards tile the pool
// on the left, assigned cards stack under their driver. Only the crew card origins
// are remembered per date — dragging a driver moves that whole group with it.
function dcvPositions(){
  var key = _dispatchDate || 'd';
  if(!_dcv.posByDate[key]) _dcv.posByDate[key] = {};
  // While a preview is up the board auto-arranges into compare mode in a throwaway
  // map, so your own arrangement comes back untouched the moment it's discarded.
  var pos = _dispatchPreview ? {} : _dcv.posByDate[key];
  var pool = dcvPoolJobs();
  pool.forEach(function(j, i){
    pos['j:'+j.id] = {
      x: DCV_PAD + Math.floor(i/DCV_POOL_PER_COL)*(DCV_JOB_W+30),
      y: DCV_PAD + DCV_HEAD_H + (i%DCV_POOL_PER_COL)*DCV_ROW_PITCH
    };
  });
  var groupX = DCV_PAD + dcvPoolCols()*(DCV_JOB_W+30) + 110;
  var pitch = _dispatchPreview ? DCV_GROUP_GAP_CMP : DCV_GROUP_GAP;
  dcvGroups().forEach(function(g, gi){
    var k = 'c:'+g.crew.id;
    if(!pos[k]) pos[k] = {x: groupX + gi*pitch, y: DCV_PAD + DCV_HEAD_H};
    var o = pos[k];
    g.jobs.forEach(function(j, i){
      pos['j:'+j.id] = {x: o.x, y: o.y + DCV_CREW_H + 16 + i*DCV_ROW_PITCH};
    });
  });
  _dcv.layout = pos; // every other reader (edges, drag, focus) works off this
  return pos;
}
// Panel geometry for a group / the pool, derived from the origin of its first card.
function dcvGroupBox(o, rows){
  return {
    x: o.x - 14,
    y: o.y - DCV_HEAD_H,
    w: DCV_JOB_W + 28,
    h: DCV_HEAD_H + DCV_CREW_H + 16 + (rows ? rows*DCV_ROW_PITCH - (DCV_ROW_PITCH-DCV_JOB_H) : 44) + 14
  };
}
function dcvNodeEl(key){
  if(!_dcv.els || !_dcv.els.world) return null;
  return _dcv.els.world.querySelector('[data-node="'+key+'"]');
}

// ---------- card builders (theme colors baked in; rebuilt on every render) ----------
// opts.ghost = the faded proposed copy — no ports, not draggable, not a drop target.
// opts.mark  = 'out' (this stop leaves under the plan) or 'in' (it arrives here).
function dcvJobCardHtml(j, T, p, selected, opts){
  opts = opts || {};
  var num = parseInt(j.binSize, 10);
  var numTxt = isNaN(num) ? 'BIN' : String(num);
  var isCombo = !!j._partnerId;
  var svc = j._isPickup ? 'Pickup' : 'Drop';
  var svcCol = j._isPickup ? '#60a5fa' : '#eab308';
  // How long it takes and when it must happen are two different facts — show both
  // rather than letting an appointment hide the estimate.
  var apptMins = j._isPickup ? null : dispatchParseClock(j.binDropoffTime);
  var win = (j._cityUnknown ? '⚠ ' : '') + (j._estMinutes||0) + 'm';
  var markCol = opts.mark === 'in' ? '#22c55e' : (opts.mark === 'out' ? '#f59e0b' : '');
  var outline = selected ? 'outline:2px solid '+T.accent+';outline-offset:2px;'
              : (markCol ? 'outline:2px dashed '+markCol+';outline-offset:2px;' : '');
  var bd = markCol ? '1px solid '+markCol : '1px solid '+T.border;
  var h = '<div '+(opts.ghost ? 'data-ghost="j:'+j.id+'"' : 'data-node="j:'+j.id+'"')+' style="position:absolute;top:0;left:0;width:'+DCV_JOB_W+'px;'+(opts.ghost?'opacity:.66;pointer-events:none;':'cursor:grab;')+'transform:translate('+p.x+'px,'+p.y+'px)">';
  h += '<div data-card style="'+outline+'background:'+T.surface+';border:'+bd+';border-radius:12px;box-shadow:0 8px 22px rgba(0,0,0,.4);overflow:hidden;display:flex;position:relative">';
  // The ticket stub carries the bin size, in the size's own colour — the same four
  // colours the list view and every other screen use, so a 20 always looks like a 20.
  h += '<div style="width:62px;flex:0 0 auto;background:'+binSizeColor(j.binSize)+';display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 4px">';
  h += '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:'+(isNaN(num)?'21':'30')+'px;line-height:.8;letter-spacing:.5px;color:#fff">'+numTxt+'</div>';
  if(!isNaN(num)) h += '<div style="font-size:8px;font-weight:800;letter-spacing:2px;color:#fff;opacity:.9">YD</div>';
  h += '</div>';
  h += '<div style="width:0;flex:0 0 auto;border-left:2px dashed '+T.border+';margin:7px 0"></div>';
  h += '<div style="flex:1;min-width:0;padding:8px 12px">';
  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">';
  h += '<span style="font-family:ui-monospace,monospace;font-size:9px;font-weight:700;letter-spacing:.4px;color:'+T.sub+'">#'+j.id+'</span>';
  h += '<span style="width:4px;height:4px;border-radius:50%;background:'+svcCol+';flex:0 0 auto"></span>';
  h += '<span style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:'+svcCol+'">'+svc+'</span>';
  if(isCombo) h += String(j._kind).indexOf('stack')===0
    ? '<span title="Double stack — two far 14-yard drops on one trip (regular rides inside the low-wide)" style="font-size:9px">📦</span>'
    : '<span title="Paired — pickup + delivery on one trip" style="font-size:9px">🔗</span>';
  if(markCol){
    // On the real card: where it goes. On the ghost: where it came from.
    var mvId = opts.mark === 'in' ? (j._isPickup ? (j.pickupCrewId||'') : (j.dropoffCrewId||'')) : dispatchProposedCrewId(j);
    var mvC = mvId && crewMembers.find(function(x){ return x.id === mvId; });
    var mvTxt = (opts.mark === 'in' ? '&larr; ' : '&rarr; ') + (mvC ? escHtml(mvC.name) : 'unassigned');
    h += '<span style="font-size:8px;font-weight:800;letter-spacing:.4px;color:'+markCol+';border:1px solid '+markCol+';border-radius:3px;padding:0 4px;white-space:nowrap">'+mvTxt+'</span>';
  }
  if(apptMins != null) h += '<span title="This drop has a promised time" style="font-size:9px;font-weight:800;letter-spacing:.3px;color:#fff;background:#be123c;border-radius:3px;padding:1px 5px;white-space:nowrap">&#9200; '+dispatchFmtClock(apptMins)+'</span>';
  h += '<span style="margin-left:auto;font-size:10px;color:'+T.sub+';font-family:ui-monospace,monospace">'+win+'</span>';
  h += '</div>';
  h += '<div style="font-size:16px;font-weight:800;letter-spacing:-.3px;color:'+T.ink+';line-height:1.06;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(j.city||'—')+'</div>';
  h += '<div style="display:flex;align-items:center;gap:4px;margin-top:1px">';
  h += '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="'+T.sub+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;opacity:.75"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  h += '<span style="font-size:11px;color:'+T.sub+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml((j.address||'—')+(j.name?' · '+j.name:''))+'</span>';
  h += '</div></div></div>';
  // no assigning while a preview is up — the port would be a lie
  if(!_dispatchPreview) h += '<div data-port="out" data-node="j:'+j.id+'" title="Drag onto a crew card to assign" style="position:absolute;right:-8px;top:38px;width:15px;height:15px;border-radius:50%;background:'+T.surface+';border:2.5px solid '+T.accent+';cursor:crosshair;box-shadow:0 0 0 3px '+dcvRgba(T.accent,0.16)+'"></div>';
  h += '</div>';
  return h;
}
function dcvCrewCardHtml(c, T, p, selected){
  var col = c.color || crewAvatarColor(c.id);
  var laneJobs = _dispatchJobsCache.filter(function(j){ return dcvJobCrewId(j) === c.id; });
  var startMins = dispatchParseClock(dispatchGetLaneStart(c.id)) || 480;
  var _sim = laneJobs.length ? dispatchSimulateLane(laneJobs, startMins) : null;
  var total = _sim ? (_sim.endMins - startMins) : 0; // day span incl. waiting for timed drops
  var pct = Math.min(Math.round(total/480*100), 100);
  var barCol = pct < 60 ? 'var(--accent)' : (pct < 90 ? '#f59e0b' : '#dc3545');
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

// Tinted panel behind a driver's stack — this is what makes the grouping read at a
// glance. Sits under the cards, so dropping a job on it targets that driver.
function dcvGroupPanelHtml(g, T, pos){
  var o = pos['c:'+g.crew.id];
  if(!o) return '';
  var col = g.crew.color || crewAvatarColor(g.crew.id);
  var box = dcvGroupBox(o, g.jobs.length);
  var mins = g.jobs.reduce(function(s,j){ return s+(j._estMinutes||0); }, 0);
  var h = '<div data-panel="c:'+g.crew.id+'" data-group="'+g.crew.id+'" style="position:absolute;top:0;left:0;width:'+box.w+'px;height:'+box.h+'px;transform:translate('+box.x+'px,'+box.y+'px);border:1px solid '+dcvRgba(col,0.42)+';background:'+dcvRgba(col,0.07)+';border-radius:20px">';
  h += '<div style="display:flex;align-items:center;gap:7px;padding:9px 14px 0;pointer-events:none">';
  h += '<span style="width:7px;height:7px;border-radius:50%;background:'+col+';flex:0 0 auto"></span>';
  h += '<span style="font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:'+col+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(g.crew.name)+'</span>';
  h += '<span style="margin-left:auto;font-size:10.5px;font-family:ui-monospace,monospace;color:'+T.sub+';flex:0 0 auto">'+g.jobs.length+' &middot; '+dispatchFmtTotal(mins)+'</span>';
  h += '</div>';
  if(!g.jobs.length) h += '<div style="position:absolute;left:0;right:0;bottom:15px;text-align:center;font-size:11.5px;color:'+T.sub+';font-style:italic;pointer-events:none">No stops &mdash; drag a job here</div>';
  h += '</div>';
  return h;
}
// The proposed column for one driver: same geometry as their real group, shifted one
// panel right, with the load it would carry and how that differs from today.
function dcvGhostPanelHtml(g, real, T, pos){
  var o = pos['c:'+g.crew.id];
  if(!o) return '';
  var col = g.crew.color || crewAvatarColor(g.crew.id);
  var box = dcvGroupBox(o, g.jobs.length);
  var _gStart = dispatchParseClock(dispatchGetLaneStart(g.crew.id)) || 480;
  var _gSim = g.jobs.length ? dispatchSimulateLane(g.jobs, _gStart) : null;
  var mins = _gSim ? (_gSim.endMins - _gStart) : 0;
  var _rSim = real && real.jobs.length ? dispatchSimulateLane(real.jobs, _gStart) : null;
  var realMins = _rSim ? (_rSim.endMins - _gStart) : 0;
  var dStops = g.jobs.length - (real ? real.jobs.length : 0);
  var dMins = mins - realMins;
  var same = (dStops === 0 && dMins === 0);
  var dCol = same ? T.sub : (dMins > 0 ? '#f59e0b' : '#22c55e');
  function sgn(n){ return (n > 0 ? '+' : '') + n; }
  var h = '<div style="position:absolute;top:0;left:0;width:'+box.w+'px;height:'+box.h+'px;transform:translate('+(box.x+DCV_GHOST_DX)+'px,'+box.y+'px);border:1px dashed '+dcvRgba(col,0.5)+';background:'+dcvRgba(col,0.04)+';border-radius:20px;pointer-events:none">';
  h += '<div style="display:flex;align-items:center;gap:7px;padding:9px 14px 0">';
  h += '<span style="font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:'+T.sub+'">Proposed</span>';
  h += '<span style="margin-left:auto;font-size:10.5px;font-family:ui-monospace,monospace;color:'+T.sub+'">'+g.jobs.length+' &middot; '+dispatchFmtTotal(mins)+'</span>';
  h += '</div>';
  // level with the real crew card, so the two loads compare straight across
  h += '<div style="position:absolute;left:14px;right:14px;top:'+DCV_HEAD_H+'px;height:'+DCV_CREW_H+'px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px">';
  h += '<div style="font-size:25px;font-weight:800;letter-spacing:-.5px;color:'+T.ink+';line-height:1">'+g.jobs.length+'<span style="font-size:12px;font-weight:700;color:'+T.sub+'"> stop'+(g.jobs.length===1?'':'s')+'</span></div>';
  h += '<div style="font-size:12.5px;font-family:ui-monospace,monospace;color:'+T.sub+'">'+dispatchFmtTotal(mins)+'</div>';
  h += '<div style="font-size:11px;font-weight:700;color:'+dCol+'">'+(same ? 'no change' : sgn(dStops)+' stop'+(Math.abs(dStops)===1?'':'s')+' &middot; '+sgn(dMins)+'m')+'</div>';
  if(_gSim && _gSim.misses) h += '<div style="font-size:10.5px;font-weight:800;color:#dc3545">&#9888; would miss '+_gSim.misses+' timed drop'+(_gSim.misses===1?'':'s')+'</div>';
  h += '</div>';
  if(!g.jobs.length) h += '<div style="position:absolute;left:0;right:0;bottom:15px;text-align:center;font-size:11.5px;color:'+T.sub+';font-style:italic">Nothing assigned</div>';
  h += '</div>';
  return h;
}
// The unassigned pool. Dropping an assigned card back on it clears its driver.
function dcvPoolPanelHtml(pool, T){
  var cols = dcvPoolCols();
  var rows = Math.min(pool.length, DCV_POOL_PER_COL);
  var w = cols*(DCV_JOB_W+30) - 30 + 28;
  var hh = DCV_HEAD_H + (rows ? rows*DCV_ROW_PITCH - (DCV_ROW_PITCH-DCV_JOB_H) : 44) + 14;
  var h = '<div data-pool="1" style="position:absolute;top:0;left:0;width:'+w+'px;height:'+hh+'px;transform:translate('+(DCV_PAD-14)+'px,'+DCV_PAD+'px);border:1px dashed '+T.chipbd+';background:rgba(255,255,255,.02);border-radius:20px">';
  h += '<div style="display:flex;align-items:center;gap:7px;padding:9px 14px 0;pointer-events:none">';
  h += '<span style="width:7px;height:7px;border-radius:50%;background:#f59e0b;flex:0 0 auto"></span>';
  h += '<span style="font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:'+T.sub+'">Unassigned</span>';
  h += '<span style="margin-left:auto;font-size:10.5px;font-family:ui-monospace,monospace;color:'+T.sub+'">'+pool.length+'</span>';
  h += '</div></div>';
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
    // --sidebar-rail (the resting width), not --sidebar-w (the hover width):
    // the rail expands OVER the page, so laying out against 240px left a dead
    // 158px gap down the left of the board whenever the nav was resting.
    st.textContent = '#dcv-shell{position:fixed;top:0;right:0;bottom:0;left:var(--sidebar-rail,0px);z-index:140;display:flex;flex-direction:column}'
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
  h += '<div style="font-size:10.5px;color:'+T.sub+'">'+_dispatchJobsCache.length+' bin jobs · est '+dispatchFmtTotal(totalMins)+(comboPairs?' · '+comboPairs+' paired trip'+(comboPairs>1?'s':''):'')+'</div></div>';
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
  var _dim = _dispatchPreview ? 'opacity:.4;' : '';
  h += '<div style="display:inline-flex;gap:8px;margin-left:auto">';
  h += '<button onclick="dispatchBalanceRoutes(\'fill\')" title="Assign only the stops that have no driver yet — keeps everything you set by hand" style="'+_dim+'background:var(--accent);color:#fff;border:0;padding:7px 15px;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Fill empty stops</button>';
  h += '<button onclick="dispatchPreviewBalance()" title="Draws a suggested plan beside the real one so you can compare. Saves nothing until you press Apply." style="background:'+T.chip+';border:1px solid '+T.chipbd+';color:'+T.ink+';padding:7px 13px;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Show me a plan first</button>';
  h += '<button onclick="dispatchBalanceRoutes(\'all\')" title="Throws away every current assignment and shares the whole day out again from scratch" style="'+_dim+'background:#f59e0b18;border:1px solid #f59e0b80;color:#d97706;padding:7px 13px;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Redo the whole day</button>';
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
  // preview banner — the mock-up's apply / discard controls
  if(_dispatchPreview) h += '<div style="flex:0 0 auto;padding:12px 16px 0;background:'+T.canvas+'">'+dispatchPreviewBannerHtml()+'</div>';
  // stage
  h += '<div id="dcv-vp" style="position:relative;flex:1;min-height:0;overflow:hidden;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;background-color:'+T.canvas+'">';
  h += '<div id="dcv-world" style="position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform">';
  // panels first, then the spine lines, then the cards — so cards always sit on top
  var groups = dcvGroups();
  var pool = dcvPoolJobs();
  var proposed = dcvProposedGroups();
  var realById = {}; groups.forEach(function(g){ realById[g.crew.id] = g; });
  if(pool.length) h += dcvPoolPanelHtml(pool, T);
  groups.forEach(function(g){ h += dcvGroupPanelHtml(g, T, pos); });
  proposed.forEach(function(g){ h += dcvGhostPanelHtml(g, realById[g.crew.id], T, pos); });
  h += '<svg id="dcv-svg" style="position:absolute;top:0;left:0;overflow:visible;pointer-events:none"></svg>';
  // real cards — a stop that changes hands is outlined amber with where it goes
  _dispatchJobsCache.forEach(function(j){
    h += dcvJobCardHtml(j, T, pos['j:'+j.id], _dcv.selId === 'j:'+j.id, {mark: dispatchJobMoves(j) ? 'out' : null});
  });
  // ghost cards — the same stop again in its proposed slot, green where it's new
  proposed.forEach(function(g){
    var o = pos['c:'+g.crew.id];
    if(!o) return;
    g.jobs.forEach(function(j, i){
      h += dcvJobCardHtml(j, T, dcvGhostPos(o, i), false, {ghost:true, mark: dispatchJobMoves(j) ? 'in' : null});
    });
  });
  groups.forEach(function(g){ h += dcvCrewCardHtml(g.crew, T, pos['c:'+g.crew.id], _dcv.selId === 'c:'+g.crew.id); });
  h += '</div>';
  // in-canvas header: date + legend chips
  function chip(inner){ return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:'+T.sub+';background:'+T.chip+';border:1px solid '+T.chipbd+';border-radius:99px;padding:3px 9px">'+inner+'</span>'; }
  h += '<div style="position:absolute;top:16px;left:18px;z-index:20;pointer-events:none">';
  h += '<div style="display:flex;gap:7px;flex-wrap:wrap;max-width:460px">';
  h += chip('<span style="width:8px;height:8px;border-radius:50%;background:#60a5fa"></span>Pickup');
  h += chip('<span style="width:8px;height:8px;border-radius:50%;background:#eab308"></span>Drop');
  h += chip('<span style="font-size:10px">🔗</span>Paired = pickup + delivery on one trip');
  if(unassignedCount) h += chip('<span style="width:8px;height:8px;border-radius:50%;background:#f59e0b"></span>'+unassignedCount+' unassigned');
  if(_dispatchPreview){
    h += chip('<span style="width:9px;height:9px;border-radius:2px;border:1.5px dashed #f59e0b"></span>moves away');
    h += chip('<span style="width:9px;height:9px;border-radius:2px;border:1.5px dashed #22c55e"></span>moves here');
    h += chip('faded column = proposed');
  } else {
    h += chip('drag ○ from a job onto a crew card to assign');
  }
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
  // Opening or closing a preview reshapes the board — re-fit so the comparison
  // (or the board coming back) is fully in view without reaching for the zoom.
  var previewing = !!_dispatchPreview;
  var previewChanged = (_dcv.lastPreview !== previewing);
  _dcv.lastPreview = previewing;
  if((!_dcv.fitByDate[dateKey] || previewChanged) && _dispatchJobsCache.length){
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
// Snap every card back to its computed slot — used after a drag that didn't land
// on a driver, so nothing is ever left stranded between groups.
function dcvRelayout(){
  var world = _dcv.els && _dcv.els.world;
  if(!world) return;
  var pos = dcvPositions();
  Object.keys(pos).forEach(function(k){
    var el = dcvNodeEl(k);
    if(el) el.style.transform = 'translate('+pos[k].x+'px,'+pos[k].y+'px)';
  });
  dcvDrawEdges();
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
  var pos = _dcv.layout;
  var p = pos && pos[key];
  if(!p) return null;
  if(side === 'out') return {x: p.x + DCV_JOB_W - 0.5, y: p.y + 45.5};
  return {x: p.x - 0.5, y: p.y + 39.5};
}
function dcvPathD(a, b){
  var dx = Math.max(40, Math.abs(b.x-a.x)*0.5);
  return 'M '+a.x+' '+a.y+' C '+(a.x+dx)+' '+a.y+', '+(b.x-dx)+' '+b.y+', '+b.x+' '+b.y;
}
// Each driver's stops hang off one short spine down their own group, so no line
// ever crosses another. The only free-floating line is the one you're dragging.
function dcvDrawEdges(){
  var svg = _dcv.els && _dcv.els.svg;
  if(!svg) return;
  if(_dcv.suppressEdges){ svg.innerHTML = ''; return; }
  var col = dcvTheme().accent;
  var pos = _dcv.layout || {};
  var inner = '';
  dcvGroups().forEach(function(g){
    var o = pos['c:'+g.crew.id];
    if(!o || !g.jobs.length) return;
    var gcol = g.crew.color || crewAvatarColor(g.crew.id);
    var sx = o.x - 7;
    var last = pos['j:'+g.jobs[g.jobs.length-1].id];
    if(!last) return;
    inner += '<path d="M '+sx+' '+(o.y+DCV_CREW_H)+' V '+(last.y+DCV_JOB_H/2)+'" fill="none" stroke="'+gcol+'" stroke-width="2" stroke-linecap="round" opacity=".6"/>';
    g.jobs.forEach(function(j){
      var p = pos['j:'+j.id];
      if(!p) return;
      var y = p.y + DCV_JOB_H/2;
      inner += '<path d="M '+sx+' '+y+' H '+(p.x-1)+'" fill="none" stroke="'+gcol+'" stroke-width="2" stroke-linecap="round" opacity=".6"/>';
      inner += '<circle cx="'+sx+'" cy="'+y+'" r="3" fill="'+gcol+'"/>';
    });
  });
  // the proposed column gets the same spine, dashed and faded
  dcvProposedGroups().forEach(function(g){
    var o = pos['c:'+g.crew.id];
    if(!o || !g.jobs.length) return;
    var gcol = g.crew.color || crewAvatarColor(g.crew.id);
    var sx = o.x + DCV_GHOST_DX - 7;
    inner += '<path d="M '+sx+' '+(o.y+DCV_CREW_H)+' V '+(dcvGhostPos(o, g.jobs.length-1).y + DCV_JOB_H/2)+'" fill="none" stroke="'+gcol+'" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round" opacity=".4"/>';
    g.jobs.forEach(function(j, i){
      var gp = dcvGhostPos(o, i), gy = gp.y + DCV_JOB_H/2;
      inner += '<path d="M '+sx+' '+gy+' H '+(gp.x-1)+'" fill="none" stroke="'+gcol+'" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round" opacity=".4"/>';
      inner += '<circle cx="'+sx+'" cy="'+gy+'" r="2.5" fill="'+gcol+'" opacity=".55"/>';
    });
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
    var nid = nodeEl.getAttribute('data-node');
    // compare mode owns the layout while a preview is up — clicks still select, drags don't move
    _dcv.drag = {type:'node', id:nid, el:nodeEl, lastX:e.clientX, lastY:e.clientY, moved:0, locked:!!_dispatchPreview};
    nodeEl.style.zIndex = '30';
    if(_dcv.drag.locked){ /* no group or drop handling */ }
    else if(nid.indexOf('c:') === 0){
      // dragging a driver drags their whole group — panel and stacked stops together
      var gid = nid.slice(2);
      _dcv.drag.panel = _dcv.els.world.querySelector('[data-panel="'+nid+'"]');
      _dcv.drag.kids = _dispatchJobsCache.filter(function(j){ return dcvJobCrewId(j) === gid; })
        .map(function(j){ return {id:'j:'+j.id, el:dcvNodeEl('j:'+j.id)}; });
    } else {
      nodeEl.style.pointerEvents = 'none'; // so the drop target under the cursor is findable
    }
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
    var pos = _dcv.layout;
    var p = pos && pos[d.id];
    if(p && !d.locked){
      p.x += ndx; p.y += ndy;
      if(d.el) d.el.style.transform = 'translate('+p.x+'px,'+p.y+'px)';
      if(d.kids) d.kids.forEach(function(k){
        var kp = pos[k.id];
        if(!kp) return;
        kp.x += ndx; kp.y += ndy;
        if(k.el) k.el.style.transform = 'translate('+kp.x+'px,'+kp.y+'px)';
      });
      if(d.panel) d.panel.style.transform = 'translate('+(p.x-14)+'px,'+(p.y-DCV_HEAD_H)+'px)';
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
    if(d.el){ d.el.style.zIndex = ''; d.el.style.pointerEvents = ''; }
    if(d.moved < 4){ dcvSelect(d.id); return; }
    if(d.locked) return;
    // Dropping a job card on a driver (their card, their panel, or one of their
    // stops) moves it into that group; dropping it back on the pool unassigns it.
    if(d.id.indexOf('j:') === 0){
      var jid = d.id.slice(2);
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var grp = hit && hit.closest('[data-group]');
      var node = hit && hit.closest('[data-node]');
      var target = grp ? grp.getAttribute('data-group') : null;
      if(!target && node){
        var nk = node.getAttribute('data-node');
        if(nk.indexOf('c:') === 0) target = nk.slice(2);
        else {
          var other = dcvJobById(nk.slice(2));
          if(other) target = dcvJobCrewId(other) || null;
        }
      }
      var job = dcvJobById(jid);
      var cur = job ? dcvJobCrewId(job) : '';
      if(target && target !== cur) dispatchAssignJob(jid, target, dcvLegOf(jid));
      else if(!target && cur && hit && hit.closest('[data-pool]')) dispatchAssignJob(jid, '', dcvLegOf(jid));
      dcvRelayout();
    }
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
  // ghost columns aren't nodes, so account for the width they add on the right
  if(_dispatchPreview) maxx += DCV_GHOST_DX;
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
  var pos = _dcv.layout;
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
    var isCombo = !!j._partnerId;
    var svc = (j._isPickup ? 'Pickup' : 'Drop') + (isCombo ? ' · 🔗 paired' : '');
    var svcCol = j._isPickup ? '#60a5fa' : '#eab308';
    var cid = dcvJobCrewId(j);
    var cr = cid && crewMembers.find(function(c){ return c.id === cid; });
    var partner = j._partnerId ? dcvJobById(j._partnerId) : null;
    h += head(svcCol, 'Job · Bin rental');
    h += '<div style="padding:16px;overflow-y:auto;flex:1">';
    h += '<div style="font-size:19px;font-weight:800;color:#1a1a2e;letter-spacing:-.3px;margin-bottom:3px">'+escHtml(j.name||'—')+' <span style="font-size:12px;color:#adb5bd;font-weight:600">#'+j.id+'</span></div>';
    h += '<div style="font-size:12.5px;color:#868e96;margin-bottom:16px">'+escHtml((j.address||'—')+(j.city?', '+j.city:''))+'</div>';
    h += row('Type', escHtml(svc));
    h += row('Bin size', escHtml(j.binSize||'—'));
    h += row('Window', (!j._isPickup && dispatchParseClock(j.binDropoffTime)!=null) ? dispatchFmtClock(dispatchParseClock(j.binDropoffTime)) : 'Flexible');
    h += row('Est. time', '~'+(j._estMinutes||0)+'m');
    if(partner) h += row('Paired with', escHtml(partner.name||('#'+partner.id)));
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
  var startTime = dispatchGetLaneStart(c.id);
  var startMins = dispatchParseClock(startTime) || 480;
  var ord = laneJobs.length ? dispatchSimulateLane(laneJobs, startMins) : {ordered:[], warnings:[], endMins:startMins};
  var total = ord.endMins - startMins; // day span incl. waiting for timed drops
  var routeUrl = laneJobs.length ? dispatchMapsRouteUrl(ord.ordered) : null;
  h += head(col, 'Crew member');
  h += '<div style="padding:16px;overflow-y:auto;flex:1">';
  h += '<div style="font-size:19px;font-weight:800;color:#1a1a2e;letter-spacing:-.3px;margin-bottom:3px">'+escHtml(c.name)+'</div>';
  h += '<div style="font-size:12.5px;color:#868e96;margin-bottom:16px">'+laneJobs.length+' stop'+(laneJobs.length===1?'':'s')+' · '+dispatchFmtTotal(total)+' est</div>';
  h += row('Starts', '<input type="time" value="'+startTime+'" onchange="dispatchSetLaneStart(\''+c.id+'\', this.value)" style="background:#f8f9fa;border:1px solid #e9ecef;color:#343a40;padding:4px 8px;border-radius:6px;font-size:12px;font-family:inherit">');
  h += '<div style="font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#adb5bd;margin:14px 0 2px">Route — in order</div>';
  if(!ord.ordered.length){
    h += '<div style="font-size:12.5px;color:#868e96;font-style:italic;padding:10px 0">No stops yet — drag a job\'s ○ onto this card.</div>';
  } else {
    var warns = ord.warnings.slice();
    var clock = startMins;
    ord.ordered.forEach(function(x){
      var ft2 = x._isDelivery ? dispatchParseClock(x.binDropoffTime) : null;
      if(ft2 != null){
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
