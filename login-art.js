/* ═══════════════════════════════════════════════════════════════════
   LOGIN ART — which sheet you get, and what it says
   ═══════════════════════════════════════════════════════════════════
   The sign-in posters. With more than one they run in a fixed round-robin,
   so you never see the same one twice in a row. Jake kept only the anime
   sheet on 2026-10-06 and added Lanterns & Leaves on 2026-10-07.

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

  // ── LANTERNS & LEAVES ──
  // Ported from the designer's background-motion.js (v6). The picture itself never moves;
  // a canvas laid exactly over it draws 48 drifting leaves, four lantern glows on 2.2-2.9s
  // cycles and gold reflections that shimmer in brightness only. Capped at 30 fps, paused
  // while the tab is hidden, stopped for good once the sign-in screen is hidden, and
  // leaf-free and still for anyone with reduce-motion switched on.
  if (sheet.key === 'lanterns') lanterns();

  function lanterns() {
    var art = shell.querySelector('.jjl-art');
    var host = art.parentNode;
    var canvas = document.createElement('canvas');
    canvas.className = 'jjl-glow';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    var img = new Image();
    var IW = 1672, IH = 941;   // the picture's own size; lamp and reflection spots are fractions of it
    var lamps = [
      { x: .060, y: .210, rx: .027, ry: .057, phase: .1, period: 2.2 },
      { x: .235, y: .315, rx: .023, ry: .049, phase: 1.8, period: 2.7 },
      { x: .270, y: .355, rx: .022, ry: .049, phase: 3.3, period: 2.4 },
      { x: .546, y: .413, rx: .023, ry: .048, phase: 4.4, period: 2.9 }
    ];
    var reflections = [];
    var clock = 0, last = 0, lastPaint = -1;

    // Place the canvas on exactly the rectangle the CSS background-image covers, so the
    // glows stay on the lanterns at any window size (cover on desktop, height-fit on phones).
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
      render(clock);
    }

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
      render(clock);
    }

    function shimmer(t) {
      reflections.forEach(function (r, index) {
        for (var band = 0; band < 6; band++) {
          var sy = band * r.mask.height / 6, sh = r.mask.height / 6;
          var pulse = .5 + .5 * Math.sin(t * 1.8 + index * 1.7 + band * .9);
          var dx = r.x * canvas.width, dy = (r.y + r.h * band / 6) * canvas.height, dw = r.w * canvas.width, dh = r.h * canvas.height / 6;
          ctx.save(); ctx.globalAlpha = .36 * (1 - pulse); ctx.drawImage(r.dim, 0, sy, r.mask.width, sh, dx, dy, dw, dh);
          ctx.globalAlpha = .18 + .80 * pulse; ctx.drawImage(r.mask, 0, sy, r.mask.width, sh, dx, dy, dw, dh); ctx.restore();
        }
      });
    }

    function glow(x, y, rx, ry, centre, mid, composite) {
      ctx.save(); ctx.globalCompositeOperation = composite;
      ctx.translate(x, y); ctx.scale(rx, ry);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, centre); g.addColorStop(.42, mid); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }

    function lights(t) {
      var w = canvas.width, h = canvas.height;
      lamps.forEach(function (l) {
        var pulse = .5 + .5 * Math.sin(t * Math.PI * 2 / l.period + l.phase);
        var life = Math.max(0, Math.min(1, pulse * .94 + .06 * Math.sin(t * 2.2 + l.phase)));
        var x = l.x * w, y = l.y * h, rx = l.rx * w, ry = l.ry * h;
        glow(x, y, rx, ry, 'rgba(40,20,5,' + (.27 * (1 - life)) + ')', 'rgba(60,28,5,' + (.16 * (1 - life)) + ')', 'multiply');
        glow(x, y, rx * 4.2, ry * 3.2, 'rgba(255,162,45,' + (.13 + life * .28) + ')', 'rgba(255,125,25,' + (.025 + life * .095) + ')', 'screen');
        glow(x, y, rx * 2.7, ry * 2.2, 'rgba(255,194,75,' + (.30 + life * .48) + ')', 'rgba(255,151,40,' + (.12 + life * .23) + ')', 'screen');
        glow(x, y, rx * .84, ry * .9, 'rgba(255,244,181,' + (.18 + life * .48) + ')', 'rgba(255,211,102,' + (.10 + life * .28) + ')', 'screen');
      });
    }

    var COLOURS = ['#c6a65c', '#87a35b', '#dfbd76', '#6f8b4c'];
    function leaves(t) {
      var w = canvas.width, h = canvas.height;
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

    function render(t) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      shimmer(t);
      lights(t);
      if (!reduced.matches) leaves(t);
    }

    function frame(now) {
      if (shell.style.display === 'none') { window.removeEventListener('resize', place); return; }   // signed in: stop for good
      var dt = Math.min(.1, (now - last) / 1000); last = now;
      if (!document.hidden && !reduced.matches) {
        clock += dt;
        if (clock - lastPaint >= 1 / 30) { render(clock); lastPaint = clock; }
      }
      requestAnimationFrame(frame);
    }

    img.addEventListener('load', prepareReflections, { once: true });
    img.src = 'assets/login/jeffs-junk-lanterns.webp';
    place();
    window.addEventListener('resize', place, { passive: true });
    reduced.addEventListener('change', function () { render(reduced.matches ? 0 : clock); });
    requestAnimationFrame(frame);
  }

  window.JJLoginArt = {
    // Called by app.js once Supabase has accepted the password, so the next
    // time this browser lands on the login screen it gets the next sheet.
    advance: function () {
      try { localStorage.setItem(STORE, String((storedIndex() + 1) % SHEETS.length)); } catch (e) {}
    }
  };
})();
