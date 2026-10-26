/* ============================================================================
   Jeff's Junk — HALLOWEEN fun touches (Jake, 2026-10-23; simplified 2026-10-26)
   window.JJHalloween · on from October 1 to October 31, nothing at all from
   November 1. The dashboard keeps its normal look: the Great Hall theme (picture
   behind glass cards) was removed on Jake's word — too big a change for a work
   screen, and its blur made the app laggy. Styling in app-halloween.css, all hung
   off html.jj-hw.

   What it does in October:
     - countdown             "5 nights to Halloween" beside the dashboard date
     - BOO-KED               the booking stamp, in pumpkin ink
     - spooky booking sound  a short ghostly "woo" instead of the usual sound, only
                             when someone books (the one place stampSound plays);
                             the usual sound switch (jjStampSound) still silences it
     - ghost                 on "All caught up" and an empty Live Jobs list (CSS)
     - pumpkin help button   (CSS)
     - Day cleared           once a day, when Live Jobs has nothing left to go
   Loaded after app.js and jwg-stamp.js. No app.js changes: it wraps the two
   globals it needs (JWGStamp.stampPage / .booked and stampSound).
   ========================================================================== */
(function () {
  'use strict';

  if (new Date().getMonth() !== 9) return;                    // October only; November 1 onwards: nothing

  document.documentElement.classList.add('jj-hw');
  var font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@700&display=swap';
  document.head.appendChild(font);

  /* ── countdown beside the dashboard date (shown by CSS from data-hw) ── */
  function countdown() {
    var now = new Date();
    var nights = Math.round((new Date(now.getFullYear(), 9, 31) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
    return nights <= 0 ? 'Happy Halloween' : nights === 1 ? '1 night to Halloween' : nights + ' nights to Halloween';
  }
  function markDate() {
    var date = document.getElementById('dash-strip-date');
    if (date) date.setAttribute('data-hw', countdown());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markDate);
  else markDate();

  /* ── BOO-KED: the booking stamp in pumpkin ink ── */
  if (window.JWGStamp) {
    var pageStamp = JWGStamp.stampPage, rowBooked = JWGStamp.booked;
    JWGStamp.stampPage = function (host, kind, opts) {
      if (kind === 'booked') { opts = opts || {}; opts.sub = 'BOO-KED'; opts.ink = 'pumpkin'; }
      return pageStamp(host, kind, opts);
    };
    JWGStamp.booked = function (opts) {
      opts = opts || {}; opts.sub = 'BOO-KED'; opts.ink = 'pumpkin';
      return rowBooked(opts);
    };
  }

  /* ── the spooky booking sound ──
     stampSound() plays only when a person books a job (app.js), so this never sounds
     on anything automatic. Same off switch as the normal sound (jjStampSound). */
  if (typeof window.stampSound === 'function') {
    var ctx = null;
    window.stampSound = function () {
      try { if (localStorage.getItem('jjStampSound') === 'off') return; } catch (e) {}
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        var t = ctx.currentTime, osc = ctx.createOscillator(), vib = ctx.createOscillator(),
            vibAmt = ctx.createGain(), gain = ctx.createGain(), lp = ctx.createBiquadFilter();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(560, t + 0.45);
        osc.frequency.exponentialRampToValueAtTime(260, t + 1.15);
        vib.frequency.value = 6.5; vibAmt.gain.value = 14;       // the wobble that makes it a ghost
        vib.connect(vibAmt); vibAmt.connect(osc.frequency);
        lp.type = 'lowpass'; lp.frequency.value = 1400;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.22, t + 0.18);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
        osc.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
        osc.start(t); vib.start(t); osc.stop(t + 1.3); vib.stop(t + 1.3);
      } catch (e) { /* decorative, like the normal sound's .catch: stay silent */ }
    };
  }

  /* ── Day cleared: once a day, when Live Jobs says nothing is left to go ──
     Reads the Live Jobs counters (#lj-stats) as they are drawn; nothing else changes. */
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function dayCleared() {
    try { if (localStorage.getItem('jjHwCleared') === todayKey()) return; localStorage.setItem('jjHwCleared', todayKey()); } catch (e) {}
    var el = document.createElement('div');
    el.className = 'hw-cleared';
    el.setAttribute('role', 'status');
    var leaves = [[8, '#d9772b', 0], [27, '#b8441f', 1.6], [49, '#e9a23b', .8], [71, '#8c3a1a', 2.6], [90, '#d9772b', 3.4]];
    el.innerHTML = leaves.map(function (l) {
      return '<i style="left:' + l[0] + '%;background:' + l[1] + ';animation-delay:' + l[2] + 's"></i>';
    }).join('') + '<b>Day cleared.</b><span>Nothing left to haunt you.</span>';
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
      if (total > 0 && toGo === 0) dayCleared();
    }).observe(stats, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchLiveJobs);
  else watchLiveJobs();

  window.JJHalloween = { dayCleared: dayCleared };
})();
