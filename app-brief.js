// ── MORNING BRIEF — the reminder list (v706) ─────────────────────────────────
// First dashboard visit of the day, per person, opens one pop-up:
//  - left:  the greeting (unchanged vibe engine in app.js) plus the day at a glance;
//  - right: a REMINDER LIST. Information only (Jake, 2026-10-23: "no action buttons
//    in the pop-up"). Each line says what needs doing and has ONE link to the screen
//    where it is normally done. A line ticks itself off when the job gets done, from
//    anywhere in the app — the list is rebuilt from the data, never from clicks here.
//
// Each person gets their own list (Jake, 2026-10-23):
//  - Rachel starts at 3 pm and "always forgets to email the confirmations": emails,
//    bins back from today's pickups, bin numbers, and calls for tomorrow's pickups.
//  - Barbara: quotes waiting on an answer, and crew who are off but on a job today.
//  - Everyone else (Kelly, Jake…): stops with no driver, bins stuck on cancelled or
//    undropped jobs, emails, bin numbers, quotes.
//
// "Done" is remembered per person per day in localStorage (jjBrief:<name>:<date>): the
// lines that had something in them today. A line whose jobs are all handled shows
// ticked; when every line is ticked the brief opens once more by itself to say
// ALL CLEAR. Before this, the brief asked one question at a time with Yes/No buttons
// (v473-v705); both bin questions are now answered on the job itself, which has
// Mark picked up / Mark Dropped buttons.

var _jjbWait = null;      // retry timer while a booking form is in the way
var _jjbTimer = null;     // auto-close, only when there is nothing on the list
var _jjbGo = {};          // line key -> what its link opens
var _jjbPrevOpen = null;  // keys open at the last paint (this page load), to spot fresh ticks

var JJB_LEG_COLS = 'job_id,name,city,service,status,date,bin_dropoff,bin_pickup,fb_date,junk_date,dropoff_crew_id,pickup_crew_id,assigned_crew_ids,bin_instatus,bin_bid,bin_size,confirmed,bin_will_call,bin_live_load';
var JJB_OTHER_SERVICES = ['Junk Removal', 'Furniture Pickup', 'Furniture Delivery'];

function _jjbName(){ return (currentUser && currentUser.displayName) ? currentUser.displayName : ''; }
function _jjbWho(){
  var first = _jjbName().trim().split(' ')[0].toLowerCase();
  if(first === 'rachel') return 'rachel';
  if(first === 'barbara' || first === 'barb') return 'barbara';
  return 'office';
}
function _jjbSeenKey(){ return 'jjBriefDay:' + _jjbName(); }
function _jjbStoreKey(){ return 'jjBrief:' + _jjbName() + ':' + todayStr(); }
function _jjbLoad(){
  var raw = localStorage.getItem(_jjbStoreKey());
  return raw ? JSON.parse(raw) : { order: [], lines: {}, clear: false };
}
function _jjbSave(st){ localStorage.setItem(_jjbStoreKey(), JSON.stringify(st)); }
function _jjbPlus(dateStr, n){ var d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + n); return ymdLocal(d); }
function _jjbOtherDate(j){
  return (j.service === 'Furniture Pickup' || j.service === 'Furniture Delivery') ? (j.fb_date || j.date) : (j.junk_date || j.date);
}
function _jjbS(n, one, many){ return n === 1 ? one : many; }

// Every stop on the given days: bin drops, bin pickups, and junk/furniture jobs.
// Shared with the "tomorrow fully dispatched" convoy below.
async function jjbStops(days){
  var list = days.join(',');
  var res = await Promise.all([
    db.from('jobs').select(JJB_LEG_COLS).eq('service', 'Bin Rental').in('bin_dropoff', days).neq('status', 'Cancelled'),
    db.from('jobs').select(JJB_LEG_COLS).eq('service', 'Bin Rental').in('bin_pickup', days).neq('status', 'Cancelled'),
    db.from('jobs').select(JJB_LEG_COLS).in('service', JJB_OTHER_SERVICES).neq('status', 'Cancelled')
      .or('date.in.(' + list + '),junk_date.in.(' + list + '),fb_date.in.(' + list + ')')
  ]);
  res.forEach(function(r){ if(r.error) throw new Error('Morning brief: day query failed: ' + r.error.message); });
  var stops = [];
  res[0].data.forEach(function(j){ stops.push({ leg: 'drop', day: j.bin_dropoff, j: j, driver: j.dropoff_crew_id }); });
  // A live load is one truck visit, shown on the drop side only.
  res[1].data.forEach(function(j){ if(!j.bin_live_load) stops.push({ leg: 'pick', day: j.bin_pickup, j: j, driver: j.pickup_crew_id }); });
  res[2].data.forEach(function(j){
    var d = _jjbOtherDate(j);
    if(days.indexOf(d) >= 0) stops.push({ leg: 'other', day: d, j: j, driver: (j.assigned_crew_ids || []).length ? 'crew' : null });
  });
  return stops;
}

