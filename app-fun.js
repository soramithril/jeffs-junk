/* ============================================================================
   Jeff's Junk — FUN LAYER (v706)  ·  window.JJFun
   Small rewards on the buttons people press all day, sized by how often they're
   pressed (Jake, 2026-10-23, from the button playground mockup):
     pickHop        driver / crew picked      ~30 a day  -> tiny, under 1/3 s
     dropScene      bin number on drop day    ~9 a day   -> truck tips the bin off
     pickupScene    bin marked picked up      ~9 a day   -> truck winches it on
     confirmStamp   customer confirmed        ~6 a day   -> CONFIRMED stamp lands
     letterOnReturn email sent                ~12 a day  -> wax-sealed letter flies off
     convoy         tomorrow fully dispatched once a day -> trucks roll across
   Nothing here blocks a click (every layer is pointer-events:none) and nothing makes
   a sound. Built on the same motion.dev bundle as app-motion.js — one animation
   library. Inert when Motion is missing or the person prefers reduced motion, so
   every call site guards with `window.JJFun &&`.
   ========================================================================== */
(function () {
  'use strict';
  if (!window.Motion || !window.Motion.animate) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var animate = Motion.animate;
  var F = {};

  function run(el, kf, opt) { return animate(el, kf, opt).finished; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function layer(cls, html) {
    var el = document.createElement('div');
    el.className = 'jjf ' + cls;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }
  function fadeAway(el, after) {
    return wait(after).then(function () { return run(el, { opacity: [1, 0] }, { duration: 0.3 }); })
      .then(function () { el.remove(); });
  }

  var TRUCK = '<svg viewBox="0 0 46 28" width="46" height="28"><rect x="1" y="7" width="27" height="14" rx="2" fill="currentColor" opacity=".85"/><path d="M28 11h8l6 6v4H28z" fill="currentColor"/><rect x="31" y="12.5" width="5" height="4" rx="1" fill="#fff"/><circle cx="9" cy="23" r="4" fill="#1a211e"/><circle cx="35" cy="23" r="4" fill="#1a211e"/></svg>';
  var RIG = '<svg viewBox="0 0 110 50" width="110" height="50"><rect x="2" y="28" width="78" height="6" rx="1.5" fill="#1a211e" opacity=".75"/><path d="M78 13h17l11 12v14H78z" fill="#16a34a"/><rect x="84" y="17" width="12" height="8" rx="1.5" fill="#fff"/><circle cx="18" cy="41" r="7" fill="#1a211e"/><circle cx="60" cy="41" r="7" fill="#1a211e"/><circle cx="94" cy="41" r="7" fill="#1a211e"/><circle cx="18" cy="41" r="2.5" fill="#fff"/><circle cx="60" cy="41" r="2.5" fill="#fff"/><circle cx="94" cy="41" r="2.5" fill="#fff"/></svg>';
  function binSvg(num) {
    var t = String(num || '').replace(/[<>&"]/g, '');
    return '<svg viewBox="0 0 66 26" width="66" height="26"><path d="M1 3h64l-5 22H6z" fill="#15803d"/><path d="M1 3.5h64" stroke="#0f5f2e" stroke-width="3"/>'
      + '<text x="33" y="19" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="12" letter-spacing=".5" fill="#ecfdf5">' + t + '</text></svg>';
  }
  var LETTER = '<svg viewBox="0 0 70 48" width="100%" height="100%"><rect x="1.5" y="1.5" width="67" height="45" rx="4" fill="#fbf6e9" stroke="#c9b98f" stroke-width="1.5"/><path d="M2 3l33 24L68 3" fill="none" stroke="#c9b98f" stroke-width="1.5"/><circle cx="35" cy="27" r="8.5" fill="#15803d"/><circle cx="35" cy="27" r="6" fill="none" stroke="#86efac" stroke-width="1"/><text x="35" y="30.3" text-anchor="middle" font-family="Georgia,serif" font-size="8.5" font-weight="700" fill="#ecfdf5">JJ</text></svg>';

  /* ── driver / crew picked: the avatar hops, the tick pops ───────────────── */
  F.pickHop = function (tile) {
    var av = tile.firstElementChild, tick = tile.lastElementChild;
    if (av) run(av, { y: [0, -12, 0], scale: [1, 1.18, 1] }, { duration: 0.3, ease: 'easeOut' })
      .then(function () { av.style.transform = ''; });
    if (tick && tick !== av) run(tick, { scale: [0, 1.4, 1], opacity: [0, 1, 1] }, { duration: 0.28 })
      .then(function () { tick.style.transform = ''; tick.style.opacity = ''; });
  };

  /* ── the little road scene, bottom centre of the screen ─────────────────── */
  var W = 300;
  function scene(num) {
    return layer('jjf-stage',
      '<div class="jjf-ground"></div>'
      + '<div class="jjf-rig"><span class="jjf-rig-truck">' + RIG + '</span><span class="jjf-bed-bin">' + binSvg(num) + '</span></div>'
      + '<div class="jjf-g-bin">' + binSvg(num) + '</div><span class="jjf-tag"></span>');
  }
  function parts(st) {
    return { t: st.querySelector('.jjf-rig'), bb: st.querySelector('.jjf-bed-bin'), gb: st.querySelector('.jjf-g-bin'), tag: st.querySelector('.jjf-tag') };
  }
  function tagIn(tag, text) {
    tag.textContent = text;
    return run(tag, { opacity: [0, 1], scale: [1.8, 1], rotate: [-8, -8] }, { duration: 0.24, ease: [0.34, 1.56, 0.64, 1] });
  }

  // Bin number assigned on its drop day = the drop. Truck drives in, tips the bin off.
  F.dropScene = function (num) {
    var st = scene(num), p = parts(st), x = 150;
    p.gb.style.opacity = '0';
    run(p.t, { x: [-130, x] }, { duration: 0.38, ease: [0.2, 0.8, 0.3, 1] })
      .then(function () { return run(p.bb, { rotate: [0, -16], x: [0, -6] }, { duration: 0.15 }); })
      .then(function () {
        p.bb.style.opacity = '0'; p.gb.style.opacity = '1';
        return run(p.gb, { x: [x + 6, x - 74], y: [-22, 0], rotate: [-16, 0] }, { duration: 0.28, ease: [0.34, 1.4, 0.64, 1] });
      })
      .then(function () { tagIn(p.tag, 'DROPPED'); return run(p.t, { x: [x, W + 20] }, { duration: 0.3, ease: [0.5, 0, 0.8, 0.4] }); })
      .then(function () { return fadeAway(st, 700); });
  };

  // Bin marked picked up: truck backs up to it, winches it on, drives back to the yard.
  F.pickupScene = function (num) {
    var st = scene(num), p = parts(st), bx = 90, x = bx + 72;
    p.bb.style.opacity = '0';
    p.t.style.transform = 'translateX(' + (W + 20) + 'px)';
    p.gb.style.transform = 'translateX(' + bx + 'px)';
    run(p.t, { x: [W + 20, x] }, { duration: 0.42, ease: [0.2, 0.8, 0.3, 1] })
      .then(function () { return run(p.gb, { x: [bx, bx + 40, x + 6], y: [0, -12, -22], rotate: [0, -14, 0] }, { duration: 0.42 }); })
      .then(function () {
        p.gb.style.opacity = '0'; p.bb.style.opacity = '1';
        return run(p.t, { x: [x, W + 20] }, { duration: 0.32, ease: [0.5, 0, 0.8, 0.4] });
      })
      .then(function () { return tagIn(p.tag, 'BACK IN THE YARD'); })
      .then(function () { return fadeAway(st, 700); });
  };

  /* ── customer confirmed: the work-order CONFIRMED stamp lands where you clicked ── */
  // app-motion.js springs any new .jwg-stamp.ink, so this only places it and clears it.
  F.confirmStamp = function (rect) {
    if (!window.JWGStamp || !rect) return;
    var w = layer('jjf-stamp', JWGStamp.confirmed({ size: 'sm' }));
    w.style.left = (rect.left + rect.width / 2) + 'px';
    w.style.top = (rect.top + rect.height / 2) + 'px';
    fadeAway(w, 1100);
  };

  /* ── email sent: a wax-sealed letter swoops up big and flies off ────────── */
  F.letter = function () {
    var el = layer('jjf-letter', LETTER), vw = window.innerWidth, vh = window.innerHeight;
    run(el, {
      x: [0, 0, -10, 8, 20, vw * 0.7],
      y: [vh * 0.3, 0, -12, -20, -36, -vh * 0.75],
      scale: [0.1, 1, 1.02, 1, 0.95, 0.35],
      rotate: [0, -6, 5, -4, 4, 30],
      opacity: [0, 1, 1, 1, 1, 0]
    }, { duration: 1.5, times: [0, 0.32, 0.42, 0.52, 0.62, 1], ease: 'easeInOut' })
      .then(function () { el.remove(); });
  };
  // Send opens the email in the mail program, which jumps in front of the dashboard, so
  // the letter waits until the person is back. If the mail opened without taking focus,
  // it plays straight away.
  F.letterOnReturn = function () {
    setTimeout(function () {
      if (!document.hidden && document.hasFocus()) { F.letter(); return; }
      function back() {
        if (document.hidden || !document.hasFocus()) return;
        window.removeEventListener('focus', back);
        document.removeEventListener('visibilitychange', back);
        setTimeout(F.letter, 250);
      }
      window.addEventListener('focus', back);
      document.addEventListener('visibilitychange', back);
    }, 600);
  };

  /* ── tomorrow fully dispatched: everyone's trucks roll across once ──────── */
  F.convoy = function (text, colors) {
    var c = layer('jjf-convoy', '<div class="jjf-cv-text"></div>');
    c.firstChild.textContent = text;
    colors.forEach(function (col, i) {
      var t = document.createElement('span');
      t.className = 'jjf-cv-truck';
      t.style.color = col;
      t.innerHTML = TRUCK;
      c.appendChild(t);
      animate(t, { x: [-120, window.innerWidth + 40] }, { duration: 1.7, delay: i * 0.15, ease: [0.45, 0, 0.55, 1] });
    });
    run(c.firstChild, { opacity: [0, 1, 1, 0], y: [10, 0, 0, 0] }, { duration: 2.3, times: [0, 0.15, 0.8, 1] })
      .then(function () { c.remove(); });
  };

  window.JJFun = F;
})();
