/* ============================================================
   liquid-nav.js  —  Liquid Bridge active-tab animation
   Drop-in for Jeff's Junk dashboard.

   - Daily rail: the active carved tab liquid-stretches between
     items when you switch pages (variant 8 "Liquid Bridge").
   - More tools: when a sub-page is active the carved tab lands on
     the "More tools" button (so the liquid tab is always present),
     and a liquid highlight stretches between the flyout tiles.
   - Auto-hooks your existing go(name); injects its own CSS.

   Install: include AFTER app.js:
     <script src="liquid-nav.js?v=1"></script>
   ============================================================ */
(function () {
  if (window.__liquidNav) return;
  window.__liquidNav = true;

  /* ---- tunables (variant 8) ---- */
  var SIDEBAR_W = 240;       // must match --sidebar-w
  var FILL      = '#f8f9fa'; // must match --bg (page background)
  var RR        = 14;        // concave fillet radius (carve into the page)
  var RL        = 15;        // rounded left-corner radius
  var DUR       = 560;       // ms
  var STRETCH   = 0.58;      // size of the honey "neck" (0.3 subtle … 0.75 dramatic)

  /* ---- math ---- */
  function lerp(a, b, p) { return a + (b - a) * p; }
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  function notchPath(t, b, lx, W) {
    return ['M', lx, (t + RL),
            'Q', lx, t, (lx + RL), t,
            'L', (W - RR), t,
            'A', RR, RR, 0, 0, 0, W, (t - RR),
            'L', W, (b + RR),
            'A', RR, RR, 0, 0, 0, (W - RR), b,
            'L', (lx + RL), b,
            'Q', lx, b, lx, (b - RL),
            'Z'].join(' ');
  }

  var svg, path, sidebar, nav, moreLabel, cur = null, raf = 0;

  function draw(g) {
    if (!path) return;
    if (g.hidden) { path.style.opacity = '0'; return; }
    path.style.opacity = '1';
    path.setAttribute('d', notchPath(g.t, g.b, g.lx, SIDEBAR_W));
  }

  /* the active Daily item = a direct child .nav-item.active (not the action button) */
  function dailyActive() {
    if (!nav) return null;
    var kids = nav.children, i;
    for (i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.classList && el.classList.contains('nav-item') &&
          el.classList.contains('active') &&
          !el.classList.contains('nav-item-action')) return el;
    }
    return null;
  }
  function flyoutActive() {
    var f = document.getElementById('nav-more');
    return f ? f.querySelector('.nav-item.active') : null;
  }
  /* what the rail notch should carve on: a Daily item, else the
     "More tools" button when a sub-page is active, else nothing. */
  function railTarget() {
    var d = dailyActive();
    var flyOpen = !!(fly && fly.classList.contains('open'));
    /* park on "More tools" whenever the flyout is open OR a sub-page is active */
    var onMore = flyOpen || (!d && !!flyoutActive());
    if (moreLabel) moreLabel.classList.toggle('liquid-more-active', onMore);
    if (onMore && moreLabel) return moreLabel;
    return d;
  }

  function measure(el) {
    var sr = sidebar.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { t: r.top - sr.top, b: r.bottom - sr.top, lx: Math.max(6, Math.round(r.left - sr.left)) };
  }
  function sizeSvg() {
    var h = sidebar.getBoundingClientRect().height || sidebar.offsetHeight;
    svg.setAttribute('width', SIDEBAR_W);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', '0 0 ' + SIDEBAR_W + ' ' + h);
  }
  function snap() {
    var el = railTarget();
    if (!el) { if (cur) { cur.hidden = true; draw(cur); } return; }
    var m = measure(el);
    cur = { t: m.t, b: m.b, lx: m.lx, hidden: false };
    draw(cur);
  }
  function animateTo() {
    var el = railTarget();
    if (!el) { if (cur) { cur.hidden = true; draw(cur); } return; }
    var to = measure(el);
    if (!cur || cur.hidden) { cur = { t: to.t, b: to.b, lx: to.lx, hidden: false }; draw(cur); return; }
    var s = { t: cur.t, b: cur.b, lx: cur.lx };
    var down = to.t > s.t, t0 = performance.now();
    cancelAnimationFrame(raf);
    (function tick(now) {
      var prog = Math.min(1, (now - t0) / DUR);
      var lead = easeOutCubic(Math.min(1, prog / Math.max(0.2, 1 - STRETCH)));
      var lag  = easeInOut(prog);
      var ct, cb;
      if (down) { cb = lerp(s.b, to.b, lead); ct = lerp(s.t, to.t, lag); }
      else      { ct = lerp(s.t, to.t, lead); cb = lerp(s.b, to.b, lag); }
      if (cb - ct < 10) { var m = (ct + cb) / 2; ct = m - 5; cb = m + 5; }
      var clx = lerp(s.lx, to.lx, easeInOut(prog));
      cur = { t: ct, b: cb, lx: clx, hidden: false };
      draw(cur);
      if (prog < 1) raf = requestAnimationFrame(tick);
      else { cur = { t: to.t, b: to.b, lx: to.lx, hidden: false }; draw(cur); }
    })(performance.now());
  }

  /* ---------- More tools flyout: liquid highlight on the active tile ---------- */
  var fly, flyHL, flyCur = null, flyRaf = 0;
  function flyTile() { return fly ? fly.querySelector('.nav-item.active') : null; }
  function flyMeasure(el) {
    var fr = fly.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { l: r.left - fr.left, t: r.top - fr.top, r: r.right - fr.left, b: r.bottom - fr.top };
  }
  function flyDraw(g) {
    if (!flyHL) return;
    if (!g) { flyHL.style.opacity = '0'; return; }
    flyHL.style.opacity = '1';
    flyHL.style.width = (g.r - g.l) + 'px';
    flyHL.style.height = (g.b - g.t) + 'px';
    flyHL.style.transform = 'translate(' + g.l + 'px,' + g.t + 'px)';
  }
  function flySnap() {
    var el = flyTile();
    if (!el) { flyCur = null; flyDraw(null); return; }
    flyCur = flyMeasure(el); flyDraw(flyCur);
  }
  function flyAnimate() {
    var el = flyTile();
    if (!el) { flyDraw(null); return; }
    var to = flyMeasure(el);
    if (!flyCur) { flyCur = to; flyDraw(to); return; }
    var s = flyCur, dx = (to.l - s.l) + (to.r - s.r), dy = (to.t - s.t) + (to.b - s.b), t0 = performance.now();
    cancelAnimationFrame(flyRaf);
    (function tk(now) {
      var p = Math.min(1, (now - t0) / DUR);
      var lead = easeOutCubic(Math.min(1, p / Math.max(0.2, 1 - STRETCH))), lag = easeInOut(p);
      var L = lerp(s.l, to.l, dx < 0 ? lead : lag);
      var R = lerp(s.r, to.r, dx > 0 ? lead : lag);
      var T = lerp(s.t, to.t, dy < 0 ? lead : lag);
      var B = lerp(s.b, to.b, dy > 0 ? lead : lag);
      flyCur = { l: L, t: T, r: R, b: B }; flyDraw(flyCur);
      if (p < 1) flyRaf = requestAnimationFrame(tk);
      else { flyCur = to; flyDraw(to); }
    })(performance.now());
  }

  function injectCSS() {
    var s = document.createElement('style');
    s.textContent =
      '.sidebar>.nav,.sidebar>.logo{position:relative;z-index:1;}' +
      '.sidebar .nav-item{position:relative;z-index:1;}' +
      '.nav-item.active{background:transparent!important;width:100%!important;margin-right:0!important;border-radius:11px!important;}' +
      '.nav-item.active::before,.nav-item.active::after{display:none!important;}' +
      '.liquid-nav-svg{position:absolute;left:0;top:0;pointer-events:none;z-index:0;overflow:visible;}' +
      /* rail notch parked on the "More tools" button */
      '#nav-more-label.liquid-more-active{background:transparent!important;border-color:transparent!important;position:relative;z-index:1;}' +
      '#nav-more-label.liquid-more-active span{color:#15803d!important;}' +
      /* flyout liquid highlight */
      '#nav-more .nav-item{position:relative;z-index:1;}' +
      '#nav-more.more-flyout .nav-item.active{background:transparent!important;}' +
      '.liquid-more-hl{position:absolute;top:0;left:0;background:rgba(255,255,255,.18);border-radius:11px;pointer-events:none;z-index:0;will-change:transform,width,height;transition:opacity .18s ease;}';
    document.head.appendChild(s);
  }

  function build() {
    sidebar = document.querySelector('.sidebar');
    nav = sidebar && sidebar.querySelector('.nav');
    if (!sidebar || !nav) return false;
    injectCSS();
    moreLabel = document.getElementById('nav-more-label');

    var NS = 'http://www.w3.org/2000/svg';
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'liquid-nav-svg');
    path = document.createElementNS(NS, 'path');
    path.setAttribute('fill', FILL);
    path.style.transition = 'opacity .2s ease';
    svg.appendChild(path);
    sidebar.insertBefore(svg, sidebar.firstChild);
    sizeSvg();
    snap();
    nav.addEventListener('scroll', snap, { passive: true });
    window.addEventListener('resize', function () { sizeSvg(); snap(); flySnap(); });

    /* flyout highlight */
    fly = document.getElementById('nav-more');
    if (fly) {
      flyHL = document.createElement('div');
      flyHL.className = 'liquid-more-hl';
      flyHL.style.opacity = '0';
      fly.insertBefore(flyHL, fly.firstChild);
      fly.addEventListener('scroll', flySnap, { passive: true });
      var mo = new MutationObserver(function () {
        requestAnimationFrame(function () {
          animateTo();                                   /* slide the rail tab onto / off the More tools button */
          if (fly.classList.contains('open')) flySnap(); /* place the flyout highlight */
        });
      });
      mo.observe(fly, { attributes: true, attributeFilter: ['class'] });
      flySnap();
    }
    return true;
  }

  function hookGo() {
    if (typeof window.go !== 'function' || window.go.__liquid) return false;
    var orig = window.go;
    window.go = function () {
      var r = orig.apply(this, arguments);
      requestAnimationFrame(function () {
        animateTo();
        if (fly && fly.classList.contains('open')) flyAnimate(); else flySnap();
      });
      return r;
    };
    window.go.__liquid = true;
    return true;
  }

  function afterBuild() {
    if (!hookGo()) {
      var n = 0, iv = setInterval(function () { if (hookGo() || ++n > 80) clearInterval(iv); }, 100);
    }
    window.addEventListener('load', function () { sizeSvg(); snap(); flySnap(); });
    setTimeout(function () { sizeSvg(); snap(); }, 400);
    setTimeout(snap, 1200);
  }
  function init() {
    if (!build()) {
      var b = 0, wb = setInterval(function () { if (build() || ++b > 100) { clearInterval(wb); afterBuild(); } }, 150);
      return;
    }
    afterBuild();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
