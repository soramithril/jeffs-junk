// ── THE NEW HOMEPAGE: four layouts to try (opt-in) ────────────────────────────
// Built for office staff who never go looking for pages: everything that needs doing
// comes to them as a red button that opens the exact screen.
//
// v711 shipped one new layout and nobody kept it ("it wasn't like our mockup"). Since
// 2026-11-03 there are four, drawn from the layout options canvas
// (claude.ai/artifact/SwL3Pvdv6S2HQiyfW2zvH8), and each person picks one with the
// picker in the dashboard's top-right corner, or "Old" for the dashboard as it was:
//   A  Today's Jobs in plain rows, your list and the trucks beside it (the Oct 30 mockup)
//   B  a big map, Today's Jobs down the right, your list as a row of chips
//   C  A, with a small trucks map in the side column
//   D  Today's stops in one lane per driver
// Jake will tell people about it himself, so nothing pops up to ask. Every pick is
// logged to page_views ('home-layout:<id>') so it's plain later which ones get used.
// To drop a layout: delete its line in HOME_LAYOUTS and in HOME_PICKS (and, for B or
// D, its renderer below: _homeOneListHtml / _homeLanesHtml).
//
// The choice is per person, on their user_profiles row (home_layout: null = never
// chosen, 'old', 'a'..'d'; v711's 'new' reads as 'a'), written through the
// set_home_layout() database function because people can't edit their own profile row
// directly (it carries their role).
//
// It is a RE-ARRANGEMENT of the dashboard, not a second copy of it. The bin photo cards
// (#dash-bin-by-size), Waiting on Customer Call and Entered Today are the real cards,
// moved into the new layout (their renderers find them by id wherever they sit) and
// moved back when "Old" is picked. Everything else on the old dashboard is only hidden.
// Today's Jobs is the one piece drawn here: plain rows (v712), so the old card keeps its
// own buttons and chips.
//
// The to-do buttons read the same lists the morning brief does (_jjbGather in
// app-brief.js), so the brief and the buttons can never disagree.
//
// Desktop only (901px and up, the dashboard's own desktop line). Phones keep the phone
// dashboard whatever the setting says.

var HOME_DESKTOP = window.matchMedia('(min-width: 901px)');
var HOME_TRUCK_POLL_MS = 3 * 60 * 1000;   // Geotab allows 10 calls a minute across everything
var HOME_TRUCK_STALE_MS = 12 * 60 * 60 * 1000;   // the office TV's line for "not out today"
var HOME_YARD = { lat:44.4040, lng:-79.6911 }, HOME_YARD_KM = 0.6;   // same as office-tv.html
var HOME_DAY_FULL_MIN = 8 * 60;   // a junk day is full at 8 hours booked IN TOTAL, however many crews (Jake, 2026-11-03)
var HOME_ROWS_SHORT = 5, HOME_LIST_SHORT = 12;   // rows shown before "Show N more"
// The office TV's browser key (office-tv.html says why it is public): locked to
// soramithril.github.io, Maps JavaScript API only, capped daily. Only a map LOAD is
// billed, once per page load, and only for people on B or C.
var HOME_GMAPS_KEY = 'AIzaSyDP9mUAQ0DCWBt8GRQN6649senq4hIDIG8';

// Each layout: which pieces go where, how Today's Jobs is drawn, and where the map sits.
var HOME_LAYOUTS = {
  a: { top:['strip', 'bins'],  main:['jobs', 'overdue', 'folds'], side:['yours', 'trucks'], bottom:[], jobs:'legs', map:null },
  b: { top:['strip', 'chips'], main:['map'], side:['jobs'], bottom:['bins', 'overdue', 'folds'], jobs:'list', map:'home-map-big' },
  c: { top:['strip', 'bins'],  main:['jobs', 'overdue', 'folds'], side:['yours', 'trucks'], bottom:[], jobs:'legs', map:'home-map-small' },
  d: { top:['strip', 'bins'],  main:['jobs', 'overdue', 'folds'], side:['yours', 'trucks'], bottom:[], jobs:'lanes', map:null }
};
var HOME_PICKS = [
  { id:'old', label:'Old', tip:'The dashboard as it always was' },
  { id:'a', label:'A', tip:'Today\'s Jobs in plain rows, your list beside it' },
  { id:'b', label:'B', tip:'A big map, Today\'s Jobs down the right' },
  { id:'c', label:'C', tip:'Like A, with a small trucks map' },
  { id:'d', label:'D', tip:'Today\'s stops in one lane per driver' }
];
var HOME_PIECE = { strip:'home-p-strip', chips:'home-p-chips', bins:'home-p-bins', map:'home-p-map', jobs:'home-jobs',
  overdue:'home-overdue', folds:'home-p-folds', yours:'home-p-yours', trucks:'home-p-trucks' };

var _homePref = null;     // this person's saved choice: null, 'old' or 'a'..'d'
var _homeLay = 'old';     // the layout on screen right now
var _homeReady = false;   // the dashboard's data (jobs, crew) has loaded since sign-in
var _homeMoved = [];      // [{node, mark}] cards moved into the new layout, and where they came from
var _homeBusy = false, _homeAgain = false, _homeTimer = null, _homeTruckTimer = null;
var _homeJobsDay = null;  // the day Today's Jobs is showing (null = today)
var _homeJobsData = null; // {day, d}: the last day list loaded, for redraws that need no new query
var _homeRows = [];       // the rows Today's Jobs is showing; the map pins the same ones
var _homeShowAll = {};    // lists opened past their first few rows
var _homeSeen = {}, _homeSeenDay = '';   // to-dos seen today, so a finished one turns green
var _homeDevices = null;  // the last truck positions from Geotab
var _homeCalls = [];      // the pickup-call popup's list, one at a time
var _homeCallAt = 0;
var _homeEm = null;       // the confirmation emails being worked through: [job id, ...]

function _homeName(){ return ((currentUser && currentUser.displayName) || '').trim().split(' ')[0]; }
function _homeS(n, one, many){ return n === 1 ? one : many; }
function _homeDay(dateStr){ return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long' }); }

// ── Sign-in: put this person's layout on ──
// loaded = the dashboard's data load; the lists wait for it.
async function homeSignedIn(loaded){
  var r = await db.from('user_profiles').select('home_layout').eq('id', currentUser.id).single();
  if(r.error) throw new Error('Homepage: could not read your layout setting: ' + r.error.message);
  _homePref = r.data.home_layout === 'new' ? 'a' : r.data.home_layout;
  _homeSwitchMount();
  if(HOME_LAYOUTS[_homePref]) homeApply(_homePref);
  await loaded;
  _homeReady = true;
  homeRefresh();
}

async function _homeSave(choice){
  var r = await db.rpc('set_home_layout', { choice: choice });
  if(r.error){
    toast('⚠ Couldn\'t save your layout choice: ' + r.error.message, 'error');
    throw new Error('set_home_layout failed: ' + r.error.message);
  }
  _homePref = choice;
  // Which layouts get tried and which get kept. Jake's own clicks don't count, as with page views.
  if(!canAccessDev()) db.from('page_views').insert({ page:'home-layout:' + choice, username:currentUser.displayName }).then(function(x){
    if(x.error) console.warn('Layout pick not logged:', x.error.message);
  });
}

// ── The picker: the same top-right spot on every layout ──
function _homeSwitchMount(){
  if(document.getElementById('home-switch')) return;
  var w = document.createElement('div');
  w.id = 'home-switch';
  w.className = 'home-switch';
  w.innerHTML = '<button type="button" class="home-fb" onclick="go(\'suggestions\')">Tell us what you think</button>'
    + '<span class="home-sw-lbl" id="home-sw-lbl">Homepage</span>'
    + '<span class="home-sw-seg" role="group" aria-labelledby="home-sw-lbl">'
    + HOME_PICKS.map(function(p){
        return '<button type="button" data-lay="' + p.id + '" title="' + escHtml(p.tip) + '" onclick="homePick(\'' + p.id + '\')">' + p.label + '</button>';
      }).join('')
    + '</span>';
  document.getElementById('view-dashboard').appendChild(w);
  _homeSwitchPaint();
}
function _homeSwitchPaint(){
  var w = document.getElementById('home-switch');
  w.querySelectorAll('[data-lay]').forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.lay === _homeLay ? 'true' : 'false'); });
  w.querySelector('.home-fb').hidden = _homeLay === 'old';
}
async function homePick(lay){
  if(lay === _homeLay) return;
  await _homeSave(lay);
  homeApply(lay);
}

