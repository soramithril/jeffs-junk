/* ── HOMEPAGE OPTION E: THE MOCKUP'S HOME SCREEN ──────────────────────────────
   Jake, 2026-11-05: "make it look exactly like the mockup" (the Glassy dashboard
   mockup, claude.ai/artifact/9YVzWzLUhkCWt1XkFSeAQU), with the real numbers.

   E is one of app-home.js's layouts with a single piece, #home-p-glass, drawn here
   on every homeRefresh(). The look is app-glass.css; the menus and the picture
   behind are app-glass.js.

   Every number is counted from the jobs table the way the rest of the dashboard
   counts it:
   - a "job" on a day is one stop: a bin drop-off, a bin pickup, or a junk / quote /
     furniture / extra job (the same rules as Today's Jobs, _homeJobsLoad);
   - bins out is checkBinWindow, the counter the dashboard and the booking form use;
   - junk hours are Junk Removal est_duration_min, 8 hours a full day;
   - quotes to chase is the morning brief's list (_jjbGather). */

var GH_DAY_FULL_MIN = HOME_DAY_FULL_MIN;
var GH_SIZES = ['4 yard', '7 yard', '14 yard', '20 yard'];
var GH_FIELD = { bin_dropoff:'drop-off date', bin_pickup:'pickup date', bin_bid:'bin number', bin_size:'bin size',
  bin_instatus:'bin status', status:'status', dropoff_crew_id:'drop-off driver', pickup_crew_id:'pickup driver',
  assigned_crew_ids:'crew', junk_date:'junk date', junk_time:'time', bin_dropoff_time:'drop-off time',
  bin_pickup_time:'pickup time', fb_date:'furniture date', est_duration_min:'hours', notes:'notes', date:'date' };
var _ghMode = 'week';    // what the chart shows: 'day' | 'week' | 'month'
var _ghLast = null;      // the last load, so the Day/Week/Month switch redraws without a query
var _ghShown = false;    // the cards rise in once per visit, not on every refresh

function _ghWeekday(s){ return new Date(s + 'T12:00:00').getDay(); }
function _ghLabel(s, o){ return new Date(s + 'T12:00:00').toLocaleDateString('en-US', o); }
function _ghMonday(s){ return _jjbPlus(s, -((_ghWeekday(s) + 6) % 7)); }
function _ghMonthEnd(s){ var d = new Date(s + 'T12:00:00'); d = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12); return d.toISOString().slice(0, 10); }
function _ghPct(a, b){ return b ? Math.round((a - b) / b * 100) : null; }

// One load covers everything the screen counts: last week to the end of this month.
async function _ghLoad(today){
  var mon = _ghMonday(today), first = today.slice(0, 8) + '01';
  var a = [_jjbPlus(mon, -7), _jjbPlus(today, -7), first].sort()[0];
  var z = [_jjbPlus(mon, 5), _ghMonthEnd(today), _jjbPlus(today, 4)].sort().pop();
  var res = await Promise.all([
    db.from('jobs').select(HOME_JOB_COLS).eq('service', 'Bin Rental').neq('status', 'Cancelled')
      .or('and(bin_dropoff.gte.' + a + ',bin_dropoff.lte.' + z + '),and(bin_dropoff.is.null,date.gte.' + a + ',date.lte.' + z + '),and(bin_pickup.gte.' + a + ',bin_pickup.lte.' + z + ')'),
    db.from('jobs').select(HOME_JOB_COLS).in('service', HOME_OTHER).neq('status', 'Cancelled')
      .or('and(junk_date.gte.' + a + ',junk_date.lte.' + z + '),and(fb_date.gte.' + a + ',fb_date.lte.' + z + '),and(date.gte.' + a + ',date.lte.' + z + ')'),
    db.from('job_changes').select('job_id,field_name,changed_at,changed_by').order('changed_at', { ascending:false }).limit(60)
  ]);
  res.forEach(function(r){ if(r.error) throw new Error('E homepage: query failed: ' + r.error.message); });
  // The database hands back at most 1000 rows; past that every count here would be short.
  if(res[0].data.length >= 1000 || res[1].data.length >= 1000) throw new Error('E homepage: over 1000 jobs in the range, counts would be short');
  var acts = _ghActGroups(res[2].data);
  var ids = acts.map(function(g){ return g.job; });
  var names = {};
  if(ids.length){
    var n = await db.from('jobs').select('job_id,name').in('job_id', ids);
    if(n.error) throw new Error('E homepage: job names query failed: ' + n.error.message);
    n.data.forEach(function(j){ names[j.job_id] = j.name; });
  }
  return { bins: res[0].data, other: res[1].data, acts: acts, names: names };
}

