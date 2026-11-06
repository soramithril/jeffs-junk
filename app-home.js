// ── THE NEW HOMEPAGE: option E (opt-in) ──────────────────────────────────────
// Built for office staff who never go looking for pages: everything that needs doing
// comes to them as a red button that opens the exact screen.
//
// v711 shipped one new layout and nobody kept it. On 2026-11-03 four more (A to D) went
// behind a picker in the dashboard's top-right corner; on 2026-11-05 Jake kept E and
// dropped A to D (nobody had kept one). The picker is now Old or E:
//   E  the Glassy dashboard mockup's home screen (claude.ai/artifact/9YVzWzLUhkCWt1XkFSeAQU),
//      and every page in its glass look and menus over this season's login picture
//      (Jake, 2026-11-05). Drawn by app-glass-home.js; the look and menus are
//      app-glass.css / app-glass.js. To drop it: its HOME_LAYOUTS, HOME_PICKS and
//      HOME_PIECE lines, the glassHomePaint call in homeRefresh, those three files.
// Jake will tell people about it himself, so nothing pops up to ask. Every pick is
// logged to page_views ('home-layout:<id>') so it's plain later who uses it.
//
// The choice is per person, on their user_profiles row (home_layout: null = never
// chosen, 'old' or 'e'; older saved picks ('new', 'a'..'d') read as Old), written through the
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
var HOME_DAY_FULL_MIN = 8 * 60;   // a junk day is full at 8 hours booked IN TOTAL, however many crews (Jake, 2026-11-03)
var HOME_ROWS_SHORT = 5, HOME_LIST_SHORT = 12;   // rows shown before "Show N more"


// Each layout: which pieces go where, how Today's Jobs is drawn, and where the map sits.
var HOME_LAYOUTS = {
  e: { top:['glass'], main:[], side:[], bottom:[] },
  // E's two other arrangements, only on Jake's switch for now (2026-11-06), from the
  // layouts mockup (claude.ai/artifact/6SqjTXXDVSmRVv11iQSnFc): the homepage's working
  // pieces in E's glass, with E's number cards, chart and activity underneath (gextra).
  e1: { top:['strip'], main:['yours', 'jobs'], side:['bins', 'week', 'overdue'], bottom:['gextra', 'folds'] },
  e2: { top:['strip'], main:['bins'], side:['week'], bottom:['jobs', 'yours', 'overdue', 'gextra', 'folds'] }
};
var HOME_EVIEWS = [
  { id:'e', label:'Mockup' }, { id:'e1', label:'Day first' }, { id:'e2', label:'Booking desk' }
];
var HOME_EVIEW_KEY = 'jjEView';   // Jake's pick, this browser only
function _homeIsE(lay){ return lay === 'e' || lay === 'e1' || lay === 'e2'; }
// Saved choice 'e' opens the arrangement Jake last picked on his switch; everyone else gets E.
function _homeOpen(pref){
  if(pref !== 'e' || !canAccessDev()) return pref;
  var v = localStorage.getItem(HOME_EVIEW_KEY);
  return HOME_LAYOUTS[v] ? v : 'e';
}
var HOME_PICKS = [
  { id:'old', label:'Old', tip:'The dashboard as it always was' },
  { id:'e', label:'E', tip:'The glass dashboard: the mockup, with the menus across the top' }
];
var HOME_PIECE = { strip:'home-p-strip', chips:'home-p-chips', bins:'home-p-bins', jobs:'home-jobs',
  overdue:'home-overdue', folds:'home-p-folds', yours:'home-p-yours', week:'home-p-week', glass:'home-p-glass', gextra:'home-p-gextra' };

