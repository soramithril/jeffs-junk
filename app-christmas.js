/* ============================================================================
   Jeff's Junk — CHRISTMAS fun touches (Jake, 2026-11-04)
   window.JJChristmas · on from November 1 to Boxing Day (December 26), nothing at
   all from December 27. The same idea as October's Halloween touches
   (app-halloween.js): the dashboard keeps its normal look, with small additions on
   top. No picture behind the cards and no blur (that made Halloween laggy).
   Styling in app-christmas.css, all hung off html.jj-xmas.

   What it does:
     - lights + countdown    twinkling lights along the top of the dashboard, and
                             "51 sleeps to Christmas" beside the date (CSS)
     - HO HO HO              the booking stamp's word, in holly red
     - sleigh bells          a short jingle instead of the usual booking sound, only
                             when someone books (the one place stampSound plays); the
                             usual sound switch (jjStampSound) still silences it
     - snowman               on "All caught up" and an empty Live Jobs list (CSS)
     - Santa hat             on the help button (CSS)
     - Sleigh's empty        once a day, when Live Jobs has nothing left to go
   Loaded after app.js and jwg-stamp.js. No app.js changes: it wraps the two
   globals it needs (JWGStamp.stampPage / .booked and stampSound).
   ========================================================================== */
(function () {
  'use strict';

  var now = new Date();
  if (!(now.getMonth() === 10 || (now.getMonth() === 11 && now.getDate() <= 26))) return;   // Nov 1 to Boxing Day

  var root = document.documentElement;
  root.classList.add('jj-xmas');

  /* ── the countdown, beside the date on the old dashboard and on the new layouts ──
     A CSS variable, because both dates are rewritten by textContent on every refresh. */
  function countdown() {
    var d = new Date(), today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var sleeps = Math.round((new Date(d.getFullYear(), 11, 25) - today) / 864e5);
    return sleeps < 0 ? 'Happy Boxing Day' : sleeps === 0 ? 'Merry Christmas' : sleeps === 1 ? '1 sleep to Christmas' : sleeps + ' sleeps to Christmas';
  }
  root.style.setProperty('--xm-sleeps', JSON.stringify(countdown()));

  /* ── HO HO HO: the booking stamp in holly ink ── */
  if (window.JWGStamp) {
    var pageStamp = JWGStamp.stampPage, rowBooked = JWGStamp.booked;
    JWGStamp.stampPage = function (host, kind, opts) {
      if (kind === 'booked') { opts = opts || {}; opts.sub = 'HO HO HO'; opts.ink = 'holly'; }
      return pageStamp(host, kind, opts);
    };
    JWGStamp.booked = function (opts) {
      opts = opts || {}; opts.sub = 'HO HO HO'; opts.ink = 'holly';
      return rowBooked(opts);
    };
  }

  /* ── sleigh bells for a booking ──
     stampSound() plays only when a person books a job (app.js), so this never sounds
     on anything automatic. Same off switch as the normal sound (jjStampSound). */
  if (typeof window.stampSound === 'function') {
    var ctx = null;
    window.stampSound = function () {
      try { if (localStorage.getItem('jjStampSound') === 'off') return; } catch (e) {}
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        var t0 = ctx.currentTime;
        for (var i = 0; i < 7; i++) {          // seven quick shakes of three little bells
          [2637, 3136, 3951].forEach(function (f, k) {
            var o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * 0.09 + k * 0.012;
            o.type = 'triangle';
            o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.02);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.07, t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
            o.connect(g); g.connect(ctx.destination);
            o.start(t); o.stop(t + 0.25);
          });
        }
      } catch (e) { /* decorative, like the normal sound's .catch: stay silent */ }
    };
  }

  /* ── Sleigh's empty: once a day, when Live Jobs says nothing is left to go ──
     Reads the Live Jobs counters (#lj-stats) as they are drawn; nothing else changes. */
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function sleighEmpty() {
    try { if (localStorage.getItem('jjXmasCleared') === todayKey()) return; localStorage.setItem('jjXmasCleared', todayKey()); } catch (e) {}
    var el = document.createElement('div');
    el.className = 'xm-cleared';
    el.setAttribute('role', 'status');
    var flakes = [[8, 0], [24, 1.4], [41, .6], [58, 2.2], [74, 1], [90, 2.8]];
    el.innerHTML = flakes.map(function (f) {
      return '<i style="left:' + f[0] + '%;animation-delay:' + f[1] + 's"></i>';
    }).join('') + '<b>Sleigh’s empty.</b><span>Every stop is done for today.</span>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 600); }, 6000);
  }
  function watchLiveJobs() {
    var stats = document.getElementById('lj-stats');
    if (!stats) return;
    new MutationObserver(function () {
      var nums = stats.querySelectorAll('.lj-stat-num');
      if (nums.length < 4) return;
      var total = (+nums[0].textContent || 0) + (+nums[1].textContent || 0), toGo = +nums[3].textContent;
      if (total > 0 && toGo === 0) sleighEmpty();
    }).observe(stats, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchLiveJobs);
  else watchLiveJobs();

  window.JJChristmas = { sleighEmpty: sleighEmpty, countdown: countdown };
})();
