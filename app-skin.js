/* ── THE LOOK BUTTON: NORMAL / GREEN / DARK GLASS / FROSTED GLASS (v760) ─────────────
   Jake 2026-11-20: the two looks from his videos go in as options everyone can flip, so
   he can go over them with the office and see which they like best. The earlier frosted
   glass look (app-glass.js) stays as the fourth choice, on his word.

   Everyone signed in gets the Look button, bottom right beside Help. The choice is kept
   in this browser (localStorage jjLook); a computer that has never picked shows Normal.

   What this file does:
     - draws the button and its four choices
     - puts html.jj-skin + html.jj-skin-green / html.jj-skin-dark on (app-skin.css does
       the colours), or hands over to JJGlass.set() for Frosted glass
     - moves the menu pill: the front edge runs ahead, the back edge catches up
     - Dark glass on a desktop: builds the row of pills across the top from the side
       menu's own buttons (same names, same icons, same clicks)

   Who is signed in: app.js writes the name into #logged-in-username and marks
   #user-card signed-out on sign-out. Watching them keeps this out of app.js. */
(function () {
  var KEY = 'jjLook';
  var LOOKS = [
    { id: 'normal',  name: 'Normal',        hint: 'The app as it is today',          swatch: '#f7f9f8' },
    { id: 'green',   name: 'Green',         hint: 'Dark green, menu on the side',    swatch: 'linear-gradient(135deg,#0c1b14,#3fc673)' },
    { id: 'dark',    name: 'Dark glass',    hint: 'Dark, menu across the top',       swatch: 'linear-gradient(135deg,#16191c,#56b9ee)' },
    { id: 'frosted', name: 'Frosted glass', hint: 'The season picture behind glass', swatch: 'linear-gradient(135deg,#5d6b62,#cfd8d2)' }
  ];
  var html = document.documentElement;
  var signedIn = false, who = '', current = 'normal';
  var CHART = null;   // Chart.js draws its own labels and grid lines: remembered so Normal gets them back

  function saved() {
    var v = null;
    try {
      v = localStorage.getItem(KEY);
      // The frosted look used to have its own on/off switch (jjGlass). Carry that over once.
      if (!v && localStorage.getItem('jjGlass') === '1') v = 'frosted';
    } catch (e) {}
    return LOOKS.some(function (l) { return l.id === v; }) ? v : 'normal';
  }

  // ── the pill that follows the active menu item ──
  // Each frame the pill's edges close in on the target. The edge facing the way it is
  // travelling moves fast and the other one slow, which is the stretch. Following every
  // frame (instead of animating once) keeps it right while the side menu opens on hover.
  function follower(pill, host, target) {
    var s = null;
    function tick(snap) {
      var el = target();
      if (!el) { pill.style.opacity = '0'; s = null; return; }
      var h = host.getBoundingClientRect(), r = el.getBoundingClientRect();
      // Measured from the host's inside edge (its border is not part of where the pill sits).
      var ox = h.left + host.clientLeft - host.scrollLeft, oy = h.top + host.clientTop - host.scrollTop;
      var to = { l: r.left - ox, t: r.top - oy, r: r.right - ox, b: r.bottom - oy };
      if (!s || snap) s = to;
      else {
        s.l += (to.l - s.l) * (to.l < s.l ? 0.30 : 0.15);
        s.r += (to.r - s.r) * (to.r > s.r ? 0.30 : 0.15);
        s.t += (to.t - s.t) * (to.t < s.t ? 0.30 : 0.15);
        s.b += (to.b - s.b) * (to.b > s.b ? 0.30 : 0.15);
        ['l', 't', 'r', 'b'].forEach(function (k) { if (Math.abs(to[k] - s[k]) < 0.4) s[k] = to[k]; });
      }
      pill.style.opacity = '1';
      pill.style.transform = 'translate(' + s.l.toFixed(1) + 'px,' + s.t.toFixed(1) + 'px)';
      pill.style.width = (s.r - s.l).toFixed(1) + 'px';
      pill.style.height = (s.b - s.t).toFixed(1) + 'px';
    }
    return tick;
  }

  var sidebar, nav, sidePill, sideTick, topBar = null, topTick = null, topFor = '', snapNext = true, running = false;
  function sideTarget() {
    var a = nav.querySelector(':scope > .nav-item.active');
    if (!a) a = document.getElementById('nav-more-label');   // a More tools page is open: the pill sits on More tools
    var n = nav.getBoundingClientRect(), r = a.getBoundingClientRect();
    return (r.bottom < n.top + 4 || r.top > n.bottom - 4) ? null : a;   // scrolled out of the menu
  }
  function loop() {
    if (!running) return;
    var snap = snapNext; snapNext = false;
    sideTick(snap);
    if (topTick && current === 'dark') topTick(snap);
    requestAnimationFrame(loop);
  }

  // ── Dark glass: the row of pills across the top ──
  var SVG = {
    find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>'
  };
  // A button's name: the span after its icon (the Daily ones nest a hint line inside it).
  function label(b) { var s = b.querySelector(':scope > span:not(.icon)'); return (s.querySelector('span') || s).textContent.trim(); }
  function btn(cls, click, inner, tip) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.setAttribute('onclick', click);
    if (tip) b.title = tip;
    b.innerHTML = inner;
    return b;
  }
  function buildTop() {
    if (topBar) topBar.remove();
    topBar = document.createElement('header');
    topBar.id = 'jk-top';
    var row1 = document.createElement('div'); row1.className = 'jk-row';
    row1.appendChild(btn('jk-logo', "go('dashboard')", "JEFF'S JUNK", 'Dashboard'));
    row1.appendChild(btn('jk-find', 'openPalette()', SVG.find + '<span>Find a customer, job or bin</span>', 'Find a customer, job or bin ( / )'));
    row1.appendChild(btn('jk-new', 'newJob()', SVG.plus + 'New Job', 'Create a new job (N)'));
    row1.appendChild(btn('jk-me', 'handleAdminBtn()', escHtml(who.charAt(0).toUpperCase()), 'Sign out'));
    var row2 = document.createElement('div'); row2.className = 'jk-row';
    var pills = document.createElement('nav'); pills.className = 'jk-pills';
    var pill = document.createElement('span'); pill.id = 'jk-toppill';
    pills.appendChild(pill);
    var pairs = [], lastLabel = null;
    // Walk the side menu's own rows in order: every page this person is allowed to see.
    [].forEach.call(nav.children, function (el) {
      if (el.id === 'nav-more-label' || el.id === 'nav-more') return;
      if (el.classList.contains('nav-label')) { lastLabel = el; return; }
      if (!el.classList.contains('nav-item') || el.classList.contains('nav-item-action')) return;
      if (getComputedStyle(el).display === 'none') return;   // a page this person does not get
      if (lastLabel && pairs.length) { var sep = document.createElement('span'); sep.className = 'jk-sep'; pills.appendChild(sep); }
      lastLabel = null;
      var ic = el.querySelector('.icon');
      var p = btn('jk-p', el.getAttribute('onclick'), (ic ? ic.innerHTML : '') + '<span>' + escHtml(label(el)) + '</span>');
      pills.appendChild(p);
      pairs.push([el, p]);
    });
    var sep2 = document.createElement('span'); sep2.className = 'jk-sep'; pills.appendChild(sep2);
    var more = btn('jk-p', 'toggleMoreFlyout()', SVG.more + '<span>More tools</span>');
    pills.appendChild(more);
    row2.appendChild(pills);
    topBar.appendChild(row1);
    topBar.appendChild(row2);
    document.body.appendChild(topBar);
    topFor = who;
    // The side menu already knows which page is open: copy its answer onto the pills.
    function mark() {
      var hit = false;
      pairs.forEach(function (pr) { var on = pr[0].classList.contains('active'); pr[1].classList.toggle('on', on); hit = hit || on; });
      more.classList.toggle('on', !hit);
    }
    new MutationObserver(mark).observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true });
    mark();
    topTick = follower(pill, pills, function () { return pills.querySelector('.jk-p.on'); });
    pills.addEventListener('scroll', function () { snapNext = true; });
  }

  // ── turning a look on ──
  function apply(look) {
    current = look;
    var skin = look === 'green' || look === 'dark';
    html.classList.toggle('jj-skin', skin);
    html.classList.toggle('jj-skin-green', look === 'green');
    html.classList.toggle('jj-skin-dark', look === 'dark');
    var frosted = look === 'frosted';
    if (frosted !== html.classList.contains('jj-glass')) JJGlass.set(frosted);   // it sets its own chart colours
    if (!frosted) {
      Chart.defaults.color = skin ? 'rgba(242,246,244,.78)' : CHART.color;
      Chart.defaults.borderColor = skin ? 'rgba(255,255,255,.12)' : CHART.borderColor;
    }
    if (look === 'dark' && (!topBar || topFor !== who)) buildTop();
    snapNext = true;
    if (skin && !running) { running = true; requestAnimationFrame(loop); }
    if (!skin) running = false;
    draw();
  }

  // ── the button ──
  function draw() {
    var box = document.getElementById('jj-look');
    if (!signedIn) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'jj-look';
      var menu = document.createElement('div');
      menu.id = 'jj-look-menu';
      LOOKS.forEach(function (l) {
        var b = document.createElement('button');
        b.type = 'button';
        b.id = 'jj-look-' + l.id;
        b.innerHTML = '<i style="background:' + l.swatch + '"></i><span>' + l.name + '<small>' + l.hint + '</small></span>';
        b.addEventListener('click', function () {
          try { localStorage.setItem(KEY, l.id); } catch (e) {}
          box.classList.remove('open');
          apply(l.id);
        });
        menu.appendChild(b);
      });
      var main = document.createElement('button');
      main.type = 'button';
      main.id = 'jj-look-btn';
      main.title = 'Try a different look. It only changes this computer.';
      main.addEventListener('click', function () { box.classList.toggle('open'); });
      box.appendChild(menu);
      box.appendChild(main);
      document.body.appendChild(box);
      document.addEventListener('click', function (e) { if (!box.contains(e.target)) box.classList.remove('open'); });
    }
    LOOKS.forEach(function (l) {
      document.getElementById('jj-look-' + l.id).classList.toggle('on', l.id === current);
      if (l.id === current) document.getElementById('jj-look-btn').textContent = 'Look: ' + l.name;
    });
  }

  function start() {
    var nameEl = document.getElementById('logged-in-username');
    var card = document.getElementById('user-card');
    sidebar = document.getElementById('sidebar');
    nav = sidebar && sidebar.querySelector('.nav');
    if (!nameEl || !card || !nav) throw new Error('app-skin.js: the side menu or the signed-in name is missing, cannot run the Look button');
    CHART = { color: Chart.defaults.color, borderColor: Chart.defaults.borderColor };
    sidePill = document.createElement('span');
    sidePill.id = 'jk-pill';
    sidebar.appendChild(sidePill);
    sideTick = follower(sidePill, sidebar, sideTarget);
    nav.addEventListener('scroll', function () { snapNext = true; });
    window.addEventListener('resize', function () { snapNext = true; });
    function check() {
      var now = !card.classList.contains('signed-out'), name = now ? nameEl.textContent.trim() : '';
      if (now === signedIn && name === who) return;
      signedIn = now; who = name;
      apply(signedIn ? saved() : 'normal');   // signed out: back to Normal, the choice stays saved
    }
    new MutationObserver(check).observe(nameEl, { childList: true, characterData: true, subtree: true });
    new MutationObserver(check).observe(card, { attributes: true, attributeFilter: ['class'] });
    check();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
