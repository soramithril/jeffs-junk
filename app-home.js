// ── THE NEW HOMEPAGE (v711, opt-in) ──────────────────────────────────────────
// Built for office staff who never go looking for pages: everything that needs doing
// comes to them as a big red button that opens the exact screen. Spec: the mockup at
// claude.ai/artifact/GoGxssR2TTXyXL6ePrxcqw (Jake, 2026-10-30).
//
// Off for everyone until they choose it. The choice is per person, kept on their
// user_profiles row (home_layout: null = never asked, 'new', 'old'), written through
// the set_home_layout() database function because people can't edit their own profile
// row directly (it carries their role).
//
// Mostly a RE-ARRANGEMENT of the dashboard, not a second copy of it. The bin photo
// cards (#dash-bin-by-size), Waiting on Customer Call and Entered Today are the real
// cards, moved into the new grid (their renderers find them by id wherever they sit)
// and moved back when the switch goes off. Everything else on the old dashboard is
// only hidden, so the old dashboard is exactly what it was the moment the switch is off.
// The one piece drawn here is Today's Jobs: Jake wanted the mockup's plain rows (v712),
// so the new layout lists the day itself and the old card keeps its buttons and chips.
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

var _homePref = null;     // this person's saved choice: null, 'new' or 'old'
var _homeOn = false;      // the new layout is on screen right now
var _homeReady = false;   // the dashboard's data (jobs, crew) has loaded since sign-in
var _homeMoved = [];      // [{node, mark}] cards moved into the new layout, and where they came from
var _homeBusy = false, _homeAgain = false, _homeTimer = null, _homeTruckTimer = null;
var _homeJobsDay = null;  // the day Today's Jobs is showing (null = today)
var _homeCalls = [];      // the pickup-call popup's list, one at a time
var _homeCallAt = 0;