async function _jjbGather(){
  var today = todayStr(), tomorrow = _jjbPlus(today, 1);
  var stopsP = jjbStops([today, tomorrow]);
  // Bins stranded by a cancelled job: cancelling hides a job from every list, so a bin
  // still marked dropped on one has nothing else chasing it (bin 20-07 sat seven weeks).
  var strandedP = db.from('jobs').select('job_id,name,address,city,bin_bid,bin_pickup')
    .eq('service', 'Bin Rental').eq('status', 'Cancelled').eq('bin_instatus', 'dropped')
    .not('bin_bid', 'is', null).neq('bin_bid', '');
  // A bin number put on ahead of the day, or a dropped job whose date moved: the day came
  // and nobody marked it out, so the bin still shows in the yard. Yesterday and back
  // (a bin due out this afternoon hasn't gone yet), thirty-day floor.
  var undroppedP = db.from('jobs').select('job_id,name,city,bin_bid,bin_dropoff,bin_instatus')
    .eq('service', 'Bin Rental').neq('status', 'Cancelled').not('bin_bid', 'is', null).neq('bin_bid', '')
    .lte('bin_dropoff', _jjbPlus(today, -1)).gte('bin_dropoff', _jjbPlus(today, -30));
  var overdueP = db.from('jobs').select('job_id,bin_bid')
    .eq('service', 'Bin Rental').eq('bin_instatus', 'dropped').neq('status', 'Cancelled').lt('bin_pickup', today);
  await _loadUnassignedBinAlertJobs(true);
  var res = await Promise.all([stopsP, strandedP, undroppedP, overdueP, qfDueQuotes()]);
  [res[1], res[2], res[3]].forEach(function(r){ if(r.error) throw new Error('Morning brief: bin query failed: ' + r.error.message); });

  var stops = res[0];
  var todayStops = stops.filter(function(s){ return s.day === today; });
  var tomorrowStops = stops.filter(function(s){ return s.day === tomorrow; });
  var awayIds = {}, awayNames = [];
  // Away = booked off all day (the same booking-off the driver picker warns about). A
  // part-day booking isn't "away".
  crewMembers.forEach(function(c){
    if(crewStatusForDate(c.id, today).state !== 'off') return;
    var why = (crewDayBlocks(c.id, today)[0] || {}).role;
    awayIds[c.id] = 1;
    awayNames.push(c.name + (why ? ' (' + why.toLowerCase() + ')' : ''));
  });
  return {
    today: today,
    todayStops: todayStops,
    tomorrowStops: tomorrowStops,
    noDriver: todayStops.filter(function(s){ return !s.driver && !(s.leg === 'pick' && s.j.bin_instatus === 'pickedup'); }),
    backToday: todayStops.filter(function(s){ return s.leg === 'pick' && s.j.bin_instatus === 'dropped'; }),
    calls: tomorrowStops.filter(function(s){
      return !s.j.confirmed && (s.leg === 'pick' || s.j.service === 'Furniture Pickup' || s.j.service === 'Furniture Delivery');
    }),
    crewClash: todayStops.filter(function(s){
      return s.leg === 'other' && (s.j.assigned_crew_ids || []).some(function(id){ return awayIds[id]; });
    }),
    awayNames: awayNames,
    stranded: res[1].data,
    undropped: res[2].data.filter(function(r){ return !r.bin_instatus; }),
    overdue: res[3].data,
    emails: needsEmailJobs().slice().sort(function(a, b){ return _needsEmailDate(a) < _needsEmailDate(b) ? -1 : 1; }),
    binNum: _getUnassignedBinJobs(),
    quotes: res[4],
    inShop: vehicles.filter(function(v){ return v.active !== false && vehInShop(v.vid); }).map(function(v){ return v.name; })
  };
}