// ── Putting a layout on, switching between them, taking them off ──
function homeApply(lay){
  if(!HOME_DESKTOP.matches) lay = 'old';
  if(lay === _homeLay) return;
  var was = _homeLay;
  var view = document.getElementById('view-dashboard');
  if(lay === 'old'){
    _homeMoved.forEach(function(m){ m.mark.parentNode.insertBefore(m.node, m.mark); m.mark.remove(); });
    _homeMoved = [];
    view.classList.remove('home-on');
    document.body.classList.remove('home-on');   // brings back the corner quote reminder (see app-home.css)
    clearInterval(_homeTruckTimer);
  } else {
    _homeBuild();
    if(was === 'old'){
      var slots = {
        'home-slot-bins': document.getElementById('dash-bin-by-size'),
        'home-slot-willcall': document.getElementById('card-will-call').closest('.dash-section'),
        'home-slot-booked': document.getElementById('sec-bookings')
      };
      Object.keys(slots).forEach(function(id){
        var node = slots[id];
        var mark = document.createComment('home: ' + id);
        node.parentNode.insertBefore(mark, node);
        document.getElementById(id).appendChild(node);
        _homeMoved.push({ node: node, mark: mark });
      });
      view.classList.add('home-on');
      document.body.classList.add('home-on');
    }
    _homeArrange(lay);
  }
  _homeLay = lay;
  _homeSwitchPaint();
  if(lay === 'old') return;
  if(_homeJobsData) _homeJobsPaint(_homeJobsData.day, _homeJobsData.d);   // the new layout's style at once; the refresh follows
  homeRefresh();
  if(was === 'old'){
    _homeTrucks();
    clearInterval(_homeTruckTimer);
    _homeTruckTimer = setInterval(_homeTrucks, HOME_TRUCK_POLL_MS);
  }
}
// The width can cross the desktop line (a window dragged narrow): follow the setting.
HOME_DESKTOP.addEventListener('change', function(){
  if(currentUser && _homePref) homeApply(HOME_LAYOUTS[_homePref] ? _homePref : 'old');
});

function _homeBuild(){
  if(document.getElementById('home')) return;
  var h = document.createElement('div');
  h.id = 'home';
  h.innerHTML =
    '<div id="home-top" class="home-stack"></div>'
    + '<div class="home-cols"><div id="home-main" class="home-stack"></div><aside id="home-side" class="home-stack"></aside></div>'
    + '<div id="home-bottom" class="home-stack"></div>'
    // Every piece lives here until a layout places it.
    + '<div id="home-spare" hidden>'
      + '<div id="home-p-strip" class="home-strip">'
        + '<div class="home-hello"><b id="home-hello"></b><span id="home-hello-sub"></span></div>'
        + '<button type="button" class="home-search" onclick="openPalette()">'
          + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.6" y2="16.6"/></svg>'
          + 'Find a customer: type a name, phone number or address</button>'
        + '<button type="button" class="home-btn home-btn-green" onclick="newJob()">'
          + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Job</button>'
        + '<button type="button" class="home-btn home-btn-ghost" onclick="go(\'drdcalc\')">Furniture Quote</button>'
      + '</div>'
      + '<div id="home-p-chips" class="home-chips"></div>'
      + '<div id="home-p-bins" class="home-binrow"><div class="home-binrow-h"><span>Bins in the yard</span>'
        + '<span class="home-note">Same pictures as before, so you can show customers the sizes</span></div>'
        + '<div id="home-slot-bins"></div></div>'
      + '<div id="home-p-map" class="home-card"><div class="home-maph"><b>Today on the map</b><span class="home-note">Stops by town · trucks update every 3 minutes</span></div>'
        + '<div id="home-map-big"></div>'
        + '<div class="home-legend"><span><i class="home-mk-town"></i>Stops in that town</span><span><i class="home-mk-town home-mk-bad"></i>Something still needed</span><span><i class="home-mk-trk"></i>Truck</span></div></div>'
      + '<div id="home-jobs" class="home-card"></div>'
      + '<div id="home-overdue" class="home-card" hidden></div>'
      + '<div id="home-p-folds" class="home-stack">'
        + '<div class="home-folds">'
          + '<button type="button" class="home-fold" onclick="homeFold(\'willcall\')">Waiting on a call to pick up <span class="home-fold-c" id="home-fold-willcall">0 ›</span></button>'
          + '<button type="button" class="home-fold" onclick="homeFold(\'booked\')">Booked today <span class="home-fold-c" id="home-fold-booked">0 ›</span></button>'
        + '</div>'
        + '<div id="home-slot-willcall" class="home-folded" hidden></div>'
        + '<div id="home-slot-booked" class="home-folded" hidden></div>'
      + '</div>'
      + '<div id="home-p-yours" class="home-panel home-yours"><div class="home-ph" id="home-list-title"></div><div id="home-todos"></div></div>'
      + '<div id="home-p-trucks" class="home-panel"><div class="home-ph">Trucks right now <span class="home-ph-note" id="home-trucks-at"></span></div>'
        + '<div id="home-map-small"></div><div id="home-trucks" class="home-trucks"></div></div>'
      + '<div id="home-mapbox"></div>'
    + '</div>';
  var view = document.getElementById('view-dashboard');
  view.insertBefore(h, view.firstChild);
  // The cards the lists are read from redraw on every data change; the layout follows.
  // Debounced, because a realtime burst redraws several times.
  ['dash-today-jobs', 'dash-will-call-list', 'dash-today-bookings', 'dash-needs-you'].forEach(function(id){
    new MutationObserver(function(){
      if(_homeLay === 'old') return;
      clearTimeout(_homeTimer);
      _homeTimer = setTimeout(homeRefresh, 1500);
    }).observe(document.getElementById(id), { childList:true, subtree:true });
  });
}

function _homeArrange(lay){
  var L = HOME_LAYOUTS[lay], spare = document.getElementById('home-spare');
  Object.keys(HOME_PIECE).forEach(function(k){ spare.appendChild(document.getElementById(HOME_PIECE[k])); });
  ['top', 'main', 'side', 'bottom'].forEach(function(where){
    var box = document.getElementById('home-' + where);
    L[where].forEach(function(k){ box.appendChild(document.getElementById(HOME_PIECE[k])); });
  });
  document.getElementById('home').className = 'home-lay-' + lay;
  (L.map ? document.getElementById(L.map) : spare).appendChild(document.getElementById('home-mapbox'));
  _homeMapFit = '';
  if(L.map) _homeMapEnsure();
}

