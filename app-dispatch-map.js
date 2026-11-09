// ─── DISPATCH: MAP VIEW (Jake, 2026-11-09) ───
// Kelly's board: the day's bin stops on a dark Google map, one card per driver beside
// it. Pick a driver, then click stops to give them out. It adds no rules of its own:
// every write goes through dispatchAssignJob (its check-first box, the job history and
// Undo), and every time on the cards comes from dispatchSimulateLane.
// The 3D layer (three.js, loaded only on this view) is decoration. Each card has a
// little crew guy who waves when picked and cheers when given a stop, and the driver's
// truck drives the new leg along real roads (OSRM) with the driver waving out of the
// roof. Nothing moves unless a person did something, and there is no sound.
(function(){
'use strict';

// The site's browser map key, the same one the office TV and Winter routes use. It is
// public by design: locked to soramithril.github.io and to the Maps JavaScript API.
var GMAPS_KEY = 'AIzaSyDP9mUAQ0DCWBt8GRQN6649senq4hIDIG8';
var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
// Hats tell the guys apart (same skin for everyone; shirt = the driver's own colour).
var HATS = {jordan: ['cap', '#1e3a8a'], kevin: ['hard', '#facc15'], neil: ['toque', '#7f1d1d'], max: ['bucket', '#57534e']};
var DEFAULT_HAT = ['cap', '#374151'];
var DAY_MINS = 480;   // the 8-hour day the load bar measures against, same as the List view

var S = {ctx: null, sims: {}, root: null, picked: null, pending: null, hidden: null, pop: null, newRow: null,
         map: null, layer: null, lines: [], fitted: null, mapLoading: false};

// ─── small helpers ───
function find(id){ return S.ctx.jobs.find(function(j){ return String(j.id) === String(id); }); }
function curOf(j){ return (j._isPickup ? j.pickupCrewId : j.dropoffCrewId) || ''; }
function colOf(c){ return c.color || crewAvatarColor(c.id); }
function nameOf(id){ var c = dispatchCrewById(id); return c ? c.name : ''; }
function hatOf(c){ return HATS[String(c.name || '').trim().toLowerCase()] || DEFAULT_HAT; }
function sizeN(j){ var n = parseInt(j.binSize, 10); return isNaN(n) ? null : n; }
function tagHtml(j){ return '<span class="dm-tag" style="background:' + binSizeColor(j.binSize) + '">' + (sizeN(j) || 'BIN') + '</span>'; }
function legHtml(j){ return '<span class="dm-leg ' + (j._isPickup ? 'pick' : 'drop') + '">' + (j._isPickup ? '&uarr;' : '&darr;') + '</span>'; }
function stopTxt(j){ return escHtml(j.address || j.name || ('#' + j.id)) + ' <small>&middot; ' + escHtml(j.city || '—') + '</small>'; }
function bigWarn(j, crewId){ return dispatchNeedsBigTruck(j) && crewId && crewId !== dispatchBigTruckDriverId(); }
function townOf(j){ return dispatchCityResolve(j.city) || String(j.city || '').trim(); }
function dayLabel(){
  var d = new Date(S.ctx.date + 'T00:00:00'), t = new Date(todayStr() + 'T00:00:00');
  var diff = Math.round((d - t) / 86400000);
  return {long: d.toLocaleDateString('en-CA', {weekday: 'long', month: 'short', day: 'numeric'}),
          rel: diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : '',
          stamp: diff === 1 ? 'TOMORROW' : diff === 0 ? 'TODAY' : d.toLocaleDateString('en-CA', {weekday: 'long'}).toUpperCase()};
}

// ─── styles (kept in this file so the view stays out of style.css) ───
var CSS = ''
+ '.dm{position:relative;display:flex;flex-direction:column;gap:12px;min-height:560px}'
+ '.dm-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}'
+ '.dm-head h1{margin:0;font-size:22px;font-weight:700;letter-spacing:-.3px;color:var(--text)}'
+ '.dm-day{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:999px;background:var(--surface);padding:2px}'
+ '.dm-day button{border:0;background:none;width:30px;height:30px;border-radius:50%;color:var(--text);font-size:19px;line-height:1;cursor:pointer;font-family:inherit}'
+ '.dm-day button:hover{background:var(--surface2)}'
+ '.dm-day span{padding:0 8px;font-weight:600;font-size:13.5px;color:var(--text);white-space:nowrap}'
+ '.dm-day small{color:var(--accent);font-weight:700;margin-left:6px;font-size:12px}'
+ '.dm-chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 11px;font-weight:600;font-size:12.5px;background:var(--surface);border:1px solid var(--border);color:var(--muted);white-space:nowrap}'
+ '.dm-chip b{color:var(--text);font-size:14px}'
+ '.dm-chip.warn{background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.5);color:#d97706}.dm-chip.warn b{color:#d97706}'
+ '.dm-chip.good{background:rgba(34,197,94,.13);border-color:rgba(34,197,94,.45);color:var(--accent)}'
+ '.dm-seg{margin-left:auto;display:inline-flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface)}'
+ '.dm-seg button{border:0;background:transparent;color:var(--text);padding:7px 13px;font-weight:600;font-size:12.5px;font-family:inherit;cursor:pointer}'
+ '.dm-seg button+button{border-left:1px solid var(--border)}'
+ '.dm-seg button.on{background:var(--accent);color:#fff}'
+ '.dm-btn{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:10px;padding:7px 13px;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit;white-space:nowrap}'
+ '.dm-btn:hover{background:var(--surface2)}'
+ '.dm-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px}'
+ '.dm-mapc{position:relative;isolation:isolate;border-radius:18px;overflow:hidden;background:#141a17;border:1px solid var(--border);min-height:0}'
+ '.dm-map{position:absolute;inset:0}'
+ '.dm-maperr{position:absolute;inset:0;display:grid;place-items:center;color:#c3cbc6;font-size:14px;padding:20px;text-align:center}'
+ '.dm-hint{position:absolute;left:12px;top:12px;z-index:3;max-width:340px;padding:9px 12px;border-radius:12px;background:rgba(14,20,17,.86);border:1px solid rgba(255,255,255,.12);font-size:12.5px;line-height:1.45;color:#d3d9d5;pointer-events:none}'
+ '.dm-hint b{color:#fff}'
+ '.dm-key{position:absolute;left:12px;bottom:12px;z-index:3;display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:8px 12px;border-radius:12px;background:rgba(14,20,17,.86);border:1px solid rgba(255,255,255,.12);font-size:11.5px;color:#d3d9d5;pointer-events:none;max-width:calc(100% - 24px)}'
+ '.dm-key span{display:inline-flex;gap:6px;align-items:center}'
+ '.dm-key i{display:inline-block;width:15px;height:15px;background:#64748b;border:1.5px solid #fff;border-radius:50%}'
+ '.dm-key i.sq{border-radius:4px}.dm-key i.un{background:transparent;border:1.5px dashed #fbbf24}'
+ '.dm-key .lost{color:#fbbf24;font-weight:600}'
// pins and labels live inside Google's overlay pane
+ '.dm-layer>*{position:absolute}'
+ '.dm-pin{transform:translate(-50%,-50%);width:30px;height:30px;padding:0;margin:0;display:grid;place-items:center;font-family:"Bebas Neue",Impact,sans-serif;font-size:17px;line-height:1;color:#fff;background:var(--c);border:2px solid rgba(255,255,255,.92);border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,.5);cursor:pointer;transition:opacity .25s}'
+ '.dm-pin.pick{border-radius:9px}'
+ '.dm-pin:hover{filter:brightness(1.2)}'
+ '.dm-pin i{position:absolute;right:-6px;bottom:-6px;width:15px;height:15px;border-radius:50%;font-style:normal;font:800 10px/15px Inter,system-ui,sans-serif;text-align:center;border:1.5px solid #141a17}'
+ '.dm-pin.drop i{background:#eab308;color:#111}.dm-pin.pick i{background:#3b82f6;color:#fff}'
+ '.dm-pin.un{background:rgba(20,26,23,.92);color:#fbbf24;border:2px dashed #fbbf24;box-shadow:0 0 0 4px rgba(251,191,36,.18),0 4px 12px rgba(0,0,0,.5);animation:dmPulse 1.8s ease-in-out infinite}'
+ '.dm-pin.dim{opacity:.4}'
+ '.dm-pin.wait{opacity:0;pointer-events:none}'
+ '.dm-pin.pop{animation:dmPop .5s cubic-bezier(.3,1.7,.5,1);box-shadow:0 0 0 5px rgba(134,239,172,.55),0 4px 12px rgba(0,0,0,.5)}'
+ '.dm-pin b{position:absolute;left:-7px;top:-7px;width:15px;height:15px;border-radius:50%;background:#334155;color:#fff;font:700 9px/15px Inter,system-ui,sans-serif;text-align:center;border:1.5px solid #141a17}'
+ '.dm-pin b.bad{background:#f59e0b;color:#111}'
+ '@keyframes dmPop{0%{transform:translate(-50%,-50%) scale(.3)}100%{transform:translate(-50%,-50%) scale(1)}}'
+ '@keyframes dmPulse{0%,100%{box-shadow:0 0 0 3px rgba(251,191,36,.12),0 4px 12px rgba(0,0,0,.5)}50%{box-shadow:0 0 0 7px rgba(251,191,36,.28),0 4px 12px rgba(0,0,0,.5)}}'
+ '.dm-town{transform:translate(-50%,22px);white-space:nowrap;font:700 20px/1 Poppins,Inter,system-ui,sans-serif;letter-spacing:.4px;color:#fff;text-shadow:0 0 3px #0d1310,0 0 4px #0d1310,0 0 9px #0d1310;pointer-events:none}'
+ '.dm-base{transform:translate(-50%,-50%);font:700 10px/1 Inter,system-ui,sans-serif;letter-spacing:1px;padding:4px 8px;border-radius:999px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.5);pointer-events:none}'
+ '.dm-base.yard{background:#16a34a}.dm-base.dump{background:#57534e}'
// the column
+ '.dm-col{overflow:auto;display:flex;flex-direction:column;gap:10px;min-height:0;padding:2px 4px 8px 2px}'
+ '.dm-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;color:var(--text)}'
+ '.dm-wait{padding:12px 14px;flex:none;border-color:rgba(245,158,11,.45);background:linear-gradient(180deg,rgba(245,158,11,.12),rgba(245,158,11,.04))}'
+ '.dm-wait.done{border-color:rgba(34,197,94,.45);background:linear-gradient(180deg,rgba(34,197,94,.13),rgba(34,197,94,.04))}'
+ '.dm-wait h3{margin:0 0 6px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px;color:#d97706}'
+ '.dm-wait.done h3{color:var(--accent);margin:0}'
+ '.dm-wait h3 .n{background:#f59e0b;color:#1a1405;border-radius:999px;padding:0 8px;font-size:12px}'
+ '.dm-wrow{display:grid;grid-template-columns:18px 34px minmax(0,1fr) auto;gap:8px;align-items:center;padding:5px 6px;margin:0 -6px;border-top:1px solid var(--border);font-size:12.5px;border-radius:8px;cursor:pointer}'
+ '.dm-wrow:hover{background:var(--surface2)}'
+ '.dm-wrow .st,.dm-srow .st{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
+ '.dm-wrow .st small,.dm-srow .st small{color:var(--muted)}'
+ '.dm-wrow .t{font-size:11px;color:#d97706;font-weight:600;white-space:nowrap}'
+ '.dm-tag{display:inline-block;min-width:30px;text-align:center;font-family:"Bebas Neue",Impact,sans-serif;font-size:15px;letter-spacing:.5px;line-height:1.3;color:#fff;border-radius:4px;padding:0 5px}'
+ '.dm-leg{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:5px;font-size:11px;font-weight:700}'
+ '.dm-leg.drop{background:#eab308;color:#111}.dm-leg.pick{background:#3b82f6;color:#fff}'
+ '.dm-crew{padding:10px 14px 12px 8px;flex:none;cursor:pointer;transition:background .2s,border-color .2s,box-shadow .2s}'
+ '.dm-crew:hover{background:var(--surface2)}'
+ '.dm-crew.on{border-color:var(--c);box-shadow:0 0 0 1px var(--c),0 0 26px color-mix(in srgb,var(--c) 22%,transparent)}'
+ '.dm-ch{display:flex;align-items:center;gap:8px}'
+ '.dm-gslot{width:62px;height:76px;flex:none;margin:-14px 0 -8px;position:relative}'
+ '.dm-gslot::after{content:"";position:absolute;left:12px;right:12px;bottom:4px;height:8px;border-radius:50%;background:radial-gradient(rgba(0,0,0,.4),transparent 70%)}'
+ '.dm-nm{font-weight:700;font-size:15px;display:flex;align-items:center;gap:6px}'
+ '.dm-nm i{width:10px;height:10px;border-radius:50%;background:var(--c);display:inline-block}'
+ '.dm-sub{color:var(--muted);font-size:11.5px}'
+ '.dm-big{margin-left:auto;text-align:right;line-height:1.05}'
+ '.dm-big b{font-size:24px;font-weight:700}'
+ '.dm-big small{display:block;color:var(--muted);font-size:11px}'
+ '.dm-cl{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:11.5px;margin:8px 0 5px 6px}'
+ '.dm-cl b{color:var(--text);font-weight:600}'
+ '.dm-load{height:7px;border-radius:9px;background:var(--surface2);overflow:hidden;margin-left:6px}'
+ '.dm-load i{display:block;height:100%;border-radius:9px;transition:width .5s}'
+ '.dm-miss{margin:7px 0 0 6px;font-size:11.5px;color:#d97706;font-weight:600}'
+ '.dm-say{font-size:11.5px;color:var(--accent);margin:8px 0 0 6px;font-weight:600}'
+ '.dm-stops{margin:8px 0 0 6px;display:flex;flex-direction:column}'
+ '.dm-srow{display:grid;grid-template-columns:52px 18px 34px minmax(0,1fr) auto;gap:7px;align-items:center;padding:3px 4px;margin:0 -4px;font-size:12px;border-radius:7px}'
+ '.dm-srow:hover{background:var(--surface2)}'
+ '.dm-srow .t{color:var(--muted);font-variant-numeric:tabular-nums;font-size:11.5px}'
+ '.dm-srow.new{animation:dmRow .9s ease}'
+ '.dm-srow .w{font:700 10px Inter,system-ui,sans-serif;color:#111;background:#f59e0b;border-radius:4px;padding:1px 4px}'
+ '@keyframes dmRow{from{background:rgba(134,239,172,.3)}to{background:transparent}}'
+ '.dm-acts{display:flex;gap:6px;margin:10px 0 0 6px;flex-wrap:wrap}'
+ '.dm-acts button{border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:9px;padding:5px 11px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit}'
+ '.dm-crew:not(.on) .dm-stops,.dm-crew:not(.on) .dm-acts,.dm-crew:not(.on) .dm-say{display:none}'
+ '.dm-off{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:var(--muted);padding:2px 4px}'
+ '.dm-off button{border:1px dashed var(--border);background:transparent;color:var(--text);border-radius:999px;padding:4px 10px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit}'
+ '.dm-empty{padding:14px;font-size:13px;color:var(--muted)}'
// the 3D layer: see-through, clicks pass straight through it
+ '.dm-fx{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:6}'
+ '.dm-stamp{position:absolute;left:calc(50% - 190px);top:50%;z-index:9;font-family:"Bebas Neue",Impact,sans-serif;font-size:54px;letter-spacing:4px;color:#86efac;border:4px solid #86efac;border-radius:14px;padding:4px 22px 0;background:rgba(14,20,17,.78);transform:translate(-50%,-50%) rotate(-6deg);pointer-events:none;animation:dmStamp 2.8s ease forwards;white-space:nowrap}'
+ '@keyframes dmStamp{0%{opacity:0;transform:translate(-50%,-50%) rotate(-6deg) scale(2)}12%{opacity:1;transform:translate(-50%,-50%) rotate(-6deg) scale(1)}80%{opacity:1}100%{opacity:0}}'
+ '@media (max-width:900px){.dm{min-height:0}.dm-body{display:flex;flex-direction:column}.dm-mapc{height:58vh;flex:none}.dm-col{overflow:visible}.dm-hint{display:none}.dm-seg{margin-left:0}.dm-stamp{left:50%;font-size:32px}}'
+ '@media (prefers-reduced-motion:reduce){.dm-pin.pop,.dm-pin.un,.dm-srow.new,.dm-stamp{animation-duration:.01s;animation-iteration-count:1}}';

// ─── the page ───
function buildRoot(){
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  var r = document.createElement('div');
  r.className = 'dm';
  r.innerHTML = '<div class="dm-head"></div>'
    + '<div class="dm-body"><section class="dm-mapc"><div class="dm-map"></div><div class="dm-hint"></div><div class="dm-key"></div></section>'
    + '<section class="dm-col"></section></div><canvas class="dm-fx" aria-hidden="true"></canvas>';
  r.addEventListener('click', onClick);
  r.querySelector('.dm-col').addEventListener('scroll', kick);
  window.addEventListener('resize', function(){ fitHeight(); kick(); });
  window.addEventListener('scroll', kick, {passive: true});
  S.root = r;
}
// The board fills the window under the app's header, so the map is as big as it can be.
function fitHeight(){
  if(!S.root || !S.root.isConnected || isMobileView()){ if(S.root) S.root.style.height = ''; return; }
  var top = S.root.getBoundingClientRect().top + window.scrollY;
  S.root.style.height = Math.max(560, window.innerHeight - top - 16) + 'px';
}

function drawHead(){
  var c = S.ctx, n = c.jobs.length, drops = c.jobs.filter(function(j){ return !j._isPickup; }).length, un = c.unassigned.length, d = dayLabel();
  var h = '<h1>Dispatch</h1>'
    + '<div class="dm-day"><button onclick="dispatchShiftDate(-1)" title="Previous day" aria-label="Previous day">&lsaquo;</button>'
    + '<span>' + d.long + (d.rel ? '<small>' + d.rel + '</small>' : '') + '</span>'
    + '<button onclick="dispatchShiftDate(1)" title="Next day" aria-label="Next day">&rsaquo;</button></div>';
  if(n) h += un ? '<span class="dm-chip warn"><b>' + un + '</b> need' + (un === 1 ? 's' : '') + ' a driver</span>' : '<span class="dm-chip good">Every stop has a driver</span>';
  h += '<span class="dm-chip"><b>' + n + '</b> stop' + (n === 1 ? '' : 's') + '</span>'
    + (n ? '<span class="dm-chip"><b>' + drops + '</b> drop' + (drops === 1 ? '' : 's') + ' &middot; <b>' + (n - drops) + '</b> pickup' + (n - drops === 1 ? '' : 's') + '</span>' : '')
    + '<div class="dm-seg"><button class="on">Map</button><button onclick="dispatchSetViewMode(\'canvas\')">Canvas</button><button onclick="dispatchSetViewMode(\'list\')">List</button></div>'
    + '<button class="dm-btn" onclick="dispatchUndoLastChange()" title="Puts the drivers for this day back to how they were before the most recent change, whoever made it.">Undo</button>';
  S.root.querySelector('.dm-head').innerHTML = h;
}

function waitRow(j){
  var t = j._isDelivery && j.binDropoffTime ? 'at ' + dispatchFmtClock(dispatchParseClock(j.binDropoffTime)) : (dispatchNeedsBigTruck(j) ? DISPATCH_BIG_TRUCK_DRIVER + ' only' : '');
  if(!dispatchJobCoord(j)) t = (t ? t + ' &middot; ' : '') + 'not on map yet';
  return '<div class="dm-wrow" data-job="' + j.id + '" role="button" tabindex="0" title="Give this to the driver you picked">' + legHtml(j) + tagHtml(j)
    + '<span class="st">' + stopTxt(j) + '</span><span class="t">' + t + '</span></div>';
}
function crewCard(id){
  var c = dispatchCrewById(id); if(!c) return '';
  var sim = S.sims[id], jobs = S.ctx.byLane[id] || [], on = S.picked === id;
  var drops = jobs.filter(function(j){ return !j._isPickup; }).length, picks = jobs.length - drops;
  var span = sim ? Math.round(sim.endMins - sim.startMins) : 0, pct = Math.min(100, Math.round(span / DAY_MINS * 100));
  var bar = pct < 60 ? 'var(--accent)' : pct < 90 ? '#f59e0b' : '#ef4444';
  // A finish time is only claimed when a promised drop anchors the clock (same rule as the List view).
  var when = !sim ? 'No stops yet' : sim.anchored ? 'Leave by <b>' + dispatchFmtClock(sim.startMins) + '</b> &middot; done ~<b>' + dispatchFmtClock(sim.endMins) + '</b>' : 'No promised times';
  var h = '<div class="dm-card dm-crew' + (on ? ' on' : '') + '" data-pick="' + id + '" style="--c:' + colOf(c) + '" role="button" tabindex="0" aria-pressed="' + on + '">'
    + '<div class="dm-ch"><span class="dm-gslot" data-guy="' + id + '"></span><div><div class="dm-nm"><i></i>' + escHtml(c.name) + '</div>'
    + '<div class="dm-sub">' + (on ? 'Picked' : 'Click to pick') + '</div></div>'
    + '<div class="dm-big"><b>' + jobs.length + '</b><small>' + drops + ' drop' + (drops === 1 ? '' : 's') + ' &middot; ' + picks + ' pick' + (picks === 1 ? '' : 's') + '</small></div></div>'
    + '<div class="dm-cl"><span>On the road <b>' + (sim ? dispatchFmtTotal(span) : '-') + '</b></span><span>' + when + '</span></div>'
    + '<div class="dm-load"><i style="width:' + pct + '%;background:' + bar + '"></i></div>';
  if(sim && sim.misses) h += '<div class="dm-miss">&#9888; Misses ' + sim.misses + ' promised time' + (sim.misses === 1 ? '' : 's') + '</div>';
  h += '<div class="dm-say">Click stops on the map or in the list to give them to ' + escHtml(c.name) + '. Click one of theirs to take it off.</div>';
  if(sim){
    h += '<div class="dm-stops">' + sim.steps.map(function(s){
      var j = s.job;
      return '<div class="dm-srow' + (String(j.id) === String(S.newRow) ? ' new' : '') + '" data-job="' + j.id + '" title="Take this off ' + escHtml(c.name) + '">'
        + '<span class="t">' + dispatchFmtClock(s.arrive) + '</span>' + legHtml(j) + tagHtml(j) + '<span class="st">' + stopTxt(j) + '</span>'
        + (bigWarn(j, id) ? '<span class="w" title="A loaded ' + binSizeLabel(j.binSize) + ' needs ' + DISPATCH_BIG_TRUCK_DRIVER + '\'s truck">' + DISPATCH_BIG_TRUCK_DRIVER.charAt(0) + '!</span>' : '<span></span>') + '</div>';
    }).join('') + '</div>';
  }
  h += '<div class="dm-acts">' + (sim ? '<button data-play="' + id + '">&#9654; Play ' + escHtml(c.name) + '\'s run</button>' : '<button data-unwork="' + id + '">Not working this day</button>') + '</div>';
  return h + '</div>';
}
function drawCol(){
  var c = S.ctx, un = c.unassigned, h = '';
  if(!c.jobs.length) h += '<div class="dm-card dm-wait done"><h3>No bin stops on this day</h3></div>';
  else if(un.length) h += '<div class="dm-card dm-wait"><h3>Needs a driver <span class="n">' + un.length + '</span></h3>' + un.map(waitRow).join('') + '</div>';
  else h += '<div class="dm-card dm-wait done"><h3>Every stop has a driver</h3></div>';
  if(!c.laneIds.length) h += '<div class="dm-card dm-empty">Nobody is working this day yet. Add who is, below.</div>';
  c.laneIds.forEach(function(id){ h += crewCard(id); });
  var off = crewMembers.filter(function(m){ return c.laneIds.indexOf(m.id) < 0; });
  if(off.length) h += '<div class="dm-off"><span>Also working?</span>' + off.map(function(m){ return '<button data-work="' + m.id + '">+ ' + escHtml(m.name) + '</button>'; }).join('') + '</div>';
  var col = S.root.querySelector('.dm-col'), top = col.scrollTop;
  col.innerHTML = h;
  col.scrollTop = top;
}
function drawHint(){
  var c = S.picked && dispatchCrewById(S.picked);
  S.root.querySelector('.dm-hint').innerHTML = c
    ? 'Giving stops to <b>' + escHtml(c.name) + '</b>. Click a stop to give it to them, or one of theirs to take it off.'
    : '<b>Click a driver</b> on the right, then click stops to give them out. Their truck drives to each new stop.';
  var lost = S.ctx.jobs.filter(function(j){ return !dispatchJobCoord(j); }).length;
  S.root.querySelector('.dm-key').innerHTML = '<span><i></i>Drop-off</span><span><i class="sq"></i>Pick-up</span><span><i class="un"></i>Nobody yet</span><span>Number = bin size &middot; colour = driver</span>'
    + (lost ? '<span class="lost">' + lost + ' stop' + (lost === 1 ? ' is' : 's are') + ' still being found on the map</span>' : '');
}

// ─── the map ───
var DARK = [
  {elementType: 'geometry', stylers: [{color: '#1b2420'}]},
  {elementType: 'labels.text.fill', stylers: [{color: '#9aa49f'}]},
  {elementType: 'labels.text.stroke', stylers: [{color: '#111813'}]},
  {featureType: 'administrative', elementType: 'geometry', stylers: [{visibility: 'off'}]},
  {featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{color: '#dfe6e2'}]},
  {featureType: 'landscape.natural', elementType: 'geometry', stylers: [{color: '#1d2a22'}]},
  {featureType: 'poi', stylers: [{visibility: 'off'}]},
  {featureType: 'transit', stylers: [{visibility: 'off'}]},
  {featureType: 'road', elementType: 'geometry', stylers: [{color: '#2e3833'}]},
  {featureType: 'road', elementType: 'labels.icon', stylers: [{visibility: 'off'}]},
  {featureType: 'road.arterial', elementType: 'geometry', stylers: [{color: '#3a4640'}]},
  {featureType: 'road.highway', elementType: 'geometry', stylers: [{color: '#9c7c1c'}]},
  {featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{color: '#e8d9a8'}]},
  {featureType: 'water', elementType: 'geometry', stylers: [{color: '#0f2a36'}]},
  {featureType: 'water', elementType: 'labels.text.fill', stylers: [{color: '#4f7f96'}]}
];
function loadGoogle(){
  if(window.google && google.maps) return Promise.resolve();
  if(loadGoogle.p) return loadGoogle.p;
  loadGoogle.p = new Promise(function(res, rej){
    window.__dispatchMapReady = res;
    var s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GMAPS_KEY) + '&v=weekly&loading=async&callback=__dispatchMapReady';
    s.async = true;
    s.onerror = function(){ loadGoogle.p = null; rej(new Error('Google Maps did not load')); };
    document.head.appendChild(s);
  });
  return loadGoogle.p;
}
async function ensureMap(){
  if(S.map){ drawMapData(); return; }
  if(S.mapLoading) return;
  S.mapLoading = true;
  try { await loadGoogle(); }
  catch(e){
    S.mapLoading = false;
    S.root.querySelector('.dm-map').innerHTML = '<div class="dm-maperr">The map could not load. Check the connection and open Dispatch again.</div>';
    throw e;
  }
  S.map = new google.maps.Map(S.root.querySelector('.dm-map'), {
    center: YARD_LATLNG, zoom: 10, mapTypeId: 'roadmap', styles: DARK, backgroundColor: '#141a17',
    disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: 'greedy', isFractionalZoomEnabled: true
  });
  // Creating the map is the one thing Google bills; counted into the same table as the TV and Winter routes.
  db.rpc('bump_google_api', {p_api: 'maps_dynamic'}).then(function(r){ if(r.error) console.warn('map load not counted', r.error.message); });
  var Layer = class extends google.maps.OverlayView {
    constructor(){ super(); this.div = document.createElement('div'); this.div.className = 'dm-layer'; }
    onAdd(){ this.getPanes().overlayMouseTarget.appendChild(this.div); google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.div); }
    draw(){ placeAll(); }
    onRemove(){ this.div.remove(); }
  };
  S.layer = new Layer();
  // Pins swallow their own clicks (so the map does not drag), so they get the board's click handler directly.
  S.layer.div.addEventListener('click', onClick);
  S.layer.setMap(S.map);
  S.map.addListener('bounds_changed', kick);
  drawMapData();
}
function pinHtml(j){
  var owner = curOf(j), c = owner && dispatchCrewById(owner);
  var cls = 'dm-pin ' + (j._isPickup ? 'pick' : 'drop') + (owner ? '' : ' un')
    + (S.picked && owner && owner !== S.picked ? ' dim' : '')
    + (String(S.hidden) === String(j.id) ? ' wait' : '') + (String(S.pop) === String(j.id) ? ' pop' : '');
  var p = dispatchJobCoord(j);
  var tip = (sizeN(j) ? sizeN(j) + ' yd ' : '') + (j._isPickup ? 'pickup' : 'drop') + ' · ' + (j.address || '') + ', ' + (j.city || '') + ' · ' + (c ? c.name : 'nobody yet');
  return '<button type="button" class="' + cls + '" data-job="' + j.id + '" data-lat="' + p.lat + '" data-lng="' + p.lng + '" style="--c:' + (c ? colOf(c) : '#64748b') + '" title="' + escHtml(tip) + '">'
    + (sizeN(j) || '?') + '<i>' + (j._isPickup ? '&uarr;' : '&darr;') + '</i>'
    + (dispatchNeedsBigTruck(j) ? '<b class="' + (bigWarn(j, owner) ? 'bad' : '') + '" title="' + DISPATCH_BIG_TRUCK_DRIVER + ' only">' + DISPATCH_BIG_TRUCK_DRIVER.charAt(0) + '</b>' : '') + '</button>';
}
function drawMapData(){
  if(!S.map) return;
  var jobs = S.ctx.jobs.filter(function(j){ return dispatchJobCoord(j); });
  // big town names, under the town's stops so the pins never cover them
  var towns = {};
  jobs.forEach(function(j){
    var t = townOf(j), p = dispatchJobCoord(j); if(!t) return;
    var o = towns[t] = towns[t] || {n: 0, lng: 0, lat: 90};
    o.n++; o.lng += p.lng; o.lat = Math.min(o.lat, p.lat);
  });
  var h = Object.keys(towns).map(function(t){ var o = towns[t]; return '<div class="dm-town" data-lat="' + o.lat + '" data-lng="' + (o.lng / o.n) + '">' + escHtml(t) + '</div>'; }).join('')
    + '<div class="dm-base yard" data-lat="' + YARD_LATLNG.lat + '" data-lng="' + YARD_LATLNG.lng + '">YARD</div>'
    + '<div class="dm-base dump" data-lat="' + DUMP_LATLNG.lat + '" data-lng="' + DUMP_LATLNG.lng + '">DUMP</div>'
    + jobs.map(pinHtml).join('');
  S.layer.div.innerHTML = h;
  drawRuns();
  placeAll();
  if(S.fitted !== S.ctx.date){
    S.fitted = S.ctx.date;
    var b = new google.maps.LatLngBounds(); b.extend(YARD_LATLNG);
    jobs.forEach(function(j){ b.extend(dispatchJobCoord(j)); });
    if(jobs.length) S.map.fitBounds(b, 60); else { S.map.setCenter(YARD_LATLNG); S.map.setZoom(10); }
  }
}
// Each driver's run as a line, yard to yard in the board's order. The picked driver's is bold.
function drawRuns(){
  S.lines.forEach(function(l){ l.setMap(null); });
  S.lines = [];
  S.ctx.laneIds.forEach(function(id){
    var sim = S.sims[id], c = dispatchCrewById(id); if(!sim || !c) return;
    var path = [YARD_LATLNG];
    sim.steps.forEach(function(s){ var p = dispatchJobCoord(s.job); if(p && String(s.job.id) !== String(S.hidden)) path.push(p); });
    path.push(YARD_LATLNG);
    if(path.length < 3) return;
    var on = S.picked === id;
    S.lines.push(new google.maps.Polyline({map: S.map, path: path, clickable: false, strokeColor: colOf(c),
      strokeOpacity: on ? .95 : (S.picked ? .2 : .6), strokeWeight: on ? 4 : 3, zIndex: on ? 2 : 1}));
  });
}
function placeAll(){
  var pr = S.layer && S.layer.getProjection(); if(!pr) return;
  S.layer.div.querySelectorAll('[data-lat]').forEach(function(el){
    var p = pr.fromLatLngToDivPixel(new google.maps.LatLng(+el.dataset.lat, +el.dataset.lng));
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    if(el.classList.contains('dm-pin')) el.style.zIndex = String(Math.round(p.y + 20000));
  });
  kick();
}
// lat/lng -> pixels inside the board (the 3D layer's frame)
function toBoard(p, rr){
  var pr = S.layer && S.layer.getProjection(); if(!pr) return null;
  var q = pr.fromLatLngToContainerPixel(new google.maps.LatLng(p.lat, p.lng)), mr = S.mapRect;
  return {x: q.x + mr.left - rr.left, y: q.y + mr.top - rr.top};
}