// What happened on one day: its stops, junk minutes and quote visits.
function _ghDay(L, day){
  var o = { stops:0, junkMin:0, quotes:0 };
  L.bins.forEach(function(j){
    if((j.bin_dropoff || j.date) === day && !(!j.bin_dropoff && j.bin_pickup === day)) o.stops++;
    if(j.bin_pickup === day && !(j.bin_live_load && j.bin_dropoff === day)) o.stops++;
  });
  L.other.forEach(function(j){
    var furn = j.service === 'Furniture Pickup' || j.service === 'Furniture Delivery';
    if((furn ? (j.fb_date || j.date) : (j.junk_date || j.date)) !== day) return;
    if(j.service === 'Extra Jobs' && j.completed) return;
    o.stops++;
    if(j.service === 'Junk Removal') o.junkMin += j.est_duration_min || 0;
    if(j.service === 'Junk Quote') o.quotes++;
  });
  return o;
}
function _ghBinsOut(day){
  return GH_SIZES.reduce(function(t, s){ return t + checkBinWindow(s, day, day, null).committed; }, 0);
}

// The change log, one line per person per job per minute.
function _ghActGroups(rows){
  var out = [], seen = {};
  rows.forEach(function(c){
    var key = c.job_id + '|' + (c.changed_by || '') + '|' + (c.changed_at || '').slice(0, 16);
    if(!seen[key]){ if(out.length === 4) return; seen[key] = { job:c.job_id, by:c.changed_by || 'Someone', at:c.changed_at, fields:[] }; out.push(seen[key]); }
    var f = GH_FIELD[c.field_name] || String(c.field_name || '').replace(/_/g, ' ');
    if(seen[key].fields.indexOf(f) < 0) seen[key].fields.push(f);
  });
  return out;
}
function _ghAgo(iso){
  var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if(m < 1) return 'now';
  if(m < 60) return m + ' min';
  var h = Math.round(m / 60);
  return h < 24 ? h + ' h' : Math.round(h / 24) + ' d';
}
function _ghInitials(name){
  return String(name).trim().split(/\s+/).slice(0, 2).map(function(w){ return w[0] || ''; }).join('').toUpperCase();
}

