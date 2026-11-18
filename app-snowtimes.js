/* ===== app-snowtimes.js ===== */
// Snow Times — what every machine did on each snow event, and how long each
// winter site takes. The snow-side twin of Cut Times (app-cuttimes.js).
//
// A snow event is a day the tractors went out (Jake, 2026-11-18). The
// snow-times-sync edge function works that out from MyGeotab once a day and
// writes jwg_snow_events / jwg_snow_machines / jwg_snow_visits; this file only
// reads them. The sites are the winter book's own list, passed in by the Snow &
// Ice page (WIN.locations) and never changed here.
// Renders inside the Winter page — app-jwg-scheduler.js calls SnowTimes.mount().
window.SnowTimes = (function(){
"use strict";

var YARD = [44.40399, -79.69106];   // the shop, where every machine starts
// One colour per machine, in the order they left the yard.
var PALETTE = ['#2563eb', '#d97706', '#7c3aed', '#059669', '#db2777', '#0d9488', '#92400e', '#475569', '#4f46e5', '#65a30d', '#0891b2', '#be123c'];
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

var W = null, root = null;
var EVENTS = [];                    // every event on record, newest first
var st = {season: null, ev: null, mach: null, stop: null};
var MACH = [], VISITS = [], STATS = [];   // for the open event / the open season
var map = null, layer = null, raf = 0;

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
function must(res, what){ if(res.error) throw new Error('Snow Times: ' + what + ': ' + res.error.message); return res.data; }

// A season runs July to June and is named for the year it starts in.
function seasonOf(date){ var p = date.split('-'); return +p[1] >= 7 ? +p[0] : +p[0] - 1; }
function seasonName(y){ return y + '–' + String(y + 1).slice(2); }
function niceDate(d){ var p = d.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]); return DAYS[dt.getDay()] + ' ' + MONTHS[dt.getMonth()] + ' ' + dt.getDate(); }
function clock(iso){ return new Date(iso).toLocaleTimeString('en-CA', {timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit'}).replace(/\./g, '').toUpperCase(); }
function span(a, b){ var m = Math.round((new Date(b) - new Date(a)) / 60000); return Math.floor(m / 60) + ' h ' + (m % 60) + ' m'; }
function mins(n){ return Math.round(n) + ' min'; }

// The shop is in the winter book but it is the yard, not a stop.
function isYard(l){ return Math.abs(l.lat - YARD[0]) < 0.002 && Math.abs(l.lng - YARD[1]) < 0.003; }
function sites(){ return W.locations.filter(function(l){ return l.lat != null && !isYard(l); }); }
function site(id){ return W.locations.find(function(l){ return l.id === id; }); }
function siteName(l){ return l.client_name || l.address; }
function siteCode(l){ return WinterRoutes.code(l) || ''; }
function colourOf(deviceId){ var i = MACH.findIndex(function(m){ return m.device_id === deviceId; }); return PALETTE[i % PALETTE.length]; }
function visitsOf(deviceId){ return VISITS.filter(function(v){ return v.device_id === deviceId; }); }
function event(){ return EVENTS.find(function(e){ return e.event_date === st.ev; }); }
function seasonEvents(){ return EVENTS.filter(function(e){ return seasonOf(e.event_date) === st.season; }); }

// ── loading ──
function loadEvents(){
  return db.from('jwg_snow_event_summary').select('*').order('event_date', {ascending: false}).then(function(r){
    EVENTS = must(r, 'events');
  });
}
function loadSeason(){
  return db.from('jwg_snow_site_stats').select('*').eq('season', st.season).then(function(r){
    STATS = must(r, 'site times').map(function(s){ return {id: s.location_id, visits: +s.events_visited, avg: +s.avg_min, min: +s.min_min, max: +s.max_min}; });
  });
}
function loadEvent(){
  if(!st.ev){ MACH = []; VISITS = []; return Promise.resolve(); }
  return Promise.all([
    db.from('jwg_snow_machines').select('*').eq('event_date', st.ev).order('first_out'),
    db.from('jwg_snow_visits').select('device_id,location_id,arrive,depart,dur_min').eq('event_date', st.ev).order('arrive')
  ]).then(function(res){
    MACH = must(res[0], 'machines');
    // A site that has since left the winter book has nowhere to be drawn.
    VISITS = must(res[1], 'stops').filter(function(v){ return site(v.location_id); });
  });
}

// ── markup ──
function shell(){
  var years = EVENTS.map(function(e){ return seasonOf(e.event_date); }).concat([st.season])
    .filter(function(y, i, a){ return a.indexOf(y) === i; }).sort(function(a, b){ return b - a; });
  return '<div class="snt-page">'
    + '<div class="snt-head"><div><div class="snt-title">Snow Times</div>'
    +   '<div class="snt-sub">A snow event is any day the tractors go out. Worked out from the trucks\' GPS each evening; nobody has to mark anything.</div></div>'
    +   '<div class="snt-acts"><select id="snt-season" class="snt-select" aria-label="Winter">' + years.map(function(y){ return '<option value="' + y + '"' + (y === st.season ? ' selected' : '') + '>Winter ' + seasonName(y) + '</option>'; }).join('') + '</select>'
    +   '<button type="button" class="snt-btn" data-back>Back to Snow &amp; Ice</button></div></div>'
    + '<div class="snt-tiles" id="snt-tiles"></div>'
    + '<div class="snt-h2">Snow events <span class="snt-hint">newest first · click one to open it</span></div>'
    + '<div class="snt-events" id="snt-events"></div>'
    + '<div class="snt-panel" id="snt-event"></div>'
    + '<div class="snt-panel"><div class="snt-h2">Every site this winter <span class="snt-hint">time on site is every machine added together · click a row to find it on the map</span></div>'
    +   '<div class="snt-scroll"><table class="snt-table" id="snt-sites"></table></div></div>'
    + '<p class="snt-note"><b>How to read this:</b> a machine counts as being at a site when its GPS is within 80 m of the site\'s pin for 3 minutes or more, so sites that sit side by side can borrow a little of each other\'s time. '
    +   '"No stop recorded" means no machine\'s GPS showed that, which is a prompt to check, not proof the site was missed. Snowfall is the Government of Canada\'s measured figure for that day plus the day before, from the nearest station that has reported.</p>'
    + '</div>';
}

function paintTiles(){
  var evs = seasonEvents(), n = evs.length;
  var known = evs.filter(function(e){ return e.snow_cm != null; });
  var biggest = known.slice().sort(function(a, b){ return b.snow_cm - a.snow_cm; })[0];
  var avgLen = n ? evs.reduce(function(a, e){ return a + (new Date(e.last_back) - new Date(e.first_out)); }, 0) / n / 3600000 : 0;
  root.querySelector('#snt-tiles').innerHTML = [
    [n, 'snow events'],
    [n ? avgLen.toFixed(1) + ' h' : '–', 'average event, first tractor out to last one back'],
    [biggest ? (+biggest.snow_cm) + ' cm' : '–', biggest ? 'biggest snowfall · ' + niceDate(biggest.event_date) : 'biggest snowfall'],
    [sites().length, 'sites in the winter book']
  ].map(function(t){ return '<div class="snt-tile"><div class="v">' + t[0] + '</div><div class="l">' + esc(t[1]) + '</div></div>'; }).join('');
}

function paintEvents(){
  var evs = seasonEvents(), total = sites().length;
  root.querySelector('#snt-events').innerHTML = evs.length ? evs.map(function(e){
    return '<button type="button" class="snt-ev' + (e.event_date === st.ev ? ' on' : '') + '" data-ev="' + e.event_date + '">'
      + '<span class="cm">' + (e.snow_cm == null ? '–' : +e.snow_cm) + '<small>cm</small></span>'
      + '<span class="t"><b>' + niceDate(e.event_date) + '</b>'
      + '<span>' + e.tractors_out + ' of 5 tractors · ' + e.machines + ' machines</span>'
      + '<span>' + e.sites_visited + ' of ' + total + ' sites · ' + clock(e.first_out) + ' to ' + clock(e.last_back) + '</span></span></button>';
  }).join('') : '<div class="snt-empty">No snow events yet this winter. The first one shows up here the evening after the tractors go out.</div>';
}

function paintEvent(){
  var box = root.querySelector('#snt-event'), e = event();
  cancelAnimationFrame(raf);
  if(map){ map.remove(); map = null; }
  if(!e){ box.hidden = true; return; }
  box.hidden = false;
  var m = MACH.find(function(x){ return x.device_id === st.mach; });
  var h = '<div class="snt-two"><div>'
    + '<div class="snt-bar"><div class="snt-h2">' + niceDate(e.event_date) + ' · ' + (e.snow_cm == null ? 'snowfall not reported yet' : (+e.snow_cm) + ' cm fell <span class="snt-hint">(' + esc(e.snow_station) + ')</span>') + '</div>'
    +   '<div class="snt-acts">' + (m ? '<button type="button" class="snt-btn sm" data-mach="">Show every machine</button>' : '') + '<button type="button" class="snt-btn sm" data-play>&#9654; Play the event</button></div></div>'
    + '<div id="snt-map"></div><div class="snt-info" id="snt-info"></div>'
    + '<div class="snt-legend"><span><i class="dot"></i>Stop, coloured by machine</span><span><i class="ring"></i>No stop recorded</span><span><i class="yard"></i>The yard</span></div>'
    + '</div><div><div class="snt-h2">Who went out</div><div class="snt-machs">';
  MACH.forEach(function(x){
    var n = visitsOf(x.device_id).length;
    h += '<button type="button" class="snt-mach' + (x.device_id === st.mach ? ' on' : '') + '" data-mach="' + esc(x.device_id) + '">'
      + '<i style="background:' + colourOf(x.device_id) + '"></i><span><b>' + esc(x.device_name) + '</b><small>out ' + clock(x.first_out) + ', back ' + clock(x.last_back) + ' · ' + Math.round(x.km) + ' km</small></span>'
      + '<u>' + n + (n === 1 ? ' site' : ' sites') + '</u></button>';
  });
  h += '</div>';
  if(m){
    h += '<div class="snt-stops">' + visitsOf(m.device_id).map(function(v, i){
      var l = site(v.location_id);
      return '<div class="snt-stop' + (i === st.stop ? ' on' : '') + '" data-stop="' + i + '"><i style="background:' + colourOf(m.device_id) + '">' + (i + 1) + '</i><em>' + clock(v.arrive) + '</em>'
        + '<span>' + (siteCode(l) ? '<span class="snt-code">' + esc(siteCode(l)) + '</span>' : '') + esc(siteName(l)) + '</span><u>' + mins(v.dur_min) + '</u></div>';
    }).join('') + '</div>';
  }
  var missed = sites().filter(function(l){ return !VISITS.some(function(v){ return v.location_id === l.id; }); });
  if(!m && missed.length){
    h += '<div class="snt-missed"><b>No stop recorded at ' + missed.length + (missed.length === 1 ? ' site' : ' sites') + ':</b> ' + missed.map(function(l){ return esc(siteName(l)); }).join(', ') + '</div>';
  }
  box.innerHTML = h + '</div></div>';
  drawMap(true);
  paintInfo();
}

function paintInfo(){
  var el = root.querySelector('#snt-info'), m = MACH.find(function(x){ return x.device_id === st.mach; });
  if(m && st.stop != null){
    var v = visitsOf(m.device_id)[st.stop], l = site(v.location_id);
    el.innerHTML = '<b>Stop ' + (st.stop + 1) + '</b> · ' + esc(siteName(l)) + ' · ' + esc(m.device_name) + ' arrived ' + clock(v.arrive) + ', left ' + clock(v.depart) + ' · on site ' + mins(v.dur_min);
  }else if(m){
    el.textContent = 'The numbers are the order ' + m.device_name + ' did its stops. Click a number, or a row in the list, for the times.';
  }else{
    el.textContent = 'Each colour is one machine, and its line joins its stops in order. Click a machine on the right to follow just that one.';
  }
}

// ── map ──
function pin(colour, label, big){
  var s = big ? 26 : 16;
  return L.divIcon({className: 'snt-pin', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
    html: '<span style="width:' + s + 'px;height:' + s + 'px;background:' + colour + '">' + (label || '') + '</span>'});
}

function drawMap(fit){
  if(!map){
    map = L.map('snt-map', {scrollWheelZoom: true});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  }
  if(layer) layer.remove();
  layer = L.layerGroup().addTo(map);
  var bounds = [YARD];

  sites().forEach(function(l){
    bounds.push([l.lat, l.lng]);
    if(VISITS.some(function(v){ return v.location_id === l.id; })) return;
    L.circleMarker([l.lat, l.lng], {radius: 6, weight: 2.5, color: '#dc2626', fillColor: '#ffffff', fillOpacity: 1})
      .bindTooltip('<b>' + esc(siteName(l)) + '</b><br>No stop recorded').addTo(layer);
  });

  MACH.forEach(function(m){
    var mine = visitsOf(m.device_id), colour = colourOf(m.device_id);
    var focus = st.mach === m.device_id, dim = st.mach && !focus;
    var line = [YARD].concat(mine.map(function(v){ var l = site(v.location_id); return [l.lat, l.lng]; }));
    L.polyline(line, {color: colour, weight: focus ? 4 : 3, opacity: dim ? .15 : .85, dashArray: '2 8', lineCap: 'round'}).addTo(layer);
    if(dim) return;
    mine.forEach(function(v, i){
      var l = site(v.location_id);
      var mk = L.marker([l.lat, l.lng], {icon: pin(colour, focus ? i + 1 : '', focus), zIndexOffset: focus ? 500 : 0})
        .bindTooltip('<b>' + esc(siteName(l)) + '</b><br>' + esc(m.device_name) + ' · ' + clock(v.arrive) + ' · ' + mins(v.dur_min)).addTo(layer);
      mk.on('click', function(){ st.mach = m.device_id; st.stop = i; paintEvent(); });
    });
  });

  L.marker(YARD, {icon: L.divIcon({className: 'snt-pin', iconSize: [20, 20], iconAnchor: [10, 10], html: '<span class="yard"></span>'}), zIndexOffset: 900})
    .bindTooltip('<b>The yard</b>').addTo(layer);

  if(fit){
    var focusPts = st.mach ? [YARD].concat(visitsOf(st.mach).map(function(v){ var l = site(v.location_id); return [l.lat, l.lng]; })) : bounds;
    map.fitBounds(focusPts, {padding: [30, 30]});
    requestAnimationFrame(function(){ if(map) map.invalidateSize(); });
  }
}

// Every machine shown runs its own line from the yard, all in the same 8 seconds,
// each placed by the clock: where it was between its stops at that moment.
function play(){
  cancelAnimationFrame(raf);
  var e = event(), shown = MACH.filter(function(m){ return !st.mach || m.device_id === st.mach; });
  var t0 = +new Date(e.first_out), t1 = +new Date(e.last_back), started = performance.now(), LEN = 8000;
  var runners = shown.map(function(m){
    var pts = [{t: +new Date(m.first_out), p: YARD}];
    visitsOf(m.device_id).forEach(function(v){ var l = site(v.location_id); pts.push({t: +new Date(v.arrive), p: [l.lat, l.lng]}, {t: +new Date(v.depart), p: [l.lat, l.lng]}); });
    return {pts: pts, mk: L.circleMarker(YARD, {radius: 9, weight: 3, color: '#111827', fillColor: colourOf(m.device_id), fillOpacity: 1}).addTo(layer)};
  });
  var info = root.querySelector('#snt-info');
  (function step(now){
    var k = Math.min((now - started) / LEN, 1), t = t0 + (t1 - t0) * k;
    runners.forEach(function(r){
      var a = r.pts[0], b = r.pts[r.pts.length - 1];
      for(var i = 0; i < r.pts.length - 1; i++){ if(t >= r.pts[i].t && t <= r.pts[i + 1].t){ a = r.pts[i]; b = r.pts[i + 1]; break; } }
      if(t <= r.pts[0].t) b = a; else if(t >= r.pts[r.pts.length - 1].t) a = b;
      var f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      r.mk.setLatLng([a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f]);
    });
    info.textContent = 'Playing: ' + clock(new Date(t).toISOString());
    if(k < 1) raf = requestAnimationFrame(step); else { runners.forEach(function(r){ r.mk.remove(); }); paintInfo(); }
  })(started);
}

function paintSites(){
  var n = seasonEvents().length, by = {};
  STATS.forEach(function(s){ by[s.id] = s; });
  var rows = sites().map(function(l){ return {l: l, s: by[l.id] || {visits: 0}}; })
    .sort(function(a, b){ return (b.s.avg || 0) - (a.s.avg || 0); });
  root.querySelector('#snt-sites').innerHTML = '<thead><tr><th>Site</th><th class="num">Events done</th><th class="num">Avg on site</th><th class="num">Shortest</th><th class="num">Longest</th><th>No stop recorded</th></tr></thead><tbody>'
    + rows.map(function(r){
      var miss = n - r.s.visits;
      return '<tr data-site="' + r.l.id + '"><td>' + (siteCode(r.l) ? '<span class="snt-code">' + esc(siteCode(r.l)) + '</span>' : '') + esc(siteName(r.l)) + '</td>'
        + '<td class="num">' + r.s.visits + ' of ' + n + '</td>'
        + '<td class="num"><b>' + (r.s.visits ? mins(r.s.avg) : '–') + '</b></td><td class="num">' + (r.s.visits ? Math.round(r.s.min) : '–') + '</td><td class="num">' + (r.s.visits ? Math.round(r.s.max) : '–') + '</td>'
        + '<td class="' + (miss ? 'warn' : '') + '">' + (miss ? miss + (miss === 1 ? ' event' : ' events') : '') + '</td></tr>';
    }).join('') + '</tbody>';
}

// ── wiring ──
function openEvent(date){
  st.ev = date; st.mach = null; st.stop = null;
  paintEvents();
  return loadEvent().then(paintEvent);
}
function openSeason(y){
  st.season = y;
  var first = seasonEvents()[0];
  paintTiles();
  return Promise.all([loadSeason().then(paintSites), openEvent(first ? first.event_date : null)]);
}
function fail(e){ root.innerHTML = '<div class="snt-page"><div class="snt-empty">' + esc(e.message) + '</div></div>'; throw e; }

function wire(){
  root.querySelector('.snt-page').addEventListener('click', function(e){
    var t = e.target, b;
    if(t.closest('[data-back]')){ JWG.setWinterView('desk'); return; }
    if(t.closest('[data-play]')){ play(); return; }
    if((b = t.closest('[data-ev]'))){ openEvent(b.dataset.ev).catch(fail); return; }
    if((b = t.closest('[data-stop]'))){ st.stop = +b.dataset.stop; paintEvent(); return; }
    if((b = t.closest('[data-mach]'))){ st.mach = b.dataset.mach || null; st.stop = null; paintEvent(); return; }
    if((b = t.closest('[data-site]')) && map){ var l = site(b.dataset.site); map.setView([l.lat, l.lng], 17); root.querySelector('#snt-event').scrollIntoView({behavior: 'smooth', block: 'start'}); }
  });
  root.querySelector('#snt-season').addEventListener('change', function(e){ openSeason(+e.target.value).catch(fail); });
}

function mount(el, win){
  if(!window.L) throw new Error('Snow Times needs Leaflet — check the script tag in index.html');
  W = win; root = el; map = null; layer = null;
  root.innerHTML = '<div class="snt-page"><div class="snt-empty">Loading snow times…</div></div>';
  return loadEvents().then(function(){
    // Open on this winter; before its first snowfall, on the last winter that had one.
    var now = new Date(), thisWinter = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    var has = function(y){ return EVENTS.some(function(e){ return seasonOf(e.event_date) === y; }); };
    st.season = has(thisWinter) || !EVENTS.length ? thisWinter : seasonOf(EVENTS[0].event_date);
    root.innerHTML = shell();
    wire();
    return openSeason(st.season);
  }).catch(fail);
}

return {mount: mount};
})();