// ─── clicks ───
function onClick(e){
  var el;
  if((el = e.target.closest('[data-play]'))){ e.stopPropagation(); playRun(el.dataset.play); return; }
  if((el = e.target.closest('[data-unwork]'))){ e.stopPropagation(); dispatchToggleWorking(el.dataset.unwork); return; }
  if((el = e.target.closest('[data-work]'))){ dispatchToggleWorking(el.dataset.work); return; }
  if((el = e.target.closest('[data-job]'))){ e.stopPropagation(); assign(el.dataset.job); return; }
  if((el = e.target.closest('[data-pick]'))){ pick(el.dataset.pick); return; }
}
function pick(id){
  if(S.picked === id) return;
  S.picked = id;
  drawCol(); drawHint();
  if(S.map){ drawMapData(); }
  guyPlay(id, 'wave', 2.2);
}
async function assign(jobId){
  var j = find(jobId); if(!j) return;
  if(!S.picked){ toast('Click a driver on the right first'); S.ctx.laneIds.forEach(function(id){ guyPlay(id, 'wave', 1.2); }); return; }
  var from = curOf(j), to = from === S.picked ? '' : S.picked;
  var before = S.ctx.unassigned.length;
  await dispatchAssignJob(j.id, to, j._isPickup ? 'pickup' : 'drop');
  // dispatchAssignJob changes the job in place only once the box was answered yes; it
  // has already asked for a redraw, which lands after this (it waits on the database).
  if(curOf(j) === to) S.pending = {id: j.id, to: to, from: from, before: before};
}
// Runs inside render, with the day reloaded from the database: only a change that
// really saved gets its cheer and its drive.
function takePending(){
  var p = S.pending; S.pending = null;
  if(!p) return null;
  var j = find(p.id);
  if(!j || curOf(j) !== p.to) return null;
  return {p: p, j: j};
}
function celebrate(hit){
  var p = hit.p, j = hit.j;
  if(!p.to){ toast('Took it off ' + nameOf(p.from)); return; }
  S.newRow = j.id;
  guyPlay(p.to, 'cheer', 1.1);
  toast(bigWarn(j, p.to) ? 'Heads up: only ' + DISPATCH_BIG_TRUCK_DRIVER + '\'s truck can pick up a loaded ' + binSizeLabel(j.binSize)
    : (sizeN(j) ? sizeN(j) + ' yd ' : '') + (j._isPickup ? 'pickup' : 'drop') + ' in ' + (j.city || '?') + ' → ' + nameOf(p.to) + (p.from ? ' (was ' + nameOf(p.from) + ')' : ''));
  var sets = p.before && !S.ctx.unassigned.length;
  var dest = dispatchJobCoord(j);
  if(!dest || !S.map){ if(sets) allSet(); return; }
  var sim = S.sims[p.to], k = sim ? sim.steps.findIndex(function(s){ return String(s.job.id) === String(j.id); }) : -1, start = YARD_LATLNG;
  for(var i = k - 1; i >= 0; i--){ var c = dispatchJobCoord(sim.steps[i].job); if(c){ start = c; break; } }
  S.hidden = j.id;
  drawMapData();   // the new stop waits for its truck
  drive(p.to, [start, dest], [j], function(){
    S.hidden = null; S.pop = j.id; drawMapData();
    setTimeout(function(){ if(String(S.pop) === String(j.id)){ S.pop = null; drawMapData(); } }, 1400);
    if(sets) allSet();
  });
}
function allSet(){
  var s = document.createElement('div');
  s.className = 'dm-stamp'; s.textContent = 'ALL SET FOR ' + dayLabel().stamp;
  S.root.appendChild(s);
  setTimeout(function(){ s.remove(); }, 2900);
  S.ctx.laneIds.forEach(function(id, i){ setTimeout(function(){ guyPlay(id, 'cheer', 1.6); }, i * 120); });
}
function playRun(id){
  var sim = S.sims[id]; if(!sim || !S.map) return;
  var pts = [YARD_LATLNG], stops = [];
  sim.steps.forEach(function(s){ var p = dispatchJobCoord(s.job); if(p){ pts.push(p); stops.push(s.job); } });
  pts.push(YARD_LATLNG); stops.push(null);
  if(pts.length < 3) return;
  toast(nameOf(id) + '\'s run, start to finish');
  drive(id, pts, stops, function(){ toast(nameOf(id) + ' back at the yard' + (sim.anchored ? ' about ' + dispatchFmtClock(sim.endMins) : '')); });
}

