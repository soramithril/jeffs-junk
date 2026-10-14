/* ═══════════════════════════════════════════════════════════════════
   LOGIN ART — which sheet you get, and what it says
   ═══════════════════════════════════════════════════════════════════
   The sign-in posters, run by the calendar (Jake, 2026-10-14):
   - A seasonal sheet shows only in its own dates (THE CALENDAR below). While a
     season is on, 9 sign-ins in 10 get one of that season's sheets and 1 in 10
     gets a year-round one.
   - Out of season it is the year-round sheets: the movie posters and the
     lakeside all year, the anime one and Lanterns & Leaves spring to fall.
   - Never the same sheet twice in a row when there is a choice.

   The pick happens exactly once, on a Supabase-verified sign-in — app.js
   calls advance() at that point. Deliberately NOT on page load: otherwise
   refreshing the login screen, or mistyping your password and reloading,
   would shuffle the artwork under you. The one exception is a stored sheet
   whose dates have passed (Christmas still saved in January): that is
   swapped for one that is in season the next time the page loads.

   Adding a sheet: put the poster in assets/login/ as jeffs-junk-<key>.webp
   (1672x941, like the rest), add an entry to SHEETS with its season, where
   the sign-in card sits, its colours and words, and what moves on it. Effect
   positions are in the poster's own pixels.

   Loaded from index.html directly after the login markup, so the sheet
   is chosen before first paint and nothing flashes.

   Styling lives in login-art.css; artwork in assets/login/. */