var _homePref = null;     // this person's saved choice: null, 'old' or 'e'
var _homeLay = 'old';     // the layout on screen right now
var _homeReady = false;   // the dashboard's data (jobs, crew) has loaded since sign-in
var _homeMoved = [];      // [{node, mark}] cards moved into the new layout, and where they came from
var _homeBusy = false, _homeAgain = false, _homeTimer = null;
var _homeJobsDay = null;  // the day Today's Jobs is showing (null = today)
var _homeJobsData = null; // {day, d}: the last day list loaded, for redraws that need no new query
var _homeShowAll = {};    // lists opened past their first few rows
var _homeSeen = {}, _homeSeenDay = '';   // to-dos seen today, so a finished one turns green
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
  if(r.error){
    JJGlass.set(false);   // never leave the sign-in picture up waiting for an E that won't come
    throw new Error('Homepage: could not read your layout setting: ' + r.error.message);
  }
  _homePref = r.data.home_layout;
  _homeSwitchMount();
  var open = HOME_DESKTOP.matches && HOME_LAYOUTS[_homePref] ? _homeOpen(_homePref) : 'old';
  if(_homeIsE(open)) homeApply(open);
  else JJGlass.set(false);   // not E here: this computer gets the normal loading screen next time
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
    + (canAccessDev() ? '<span class="home-sw-seg home-ev" id="home-ev" role="group" aria-label="E layout">'
        + HOME_EVIEWS.map(function(v){ return '<button type="button" data-ev="' + v.id + '" onclick="homeEView(\'' + v.id + '\')">' + v.label + '</button>'; }).join('')
        + '</span>' : '')
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
  var base = _homeIsE(_homeLay) ? 'e' : _homeLay;
  w.querySelectorAll('[data-lay]').forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.lay === base ? 'true' : 'false'); });
  w.querySelector('.home-fb').hidden = _homeLay === 'old';
  var ev = document.getElementById('home-ev');
  if(ev){
    ev.hidden = base !== 'e';
    ev.querySelectorAll('[data-ev]').forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.ev === _homeLay ? 'true' : 'false'); });
  }
}
async function homePick(lay){
  if(lay === (_homeIsE(_homeLay) ? 'e' : _homeLay)) return;
  await _homeSave(lay);
  homeApply(_homeOpen(lay));
}
// Jake's switch between E's arrangements: shown only on his login, kept in this browser.
function homeEView(v){
  localStorage.setItem(HOME_EVIEW_KEY, v);
  homeApply(v);
}

