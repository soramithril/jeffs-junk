/* ═══════════════════════════════════════════════════════════════════
   LOGIN ART — which sheet you get, and what it says
   ═══════════════════════════════════════════════════════════════════
   The sign-in posters. With more than one they run in a fixed round-robin,
   so you never see the same one twice in a row. Jake kept only the anime
   sheet on 2026-10-06, added Lanterns & Leaves on 2026-10-07 and Project
   Hail Mary on 2026-10-14.

   The counter moves forward exactly once, on a Supabase-verified
   sign-in — app.js calls advance() at that point. Deliberately NOT on
   page load: otherwise refreshing the login screen, or mistyping your
   password and reloading, would shuffle the artwork under you. Sit on
   the login screen as long as you like; it stays put.

   Loaded from index.html directly after the login markup, so the sheet
   is chosen before first paint and nothing flashes.

   Styling lives in login-art.css; artwork in assets/login/. */
(function () {
  'use strict';

  var STORE = 'jjLoginArt';

  var SHEETS = [
    {
      key: 'anime',
      headline: ['BEYOND', 'THE NEXT LOAD'],
      eyebrow: 'A NEW ROUTE AWAITS',
      tagline: 'EVERY ROAD LEADS HOME',
      title: 'Begin the next journey',
      intro: 'Your next pickup is waiting beyond the horizon.',
      button: 'CONTINUE THE JOURNEY'
    },
    {
      key: 'lanterns',
      headline: ['', ''],      // no headline over this art (hidden by CSS)
      eyebrow: '',
      tagline: '',
      title: 'Welcome back.',
      intro: 'Your day starts here.',
      button: 'LOG IN'
    },
    {
      key: 'hailmary',
      headline: ['', ''],      // the art carries its own title (headline hidden by CSS)
      eyebrow: '',
      tagline: '',
      title: 'Mission control',
      intro: 'Your next run is cleared for launch.',
      button: 'LAUNCH'
    }
  ];

  function storedIndex() {
    var n;
    try { n = parseInt(localStorage.getItem(STORE), 10); } catch (e) { n = NaN; }
    return (n >= 0 && n < SHEETS.length) ? n : 0;
  }

  var shell = document.getElementById('login-screen');
  var sheet = SHEETS[storedIndex()];

  shell.classList.add('jjl-' + sheet.key);
  document.getElementById('jjl-eyebrow').textContent = sheet.eyebrow;
  document.getElementById('jjl-tagline').textContent = sheet.tagline;
  document.getElementById('jjl-title').textContent = sheet.title;
  document.getElementById('jjl-intro').textContent = sheet.intro;

  var h1 = document.getElementById('jjl-headline');
  h1.appendChild(document.createTextNode(sheet.headline[0]));
  h1.appendChild(document.createElement('br'));
  h1.appendChild(document.createTextNode(sheet.headline[1]));
  var dot = document.createElement('b');
  dot.textContent = '.';
  h1.appendChild(dot);

  var btn = document.getElementById('login-btn');
  // loginFail() puts this label back after a bad password, so it has to
  // survive somewhere the button itself can be read from.
  btn.dataset.label = sheet.button;
  document.getElementById('login-btn-label').textContent = sheet.button;

  // Artwork drifts against the pointer. Mouse only — on a touch screen the
  // pointer is the finger that is trying to type in the password field.
  shell.addEventListener('pointermove', function (ev) {
    if (ev.pointerType === 'touch') return;
    var r = shell.getBoundingClientRect();
    shell.style.setProperty('--parallax-x', (((ev.clientX - r.left) / r.width - 0.5) * 16) + 'px');
    shell.style.setProperty('--parallax-y', (((ev.clientY - r.top) / r.height - 0.5) * 11) + 'px');
  });
  shell.addEventListener('pointerleave', function () {
    shell.style.setProperty('--parallax-x', '0px');
    shell.style.setProperty('--parallax-y', '0px');
  });

  var pass = document.getElementById('login-password');
  var peek = document.getElementById('login-peek');
  peek.addEventListener('click', function () {
    var showing = pass.type === 'text';
    pass.type = showing ? 'password' : 'text';
    peek.textContent = showing ? 'SHOW' : 'HIDE';
    peek.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    pass.focus();
  });

  // ── THE DOTS ──
  // One dot per sheet: how many there are, which one you are on, and any of them can be
  // picked outright. With a single sheet there is nothing to pick, so no dots. The sheet
  // is built once, at page load, so choosing one reloads rather than rebuilding it.
  var dots = document.getElementById('jjl-dots');
  if (dots && SHEETS.length > 1) {
    var here = storedIndex();
    SHEETS.forEach(function (sh, n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'jjl-dot' + (n === here ? ' on' : '');
      b.title = sh.key;
      b.setAttribute('aria-label', 'Sign-in artwork ' + (n + 1) + ' of ' + SHEETS.length + ': ' + sh.key);
      if (n === here) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', function () {
        if (n === here) return;
        try { localStorage.setItem(STORE, String(n)); } catch (e) {}
        location.reload();
      });
      dots.appendChild(b);
    });
  }

  if (sheet.key === 'lanterns') lanterns();
  if (sheet.key === 'hailmary') hailMary();

  // ── THE MOTION LAYER ──
  // A canvas laid exactly over the picture, for sheets whose motion is drawn rather than
  // done in CSS. The picture itself never moves; draw(ctx, w, h, t, still) paints one
  // frame in canvas pixels. Capped at 30 fps, paused while the tab is hidden, stopped for
  // good once the sign-in screen is hidden, and drawn once, still, for anyone with
  // reduce-motion switched on (still is true then and t is 0).
  function motionLayer(IW, IH, draw) {
    var art = shell.querySelector('.jjl-art');
    var host = art.parentNode;
    var canvas = document.createElement('canvas');
    canvas.className = 'jjl-glow';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    var clock = 0, last = 0, lastPaint = -1;

    function paint() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      draw(ctx, canvas.width, canvas.height, reduced.matches ? 0 : clock, reduced.matches);
    }

    // Place the canvas on exactly the rectangle the CSS background-image covers, so what
    // it draws stays on its spot in the picture at any window size (cover on desktop,
    // height-fit on phones).
    function place() {
      var W = host.clientWidth, H = host.clientHeight, cs = getComputedStyle(art);
      var scale = cs.backgroundSize === 'cover' ? Math.max(W / IW, H / IH) : H / IH;
      var w = IW * scale, h = IH * scale;
      var px = parseFloat(cs.backgroundPositionX) / 100, py = parseFloat(cs.backgroundPositionY) / 100;
      canvas.style.left = ((W - w) * px) + 'px';
      canvas.style.top = ((H - h) * py) + 'px';
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.min(2560, Math.max(960, Math.round(w * devicePixelRatio)));
      canvas.height = Math.round(canvas.width * IH / IW);
      paint();
    }

    function frame(now) {
      if (shell.style.display === 'none') { window.removeEventListener('resize', place); return; }   // signed in: stop for good
      var dt = Math.min(.1, (now - last) / 1000); last = now;
      if (!document.hidden && !reduced.matches) {
        clock += dt;
        if (clock - lastPaint >= 1 / 30) { paint(); lastPaint = clock; }
      }
      requestAnimationFrame(frame);
    }

    place();
    window.addEventListener('resize', place, { passive: true });
    reduced.addEventListener('change', paint);
    requestAnimationFrame(frame);
    return { repaint: paint };
  }

  // A soft round light. Shared by both sheets' glows.
  function glow(ctx, x, y, rx, ry, centre, mid, composite) {
    ctx.save(); ctx.globalCompositeOperation = composite;
    ctx.translate(x, y); ctx.scale(rx, ry);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, centre); g.addColorStop(.42, mid); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
  }

  // ── LANTERNS & LEAVES ──
  // Ported from the designer's background-motion.js (v6): 48 drifting leaves, four lantern
  // glows on 2.2-2.9s cycles and gold reflections that shimmer in brightness only. With
  // reduce-motion on, the leaves go and the glows hold still.
  function lanterns() {
    var img = new Image();
    var lamps = [
      { x: .060, y: .210, rx: .027, ry: .057, phase: .1, period: 2.2 },
      { x: .235, y: .315, rx: .023, ry: .049, phase: 1.8, period: 2.7 },
      { x: .270, y: .355, rx: .022, ry: .049, phase: 3.3, period: 2.4 },
      { x: .546, y: .413, rx: .023, ry: .048, phase: 4.4, period: 2.9 }
    ];
    var reflections = [];
    var IW = 1672;   // the picture's own width; leaf sizes are fractions of it

    // Copy only the picture's own gold highlights into fixed masks. No pixel ever moves.
    function prepareReflections() {
      [[.848, .600, .118, .092], [.682, .824, .318, .176], [.055, .938, .640, .062]].forEach(function (r) {
        var mask = document.createElement('canvas');
        mask.width = Math.round(r[2] * img.naturalWidth); mask.height = Math.round(r[3] * img.naturalHeight);
        var mc = mask.getContext('2d', { willReadFrequently: true });
        mc.drawImage(img, r[0] * img.naturalWidth, r[1] * img.naturalHeight, mask.width, mask.height, 0, 0, mask.width, mask.height);
        var px = mc.getImageData(0, 0, mask.width, mask.height), d = px.data;
        for (var i = 0; i < d.length; i += 4) {
          var warm = Math.max(0, Math.min(1, (d[i] - d[i + 2] - 24) / 90)) * Math.max(0, Math.min(1, (d[i + 1] - 70) / 105));
          var row = Math.floor(i / 4 / mask.width), col = (i / 4) % mask.width;
          var edge = Math.min(1, col / 12, (mask.width - col) / 12, row / 8, (mask.height - row) / 8);
          d[i] = 255; d[i + 1] = 204; d[i + 2] = 100; d[i + 3] = Math.round(215 * warm * edge);
        }
        mc.putImageData(px, 0, 0);
        var dim = document.createElement('canvas'); dim.width = mask.width; dim.height = mask.height;
        var dc = dim.getContext('2d'); dc.drawImage(mask, 0, 0);
        dc.globalCompositeOperation = 'source-in'; dc.fillStyle = '#241709'; dc.fillRect(0, 0, dim.width, dim.height);
        reflections.push({ x: r[0], y: r[1], w: r[2], h: r[3], mask: mask, dim: dim });
      });
      layer.repaint();
    }

    function shimmer(ctx, w, h, t) {
      reflections.forEach(function (r, index) {
        for (var band = 0; band < 6; band++) {
          var sy = band * r.mask.height / 6, sh = r.mask.height / 6;
          var pulse = .5 + .5 * Math.sin(t * 1.8 + index * 1.7 + band * .9);
          var dx = r.x * w, dy = (r.y + r.h * band / 6) * h, dw = r.w * w, dh = r.h * h / 6;
          ctx.save(); ctx.globalAlpha = .36 * (1 - pulse); ctx.drawImage(r.dim, 0, sy, r.mask.width, sh, dx, dy, dw, dh);
          ctx.globalAlpha = .18 + .80 * pulse; ctx.drawImage(r.mask, 0, sy, r.mask.width, sh, dx, dy, dw, dh); ctx.restore();
        }
      });
    }

    function lights(ctx, w, h, t) {
      lamps.forEach(function (l) {
        var pulse = .5 + .5 * Math.sin(t * Math.PI * 2 / l.period + l.phase);
        var life = Math.max(0, Math.min(1, pulse * .94 + .06 * Math.sin(t * 2.2 + l.phase)));
        var x = l.x * w, y = l.y * h, rx = l.rx * w, ry = l.ry * h;
        glow(ctx, x, y, rx, ry, 'rgba(40,20,5,' + (.27 * (1 - life)) + ')', 'rgba(60,28,5,' + (.16 * (1 - life)) + ')', 'multiply');
        glow(ctx, x, y, rx * 4.2, ry * 3.2, 'rgba(255,162,45,' + (.13 + life * .28) + ')', 'rgba(255,125,25,' + (.025 + life * .095) + ')', 'screen');
        glow(ctx, x, y, rx * 2.7, ry * 2.2, 'rgba(255,194,75,' + (.30 + life * .48) + ')', 'rgba(255,151,40,' + (.12 + life * .23) + ')', 'screen');
        glow(ctx, x, y, rx * .84, ry * .9, 'rgba(255,244,181,' + (.18 + life * .48) + ')', 'rgba(255,211,102,' + (.10 + life * .28) + ')', 'screen');
      });
    }

    var COLOURS = ['#c6a65c', '#87a35b', '#dfbd76', '#6f8b4c'];
    function leaves(ctx, w, h, t) {
      for (var i = 0; i < 48; i++) {
        var phase = (t / (22 + (i % 13) * 1.05) + i * .61803399) % 1;
        var x = (-.05 + phase * 1.14 + Math.sin(t * .33 + i) * .012) * w;
        var y = (((i * .381966) % 1) * .77 + phase * .22 + Math.sin(t * .42 + i * 2) * .008) * h;
        var size = (3.3 + (i % 5) * 1.25) * w / IW;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * (.22 + (i % 6) * .035) + i);
        ctx.scale(1, .5 + Math.abs(Math.sin(t * .55 + i)) * .5);
        ctx.globalAlpha = Math.min(1, phase * 7, (1 - phase) * 7) * (.65 + (i % 3) * .1);
        ctx.fillStyle = COLOURS[i % 4];
        ctx.beginPath(); ctx.moveTo(-size, 0); ctx.quadraticCurveTo(0, -size * .8, size, 0); ctx.quadraticCurveTo(0, size * .8, -size, 0); ctx.fill();
        ctx.strokeStyle = '#ecd293'; ctx.globalAlpha *= .55; ctx.lineWidth = .6 * w / IW;
        ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.stroke(); ctx.restore();
      }
    }

    var layer = motionLayer(1672, 941, function (ctx, w, h, t, still) {
      shimmer(ctx, w, h, t);
      lights(ctx, w, h, t);
      if (!still) leaves(ctx, w, h, t);
    });
    img.addEventListener('load', prepareReflections, { once: true });
    img.src = 'assets/login/jeffs-junk-lanterns.webp';
  }

  // ── PROJECT HAIL MARY ── (added 2026-10-14)
  // The truck and bin fly on six blue thrusters; each one flickers on its own and throws a
  // plume back the way the truck came. Stars twinkle in the dark parts of the sky (found by
  // reading the picture, so none land on the truck, the face or the planet), the sun on
  // the right flares slowly, and dust streams past through the asteroid field. With
  // reduce-motion on, the dust goes and everything else holds still.
  function hailMary() {
    var IW = 1672, IH = 941;
    // Nozzle centres in picture pixels, measured off the artwork; r is the glow radius.
    var jets = [
      { x: 71,  y: 352, r: 30, seed: .3 },   // under the front bumper
      { x: 280, y: 370, r: 34, seed: 1.7 },  // front wheel
      { x: 503, y: 444, r: 30, seed: 2.9 },  // rear wheel
      { x: 610, y: 469, r: 20, seed: 4.1 },  // behind the rear wheel
      { x: 765, y: 488, r: 24, seed: 5.3 },  // bin, front
      { x: 925, y: 543, r: 20, seed: 6.6 }   // bin, rear
    ];
    var PLUME = 30 * Math.PI / 180;   // the exhaust trails down and to the right
    var SUN = { x: 1402, y: 468 };
    var stars = [];

    // Candidate star spots from a fixed sequence, kept only where the sky is dark there.
    function findStars(img) {
      var c = document.createElement('canvas'); c.width = 418; c.height = 235;
      var cc = c.getContext('2d', { willReadFrequently: true });
      cc.drawImage(img, 0, 0, c.width, c.height);
      var d = cc.getImageData(0, 0, c.width, c.height).data;
      for (var i = 0; stars.length < 70 && i < 2000; i++) {
        var fx = (i * .61803399) % 1, fy = (i * .7548777 + .13) % 1;
        var k = (Math.floor(fy * c.height) * c.width + Math.floor(fx * c.width)) * 4;
        if (d[k] + d[k + 1] + d[k + 2] > 150) continue;
        stars.push({ x: fx * IW, y: fy * IH, size: 1 + (i % 4) * .45, speed: .7 + (i % 7) * .23, phase: i * 1.37, cross: i % 9 === 0 });
      }
      layer.repaint();
    }

    // Uneven flicker: three sines that never line up, between .55 and 1.
    function flicker(t, seed) {
      var n = Math.sin(t * 13.1 + seed) * .5 + Math.sin(t * 7.3 + seed * 2.1) * .3 + Math.sin(t * 23.7 + seed * .7) * .2;
      return .775 + .225 * n;
    }

    function thrusters(ctx, s, t) {
      jets.forEach(function (j) {
        var f = flicker(t, j.seed), x = j.x * s, y = j.y * s, r = j.r * s;
        // plume: a long soft ellipse trailing back from the nozzle
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        ctx.translate(x, y); ctx.rotate(PLUME);
        var len = r * (2.6 + 1.1 * f);
        ctx.translate(len * .45, 0); ctx.scale(len, r * .42);
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, 'rgba(150,205,255,' + (.42 * f) + ')'); g.addColorStop(.5, 'rgba(70,140,255,' + (.16 * f) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
        glow(ctx, x, y, r * 1.9, r * 1.6, 'rgba(110,175,255,' + (.20 + .22 * f) + ')', 'rgba(60,120,255,' + (.06 + .08 * f) + ')', 'screen');
        glow(ctx, x, y, r * .62, r * .55, 'rgba(235,248,255,' + (.35 + .5 * f) + ')', 'rgba(160,215,255,' + (.2 + .3 * f) + ')', 'screen');
      });
    }

    function twinkle(ctx, s, t) {
      stars.forEach(function (st) {
        var a = Math.pow(Math.max(0, Math.sin(t * st.speed + st.phase)), 3);
        if (a < .02) return;
        var x = st.x * s, y = st.y * s, r = st.size * s;
        glow(ctx, x, y, r * 2.6, r * 2.6, 'rgba(255,246,230,' + (.9 * a) + ')', 'rgba(255,214,190,' + (.3 * a) + ')', 'screen');
        if (st.cross) {
          ctx.save(); ctx.globalCompositeOperation = 'screen';
          ctx.strokeStyle = 'rgba(255,240,225,' + (.55 * a) + ')'; ctx.lineWidth = Math.max(1, .6 * s);
          ctx.beginPath(); ctx.moveTo(x - r * 7, y); ctx.lineTo(x + r * 7, y); ctx.moveTo(x, y - r * 7); ctx.lineTo(x, y + r * 7); ctx.stroke();
          ctx.restore();
        }
      });
    }

    function sun(ctx, s, t) {
      var p = .5 + .5 * Math.sin(t * Math.PI * 2 / 6), x = SUN.x * s, y = SUN.y * s;
      glow(ctx, x, y, 150 * s, 150 * s, 'rgba(255,214,150,' + (.10 + .14 * p) + ')', 'rgba(255,140,60,' + (.04 + .06 * p) + ')', 'screen');
      glow(ctx, x, y, 34 * s, 34 * s, 'rgba(255,250,225,' + (.25 + .3 * p) + ')', 'rgba(255,215,140,' + (.12 + .12 * p) + ')', 'screen');
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.translate(x, y); ctx.rotate(t * .05);
      for (var i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 4);
        var len = (95 + 40 * p) * s * (i % 2 ? .6 : 1);
        var g = ctx.createLinearGradient(-len, 0, len, 0);
        g.addColorStop(0, 'rgba(255,220,170,0)'); g.addColorStop(.5, 'rgba(255,236,200,' + (.20 + .18 * p) + ')'); g.addColorStop(1, 'rgba(255,220,170,0)');
        ctx.fillStyle = g; ctx.fillRect(-len, -1.2 * s, len * 2, 2.4 * s);
      }
      ctx.restore();
    }

    // Dust and grit streaming past through the asteroid field, left half of the picture.
    function dust(ctx, s, t) {
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'round';
      for (var i = 0; i < 40; i++) {
        var phase = (t / (7 + (i % 9) * .8) + i * .61803399) % 1;
        var x = (-.04 + phase * .62) * IW, y = (.36 + ((i * .381966) % 1) * .64) * IH + phase * 120;
        var a = Math.min(1, phase * 6, (1 - phase) * 6) * (.25 + (i % 4) * .08);
        var len = 5 + (i % 5) * 2.5;
        ctx.strokeStyle = 'rgba(255,205,170,' + a + ')'; ctx.lineWidth = (.8 + (i % 3) * .5) * s;
        ctx.beginPath(); ctx.moveTo((x - len) * s, (y - len * .2) * s); ctx.lineTo(x * s, y * s); ctx.stroke();
      }
      ctx.restore();
    }

    var layer = motionLayer(IW, IH, function (ctx, w, h, t, still) {
      var s = w / IW;   // picture pixels to canvas pixels
      sun(ctx, s, t);
      twinkle(ctx, s, t);
      if (!still) dust(ctx, s, t);
      thrusters(ctx, s, t);
    });
    var img = new Image();
    img.addEventListener('load', function () { findStars(img); }, { once: true });
    img.src = 'assets/login/jeffs-junk-hail-mary.webp';
  }

  window.JJLoginArt = {
    // Called by app.js once Supabase has accepted the password, so the next
    // time this browser lands on the login screen it gets the next sheet.
    advance: function () {
      try { localStorage.setItem(STORE, String((storedIndex() + 1) % SHEETS.length)); } catch (e) {}
    }
  };
})();
