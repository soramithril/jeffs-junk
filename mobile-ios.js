/* ============================================================================
   JEFF'S JUNK — iOS MOBILE LAYER · behaviour  (mobile-ios.js)
   ----------------------------------------------------------------------------
   Phones only. Everything is gated behind isMobile() (≤900px — your existing
   mobile breakpoint), so on desktop NONE of this runs and the desktop app is
   completely untouched.

   What it does on a phone:
     1. Repoints the bottom-bar "Schedule" tab from the jobs Calendar to the
        EMPLOYEE schedule (go('crew')), and renders an iOS crew scheduler there.
     2. Injects a mobile Home panel at the top of the dashboard showing:
          • a "New quote" push banner
          • a big "Quote a customer" CTA  → mOpenCreate()
          • TODAY'S QUOTES list
          • bin drop/pickup COUNTS
          • a "Bins out" card (out vs free per size) — live fleet data
     3. iOS crew scheduler (Schedule tab): day strip + employee list, tap a
        person to set Working all day / Set hours / Book day off. Writes to the
        REAL crew_blocks store via addCrewBlock()/clearCrewDay(), so it persists
        and stays in sync with the desktop crew grid.

   It only ADDS panels and re-points one tab. Remove the <script> line to revert.

   Reads these globals the app already exposes: jobs, binItems, crewMembers,
   todayStr(), jobSchedDate(), go(), openDetail(), mOpenCreate(),
   crewStatusForDate(), addCrewBlock(), clearCrewDay(), crewAvatarInitials().
   ============================================================================ */