(function () {
  'use strict';

  var STORE = 'jjLoginArt';
  var IW = 1672, IH = 941;   // every poster's size; effect positions are in its pixels

  // ── THE CALENDAR ──
  // Which season today is in, or null. The order settles overlaps: Valentine's
  // inside the winter stretch, St. Patrick's against an early Easter.
  function md(m, d) { return m * 100 + d; }   // 1225 = Dec 25
  function easterSunday(y) {   // the Gregorian computus
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  function thanksgivingMonday(y) {   // second Monday of October
    var first = new Date(y, 9, 1);
    return 1 + ((8 - first.getDay()) % 7) + 7;
  }
  function seasonOn(date) {
    var y = date.getFullYear(), t = md(date.getMonth() + 1, date.getDate());
    var day = new Date(y, date.getMonth(), date.getDate());
    var easter = easterSunday(y);
    var easterFrom = new Date(y, easter.getMonth(), easter.getDate() - 13);
    var easterTo = new Date(y, easter.getMonth(), easter.getDate() + 1);   // Easter Monday
    var thanks = md(10, thanksgivingMonday(y));
    if (t >= 1211 && t <= 1225) return 'christmas';
    if (t >= 1226 || t <= 110) return 'newyears';
    if (t >= 201 && t <= 214) return 'valentines';
    if (t >= 310 && t <= 317) return 'stpatricks';
    if (day >= easterFrom && day <= easterTo) return 'easter';
    if (t >= 624 && t <= 701) return 'canadaday';
    if (t >= 920 && t <= thanks) return 'thanksgiving';
    if (t > thanks && t <= 1031) return 'halloween';
    if (t >= 111 && t <= 229) return 'winter';
    if (t >= 702 && t <= 831) return 'summer';
    return null;
  }
  function springToFall(date) {
    var t = md(date.getMonth() + 1, date.getDate());
    return t >= 320 && t <= 1220;
  }

  // ── THE COLOURS ── one set per mood; a sheet can override any of them.
  var GREEN_BTN = 'linear-gradient(90deg, #0e7e45, #43c978)';
  var PALETTES = {
    leaf:  { bg: '#172a22', card: 'linear-gradient(145deg, rgba(48,74,52,.74), rgba(20,44,33,.86))', phone: 'rgba(20,44,33,.62)', edge: 'rgba(255,255,255,.16)', btn: 'linear-gradient(90deg, #4f8a3f, #6aa553)', accent: '#cfe8c5', intro: 'rgba(236,238,224,.8)', footer: '#9fb59a' },
    space: { bg: '#1a0606', card: 'linear-gradient(150deg, rgba(40,12,16,.62), rgba(12,6,14,.82))', phone: 'rgba(24,8,12,.6)', edge: 'rgba(255,214,200,.16)', btn: GREEN_BTN, accent: '#9fd0ff', intro: 'rgba(240,226,220,.82)', footer: '#b28a86' },
    dusk:  { bg: '#2a140c', card: 'linear-gradient(150deg, rgba(60,32,20,.64), rgba(24,12,8,.84))', phone: 'rgba(32,16,10,.62)', edge: 'rgba(255,222,190,.18)', btn: GREEN_BTN, accent: '#ffcf8a', intro: 'rgba(246,234,222,.84)', footer: '#c9a68c' },
    night: { bg: '#0b1024', card: 'linear-gradient(150deg, rgba(22,28,56,.64), rgba(8,10,26,.84))', phone: 'rgba(10,14,32,.62)', edge: 'rgba(200,215,255,.18)', btn: GREEN_BTN, accent: '#bcd2ff', intro: 'rgba(228,234,250,.84)', footer: '#8f9bc0' },
    holly: { bg: '#1c0a0a', card: 'linear-gradient(150deg, rgba(74,18,22,.66), rgba(22,8,10,.86))', phone: 'rgba(36,10,12,.62)', edge: 'rgba(255,214,190,.18)', btn: GREEN_BTN, accent: '#ffd6a0', intro: 'rgba(250,236,226,.84)', footer: '#c99a8c' },
    rose:  { bg: '#2a0a18', card: 'linear-gradient(150deg, rgba(84,26,50,.64), rgba(30,8,20,.84))', phone: 'rgba(40,10,24,.62)', edge: 'rgba(255,200,220,.2)', btn: GREEN_BTN, accent: '#ffb3c7', intro: 'rgba(252,232,238,.84)', footer: '#d79aae' },
    sky:   { bg: '#0c2a40', card: 'linear-gradient(150deg, rgba(18,58,86,.6), rgba(8,28,48,.84))', phone: 'rgba(8,30,50,.62)', edge: 'rgba(200,235,255,.2)', btn: GREEN_BTN, accent: '#bfe6ff', intro: 'rgba(232,244,252,.86)', footer: '#8fb4cc' },
    neon:  { bg: '#120822', card: 'linear-gradient(150deg, rgba(44,16,64,.62), rgba(10,6,26,.86))', phone: 'rgba(20,8,36,.62)', edge: 'rgba(255,190,240,.2)', btn: GREEN_BTN, accent: '#ff9de6', intro: 'rgba(240,230,252,.84)', footer: '#a58fc8' }
  };
  // The shade behind the card, so the words stay readable over a busy picture.
  var GRADES = {
    float: 'linear-gradient(90deg, transparent 45%, rgba(0,0,0,.28) 100%)',
    bl: 'radial-gradient(ellipse 55% 60% at 0% 100%, rgba(0,0,0,.45), transparent 70%)',
    br: 'radial-gradient(ellipse 55% 60% at 100% 100%, rgba(0,0,0,.45), transparent 70%)',
    tr: 'radial-gradient(ellipse 55% 60% at 100% 0%, rgba(0,0,0,.4), transparent 70%)'
  };
  var AUTUMN = ['217,119,43', '184,68,31', '233,162,59', '140,58,26'];
  var SNOW = { fx: 'fall', kind: 'snow', count: 120, box: [0, -500, IW, IH], travel: [40, 520], period: 12, size: 2.2, colours: ['255,255,255'] };

  // ── THE SHEETS ──
  // season: 'always' | 'springfall' | a key from THE CALENDAR.
  // layout: 'float' (tall card on the right) | 'float narrow' | 'console bl|br|tr' (short
  // wide card in that corner). Only anime has no layout: it keeps its own classic panel.
  // phoneX: where the picture sits on a phone, which shows a slice of it full height.
  var SHEETS = [
    {
      key: 'anime', season: 'springfall',
      headline: ['BEYOND', 'THE NEXT LOAD'], eyebrow: 'A NEW ROUTE AWAITS', tagline: 'EVERY ROAD LEADS HOME',
      title: 'Begin the next journey', intro: 'Your next pickup is waiting beyond the horizon.', button: 'CONTINUE THE JOURNEY'
    },
    {
      // The designer's rule: the picture never moves, no pointer drift, no panel entrance
      // (motion in the scene made someone queasy). Only what lanterns() draws moves.
      key: 'lanterns', season: 'springfall', layout: 'float', still: true, font: 'serif', phoneX: '30%',
      theme: ['leaf', { grade: 'linear-gradient(90deg, rgba(5,18,14,.08) 25%, transparent 57%, rgba(6,23,16,.23) 100%), linear-gradient(0deg, rgba(3,16,12,.55), transparent 24%, transparent 85%, rgba(3,16,12,.3))', footer: '' }],
      title: 'Welcome back.', intro: 'Your day starts here.', button: 'LOG IN', motion: lanterns
    },
    {
      // The truck flies across the top-left, the face fills the middle-right, the astronaut
      // the bottom-right: the asteroid field bottom-left is the only clear ground.
      key: 'hailmary', season: 'always', layout: 'console bl', font: 'caps', phoneX: '24%',
      theme: ['space', { grade: 'radial-gradient(ellipse 48% 62% at 0% 100%, rgba(12,3,6,.55), transparent 70%), linear-gradient(0deg, rgba(10,3,5,.35), transparent 30%)' }],
      title: 'Mission control', intro: 'Your next run is cleared for launch.', button: 'LAUNCH', motion: hailMary
    },
    {
      key: 'space', season: 'always', layout: 'float', font: 'caps', phoneX: '28%', theme: ['space'],
      title: 'Orbit reached', intro: 'Payload secured. Ready for descent.', button: 'LAUNCH',
      effects: [
        { fx: 'glints', box: [0, 0, IW, IH], pick: 'dark', count: 70, size: 1.6, colour: '255,246,230', cross: true },
        { fx: 'glow', at: [314, 340], r: 22, colour: '120,255,170', flicker: true },
        { fx: 'glow', at: [830, 426], r: 18, colour: '120,255,170', flicker: true },
        { fx: 'glow', at: [650, 500], r: 46, colour: '140,255,180', period: 3 },
        { fx: 'glow', at: [1020, 220], r: 40, colour: '255,170,90', flicker: true },
        { fx: 'glow', at: [150, 60], r: 50, colour: '255,214,150', period: 6 }
      ]
    },
    {
      key: 'western', season: 'always', layout: 'console tr', font: 'caps', phoneX: '22%', theme: ['dusk'],
      title: 'High noon', intro: "This town's got junk to haul.", button: 'SADDLE UP',
      effects: [
        { fx: 'glow', at: [1326, 500], r: 62, colour: '255,210,130', period: 7 },
        { fx: 'fall', kind: 'dust', count: 30, box: [200, 640, IW + 300, IH], travel: [-520, -40], period: 9, size: 14, colours: ['190,120,70'] },
        { fx: 'tumbleweed', y: 800, size: 26, period: 13 }
      ]
    },
    {
      key: 'action', season: 'always', layout: 'console br', font: 'caps', phoneX: '40%', theme: ['neon'],
      title: 'No brakes', intro: "Today's run is one big jump.", button: 'PUNCH IT',
      effects: [
        { fx: 'glow', at: [167, 188], r: 110, colour: '255,140,50', flicker: true },
        { fx: 'glow', at: [301, 423], r: 60, colour: '255,140,50', flicker: true },
        { fx: 'glow', at: [80, 330], r: 50, colour: '255,160,60', flicker: true },
        { fx: 'fall', kind: 'ember', count: 40, box: [0, 200, 620, 760], travel: [80, -420], period: 5, size: 2.4, colours: ['255,170,70', '255,120,40'] },
        { fx: 'beam', from: [1196, 126], angle: 165, len: 430, width: 7, colour: '210,230,255', sweep: 4, period: 7 },
        { fx: 'glow', at: [1388, 99], r: 6, colour: '255,40,40', blink: true, period: 1.4 },
        { fx: 'glow', at: [1438, 362], r: 8, colour: '255,40,40', blink: true, period: 1.8 },
        { fx: 'glow', at: [1664, 405], r: 8, colour: '255,40,40', blink: true, period: 2.1 },
        { fx: 'glints', box: [760, 380, IW, 720], pick: 'bright', count: 50, size: 2, colour: '255,230,255' },
        { fx: 'glints', box: [500, 740, IW, IH], pick: 'bright', count: 30, size: 2, colour: '255,220,250' }
      ]
    },
    {
      key: 'lakeside', season: 'always', layout: 'console tr', font: 'serif', phoneX: '30%', theme: ['dusk'],
      title: 'Golden hour', intro: "Another day at the water's edge.", button: 'LOG IN',
      effects: [
        { fx: 'glow', at: [1490, 360], r: 44, colour: '255,214,140', period: 6 },
        { fx: 'glints', box: [1050, 400, IW, 600], pick: 'bright', count: 45, size: 2.2, colour: '255,236,190' },
        { fx: 'glints', box: [800, 700, IW, IH], pick: 'bright', count: 25, size: 2, colour: '255,236,190' },
        { fx: 'glow', at: [1260, 600], r: 12, colour: '255,200,120', flicker: true },
        { fx: 'glow', at: [1594, 565], r: 12, colour: '255,200,120', flicker: true },
        { fx: 'fall', kind: 'firefly', count: 16, box: [0, 350, 1000, 800], travel: [60, -40], period: 10, size: 2.2, colours: ['255,220,120'] }
      ]
    },
    {
      key: 'newyears', season: 'newyears', layout: 'float narrow', font: 'caps', phoneX: '30%', theme: ['night', { accent: '#ffe39a' }],
      title: 'Happy New Year', intro: 'Out with the old junk.', button: 'RING IT IN',
      effects: [
        { fx: 'fireworks', box: [300, 40, 1100, 300], colours: ['255,210,120', '140,255,170', '255,255,255', '255,170,90'], every: 1.1 },
        { fx: 'fall', kind: 'confetti', count: 40, box: [0, -300, IW, 700], travel: [60, 420], period: 9, size: 5, colours: ['235,190,80', '120,200,110', '255,255,255', '220,170,60'] },
        { fx: 'glints', box: [820, 470, IW, 760], pick: 'bright', count: 40, size: 2.2, colour: '255,230,170' },
        { fx: 'glints', box: [0, 150, 240, 520], pick: 'warm', count: 14, size: 2.2, colour: '255,220,150' }
      ]
    },
    {
      key: 'winter', season: 'winter', layout: 'console br', font: 'serif', phoneX: '25%', theme: ['night'],
      title: 'Snow day', intro: 'Roads are cleared. Let’s go.', button: 'LOG IN',
      effects: [
        { fx: 'shimmer', box: [700, 0, 1500, 190], weight: 'aurora', tint: '150,255,200', strength: .55 },
        { fx: 'glow', at: [130, 511], r: 22, colour: '255,240,210', period: 5 },
        { fx: 'glow', at: [380, 524], r: 18, colour: '255,240,210', period: 5 },
        { fx: 'glints', box: [700, 380, 1150, 560], pick: 'warm', count: 14, size: 2.2, colour: '255,220,150' },
        Object.assign({}, SNOW, { count: 130, size: 2.4 })
      ]
    },
    {
      key: 'valentines', season: 'valentines', layout: 'console tr', font: 'serif', phoneX: '32%', theme: ['rose'],
      title: 'Love the haul', intro: 'A route full of heart today.', button: 'LOG IN',
      effects: [
        { fx: 'glints', box: [560, 0, IW, 290], pick: 'pink', count: 24, size: 3, colour: '255,150,170' },
        { fx: 'glints', box: [0, 0, 700, 360], pick: 'warm', count: 24, size: 2.2, colour: '255,220,150' },
        Object.assign({}, SNOW, { count: 70, size: 2 }),
        { fx: 'fall', kind: 'petal', count: 18, box: [0, -200, IW, 700], travel: [220, 520], period: 13, size: 4.5, colours: ['200,30,50', '230,70,90', '170,20,40'] }
      ]
    },
    {
      key: 'stpatricks', season: 'stpatricks', layout: 'console br', font: 'serif', phoneX: '30%', theme: ['leaf', { btn: GREEN_BTN, accent: '#ffe08a' }],
      title: 'Lucky load', intro: 'A pot of gold at every stop.', button: 'LOG IN',
      effects: [
        { fx: 'glints', box: [650, 240, 1120, 640], pick: 'warm', count: 40, size: 2.4, colour: '255,225,120' },
        { fx: 'fall', kind: 'glitter', count: 26, box: [600, 0, 950, 400], travel: [60, 300], period: 7, size: 2.2, colours: ['255,215,90'] },
        { fx: 'glow', at: [1610, 360], r: 46, colour: '255,210,130', period: 6 },
        { fx: 'glints', box: [1100, 420, IW, 560], pick: 'bright', count: 26, size: 2, colour: '255,240,200' }
      ]
    },
    {
      key: 'easter', season: 'easter', layout: 'console tr', font: 'serif', phoneX: '25%', theme: ['sky', { accent: '#ffd0e0' }],
      title: 'Spring clean', intro: 'Fresh start, fresh routes.', button: 'LOG IN',
      effects: [
        { fx: 'glow', at: [1580, 344], r: 46, colour: '255,220,150', period: 6 },
        { fx: 'glints', box: [1000, 620, IW, IH], pick: 'bright', count: 24, size: 2, colour: '255,240,210' },
        { fx: 'fall', kind: 'petal', count: 34, box: [0, -200, IW, 700], travel: [260, 460], period: 14, size: 4, colours: ['255,220,230', '255,190,210', '255,245,245'] }
      ]
    },
    {
      key: 'canadaday', season: 'canadaday', layout: 'float narrow', font: 'caps', phoneX: '25%', theme: ['holly', { accent: '#ffb0a8' }],
      title: 'Happy Canada Day', intro: 'True north, strong and hauling.', button: 'LOG IN',
      effects: [
        { fx: 'fireworks', box: [620, 40, 1120, 330], colours: ['255,70,70', '255,255,255', '255,120,120'], every: 1.2 },
        { fx: 'glints', box: [900, 470, IW, 800], pick: 'bright', count: 45, size: 2.2, colour: '255,210,180' },
        { fx: 'glints', box: [0, 0, 420, 460], pick: 'warm', count: 18, size: 2.2, colour: '255,220,150' }
      ]
    },
    {
      key: 'summer', season: 'summer', layout: 'console tr', font: 'serif', phoneX: '25%', theme: ['sky'],
      title: 'Cottage country', intro: "Dock's clear. Bins are ready.", button: 'LOG IN',
      effects: [
        { fx: 'glints', box: [860, 380, IW, 770], pick: 'bright', count: 80, size: 2.6, colour: '255,255,240' }
      ]
    },
    {
      key: 'thanksgiving', season: 'thanksgiving', layout: 'console tr', font: 'serif', phoneX: '22%', theme: ['dusk'],
      title: 'Harvest time', intro: 'Grateful for every load.', button: 'LOG IN',
      effects: [
        { fx: 'glow', at: [1636, 424], r: 50, colour: '255,200,120', period: 6 },
        { fx: 'glow', at: [320, 250], r: 10, colour: '255,200,120', flicker: true },
        { fx: 'fall', kind: 'leaf', count: 34, box: [0, -120, IW, 700], travel: [300, 480], period: 15, size: 6.5, colours: AUTUMN }
      ]
    },
    {
      key: 'halloween', season: 'halloween', layout: 'console br', font: 'serif', phoneX: '28%', theme: ['night', { accent: '#ffb366', footer: '#b39acb' }],
      title: 'Something wicked', intro: 'this way comes. Let’s haul it.', button: 'ENTER',
      effects: [
        { fx: 'glow', at: [1444, 154], r: 80, colour: '255,170,80', period: 7 },
        { fx: 'bats', box: [1050, 60, IW, 330], count: 6 },
        { fx: 'glow', at: [250, 350], r: 18, colour: '255,140,40', flicker: true },
        { fx: 'glow', at: [94, 485], r: 18, colour: '255,140,40', flicker: true },
        { fx: 'glow', at: [60, 591], r: 18, colour: '255,140,40', flicker: true },
        { fx: 'glow', at: [1106, 524], r: 12, colour: '255,190,110', flicker: true },
        { fx: 'glow', at: [1256, 600], r: 10, colour: '255,190,110', flicker: true },
        { fx: 'fog', box: [850, 620, IW, 800], colour: '200,190,220' },
        { fx: 'fall', kind: 'leaf', count: 26, box: [0, -100, IW, 600], travel: [260, 520], period: 14, size: 6, colours: AUTUMN }
      ]
    },
    {
      key: 'christmas', season: 'christmas', layout: 'console br', font: 'serif', phoneX: '30%', theme: ['holly'],
      title: "Season's greetings", intro: "Sleigh's loaded. Let's roll.", button: 'LOG IN',
      effects: [
        { fx: 'glints', box: [0, 0, 560, 340], pick: 'warm', count: 30, size: 2.4, colour: '255,220,150' },
        { fx: 'glints', box: [1000, 260, 1220, 620], pick: 'warm', count: 22, size: 2.4, colour: '255,230,160' },
        { fx: 'glints', box: [1180, 200, IW, 620], pick: 'warm', count: 22, size: 2.4, colour: '255,220,150' },
        SNOW
      ]
    }
  ];

  // ── THE PICK ──
  function byKey(key) { return SHEETS.filter(function (s) { return s.key === key; })[0]; }
  function pools(date) {
    var season = seasonOn(date), sf = springToFall(date);
    return {
      inSeason: SHEETS.filter(function (s) { return s.season === season; }),
      base: SHEETS.filter(function (s) { return s.season === 'always' || (s.season === 'springfall' && sf); })
    };
  }
  function eligible(date) { var p = pools(date); return p.inSeason.concat(p.base); }
  function choose(exceptKey) {
    var p = pools(new Date());
    var pool = (p.inSeason.length && Math.random() < .9) ? p.inSeason : p.base;
    var options = pool.filter(function (s) { return s.key !== exceptKey; });
    if (!options.length) options = pool;   // a season with one sheet
    return options[Math.floor(Math.random() * options.length)].key;
  }
  function stored() { try { return localStorage.getItem(STORE); } catch (e) { return null; } }
  function store(key) { try { localStorage.setItem(STORE, key); } catch (e) {} }

  var key = stored();
  if (!eligible(new Date()).some(function (s) { return s.key === key; })) { key = choose(key); store(key); }
  var sheet = byKey(key);

  var shell = document.getElementById('login-screen');
  shell.classList.add('jjl-' + sheet.key);
  if (sheet.layout) dress(sheet);
  document.getElementById('jjl-eyebrow').textContent = sheet.eyebrow || '';
  document.getElementById('jjl-tagline').textContent = sheet.tagline || '';
  document.getElementById('jjl-title').textContent = sheet.title;
  document.getElementById('jjl-intro').textContent = sheet.intro;

  var h1 = document.getElementById('jjl-headline');
  if (sheet.headline) {
    h1.appendChild(document.createTextNode(sheet.headline[0]));
    h1.appendChild(document.createElement('br'));
    h1.appendChild(document.createTextNode(sheet.headline[1]));
    var dot = document.createElement('b');
    dot.textContent = '.';
    h1.appendChild(dot);
  }

  // Classes and colours for every sheet that has a layout (all but anime).
  function dress(sh) {
    var parts = sh.layout.split(' ');
    shell.classList.add('jjl-drawn', 'jjl-' + parts[0]);
    if (parts[1] === 'narrow') shell.classList.add('jjl-narrow');
    else if (parts[1]) shell.classList.add('jjl-at-' + parts[1]);
    if (sh.font) shell.classList.add('jjl-' + sh.font);
    if (sh.still) shell.classList.add('jjl-still');
    shell.querySelector('.jjl-art').style.backgroundImage = 'url("' + artUrl(sh) + '")';
    var theme = Object.assign({ grade: GRADES[parts[0] === 'float' ? 'float' : parts[1]] }, PALETTES[sh.theme[0]], sh.theme[1] || {});
    shell.style.setProperty('--t-phone-x', sh.phoneX);
    ['bg', 'card', 'phone', 'edge', 'btn', 'accent', 'intro', 'footer', 'grade'].forEach(function (k) {
      if (theme[k]) shell.style.setProperty('--t-' + k, theme[k]);
    });
  }
  function artUrl(sh) { return 'assets/login/jeffs-junk-' + sh.key + '.webp'; }

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
  // One dot per sheet that could come up today (this season's, then the year-round
  // ones): which one you are on, and any of them can be picked outright. The sheet is
  // built once, at page load, so choosing one reloads rather than rebuilding it.
  var dots = document.getElementById('jjl-dots');
  var today = eligible(new Date());
  if (dots && today.length > 1) {
    today.forEach(function (sh, n) {
      var here = sh.key === sheet.key;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'jjl-dot' + (here ? ' on' : '');
      b.title = sh.key;
      b.setAttribute('aria-label', 'Sign-in artwork ' + (n + 1) + ' of ' + today.length + ': ' + sh.key);
      if (here) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', function () {
        if (here) return;
        store(sh.key);
        location.reload();
      });
      dots.appendChild(b);
    });
  }

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

    var layer = motionLayer(IW, IH, function (ctx, w, h, t, still) {
      shimmer(ctx, w, h, t);
      lights(ctx, w, h, t);
      if (!still) leaves(ctx, w, h, t);
    });
    img.addEventListener('load', prepareReflections, { once: true });
    img.src = artUrl(byKey('lanterns'));
  }

  // ── PROJECT HAIL MARY ── (added 2026-10-14)
  // The truck and bin fly on six blue thrusters; each one flickers on its own and throws a
  // plume back the way the truck came. Stars twinkle in the dark parts of the sky (found by
  // reading the picture, so none land on the truck, the face or the planet), the sun on
  // the right flares slowly, and dust streams past through the asteroid field. With
  // reduce-motion on, the dust goes and everything else holds still.
  function hailMary() {
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
    img.src = artUrl(byKey('hailmary'));
  }

  // ── THE EFFECTS ──
  // What moves on the sheets described by an effects list. Each entry builds a little
  // object with draw(ctx, s, t, still) — s turns poster pixels into canvas pixels — and,
  // for effects that place themselves on the artwork, init(px), where px(x, y) reads the
  // poster's colour at a point. Nothing here ever moves the picture itself.
  function runEffects(sh) {
    var parts = sh.effects.map(function (o) { return FX[o.fx](o); });
    var layer = motionLayer(IW, IH, function (ctx, w, h, t, still) {
      var s = w / IW;
      parts.forEach(function (p) { p.draw(ctx, s, t, still); });
    });
    var img = new Image();
    img.addEventListener('load', function () {
      var px = pixels(img);
      parts.forEach(function (p) { if (p.init) p.init(px); });
      layer.repaint();
    }, { once: true });
    img.src = artUrl(sh);
  }

  function pixels(img) {
    var c = document.createElement('canvas'); c.width = IW; c.height = IH;
    var cc = c.getContext('2d', { willReadFrequently: true });
    cc.drawImage(img, 0, 0, IW, IH);
    var d = cc.getImageData(0, 0, IW, IH).data;
    return function (x, y) {
      var k = (Math.min(IH - 1, Math.max(0, Math.floor(y))) * IW + Math.min(IW - 1, Math.max(0, Math.floor(x)))) * 4;
      return [d[k], d[k + 1], d[k + 2]];
    };
  }

  // Spread-out fractions in [0, 1): the same sequence every time, so the scene is the same
  // on every load without storing anything.
  function q(i, a) { return ((i + .5) * a) % 1; }
  function clamp(v) { return Math.max(0, Math.min(1, v)); }

  // Uneven flicker: three sines that never line up, between .55 and 1.
  function flicker(t, seed) {
    var n = Math.sin(t * 13.1 + seed) * .5 + Math.sin(t * 7.3 + seed * 2.1) * .3 + Math.sin(t * 23.7 + seed * .7) * .2;
    return .775 + .225 * n;
  }

  // Which poster pixels a glint may sit on.
  var PICK = {
    dark: function (c) { return c[0] + c[1] + c[2] < 150; },
    bright: function (c) { return c[0] + c[1] + c[2] > 600; },
    warm: function (c) { return c[0] > 220 && c[1] > 150 && c[0] - c[2] > 70; },
    pink: function (c) { return c[0] > 200 && c[0] - c[1] > 60 && c[2] > 90; }
  };
  // How strongly a pixel takes part in a shimmer (0 to 1).
  var WEIGHT = {
    aurora: function (c) { return clamp((c[1] - Math.max(c[0], c[2]) - 10) / 70) * clamp((c[1] - 80) / 120); }
  };

  var FX = {};

  // Points of light that twinkle: stars, string lights, sun on water, city windows.
  // Placed by reading the poster, only where pick() says (dark sky, bright water...).
  FX.glints = function (o) {
    var spots = [];
    return {
      init: function (px) {
        var b = o.box;
        for (var i = 0; spots.length < o.count && i < o.count * 80; i++) {
          var x = b[0] + q(i, .61803399) * (b[2] - b[0]), y = b[1] + q(i, .7548777) * (b[3] - b[1]);
          if (!PICK[o.pick](px(x, y))) continue;
          spots.push({ x: x, y: y, size: o.size * (.7 + (i % 4) * .2), speed: .7 + (i % 7) * .23, phase: i * 1.37, cross: o.cross && i % 9 === 0 });
        }
      },
      draw: function (ctx, s, t) {
        spots.forEach(function (st) {
          var a = Math.pow(Math.max(0, Math.sin(t * st.speed + st.phase)), 3);
          if (a < .02) return;
          var x = st.x * s, y = st.y * s, r = st.size * s;
          glow(ctx, x, y, r * 2.6, r * 2.6, 'rgba(' + o.colour + ',' + (.9 * a) + ')', 'rgba(' + o.colour + ',' + (.3 * a) + ')', 'screen');
          if (st.cross) {
            ctx.save(); ctx.globalCompositeOperation = 'screen';
            ctx.strokeStyle = 'rgba(' + o.colour + ',' + (.55 * a) + ')'; ctx.lineWidth = Math.max(1, .6 * s);
            ctx.beginPath(); ctx.moveTo(x - r * 7, y); ctx.lineTo(x + r * 7, y); ctx.moveTo(x, y - r * 7); ctx.lineTo(x, y + r * 7); ctx.stroke();
            ctx.restore();
          }
        });
      }
    };
  };

  // A soft light on one spot: the sun or moon breathing slowly, a lamp or fire that
  // flickers, a warning light that blinks.
  FX.glow = function (o) {
    return {
      draw: function (ctx, s, t) {
        var p = o.flicker ? flicker(t, o.at[0] * .01)
          : o.blink ? (Math.sin(t * Math.PI * 2 / o.period) > .55 ? 1 : .08)
          : .5 + .5 * Math.sin(t * Math.PI * 2 / o.period + o.at[1] * .01);
        var x = o.at[0] * s, y = o.at[1] * s, r = o.r * s;
        glow(ctx, x, y, r * 2.4, r * 2.4, 'rgba(' + o.colour + ',' + (.10 + .16 * p) + ')', 'rgba(' + o.colour + ',' + (.04 + .06 * p) + ')', 'screen');
        glow(ctx, x, y, r, r, 'rgba(' + o.colour + ',' + (.22 + .32 * p) + ')', 'rgba(' + o.colour + ',' + (.08 + .14 * p) + ')', 'screen');
      }
    };
  };

  // Things drifting across: snow, leaves, petals, confetti, glitter, embers, fireflies,
  // dust. Each one starts somewhere in box, travels by travel over its period, and fades
  // in and out at the ends so the jump back to the start is never seen. Gone entirely
  // for reduce-motion.
  FX.fall = function (o) {
    var draw = PART[o.kind];
    return {
      draw: function (ctx, s, t, still) {
        if (still) return;
        var b = o.box;
        for (var i = 0; i < o.count; i++) {
          var period = o.period * (.8 + (i % 7) * .07);
          var phase = (t / period + i * .61803399) % 1;
          var sway = Math.sin(t * .9 + i * 2.3) * 14;
          var x = (b[0] + q(i, .7548777) * (b[2] - b[0]) + phase * o.travel[0] + sway) * s;
          var y = (b[1] + q(i, .5698403) * (b[3] - b[1]) + phase * o.travel[1]) * s;
          var a = Math.min(1, phase * 6, (1 - phase) * 6);
          draw(ctx, x, y, o.size * (.6 + (i % 5) * .2) * s, a, t, i, o.colours[i % o.colours.length]);
        }
      }
    };
  };

  var PART = {
    snow: function (ctx, x, y, r, a, t, i, c) {
      ctx.fillStyle = 'rgba(' + c + ',' + (.22 * a) + ')';
      ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(' + c + ',' + (.85 * a) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    },
    leaf: function (ctx, x, y, size, a, t, i, c) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * (.6 + (i % 6) * .08) + i);
      ctx.scale(1, .5 + Math.abs(Math.sin(t * .9 + i)) * .5);
      ctx.globalAlpha = a * (.75 + (i % 3) * .08);
      ctx.fillStyle = 'rgb(' + c + ')';
      ctx.beginPath(); ctx.moveTo(-size, 0); ctx.quadraticCurveTo(0, -size * .8, size, 0); ctx.quadraticCurveTo(0, size * .8, -size, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,160,.5)'; ctx.lineWidth = Math.max(.6, size * .08);
      ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.stroke();
      ctx.restore();
    },
    petal: function (ctx, x, y, size, a, t, i, c) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * (.8 + (i % 5) * .1) + i);
      ctx.scale(1, .35 + Math.abs(Math.sin(t * 1.3 + i)) * .65);
      ctx.globalAlpha = a * .9; ctx.fillStyle = 'rgb(' + c + ')';
      ctx.beginPath(); ctx.ellipse(0, 0, size, size * .62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
    confetti: function (ctx, x, y, size, a, t, i, c) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * (1.5 + (i % 4) * .4) + i);
      ctx.scale(Math.cos(t * 4 + i), 1);
      ctx.globalAlpha = a * .9; ctx.fillStyle = 'rgb(' + c + ')';
      ctx.fillRect(-size * .5, -size * .25, size, size * .5);
      ctx.restore();
    },
    glitter: function (ctx, x, y, r, a, t, i, c) {
      var tw = a * (.4 + .6 * Math.abs(Math.sin(t * 5 + i)));
      glow(ctx, x, y, r * 2.4, r * 2.4, 'rgba(' + c + ',' + (.9 * tw) + ')', 'rgba(' + c + ',' + (.25 * tw) + ')', 'screen');
    },
    ember: function (ctx, x, y, r, a, t, i, c) {
      var tw = a * (.5 + .5 * Math.abs(Math.sin(t * 6 + i)));
      glow(ctx, x, y, r * 2.2, r * 2.2, 'rgba(' + c + ',' + (.95 * tw) + ')', 'rgba(' + c + ',' + (.35 * tw) + ')', 'screen');
    },
    firefly: function (ctx, x, y, r, a, t, i, c) {
      var tw = a * Math.pow(Math.max(0, Math.sin(t * 1.7 + i * 1.9)), 2);
      glow(ctx, x, y, r * 3, r * 3, 'rgba(' + c + ',' + (.9 * tw) + ')', 'rgba(' + c + ',' + (.3 * tw) + ')', 'screen');
    },
    dust: function (ctx, x, y, r, a, t, i, c) {
      glow(ctx, x, y, r * 2.2, r * 1.1, 'rgba(' + c + ',' + (.22 * a) + ')', 'rgba(' + c + ',' + (.08 * a) + ')', 'source-over');
    }
  };

  // Bursts going off one after another at spread-out spots in box; off for reduce-motion.
  FX.fireworks = function (o) {
    var LIFE = 2.4;
    return {
      draw: function (ctx, s, t, still) {
        if (still) return;
        for (var k = Math.max(0, Math.floor((t - LIFE) / o.every)); k * o.every <= t; k++) {
          var age = t - k * o.every;
          if (age > LIFE) continue;
          var cx = o.box[0] + q(k, .61803399) * (o.box[2] - o.box[0]), cy = o.box[1] + q(k, .7548777) * (o.box[3] - o.box[1]);
          var col = o.colours[k % o.colours.length], R = 60 + (k % 4) * 18;
          var grow = 1 - Math.pow(1 - Math.min(1, age / .9), 3), fade = Math.max(0, 1 - age / LIFE);
          if (age < .25) glow(ctx, cx * s, cy * s, R * .8 * s, R * .8 * s, 'rgba(255,250,235,' + (.6 * (1 - age / .25)) + ')', 'rgba(' + col + ',.2)', 'screen');
          ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'round';
          for (var n = 0; n < 40; n++) {
            var ang = n / 40 * Math.PI * 2 + k, dist = R * grow * (.75 + (n % 3) * .12);
            var x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist + age * age * 14;
            var tx = cx + Math.cos(ang) * dist * .8, ty = cy + Math.sin(ang) * dist * .8 + age * age * 12;
            ctx.strokeStyle = 'rgba(' + col + ',' + (.35 * fade) + ')'; ctx.lineWidth = 1.2 * s;
            ctx.beginPath(); ctx.moveTo(tx * s, ty * s); ctx.lineTo(x * s, y * s); ctx.stroke();
            ctx.fillStyle = 'rgba(' + col + ',' + (fade * (.6 + .4 * Math.sin(age * 20 + n))) + ')';
            ctx.beginPath(); ctx.arc(x * s, y * s, 1.6 * s, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }
      }
    };
  };

  // Bats crossing the sky, wings beating. Held mid-flight for reduce-motion.
  FX.bats = function (o) {
    return {
      draw: function (ctx, s, t, still) {
        for (var i = 0; i < o.count; i++) {
          var phase = still ? q(i, .61803399) : (t / (14 + (i % 4) * 3) + i * .37) % 1;
          var x = (o.box[0] + phase * (o.box[2] - o.box[0])) * s;
          var y = (o.box[1] + q(i, .7548777) * (o.box[3] - o.box[1]) + Math.sin(t * 1.4 + i) * 18) * s;
          var w = (9 + (i % 3) * 3) * s, lift = (still ? .5 : Math.sin(t * 14 + i * 2)) * w * .6;
          var a = Math.min(1, phase * 8, (1 - phase) * 8);
          ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(18,10,22,' + (.9 * a) + ')';
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(-w * .5, -lift - w * .2, -w, -lift);
          ctx.quadraticCurveTo(-w * .7, -lift * .3 + w * .15, -w * .45, w * .05);
          ctx.quadraticCurveTo(-w * .25, w * .2, 0, w * .25);
          ctx.quadraticCurveTo(w * .25, w * .2, w * .45, w * .05);
          ctx.quadraticCurveTo(w * .7, -lift * .3 + w * .15, w, -lift);
          ctx.quadraticCurveTo(w * .5, -lift - w * .2, 0, 0);
          ctx.fill(); ctx.restore();
        }
      }
    };
  };

  // A searchlight cone from a point, sweeping a few degrees either way.
  FX.beam = function (o) {
    return {
      draw: function (ctx, s, t) {
        var ang = (o.angle + Math.sin(t * Math.PI * 2 / o.period) * o.sweep) * Math.PI / 180;
        var p = .75 + .25 * Math.sin(t * 3.1), L = o.len * s, half = Math.tan(o.width * Math.PI / 180) * L;
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        ctx.translate(o.from[0] * s, o.from[1] * s); ctx.rotate(ang);
        var g = ctx.createLinearGradient(0, 0, L, 0);
        g.addColorStop(0, 'rgba(' + o.colour + ',' + (.45 * p) + ')'); g.addColorStop(1, 'rgba(' + o.colour + ',0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, -half); ctx.lineTo(L, half); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    };
  };

  // The poster's own aurora (or anything weight() picks out), brightened in vertical
  // slices that rise and fall out of step, so the curtains seem to ripple.
  FX.shimmer = function (o) {
    var mask = null;
    return {
      init: function (px) {
        var b = o.box, w = b[2] - b[0], h = b[3] - b[1], tint = o.tint.split(',').map(Number);
        mask = document.createElement('canvas'); mask.width = w; mask.height = h;
        var mc = mask.getContext('2d'), data = mc.createImageData(w, h), d = data.data;
        for (var yy = 0; yy < h; yy++) {
          for (var xx = 0; xx < w; xx++) {
            var k = (yy * w + xx) * 4, edge = Math.min(1, xx / 16, (w - xx) / 16, yy / 12, (h - yy) / 12);
            d[k] = tint[0]; d[k + 1] = tint[1]; d[k + 2] = tint[2];
            d[k + 3] = Math.round(255 * WEIGHT[o.weight](px(b[0] + xx, b[1] + yy)) * edge);
          }
        }
        mc.putImageData(data, 0, 0);
      },
      draw: function (ctx, s, t) {
        if (!mask) return;
        var N = 10, sw = mask.width / N;
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        for (var n = 0; n < N; n++) {
          ctx.globalAlpha = o.strength * (.5 + .5 * Math.sin(t * .9 + n * .8));
          ctx.drawImage(mask, n * sw, 0, sw, mask.height, (o.box[0] + n * sw) * s, o.box[1] * s, sw * s, mask.height * s);
        }
        ctx.restore();
      }
    };
  };

  // A tumbleweed bouncing across the ground from right to left, now and then.
  FX.tumbleweed = function (o) {
    return {
      draw: function (ctx, s, t, still) {
        if (still) return;
        var phase = (t / o.period) % 1;
        var x = (IW + 80 - phase * (IW + 160)) * s;
        var y = (o.y - Math.abs(Math.sin(phase * Math.PI * 7)) * 22) * s, r = o.size * s;
        ctx.save(); ctx.translate(x, y); ctx.rotate(-t * 3);
        ctx.strokeStyle = 'rgba(120,80,40,.85)'; ctx.lineWidth = Math.max(1, 1.4 * s);
        for (var k = 0; k < 9; k++) {
          ctx.beginPath(); ctx.ellipse(0, 0, r * (.6 + (k % 3) * .2), r * (.35 + (k % 4) * .15), k * .7, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }
    };
  };

  // Low mist drifting slowly sideways.
  FX.fog = function (o) {
    return {
      draw: function (ctx, s, t) {
        var b = o.box;
        for (var k = 0; k < 4; k++) {
          var u = (q(k, .61803399) + t / (60 + k * 13)) % 1, a = Math.min(1, u * 5, (1 - u) * 5);
          var x = b[0] + u * (b[2] - b[0]), y = b[1] + q(k, .7548777) * (b[3] - b[1]);
          glow(ctx, x * s, y * s, 260 * s, 60 * s, 'rgba(' + o.colour + ',' + (.16 * a) + ')', 'rgba(' + o.colour + ',' + (.07 * a) + ')', 'screen');
        }
      }
    };
  };

  // Started last, once FX, PART, PICK and WEIGHT above have been filled in.
  if (sheet.motion) sheet.motion();
  else if (sheet.effects) runEffects(sheet);

  window.JJLoginArt = {
    // Called by app.js once Supabase has accepted the password, so the next
    // time this browser lands on the login screen it gets a fresh pick.
    advance: function () { store(choose(sheet.key)); }
  };
})();