// ── Putting a layout on, switching between them, taking them off ──
function homeApply(lay){
  if(!HOME_DESKTOP.matches) lay = 'old';
  if(lay === _homeLay) return;
  JJGlass.set(_homeIsE(lay));
  var was = _homeLay;
  var view = document.getElementById('view-dashboard');
  if(lay === 'old'){
    _homeMoved.forEach(function(m){ m.mark.parentNode.insertBefore(m.node, m.mark); m.mark.remove(); });
    _homeMoved = [];
    view.classList.remove('home-on');
    document.body.classList.remove('home-on');   // brings back the corner quote reminder (see app-home.css)
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
}
// The width can cross the desktop line (a window dragged narrow): follow the setting.
HOME_DESKTOP.addEventListener('change', function(){
  if(currentUser && _homePref) homeApply(HOME_LAYOUTS[_homePref] ? _homeOpen(_homePref) : 'old');
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
        + '<button type="button" class="btn btn-primary home-btn" onclick="newJob()">'
          + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Job</button>'
        + '<button type="button" class="btn btn-ghost home-btn" onclick="go(\'drdcalc\')">Furniture Quote</button>'
      + '</div>'
      + '<div id="home-p-chips" class="home-chips"></div>'
      + '<div id="home-p-bins" class="home-binrow"><div class="home-binrow-h"><span>Bins in the yard</span>'
        + '<span class="home-note">Same pictures as before, so you can show customers the sizes</span></div>'
        + '<div id="home-slot-bins"></div></div>'
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
      + '<div id="home-p-week" class="home-panel"><div class="home-ph">Junk hours this week <span class="home-ph-note">8 hours is a full day</span></div>'
        + '<div id="home-week" class="home-week"></div></div>'
      + '<div id="home-p-glass" class="jg-home"></div>'
      + '<div id="home-p-gextra" class="jg-home"></div>'
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
    var extra = await Promise.all([_jjbGather(), who === 'barbara' ? reviewFollowupsDue() : [], who === 'barbara' ? _homeQuotesNoPhotos() : [], _homeOverdue(), _homeJobsLoad(day), _homeWeekLoad()]);
    _homeGreet();
    _homeFoldCounts();
    _homeTodosPaint(_homeTodos(extra[0], who, extra[1], extra[2]));
    _homeOverduePaint(extra[3]);
    _homeJobsPaint(day, extra[4]);
    _homeWeekPaint(extra[5]);
    if(_homeIsE(_homeLay)) await glassHomePaint(extra[0], day === todayStr() ? extra[4] : await _homeJobsLoad(todayStr()));   // E is always today
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
// The original Today's Jobs colours and icons (app.js makeCat), one per kind of stop, so a
// row says what it is at a glance: the left stripe, the time, the tag and the heading carry
// it (Jake, 2026-11-04: the plain rows didn't show what each job was).
var HOME_KIND = {
  drop:                 { color:'#0891b2', label:'Drop-off', icon:'binDrop' },
  pick:                 { color:'#ec4899', label:'Pickup', icon:'binPickup' },
  'Junk Removal':       { color:'#eab308', label:'Junk removal', icon:'junk' },
  'Junk Quote':         { color:'#0d6efd', label:'Quote visit', icon:'junkQuote' },
  'Furniture Pickup':   { color:'#8b5cf6', label:'Furniture pickup', icon:'furniture' },
  'Furniture Delivery': { color:'#f97316', label:'Furniture delivery', icon:'furniture' },
  'Extra Jobs':         { color:'#65a30d', label:'Extra job', icon:'landscaping' }
};

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
// The driver or crew as the original's coloured initials badges (teamAvatar); clicking them
// opens the same Assign picker the old rows open. No one yet: the red words do the same.
function _homeCrewHtml(r, ids, none){
  var open = ' onclick="event.stopPropagation();openAssignCrewPicker(\'' + r.id + '\'' + (r.crewLeg ? ',\'' + r.crewLeg + '\'' : '') + ')"';
  if(!ids.length) return '<span class="home-drv home-miss home-assign" title="Assign someone"' + open + '>' + none + '</span>';
  return '<span class="home-avs" title="Change who\'s on it"' + open + '>' + ids.map(function(id){
    var c = crewMembers.find(function(m){ return m.id === id; }), nm = c ? c.name : '?';
    return teamAvatar(nm, crewAvatarColor(id), 26, nm);
  }).join('') + '</span>';
}
function _homeKindTag(k){
  return '<span class="home-kind" style="color:' + svcInk(k.color) + ';--kc:' + k.color + '">' + escHtml(k.label) + '</span>';
}

// One row's facts. sub = html pieces joined with " · "; who = html.
function _homeJobRow(j, leg, kevinId){
  var r = { id:j.job_id, leg:leg, city:j.city || '', flag:false, back:false, drv:null, size:'', sub:[], who:'', junk:false, hours:0,
    kind: HOME_KIND[j.service === 'Bin Rental' ? leg : j.service], crewLeg: j.service === 'Bin Rental' ? (leg === 'drop' ? 'dropoff' : 'pickup') : null };
  var cc = j.city ? _cityColor(j.city) : null;
  if(j.city) r.sub.push(cc ? '<span class="djj-city" style="background:' + cc.bg + ';color:' + cc.fg + '">' + escHtml(j.city) + '</span>' : escHtml(j.city));
  if(j.service === 'Bin Rental'){
    r.name = j.name;
    r.time = _homeTime(leg === 'drop' ? j.bin_dropoff_time : j.bin_pickup_time);
    if(j.bin_bid) r.sub.push('bin ' + escHtml(j.bin_bid));
    else if(leg === 'drop' && !j.bin_live_load){ r.sub.push('<span class="home-miss">no bin number yet</span>'); r.flag = true; }
    var drv = leg === 'drop' ? j.dropoff_crew_id : j.pickup_crew_id;
    var size = parseInt(j.bin_size, 10);
    r.drv = drv || null;
    r.size = size || '';
    var badges = _homeCrewHtml(r, drv ? [drv] : [], 'No driver yet');
    if(leg === 'pick' && j.bin_instatus === 'pickedup'){ r.who = badges + '<span class="home-drv home-ok">Back ✓</span>'; r.back = true; }
    else if(!drv){ r.who = badges; r.flag = true; }
    else if(leg === 'pick' && (size === 4 || size === 7) && drv !== kevinId){
      r.who = badges + '<span class="home-drv home-miss">needs Kevin</span>'; r.flag = true;
    }
    else r.who = badges;
    return r;
  }
  var furn = j.service === 'Furniture Pickup' || j.service === 'Furniture Delivery';
  r.name = j.name || '';
  r.time = _homeTime(furn ? j.fb_time : j.junk_time);
  r.junk = j.service === 'Junk Removal';
  r.hours = j.est_duration_min || 0;
  if(j.est_duration_min) r.sub.push(fmtDur(j.est_duration_min));
  else if(r.junk) r.sub.push('hours not set');
  var crew = j.assigned_crew_ids || [];
  r.who = _homeCrewHtml(r, crew, 'No crew yet');
  if(!crew.length) r.flag = true;
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
// tagged: show the kind tag (on every non-bin row, and on bins where no heading says it).
function _homeRowHtml(r, tagged){
  var tag = (tagged || r.leg === 'other') ? _homeKindTag(r.kind) : '';
  return '<button type="button" class="home-jrow' + (r.flag ? ' home-flag' : '') + '" style="--tjr-c:' + r.kind.color + '" onclick="openDetail(\'' + r.id + '\')">'
    + '<span class="home-jtm" style="color:' + svcInk(r.kind.color) + '">' + escHtml(r.time) + '</span>'
    + '<span class="home-jmain"><span class="home-jnm">' + escHtml(r.name || r.id) + '</span><span class="home-jsub">' + tag + r.sub.join(' · ') + '</span></span>'
    + '<span class="home-jrt">' + (r.size ? '<span class="home-size">' + r.size + '</span>' : '') + r.who + '</span></button>';
}
// A list of rows, cut to its first few with a "Show N more" (never for just one more).
function _homeListHtml(rows, key, short, empty, kindOf){
  if(!rows.length) return empty ? '<div class="home-jempty">' + empty + '</div>' : '';
  rows = _homeSortRows(rows);
  var all = _homeShowAll[key] || rows.length <= short + 1;
  return (all ? rows : rows.slice(0, short)).map(function(r){ return _homeRowHtml(r, !!kindOf); }).join('')
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
  var off = Math.round((new Date(day + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 86400000);
  var title = off === 0 ? 'Today\'s Jobs' : off === 1 ? 'Tomorrow\'s Jobs' : off === -1 ? 'Yesterday\'s Jobs'
    : new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  var body = _homeOneListHtml(all, other);
  document.getElementById('home-jobs').innerHTML =
    '<div class="home-jhead"><span class="home-jt">' + title + '</span><span class="home-jcnt">' + all.length + '</span>'
      + '<span class="home-daynav"><button type="button" onclick="homeJobsDay(-1)">‹ Back</button>'
      + '<button type="button"' + (off === 0 ? ' class="on"' : '') + ' onclick="homeJobsDay(0)">Today</button>'
      + '<button type="button" onclick="homeJobsDay(1)">Next ›</button></span></div>'
    + '<div class="home-sumline">' + (!all.length ? 'Nothing booked.' : need
        ? ready + ' ' + _homeS(ready, 'is', 'are') + ' ready. <b>' + need + ' still ' + _homeS(need, 'needs', 'need') + ' something</b>, shown in red below.'
        : 'All ' + all.length + ' are ready.') + '</div>'
    + body;
}

// Everything in one list, time order, each row saying what kind of stop it is.
function _homeOneListHtml(all, other){
  return '<div class="home-leg-h">Every stop · ' + all.length + _homeHoursHtml(other) + '</div>'
    + _homeListHtml(all, 'all', HOME_LIST_SHORT, 'Nothing booked.', true);
}

// ‹ Back / Today / Next ›: step a day, or come back to today.
async function homeJobsDay(step){
  var cur = _homeJobsDay || todayStr();
  _homeJobsDay = step === 0 ? null : _jjbPlus(cur, step);
  _homeShowAll = {};
  var day = _homeJobsDay || todayStr();
  _homeJobsPaint(day, await _homeJobsLoad(day));
}

// ── Junk hours this week, Monday to Friday (junk work never runs on weekends) ──
// The booking form's rule (app-busy-day.js): Junk Removal hours only, 8 in total is full.
function _homeWeekDays(){
  var t = new Date(todayStr() + 'T12:00:00'), dow = t.getDay();
  var mon = new Date(t);
  mon.setDate(t.getDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));   // a weekend shows the week ahead
  return [0, 1, 2, 3, 4].map(function(i){ var d = new Date(mon); d.setDate(mon.getDate() + i); return ymdLocal(d); });
}
async function _homeWeekLoad(){
  var days = _homeWeekDays(), a = days[0], z = days[4];
  var r = await db.from('jobs').select('junk_date,date,est_duration_min').eq('service', 'Junk Removal').neq('status', 'Cancelled')
    .or('and(junk_date.gte.' + a + ',junk_date.lte.' + z + '),and(junk_date.is.null,date.gte.' + a + ',date.lte.' + z + ')');
  if(r.error) throw new Error('Homepage: junk hours query failed: ' + r.error.message);
  return days.map(function(day){
    var js = r.data.filter(function(j){ return (j.junk_date || j.date) === day; });
    return { day:day, n:js.length, min: js.reduce(function(t, j){ return t + (j.est_duration_min || 0); }, 0),
      unset: js.filter(function(j){ return !j.est_duration_min; }).length };
  });
}
function _homeWeekPaint(week){
  var today = todayStr();
  document.getElementById('home-week').innerHTML = week.map(function(w){
    var full = w.min >= HOME_DAY_FULL_MIN;
    var tip = w.n + ' junk removal' + _homeS(w.n, '', 's') + (w.unset ? ', ' + w.unset + ' with no hours yet' : '');
    return '<div class="home-wd' + (full ? ' home-wd-full' : '') + (w.day === today ? ' home-wd-today' : '') + (w.day < today ? ' home-wd-past' : '') + '" title="' + escHtml(tip) + '">'
      + '<span class="home-wd-col"><i style="height:' + Math.min(100, Math.round(w.min / HOME_DAY_FULL_MIN * 100)) + '%"></i></span>'
      + '<b>' + (full ? 'Full' : (Math.round(w.min / 30) / 2) + ' h') + '</b>'
      + new Date(w.day + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short' }) + '</div>';
  }).join('');
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