// ─── render: called by renderDispatch when the view is Map ───
function render(host, ctx){
  S.ctx = ctx;
  if(S.picked && ctx.laneIds.indexOf(S.picked) < 0) S.picked = null;
  S.sims = {};
  ctx.laneIds.forEach(function(id){ var l = ctx.byLane[id] || []; S.sims[id] = l.length ? dispatchSimulateLane(l) : null; });
  if(!S.root) buildRoot();
  if(S.root.parentNode !== host){ host.innerHTML = ''; host.appendChild(S.root); }
  var hit = takePending();
  if(!hit) S.newRow = null;
  drawHead(); drawCol(); drawHint();
  fitHeight();
  ensureMap().then(function(){ if(hit) celebrate(hit); });
  ensure3d();
}

// ═══════════════════ the 3D layer ═══════════════════
// One see-through canvas over the board. Models stand on a ground plane tipped toward
// the viewer, so a model placed at a pixel keeps that pixel and still looks 3D. It
// draws only while something moves; the guys stand still until a person does something.
var X = null;           // everything three.js, built once it has loaded
var raf = 0, drv = null, hideT = null;
var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function loadThree(){
  if(window.THREE) return Promise.resolve();
  if(loadThree.p) return loadThree.p;
  loadThree.p = new Promise(function(res, rej){
    var s = document.createElement('script');
    s.src = THREE_URL;
    s.onload = res;
    s.onerror = function(){ loadThree.p = null; rej(new Error('three.js did not load')); };
    document.head.appendChild(s);
  });
  return loadThree.p;
}
function ensure3d(){
  if(X){ kick(); return; }
  loadThree().then(function(){ if(!X) X = build3d(S.root.querySelector('.dm-fx')); kick(); })
    .catch(function(e){ console.warn('Dispatch map: no 3D layer —', e.message); });
}
function kick(){ if(!raf && X && X.renderer) raf = requestAnimationFrame(frame); }
function guyPlay(id, kind, secs){ if(!X || !X.renderer) return; X.guy(id).play(kind, secs); }