function homeFold(which){
  var el = document.getElementById('home-slot-' + which);
  el.hidden = !el.hidden;
}

// ── The list, the greeting, Today's Jobs and the overdue bins ──
async function homeRefresh(){
  if(_homeLay === 'old' || !_homeReady) return;
  if(_homeBusy){ _homeAgain = true; return; }
  _homeBusy = true;
  try {
    var who = _jjbWho();
    var day = _homeJobsDay || todayStr();
    var extra = await Promise.all([_jjbGather(), who === 'barbara' ? reviewFollowupsDue() : [], who === 'barbara' ? _homeQuotesNoPhotos() : [], _homeOverdue(), _homeJobsLoad(day)]);
    _homeGreet();
    _homeFoldCounts();
    _homeTodosPaint(_homeTodos(extra[0], who, extra[1], extra[2]));
    _homeOverduePaint(extra[3]);
    _homeJobsPaint(day, extra[4]);
  } catch(e){
    document.getElementById('home-todos').innerHTML = '<div class="home-err">Couldn\'t load your list: ' + escHtml(e.message) + '</div>';
    throw e;
  } finally {
    _homeBusy = false;
    if(_homeAgain){ _homeAgain = false; homeRefresh(); }
  }
}

function _homeGreet(){
  var h = new Date().getHours();
  document.getElementById('home-hello').textContent = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + ', ' + _homeName();
  var jc = window._dashTodayCount;
  document.getElementById('home-hello-sub').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
    + (typeof jc === 'number' ? ' · ' + (jc ? jc + ' job' + _homeS(jc, '', 's') + ' today' : 'nothing on today') : '');
}

function _homeFoldCounts(){
  document.getElementById('home-fold-willcall').textContent = document.querySelectorAll('#dash-will-call-list .djj-row').length + ' ›';
  document.getElementById('home-fold-booked').textContent = document.querySelectorAll('#dash-today-bookings .djj-row').length + ' ›';
}

// Kevin drives the big truck: only he can PICK UP a 4 or 7 yard bin.
function _homeKevin(){
  var k = crewMembers.filter(function(c){ return /^kevin\b/i.test(c.name || ''); });
  if(k.length !== 1) throw new Error('Homepage: expected one Kevin on the crew list, found ' + k.length);
  return k[0];
}
function _homeBig(s){ var n = parseInt(s.j.bin_size, 10); return s.leg === 'pick' && (n === 4 || n === 7); }

// Each person's to-dos, built fresh from the data. Only what has something in it shows.
// key = which to-do it is (so a finished one can turn green), c = its short name on B's
// chips, done = what it says once finished.
// who: 'rachel' | 'barbara' | 'office' (Kelly and everyone else) — the morning brief's split.
function _homeTodos(d, who, reviews, noPhotos){
  var T = [], tomorrow = _jjbPlus(d.today, 1), tDay = _homeDay(tomorrow);
  function add(o){ if(o.n) T.push(o); }

  function drivers(){
    var none = d.tomorrowStops.filter(function(s){ return !s.driver && !(s.leg === 'pick' && s.j.bin_instatus === 'pickedup'); });
    var kevin = _homeKevin();
    var kevinOff = crewStatusForDate(kevin.id, tomorrow).state === 'off';
    var big = d.tomorrowStops.filter(function(s){ return _homeBig(s) && s.driver !== kevin.id; });
    var keys = {};
    none.concat(big).forEach(function(s){ keys[s.leg + ':' + s.j.job_id] = 1; });
    var sub = [];
    if(none.length) sub.push(tDay + ' has ' + none.length + ' stop' + _homeS(none.length, '', 's') + ' with no driver yet');
    var bigWords = big.length === 1 ? 'a 4 or 7 yard pickup' : big.length + ' pickups of 4 or 7 yard bins';
    if(big.length) sub.push(kevinOff
      ? 'Kevin is off ' + tDay + ', and only he can do ' + bigWords
      : (big.length === 1 ? 'A 4 or 7 yard pickup isn\'t' : big.length + ' pickups of 4 or 7 yard bins aren\'t') + ' with Kevin');
    add({ key:'drivers', c:'Pick drivers', done:'Drivers picked for tomorrow', n: Object.keys(keys).length, t:'Pick drivers for tomorrow', s: sub.join(' · '), go:'Assign',
      fn: function(){ _dispatchDate = tomorrow; go('dispatch'); } });
  }
  function binNumbers(){
    // Today's drops still without a number, then any earlier ones that slipped by.
    var todayIds = d.todayStops.filter(function(s){ return s.leg === 'drop' && !s.j.bin_bid && !s.j.bin_live_load; })
      .map(function(s){ return { id: s.j.job_id, name: s.j.name, size: s.j.bin_size }; });
    var past = d.binNum.map(function(j){ return { id: j.id, name: j.name, size: j.binSize }; });
    var all = todayIds.concat(past);
    add({ key:'bins', c:'Bin numbers', done:'Bin numbers given', n: all.length, t: all.length === 1 ? 'Give a bin number to a job' : 'Give bin numbers to ' + all.length + ' jobs',
      s: all.length ? (all[0].name || 'A job') + ' needs a ' + String(all[0].size || '').toLowerCase() + (todayIds.length ? ' today' : '') : '',
      go:'Pick bin', fn: function(){ openAssignBinPicker(all[0].id); } });
  }
  function emails(){
    var em = d.emails;
    add({ key:'emails', c:'Emails', done:'Confirmations emailed', n: em.length, t:'Email ' + em.length + ' confirmation' + _homeS(em.length, '', 's'),
      s: em.length ? 'Soonest: ' + (em[0].name || '') + ', ' + _jjbWhen(_needsEmailDate(em[0]), d.today) : '',
      go:'Email', fn: function(){ homeEmailsOpen(em); } });
  }
  function quotes(){
    var q = d.quotes;
    add({ key:'quotes', c:'Quote calls', done:'Quotes called back', n: q.length, t:'Call back ' + q.length + ' quote' + _homeS(q.length, '', 's'),
      s:'Visited, no answer yet' + (q.length ? ': ' + (q[0].name || '') + (q.length > 1 ? ' and ' + (q.length - 1) + ' more' : '') : ''),
      go:'Call', fn: function(){ go('junkquotes'); } });
  }
  function calls(){
    var c = d.calls;
    add({ key:'calls', c:'Pickup calls', done:'Tomorrow\'s pickups called', n: c.length, t:'Call tomorrow\'s ' + c.length + ' pickup' + _homeS(c.length, '', 's'),
      s:'Check each one is ready to go', go:'Call', fn: function(){ homeCallsOpen(c); } });
  }
  function binsBack(){
    var bt = d.backToday;
    add({ key:'back', c:'Bins back', done:'Bins marked back in the yard', n: bt.length, t:'Mark ' + bt.length + ' bin' + _homeS(bt.length, '', 's') + ' back in the yard',
      s: (bt.length ? 'Bin ' + (bt[0].j.bin_bid || '') + ', ' + (bt[0].j.name || '') + ' · ' : '') + 'picked up today, not marked back yet', go:'Mark',
      fn: function(){ openDetail(bt[0].j.job_id); } });
  }
  function reviewAsks(){
    add({ key:'reviews', c:'Review asks', done:'Happy customers asked for a review', n: reviews.length,
      t: reviews.length === 1 ? 'Ask a happy customer for a review' : 'Ask ' + reviews.length + ' happy customers for a review',
      s: reviews.length ? (reviews[0].name || '') + ' · finished ' + fd(reviews[0].done) : '',
      go:'Ask', fn: function(){ openReviewText(reviews[0].id); } });
  }
  function photos(){
    add({ key:'photos', c:'Quote photos', done:'Photos added to today\'s quotes', n: noPhotos.length,
      t: noPhotos.length === 1 ? 'Add photos to a quote' : 'Add photos to ' + noPhotos.length + ' quotes',
      s: noPhotos.length ? (noPhotos[0].name || '') + '\'s visit today has none yet' : '',
      go:'Add', fn: function(){ openDetail(noPhotos[0].job_id); } });
  }

  if(who === 'rachel'){ emails(); binsBack(); calls(); }
  else if(who === 'barbara'){ quotes(); reviewAsks(); photos(); calls(); }
  else { drivers(); binNumbers(); emails(); quotes(); calls(); }
  return T;
}

