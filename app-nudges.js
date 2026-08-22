// ── THE ATTENTION BAR ───────────────────────────────────────────────────────
// One line on the dashboard saying how many things need a person, and a click
// to see them. It is the PRIMARY channel on purpose, not a fallback.
//
// Why a bar and not a notification: over 45 days the dashboard took 406 of the
// 763 page views in the whole company and Clients took 150. Dispatch got 1,
// Live Jobs 0, Damage Reports 0. Anything not on the dashboard is not read.
// And push alone cannot carry this — Kelly books 76% of the jobs and has never
// had a push subscription, so a notification-only design reaches everybody
// except the one person it is for.
//
// The rules Jake set, and why each exists:
//   ONE line, never five — "i dont want the user to have to close 5
//   notifications, its too much as sometimes they need to book asap".
//   It never pops, never covers the New Job button, and stays out of the way
//   while a modal is open. Booking always wins.
//
// Every entry here gets WORSE if nobody touches it. Things that merely sit
// there — unsent confirmations, suggestions, review follow-ups — are
// deliberately left out. Half of all bookings have gone unconfirmed every week
// for ten weeks, so putting that on a daily list teaches people the list is
// noise, and then they stop reading the parts that matter.
//
// Depends on app.js globals: db, jobs, todayStr, go, openDetail, escHtml, toast.
(function(){
  'use strict';

  var HOST_ID = 'dash-nudge-bar';
  var _open   = false;   // is the list expanded
  var _items  = [];
  var _damage = 0;       // open damage reports, counted in the database
  var _timer  = null;

  function esc(s){
    return (typeof escHtml === 'function') ? escHtml(s == null ? '' : String(s)) : String(s == null ? '' : s);
  }
  function host(){ return document.getElementById(HOST_ID); }

  function addDays(ds, n){
    var p = String(ds).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function collect(){
    var today = todayStr();
    var soon  = addDays(today, 3);
    var out   = [];
    var all   = (typeof jobs !== 'undefined' && jobs) ? jobs : [];

    all.forEach(function(j){
      if(!j || j.status === 'Cancelled') return;

      // A bin due out within three days that nobody has picked a bin for.
      // Ignored, this is a truck leaving the yard with nothing on it.
      if(j.service === 'Bin Rental' && !j.binBid && j.binDropoff
         && j.binDropoff >= today && j.binDropoff <= soon){
        out.push({
          id: j.id, kind: 'nobin',
          text: 'No bin picked for ' + (j.name || 'a booking'),
          sub: (j.binSize ? j.binSize + ' · ' : '') + 'going out ' + j.binDropoff
        });
      }

      // Past its pickup day and still recorded as out: a rented bin sitting in
      // somebody's driveway earning nothing.
      if(j.service === 'Bin Rental' && j.binInstatus === 'dropped'
         && j.binPickup && j.binPickup < today){
        out.push({
          id: j.id, kind: 'overdue',
          text: 'Bin ' + (j.binBid || '') + ' was due back',
          sub: (j.name || '') + ' · pickup was ' + j.binPickup
        });
      }

      // No date anywhere. These render on NO screen at all, so nothing else
      // will ever remind anyone they exist.
      if(j.service !== 'Extra Jobs' && !j.date && !j.junkDate && !j.fbDate && !j.binDropoff){
        out.push({
          id: j.id, kind: 'nodate',
          text: 'No date on ' + (j.name || 'a job'),
          sub: (j.service || 'Job') + ' · it shows on no other screen'
        });
      }
    });

    if(_damage > 0){
      out.push({
        id: null, kind: 'damage',
        text: _damage + ' damage report' + (_damage === 1 ? '' : 's') + ' still open',
        sub: 'Nobody has closed ' + (_damage === 1 ? 'it' : 'them') + ' off'
      });
    }
    return out;
  }

  async function countDamage(){
    try {
      var r = await db.from('damage_reports').select('id', { count: 'exact', head: true }).neq('status', 'resolved');
      _damage = r.count || 0;
    } catch(e){ _damage = 0; }   // the bar is still worth showing without this line
  }

  // Booking always wins: while any modal is open the bar stays off screen
  // rather than competing for attention.
  function modalIsOpen(){ return !!document.querySelector('.modal-overlay.open'); }

  function paint(){
    var el = host();
    if(!el) return;
    if(modalIsOpen() || !_items.length){ el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';

    var n = _items.length;
    var head = '<button type="button" onclick="JJNudges.toggle()" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:11px 15px;border:1px solid #f0c9a0;background:#fff8f0;border-radius:12px;cursor:pointer;font-family:inherit">'
      + '<span style="flex:none;font-size:16px">⚠</span>'
      + '<span style="flex:1;min-width:0;font-size:14px;font-weight:700;color:#8a4b08">'
      + n + ' thing' + (n === 1 ? '' : 's') + ' need' + (n === 1 ? 's' : '') + ' you</span>'
      + '<span style="flex:none;font-size:12px;font-weight:700;color:#a86420">' + (_open ? 'Hide' : 'Show me') + '</span>'
      + '</button>';

    var list = '';
    if(_open){
      list = '<div style="margin-top:7px;display:flex;flex-direction:column;gap:6px">'
        + _items.map(function(it){
            var click = it.id ? 'JJNudges.openItem(&quot;' + esc(it.id) + '&quot;)' : 'go(&quot;damage&quot;)';
            return '<button type="button" onclick="' + click + '" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 14px;border:1px solid var(--border);background:var(--surface);border-radius:10px;cursor:pointer;font-family:inherit">'
              + '<span style="flex:1;min-width:0">'
              + '<span style="display:block;font-size:13.5px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.text) + '</span>'
              + '<span style="display:block;font-size:11.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.sub) + '</span>'
              + '</span>'
              + '<span style="flex:none;font-size:11px;font-weight:700;color:var(--accent)">Open</span>'
              + '</button>';
          }).join('')
        + '</div>';
    }
    el.innerHTML = head + list;
  }

  function toggle(){ _open = !_open; paint(); }

  function openItem(id){ if(typeof openDetail === 'function') openDetail(id); }

  async function refresh(){
    if(!host()) return;
    await countDamage();
    _items = collect();
    paint();
  }

  // A job saved with no date is the one case worth interrupting for, because it
  // lands on no screen at all — so it is said to the person who just saved it,
  // right then, while the call is still fresh. Local only: no server and no
  // subscription, which is what makes it reach Kelly as well.
  function warnNoDate(job){
    if(!job || job.date || job.junkDate || job.fbDate || job.binDropoff) return;
    if(job.service === 'Extra Jobs') return;
    try {
      if(typeof Notification !== 'undefined' && Notification.permission === 'granted'){
        new Notification('Jeff’s Junk', {
          body: 'Job ' + (job.id || '') + ' was saved with no date. It will not show on any screen until it has one.',
          icon: 'assets/app-icon-192.png'
        });
      }
    } catch(e){ /* the toast below is the message that always lands */ }
    if(typeof toast === 'function'){
      toast('⚠ Job ' + (job.id || '') + ' has no date — it will not appear on any screen until you give it one.', 'error');
    }
    refresh();
  }

  function start(){
    refresh();
    clearInterval(_timer);
    _timer = setInterval(refresh, 5 * 60 * 1000);
  }

  window.JJNudges = { start: start, refresh: refresh, toggle: toggle, openItem: openItem, warnNoDate: warnNoDate };
})();