function _homeName(){ return ((currentUser && currentUser.displayName) || '').trim().split(' ')[0]; }
function _homeS(n, one, many){ return n === 1 ? one : many; }
function _homeDay(dateStr){ return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long' }); }

// ── Sign-in: put this person's layout on, then maybe ask once ──
// loaded = the dashboard's data load. The question waits for it, so it lands on a
// finished dashboard, never on a half-drawn one.
async function homeSignedIn(loaded){
  var r = await db.from('user_profiles').select('home_layout').eq('id', currentUser.id).single();
  if(r.error) throw new Error('Homepage: could not read your layout setting: ' + r.error.message);
  _homePref = r.data.home_layout;
  _homeSwitchMount();
  if(_homePref === 'new') homeApply(true);
  // Never straight after an update. Every update ends in the forced "Update now" reload
  // and a fresh sign-in, so a sign-in on a version this person hasn't signed in on before
  // IS the one right after an update (or their first ever here) — skip the question that
  // time. The next sign-in on the same version is a normal one.
  var verKey = 'jjHomeVer:' + currentUser.displayName;
  var justUpdated = localStorage.getItem(verKey) !== APP_VERSION;
  localStorage.setItem(verKey, APP_VERSION);
  await loaded;
  _homeReady = true;
  homeRefresh();
  if(_homePref === null && !justUpdated && HOME_DESKTOP.matches) setTimeout(_homeAskWhenFree, 1500);
}

// Only on the dashboard, and never on top of anything: the morning brief, a booking,
// the tour. Waits for the screen to be free; walking off the dashboard drops the
// question until the next sign-in. The morning brief opens a moment AFTER the dashboard
// has drawn (it loads its own lists first), so until today's brief has been seen it
// counts as in the way even before it is on screen.
function _homeAskWhenFree(){
  var view = document.querySelector('.view.active');
  if(!view || view.id !== 'view-dashboard') return;
  var busy = document.querySelector('.modal-overlay.open') || document.getElementById('update-banner')
    || document.getElementById('tour-overlay').classList.contains('open')
    || localStorage.getItem(_jjbSeenKey()) !== todayStr();
  if(busy){ setTimeout(_homeAskWhenFree, 1500); return; }
  _homeAsk();
}

function _homeAsk(){
  var o = document.getElementById('home-ask');
  if(!o){
    o = document.createElement('div');
    o.id = 'home-ask';
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal home-ask" role="dialog" aria-modal="true" aria-labelledby="home-ask-h">'
      + '<h3 id="home-ask-h"></h3>'
      + '<p>We made a new layout for the homepage to make things easier. The things you need to do come to you, so you don\'t have to search for them.</p>'
      + '<p>You can switch back anytime. We\'ll show you where.</p>'
      + '<div class="home-ask-btns"><button type="button" class="home-ask-yes" onclick="homeAnswer(true)">Yes, try it</button>'
      + '<button type="button" class="home-ask-no" onclick="homeAnswer(false)">Not now</button></div></div>';
    document.body.appendChild(o);
  }
  o.querySelector('#home-ask-h').textContent = 'Hi ' + _homeName() + ', want to try something new?';
  openM('home-ask');
}

async function homeAnswer(yes){
  closeM('home-ask');
  await _homeSave(yes ? 'new' : 'old');
  homeApply(yes);
  // Either answer ends on the switch, so they know where it lives (the tour engine).
  playSequence([{ view:null, sel:'#home-switch',
    title: yes ? 'You\'re on the new layout' : 'No problem, ' + _homeName(),
    body: yes ? 'Want the old one back? Click this switch anytime. Your choice is remembered.'
              : 'If you want to try it later, it\'s this switch, right here. It stays where it is.' }], 0);
}

async function _homeSave(choice){
  var r = await db.rpc('set_home_layout', { choice: choice });
  if(r.error){
    toast('⚠ Couldn\'t save your layout choice: ' + r.error.message, 'error');
    throw new Error('set_home_layout failed: ' + r.error.message);
  }
  _homePref = choice;
}

// ── The switch: same top-right spot on both layouts ──
function _homeSwitchMount(){
  if(document.getElementById('home-switch')) return;
  var b = document.createElement('button');
  b.type = 'button';
  b.id = 'home-switch';
  b.className = 'home-switch';
  b.innerHTML = '<span class="home-sw-track"><span class="home-sw-knob"></span></span><span class="home-sw-txt"></span>';
  b.onclick = homeToggle;
  document.getElementById('view-dashboard').appendChild(b);
  _homeSwitchPaint();
}
function _homeSwitchPaint(){
  var b = document.getElementById('home-switch');
  b.setAttribute('aria-pressed', _homeOn ? 'true' : 'false');
  b.querySelector('.home-sw-txt').textContent = 'New layout: ' + (_homeOn ? 'on' : 'off');
}
async function homeToggle(){
  var on = !_homeOn;
  await _homeSave(on ? 'new' : 'old');
  homeApply(on);
}

// ── Putting the layout on and taking it off ──
function homeApply(on){
  on = on && HOME_DESKTOP.matches;
  if(on === _homeOn) return;
  var view = document.getElementById('view-dashboard');
  if(on){
    _homeBuild();
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
    document.body.classList.add('home-on');   // hides the corner quote reminder (see app-home.css)
    _homeOn = true;
    homeRefresh();
    _homeTrucks();
    clearInterval(_homeTruckTimer);
    _homeTruckTimer = setInterval(_homeTrucks, HOME_TRUCK_POLL_MS);
  } else {
    _homeMoved.forEach(function(m){ m.mark.parentNode.insertBefore(m.node, m.mark); m.mark.remove(); });
    _homeMoved = [];
    view.classList.remove('home-on');
    document.body.classList.remove('home-on');
    _homeOn = false;
    clearInterval(_homeTruckTimer);
  }
  _homeSwitchPaint();
}
// The width can cross the desktop line (a window dragged narrow): follow the setting.
HOME_DESKTOP.addEventListener('change', function(){ if(currentUser && _homePref) homeApply(_homePref === 'new'); });

function _homeBuild(){
  if(document.getElementById('home')) return;
  var h = document.createElement('div');
  h.id = 'home';
  h.innerHTML =
    '<div class="home-strip">'
      + '<div class="home-hello"><b id="home-hello"></b><span id="home-hello-sub"></span></div>'
      + '<button type="button" class="home-search" onclick="openPalette()">'
        + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.6" y2="16.6"/></svg>'
        + 'Find a customer: type a name, phone number or address</button>'
      + '<button type="button" class="home-btn home-btn-green" onclick="newJob()">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Job</button>'
      + '<button type="button" class="home-btn home-btn-ghost" onclick="go(\'drdcalc\')">Furniture Quote</button>'
    + '</div>'
    + '<div class="home-binrow"><div class="home-binrow-h"><span>Bins in the yard</span>'
      + '<span class="home-note">Same pictures as before, so you can show customers the sizes</span></div>'
      + '<div id="home-slot-bins"></div></div>'
    + '<div class="home-cols">'
      + '<div class="home-main">'
        + '<div id="home-jobs" class="home-card"></div>'
        + '<div id="home-overdue" class="home-card"></div>'
        + '<div class="home-folds">'
          + '<button type="button" class="home-fold" onclick="homeFold(\'willcall\')">Waiting on a call to pick up <span class="home-fold-c" id="home-fold-willcall">0 ›</span></button>'
          + '<button type="button" class="home-fold" onclick="homeFold(\'booked\')">Booked today <span class="home-fold-c" id="home-fold-booked">0 ›</span></button>'
        + '</div>'
        + '<div id="home-slot-willcall" class="home-folded" hidden></div>'
        + '<div id="home-slot-booked" class="home-folded" hidden></div>'
      + '</div>'
      + '<aside class="home-side">'
        + '<div class="home-panel home-yours"><div class="home-ph" id="home-list-title"></div><div id="home-todos"></div></div>'
        + '<div class="home-panel"><div class="home-ph">Trucks right now <span class="home-ph-note" id="home-trucks-at"></span></div><div id="home-trucks" class="home-trucks"></div></div>'
      + '</aside>'
    + '</div>';
  var view = document.getElementById('view-dashboard');
  view.insertBefore(h, view.firstChild);
  // Today's Jobs and the two folded cards redraw on every data change; the list and the
  // red words follow them. Debounced, because a realtime burst redraws several times.
  ['dash-today-jobs', 'dash-will-call-list', 'dash-today-bookings', 'dash-needs-you'].forEach(function(id){
    new MutationObserver(function(){
      if(!_homeOn) return;
      clearTimeout(_homeTimer);
      _homeTimer = setTimeout(homeRefresh, 1500);
    }).observe(document.getElementById(id), { childList:true, subtree:true });
  });
}

function homeFold(which){
  var el = document.getElementById('home-slot-' + which);
  el.hidden = !el.hidden;
}

// ── The list, the greeting and the overdue bins ──
async function homeRefresh(){
  if(!_homeOn || !_homeReady) return;
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

// Each person's buttons, built fresh from the data. Only what has something in it shows.
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
    add({ n: Object.keys(keys).length, t: 'Pick drivers for tomorrow', s: sub.join(' · '), go: 'Assign',
      fn: function(){ _dispatchDate = tomorrow; go('dispatch'); } });
  }
  function binNumbers(){
    // Today's drops still without a number, then any earlier ones that slipped by.
    var todayIds = d.todayStops.filter(function(s){ return s.leg === 'drop' && !s.j.bin_bid && !s.j.bin_live_load; })
      .map(function(s){ return { id: s.j.job_id, name: s.j.name, size: s.j.bin_size }; });
    var past = d.binNum.map(function(j){ return { id: j.id, name: j.name, size: j.binSize }; });
    var all = todayIds.concat(past);
    add({ n: all.length, t: all.length === 1 ? 'Give a bin number to a job' : 'Give bin numbers to ' + all.length + ' jobs',
      s: all.length ? (all[0].name || 'A job') + ' needs a ' + String(all[0].size || '').toLowerCase() + (todayIds.length ? ' today' : '') : '',
      go: 'Pick bin', fn: function(){ openAssignBinPicker(all[0].id); } });
  }
  function emails(){
    var em = d.emails;
    add({ n: em.length, t: 'Email ' + em.length + ' confirmation' + _homeS(em.length, '', 's'),
      s: em.length ? 'Soonest: ' + (em[0].name || '') + ', ' + _jjbWhen(_needsEmailDate(em[0]), d.today) : '',
      go: 'Email', fn: function(){ openEmailModal(em[0].id); } });
  }
  function quotes(){
    var q = d.quotes;
    add({ n: q.length, t: 'Call back ' + q.length + ' quote' + _homeS(q.length, '', 's'),
      s: 'Visited, no answer yet' + (q.length ? ': ' + (q[0].name || '') + (q.length > 1 ? ' and ' + (q.length - 1) + ' more' : '') : ''),
      go: 'Call', fn: function(){ go('junkquotes'); } });
  }
  function calls(){
    var c = d.calls;
    add({ n: c.length, t: 'Call tomorrow\'s ' + c.length + ' pickup' + _homeS(c.length, '', 's'),
      s: 'Check each one is ready to go', go: 'Call', fn: function(){ homeCallsOpen(c); } });
  }
  function binsBack(){
    var bt = d.backToday;
    add({ n: bt.length, t: 'Mark ' + bt.length + ' bin' + _homeS(bt.length, '', 's') + ' back in the yard',
      s: (bt.length ? 'Bin ' + (bt[0].j.bin_bid || '') + ', ' + (bt[0].j.name || '') + ' · ' : '') + 'picked up today, not marked back yet', go: 'Mark',
      fn: function(){ openDetail(bt[0].j.job_id); } });
  }
  function reviewAsks(){
    add({ n: reviews.length, t: reviews.length === 1 ? 'Ask a happy customer for a review' : 'Ask ' + reviews.length + ' happy customers for a review',
      s: reviews.length ? (reviews[0].name || '') + ' · finished ' + fd(reviews[0].done) : '',
      go: 'Ask', fn: function(){ openReviewText(reviews[0].id); } });
  }
  function photos(){
    add({ n: noPhotos.length, t: noPhotos.length === 1 ? 'Add photos to a quote' : 'Add photos to ' + noPhotos.length + ' quotes',
      s: noPhotos.length ? (noPhotos[0].name || '') + '\'s visit today has none yet' : '',
      go: 'Add', fn: function(){ openDetail(noPhotos[0].job_id); } });
  }

  if(who === 'rachel'){ emails(); binsBack(); calls(); }
  else if(who === 'barbara'){ quotes(); reviewAsks(); photos(); calls(); }
  else { drivers(); binNumbers(); emails(); quotes(); calls(); }
  return T;
}