// A to-do that was on the list earlier today and has nothing left in it is done: it
// turns green with a tick instead of vanishing. Only the data clears it, never a click.
var _homeGo = [];
function _homeTodosPaint(T){
  var today = todayStr();
  if(_homeSeenDay !== today){ _homeSeen = {}; _homeSeenDay = today; }
  var now = {};
  T.forEach(function(t){ now[t.key] = 1; _homeSeen[t.key] = t; });
  var done = Object.keys(_homeSeen).filter(function(k){ return !now[k]; }).map(function(k){ return _homeSeen[k]; });
  _homeGo = T.map(function(t){ return t.fn; });
  var name = _homeName();
  var count = T.length ? name + ', ' + T.length + ' thing' + _homeS(T.length, '', 's') + ' for you' : name + ', you\'re all caught up';
  document.getElementById('home-list-title').textContent = count;
  document.getElementById('home-todos').innerHTML = (T.length
    ? T.map(function(t, i){
        return '<button type="button" class="home-todo" onclick="homeGo(' + i + ')"><span class="home-todo-n">' + t.n + '</span>'
          + '<span class="home-todo-t"><b>' + escHtml(t.t) + '</b>' + (t.s ? '<small>' + escHtml(t.s) + '</small>' : '') + '</span>'
          + '<span class="home-todo-go">' + escHtml(t.go) + ' →</span></button>';
      }).join('')
    : '<div class="home-allclear">✓ Nothing waiting on you right now.</div>')
    + done.map(function(t){
        return '<div class="home-todo home-done"><span class="home-todo-n">✓</span><span class="home-todo-t"><b>' + escHtml(t.done) + '</b></span><span class="home-todo-go">Done</span></div>';
      }).join('');
  // Layout B's row of chips: the same list, shorter words.
  document.getElementById('home-p-chips').innerHTML = '<span class="home-chips-who">' + escHtml(count) + (T.length ? ':' : '') + '</span>'
    + T.map(function(t, i){
        return '<button type="button" class="home-chip" onclick="homeGo(' + i + ')" title="' + escHtml(t.t + (t.s ? ' · ' + t.s : '')) + '"><b>' + t.n + '</b>' + escHtml(t.c) + '</button>';
      }).join('')
    + done.map(function(t){ return '<span class="home-chip home-done">✓ ' + escHtml(t.c) + '</span>'; }).join('');
}
function homeGo(i){ _homeGo[i](); }

// Today's quote visits with no photos yet (Barbara).
async function _homeQuotesNoPhotos(){
  var today = todayStr();
  var r = await db.from('jobs').select('job_id,name,photos').eq('service', 'Junk Quote').neq('status', 'Cancelled')
    .or('junk_date.eq.' + today + ',and(junk_date.is.null,date.eq.' + today + ')');
  if(r.error) throw new Error('Homepage: quote photos query failed: ' + r.error.message);
  return r.data.filter(function(q){ return !(q.photos || []).length; });
}

// ── Today's Jobs ──
// One row = time, customer, town and bin, size, who's driving. What is missing is said
// in red ("No driver yet", "no bin number yet") and the row turns pink. Clicking opens
// the job, which has every button the old rows carried. Three ways to lay it out:
// 'legs' (A, C): drop-offs and pickups side by side, then junk, quotes and furniture;
// 'list' (B): one list in time order; 'lanes' (D): one lane per driver.
var HOME_JOB_COLS = 'job_id,name,city,service,status,date,time,bin_size,bin_bid,bin_dropoff,bin_pickup,bin_dropoff_time,bin_pickup_time,'
  + 'junk_date,junk_time,fb_date,fb_time,dropoff_crew_id,pickup_crew_id,assigned_crew_ids,bin_live_load,bin_instatus,est_duration_min,completed';
var HOME_OTHER = ['Junk Removal', 'Junk Quote', 'Furniture Pickup', 'Furniture Delivery', 'Extra Jobs'];

async function _homeJobsLoad(day){
  var res = await Promise.all([
    db.from('jobs').select(HOME_JOB_COLS).eq('service', 'Bin Rental').neq('status', 'Cancelled')
      .or('bin_dropoff.eq.' + day + ',and(bin_dropoff.is.null,date.eq.' + day + ')'),
    db.from('jobs').select(HOME_JOB_COLS).eq('service', 'Bin Rental').neq('status', 'Cancelled').eq('bin_pickup', day),
    db.from('jobs').select(HOME_JOB_COLS).in('service', HOME_OTHER).neq('status', 'Cancelled')
      .or('junk_date.eq.' + day + ',fb_date.eq.' + day + ',date.eq.' + day)
  ]);
  res.forEach(function(r){ if(r.error) throw new Error('Homepage: day list query failed: ' + r.error.message); });
  return {
    // Same rules as the old card: a bin with no drop date but a pickup that day is a pickup,
    // and a live load is one truck visit, shown on the drop side only.
    drops: res[0].data.filter(function(j){ return !(!j.bin_dropoff && j.bin_pickup === day); }),
    picks: res[1].data.filter(function(j){ return !(j.bin_live_load && j.bin_dropoff === day); }),
    other: res[2].data.filter(function(j){
      var d = (j.service === 'Furniture Pickup' || j.service === 'Furniture Delivery') ? (j.fb_date || j.date) : (j.junk_date || j.date);
      return d === day && !(j.service === 'Extra Jobs' && j.completed);
    })
  };
}

function _homeCrewName(id){
  var c = crewMembers.find(function(m){ return m.id === id; });
  return c ? c.name.split(' ')[0] : 'Unknown crew';
}
function _homeTime(t){ return t === 'anytime' ? 'Any' : t ? ft(t).replace(/ (AM|PM)$/, '') : ''; }

