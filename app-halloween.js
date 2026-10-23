/* ============================================================================
   Jeff's Junk — HALLOWEEN (Jake, 2026-10-23)  ·  window.JJHalloween
   The Great Hall dashboard and its fun touches, on from October 1 to October 31.
   On November 1 nothing here switches on and the app is exactly as normal.
   Looks live in app-halloween.css, all hung off html.jj-hw.

   What it does while it's on:
     - html.jj-hw            the picture, the glass, the gold (CSS)
     - countdown             "8 nights to Halloween" beside the dashboard date
     - BOO-KED               the booking stamp, in pumpkin ink
     - spooky booking sound  a short ghostly "woo" instead of the usual sound,
                             only when someone books (the one place stampSound plays)
     - Day cleared           once a day, when Live Jobs has nothing left to go
     - off switch            "Turn off Halloween look" on the dashboard, for this
                             browser and this year only (localStorage jjHalloween<year>)
   Loaded after app.js and jwg-stamp.js. No app.js changes: it wraps the two
   globals it needs (JWGStamp.stampPage / .booked and stampSound).
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'jjHalloween' + new Date().getFullYear();   // turned off this year doesn't mean next year
  var root = document.documentElement;

  function inSeason(d) { return d.getMonth() === 9; }          // October only
  function turnedOff() { try { return localStorage.getItem(KEY) === 'off'; } catch (e) { return false; } }
  function isOn() { return inSeason(new Date()) && !turnedOff(); }

  if (!inSeason(new Date())) return;                          // November 1 onwards: nothing at all

  /* ── the look ── */
  var font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&display=swap';
  document.head.appendChild(font);

  function apply() { root.classList.toggle('jj-hw', isOn()); }
  apply();

  /* ── countdown beside the date ── */
  function countdown() {
    var now = new Date();
    var nights = Math.round((new Date(now.getFullYear(), 9, 31) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
    return nights <= 0 ? 'Happy Halloween' : nights === 1 ? '1 night to Halloween' : nights + ' nights to Halloween';
  }

  /* ── the off switch, top right of the dashboard date strip ── */
  function mountToggle() {
    var strip = document.getElementById('dash-strip');
    var date = document.getElementById('dash-strip-date');
    if (!strip || !date) return;
    date.setAttribute('data-hw', countdown());
    var btn = document.getElementById('hw-toggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'hw-toggle';
      btn.className = 'hw-toggle';
      btn.addEventListener('click', function () {
        try { localStorage.setItem(KEY, isOn() ? 'off' : 'on'); } catch (e) {}
        apply(); label();
      });
      strip.appendChild(btn);
    }
    function label() { btn.textContent = isOn() ? 'Turn off Halloween look' : 'Turn on Halloween look'; }
    label();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountToggle);
  else mountToggle();

  /* ── BOO-KED: the booking stamp in pumpkin ink ── */
  if (window.JWGStamp) {
    var pageStamp = JWGStamp.stampPage, rowBooked = JWGStamp.booked;
    JWGStamp.stampPage = function (host, kind, opts) {
      if (kind === 'booked' && isOn()) { opts = opts || {}; opts.sub = 'BOO-KED'; opts.ink = 'pumpkin'; }
      return pageStamp(host, kind, opts);
    };
    JWGStamp.booked = function (opts) {
      if (isOn()) { opts = opts || {}; opts.sub = 'BOO-KED'; opts.ink = 'pumpkin'; }
      return rowBooked(opts);
    };
  }

  /* ── the spooky booking sound ──
     stampSound() plays only when a person books a job (app.js), so this never sounds
     on anything automatic. Same off switch as the normal sound (jjStampSound). */
  if (typeof window.stampSound === 'function') {
    var normalSound = window.stampSound;
    var ctx = null;
    window.stampSound = function () {
      if (!isOn()) return normalSound();
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
    if (!isOn()) return;
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

  window.JJHalloween = { isOn: isOn, dayCleared: dayCleared };
})();