var _homeGo = [];
function _homeTodosPaint(T){
  _homeGo = T.map(function(t){ return t.fn; });
  var name = _homeName();
  document.getElementById('home-list-title').textContent = T.length
    ? name + ', ' + T.length + ' thing' + _homeS(T.length, '', 's') + ' for you'
    : name + ', you\'re all caught up';
  document.getElementById('home-todos').innerHTML = T.length
    ? T.map(function(t, i){
        return '<button type="button" class="home-todo" onclick="homeGo(' + i + ')"><span class="home-todo-n">' + t.n + '</span>'
          + '<span class="home-todo-t"><b>' + escHtml(t.t) + '</b>' + (t.s ? '<small>' + escHtml(t.s) + '</small>' : '') + '</span>'
          + '<span class="home-todo-go">' + escHtml(t.go) + ' →</span></button>';
      }).join('')
    : '<div class="home-allclear">✓ Nothing waiting on you right now.</div>';
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

// ── Today's Jobs, the mockup's way ──
// Drop-offs and pickups side by side, then junk, quotes and furniture. Each row is
// one line of words: time, customer, town and bin, the size, and who is driving. What
// is missing is said in red ("No driver yet", "no bin number yet") and the row turns
// pink. Clicking a row opens the job, which has every button the old rows carried.
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

// One row: time, name, sub (html), size, who (html), flag.
function _homeJobRow(j, leg, kevinId){
  var flag = false, sub = [], who = '';
  if(j.city) sub.push(escHtml(j.city));
  if(j.service === 'Bin Rental'){
    if(j.bin_bid) sub.push('bin ' + escHtml(j.bin_bid));
    else if(leg === 'drop' && !j.bin_live_load){ sub.push('<span class="home-miss">no bin number yet</span>'); flag = true; }
    var drv = leg === 'drop' ? j.dropoff_crew_id : j.pickup_crew_id;
    var size = parseInt(j.bin_size, 10);
    if(leg === 'pick' && j.bin_instatus === 'pickedup') who = '<span class="home-drv home-ok">Back ✓</span>';
    else if(!drv){ who = '<span class="home-drv home-miss">No driver yet</span>'; flag = true; }
    else if(leg === 'pick' && (size === 4 || size === 7) && drv !== kevinId){
      who = '<span class="home-drv home-miss">' + escHtml(_homeCrewName(drv)) + ' · needs Kevin</span>'; flag = true;
    }
    else who = '<span class="home-drv">' + escHtml(_homeCrewName(drv)) + '</span>';
    return { time: _homeTime(leg === 'drop' ? j.bin_dropoff_time : j.bin_pickup_time), name: j.name, sub: sub.join(' · '), size: size || '', who: who, flag: flag, id: j.job_id };
  }
  var label = j.service === 'Junk Quote' ? 'Quote visit' : j.service === 'Extra Jobs' ? 'Extra job' : j.service;
  if(j.est_duration_min) sub.push(fmtDur(j.est_duration_min));
  var crew = j.assigned_crew_ids || [];
  if(!crew.length){ who = '<span class="home-drv home-miss">No crew yet</span>'; flag = true; }
  else who = '<span class="home-drv">' + escHtml(crew.map(_homeCrewName).join(', ')) + '</span>';
  var furn = j.service === 'Furniture Pickup' || j.service === 'Furniture Delivery';
  return { time: _homeTime(furn ? j.fb_time : j.junk_time), name: label + ' · ' + (j.name || ''), sub: sub.join(' · '), size: '', who: who, flag: flag, id: j.job_id };
}

// Timed stops first in time order, then "Any", then no time at all.
function _homeTimeKey(t){
  if(!t) return '99';
  if(t === 'Any') return '98';
  var p = t.split(':'), h = parseInt(p[0], 10);
  if(h < 6) h += 12;   // the AM/PM was dropped for the row; nobody books a bin before 6
  return (h < 10 ? '0' : '') + h + ':' + p[1];
}
function _homeRowsHtml(rows, empty){
  if(!rows.length) return empty ? '<div class="home-jempty">' + empty + '</div>' : '';
  rows.sort(function(a, b){ var x = _homeTimeKey(a.time), y = _homeTimeKey(b.time); return x < y ? -1 : x > y ? 1 : 0; });
  return rows.map(function(r){
    return '<button type="button" class="home-jrow' + (r.flag ? ' home-flag' : '') + '" onclick="openDetail(\'' + r.id + '\')">'
      + '<span class="home-jtm">' + escHtml(r.time) + '</span>'
      + '<span class="home-jmain"><span class="home-jnm">' + escHtml(r.name || r.id) + '</span><span class="home-jsub">' + r.sub + '</span></span>'
      + '<span class="home-jrt">' + (r.size ? '<span class="home-size">' + r.size + '</span>' : '') + r.who + '</span></button>';
  }).join('');
}

function _homeJobsPaint(day, d){
  var kevinId = _homeKevin().id;
  var drops = d.drops.map(function(j){ return _homeJobRow(j, 'drop', kevinId); });
  var picks = d.picks.map(function(j){ return _homeJobRow(j, 'pick', kevinId); });
  var other = d.other.map(function(j){ return _homeJobRow(j, 'other', kevinId); });
  var all = drops.concat(picks, other), need = all.filter(function(r){ return r.flag; }).length;
  var off = Math.round((new Date(day + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 86400000);
  var title = off === 0 ? 'Today\'s Jobs' : off === 1 ? 'Tomorrow\'s Jobs' : off === -1 ? 'Yesterday\'s Jobs'
    : new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  var half = Math.ceil(other.length / 2);
  var ready = all.length - need;
  document.getElementById('home-jobs').innerHTML =
    '<div class="home-jhead"><span class="home-jt">' + title + '</span><span class="home-jcnt">' + all.length + '</span>'
      + '<span class="home-daynav"><button type="button" onclick="homeJobsDay(-1)">‹ Back</button>'
      + '<button type="button"' + (off === 0 ? ' class="on"' : '') + ' onclick="homeJobsDay(0)">Today</button>'
      + '<button type="button" onclick="homeJobsDay(1)">Next ›</button></span></div>'
    + '<div class="home-sumline">' + (!all.length ? 'Nothing booked.' : need
        ? ready + ' ' + _homeS(ready, 'is', 'are') + ' ready. <b>' + need + ' still ' + _homeS(need, 'needs', 'need') + ' something</b>, shown in red below.'
        : 'All ' + all.length + ' are ready.') + '</div>'
    + '<div class="home-legs"><div class="home-leg"><div class="home-leg-h">Dropping off bins · ' + drops.length + '</div>' + _homeRowsHtml(drops, 'No drop-offs.') + '</div>'
      + '<div class="home-leg"><div class="home-leg-h">Picking up bins · ' + picks.length + '</div>' + _homeRowsHtml(picks, 'No pickups.') + '</div></div>'
    + (other.length ? '<div class="home-leg-h home-leg-top">Junk, quotes and furniture · ' + other.length + '</div>'
      + '<div class="home-legs"><div class="home-leg">' + _homeRowsHtml(other.slice(0, half), '') + '</div><div class="home-leg">' + _homeRowsHtml(other.slice(half), '') + '</div></div>' : '');
}

// ‹ Back / Today / Next ›: step a day, or come back to today.
async function homeJobsDay(step){
  var cur = _homeJobsDay || todayStr();
  _homeJobsDay = step === 0 ? null : _jjbPlus(cur, step);
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

// ── Trucks right now: the office TV's feed, as words ──
// Read-only, like every other Geotab reader. No driver names: who drives which truck is
// only known from the day's GPS stops (no fixed pairings), so the truck is named instead.
async function _homeTrucks(){
  if(!_homeOn || document.hidden) return;
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
  var now = Date.now();
  var rows = d.devices.slice().sort(function(a, b){ return a.name < b.name ? -1 : 1; }).map(function(t){
    var where, st, cls = '';
    if(!t.lastUpdate || now - new Date(t.lastUpdate).getTime() > HOME_TRUCK_STALE_MS){ where = 'not out today'; st = 'Parked'; cls = ' home-dim'; }
    else if(_homeKm(t.lat, t.lng, HOME_YARD.lat, HOME_YARD.lng) <= HOME_YARD_KM){ where = 'in the yard'; st = 'In the yard'; cls = ' home-dim'; }
    else { where = _homeTown(t.lat, t.lng); st = Math.round(t.speed || 0) > 0 ? 'Driving' : 'Stopped'; cls = st === 'Driving' ? ' home-go' : ''; }
    return '<div class="home-trk' + cls + '"><span class="home-trk-w">' + escHtml(t.name) + '</span><span class="home-trk-wh">' + escHtml(where) + '</span><span class="home-trk-st">' + st + '</span></div>';
  });
  el.innerHTML = rows.join('') || '<div class="home-row-sub">No trucks reporting.</div>';
  document.getElementById('home-trucks-at').textContent = new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
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
