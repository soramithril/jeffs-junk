/* ============================================================================
   JEFF'S JUNK — iOS MOBILE LAYER · behaviour  (mobile-ios.js)
   ----------------------------------------------------------------------------
   Phones only. Everything is gated behind isMobile() (≤900px — your existing
   mobile breakpoint), so on desktop NONE of this runs and the desktop app is
   completely untouched.

   What it does on a phone:
     1. Repoints the bottom-bar "Schedule" tab from the jobs Calendar to the
        EMPLOYEE schedule (go('crew')).
     2. Injects a mobile Home panel at the top of the dashboard showing
        TODAY'S QUOTES (the main thing) + bin drop/pickup COUNTS, plus a
        push-style "new quote" banner — all bound to your live `jobs` data.

   It only ADDS a panel and re-points one tab. It does not remove or rewrite any
   of your existing markup, so it can't break a page. Remove the <script> line
   to revert completely.

   INSTALL: add ONE line in index.html, right before </body>, after app.js:
       <script src="mobile-ios.js?v=1"></script>

   Reads these globals you already expose: jobs, todayStr(), jobSchedDate(),
   go(), openDetail(), mOpenCreate(). If a name differs, adjust below.
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

  /* ── live data → today's quotes & bin counts ─────────────────────────────*/
  function todaysQuotes() {
    if (typeof jobs === 'undefined') return [];
    var today = todayStr();
    return jobs.filter(function (j) {
      return j.service === 'Junk Quote' && j.status !== 'Cancelled' && jobSchedDate(j) === today;
    });
  }
  function binCounts() {
    var c = { drops: 0, picks: 0 };
    if (typeof jobs === 'undefined') return c;
    var today = todayStr();
    jobs.forEach(function (j) {
      if (j.service !== 'Bin Rental' || j.status === 'Cancelled') return;
      if (j.binDropoff === today) c.drops++;
      if (j.binPickup === today) c.picks++;
    });
    return c;
  }
  // Map a quote to a status pill. Adjust these rules to your real status values.
  function quoteStatus(j) {
    if (j.emailSent || /sent/i.test(j.status || ''))             return { l: 'Sent',     c: '#15803d', b: '#dff5e6' };
    if (/accept|won|booked|convert/i.test(j.status || ''))        return { l: 'Accepted', c: '#15803d', b: '#dff5e6' };
    if (j.price === '' || j.price == null)                        return { l: 'New',      c: '#1a56db', b: '#e8f0fe' };
    return { l: 'Pending', c: '#c2410c', b: '#fef3e0' };
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
  function statTile(label, n, stroke, bg, up) {
    var icon = up
      ? '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'
      : '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>';
    return '<div style="flex:1;border-radius:16px;padding:13px 15px;background:rgba(255,255,255,.72);box-shadow:0 8px 20px rgba(18,80,50,.07),inset 0 1px 0 rgba(255,255,255,.9);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)">' +
      '<div style="display:flex;align-items:center;gap:7px"><span style="width:22px;height:22px;border-radius:7px;background:' + bg + ';display:flex;align-items:center;justify-content:center">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + stroke + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg></span>' +
      '<span style="font:600 11px -apple-system;color:rgba(38,50,42,.55);text-transform:uppercase;letter-spacing:.4px">' + label + '</span></div>' +
      '<div style="font-family:\'Bebas Neue\',Impact,sans-serif;font-size:34px;line-height:.9;color:#14241b;margin-top:7px">' + n +
      ' <span style="font-family:-apple-system;font-size:12px;font-weight:600;color:rgba(38,50,42,.45)">today</span></div></div>';
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
    var qs = todaysQuotes(), bc = binCounts();
    var newQuote = qs.find(function (j) { return quoteStatus(j).l === 'New'; });

    var banner = newQuote
      ? '<div onclick="openDetail(\'' + newQuote.id + '\')" style="cursor:pointer;display:flex;align-items:center;gap:11px;margin:0 0 12px;background:rgba(255,255,255,.78);border:.5px solid rgba(255,255,255,.7);border-radius:16px;padding:11px 13px;box-shadow:0 8px 22px rgba(18,80,50,.1),inset 0 1px 0 rgba(255,255,255,.9);-webkit-backdrop-filter:blur(16px) saturate(1.6);backdrop-filter:blur(16px) saturate(1.6)">' +
        '<div style="flex:none;width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;display:flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',Impact,sans-serif;font-size:19px">J</div>' +
        '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px"><span style="font:700 10px -apple-system;letter-spacing:.4px;color:rgba(38,50,42,.5);text-transform:uppercase">Jeff\'s Junk</span><span style="font:500 10px -apple-system;color:rgba(38,50,42,.4)">· now</span></div>' +
        '<div style="font:600 13.5px -apple-system;color:#14241b;margin-top:1px">New quote request</div>' +
        '<div style="font:400 12px -apple-system;color:rgba(38,50,42,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(newQuote.name || 'Customer') + ' — tap to quote</div></div></div>'
      : '';

    var rows = qs.length
      ? qs.map(function (j, i) { return quoteRow(j, i === 0); }).join('')
      : '<div style="padding:18px 16px;text-align:center;font:400 13px -apple-system;color:rgba(38,50,42,.5)">No quotes scheduled today</div>';

    host.innerHTML =
      banner +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 4px 8px"><span style="font:600 13px -apple-system;color:rgba(38,50,42,.55);text-transform:uppercase;letter-spacing:.3px">Today\'s quotes · ' + qs.length + '</span><span onclick="mOpenCreate()" style="font:600 12.5px -apple-system;color:#16a34a;cursor:pointer">+ New</span></div>' +
      '<div style="border-radius:16px;overflow:hidden;background:rgba(255,255,255,.72);box-shadow:0 10px 26px rgba(18,80,50,.08),inset 0 1px 0 rgba(255,255,255,.9);-webkit-backdrop-filter:blur(16px) saturate(1.7);backdrop-filter:blur(16px) saturate(1.7)">' + rows + '</div>' +
      '<div style="display:flex;gap:10px;margin-top:14px;margin-bottom:6px">' +
        statTile('Drops', bc.drops, '#0891b2', 'rgba(8,145,178,.12)', false) +
        statTile('Pickups', bc.picks, '#16a34a', 'rgba(22,163,74,.12)', true) +
      '</div>';
    host.style.cssText = 'margin-bottom:8px';
  }

  /* ── init: gate to mobile, repoint Schedule tab, hook renders ────────────*/
  function init() {
    if (!isMobile()) return;

    // 0 · DE-OVERLAP: flag the body so mobile-ios.css hides the app's own
    //     dashboard content and shows ONLY the iOS panel (no combining).
    document.body.classList.add('jj-ios');

    // 1 · Schedule tab → employee schedule (was the jobs Calendar)
    var sched = document.querySelector('.mtab[data-mtab="calendar"]');
    if (sched) {
      sched.setAttribute('data-mtab', 'crew');
      sched.setAttribute('onclick', "go('crew')");
      var lbl = sched.querySelector('span');
      if (lbl) lbl.textContent = 'Schedule';
    }

    // 2 · (re)build the Home panel whenever the dashboard is shown or re-rendered
    if (typeof window.go === 'function') {
      var _go = window.go;
      window.go = function (name) {
        var r = _go.apply(this, arguments);
        if (name === 'dashboard') setTimeout(renderHome, 0);
        return r;
      };
    }
    if (typeof window.renderDash === 'function') {
      var _rd = window.renderDash;
      window.renderDash = function () {
        var r = _rd.apply(this, arguments);
        setTimeout(renderHome, 0);
        return r;
      };
    }

    if (view_isActive('view-dashboard')) renderHome();
    window.JJMobile = { renderHome: renderHome };
  }
  function view_isActive(id) { var v = $(id); return v && v.classList.contains('active'); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
