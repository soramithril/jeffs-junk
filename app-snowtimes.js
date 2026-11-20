/* ===== app-snowtimes.js ===== */
// Snow Times — what every machine did on each snow event, and how long each
// winter site takes. The snow-side twin of Cut Times (app-cuttimes.js).
//
// A snow event is a day the tractors went out (Jake, 2026-11-18). The
// snow-times-sync edge function works that out from MyGeotab once a day and
// writes jwg_snow_events / jwg_snow_machines / jwg_snow_visits; this file only
// reads them. The sites are the winter book's own list, passed in by the Snow &
// Ice page (WIN.locations) and never changed here.
//
// It is the fourth tab of Snow & Ice (Jake, 2026-11-20: as its own page it was one
// long stack, with the events in a strip that scrolled sideways). It fits one
// screen and has two views:
//   Events      the events down the left, the picked event's map in the middle,
//               who went out on the right; a machine's stops open under it.
//   Site times  every site in one table that sorts on any heading.
// app-snow.js calls SnowTimes.mount() when the tab opens and unmount() when it closes.
window.SnowTimes = (function(){
"use strict";

var YARD = [44.40399, -79.69106];   // the shop, where every machine starts
// One colour per machine, in the order they left the yard.
var PALETTE = ['#2563eb', '#d97706', '#7c3aed', '#059669', '#db2777', '#0d9488', '#92400e', '#475569', '#4f46e5', '#65a30d', '#0891b2', '#be123c'];
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

var W = null, root = null;
var EVENTS = [];                    // every event on record, newest first
// mode: 'events' | 'sites'. sort / dir / area belong to the Site times table.
var st = {season: null, ev: null, mach: null, stop: null, mode: 'events', sort: 'avg', dir: -1, area: ''};
var MACH = [], VISITS = [], STATS = [];   // for the open event / the open season
var map = null, layer = null, raf = 0;

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
function must(res, what){ if(res.error) throw new Error('Snow Times: ' + what + ': ' + res.error.message); return res.data; }

// A season runs July to June and is named for the year it starts in.
function seasonOf(date){ var p = date.split('-'); return +p[1] >= 7 ? +p[0] : +p[0] - 1; }
function seasonName(y){ return y + '–' + String(y + 1).slice(2); }
function niceDate(d){ var p = d.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]); return DAYS[dt.getDay()] + ' ' + MONTHS[dt.getMonth()] + ' ' + dt.getDate(); }
function clock(iso){ return new Date(iso).toLocaleTimeString('en-CA', {timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit'}).replace(/\./g, '').toUpperCase(); }
function mins(n){ return Math.round(n) + ' min'; }
function hours(e){ return (new Date(e.last_back) - new Date(e.first_out)) / 3600000; }
// Snowfall to one decimal: the figure arrives as a decimal and must not print as 28.799999.
function cm(v){ return Math.round(v * 10) / 10; }

// The shop is in the winter book but it is the yard, not a stop.
function isYard(l){ return Math.abs(l.lat - YARD[0]) < 0.002 && Math.abs(l.lng - YARD[1]) < 0.003; }
function sites(){ return W.locations.filter(function(l){ return l.lat != null && !isYard(l); }); }
function site(id){ return W.locations.find(function(l){ return l.id === id; }); }
function siteName(l){ return l.client_name || l.address; }
function siteCode(l){ return WinterRoutes.code(l) || ''; }
function codeHtml(l){ return siteCode(l) ? '<span class="snt-code">' + esc(siteCode(l)) + '</span>' : ''; }
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
  return '<div class="snt">'
    + '<div class="snt-bar">'
    +   '<div class="snt-seg"><button type="button" data-mode="events">Events</button><button type="button" data-mode="sites">Site times</button></div>'
    +   '<select id="snt-season" class="snt-select" aria-label="Winter">' + years.map(function(y){ return '<option value="' + y + '"' + (y === st.season ? ' selected' : '') + '>Winter ' + seasonName(y) + '</option>'; }).join('') + '</select>'
    +   '<div class="snt-stats" id="snt-stats"></div>'
    +   '<details class="snt-how"><summary>How to read this</summary><p>A snow event is any day the tractors go out. It is worked out from the trucks\' GPS each evening; nobody has to mark anything. '
    +     'A machine counts as being at a site when its GPS is within 80 m of the site\'s pin for 3 minutes or more, so sites that sit side by side can borrow a little of each other\'s time. '
    +     '"No stop recorded" means no machine\'s GPS showed that, which is a prompt to check, not proof the site was missed. '
    +     'Snowfall is the Government of Canada\'s measured figure for that day plus the day before, from the nearest station that has reported.</p></details>'
    + '</div><div class="snt-body" id="snt-body"></div></div>';
}
function eventsFrame(){
  return '<div class="snt-three">'
    + '<div class="snt-panel"><div class="snt-ph"><b>Snow events</b><span class="snt-hint">newest first</span></div><div class="snt-scroll" id="snt-events"></div></div>'
    + '<div class="snt-panel"><div class="snt-ph" id="snt-evhead"></div><div id="snt-map"></div><div class="snt-info" id="snt-info"></div>'
    +   '<div class="snt-legend"><span><i class="dot"></i>Stop, coloured by machine</span><span><i class="ring"></i>No stop recorded</span><span><i class="yard"></i>The yard</span></div></div>'
    + '<div class="snt-panel"><div class="snt-ph" id="snt-whohead"></div><div class="snt-scroll" id="snt-who"></div></div>'
    + '</div>';
}
function sitesFrame(){
  return '<div class="snt-panel"><div class="snt-ph"><b>Time on site</b><span class="snt-hint">every machine added together · click a heading to sort · click a row to find it on the map</span>'
    + '<div class="snt-chips" id="snt-areas"></div></div><div class="snt-scroll"><table class="snt-table" id="snt-sites"></table></div></div>';
}

// The season in one line, where four tiles used to take a row of their own.
function paintStats(){
  var evs = seasonEvents(), n = evs.length;
  var biggest = evs.filter(function(e){ return e.snow_cm != null; }).sort(function(a, b){ return b.snow_cm - a.snow_cm; })[0];
  var avg = n ? evs.reduce(function(a, e){ return a + hours(e); }, 0) / n : 0;
  root.querySelector('#snt-stats').innerHTML = '<span><b>' + n + '</b> snow event' + (n === 1 ? '' : 's') + '</span>'
    + (n ? '<span>average <b>' + avg.toFixed(1) + ' h</b> first out to last back</span>' : '')
    + (biggest ? '<span>biggest <b>' + cm(biggest.snow_cm) + ' cm</b> on ' + niceDate(biggest.event_date) + '</span>' : '');
  root.querySelectorAll('[data-mode]').forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.mode === st.mode); });
}