// ── drawing ──
function _ghSpark(vals, colour){
  var w = 88, h = 34, mn = Math.min.apply(0, vals), mx = Math.max.apply(0, vals);
  var d = vals.map(function(v, i){ return (i ? 'L' : 'M') + (i * w / (vals.length - 1)).toFixed(1) + ' ' + (h - 4 - (v - mn) / ((mx - mn) || 1) * (h - 8)).toFixed(1); }).join(' ');
  return '<svg class="jg-spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + colour + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
var GH_ICO = {
  jobs:'<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  bins:'<path d="M3 8h18l-2 12H5z"/><path d="M7 8V5h10v3"/>',
  hours:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  quotes:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  arrow:'<path d="M7 17L17 7M8 7h9v9"/>', plus:'<path d="M12 5v14M5 12h14"/>'
};
function _ghSvg(k, sw){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + GH_ICO[k] + '</svg>'; }
function _ghStat(i, ico, label, val, chip, chipKind, spark, go){
  return '<button type="button" class="jg-card jg-stat" style="--i:' + i + '" onclick="' + go + '">'
    + '<span class="jg-row"><span class="jg-ico">' + _ghSvg(ico) + '</span><span class="jg-arrow">' + _ghSvg('arrow') + '</span></span>'
    + '<span class="jg-lab">' + label + '</span>'
    + '<span class="jg-bot"><span><span class="jg-val">' + val + '</span><span class="jg-chip jg-' + chipKind + '">' + escHtml(chip) + '</span></span>' + spark + '</span></button>';
}
function _ghHours(min){ return (Math.round(min / 30) / 2) + 'h'; }

// The chart's bars for the Day / Week / Month switch.
function _ghBars(L, today, rows){
  if(_ghMode === 'day'){
    var hrs = [], b = {};
    for(var h = 7; h <= 17; h++) hrs.push(h);
    rows.forEach(function(r){ var k = _homeTimeKey(r.time), hr = parseInt(k, 10); b[hr >= 7 && hr <= 17 ? hr : 'any'] = (b[hr >= 7 && hr <= 17 ? hr : 'any'] || 0) + 1; });
    var now = new Date().getHours();
    var bars = hrs.map(function(hh){ return { lab: (hh > 12 ? hh - 12 : hh) + (hh < 12 ? 'am' : 'pm'), n: b[hh] || 0, on: hh === now }; });
    if(b.any) bars.push({ lab:'Any time', n:b.any, on:false });
    return { title:'Jobs today by the hour', sub:'When today\'s stops are booked', chip: rows.length + ' job' + _homeS(rows.length, '', 's') + ' today', up:true, bars:bars };
  }
  if(_ghMode === 'month'){
    var first = today.slice(0, 8) + '01', last = _ghMonthEnd(today), wk = [], d = _ghMonday(first);
    while(d <= last){
      var n = 0;
      for(var i = 0; i < 7; i++){ var x = _jjbPlus(d, i); if(x >= first && x <= last) n += _ghDay(L, x).stops; }
      wk.push({ lab: 'Wk of ' + _ghLabel(d < first ? first : d, { month:'short', day:'numeric' }), n:n, on: today >= d && today <= _jjbPlus(d, 6) });
      d = _jjbPlus(d, 7);
    }
    var tot = wk.reduce(function(t, w){ return t + w.n; }, 0);
    return { title:'Jobs this month', sub:'Each week, Monday to Sunday', chip: tot + ' booked this month', up:true, bars:wk };
  }
  var mon = _ghMonday(today), days = [], so = 0, last7 = 0;
  for(var k = 0; k < 6; k++){
    var day = _jjbPlus(mon, k), n2 = _ghDay(L, day).stops;
    days.push({ lab: day === today ? 'Today' : _ghLabel(day, { weekday:'short' }), n:n2, on: day === today });
    if(day <= today){ so += n2; last7 += _ghDay(L, _jjbPlus(day, -7)).stops; }
  }
  var p = _ghPct(so, last7);
  return { title:'Jobs this week', sub:'Bins, junk and furniture together', up: p === null || p >= 0,
    chip: p === null ? 'Nothing last week to compare' : (p >= 0 ? '+' : '') + p + '% on last week so far', bars:days };
}
function _ghChartHtml(c){
  var top = Math.max(4, Math.max.apply(0, c.bars.map(function(b){ return b.n; })));
  return '<div class="jg-ttl"><div><h3>' + c.title + '</h3><p>' + c.sub + '</p></div><span class="jg-chip ' + (c.up ? 'jg-up' : 'jg-flat') + '">' + escHtml(c.chip) + '</span></div>'
    + '<div class="jg-chart"><i class="jg-gl" style="bottom:25%"></i><i class="jg-gl" style="bottom:50%"></i><i class="jg-gl" style="bottom:75%"></i>'
    + c.bars.map(function(b, i){
        return '<div class="jg-bar' + (b.on ? ' jg-today' : '') + '" title="' + b.n + ' job' + _homeS(b.n, '', 's') + '"><b>' + b.n + '</b><i style="height:' + (b.n / top * 100) + '%;animation-delay:' + (i * 60) + 'ms"></i></div>';
      }).join('') + '</div>'
    + '<div class="jg-days">' + c.bars.map(function(b){ return '<span>' + escHtml(b.lab) + '</span>'; }).join('') + '</div>';
}
function ghMode(m){
  _ghMode = m;
  document.querySelectorAll('#jg-seg [data-m]').forEach(function(s){ s.classList.toggle('on', s.dataset.m === m); });
  document.getElementById('jg-chartcard').innerHTML = _ghChartHtml(_ghBars(_ghLast.L, _ghLast.today, _ghLast.rows));
}

// The whole screen. gather = the morning brief's lists; dayList = Today's Jobs for today.
async function glassHomePaint(gather, dayList){
  var today = todayStr();
  var L = await _ghLoad(today);
  var kevin = _homeKevin().id;
  var rows = dayList.drops.map(function(j){ return _homeJobRow(j, 'drop', kevin); })
    .concat(dayList.picks.map(function(j){ return _homeJobRow(j, 'pick', kevin); }))
    .concat(dayList.other.map(function(j){ return _homeJobRow(j, 'other', kevin); }));
  rows = _homeSortRows(rows);
  _ghLast = { L:L, today:today, rows:rows };

  var past7 = [], next7 = [];
  for(var i = 6; i >= 0; i--) past7.push(_jjbPlus(today, -i));
  for(var k = 0; k < 7; k++) next7.push(_jjbPlus(today, k));
  var td = _ghDay(L, today), lastWk = _ghDay(L, _jjbPlus(today, -7)).stops, diff = td.stops - lastWk;
  var fleet = binItems.filter(function(b){ return binInService(b) && !b.show_bin; }).length;
  var out = _ghBinsOut(today);
  var dayName = _ghLabel(today, { weekday:'short' });
  var full = td.junkMin >= GH_DAY_FULL_MIN;
  var h = new Date().getHours();

  var stats = _ghStat(0, 'jobs', 'Jobs today', td.stops, (diff > 0 ? '+' : '') + diff + ' vs last ' + dayName, diff > 0 ? 'up' : 'flat',
      _ghSpark(past7.map(function(d){ return _ghDay(L, d).stops; }), '#4ade80'), 'go(\'jobs\')')
    + _ghStat(1, 'bins', 'Bins out', out + ' <small>/ ' + fleet + '</small>', Math.max(0, fleet - out) + ' in the yard', 'flat',
      _ghSpark(next7.map(_ghBinsOut), '#e5e7eb'), 'go(\'bininventory\')')
    + _ghStat(2, 'hours', 'Junk hours booked', _ghHours(td.junkMin) + ' <small>/ 8h</small>',
      full ? 'Full' : td.junkMin >= GH_DAY_FULL_MIN * .75 ? 'Almost full' : 'Room for more', full ? 'bad' : td.junkMin >= GH_DAY_FULL_MIN * .75 ? 'warn' : 'up',
      _ghSpark(past7.map(function(d){ return _ghDay(L, d).junkMin; }), '#fcd34d'), 'go(\'dispatch\')')
    + _ghStat(3, 'quotes', 'Quotes to chase', gather.quotes.length, 'Visited, no answer yet', 'flat',
      _ghSpark(past7.map(function(d){ return _ghDay(L, d).quotes; }), '#c4b5fd'), 'go(\'junkquotes\')');

  var today2 = '<div class="jg-ttl"><div><h3>Today</h3><p>' + _ghLabel(today, { weekday:'long', month:'short', day:'numeric' }) + '</p></div>'
    + '<button type="button" class="jg-iconbtn jg-small" title="New job" onclick="newJob()">' + _ghSvg('plus', 2.5) + '</button></div>'
    + '<div class="jg-slots">' + (rows.length ? rows.map(function(r){
        return '<button type="button" class="jg-slot" onclick="openDetail(\'' + r.id + '\')"><span class="jg-t">' + escHtml(r.time || '') + '</span>'
          + '<span class="jg-ev' + (r.flag ? ' jg-flag' : '') + '" style="--c:' + r.kind.color + '"><b>' + escHtml(r.kind.label) + ' — ' + escHtml(r.name || r.id) + '</b>'
          + '<span>' + r.sub.join(' · ') + (r.size ? ' · ' + r.size + ' yd' : '') + '</span><span class="jg-who">' + r.who + '</span></span></button>';
      }).join('') : '<div class="jg-empty">Nothing booked today.</div>') + '</div>';

  var acts = L.acts.map(function(g){
    return '<button type="button" class="jg-act" onclick="openDetail(\'' + g.job + '\')"><span class="jg-dot" style="background:' + crewAvatarColor(g.by) + '">' + escHtml(_ghInitials(g.by)) + '</span>'
      + '<span class="jg-actp"><b>' + escHtml(String(g.by).split(' ')[0]) + '</b> changed the ' + escHtml(g.fields.join(', ')) + ' on <em>' + escHtml(L.names[g.job] || 'job ' + g.job) + '</em></span>'
      + '<time>' + _ghAgo(g.at) + '</time></button>';
  }).join('') || '<div class="jg-empty">No changes logged yet.</div>';

  // Who is on each of today's stops: the bin's driver, or a job's assigned crew.
  var crewOf = {};
  dayList.other.forEach(function(j){ crewOf[j.job_id] = j.assigned_crew_ids || []; });
  var crew = crewMembers.map(function(c){
    var mine = rows.filter(function(r){ return r.leg === 'other' ? crewOf[r.id].indexOf(c.id) >= 0 : r.drv === c.id; });
    return { c:c, n:mine.length, first: mine.length ? mine[0].time : '', off: crewStatusForDate(c.id, today).state === 'off' };
  }).sort(function(a, b){ return b.n - a.n; });
  var working = crew.filter(function(x){ return x.n; }).length;
  var crewHtml = crew.slice(0, 5).map(function(x){
    return '<div class="jg-p">' + teamAvatar(x.c.name, crewAvatarColor(x.c.id), 30, x.c.name)
      + '<span class="jg-pn"><b>' + escHtml(x.c.name.split(' ')[0]) + '</b><span>' + (x.first ? 'First stop ' + escHtml(x.first) : x.n ? 'Stops today' : '—') + '</span></span>'
      + '<span class="jg-st' + (x.n ? '' : ' jg-off') + '">' + (x.n ? x.n + ' stop' + _homeS(x.n, '', 's') : x.off ? 'Off today' : 'No stops yet') + '</span></div>';
  }).join('');

  var pct = Math.min(100, Math.round(td.junkMin / GH_DAY_FULL_MIN * 100));
  var next = [];
  for(var d2 = _jjbPlus(today, 1); next.length < 2; d2 = _jjbPlus(d2, 1)) if(_ghWeekday(d2) !== 0) next.push(d2);
  var ring = '<div class="jg-ttl"><div><h3>Busy day</h3><p>Junk removal hours</p></div></div>'
    + '<div class="jg-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="jg-rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#16a34a"/></linearGradient></defs>'
    + '<circle class="jg-rbg" cx="50" cy="50" r="42"/><circle class="jg-rfg" cx="50" cy="50" r="42" style="--off:' + (264 - 264 * pct / 100).toFixed(0) + '"/></svg>'
    + '<div><div class="jg-big">' + pct + '%</div><p>' + _ghHours(td.junkMin).replace('h', '') + ' of 8 hours</p><p>' + (full ? 'Today is full' : 'Room for ' + _ghHours(GH_DAY_FULL_MIN - td.junkMin) + ' more') + '</p></div></div>'
    + '<div class="jg-mini">' + next.map(function(x, j){ return '<div>' + (j === 0 && x === _jjbPlus(today, 1) ? 'Tomorrow' : _ghLabel(x, { weekday:'long' })) + '<b>' + _ghHours(_ghDay(L, x).junkMin) + '</b></div>'; }).join('') + '</div>';

  var el = document.getElementById('home-p-glass');
  el.classList.toggle('jg-in', !_ghShown);
  _ghShown = true;
  el.innerHTML =
    '<div class="jg-head"><div><h1>' + (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + ', ' + escHtml(_homeName()) + '</h1>'
      + '<p>Here\'s what\'s happening across the yard today · ' + _ghLabel(today, { weekday:'long', month:'short', day:'numeric' }) + '</p></div>'
      + '<div class="jg-headr"><div class="jg-seg jg-glass" id="jg-seg">'
        + ['day', 'week', 'month'].map(function(m){ return '<span data-m="' + m + '" class="' + (m === _ghMode ? 'on' : '') + '" onclick="ghMode(\'' + m + '\')">' + m[0].toUpperCase() + m.slice(1) + '</span>'; }).join('')
      + '</div><button type="button" class="jg-btn" onclick="newJob()">' + _ghSvg('plus', 2.5) + 'New job</button></div></div>'
    + '<div class="jg-stats">' + stats + '</div>'
    + '<div class="jg-mid"><div class="jg-card" id="jg-chartcard" style="--i:4">' + _ghChartHtml(_ghBars(L, today, rows)) + '</div>'
      + '<div class="jg-card jg-today" style="--i:5">' + today2 + '</div></div>'
    + '<div class="jg-lower"><div class="jg-card" style="--i:6"><div class="jg-ttl"><h3>Recent activity</h3></div>' + acts + '</div>'
      + '<div class="jg-card jg-crew" style="--i:7"><div class="jg-ttl"><div><h3>Crew</h3><p>' + working + ' with stops today</p></div></div>' + crewHtml + '</div>'
      + '<div class="jg-card" style="--i:8">' + ring + '</div></div>';
}