// One row's facts. sub = html pieces joined with " · "; who = html.
function _homeJobRow(j, leg, kevinId){
  var r = { id:j.job_id, leg:leg, city:j.city || '', flag:false, back:false, drv:null, size:'', sub:[], who:'', junk:false, hours:0 };
  if(j.city) r.sub.push(escHtml(j.city));
  if(j.service === 'Bin Rental'){
    r.name = j.name;
    r.time = _homeTime(leg === 'drop' ? j.bin_dropoff_time : j.bin_pickup_time);
    if(j.bin_bid) r.sub.push('bin ' + escHtml(j.bin_bid));
    else if(leg === 'drop' && !j.bin_live_load){ r.sub.push('<span class="home-miss">no bin number yet</span>'); r.flag = true; }
    var drv = leg === 'drop' ? j.dropoff_crew_id : j.pickup_crew_id;
    var size = parseInt(j.bin_size, 10);
    r.drv = drv || null;
    r.size = size || '';
    if(leg === 'pick' && j.bin_instatus === 'pickedup'){ r.who = '<span class="home-drv home-ok">Back ✓</span>'; r.back = true; }
    else if(!drv){ r.who = '<span class="home-drv home-miss">No driver yet</span>'; r.flag = true; }
    else if(leg === 'pick' && (size === 4 || size === 7) && drv !== kevinId){
      r.who = '<span class="home-drv home-miss">' + escHtml(_homeCrewName(drv)) + ' · needs Kevin</span>'; r.flag = true;
    }
    else r.who = '<span class="home-drv">' + escHtml(_homeCrewName(drv)) + '</span>';
    return r;
  }
  var label = j.service === 'Junk Quote' ? 'Quote visit' : j.service === 'Extra Jobs' ? 'Extra job' : j.service;
  var furn = j.service === 'Furniture Pickup' || j.service === 'Furniture Delivery';
  r.name = label + ' · ' + (j.name || '');
  r.time = _homeTime(furn ? j.fb_time : j.junk_time);
  r.junk = j.service === 'Junk Removal';
  r.hours = j.est_duration_min || 0;
  if(j.est_duration_min) r.sub.push(fmtDur(j.est_duration_min));
  else if(r.junk) r.sub.push('hours not set');
  var crew = j.assigned_crew_ids || [];
  if(!crew.length){ r.who = '<span class="home-drv home-miss">No crew yet</span>'; r.flag = true; }
  else r.who = '<span class="home-drv">' + escHtml(crew.map(_homeCrewName).join(', ')) + '</span>';
  return r;
}

// Timed stops first in time order, then "Any", then no time at all.
function _homeTimeKey(t){
  if(!t) return '99';
  if(t === 'Any') return '98';
  var p = t.split(':'), h = parseInt(p[0], 10);
  if(h < 6) h += 12;   // the AM/PM was dropped for the row; nobody books a bin before 6
  return (h < 10 ? '0' : '') + h + ':' + p[1];
}
function _homeSortRows(rows){
  return rows.slice().sort(function(a, b){ var x = _homeTimeKey(a.time), y = _homeTimeKey(b.time); return x < y ? -1 : x > y ? 1 : 0; });
}
function _homeRowHtml(r, kind){
  return '<button type="button" class="home-jrow' + (r.flag ? ' home-flag' : '') + '" onclick="openDetail(\'' + r.id + '\')">'
    + '<span class="home-jtm">' + escHtml(r.time) + '</span>'
    + '<span class="home-jmain"><span class="home-jnm">' + escHtml(r.name || r.id) + '</span><span class="home-jsub">' + (kind ? kind + ' · ' : '') + r.sub.join(' · ') + '</span></span>'
    + '<span class="home-jrt">' + (r.size ? '<span class="home-size">' + r.size + '</span>' : '') + r.who + '</span></button>';
}
// A list of rows, cut to its first few with a "Show N more" (never for just one more).
function _homeListHtml(rows, key, short, empty, kindOf){
  if(!rows.length) return empty ? '<div class="home-jempty">' + empty + '</div>' : '';
  rows = _homeSortRows(rows);
  var all = _homeShowAll[key] || rows.length <= short + 1;
  return (all ? rows : rows.slice(0, short)).map(function(r){ return _homeRowHtml(r, kindOf ? kindOf(r) : ''); }).join('')
    + (all ? '' : '<button type="button" class="home-more" onclick="homeMore(\'' + key + '\')">Show ' + (rows.length - short) + ' more</button>');
}
function homeMore(key){
  _homeShowAll[key] = true;
  _homeJobsPaint(_homeJobsData.day, _homeJobsData.d);
}
// " · 6 of 8 hours of junk booked" (red once the day is full). Junk removals only.
function _homeHoursHtml(other){
  var junk = other.filter(function(r){ return r.junk; });
  if(!junk.length) return '';
  var min = junk.reduce(function(t, r){ return t + r.hours; }, 0);
  var unset = junk.filter(function(r){ return !r.hours; }).length;
  var full = min >= HOME_DAY_FULL_MIN;
  return ' · <span class="' + (full ? 'home-full' : '') + '">' + (Math.round(min / 30) / 2) + ' of 8 hours of junk booked' + (full ? ', day is full' : '') + '</span>'
    + (unset ? ' <span class="home-hnote">(' + unset + ' with no hours yet)</span>' : '');
}