function paintEvents(){
  var evs = seasonEvents(), box = root.querySelector('#snt-events'), top = box.scrollTop;
  box.innerHTML = evs.length ? evs.map(function(e){
    return '<button type="button" class="snt-ev' + (e.event_date === st.ev ? ' on' : '') + '" data-ev="' + e.event_date + '">'
      + '<span class="cm">' + (e.snow_cm == null ? '–' : cm(e.snow_cm)) + '<small>cm</small></span>'
      + '<span class="t"><b>' + niceDate(e.event_date) + '</b>'
      + '<span>' + e.tractors_out + ' of 5 tractors · ' + e.sites_visited + ' sites · ' + hours(e).toFixed(1) + ' h</span></span></button>';
  }).join('') : '<div class="snt-empty">No snow events yet this winter. The first one shows up here the evening after the tractors go out.</div>';
  box.scrollTop = top;
}

// The picked event: its heading, who went out, the map. fit re-frames the map.
function paintEvent(fit){
  var e = event(), head = root.querySelector('#snt-evhead'), m = MACH.find(function(x){ return x.device_id === st.mach; });
  cancelAnimationFrame(raf);
  if(!e){
    head.innerHTML = '<b>No event picked</b>';
    root.querySelector('#snt-whohead').innerHTML = '<b>Who went out</b>';
    root.querySelector('#snt-who').innerHTML = '';
    root.querySelector('#snt-info').textContent = '';
    return;
  }
  head.innerHTML = '<b>' + niceDate(e.event_date) + '</b><span class="snt-hint">'
    + (e.snow_cm == null ? 'snowfall not reported yet' : cm(e.snow_cm) + ' cm fell (' + esc(e.snow_station) + ')') + ' · out ' + clock(e.first_out) + ', back ' + clock(e.last_back) + '</span>'
    + '<span class="snt-acts">' + (m ? '<button type="button" class="snt-btn" data-mach="">Show every machine</button>' : '') + '<button type="button" class="snt-btn go" data-play>&#9654; Play the event</button></span>';
  root.querySelector('#snt-whohead').innerHTML = '<b>Who went out</b><span class="snt-hint">' + MACH.length + ' machine' + (MACH.length === 1 ? '' : 's') + ' · click one to follow it</span>';
  var h = MACH.map(function(x){
    var mine = visitsOf(x.device_id), n = mine.length, on = x.device_id === st.mach;
    var row = '<button type="button" class="snt-mach' + (on ? ' on' : '') + '" data-mach="' + esc(x.device_id) + '">'
      + '<i style="background:' + colourOf(x.device_id) + '"></i><span><b>' + esc(x.device_name) + '</b><small>out ' + clock(x.first_out) + ', back ' + clock(x.last_back) + ' · ' + Math.round(x.km) + ' km</small></span>'
      + '<u>' + n + (n === 1 ? ' site' : ' sites') + '</u></button>';
    if(on) row += mine.map(function(v, i){
      var l = site(v.location_id);
      return '<div class="snt-stop' + (i === st.stop ? ' on' : '') + '" data-stop="' + i + '"><i style="background:' + colourOf(x.device_id) + '">' + (i + 1) + '</i><em>' + clock(v.arrive) + '</em>'
        + '<span>' + codeHtml(l) + esc(siteName(l)) + '</span><u>' + mins(v.dur_min) + '</u></div>';
    }).join('');
    return row;
  }).join('');
  var missed = sites().filter(function(l){ return !VISITS.some(function(v){ return v.location_id === l.id; }); });
  if(missed.length) h += '<div class="snt-missed"><b>No stop recorded at ' + missed.length + (missed.length === 1 ? ' site' : ' sites') + ':</b> ' + missed.map(function(l){ return esc(siteName(l)); }).join(', ') + '</div>';
  var box = root.querySelector('#snt-who'), top = box.scrollTop;
  box.innerHTML = h;
  box.scrollTop = top;
  drawMap(fit);
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
  var fresh = !map;
  if(fresh){
    map = L.map(root.querySelector('#snt-map'), {scrollWheelZoom: true});
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
      mk.on('click', function(){ var same = st.mach === m.device_id; st.mach = m.device_id; st.stop = i; paintEvent(!same); });
    });
  });

  L.marker(YARD, {icon: L.divIcon({className: 'snt-pin', iconSize: [20, 20], iconAnchor: [10, 10], html: '<span class="yard"></span>'}), zIndexOffset: 900})
    .bindTooltip('<b>The yard</b>').addTo(layer);

  if(fit || fresh){
    var focusPts = st.mach ? [YARD].concat(visitsOf(st.mach).map(function(v){ var l = site(v.location_id); return [l.lat, l.lng]; })) : bounds;
    map.invalidateSize();
    map.fitBounds(focusPts, {padding: [30, 30]});
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

// ── site times ──
// What each heading sorts on. "miss" is the events a site has no stop recorded for.
var SORTS = {
  name: function(r){ return siteName(r.l).toLowerCase(); },
  avg: function(r){ return r.s.avg || 0; }, min: function(r){ return r.s.min || 0; }, max: function(r){ return r.s.max || 0; },
  visits: function(r){ return r.s.visits; }, miss: function(r){ return r.miss; }
};
function paintSites(){
  var n = seasonEvents().length, by = {};
  STATS.forEach(function(s){ by[s.id] = s; });
  var all = sites();
  root.querySelector('#snt-areas').innerHTML = '<button type="button" class="snt-chip" data-tarea="" aria-pressed="' + !st.area + '">All ' + all.length + '</button>'
    + W.groups.map(function(g){
        return '<button type="button" class="snt-chip" data-tarea="' + esc(g.code) + '" aria-pressed="' + (st.area === g.code) + '" title="' + esc(g.name) + '"><i style="background:' + g.color + '"></i>' + esc(g.code) + '</button>';
      }).join('');
  var rows = all.filter(function(l){ return !st.area || l.winter_group === st.area; })
    .map(function(l){ var s = by[l.id] || {visits: 0}; return {l: l, s: s, miss: n - s.visits}; });
  var key = SORTS[st.sort];
  rows.sort(function(a, b){ var x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir || siteName(a.l).localeCompare(siteName(b.l)); });
  var longest = Math.max.apply(null, [1].concat(STATS.map(function(s){ return s.avg; })));
  function th(k, label, num){
    return '<th' + (num ? ' class="num"' : '') + '><button type="button" data-sort="' + k + '" aria-pressed="' + (st.sort === k) + '">' + label + (st.sort === k ? (st.dir < 0 ? ' ↓' : ' ↑') : '') + '</button></th>';
  }
  root.querySelector('#snt-sites').innerHTML = '<thead><tr>' + th('name', 'Site') + th('avg', 'Average on site') + th('min', 'Shortest', 1) + th('max', 'Longest', 1) + th('visits', 'Events done', 1) + th('miss', 'No stop recorded', 1) + '</tr></thead><tbody>'
    + rows.map(function(r){
      var has = r.s.visits > 0;
      return '<tr data-tsite="' + r.l.id + '"><td>' + codeHtml(r.l) + esc(siteName(r.l)) + '</td>'
        + '<td>' + (has ? '<span class="snt-avg"><i style="width:' + Math.max(4, r.s.avg / longest * 220) + 'px"></i><b>' + mins(r.s.avg) + '</b></span>' : '–') + '</td>'
        + '<td class="num">' + (has ? Math.round(r.s.min) : '–') + '</td><td class="num">' + (has ? Math.round(r.s.max) : '–') + '</td>'
        + '<td class="num">' + r.s.visits + ' of ' + n + '</td>'
        + '<td class="num' + (r.miss ? ' warn' : '') + '">' + (r.miss ? r.miss + (r.miss === 1 ? ' event' : ' events') : '') + '</td></tr>';
    }).join('') + '</tbody>';
}

// ── wiring ──
// Build the view that is showing. The map belongs to the Events view, so it goes
// when that view does.
function paintMode(){
  cancelAnimationFrame(raf);
  if(map){ map.remove(); map = null; layer = null; }
  root.querySelector('#snt-body').innerHTML = st.mode === 'events' ? eventsFrame() : sitesFrame();
  paintStats();
  if(st.mode === 'events'){ paintEvents(); paintEvent(true); }
  else paintSites();
}
function openEvent(date){
  st.ev = date; st.mach = null; st.stop = null;
  return loadEvent().then(function(){ if(st.mode === 'events'){ paintEvents(); paintEvent(true); } });
}
function openSeason(y){
  st.season = y;
  var first = seasonEvents()[0];
  st.ev = first ? first.event_date : null; st.mach = null; st.stop = null;
  return Promise.all([loadSeason(), loadEvent()]).then(paintMode);
}
function fail(e){ root.innerHTML = '<div class="snt"><div class="snt-empty">' + esc(e.message) + '</div></div>'; throw e; }

function wire(){
  var page = root.querySelector('.snt');
  page.addEventListener('click', function(e){
    // This sits inside the Snow & Ice page, whose own click handler listens for
    // some of the same words (a site, an area). A click here is ours alone.
    e.stopPropagation();
    var t = e.target, b;
    if((b = t.closest('[data-mode]'))){ if(st.mode !== b.dataset.mode){ st.mode = b.dataset.mode; paintMode(); } return; }
    if(t.closest('[data-play]')){ play(); return; }
    if((b = t.closest('[data-ev]'))){ openEvent(b.dataset.ev).catch(fail); return; }
    if((b = t.closest('[data-stop]'))){ st.stop = +b.dataset.stop; paintEvent(false); return; }
    if((b = t.closest('[data-mach]'))){ st.mach = st.mach === b.dataset.mach ? null : (b.dataset.mach || null); st.stop = null; paintEvent(true); return; }
    if((b = t.closest('[data-tarea]'))){ st.area = b.dataset.tarea; paintSites(); return; }
    if((b = t.closest('[data-sort]'))){
      if(st.sort === b.dataset.sort) st.dir = -st.dir; else { st.sort = b.dataset.sort; st.dir = st.sort === 'name' ? 1 : -1; }
      paintSites(); return; }
    if((b = t.closest('[data-tsite]'))){
      var l = site(b.dataset.tsite);
      st.mode = 'events'; st.mach = null; st.stop = null;
      paintMode();
      if(map) map.setView([l.lat, l.lng], 17);
    }
  });
  page.querySelector('#snt-season').addEventListener('change', function(e){ openSeason(+e.target.value).catch(fail); });
}

function mount(el, win){
  if(!window.L) throw new Error('Snow Times needs Leaflet — check the script tag in index.html');
  unmount();
  W = win; root = el;
  root.innerHTML = '<div class="snt"><div class="snt-empty">Loading snow times…</div></div>';
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
// The tab is closing: stop the replay and let go of the map.
function unmount(){
  cancelAnimationFrame(raf);
  if(map){ map.remove(); map = null; layer = null; }
}

return {mount: mount, unmount: unmount};
})();
