/* ═══════════════════════════════════════════════════════════════════
   LOGIN ART — which of the nine sheets you get, and what it says
   ═══════════════════════════════════════════════════════════════════
   Nine approved login designs (Barb's set, via ChatGPT). They run in a
   fixed round-robin so you never see the same one twice in a row.

   The counter moves forward exactly once, on a Supabase-verified
   sign-in — app.js calls advance() at that point. Deliberately NOT on
   page load: otherwise refreshing the login screen, or mistyping your
   password and reloading, would shuffle the artwork under you. Sit on
   the login screen as long as you like; it stays put.

   Loaded from index.html directly after the login markup, so the sheet
   is chosen before first paint and nothing flashes.

   Styling for all nine lives in login-art.css; artwork in assets/login/. */
(function () {
  'use strict';

  var STORE = 'jjLoginArt';

  var SHEETS = [
    {
      key: 'classic',
      headline: ['BUILT', 'TO MOVE'],      // painted into this sheet's artwork; hidden by CSS
      eyebrow: 'EVERY JOB. ON TIME.',
      tagline: 'OPERATIONS',
      title: 'Welcome back',
      intro: 'Sign in and keep the day moving.',
      button: 'SIGN IN'
    },
    {
      key: 'poster',
      headline: ['WE HAUL', 'IT ALL'],
      eyebrow: 'FAST LANE TO A CLEAN SPACE',
      tagline: 'READY · SET · HAUL',
      title: 'Start your engines',
      intro: 'Your next pickup starts here.',
      button: 'START YOUR RUN'
    },
    {
      key: 'pit',
      headline: ['GREEN', 'MEANS GO'],
      eyebrow: 'SYSTEM ONLINE',
      tagline: 'LIGHTS OUT · BINS OUT',
      title: 'Clear for dispatch',
      intro: 'Routes, jobs and crews—ready when you are.',
      button: 'ENTER DISPATCH'
    },
    {
      key: 'roadrunner',
      headline: ['LET LOOSE', 'THE ROADRUNNER'],
      eyebrow: 'DRIVER 01 · ROADRUNNER',
      tagline: 'BEEP BEEP · LET’S HAUL',
      title: 'Let loose the Roadrunner',
      intro: 'Fast lane to the next pickup.',
      button: 'RELEASE THE ROADRUNNER'
    },
    {
      key: 'fullthrottle',
      headline: ['HE’S', 'HAULING'],
      eyebrow: 'BUILT TO HAUL · BORN TO MOVE',
      tagline: 'LOAD IT · ROLL IT · GONE',
      title: 'Drop the green flag',
      intro: 'Another load is ready to move.',
      button: 'LIGHTS OUT · BINS OUT'
    },
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
      key: 'overhead',
      headline: ['PIT CREW', 'READY'],
      eyebrow: 'CREW ON DECK',
      tagline: 'LOAD · CHECK · ROLL',
      title: 'Call in the crew',
      intro: 'The lane is clear and the next load is ready.',
      button: 'ENTER THE PIT'
    },
    {
      key: 'blueprint',
      headline: ['BUILT BY', 'THE BLUEPRINT'],
      eyebrow: 'ENGINEERED FOR EVERY LOAD',
      tagline: 'PLAN IT · LOAD IT · HAUL IT',
      title: 'Plans are ready',
      intro: 'Every detail is lined up for the next job.',
      button: 'OPEN THE PLANS'
    },
    {
      key: 'engineering',
      headline: ['BUILT TO', 'OUTWORK'],
      eyebrow: 'SYSTEMS CHECK · ALL GREEN',
      tagline: 'POWER · PRECISION · PURPOSE',
      title: 'All systems green',
      intro: 'The truck is ready. Your next job is queued.',
      button: 'ENTER OPERATIONS'
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

  // ── THE NINE ──
  // Nine posters is only a nice thing if anyone finds out there are nine. The dots
  // say how many there are and which one you are on, and any of them can be picked
  // outright. The sheet is built once, at page load — see the top of this file — so
  // choosing one reloads rather than trying to rebuild it underneath you.
  var dots = document.getElementById('jjl-dots');
  if (dots) {
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

  window.JJLoginArt = {
    // Called by app.js once Supabase has accepted the password, so the next
    // time this browser lands on the login screen it gets the next sheet.
    advance: function () {
      try { localStorage.setItem(STORE, String((storedIndex() + 1) % SHEETS.length)); } catch (e) {}
    }
  };
})();
