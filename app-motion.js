/* ============================================================================
   Jeff's Junk — MOTION LAYER  (companion to motion.min.js, v541; +countUp,
   glide, snapRows/flipRows, greetSweep in v546)

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

  /* ── numbers: count up with commas, small pulse on landing (v546) ──────── */
  J.countUp = function (el, target, dur) {
    if (!el) return;
    if (!target) { el.textContent = '0'; return; }   // counting to zero is just a pulse on nothing
    animate(0, target, {
      duration: dur || 1.1, ease: [0.16, 1, 0.3, 1],
      onUpdate: function (v) { el.textContent = Math.round(v).toLocaleString('en-US'); }
    }).finished.then(function () {
      el.textContent = target.toLocaleString('en-US');
      animate(el, { scale: [1.08, 1] }, { type: 'spring', stiffness: 480, damping: 24 })
        .finished.then(clearTransform(el));
    });
  };

  /* ── sections: glide open/shut instead of the display snap (v546) ──────── */
  function glideClear(body) {
    body.style.height = ''; body.style.overflow = ''; body.style.opacity = '';
    body.style.paddingTop = ''; body.style.paddingBottom = '';
  }
  J.glide = function (body, opening, displayVal) {
    var n = body._jjG = (body._jjG || 0) + 1;       // a newer toggle owns the end state
    if (opening) {
      body.style.display = displayVal || '';
      // Vertical padding animates with the height — a padded box squeezed to
      // height:0 otherwise keeps its padding as a visible stub (border-box).
      var cs = getComputedStyle(body), pt = cs.paddingTop, pb = cs.paddingBottom;
      var h = body.scrollHeight;
      body.style.overflow = 'hidden';
      animate(body,
        { height: ['0px', h + 'px'], paddingTop: ['0px', pt], paddingBottom: ['0px', pb], opacity: [0, 1] },
        { duration: 0.4, ease: [0.16, 1, 0.3, 1] })
        .finished.then(function () {
          if (body._jjG !== n) return;
          glideClear(body);
        });
    } else {
      var cs2 = getComputedStyle(body), pt2 = cs2.paddingTop, pb2 = cs2.paddingBottom;
      var h2 = body.scrollHeight;
      body.style.overflow = 'hidden';
      animate(body,
        { height: [h2 + 'px', '0px'], paddingTop: [pt2, '0px'], paddingBottom: [pb2, '0px'], opacity: [1, 0] },
        { duration: 0.28, ease: [0.4, 0, 1, 1] })
        .finished.then(function () {
          if (body._jjG !== n) return;
          body.style.display = 'none';
          glideClear(body);
        });
    }
  };

  /* ── list re-render: surviving rows glide to their new spot (v546) ─────── */
  J.snapRows = function (container) {
    if (!container) return null;
    var m = {};
    Array.prototype.forEach.call(container.querySelectorAll('[data-nyk]'), function (r) {
      m[r.getAttribute('data-nyk')] = r.getBoundingClientRect().top;
    });
    return m;
  };
  J.flipRows = function (container, snap) {
    if (!container || !snap) return;
    Array.prototype.forEach.call(container.querySelectorAll('[data-nyk]'), function (r) {
      var old = snap[r.getAttribute('data-nyk')];
      if (old === undefined) return;                 // brand-new row — that's buzzNew's moment
      var dy = old - r.getBoundingClientRect().top;
      if (!dy) return;
      animate(r, { y: [dy, 0] }, { type: 'spring', stiffness: 350, damping: 30 })
        .finished.then(clearTransform(r));
    });
  };

  /* ── sign-in: greeting sweeps in word by word, blur to sharp (v546) ────── */
  J.greetSweep = function (el) {
    if (!el) return;
    var words = el.textContent.split(' ');
    el._jjSweeping = true;                           // renderGreeting skips the headline while this is set
    el.textContent = '';
    var spans = words.map(function (w, i) {
      var s = document.createElement('span');
      // the joiner below is a literal NBSP — a normal trailing space collapses inside inline-block
      s.textContent = w + (i < words.length - 1 ? ' ' : '');
      s.style.display = 'inline-block';
      s.style.opacity = '0';
      el.appendChild(s);
      return s;
    });
    var done = 0;
    function settle() {                              // plain text again so the typewriter (and renderGreeting) own it from here
      if (!el._jjSweeping) return;
      el._jjSweeping = false;
      el.textContent = words.join(' ');
    }
    spans.forEach(function (s, i) {
      animate(s, { y: [26, 0], opacity: [0, 1], filter: ['blur(8px)', 'blur(0px)'] },
        { type: 'spring', stiffness: 320, damping: 26, delay: 0.15 + i * 0.11 })
        .finished.then(function () {
          if (++done === spans.length) settle();
        });
    });
    setTimeout(settle, 3000);                        // hidden-tab springs never finish — don't leave the headline locked
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