function _jjbNames(list, nameOf, max){
  var names = list.slice(0, max).map(function(x){ return escHtml(nameOf(x) || ''); });
  return names.join(', ') + (list.length > max ? ' and ' + (list.length - max) + ' more' : '');
}
function _jjbWhen(dateStr, today){
  var n = Math.round((new Date(dateStr + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : fd(dateStr);
}

// The lines for this person, built fresh from the data every time. ids = what is still
// outstanding on that line; a line with no ids left is done.
function _jjbLines(d, who){
  var L = [], office = who === 'office', barb = who === 'barbara', rach = who === 'rachel';
  function line(o){ L.push(o); }
  if(office){
    var nd = d.noDriver;
    line({ key: 'nodriver', ic: 'dispatch', lvl: 'warn', ids: nd.map(function(s){ return s.leg + ':' + s.j.job_id; }),
      title: nd.length + ' of today\'s stops ' + _jjbS(nd.length, 'has', 'have') + ' no driver',
      sub: [['drop', 'drop'], ['pick', 'pickup'], ['other', 'junk/furniture']].map(function(p){
        var n = nd.filter(function(s){ return s.leg === p[0]; }).length;
        return n ? n + ' ' + p[1] + _jjbS(n, '', 's') : '';
      }).filter(Boolean).join(', '),
      link: 'Open Dispatch', go: function(){ go('dispatch'); } });
    d.stranded.forEach(function(j){
      line({ key: 'stranded:' + j.job_id, ic: 'binPickup', lvl: 'bad', ids: [j.job_id],
        title: 'Bin ' + escHtml(j.bin_bid) + ' is still marked out on a cancelled job',
        sub: escHtml([j.name, j.city].filter(Boolean).join(' · ')) + (j.bin_pickup ? ' · was due back ' + fd(j.bin_pickup) : ''),
        link: 'Open the job', go: function(){ openDetail(j.job_id); } });
    });
    d.undropped.forEach(function(j){
      line({ key: 'undropped:' + j.job_id, ic: 'binDrop', lvl: 'bad', ids: [j.job_id],
        title: 'Bin ' + escHtml(j.bin_bid) + ' was due out ' + fd(j.bin_dropoff) + ' but isn\'t marked dropped',
        sub: escHtml([j.name, j.city].filter(Boolean).join(' · ')) + ' · it still shows as in the yard',
        link: 'Open the job', go: function(){ openDetail(j.job_id); } });
    });
  }
  if(office || rach){
    var em = d.emails;
    line({ key: 'emails', ic: 'email', lvl: 'warn', ids: em.map(function(j){ return j.id; }),
      title: em.length + ' confirmation email' + _jjbS(em.length, ' needs', 's need') + ' to go out',
      sub: em.length ? _jjbNames(em, function(j){ return j.name; }, 2) + ' · soonest ' + _jjbWhen(_needsEmailDate(em[0]), d.today) : '',
      link: 'Open the list', go: function(){ jumpTo('dash-needs-you'); } });
  }
  if(rach){
    var bt = d.backToday;
    line({ key: 'backtoday', ic: 'binPickup', lvl: 'warn', ids: bt.map(function(s){ return s.j.job_id; }),
      title: bt.length + ' of today\'s pickups ' + _jjbS(bt.length, 'isn\'t', 'aren\'t') + ' marked back',
      sub: bt.length ? 'Bin' + _jjbS(bt.length, ' ', 's ') + _jjbNames(bt, function(s){ return s.j.bin_bid; }, 4) : '',
      link: 'Open today\'s jobs', go: function(){ jumpTo('card-today-jobs'); } });
  }
  if(office || rach){
    var bn = d.binNum;
    line({ key: 'binnum', ic: 'binDrop', lvl: 'warn', ids: bn.map(function(j){ return j.id; }),
      title: bn.length + ' bin' + _jjbS(bn.length, ' needs its', 's need their') + ' number',
      sub: bn.length ? _jjbNames(bn, function(j){ return j.name; }, 2) + ' · dropped ' + fd(bn[0].binDropoff) : '',
      link: bn.length > 1 ? 'Open the first one' : 'Pick the bin',
      go: function(){ if(bn.length) openAssignBinPicker(bn[0].id); } });
  }
  if(office || barb){
    var q = d.quotes;
    line({ key: 'quotes', ic: 'junkQuote', lvl: 'warn', ids: q.map(function(x){ return x.job_id; }),
      title: q.length + ' quote' + _jjbS(q.length, '', 's') + ' waiting on an answer',
      sub: q.length ? _jjbNames(q, function(x){ return x.name; }, 2) : '',
      link: 'Open Junk Quotes', go: function(){ go('junkquotes'); } });
  }
  if(barb){
    var cc = d.crewClash;
    line({ key: 'crewclash', ic: 'off', lvl: 'info', ids: cc.map(function(s){ return s.j.job_id; }),
      title: cc.length + ' of today\'s jobs ' + _jjbS(cc.length, 'has', 'have') + ' someone on the crew who is off',
      sub: escHtml(d.awayNames.join(', ')),
      link: 'Open today\'s jobs', go: function(){ jumpTo('card-today-jobs'); } });
  }
  if(rach){
    var c = d.calls;
    line({ key: 'calls', ic: 'call', lvl: 'info', ids: c.map(function(s){ return s.j.job_id; }),
      title: c.length + ' of tomorrow\'s pickups ' + _jjbS(c.length, 'isn\'t', 'aren\'t') + ' confirmed yet',
      sub: c.length ? 'Is the bin ready to go? ' + _jjbNames(c, function(s){ return s.j.name; }, 2) : '',
      link: 'Open bins out', go: function(){ jumpTo('sec-binsout'); } });
  }
  return L;
}

// Merges today's lines into the remembered list. Returns rows to paint, in a stable order.
function _jjbMerge(lines, st){
  var cur = {};
  lines.forEach(function(l){
    cur[l.key] = l;
    _jjbGo[l.key] = l.go;
    if(!l.ids.length) return;
    var s = st.lines[l.key];
    if(!s){ s = st.lines[l.key] = { ids: [] }; st.order.push(l.key); }
    l.ids.forEach(function(id){ if(s.ids.indexOf(id) < 0) s.ids.push(id); });
    s.title = l.title; s.sub = l.sub; s.ic = l.ic; s.lvl = l.lvl; s.link = l.link;   // last words with something in it
  });
  return st.order.map(function(key){
    var s = st.lines[key], l = cur[key];
    return { key: key, open: !!(l && l.ids.length), title: s.title, sub: s.sub, ic: s.ic, lvl: s.lvl, link: s.link };
  });
}

function _jjbTodayHtml(d, who){
  var counts, rows = [];
  var tomorrowPicks = d.tomorrowStops.filter(function(s){ return s.leg === 'pick'; }).length;
  if(who === 'rachel'){
    counts = [[d.emails.length, 'Emails to send'], [d.backToday.length, 'Bins to check in'], [d.calls.length, 'Calls to make']];
  } else {
    counts = [
      [d.todayStops.filter(function(s){ return s.leg === 'drop'; }).length, 'Drops'],
      [d.todayStops.filter(function(s){ return s.leg === 'pick'; }).length, 'Pickups'],
      [d.todayStops.filter(function(s){ return s.leg === 'other'; }).length, 'Junk & furniture']];
    if(d.noDriver.length) rows.push(['warn', '<strong>' + d.noDriver.length + ' stop' + _jjbS(d.noDriver.length, '', 's') + '</strong> ' + _jjbS(d.noDriver.length, 'has', 'have') + ' no driver yet', 'Dispatch']);
    if(who === 'office' && d.emails.length) rows.push(['warn', '<strong>' + d.emails.length + ' email' + _jjbS(d.emails.length, '', 's') + '</strong> need' + _jjbS(d.emails.length, 's', '') + ' to be sent', 'confirmations']);
    if(d.overdue.length) rows.push(['bad', '<strong>' + d.overdue.length + ' bin' + _jjbS(d.overdue.length, '', 's') + '</strong> past ' + _jjbS(d.overdue.length, 'its', 'their') + ' pickup day',
      escHtml(d.overdue.slice(0, 2).map(function(r){ return r.bin_bid; }).filter(Boolean).join(', '))]);
    if(d.inShop.length) rows.push(['warn', '<strong>' + escHtml(d.inShop.join(', ')) + '</strong> ' + _jjbS(d.inShop.length, 'is', 'are') + ' in the shop', '']);
    if(d.awayNames.length) rows.push(['info', '<strong>Away:</strong> ' + escHtml(d.awayNames.join(', ')), '']);
  }
  rows.push(['ok', '<strong>Tomorrow:</strong> ' + d.tomorrowStops.length + ' stop' + _jjbS(d.tomorrowStops.length, '', 's')
    + (tomorrowPicks ? ', ' + tomorrowPicks + ' of them pickup' + _jjbS(tomorrowPicks, '', 's') : ''), '']);
  return '<div class="jjb-counts">' + counts.map(function(c){ return '<div class="jjb-count"><b>' + c[0] + '</b><span>' + c[1] + '</span></div>'; }).join('') + '</div>'
    + '<ul class="jjb-rows">' + rows.map(function(r){ return '<li><span class="jjb-dot jjb-' + r[0] + '"></span><span>' + r[1] + '</span><em>' + r[2] + '</em></li>'; }).join('') + '</ul>';
}

var JJB_TRUCK = '<svg viewBox="0 0 46 28" width="46" height="28" aria-hidden="true"><rect x="1" y="7" width="27" height="14" rx="2" fill="currentColor" opacity=".85"/><path d="M28 11h8l6 6v4H28z" fill="currentColor"/><rect x="31" y="12.5" width="5" height="4" rx="1" fill="#fff"/><circle cx="9" cy="23" r="4" fill="#1a211e"/><circle cx="35" cy="23" r="4" fill="#1a211e"/></svg>';

function _jjbListHtml(rows){
  var n = rows.length, done = rows.filter(function(r){ return !r.open; }).length;
  var pct = n ? done / n : 1;
  var road = '<div class="jjb-road' + (n && done >= n ? ' arrived' : '') + '" aria-hidden="true"><span class="jjb-truck" style="left:calc(23px + (100% - 90px) * ' + pct + ')">' + JJB_TRUCK + '</span><span class="jjb-yard">YARD</span></div>';
  if(!n){
    return '<div class="jjb-empty"><b>Nothing waiting ✓</b><span>Nothing needs you here right now. Have a good one.</span></div>';
  }
  if(done >= n){
    return road + '<div class="jjb-clear"><b>All clear, ' + escHtml(_jjbName().split(' ')[0]) + '</b>'
      + '<span>' + n + ' thing' + _jjbS(n, '', 's') + ' done today.</span></div>'
      + '<div class="jjb-allclear">ALL CLEAR</div>';
  }
  var prev = _jjbPrevOpen || {};
  return road + '<div class="jjb-left">' + (n - done) + ' of ' + n + ' left</div>'
    + '<ul class="jjb-list">' + rows.map(function(r){
      var just = !r.open && prev[r.key];
      return '<li class="jjb-line jjb-' + r.lvl + (r.open ? '' : ' is-done') + (just ? ' just' : '') + '">'
        + '<span class="jjb-ico jjb-ic-' + r.ic + '">' + lineIcon(r.ic, 20) + (r.open ? '' : '<i class="jjb-badge">✓</i>') + '</span>'
        + '<span class="jjb-txt"><span class="jjb-title">' + r.title + '</span>' + (r.sub ? '<span class="jjb-sub">' + r.sub + '</span>' : '') + '</span>'
        + (r.open
            ? '<button type="button" class="jjb-go" onclick="jjbFollow(\'' + r.key + '\')">' + escHtml(r.link) + ' ›</button>'
            : '<span class="jjb-done">DONE</span>')
        + '</li>';
    }).join('') + '</ul>';
}

function _jjbPaint(d, rows){
  var greet = document.getElementById('mb-greet');
  var today = document.getElementById('mb-today');
  if(!today){
    today = document.createElement('div');
    today.id = 'mb-today';
    greet.insertBefore(today, document.getElementById('dash-brief-link'));
  }
  today.innerHTML = _jjbTodayHtml(d, _jjbWho());
  document.getElementById('mb-body').innerHTML = '<div class="jjb-wrap">' + _jjbListHtml(rows) + '</div>';
  var open = {};
  rows.forEach(function(r){ if(r.open) open[r.key] = 1; });
  _jjbPrevOpen = open;
  _jjbLinkPaint(rows);
}

// The small link under the greeting says how many are left, so the list is never lost.
function _jjbLinkPaint(rows){
  var el = document.getElementById('dash-brief-link');
  if(!el) return;
  el.style.display = '';
  var left = rows.filter(function(r){ return r.open; }).length;
  var btn = el.querySelector('button');
  if(btn) btn.textContent = '↻ Morning brief' + (left ? ' · ' + left + ' left' : ' · all clear');
}

function _jjbBlocked(){
  var view = document.querySelector('.view.active');
  if(!view || view.id !== 'view-dashboard') return 'away';
  // Never on top of the booking form — Jake: "sometimes they need to book asap".
  if(document.getElementById('job-modal').classList.contains('open')) return 'busy';
  return '';
}

async function maybeShowMorningBrief(force){
  if(!currentUser) return;
  var b = _jjbBlocked();
  if(b === 'away') return;
  if(b === 'busy'){
    clearTimeout(_jjbWait);
    _jjbWait = setTimeout(function(){ maybeShowMorningBrief(force); }, 4000);
    return;
  }
  var st = _jjbLoad();
  var seen = localStorage.getItem(_jjbSeenKey()) === todayStr();
  // Already seen today: only look again if something on the list is still open, and only
  // open the pop-up again for the moment it all comes clear.
  if(seen && !force && (st.clear || !st.order.length)) return;
  var d = await _jjbGather();
  var rows = _jjbMerge(_jjbLines(d, _jjbWho()), st);
  var allDone = rows.length && rows.every(function(r){ return !r.open; });
  if(allDone && !st.clear){ st.clear = true; force = true; }
  _jjbSave(st);
  if(seen && !force){ _jjbLinkPaint(rows); return; }
  if(_jjbBlocked()) return;                 // walked off or started a booking while the data loaded
  _jjbPaint(d, rows);
  document.getElementById('morning-brief-modal').classList.add('open');
  jjApplyVibe();                            // paints today's vibe and replays the greeting entrance
  clearTimeout(_jjbTimer);
  if(!rows.length) _jjbTimer = setTimeout(closeBrief, 10000);
}

function reopenMorningBrief(){ maybeShowMorningBrief(true); }

// A link: close the brief (the day counts as read) and open the screen where the job is done.
function jjbFollow(key){
  var fn = _jjbGo[key];
  if(!fn) throw new Error('Morning brief: no link for ' + key);
  closeBrief(true);
  fn();
}

// Every way out of the brief comes through here: the ✕, the backdrop, Got it, Escape,
// the timer, and a link. instant skips the 420ms farewell (in front of another screen
// it reads as lag).
function closeBrief(instant){
  var overlay = document.getElementById('morning-brief-modal');
  if(!overlay.classList.contains('open')) return;
  localStorage.setItem(_jjbSeenKey(), todayStr());
  clearTimeout(_jjbTimer);
  if(instant === true){ closeM('morning-brief-modal'); return; }
  var card = document.getElementById('mb-card');
  card.style.animation = 'jjCardOut .42s cubic-bezier(.55,0,.85,.3) both';
  setTimeout(function(){
    card.style.animation = '';
    closeM('morning-brief-modal');
  }, 420);
}

// ── Tomorrow fully dispatched ──
// Called right after someone gives a stop a driver. When that leaves no stop tomorrow
// without one, the convoy rolls across the screen once (per browser, per day). Checked
// against the database, not this tab's copy, so it can't fire early.
async function jjbCelebrateIfTomorrowDispatched(){
  if(!window.JJFun) return;
  var tomorrow = _jjbPlus(todayStr(), 1);
  if(localStorage.getItem('jjConvoy') === tomorrow) return;
  var stops = await jjbStops([tomorrow]);
  if(!stops.length || stops.some(function(s){ return !s.driver; })) return;
  localStorage.setItem('jjConvoy', tomorrow);
  var drivers = {};
  stops.forEach(function(s){
    var ids = s.leg === 'other' ? (s.j.assigned_crew_ids || []) : [s.driver];
    ids.forEach(function(id){ drivers[id] = 1; });
  });
  var ids = Object.keys(drivers);
  JJFun.convoy('Tomorrow\'s all set · ' + stops.length + ' stop' + _jjbS(stops.length, '', 's') + ' · ' + ids.length + ' driver' + _jjbS(ids.length, '', 's'),
    ids.slice(0, 6).map(function(id){ return crewAvatarColor(id); }));
}