function build3d(canvas){
  var T = THREE, renderer;
  try { renderer = new T.WebGLRenderer({canvas: canvas, alpha: true, antialias: true}); }
  catch(e){ console.warn('Dispatch map: WebGL is off on this computer, so no 3D'); return {renderer: null}; }

  // ---- the truck and bin models (the office TV scene's, built in feet)
  var BIN_FT = {4: {L: 6, W: 6, H: 3}, 7: {L: 10, W: 6, H: 3.15}, 14: {L: 14, W: 7, H: 3.86}, 20: {L: 16, W: 7.5, H: 4.5}};
  var matCache = {};
  function M(c, o){ var k = c + (o ? JSON.stringify(o) : ''); return matCache[k] || (matCache[k] = new T.MeshStandardMaterial(Object.assign({color: c, roughness: 0.65, metalness: 0.05}, o || {}))); }
  var steel = M(0x2a2d32, {roughness: 0.6, metalness: 0.3}), chrome = M(0xd6d9dd, {roughness: 0.22, metalness: 0.85});
  var glass = M(0x1c2731, {roughness: 0.08, metalness: 0.6}), tire = M(0x18181a, {roughness: 0.92}), rim = M(0xc3c6ca, {roughness: 0.3, metalness: 0.7});
  var lift = M(0x33373d, {roughness: 0.5, metalness: 0.35}), cabMat = M(0xf3f2ee, {roughness: 0.35});
  var amber = M(0xf59e0b, {emissive: 0x6b3f00}), red = M(0xdc2626, {emissive: 0x500000}), lamp = M(0xfff6dc, {emissive: 0x7a7050});
  function add(m, p, x, y, z){ m.position.set(x, y, z); p.add(m); return m; }
  function box(w, h, d, mat, x, y, z, p){ return add(new T.Mesh(new T.BoxGeometry(w, h, d), mat), p, x, y, z); }
  function cyl(r, len, mat, x, y, z, p, axis, seg){
    var m = add(new T.Mesh(new T.CylinderGeometry(r, r, len, seg || 24), mat), p, x, y, z);
    if(axis === 'z') m.rotation.x = Math.PI / 2; if(axis === 'x') m.rotation.z = Math.PI / 2; return m;
  }
  var UP = new T.Vector3(0, 1, 0);
  function rod(a, b, r, mat, p){
    var m = add(new T.Mesh(new T.CylinderGeometry(r, r, 1, 12), mat), p, 0, 0, 0);
    var d = new T.Vector3().subVectors(b, a); m.scale.set(1, d.length(), 1);
    m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); return m;
  }
  function wheel(p, x, z, w, outer){
    cyl(1.65, w, tire, x, 1.65, z, p, 'z', 32);
    var s = outer > 0 ? 1 : -1;
    cyl(1.02, 0.08, rim, x, 1.65, z + s * (w / 2 + 0.01), p, 'z', 28);
    cyl(0.42, 0.22, chrome, x, 1.65, z + s * (w / 2 + 0.08), p, 'z', 16);
    for(var i = 0; i < 8; i++){ var a = i / 8 * Math.PI * 2; cyl(0.06, 0.12, chrome, x + Math.cos(a) * 0.62, 1.65 + Math.sin(a) * 0.62, z + s * (w / 2 + 0.07), p, 'z', 6); }
  }
  var decals = {};
  function decal(text, sub, wFt, hFt, col){
    var k = [text, sub, wFt, hFt, col].join('|');
    if(!decals[k]){
      var c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * hFt / wFt); var g = c.getContext('2d');
      g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 ' + Math.round(c.height * 0.46) + 'px Arial Black, Arial, sans-serif'; g.fillText(text, c.width / 2, c.height * (sub ? 0.4 : 0.52));
      if(sub){ g.font = '700 ' + Math.round(c.height * 0.24) + 'px Arial, sans-serif'; g.fillText(sub, c.width / 2, c.height * 0.8); }
      var t = new T.CanvasTexture(c); t.anisotropy = 4;
      decals[k] = new T.MeshStandardMaterial({map: t, roughness: 0.5});
    }
    return new T.Mesh(new T.PlaneGeometry(wFt, hFt), decals[k]);
  }
  // fold a model's many small parts into one mesh per material, so it draws fast
  function bake(root){
    root.updateMatrixWorld(true);
    var by = new Map();
    root.traverse(function(o){
      if(!o.isMesh) return;
      var g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      if(!by.has(o.material)) by.set(o.material, []);
      by.get(o.material).push(g);
    });
    var out = new T.Group();
    by.forEach(function(list, mat){
      var merged = new T.BufferGeometry();
      ['position', 'normal', 'uv'].forEach(function(name){
        if(!list.every(function(g){ return g.attributes[name]; })) return;
        var arr = new Float32Array(list.reduce(function(n, g){ return n + g.attributes[name].array.length; }, 0)), off = 0;
        list.forEach(function(g){ arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; });
        merged.setAttribute(name, new T.BufferAttribute(arr, list[0].attributes[name].itemSize));
      });
      list.forEach(function(g){ g.dispose(); });
      out.add(new T.Mesh(merged, mat));
    });
    return out;
  }
  function seeded(s){ return function(){ return (s = (s * 16807) % 2147483647) / 2147483647; }; }
  // a roll-off bin: door end at x = 0, hook end at +x, rim in the app's size colour
  function buildBin(size, loaded){
    var dim = BIN_FT[size], L = dim.L, Wd = dim.W, Ht = dim.H, g = new T.Group(), body = M(0x24493a, {roughness: 0.55, metalness: 0.2});
    var dark = M(0x1a3529, {roughness: 0.6, metalness: 0.2}), rimM = M(binSizeColor(size), {roughness: 0.45, metalness: 0.2}), y0 = 0.45, hw = Wd / 2;
    [-1, 1].forEach(function(z){ box(L, 0.45, 0.4, steel, L / 2, 0.225, z * (hw - 0.7), g); cyl(0.36, 0.42, steel, 0.35, 0.36, z * (hw - 0.7), g, 'z', 16); });
    box(L, 0.2, Wd, dark, L / 2, y0 + 0.1, 0, g);
    [-1, 1].forEach(function(z){ box(L, Ht, 0.12, body, L / 2, y0 + Ht / 2, z * hw, g); });
    box(0.12, Ht, Wd, body, L - 0.06, y0 + Ht / 2, 0, g);
    box(0.14, Ht - 0.1, Wd - 0.1, body, 0.07, y0 + Ht / 2, 0, g);
    [-1, 1].forEach(function(z){
      for(var x = 1; x < L - 0.5; x += 2) box(0.28, Ht, 0.24, dark, x, y0 + Ht / 2, z * (hw + 0.13), g);
      box(L + 0.3, 0.36, 0.42, rimM, L / 2, y0 + Ht + 0.06, z * (hw + 0.05), g);
      box(L, 0.32, 0.32, dark, L / 2, y0 + 0.2, z * (hw + 0.12), g);
    });
    [-0.05, L + 0.05].forEach(function(x){ box(0.42, 0.36, Wd + 0.5, rimM, x, y0 + Ht + 0.06, 0, g); });
    for(var i = 0; i < 3; i++) cyl(0.11, 0.45, chrome, -0.12, y0 + 0.5 + i * (Ht - 1) / 2, hw - 0.2, g, 'y', 10);
    [-hw / 2, hw / 2].forEach(function(z){ cyl(0.07, Ht - 0.3, chrome, -0.16, y0 + Ht / 2, z, g, 'y', 8); box(0.12, 0.12, 0.6, chrome, -0.22, y0 + Ht * 0.45, z + 0.25, g); });
    var ax = L + 1.3, ay = y0 + Ht + 0.85;
    [-1, 1].forEach(function(z){
      rod(new T.Vector3(L, 0.5, z * 1.5), new T.Vector3(ax, ay, z * 0.65), 0.17, steel, g);
      rod(new T.Vector3(L, y0 + Ht, z * 0.9), new T.Vector3(ax, ay, z * 0.65), 0.12, steel, g);
    });
    cyl(0.16, 1.7, chrome, ax, ay, 0, g, 'z', 14);
    var d = decal("JEFF'S JUNK", size + ' YARD', Math.min(5.5, L * 0.42), Math.min(1.7, Ht * 0.44), '#16a34a');
    [-1, 1].forEach(function(z){ var m = d.clone(); m.position.set(L * 0.5, y0 + Ht * 0.55, z * (hw + 0.27)); if(z < 0) m.rotation.y = Math.PI; g.add(m); });
    if(loaded){     // a pickup: full of junk, with a sofa on top in the bigger bins
      var r = seeded(size * 977 + 13), cols = [0x8b6b4a, 0xa98a62, 0x6f7378, 0x4b5563, 0xb45309, 0x7c2d12, 0x9ca3af, 0x3f6212, 0xd6d3d1, 0x57534e];
      var n = Math.round(L * Wd * 0.9);
      for(var q = 0; q < n; q++){
        var x = 0.6 + r() * (L - 1.2), z = (r() - 0.5) * (Wd - 1.2), heap = 1 - Math.pow(Math.abs(x - L * 0.55) / (L * 0.55), 2) * 0.6;
        var s = 0.5 + r() * 1.6, m = box(s * (0.8 + r()), s * (0.4 + r() * 0.6), s * (0.6 + r() * 0.8), M(cols[(r() * cols.length) | 0], {roughness: 0.85}), x, y0 + 0.3 + r() * Ht * heap * 0.95, z, g);
        m.rotation.set((r() - 0.5) * 0.8, r() * 3, (r() - 0.5) * 0.8);
      }
      if(L >= 10){
        var sofa = new T.Group(), cloth = M(0x7f1d1d, {roughness: 0.95});
        box(5.5, 1.1, 2.4, cloth, 0, 0, 0, sofa); box(5.5, 1.6, 0.7, cloth, 0, 0.8, -0.9, sofa);
        [-2.6, 2.6].forEach(function(x2){ box(0.5, 1.4, 2.4, M(0x6b1818, {roughness: 0.95}), x2, 0.4, 0, sofa); });
        sofa.position.set(L * 0.4, y0 + Ht * 0.85, 0.4); sofa.rotation.set(0.25, 0.3, -0.15); g.add(sofa);
      }
    }
    return g;
  }
  var binTpl = {};
  function binModel(size, loaded){
    var k = size + (loaded ? 'L' : 'E');
    if(!binTpl[k]) binTpl[k] = bake(buildBin(size, loaded));
    return binTpl[k].clone();
  }
  // the hook-lift truck, about 27 ft long; cab faces +x; the cab stripe is the driver's colour
  function buildTruckModel(stripeCol){
    var g = new T.Group(), stripe = M(stripeCol, {roughness: 0.4});
    [-1, 1].forEach(function(z){ box(25, 0.7, 0.35, steel, -1.5, 2.85, z * 1.45, g); });
    [-12, -7, -2, 3, 8].forEach(function(x){ box(0.35, 0.5, 2.6, steel, x, 2.85, 0, g); });
    cyl(0.28, 6.8, steel, 8.2, 1.65, 0, g, 'z'); cyl(0.32, 7.6, steel, -6.4, 1.65, 0, g, 'z');
    box(1.6, 1.0, 1.4, steel, -6.4, 1.9, 0, g);
    [-1, 1].forEach(function(s){ wheel(g, 8.2, s * 3.35, 1.05, s); wheel(g, -6.4, s * 2.75, 0.95, -s); wheel(g, -6.4, s * 3.75, 0.95, s); });
    box(5.3, 6.3, 7.4, cabMat, 6.4, 6.45, 0, g);
    box(0.6, 0.35, 7.5, cabMat, 8.85, 9.55, 0, g);
    box(0.1, 2.6, 6.5, glass, 9.06, 8.0, 0, g);
    box(0.12, 0.18, 6.9, chrome, 9.1, 9.35, 0, g);
    [-1, 1].forEach(function(s){
      box(2.8, 2.3, 0.06, glass, 7.3, 8.05, s * 3.72, g);
      box(1.4, 1.6, 0.06, glass, 4.7, 8.25, s * 3.72, g);
      box(0.06, 5.0, 0.04, steel, 5.75, 6.4, s * 3.73, g);
      box(0.5, 0.12, 0.12, chrome, 6.2, 6.6, s * 3.78, g);
      box(5.32, 0.55, 0.04, stripe, 6.4, 4.6, s * 3.72, g);
      box(0.18, 0.18, 1.1, steel, 8.7, 8.4, s * 4.25, g);
      box(0.25, 1.5, 0.65, steel, 8.6, 8.2, s * 4.85, g);
      box(0.06, 1.3, 0.5, glass, 8.46, 8.2, s * 4.85, g);
      box(4.2, 0.3, 1.5, cabMat, 8.3, 3.75, s * 3.4, g);
      box(0.9, 0.3, 1.5, cabMat, 10.2, 3.45, s * 3.4, g);
      box(1.3, 0.14, 0.75, chrome, 5.0, 2.3, s * 3.95, g); box(1.3, 0.14, 0.75, chrome, 5.0, 3.3, s * 3.95, g);
      box(0.16, 0.6, 1.0, lamp, 12.67, 5.65, s * 2.45, g);
      box(0.14, 0.3, 0.5, amber, 12.67, 4.95, s * 2.6, g);
      box(0.3, 0.35, 0.35, red, -14.0, 3.0, s * 1.4, g);
      box(0.08, 1.7, 1.9, tire, -8.6, 1.45, s * 3.3, g);
    });
    for(var i = -2; i <= 2; i++) box(0.3, 0.16, 0.5, amber, 8.85, 9.78, i * 1.2, g);
    box(3.7, 3.0, 6.4, cabMat, 10.8, 5.1, 0, g);
    box(3.7, 0.08, 1.2, stripe, 10.8, 6.62, 0, g);
    box(0.12, 2.5, 3.8, steel, 12.66, 5.05, 0, g);
    for(var k = 0; k < 6; k++) box(0.08, 0.1, 3.7, chrome, 12.74, 4.0 + k * 0.42, 0, g);
    [3.75, 6.35].forEach(function(y){ box(0.14, 0.14, 4.0, chrome, 12.74, y, 0, g); });
    [-2.0, 2.0].forEach(function(z){ box(0.14, 2.7, 0.14, chrome, 12.74, 5.05, z, g); });
    box(0.8, 0.85, 7.8, chrome, 13.05, 3.4, 0, g);
    cyl(0.85, 3.4, chrome, 1.4, 2.55, 3.0, g, 'x');
    box(2.0, 1.4, 1.2, steel, 1.4, 2.6, -3.0, g);
    cyl(0.24, 7.0, chrome, 3.55, 7.8, -3.95, g, 'y'); cyl(0.3, 0.6, steel, 3.55, 11.2, -3.95, g, 'y');
    box(0.25, 5.4, 0.25, steel, 3.4, 5.9, -3.4, g); box(0.25, 5.4, 0.25, steel, 3.4, 5.9, 3.4, g); box(0.25, 0.25, 7.0, steel, 3.4, 8.5, 0, g);
    for(var z2 = -2.6; z2 <= 2.7; z2 += 0.65) box(0.1, 5.2, 0.1, steel, 3.4, 5.9, z2, g);
    var A = new T.Group(); A.position.set(-13.6, 3.25, 0); g.add(A);     // the hook-lift arm, lowered
    [-1, 1].forEach(function(z){ box(16.2, 0.5, 0.4, lift, 8.1, 0.25, z * 1.2, A); });
    [2, 6, 10, 14].forEach(function(x){ box(0.3, 0.4, 2.4, lift, x, 0.25, 0, A); });
    cyl(0.45, 3.2, chrome, 0, 0.05, 0, A, 'z', 20);
    box(0.85, 6.6, 1.1, lift, 16.4, 3.3, 0, A);
    box(1.2, 0.6, 0.9, lift, 15.9, 6.4, 0, A);
    var hook = add(new T.Mesh(new T.TorusGeometry(0.45, 0.15, 10, 20, Math.PI * 1.3), chrome), A, 15.45, 5.75, 0); hook.rotation.z = Math.PI * 0.35;
    [-0.75, 0.75].forEach(function(z){ rod(new T.Vector3(12.5, 0.5, z), new T.Vector3(16.0, 4.6, z), 0.16, chrome, A); });
    rod(new T.Vector3(-3.0, 2.9, 0), new T.Vector3(-4.1, 3.25, 0), 0.28, chrome, g);   // lift ram, at rest
    return g;
  }

  // ---- scenes: crew guys on the cards, trucks on the map
  var scene = new T.Scene(), mapScene = new T.Scene();
  var cam = new T.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  [scene, mapScene].forEach(function(sc){
    sc.add(new T.HemisphereLight(0xf2f7ff, 0x3a4a3f, 0.95));
    var sun = new T.DirectionalLight(0xfff4e0, 0.85); sun.position.set(-0.5, 0.9, 1.2); sc.add(sun);
    var rimL = new T.DirectionalLight(0xbfe9ff, 0.35); rimL.position.set(1, 0.4, -0.6); sc.add(rimL);
  });
  var TIP = 52 * Math.PI / 180, GUY_TIP = 14 * Math.PI / 180;
  function holder(tip, parent){ var h = new T.Group(), yaw = new T.Group(); h.rotation.x = tip; h.add(yaw); parent.add(h); return {h: h, yaw: yaw}; }

  // ---- a little crew guy, built in code
  var SKIN = 0xf1c9a5;
  function soft(c, o){ return new T.MeshStandardMaterial(Object.assign({color: c, roughness: 0.62, metalness: 0}, o || {})); }
  function sph(r, mat, x, y, z, p, sx, sy, sz){ var m = new T.Mesh(new T.SphereGeometry(r, 24, 18), mat); m.position.set(x, y, z); if(sx) m.scale.set(sx, sy, sz); p.add(m); return m; }
  function cyl2(rt, rb, h, mat, x, y, z, p){ var m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, 24), mat); m.position.set(x, y, z); p.add(m); return m; }
  function buildGuy(c){
    var hat = hatOf(c), g = new T.Group(), skin = soft(SKIN), shirt = soft(colOf(c)), pants = soft(0x2f3a48), boot = soft(0x3b2a1e), dark = soft(0x1f2937, {roughness: 0.3});
    var hi = soft(0xe5e7eb, {roughness: 0.35, emissive: 0x222222});
    var body = new T.Group(); g.add(body);
    var legs = [], arms = [];
    [-1, 1].forEach(function(s){ var L = new T.Group(); L.position.set(s * 0.17, 0.62, 0); body.add(L);
      cyl2(0.13, 0.12, 0.44, pants, 0, -0.22, 0, L); sph(0.16, boot, 0, -0.48, 0.05, L, 1, 0.7, 1.35); legs.push(L); });
    cyl2(0.34, 0.39, 0.62, shirt, 0, 0.98, 0, body); sph(0.39, shirt, 0, 0.7, 0, body, 1, 0.55, 1);
    sph(0.34, shirt, 0, 1.28, 0, body, 1, 0.45, 1);
    cyl2(0.352, 0.37, 0.07, hi, 0, 0.92, 0, body);
    [-1, 1].forEach(function(s){ var A = new T.Group(); A.position.set(s * 0.4, 1.22, 0); body.add(A);
      cyl2(0.1, 0.09, 0.44, shirt, 0, -0.2, 0, A); sph(0.11, skin, 0, -0.45, 0, A); A.rotation.z = s * 0.18; arms.push(A); });
    var headG = new T.Group(); headG.position.set(0, 1.86, 0); body.add(headG);
    sph(0.5, skin, 0, 0, 0, headG, 1, 0.94, 0.96);
    [-1, 1].forEach(function(s){ sph(0.1, skin, s * 0.49, -0.02, 0, headG, 0.6, 1, 1);
      sph(0.065, dark, s * 0.17, 0.02, 0.45, headG, 1, 1.25, 0.6); sph(0.02, soft(0xffffff), s * 0.17 + 0.02, 0.06, 0.48, headG);
      sph(0.075, soft(0xf87171, {transparent: true, opacity: 0.5}), s * 0.27, -0.13, 0.4, headG, 1, 0.7, 0.4); });
    var smile = new T.Mesh(new T.TorusGeometry(0.11, 0.022, 8, 20, Math.PI), dark); smile.position.set(0, -0.12, 0.45); smile.rotation.z = Math.PI; headG.add(smile);
    var hc = soft(hat[1]);
    if(hat[0] === 'cap'){ var d1 = new T.Mesh(new T.SphereGeometry(0.52, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hc); d1.position.y = 0.06; headG.add(d1);
      var brim = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.04, 24, 1, false, -Math.PI / 2, Math.PI), hc); brim.position.set(0, 0.07, 0.42); brim.scale.set(1.2, 1, 1); headG.add(brim);
      sph(0.06, soft(0xffffff), 0, 0.57, 0, headG); }
    if(hat[0] === 'hard'){ var d2 = new T.Mesh(new T.SphereGeometry(0.54, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hc); d2.position.y = 0.08; headG.add(d2);
      cyl2(0.66, 0.66, 0.05, soft(0xeab308), 0, 0.09, 0.04, headG); cyl2(0.06, 0.06, 0.06, soft(0xeab308), 0, 0.6, 0, headG).scale.set(1, 1, 5); }
    if(hat[0] === 'toque'){ var d3 = new T.Mesh(new T.SphereGeometry(0.53, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hc); d3.position.y = 0.06; d3.scale.set(1, 1.15, 1); headG.add(d3);
      cyl2(0.54, 0.54, 0.16, hc, 0, 0.1, 0, headG); sph(0.15, soft(0xffffff), 0, 0.68, 0, headG); }
    if(hat[0] === 'bucket'){ cyl2(0.38, 0.5, 0.36, hc, 0, 0.3, 0, headG); cyl2(0.72, 0.72, 0.04, hc, 0, 0.12, 0, headG); }
    g.userData = {body: body, arms: arms, legs: legs, head: headG};
    return g;
  }
  // wave = picked; cheer = given a stop, or the day is set
  function animGuy(u, kind, t, k){
    var L = u.arms[0], R = u.arms[1], f = Math.min(1, t * 4) * Math.min(1, (k - t) * 4 + 0.001);
    u.body.position.y = 0; u.head.rotation.z = 0; L.rotation.z = -0.18; R.rotation.z = 0.18;
    if(kind === 'wave'){ R.rotation.z = 0.18 + f * (2.15 + Math.sin(t * 14) * 0.4); u.head.rotation.z = Math.sin(t * 7) * 0.08 * f; u.body.position.y = Math.abs(Math.sin(t * 7)) * 0.05 * f; }
    if(kind === 'cheer'){ var hop = Math.abs(Math.sin(t * Math.PI * 2.2)); u.body.position.y = hop * 0.35 * f;
      L.rotation.z = -0.18 - f * 2.2; R.rotation.z = 0.18 + f * 2.2; u.head.rotation.z = Math.sin(t * 9) * 0.1 * f; }
  }
  var guys = {};
  function guy(id){
    if(guys[id]) return guys[id];
    var c = dispatchCrewById(id);
    if(!c) return {play: function(){}};
    var hd = holder(GUY_TIP, scene), m = buildGuy(c); m.scale.setScalar(27); hd.yaw.add(m);
    var a = {id: id, hd: hd, m: m, anim: null, play: function(kind, secs){ a.anim = {kind: kind, t0: performance.now(), k: secs}; kick(); }};
    return (guys[id] = a);
  }

  // ---- trucks: about 75 px long on the map, the driver popping out of the roof to wave
  var PX_FT = 3.3, truckTpl = {}, trucks = {}, shTex = null;
  function shadowTex(){
    if(shTex) return shTex;
    var c = document.createElement('canvas'); c.width = 128; c.height = 64; var g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 32, 4, 64, 32, 62); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 64);
    return (shTex = new T.CanvasTexture(c));
  }
  function truck(id){
    if(trucks[id]) return trucks[id];
    var c = dispatchCrewById(id), hd = holder(TIP, mapScene);
    var body = (truckTpl[id] = truckTpl[id] || bake(buildTruckModel(colOf(c)))).clone(); body.scale.setScalar(PX_FT); hd.yaw.add(body);
    var slot = new T.Group(); slot.position.set(-13.4 * PX_FT, 3.75 * PX_FT, 0); hd.yaw.add(slot);
    var RS = 4.4 * PX_FT, rider = buildGuy(c); rider.scale.setScalar(RS); rider.position.set(6.2 * PX_FT, 9.6 * PX_FT - 1.15 * RS, 0);
    rider.userData.legs.forEach(function(l){ l.visible = false; });
    rider.rotation.order = 'YXZ'; rider.rotation.x = -(TIP - GUY_TIP);   // head and shoulders out of the roof, tipped toward you
    hd.yaw.add(rider);
    var shadow = new T.Mesh(new T.PlaneGeometry(34 * PX_FT, 11 * PX_FT), new T.MeshBasicMaterial({map: shadowTex(), transparent: true, depthWrite: false}));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(-1 * PX_FT, 0.05, 0); hd.yaw.add(shadow);
    hd.h.visible = false;
    return (trucks[id] = {hd: hd, slot: slot, riderObj: rider, rider: rider.userData, carry: null, pos: null, heading: 0});
  }
  function setCarry(t, j, loaded){
    if(t.carry){ t.slot.remove(t.carry); t.carry = null; }
    if(!j || !BIN_FT[sizeN(j)]) return;
    t.carry = binModel(sizeN(j), loaded); t.carry.scale.setScalar(PX_FT); t.slot.add(t.carry);
  }
  function hideTrucks(){ Object.keys(trucks).forEach(function(k){ trucks[k].hd.h.visible = false; }); }

  return {renderer: renderer, scene: scene, mapScene: mapScene, cam: cam, TIP: TIP, guys: guys, guy: guy, trucks: trucks, truck: truck,
          setCarry: setCarry, hideTrucks: hideTrucks, animGuy: animGuy};
}