(function () {
  'use strict';

  function isMobile() { return window.matchMedia('(max-width:900px)').matches; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function money(v) {
    if (v === '' || v == null) return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : '$' + n.toLocaleString();
  }

  /* ── Home day selection (defaults to today; can look ahead) ──────────────*/
  var _homeDay = null;                       // selected Home date, YYYY-MM-DD
  function homeDay() { return _homeDay || todayStr(); }

  /* ── live data → quotes & bin counts for a given day ─────────────────────*/
  function quotesForDay(day) {
    if (typeof jobs === 'undefined') return [];
    return jobs.filter(function (j) {
      return j.service === 'Junk Quote' && j.status !== 'Cancelled' && jobSchedDate(j) === day;
    });
  }
  function binCountsForDay(day) {
    var c = { drops: 0, picks: 0 };
    if (typeof jobs === 'undefined') return c;
    jobs.forEach(function (j) {
      if (j.service !== 'Bin Rental' || j.status === 'Cancelled') return;
      if (j.binDropoff === day) c.drops++;
      if (j.binPickup === day) c.picks++;
    });
    return c;
  }
  // Live "bins out" by size for a given day — mirrors the desktop
  // refreshDashBinStats() math. active fleet = binItems where damage !== 'oor'.
  // For TODAY: a bin is OUT when a non-cancelled Bin Rental job is 'dropped'.
  // For OTHER days: forecast from each job's dropoff→pickup window (same rules
  // as the desktop's non-today branch).
  function binFleet(day) {
    if (typeof binItems === 'undefined' || typeof jobs === 'undefined') return null;
    var today = todayStr();
    var sizes = ['4 yard', '7 yard', '14 yard', '20 yard'];
    var active = binItems.filter(function (b) { return b.damage !== 'oor'; });
    var sizeTotal = {};
    sizes.forEach(function (s) { sizeTotal[s] = active.filter(function (b) { return b.size === s; }).length; });
    var sizeOut = { '4 yard': 0, '7 yard': 0, '14 yard': 0, '20 yard': 0 };

    if (day === today) {
      jobs.forEach(function (j) {
        if (j.service !== 'Bin Rental' || j.binInstatus !== 'dropped' || j.status === 'Cancelled') return;
        if (sizeOut.hasOwnProperty(j.binSize)) sizeOut[j.binSize]++;
      });
    } else {
      jobs.forEach(function (j) {
        if (j.service !== 'Bin Rental' || j.status === 'Cancelled' || j.binInstatus === 'pickedup') return;
        var drop = j.binDropoff || j.date, pick = j.binPickup, on = false;
        if (j.binInstatus === 'dropped' && day >= today) {
          on = (!pick || pick < today) ? true : day < pick;     // out now; back on pickup day
        } else if (!drop) {
          return;
        } else if (pick) {
          on = day >= drop && day < pick;
        } else {
          var dd = new Date(drop + 'T12:00:00'), mp = new Date(dd); mp.setDate(mp.getDate() + 30);
          on = day >= drop && day <= dkey(mp);                  // no pickup set → assume 30-day window
        }
        if (on && sizeOut.hasOwnProperty(j.binSize)) sizeOut[j.binSize]++;
      });
    }
    var rows = sizes.map(function (s) {
      var out = Math.min(sizeOut[s], sizeTotal[s]);
      return { size: s, out: out, free: Math.max(0, sizeTotal[s] - out) };
    });
    return { rows: rows, totalOut: rows.reduce(function (a, r) { return a + r.out; }, 0) };
  }
  // Map a quote to a status pill, bound to the app's REAL fields.
  // j.status only ever holds '' or 'Cancelled' (Cancelled is filtered out
  // upstream), so it carries no New/Sent/Accepted signal. The real signals are
  // the booleans confirmed / emailSent / emailConfirmed, plus whether price is set.
  function quoteStatus(j) {
    if (j.confirmed)                       return { l: 'Accepted', c: '#15803d', b: '#dff5e6' }; // customer confirmed/booked
    if (j.emailSent || j.emailConfirmed)   return { l: 'Sent',     c: '#15803d', b: '#dff5e6' }; // quote email went out
    if (j.price === '' || j.price == null) return { l: 'New',      c: '#1a56db', b: '#e8f0fe' }; // not quoted yet
    return { l: 'Pending', c: '#c2410c', b: '#fef3e0' };                                          // priced, not yet sent
  }

  /* ── markup helpers (inline-styled to match the iOS design) ──────────────*/
  function quoteRow(j, first) {
    var st = quoteStatus(j), amt = money(j.price) || '—';
    return '<div onclick="openDetail(\'' + j.id + '\')" style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;' +
      (first ? '' : 'border-top:.5px solid rgba(20,60,40,.08)') + '">' +
      '<div style="flex:none;width:3px;height:38px;border-radius:2px;background:#eab308"></div>' +
      '<div style="flex:1;min-width:0"><div style="font:600 14.5px -apple-system;color:#14241b">' + esc(j.name || '—') + '</div>' +
      '<div style="font:400 12px -apple-system;color:rgba(38,50,42,.55)">Junk quote</div></div>' +
      '<div style="text-align:right"><div style="font:700 15px -apple-system;color:#14241b">' + amt + '</div>' +
      '<div style="font:700 10px -apple-system;color:' + st.c + ';background:' + st.b + ';border-radius:6px;padding:2px 7px;margin-top:3px">' + st.l + '</div></div>' +
      '</div>';
  }
  function statTile(label, n, stroke, bg, up, suffix) {
    var icon = up
      ? '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'
      : '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>';
    var tail = suffix ? ' <span style="font-family:-apple-system;font-size:12px;font-weight:600;color:rgba(38,50,42,.45)">' + suffix + '</span>' : '';
    return '<div style="flex:1;border-radius:16px;padding:13px 15px;background:rgba(255,255,255,.72);box-shadow:0 8px 20px rgba(18,80,50,.07),inset 0 1px 0 rgba(255,255,255,.9);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)">' +
      '<div style="display:flex;align-items:center;gap:7px"><span style="width:22px;height:22px;border-radius:7px;background:' + bg + ';display:flex;align-items:center;justify-content:center">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + stroke + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg></span>' +
      '<span style="font:600 11px -apple-system;color:rgba(38,50,42,.55);text-transform:uppercase;letter-spacing:.4px">' + label + '</span></div>' +
      '<div style="font-family:\'Bebas Neue\',Impact,sans-serif;font-size:34px;line-height:.9;color:#14241b;margin-top:7px">' + n + tail + '</div></div>';
  }
  // Home date selector: ‹ stepper · tappable date (opens native picker) · › stepper · Today reset.
  function homeDateBar(day, today) {
    var d = new Date(day + 'T12:00:00');
    var label = (day === today) ? 'Today' : DOW_LONG[d.getDay()].slice(0, 3) + ', ' + MON[d.getMonth()] + ' ' + d.getDate();
    var btn = 'flex:none;width:40px;height:40px;border-radius:13px;border:.5px solid rgba(20,60,40,.08);background:rgba(255,255,255,.7);color:#16a34a;font:600 20px -apple-system;cursor:pointer;box-shadow:0 4px 12px rgba(18,80,50,.05);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)';
    return '<div style="display:flex;align-items:center;gap:8px;margin:2px 0 12px">' +
      '<button class="jjm-tap" onclick="JJM.homeStep(-1)" style="' + btn + '">‹</button>' +
      '<div style="position:relative;flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:40px;border-radius:13px;border:.5px solid rgba(20,60,40,.08);background:rgba(255,255,255,.7);box-shadow:0 4px 12px rgba(18,80,50,.05);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);cursor:pointer" onclick="var i=document.getElementById(\'jjm-home-date\');if(i&&i.showPicker)i.showPicker()">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '<span style="font:700 14px -apple-system;color:#14241b">' + label + '</span>' +
        '<input type="date" id="jjm-home-date" value="' + day + '" onchange="JJM.homeGo(this.value)" style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer">' +
      '</div>' +
      '<button class="jjm-tap" onclick="JJM.homeStep(1)" style="' + btn + '">›</button>' +
      (day !== today ? '<button class="jjm-tap" onclick="JJM.homeGo(\'' + today + '\')" style="flex:none;height:40px;padding:0 14px;border-radius:13px;border:none;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font:700 12px -apple-system;cursor:pointer;box-shadow:0 6px 14px rgba(22,163,74,.3)">Today</button>' : '') +
      '</div>';
  }
  // Big "Quote a customer" CTA → opens the existing mobile create sheet.
  function quoteCustomerCTA() {
    return '<div style="margin:2px 0 6px"><button onclick="mOpenCreate()" style="width:100%;border:none;cursor:pointer;text-align:left;background:linear-gradient(120deg,#16a34a,#15803d);color:#fff;border-radius:16px;padding:15px 17px;display:flex;align-items:center;gap:13px;box-shadow:0 8px 22px rgba(22,163,74,.34),inset 0 1px 0 rgba(255,255,255,.28)">' +
      '<div style="flex:none;width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>' +
      '<div style="flex:1"><div style="font:700 16px -apple-system">Quote a customer</div><div style="font:400 12.5px -apple-system;opacity:.92">Find the booked job · price &amp; photo it</div></div>' +
      '<svg width="8" height="14" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg></button></div>';
  }
  // "Bins out" glass card — out vs free per size, from live fleet data.
  function binFleetCard(bf) {
    var head = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:11px">' +
      '<div style="display:flex;align-items:center;gap:9px"><div style="width:28px;height:28px;border-radius:9px;background:rgba(22,163,74,.12);border:1px solid rgba(22,163,74,.26);display:flex;align-items:center;justify-content:center">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h18l-1.5 11.3A2 2 0 0 1 17.5 21h-11a2 2 0 0 1-2-1.7L3 8z"/><path d="M3.4 8 4.6 4.8A2 2 0 0 1 6.5 3.5h11a2 2 0 0 1 1.9 1.3L20.6 8"/><path d="M9 12v5M15 12v5"/></svg></div>' +
      '<span style="font:700 14.5px -apple-system;color:#15241b">Bins out</span></div>' +
      '<span style="font:500 12px -apple-system;color:rgba(38,50,42,.55)"><b style="color:#16a34a;font-weight:700">' + bf.totalOut + '</b> out today</span></div>';
    var colhead = '<div style="display:flex;align-items:center;padding:0 4px 6px"><span style="flex:1;font:700 9.5px -apple-system;color:rgba(38,50,42,.42);letter-spacing:.7px">SIZE</span><span style="width:50px;text-align:right;font:700 9.5px -apple-system;color:#5b6b62;letter-spacing:.7px">OUT</span><span style="width:54px;text-align:right;font:700 9.5px -apple-system;color:#16a34a;letter-spacing:.7px">FREE</span></div>';
    var rows = bf.rows.map(function (r) {
      var disp = r.size.replace(' yard', ' yd');
      return '<div style="display:flex;align-items:center;padding:7px 4px;border-top:.5px solid rgba(20,60,40,.09)"><span style="flex:1"><span style="font:600 12.5px -apple-system;color:#15803d;background:rgba(22,163,74,.09);border:1px solid rgba(22,163,74,.2);border-radius:8px;padding:3px 11px">' + disp + '</span></span><span style="width:50px;text-align:right;font-family:\'Bebas Neue\',Impact,sans-serif;font-size:24px;color:#1f3a2c">' + r.out + '</span><span style="width:54px;text-align:right;font-family:\'Bebas Neue\',Impact,sans-serif;font-size:24px;color:#16a34a">' + r.free + '</span></div>';
    }).join('');
    return '<div style="margin-top:14px;position:relative;border-radius:18px;overflow:hidden;background:linear-gradient(150deg,rgba(255,255,255,.92),rgba(255,255,255,.64));box-shadow:0 14px 32px rgba(18,80,50,.12),inset 0 1px 0 rgba(255,255,255,.95),inset 0 0 0 1px rgba(255,255,255,.6);-webkit-backdrop-filter:blur(18px) saturate(1.7);backdrop-filter:blur(18px) saturate(1.7)"><div style="position:absolute;top:-40px;right:-30px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,rgba(34,197,94,.22),rgba(34,197,94,0) 68%);filter:blur(20px);pointer-events:none"></div><div style="position:relative;padding:15px 16px">' + head + colhead + rows + '</div></div>';
  }

  /* ── build / refresh the mobile Home panel ───────────────────────────────*/
  function renderHome() {
    if (!isMobile()) return;
    var view = $('view-dashboard');
    if (!view) return;
    var host = $('jj-m-home');
    if (!host) {
      host = document.createElement('div');
      host.id = 'jj-m-home';
      view.insertBefore(host, view.firstChild);
    }
    var day = homeDay(), today = todayStr();
    var qs = quotesForDay(day), bc = binCountsForDay(day), bf = binFleet(day);
    var newQuote = qs.find(function (j) { return quoteStatus(j).l === 'New'; });
    var emptyMsg = day === today ? 'No quotes scheduled today' : 'No quotes scheduled this day';
    var qHdr = day === today ? "Today's quotes" : 'Quotes';
    var tileWhen = day === today ? 'today' : '';

    var banner = newQuote
      ? '<div onclick="openDetail(\'' + newQuote.id + '\')" style="cursor:pointer;display:flex;align-items:center;gap:11px;margin:0 0 12px;background:rgba(255,255,255,.78);border:.5px solid rgba(255,255,255,.7);border-radius:16px;padding:11px 13px;box-shadow:0 8px 22px rgba(18,80,50,.1),inset 0 1px 0 rgba(255,255,255,.9);-webkit-backdrop-filter:blur(16px) saturate(1.6);backdrop-filter:blur(16px) saturate(1.6)">' +
        '<div style="flex:none;width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;display:flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',Impact,sans-serif;font-size:19px">J</div>' +
        '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px"><span style="font:700 10px -apple-system;letter-spacing:.4px;color:rgba(38,50,42,.5);text-transform:uppercase">Jeff\'s Junk</span><span style="font:500 10px -apple-system;color:rgba(38,50,42,.4)">· now</span></div>' +
        '<div style="font:600 13.5px -apple-system;color:#14241b;margin-top:1px">New quote request</div>' +
        '<div style="font:400 12px -apple-system;color:rgba(38,50,42,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(newQuote.name || 'Customer') + ' — tap to quote</div></div></div>'
      : '';

    var rows = qs.length
      ? qs.map(function (j, i) { return quoteRow(j, i === 0); }).join('')
      : '<div style="padding:18px 16px;text-align:center;font:400 13px -apple-system;color:rgba(38,50,42,.5)">' + emptyMsg + '</div>';

    host.innerHTML =
      homeDateBar(day, today) +
      banner +
      quoteCustomerCTA() +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 4px 8px"><span style="font:600 13px -apple-system;color:rgba(38,50,42,.55);text-transform:uppercase;letter-spacing:.3px">' + qHdr + ' · ' + qs.length + '</span><span onclick="mOpenCreate()" style="font:600 12.5px -apple-system;color:#16a34a;cursor:pointer">+ New</span></div>' +
      '<div style="border-radius:16px;overflow:hidden;background:rgba(255,255,255,.72);box-shadow:0 10px 26px rgba(18,80,50,.08),inset 0 1px 0 rgba(255,255,255,.9);-webkit-backdrop-filter:blur(16px) saturate(1.7);backdrop-filter:blur(16px) saturate(1.7)">' + rows + '</div>' +
      '<div style="display:flex;gap:10px;margin-top:14px">' +
        statTile('Drops', bc.drops, '#0891b2', 'rgba(8,145,178,.12)', false, tileWhen) +
        statTile('Pickups', bc.picks, '#16a34a', 'rgba(22,163,74,.12)', true, tileWhen) +
      '</div>' +
      (bf ? binFleetCard(bf) : '');
    host.style.cssText = 'margin-bottom:8px';
  }

  // Switch the Home panel to a day. Renders immediately from in-memory data,
  // then drives the app's OWN date-scoped loaders (the hidden #dash-bin-date +
  // refreshDashJobs/refreshDashBinStats) so future days pull complete data into
  // `jobs`, and re-renders when they resolve. One loader path, shared with desktop.
  function loadHomeDay(day) {
    _homeDay = day;
    renderHome();
    var dp = $('dash-bin-date'); if (dp) dp.value = day;
    var tasks = [];
    try { if (typeof refreshDashJobs === 'function') tasks.push(Promise.resolve(refreshDashJobs())); } catch (e) {}
    try { if (typeof refreshDashBinStats === 'function') tasks.push(Promise.resolve(refreshDashBinStats())); } catch (e) {}
    if (tasks.length) Promise.all(tasks).then(function () { renderHome(); }, function () { renderHome(); });
  }

  /* ── iOS crew scheduler (Schedule tab → #view-crew) ──────────────────────*/
  var PAL = ['#22c55e', '#0d6efd', '#8b5cf6', '#f97316', '#dc3545', '#06b6d4', '#eab308', '#0d9488'];
  var DOW_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var _schedDay = null;          // selected YYYY-MM-DD
  var _cur = null;               // crew member currently in the sheet

  function schedDay() { return _schedDay || todayStr(); }
  function dkey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function weekOf(sel) {
    var base = new Date(sel + 'T12:00:00'), sun = new Date(base);
    sun.setDate(base.getDate() - base.getDay());
    var out = [];
    for (var i = 0; i < 7; i++) { var d = new Date(sun); d.setDate(sun.getDate() + i); out.push(d); }
    return out;
  }
  function crewColor(c, i) { return c.color || PAL[i % PAL.length]; }
  function initials(name) {
    try { if (typeof crewAvatarInitials === 'function') return crewAvatarInitials(name); } catch (e) {}
    return String(name || '?').trim().slice(0, 2).toUpperCase();
  }
  function crewList() { return (typeof crewMembers !== 'undefined' ? crewMembers : []) || []; }
  function val(id) { var el = $(id); return el ? el.value : ''; }

  function injectStyles() {
    if ($('jj-m-style')) return;
    var s = document.createElement('style');
    s.id = 'jj-m-style';
    s.textContent =
      '@media(max-width:900px){#view-crew>*:not(#jj-m-crew){display:none!important}}' +
      '#jj-m-crew .jjx::-webkit-scrollbar{display:none}#jj-m-crew .jjx{scrollbar-width:none}' +
      '.jjm-day{flex:none;width:46px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 0 9px;border-radius:14px;border:none;background:transparent;cursor:pointer}' +
      '.jjm-day.sel{background:linear-gradient(150deg,#22c55e,#16a34a);box-shadow:0 8px 18px rgba(34,197,94,.32)}' +
      '.jjm-tap{transition:transform .12s}.jjm-tap:active{transform:scale(.98)}' +
      '.jjm-scrim{position:fixed;inset:0;background:rgba(10,30,20,.4);opacity:0;pointer-events:none;transition:opacity .3s;z-index:9998}' +
      '.jjm-scrim.open{opacity:1;pointer-events:auto}' +
      '.jjm-sheet{position:fixed;left:0;right:0;bottom:0;z-index:9999;transform:translateY(100%);transition:transform .32s cubic-bezier(.16,1,.3,1)}' +
      '.jjm-sheet.open{transform:translateY(0)}';
    document.head.appendChild(s);
  }

  function ensureSheet() {
    if ($('jjm-sheet')) return;
    var scrim = document.createElement('div');
    scrim.id = 'jjm-scrim'; scrim.className = 'jjm-scrim';
    scrim.onclick = function () { JJM.closeSheet(); };
    document.body.appendChild(scrim);

    var input = 'width:100%;box-sizing:border-box;border:none;background:#fff;border-radius:11px;padding:11px;font:500 15px -apple-system;color:#14241b;box-shadow:0 2px 8px rgba(18,80,50,.05)';
    var sheet = document.createElement('div');
    sheet.id = 'jjm-sheet'; sheet.className = 'jjm-sheet';
    sheet.innerHTML =
      '<div style="background:rgba(248,252,249,.96);border-radius:26px 26px 0 0;padding:10px 16px calc(22px + env(safe-area-inset-bottom,0));box-shadow:0 -16px 44px rgba(18,80,50,.18);-webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6)">' +
      '<div style="width:40px;height:5px;border-radius:3px;background:#cdd6cf;margin:2px auto 12px"></div>' +
      '<div style="display:flex;align-items:center;gap:11px;padding:0 2px 4px"><div id="jjm-av" style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font:700 15px -apple-system"></div><div><div id="jjm-name" style="font:700 17px -apple-system;color:#14241b"></div><div id="jjm-date" style="font:500 12px -apple-system;color:rgba(38,50,42,.55)"></div></div></div>' +
      '<div style="display:flex;flex-direction:column;gap:9px;margin-top:12px">' +
      '<button class="jjm-tap" onclick="JJM.setWork()" style="border:none;cursor:pointer;text-align:left;background:#fff;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 12px rgba(18,80,50,.05)"><span style="width:30px;height:30px;border-radius:9px;background:#dff5e6;display:flex;align-items:center;justify-content:center;font-size:15px">✓</span><div><div style="font:600 15px -apple-system;color:#14241b">Working all day</div><div style="font:400 11.5px -apple-system;color:rgba(38,50,42,.55)">Available for jobs</div></div></button>' +
      '<button class="jjm-tap" onclick="JJM.toggleHours()" style="border:none;cursor:pointer;text-align:left;background:#fff;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 12px rgba(18,80,50,.05)"><span style="width:30px;height:30px;border-radius:9px;background:#fef3e0;display:flex;align-items:center;justify-content:center;font-size:15px">🕐</span><div style="flex:1"><div style="font:600 15px -apple-system;color:#14241b">Set hours…</div><div style="font:400 11.5px -apple-system;color:rgba(38,50,42,.55)">Working part of the day</div></div></button>' +
      '<div id="jjm-hours" style="display:none;gap:10px;padding:2px 2px 0"><div style="flex:1"><div style="font:600 10px -apple-system;color:rgba(38,50,42,.5);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Start</div><input id="jjm-start" type="time" value="08:00" style="' + input + '"></div><div style="flex:1"><div style="font:600 10px -apple-system;color:rgba(38,50,42,.5);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">End</div><input id="jjm-end" type="time" value="12:00" style="' + input + '"></div><button class="jjm-tap" onclick="JJM.setHours()" style="flex:none;align-self:flex-end;border:none;cursor:pointer;background:#16a34a;color:#fff;border-radius:11px;padding:11px 16px;font:600 14px -apple-system">Set</button></div>' +
      '<button class="jjm-tap" onclick="JJM.toggleOff()" style="border:none;cursor:pointer;text-align:left;background:#fff;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 12px rgba(18,80,50,.05)"><span style="width:30px;height:30px;border-radius:9px;background:#fde8e8;display:flex;align-items:center;justify-content:center;font-size:15px">🚫</span><div style="flex:1"><div style="font:600 15px -apple-system;color:#14241b">Book day off</div><div style="font:400 11.5px -apple-system;color:rgba(38,50,42,.55)">Time off, vacation, sick</div></div></button>' +
      '<div id="jjm-off" style="display:none;flex-direction:column;gap:9px;padding:2px 2px 0"><select id="jjm-reason" style="' + input + '"><option>Vacation</option><option>Sick</option><option>Personal</option><option>Appointment</option><option>Unavailable</option></select><input id="jjm-note" type="text" placeholder="Note (optional)" style="' + input + '"><button class="jjm-tap" onclick="JJM.setOff()" style="border:none;cursor:pointer;background:#dc3545;color:#fff;border-radius:12px;padding:13px;font:600 15px -apple-system">Book day off</button></div>' +
      '<button class="jjm-tap" onclick="JJM.closeSheet()" style="border:none;cursor:pointer;background:none;padding:10px;font:600 15px -apple-system;color:rgba(38,50,42,.5)">Cancel</button>' +
      '</div></div>';
    document.body.appendChild(sheet);
  }

  function renderCrewPanel() {
    if (!isMobile()) return;
    var view = $('view-crew');
    if (!view) return;
    ensureSheet();
    var host = $('jj-m-crew');
    if (!host) {
      host = document.createElement('div');
      host.id = 'jj-m-crew';
      host.style.cssText = 'padding:4px 0 24px';
      view.insertBefore(host, view.firstChild);
    }
    var sel = schedDay(), days = weekOf(sel), today = todayStr();
    var strip = days.map(function (d) {
      var k = dkey(d), on = k === sel;
      return '<button class="jjm-day' + (on ? ' sel' : '') + '" onclick="JJM.pickDay(\'' + k + '\')"><span style="font:700 10px -apple-system;color:' + (on ? 'rgba(255,255,255,.85)' : 'rgba(38,50,42,.5)') + '">' + DOW_SHORT[d.getDay()] + '</span><span style="font:700 17px -apple-system;color:' + (on ? '#fff' : '#14241b') + '">' + d.getDate() + '</span></button>';
    }).join('');

    var crew = crewList(), off = 0, list;
    if (!crew.length) {
      list = '<div style="padding:20px 16px;text-align:center;font:400 13px -apple-system;color:rgba(38,50,42,.5)">No employees yet</div>';
    } else {
      list = crew.map(function (c, i) {
        var st = crewStatusForDate(c.id, sel);
        if (st.state === 'off') off++;
        var dot = st.state === 'off' ? '#dc3545' : st.state === 'partial' ? '#e67e22' : '#22c55e';
        var col = st.state === 'off' ? '#dc3545' : st.state === 'partial' ? '#c2410c' : '#15803d';
        var label = st.state === 'free' ? 'Available' : st.label;
        return '<div class="jjm-tap" onclick="JJM.openEmp(\'' + c.id + '\')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;' + (i ? 'border-top:.5px solid rgba(20,60,40,.08)' : '') + '">' +
          '<div style="flex:none;width:38px;height:38px;border-radius:50%;background:' + crewColor(c, i) + ';color:#fff;display:flex;align-items:center;justify-content:center;font:700 13px -apple-system">' + esc(initials(c.name)) + '</div>' +
          '<div style="flex:1;min-width:0"><div style="font:600 15px -apple-system;color:#14241b">' + esc(c.name) + '</div><div style="display:flex;align-items:center;gap:6px;margin-top:2px"><span style="flex:none;width:7px;height:7px;border-radius:50%;background:' + dot + '"></span><span style="font:600 12px -apple-system;color:' + col + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(label) + '</span></div></div>' +
          '<svg width="7" height="12" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" stroke="rgba(38,50,42,.3)" stroke-width="2" fill="none" stroke-linecap="round"/></svg></div>';
      }).join('');
    }
    var working = crew.length - off;
    var sd = new Date(sel + 'T12:00:00');
    var dateLabel = DOW_LONG[sd.getDay()] + ', ' + MON[sd.getMonth()] + ' ' + sd.getDate() + (sel === today ? ' · Today' : '');

    host.innerHTML =
      '<div style="padding:8px 20px 8px"><div style="font:800 28px/1 -apple-system;letter-spacing:-.8px;color:#14241b">Schedule</div></div>' +
      '<div class="jjx" style="display:flex;gap:6px;overflow-x:auto;padding:2px 16px 6px">' + strip + '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 20px 8px"><div style="font:600 13px -apple-system;color:rgba(38,50,42,.55);text-transform:uppercase;letter-spacing:.3px">' + dateLabel + '</div><div style="font:600 12px -apple-system;color:#16a34a">' + working + ' working · ' + off + ' off</div></div>' +
      '<div style="margin:0 16px;border-radius:16px;overflow:hidden;background:rgba(255,255,255,.72);box-shadow:0 10px 26px rgba(18,80,50,.08),inset 0 1px 0 rgba(255,255,255,.9);-webkit-backdrop-filter:blur(16px) saturate(1.7);backdrop-filter:blur(16px) saturate(1.7)">' + list + '</div>' +
      '<div style="font:400 12px -apple-system;color:rgba(38,50,42,.45);text-align:center;padding:14px 30px 0">Tap anyone to set their day — working, hours, or time off.</div>';
  }

  function openSheet() { var s = $('jjm-sheet'), sc = $('jjm-scrim'); if (sc) sc.classList.add('open'); if (s) s.classList.add('open'); }
  // After a persisted write, addCrewBlock/clearCrewDay call the app's renderCrew(),
  // which we hook to refresh this panel — so changes show immediately and stay in
  // sync with the desktop grid. Defensive setTimeout covers the clear path.
  function afterWrite(p) { if (p && typeof p.then === 'function') p.then(function () { renderCrewPanel(); }); else setTimeout(renderCrewPanel, 60); }

  window.JJM = {
    // Home date selector
    homeStep: function (n) { var d = new Date(homeDay() + 'T12:00:00'); d.setDate(d.getDate() + n); loadHomeDay(dkey(d)); },
    homeGo: function (day) { if (day) loadHomeDay(day); },
    // Crew scheduler
    pickDay: function (k) { _schedDay = k; renderCrewPanel(); },
    openEmp: function (id) {
      var crew = crewList(), idx = -1;
      for (var i = 0; i < crew.length; i++) { if (crew[i].id === id) { idx = i; break; } }
      if (idx < 0) return;
      _cur = crew[idx];
      var av = $('jjm-av'); if (av) { av.textContent = initials(_cur.name); av.style.background = crewColor(_cur, idx); }
      var sd = new Date(schedDay() + 'T12:00:00');
      if ($('jjm-name')) $('jjm-name').textContent = _cur.name;
      if ($('jjm-date')) $('jjm-date').textContent = DOW_LONG[sd.getDay()] + ', ' + MON[sd.getMonth()] + ' ' + sd.getDate();
      if ($('jjm-hours')) $('jjm-hours').style.display = 'none';
      if ($('jjm-off')) $('jjm-off').style.display = 'none';
      openSheet();
    },
    toggleHours: function () { var el = $('jjm-hours'); el.style.display = el.style.display === 'flex' ? 'none' : 'flex'; $('jjm-off').style.display = 'none'; },
    toggleOff: function () { var el = $('jjm-off'); el.style.display = el.style.display === 'flex' ? 'none' : 'flex'; $('jjm-hours').style.display = 'none'; },
    setWork: function () { if (!_cur) return; clearCrewDay(_cur.id, schedDay()); this.closeSheet(); setTimeout(renderCrewPanel, 60); },
    setHours: function () { if (!_cur) return; var p = addCrewBlock(_cur.id, schedDay(), null, false, val('jjm-start'), val('jjm-end'), 'Working', ''); this.closeSheet(); afterWrite(p); },
    setOff: function () { if (!_cur) return; var p = addCrewBlock(_cur.id, schedDay(), null, true, null, null, val('jjm-reason'), val('jjm-note')); this.closeSheet(); afterWrite(p); },
    closeSheet: function () { var s = $('jjm-sheet'), sc = $('jjm-scrim'); if (s) s.classList.remove('open'); if (sc) sc.classList.remove('open'); }
  };

  /* ── init: gate to mobile, repoint Schedule tab, hook renders ────────────*/
  function init() {
    if (!isMobile()) return;
    injectStyles();

    // 1 · Schedule tab → employee schedule (was the jobs Calendar)
    var sched = document.querySelector('.mtab[data-mtab="calendar"]');
    if (sched) {
      sched.setAttribute('data-mtab', 'crew');
      sched.setAttribute('onclick', "go('crew')");
      var lbl = sched.querySelector('span');
      if (lbl) lbl.textContent = 'Schedule';
    }

    // 2 · (re)build panels whenever their view is shown or re-rendered
    if (typeof window.go === 'function') {
      var _go = window.go;
      window.go = function (name) {
        var r = _go.apply(this, arguments);
        if (name === 'dashboard') setTimeout(renderHome, 0);
        if (name === 'crew') setTimeout(renderCrewPanel, 0);
        return r;
      };
    }
    if (typeof window.renderDash === 'function') {
      var _rd = window.renderDash;
      window.renderDash = function () { var r = _rd.apply(this, arguments); setTimeout(renderHome, 0); return r; };
    }
    if (typeof window.renderCrew === 'function') {
      var _rc = window.renderCrew;
      window.renderCrew = function () { var r = _rc.apply(this, arguments); setTimeout(renderCrewPanel, 0); return r; };
    }

    if (view_isActive('view-dashboard')) renderHome();
    if (view_isActive('view-crew')) renderCrewPanel();
    window.JJMobile = { renderHome: renderHome, renderCrewPanel: renderCrewPanel };
  }
  function view_isActive(id) { var v = $(id); return v && v.classList.contains('active'); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
