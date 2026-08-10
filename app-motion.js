/* ============================================================================
   Jeff's Junk — MOTION LAYER  (companion to motion.min.js, v541)

   All spring/stagger animation lives here, driven by the vendored motion.dev
   bundle (window.Motion). app.js calls into window.JJMotion at a handful of
   moments; every call site guards with `window.JJMotion &&` because a user on
   stale cached HTML loads new app.js without this file — they simply keep the
   pre-motion behavior (the CSS animations all still exist).

   If Motion is missing or the user prefers reduced motion, JJMotion is never
   created and the whole layer is inert.

   Two observers need no call sites at all:
   - stamps: any .jwg-stamp.ink inserted anywhere springs in (replaces the CSS
     jwg-stamp-land animation by stripping .ink before first paint)
   - modals: any .modal-overlay gaining .open pops its .modal card
     (game-style bounce; .fullpage overlays get a soft rise instead)

   GOTCHA carried over from animateView: a lingering inline transform makes an
   element a containing block and re-anchors position:fixed descendants — every
   animation here clears its inline transform when it settles.
   ========================================================================== */
(function () {
  'use strict';
  if (!window.Motion || !window.Motion.animate) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var animate = Motion.animate;
  var J = {};

  function clearTransform(el) {
    return function () { el.style.transform = ''; };
  }

  /* ── stamps: spring in place of the CSS .ink animation ─────────────────── */
  function springStamp(s) {
    s.classList.remove('ink');                    // cancel the CSS animation before first paint
    var page = s.classList.contains('page');
    animate(s,
      page ? { scale: [3.4, 1], rotate: [-20, -8], opacity: [0, 0.9] }
           : { scale: [2.6, 1], rotate: [-18, -4], opacity: [0, 1] },
      { type: 'spring', stiffness: page ? 500 : 600, damping: page ? 26 : 24 }
    ).finished.then(function () { s.style.transform = ''; s.style.opacity = ''; });
  }
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes, function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches('.jwg-stamp.ink')) springStamp(n);
        else if (n.querySelectorAll) Array.prototype.forEach.call(n.querySelectorAll('.jwg-stamp.ink'), springStamp);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  /* ── modals: game-style pop when any .modal-overlay opens ──────────────── */
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      var o = m.target;
      if (!o.classList || !o.classList.contains('modal-overlay')) return;
      var isOpen = o.classList.contains('open');
      if (isOpen === o._jjWasOpen) return;
      o._jjWasOpen = isOpen;
      if (!isOpen) return;
      var card = o.querySelector(':scope > .modal');
      if (!card) return;
      var anim = o.classList.contains('fullpage')
        ? animate(card, { y: [14, 0], opacity: [0, 1] }, { duration: 0.28, ease: [0.22, 1, 0.36, 1] })
        : animate(card, { scale: [0.85, 1], y: [16, 0], rotate: [-1.2, 0] }, { type: 'spring', stiffness: 420, damping: 19 });
      anim.finished.then(clearTransform(card));
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: true });

  /* ── page open: springy cascade (replaces animateView's linear slide) ──── */
  J.viewCascade = function (viewEl) {
    Array.prototype.forEach.call(viewEl.children, function (c, i) {
      if (c.hasAttribute('data-noanim')) return;
      c.style.opacity = '0';
      animate(c, { opacity: [0, 1], y: [18, 0] },
        { type: 'spring', stiffness: 380, damping: 27, delay: i * 0.05 }
      ).finished.then(function () { c.style.transform = ''; c.style.opacity = ''; });
    });
  };

  /* ── Needs You: buzz rows that weren't there on the previous render ────── */
  var nykSeen = null;                              // null = first render seeds silently
  J.buzzNew = function (container) {
    var rows = container.querySelectorAll('[data-nyk]');
    if (nykSeen === null) {
      nykSeen = {};
      Array.prototype.forEach.call(rows, function (r) { nykSeen[r.getAttribute('data-nyk')] = 1; });
      return;
    }
    Array.prototype.forEach.call(rows, function (r) {
      var k = r.getAttribute('data-nyk');
      if (nykSeen[k]) return;
      nykSeen[k] = 1;
      animate(r, { x: [0, -7, 6, -4, 2, 0] }, { duration: 0.45, ease: 'easeOut' })
        .finished.then(clearTransform(r));
    });
  };

  /* ── stat cards: changed numbers drop in with a pulse ──────────────────── */
  J.snapStats = function (container) {
    if (!container) return null;
    return Array.prototype.map.call(container.querySelectorAll('.stat-value'), function (v) { return v.textContent; });
  };
  J.tickStats = function (container, olds) {
    if (!container || !olds) return;
    Array.prototype.forEach.call(container.querySelectorAll('.stat-value'), function (v, i) {
      if (olds[i] === undefined || olds[i] === v.textContent) return;
      animate(v, { y: [-16, 0], opacity: [0, 1], scale: [1.1, 1] },
        { type: 'spring', stiffness: 500, damping: 28 }
      ).finished.then(function () { v.style.transform = ''; v.style.opacity = ''; });
    });
  };

  /* ── a completed row slides away; restore if no re-render removes it ───── */
  J.rowExit = function (row) {
    if (!row) return;
    var h = row.offsetHeight;
    animate(row, { x: 60, opacity: 0 }, { duration: 0.25, ease: 'easeIn' }).finished.then(function () {
      animate(row, { height: [h + 'px', '0px'], marginBottom: 0 }, { duration: 0.22, ease: 'easeOut' });
    });
    setTimeout(function () {                       // patch failed / list never re-rendered: undo
      if (row.isConnected) row.removeAttribute('style');
    }, 2000);
  };

  /* ── toast entrance ────────────────────────────────────────────────────── */
  J.toastPop = function (t) {
    animate(t, { y: [18, 0], scale: [0.92, 1] }, { type: 'spring', stiffness: 520, damping: 30 })
      .finished.then(clearTransform(t));
  };

  /* ── forced-update overlay card entrance ───────────────────────────────── */
  J.bannerIn = function (card) {
    animate(card, { y: [-46, 0], scale: [0.94, 1], opacity: [0, 1] },
      { type: 'spring', stiffness: 360, damping: 20 }
    ).finished.then(clearTransform(card));
  };

  /* ── tactile buttons: compress on press, spring back on release ────────── */
  var pressed = null;
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('button, .btn, .djj-btn');
    if (!b || b.disabled) return;
    pressed = b;
    animate(b, { scale: 0.95 }, { duration: 0.08 });
  }, { passive: true });
  function release() {
    if (!pressed) return;
    var b = pressed; pressed = null;
    animate(b, { scale: 1 }, { type: 'spring', stiffness: 520, damping: 26 })
      .finished.then(clearTransform(b));
  }
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });

  window.JJMotion = J;
})();