function _homeJobsPaint(day, d){
  _homeJobsData = { day:day, d:d };
  if(_homeLay === 'old') return;
  var kevinId = _homeKevin().id;
  var drops = d.drops.map(function(j){ return _homeJobRow(j, 'drop', kevinId); });
  var picks = d.picks.map(function(j){ return _homeJobRow(j, 'pick', kevinId); });
  var other = d.other.map(function(j){ return _homeJobRow(j, 'other', kevinId); });
  var all = drops.concat(picks, other), need = all.filter(function(r){ return r.flag; }).length, ready = all.length - need;
  _homeRows = all;
  var off = Math.round((new Date(day + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 86400000);
  var title = off === 0 ? 'Today\'s Jobs' : off === 1 ? 'Tomorrow\'s Jobs' : off === -1 ? 'Yesterday\'s Jobs'
    : new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  var style = HOME_LAYOUTS[_homeLay].jobs;
  var body = style === 'legs' ? _homeLegsHtml(drops, picks, other) : style === 'list' ? _homeOneListHtml(all, other) : _homeLanesHtml(drops, picks, other);
  document.getElementById('home-jobs').innerHTML =
    '<div class="home-jhead"><span class="home-jt">' + title + '</span><span class="home-jcnt">' + all.length + '</span>'
      + '<span class="home-daynav"><button type="button" onclick="homeJobsDay(-1)">‹ Back</button>'
      + '<button type="button"' + (off === 0 ? ' class="on"' : '') + ' onclick="homeJobsDay(0)">Today</button>'
      + '<button type="button" onclick="homeJobsDay(1)">Next ›</button></span></div>'
    + '<div class="home-sumline">' + (!all.length ? 'Nothing booked.' : need
        ? ready + ' ' + _homeS(ready, 'is', 'are') + ' ready. <b>' + need + ' still ' + _homeS(need, 'needs', 'need') + ' something</b>, shown in red below.'
        : 'All ' + all.length + ' are ready.') + '</div>'
    + body;
  _homeMapPaint();
}

function _homeLegsHtml(drops, picks, other){
  var os = _homeSortRows(other), half = Math.ceil(os.length / 2);
  return '<div class="home-legs"><div class="home-leg"><div class="home-leg-h">Dropping off bins · ' + drops.length + '</div>' + _homeListHtml(drops, 'drop', HOME_ROWS_SHORT, 'No drop-offs.') + '</div>'
      + '<div class="home-leg"><div class="home-leg-h">Picking up bins · ' + picks.length + '</div>' + _homeListHtml(picks, 'pick', HOME_ROWS_SHORT, 'No pickups.') + '</div></div>'
    + (os.length ? '<div class="home-leg-h home-leg-top">Junk, quotes and furniture · ' + os.length + _homeHoursHtml(other) + '</div>'
      + '<div class="home-legs"><div class="home-leg">' + _homeListHtml(os.slice(0, half), 'o1', 99, '') + '</div><div class="home-leg">' + _homeListHtml(os.slice(half), 'o2', 99, '') + '</div></div>' : '');
}

// Layout B: everything in one list, time order, each row saying what kind of stop it is.
function _homeOneListHtml(all, other){
  return '<div class="home-leg-h">Every stop · ' + all.length + _homeHoursHtml(other) + '</div>'
    + _homeListHtml(all, 'all', HOME_LIST_SHORT, 'Nothing booked.', function(r){ return r.leg === 'drop' ? 'Drop-off' : r.leg === 'pick' ? 'Pickup' : ''; });
}

// Layout D: a lane per driver for the bins, a red lane on top for stops nobody has yet,
// and one lane for junk, quotes and furniture (their crews are listed on each stop).
function _homeLanesHtml(drops, picks, other){
  var lanes = {}, order = [];
  function lane(key, who){ if(!lanes[key]){ lanes[key] = { who:who, rows:[] }; order.push(key); } return lanes[key]; }
  var bins = drops.concat(picks);
  if(bins.some(function(r){ return !r.drv; })) lane('none', 'No driver yet');
  bins.filter(function(r){ return r.drv; })
    .sort(function(a, b){ var x = _homeCrewName(a.drv), y = _homeCrewName(b.drv); return x < y ? -1 : x > y ? 1 : 0; })
    .forEach(function(r){ lane('d:' + r.drv, _homeCrewName(r.drv)); });
  bins.forEach(function(r){ lanes[r.drv ? 'd:' + r.drv : 'none'].rows.push(r); });
  if(other.length){ var o = lane('other', 'Junk, quotes and furniture'); o.rows = other; o.hours = _homeHoursHtml(other); }
  if(!order.length) return '<div class="home-jempty">Nothing booked.</div>';
  return '<div class="home-lanes">' + order.map(function(k){
    var L = lanes[k], rows = _homeSortRows(L.rows), bad = rows.some(function(r){ return r.flag; });
    return '<div class="home-lane' + (bad ? ' home-lane-bad' : '') + '">'
      + '<div class="home-lane-who"><b>' + escHtml(L.who) + '</b><small>' + rows.length + ' stop' + _homeS(rows.length, '', 's') + (L.hours || '') + '</small></div>'
      + '<div class="home-lane-stops">' + rows.map(_homeStopHtml).join('') + '</div></div>';
  }).join('') + '</div>';
}
function _homeStopHtml(r){
  var kind = r.leg === 'drop' ? 'Drop' : r.leg === 'pick' ? 'Pickup' : '';
  return '<button type="button" class="home-stop' + (r.flag ? ' home-flag' : '') + (r.back ? ' home-stop-done' : '') + '" onclick="openDetail(\'' + r.id + '\')">'
    + '<span class="home-stop-k">' + escHtml([r.time, kind, r.size ? r.size + ' yd' : ''].filter(Boolean).join(' · ')) + '</span>'
    + '<span class="home-stop-nm">' + escHtml(r.name || r.id) + '</span>'
    + '<span class="home-stop-sub">' + r.sub.join(' · ') + '</span>'
    + (r.flag || r.back || r.leg === 'other' ? '<span class="home-stop-who">' + r.who + '</span>' : '')
    + '</button>';
}

// ‹ Back / Today / Next ›: step a day, or come back to today.
async function homeJobsDay(step){
  var cur = _homeJobsDay || todayStr();
  _homeJobsDay = step === 0 ? null : _jjbPlus(cur, step);
  _homeShowAll = {};
  var day = _homeJobsDay || todayStr();
  _homeJobsPaint(day, await _homeJobsLoad(day));
}

// ── Bins that should have come back: always open, nothing folded ──
async function _homeOverdue(){
  var r = await db.from('jobs').select('job_id,name,city,bin_bid,bin_size,bin_dropoff,bin_pickup')
    .eq('service', 'Bin Rental').eq('bin_instatus', 'dropped').neq('status', 'Cancelled').lt('bin_pickup', todayStr())
    .order('bin_pickup');
  if(r.error) throw new Error('Homepage: overdue bins query failed: ' + r.error.message);
  return r.data;
}
function _homeOverduePaint(rows){
  var el = document.getElementById('home-overdue');
  el.hidden = !rows.length;
  if(!rows.length){ el.innerHTML = ''; return; }
  var today = new Date(todayStr() + 'T12:00:00');
  el.innerHTML = '<div class="home-leg-h home-bad">Bins that should have come back · ' + rows.length + '</div>'
    + rows.map(function(j){
      var out = j.bin_dropoff ? Math.round((today - new Date(j.bin_dropoff + 'T12:00:00')) / 86400000) : null;
      return '<button type="button" class="home-row" onclick="openDetail(\'' + j.job_id + '\')">'
        + '<span class="home-row-main"><span class="home-row-nm">' + escHtml(j.name || j.job_id) + (j.bin_bid ? ' · bin ' + escHtml(j.bin_bid) : '') + '</span>'
        + '<span class="home-row-sub">' + escHtml([j.city, (out != null ? 'out ' + out + ' day' + _homeS(out, '', 's') + ', ' : '') + 'due back ' + fd(j.bin_pickup)].filter(Boolean).join(' · ')) + '</span></span>'
        + '<span class="home-size">' + (j.bin_size ? parseInt(j.bin_size, 10) : '') + '</span><span class="home-miss">Call them</span></button>';
    }).join('');
}

// ── Trucks right now: the office TV's feed, as words (and on B and C, on the map) ──
// Read-only, like every other Geotab reader. No driver names: who drives which truck is
// only known from the day's GPS stops (no fixed pairings), so the truck is named instead.
// Geotab's feed carries no "stopped since", so a stopped truck just says Stopped.
async function _homeTrucks(){
  if(_homeLay === 'old' || document.hidden) return;
  var el = document.getElementById('home-trucks');
  var d;
  try {
    var r = await fetch(SUPABASE_URL + '/functions/v1/geotab-proxy', {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ action:'device-status' })
    });
    d = await r.json();
    if(!d.ok) throw new Error(d.error || 'device-status failed');
  } catch(e){
    el.innerHTML = '<div class="home-err">Couldn\'t reach the trucks: ' + escHtml(e.message) + '</div>';
    throw e;
  }
  _homeDevices = d.devices;
  var rows = d.devices.slice().sort(function(a, b){ return a.name < b.name ? -1 : 1; }).map(function(t){
    var s = _homeTruckState(t);
    return '<div class="home-trk' + s.cls + '"><span class="home-trk-w">' + escHtml(t.name) + '</span><span class="home-trk-wh">' + escHtml(s.where) + '</span><span class="home-trk-st">' + s.st + '</span></div>';
  });
  el.innerHTML = rows.join('') || '<div class="home-row-sub">No trucks reporting.</div>';
  document.getElementById('home-trucks-at').textContent = new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  _homeMapPaint();
}
function _homeTruckState(t){
  if(!t.lastUpdate || Date.now() - new Date(t.lastUpdate).getTime() > HOME_TRUCK_STALE_MS) return { where:'not out today', st:'Parked', cls:' home-dim', out:false };
  if(_homeKm(t.lat, t.lng, HOME_YARD.lat, HOME_YARD.lng) <= HOME_YARD_KM) return { where:'in the yard', st:'In the yard', cls:' home-dim', out:true };
  var moving = Math.round(t.speed || 0) > 0;
  return { where:_homeTown(t.lat, t.lng), st: moving ? 'Driving' : 'Stopped', cls: moving ? ' home-go' : '', out:true, moving:moving };
}
function _homeKm(aLat, aLng, bLat, bLng){
  var R = 6371, k = Math.PI / 180, dLat = (bLat - aLat) * k, dLng = (bLng - aLng) * k;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(aLat * k) * Math.cos(bLat * k) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// Nearest town from the coverage list in app.js (its rows become {area, lat, lng} at start-up).
function _homeTown(lat, lng){
  var best = '', bestKm = Infinity;
  RC_CITIES.forEach(function(c){ var km = _homeKm(lat, lng, c.lat, c.lng); if(km < bestKm){ bestKm = km; best = c.area; } });
  if(!best) throw new Error('Homepage: no town found for ' + lat + ',' + lng);
  return best;
}
// A job's town on the coverage list. "Barrie, ON" and "barrie " both find Barrie.
var _homeTownMissed = {};
function _homeTownOf(city){
  var key = String(city || '').toLowerCase().replace(/,.*$/, '').trim();
  if(!key) return null;
  var c = RC_CITIES.find(function(x){ return x.area.toLowerCase() === key; });
  if(!c && !_homeTownMissed[key]){ _homeTownMissed[key] = 1; console.warn('Homepage map: no town match for', city); }
  return c || null;
}

// ── The map (layouts B and C) ──
// Google's map, the same key and the same idea as the office TV: jobs carry a town, not
// coordinates, so each town with stops gets one pin with how many, red if any of them
// still needs something; trucks sit where Geotab last saw them.
var _homeMap = null, _homeMapFit = '', _homeMk = { towns:{}, trucks:{} };
function _homeMapEnsure(){
  if(_homeMap) return;
  if(window.google && google.maps){ _homeMapMake(); return; }
  if(document.getElementById('home-gmaps')) return;   // already loading; its callback makes the map
  window.__homeGmapsReady = _homeMapMake;
  var s = document.createElement('script');
  s.id = 'home-gmaps';
  s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(HOME_GMAPS_KEY) + '&v=weekly&loading=async&callback=__homeGmapsReady';
  s.async = true;
  document.head.appendChild(s);
}
function _homeMapMake(){
  if(_homeMap) return;
  _homeMap = new google.maps.Map(document.getElementById('home-mapbox'), {
    center:{ lat:HOME_YARD.lat, lng:HOME_YARD.lng }, zoom:10,
    disableDefaultUI:true, zoomControl:true, gestureHandling:'cooperative', clickableIcons:false, isFractionalZoomEnabled:true,
    styles:[{ featureType:'poi', stylers:[{ visibility:'off' }] }, { featureType:'transit', stylers:[{ visibility:'off' }] }]
  });
  // The map load is the one thing Google bills; counted on the same Usage line as the TV's.
  db.rpc('bump_google_api', { p_api:'maps_dynamic' }).then(function(r){ if(r.error) console.warn('map load not counted', r.error.message); });
  _homeMarker(new google.maps.LatLng(HOME_YARD.lat, HOME_YARD.lng), '<div class="home-mk-yard" title="The yard"></div>', false);
  _homeMapPaint();
}
// Our pins are HTML on an overlay that turns a lat/lng into a pixel spot as the map moves
// (office-tv.html's htmlMarker). above = sit over the point (a truck tag) rather than on it.
function _homeMarker(latLng, html, above){
  var o = new google.maps.OverlayView();
  o.__ll = latLng; o.__html = html;
  o.onAdd = function(){
    var d = document.createElement('div');
    d.style.position = 'absolute';
    d.innerHTML = o.__html;
    o.__div = d;
    o.getPanes().floatPane.appendChild(d);
  };
  o.draw = function(){
    var proj = o.getProjection();
    if(!proj || !o.__div) return;
    var p = proj.fromLatLngToDivPixel(o.__ll);
    if(!p) return;
    o.__div.style.left = (p.x - o.__div.offsetWidth / 2) + 'px';
    o.__div.style.top = (p.y - (above ? o.__div.offsetHeight + 6 : o.__div.offsetHeight / 2)) + 'px';
  };
  o.onRemove = function(){ if(o.__div) o.__div.remove(); o.__div = null; };
  o.setContent = function(h){ o.__html = h; if(o.__div){ o.__div.innerHTML = h; o.draw(); } };
  o.setPosition = function(ll){ o.__ll = ll; o.draw(); };
  o.setMap(_homeMap);
  return o;
}
function _homeMapPaint(){
  if(!_homeMap || _homeLay === 'old' || !HOME_LAYOUTS[_homeLay].map) return;
  var bounds = new google.maps.LatLngBounds(), any = false;
  bounds.extend({ lat:HOME_YARD.lat, lng:HOME_YARD.lng });
  var by = {};
  _homeRows.forEach(function(r){
    var t = _homeTownOf(r.city);
    if(!t) return;
    var g = by[t.area] || (by[t.area] = { t:t, n:0, bad:0, names:[] });
    g.n++;
    if(r.flag) g.bad++;
    g.names.push(r.name || r.id);
  });
  Object.keys(by).forEach(function(area){
    var g = by[area];
    var html = '<div class="home-mk-town' + (g.bad ? ' home-mk-bad' : '') + '" title="' + escHtml(area + ': ' + g.names.join(', ')) + '">' + g.n + '</div>';
    if(_homeMk.towns[area]) _homeMk.towns[area].setContent(html);
    else _homeMk.towns[area] = _homeMarker(new google.maps.LatLng(g.t.lat, g.t.lng), html, false);
    bounds.extend({ lat:g.t.lat, lng:g.t.lng });
    any = true;
  });
  Object.keys(_homeMk.towns).forEach(function(area){ if(!by[area]){ _homeMk.towns[area].setMap(null); delete _homeMk.towns[area]; } });
  var seen = {};
  (_homeDevices || []).forEach(function(t){
    var s = _homeTruckState(t);
    if(!s.out) return;
    seen[t.name] = 1;
    var ll = new google.maps.LatLng(t.lat, t.lng);
    var html = '<div class="home-mk-trk' + (s.moving ? ' home-mk-go' : '') + '" title="' + escHtml(t.name + ' · ' + s.st + ', ' + s.where) + '">' + escHtml(t.name) + '</div>';
    if(_homeMk.trucks[t.name]){ _homeMk.trucks[t.name].setPosition(ll); _homeMk.trucks[t.name].setContent(html); }
    else _homeMk.trucks[t.name] = _homeMarker(ll, html, true);
    bounds.extend(ll);
    any = true;
  });
  Object.keys(_homeMk.trucks).forEach(function(n){ if(!seen[n]){ _homeMk.trucks[n].setMap(null); delete _homeMk.trucks[n]; } });
  // Framed once per layout and day, so a pan or zoom someone made isn't undone every 3 minutes.
  var key = _homeLay + '|' + (_homeJobsData ? _homeJobsData.day : '');
  if(_homeMapFit === key) return;
  _homeMapFit = key;
  if(any) _homeMap.fitBounds(bounds, 40);
  else { _homeMap.setCenter({ lat:HOME_YARD.lat, lng:HOME_YARD.lng }); _homeMap.setZoom(11); }
}

// ── Confirmation emails: the list beside the email screen ──
// "Email 4 confirmations" opens the normal email screen on the first one with the whole
// list down the left: click a name to load theirs, or "No email needed" (the same flag as
// the old card's button). Sent ones tick off in place. Only this button does it: opened
// from anywhere else, the email screen is exactly as it was. Closing the email screen
// ends the run.
function homeEmailsOpen(list){
  _homeEm = list.map(function(j){ return j.id; });
  if(!document.getElementById('home-em')){
    var p = document.createElement('aside');
    p.id = 'home-em';
    p.setAttribute('aria-label', 'Confirmations to send');
    document.body.appendChild(p);
    var modal = document.getElementById('email-modal'), note = document.getElementById('email-sent-note');
    if(!note) throw new Error('Homepage: the email screen has no #email-sent-note');
    new MutationObserver(function(){ if(_homeEm && !modal.classList.contains('open')) homeEmailsClose(false); })
      .observe(modal, { attributes:true, attributeFilter:['class'] });
    // The "Sent just now" receipt shows on a send and hides on Undo or the next job.
    new MutationObserver(function(){ if(_homeEm) _homeEmPaint(); })
      .observe(note, { attributes:true, attributeFilter:['style'] });
  }
  document.body.classList.add('home-em-on');
  homeEmPick(_homeEm[0]);
}
function _homeEmJob(id){
  var j = jobs.find(function(x){ return x.id === id; });
  if(!j) throw new Error('Homepage: job ' + id + ' is not loaded');
  return j;
}
function _homeEmDone(j){ return j.emailSent || j.emailConfirmed || j.noEmail; }
// The next one still to do after the one on screen (or the first one left).
function _homeEmNext(){
  var at = _homeEm.indexOf(emailJobId), ids = _homeEm.slice(at + 1).concat(_homeEm.slice(0, at + 1));
  return ids.find(function(id){ return !_homeEmDone(_homeEmJob(id)); }) || null;
}
function _homeEmPaint(){
  var today = todayStr(), rows = _homeEm.map(_homeEmJob);
  var left = rows.filter(function(j){ return !_homeEmDone(j); }).length;
  var cur = _homeEmJob(emailJobId), next = _homeEmDone(cur) ? _homeEmNext() : null;
  document.getElementById('home-em').innerHTML =
    '<div class="home-em-h"><b>' + (left ? left + ' confirmation' + _homeS(left, '', 's') + ' to send' : 'All done') + '</b>'
      + '<button type="button" class="home-em-x" onclick="homeEmailsClose(true)">Close</button></div>'
    + rows.map(function(j){
        var sent = j.emailSent || j.emailConfirmed;
        var state = sent ? '<span class="home-em-ok">✓ Sent</span>' : j.noEmail ? '<span class="home-em-ok">No email needed</span>'
          : '<button type="button" class="home-em-skip" onclick="homeEmSkip(\'' + j.id + '\')">No email needed</button>';
        return '<div class="home-em-row' + (j.id === emailJobId ? ' home-em-cur' : '') + (j.id === next ? ' home-em-next' : '') + (_homeEmDone(j) ? ' home-em-did' : '') + '">'
          + '<button type="button" class="home-em-pick" onclick="homeEmPick(\'' + j.id + '\')"><b>' + escHtml(j.name || j.id) + '</b>'
          + '<small>' + escHtml(j.service + ' · ' + _jjbWhen(_needsEmailDate(j), today)) + (j.id === next ? ' · next' : '') + '</small></button>'
          + state + '</div>';
      }).join('');
}
async function homeEmPick(id){
  await openEmailModal(id);
  _homeEmPaint();
}
function homeEmSkip(id){
  markNoEmail(id);
  if(id === emailJobId){
    var next = _homeEmNext();
    if(next){ homeEmPick(next); return; }
  }
  _homeEmPaint();
}
function homeEmailsClose(closeScreen){
  _homeEm = null;
  document.body.classList.remove('home-em-on');
  if(closeScreen) closeM('email-modal');
  homeRefresh();
}

// ── Call tomorrow's pickups, one at a time ──
// A call that says the bin is ready marks the job's pickup confirmed — the same flag
// the Confirm buttons set — so it comes off everyone's list at once. "Not ready" opens
// the job to move the pickup; "No answer" just moves on.
function homeCallsOpen(stops){
  _homeCalls = stops.map(function(s){ return s.j.job_id; });
  _homeCallAt = 0;
  var o = document.getElementById('home-calls');
  if(!o){
    o = document.createElement('div');
    o.id = 'home-calls';
    o.className = 'modal-overlay';
    o.onclick = function(e){ if(e.target === o) closeM('home-calls'); };
    o.innerHTML = '<div class="modal home-calls"><div id="home-call-body"></div></div>';
    document.body.appendChild(o);
  }
  openM('home-calls');
  _homeCallPaint();
}
async function _homeCallPaint(){
  var body = document.getElementById('home-call-body');
  if(_homeCallAt >= _homeCalls.length){
    body.innerHTML = '<h3>That\'s the list</h3><p class="home-call-sub">Everyone you could reach is done. Any you skipped are still on the list.</p>'
      + '<div class="home-call-btns"><button type="button" class="home-ask-yes" onclick="closeM(\'home-calls\')">Close</button></div>';
    return;
  }
  var id = _homeCalls[_homeCallAt];
  var r = await db.from('jobs').select('job_id,name,phone,address,city,service,bin_bid,bin_size,bin_pickup,fb_date,confirmed').eq('job_id', id).single();
  if(r.error) throw new Error('Homepage: could not load job ' + id + ': ' + r.error.message);
  var j = r.data;
  // Someone else may have made this call since the list was drawn.
  if(j.confirmed){ _homeCallAt++; _homeCallPaint(); return; }
  var what = j.service === 'Bin Rental' ? 'Bin pickup' + (j.bin_size ? ' · ' + j.bin_size : '') + (j.bin_bid ? ' · bin ' + j.bin_bid : '') : j.service;
  body.innerHTML = '<div class="home-call-n">Call ' + (_homeCallAt + 1) + ' of ' + _homeCalls.length + '</div>'
    + (j.phone ? '<a class="home-call-phone" href="tel:' + escHtml(String(j.phone).replace(/[^0-9+]/g, '')) + '">' + escHtml(j.phone) + '</a>' : '<div class="home-call-phone home-bad">No phone number on this job</div>')
    + '<h3>' + escHtml(j.name || j.job_id) + '</h3>'
    + '<p class="home-call-sub">' + escHtml([what, [j.address, j.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ')) + '</p>'
    + '<p class="home-call-q">Is it ready to go tomorrow?</p>'
    + '<div class="home-call-btns">'
      + '<button type="button" class="home-ask-yes" onclick="homeCallReady(\'' + j.job_id + '\')">Ready</button>'
      + '<button type="button" class="home-ask-no" onclick="homeCallNotReady(\'' + j.job_id + '\')">Not ready</button>'
      + '<button type="button" class="home-ask-no" onclick="homeCallNext()">No answer</button>'
    + '</div>';
}
async function homeCallReady(id){
  var r = await patchJob(id, { confirmed:true });
  if(r.error) return;   // patchJob already said so
  var j = jobs.find(function(x){ return x.id === id; });
  if(j) j.confirmed = true;
  toast('✅ Pickup confirmed');
  homeCallNext();
  homeRefresh();
}
function homeCallNotReady(id){ closeM('home-calls'); openDetail(id); }
function homeCallNext(){ _homeCallAt++; _homeCallPaint(); }