// ─── a drive: along real roads, the bin on the back (a drop) or picked up at the stop (a pickup) ───
function metres(a, b){
  var k = Math.cos(a.lat * Math.PI / 180) * 111320;
  return Math.hypot((b.lng - a.lng) * k, (b.lat - a.lat) * 110574);
}
// One OSRM route through every point; the line is cut back into legs at each point.
async function roadLegs(pts){
  var url = 'https://router.project-osrm.org/route/v1/driving/' + pts.map(function(p){ return p.lng + ',' + p.lat; }).join(';') + '?overview=full&geometries=geojson';
  var r = await fetch(url), json = await r.json();
  if(json.code !== 'Ok') throw new Error('OSRM route: ' + json.code);
  var line = json.routes[0].geometry.coordinates.map(function(c){ return {lat: c[1], lng: c[0]}; });
  var legs = [], at = 0;
  for(var i = 1; i < pts.length; i++){
    var w = {lat: json.waypoints[i].location[1], lng: json.waypoints[i].location[0]}, best = at, bd = Infinity;
    for(var k = at; k < line.length; k++){ var d = metres(line[k], w); if(d < bd){ bd = d; best = k; } }
    var path = line.slice(at, best + 1);
    if(path.length < 2) path = [pts[i - 1], pts[i]];
    var cum = [0];
    for(var q = 1; q < path.length; q++) cum.push(cum[q - 1] + metres(path[q - 1], path[q]));
    legs.push({path: path, cum: cum, len: cum[cum.length - 1]});
    at = best;
  }
  return legs;
}
async function drive(id, pts, stops, done){
  if(!X || !X.renderer || reduceMotion){ done(); return; }
  var legs;
  try { legs = await roadLegs(pts); }
  catch(e){ console.warn('Dispatch map: no road for the truck —', e.message); done(); return; }
  if(drv) endDrive();
  clearTimeout(hideT);
  X.hideTrucks();
  var t = X.truck(id);
  legs.forEach(function(l, i){ l.to = stops[i]; });
  // keep the drive in view without jumping the map around
  var b = new google.maps.LatLngBounds(); pts.forEach(function(p){ b.extend(p); });
  S.map.panToBounds(b, 70);
  t.pos = pts[0]; t.hd.h.visible = true;
  drv = {id: id, t: t, legs: legs, i: 0, done: done};
  beginLeg();
  kick();
}
function beginLeg(){
  var l = drv.legs[drv.i], j = l.to;
  X.setCarry(drv.t, j && !j._isPickup ? j : null, false);
  l.ms = Math.max(1100, Math.min(3200, l.len / 1000 * 90));
  drv.t0 = performance.now(); drv.fresh = true;
}
function stepDrive(now, rr){
  var l = drv.legs[drv.i], t = drv.t, k = Math.min(1, (now - drv.t0) / l.ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  var want = e * l.len, i = 0;
  while(i < l.path.length - 2 && l.cum[i + 1] < want) i++;
  var a = l.path[i], b = l.path[i + 1], seg = (l.cum[i + 1] - l.cum[i]) || 1, f = Math.min(1, Math.max(0, (want - l.cum[i]) / seg));
  t.pos = {lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f};
  var sa = toBoard(a, rr), sb = toBoard(b, rr);
  if(sa && sb && Math.hypot(sb.x - sa.x, sb.y - sa.y) > 0.5){
    var hd = Math.atan2(-(sb.y - sa.y) / Math.sin(X.TIP), sb.x - sa.x), dh = hd - t.heading;
    while(dh > Math.PI) dh -= 2 * Math.PI; while(dh < -Math.PI) dh += 2 * Math.PI;
    t.heading += dh * (drv.fresh ? 1 : 0.35); drv.fresh = false;
  }
  var R = t.rider.arms[1]; R.rotation.z = 2.2 + Math.sin(now / 70) * 0.45; t.rider.head.rotation.z = Math.sin(now / 140) * 0.1;   // waving the whole way
  if(k >= 1){
    var j = l.to;
    X.setCarry(t, j && j._isPickup ? j : null, true);
    drv.i++;
    if(drv.i < drv.legs.length) beginLeg(); else endDrive();
  }
}
function endDrive(){
  if(!drv) return;
  var d = drv; drv = null;
  d.t.rider.arms[1].rotation.z = 0.18;
  d.done();
  hideT = setTimeout(function(){ d.t.hd.h.visible = false; kick(); }, 1600);
}

// ─── drawing: only while something moves ───
function rel(el, rr){ var r = el.getBoundingClientRect(); return {left: r.left - rr.left, top: r.top - rr.top, right: r.right - rr.left, bottom: r.bottom - rr.top, width: r.width, height: r.height}; }
function frame(){
  raf = 0;
  if(!S.root || !S.root.isConnected || !S.root.offsetParent) return;   // the board is not on screen
  var now = performance.now(), rr = S.root.getBoundingClientRect(), W = rr.width, H = rr.height, R = X.renderer, pr = Math.min(2, window.devicePixelRatio || 1);
  var canvas = R.domElement;
  if(canvas.width !== Math.round(W * pr) || canvas.height !== Math.round(H * pr)){ R.setPixelRatio(pr); R.setSize(W, H, false); }
  X.cam.left = 0; X.cam.right = W; X.cam.top = 0; X.cam.bottom = -H; X.cam.updateProjectionMatrix();
  S.mapRect = S.root.querySelector('.dm-map').getBoundingClientRect();
  var busy = false, col = rel(S.root.querySelector('.dm-col'), rr), mr = rel(S.root.querySelector('.dm-map'), rr);
  Object.keys(X.guys).forEach(function(id){
    var g = X.guys[id], el = S.root.querySelector('[data-guy="' + id + '"]');
    if(!el){ g.hd.h.visible = false; return; }
    var r = rel(el, rr);
    g.hd.h.visible = r.bottom > col.top && r.top < col.bottom;
    g.hd.h.position.set(r.left + r.width / 2, -(r.bottom - 8), 0);
    if(g.anim){
      var t = (now - g.anim.t0) / 1000;
      if(t >= g.anim.k || reduceMotion){ X.animGuy(g.m.userData, g.anim.kind, 0, 1); g.anim = null; }
      else { X.animGuy(g.m.userData, g.anim.kind, t, g.anim.k); busy = true; }
    }
  });
  // every card's guy exists, even before he first moves
  S.root.querySelectorAll('[data-guy]').forEach(function(el){ if(!X.guys[el.dataset.guy]){ X.guy(el.dataset.guy); busy = true; } });
  if(drv){ stepDrive(now, rr); busy = true; }
  Object.keys(X.trucks).forEach(function(id){
    var t = X.trucks[id]; if(!t.hd.h.visible || !t.pos) return;
    var s = toBoard(t.pos, rr); if(!s) return;
    t.hd.h.position.set(s.x, -s.y, 0); t.hd.yaw.rotation.y = t.heading; t.riderObj.rotation.y = -t.heading;   // the driver always turns to wave at you
  });
  R.setScissorTest(false); R.clear();
  R.autoClear = false;
  R.setScissorTest(true);
  R.setScissor(mr.left, H - mr.bottom, mr.width, mr.height); R.render(X.mapScene, X.cam);
  R.setScissor(col.left, H - col.bottom, col.width + 40, col.height); R.render(X.scene, X.cam);
  R.setScissorTest(false);
  R.autoClear = true;
  if(busy) kick();
}

window.DispatchMap = {render: render};
})();
