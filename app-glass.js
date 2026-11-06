/* ── HOMEPAGE OPTION E: THE GLASS LOOK AND THE MOCKUP'S MENUS ─────────────────
   Jake, 2026-11-05: every page in the frosted-glass look from his "Glassy Dashboard"
   video, over this season's login picture, with the mockup's menus: a pill menu
   across the top and a small floating icon strip down the left, in place of the
   green side menu. E's home screen itself is app-glass-home.js.

   app-home.js turns it on and off with JJGlass.set() when someone picks E (or signs
   in with E saved). This puts html.jj-glass on, lays the picture behind the page
   and builds the menus; app-glass.css does the rest, and every rule there also needs
   body.signed-in, so nothing shows behind the sign-in screen.

   The menus are made from the side menu's own buttons (same icons, same clicks), so
   they open exactly what the side menu opens. The side menu is only hidden, never
   taken apart: liquid-nav.js still needs it whole for Old and A-D. Under E the
   stretching tab doesn't show (Jake chose the mockup's menus, 2026-11-05).

   The picture is one of today's login posters (JJSeasonArt in login-art.js), moving on
   to the next every hour on the hour. It is worked out from the clock, so every tab
   and every computer shows the same one. Jake chose real blur (2026-11-05), knowing
   that blur over a full-screen picture is what made October's Halloween look lag:
   that is why the picture here never moves and nothing animates behind the cards. */
window.JJGlass = (function () {
  var HOUR = 60 * 60 * 1000;
  var layer = null, timer = null, shown = '', menus = null;
  // Chart labels and grid lines are drawn by Chart.js, not CSS: light ones on glass.
  var CHART = { color: Chart.defaults.color, borderColor: Chart.defaults.borderColor };
  // Which side-menu buttons go where, by the page they open.
  var PILLS = ["go('dashboard')", "go('clients')", "go('jobs')", "go('bininventory')", "goJwg('schedule')", "go('landscaping')"];
  var RAIL = ["go('pricing')", "go('drdcalc')", "go('junkquotes')", "go('livejobs')", "go('dispatch')"];
  var ICO = {
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 7l9 6 9-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  function svg(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[k] + '</svg>'; }

  function picture() {
    var list = JJSeasonArt.pictures();
    return list[Math.floor(Date.now() / HOUR) % list.length];
  }
  // The new picture is swapped in only once it has loaded, so the page never goes blank.
  function paint() {
    var url = picture();
    if (url === shown) return;
    shown = url;
    var img = new Image();
    img.onload = function () { if (shown === url) layer.style.backgroundImage = 'url("' + url + '")'; };
    img.src = url;
  }

  // ── the menus ──
  function source(click) {
    var b = [].filter.call(document.querySelectorAll('.sidebar .nav-item'), function (x) { return x.getAttribute('onclick') === click; })[0];
    if (!b) throw new Error('Glass menus: no side-menu button for ' + click);
    return b;
  }
  function label(b) { return b.querySelector('.nav-txt > span').textContent.trim(); }
  function viewOf(click) { return /^goJwg/.test(click) ? 'view-jwgscheduler' : 'view-' + click.match(/go\('([^']+)'\)/)[1]; }
  function button(cls, click, inner, tip) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.setAttribute('onclick', click);
    if (tip) b.title = tip;
    b.innerHTML = inner;
    return b;
  }
  function build() {
    var top = document.createElement('header');
    top.id = 'jg-top';
    var logo = button('jg-logo', "go('dashboard')", "<b>JEFF'S JUNK</b>", 'Home');
    var pills = document.createElement('nav');
    pills.className = 'jg-pills';
    PILLS.forEach(function (click) {
      var s = source(click), name = click === "go('dashboard')" ? 'Home' : label(s);
      var b = button('jg-pill', click, s.querySelector('.icon').innerHTML + '<span>' + escHtml(name) + '</span>');
      b.dataset.view = viewOf(click);
      pills.appendChild(b);
    });
    var more = button('jg-pill jg-more', 'toggleMoreFlyout()', svg('more') + '<span>More</span>');
    pills.appendChild(more);
    var right = document.createElement('div');
    right.className = 'jg-right';
    right.appendChild(button('jg-iconbtn', "go('bookings')", svg('mail'), 'Bookings & email'));
    right.appendChild(button('jg-iconbtn', 'openPalette()', svg('search'), 'Find a customer, job or bin ( / )'));
    var me = button('jg-avatar', 'handleAdminBtn()', escHtml(String(currentUser.displayName || '?').trim().charAt(0).toUpperCase()), 'Sign out');
    right.appendChild(me);
    top.appendChild(logo);
    top.appendChild(pills);
    top.appendChild(right);

    var rail = document.createElement('aside');
    rail.id = 'jg-rail';
    rail.appendChild(button('jg-r jg-r-new', 'newJob()', svg('plus') + '<span class="jg-tip">New job</span>'));
    RAIL.forEach(function (click) {
      var s = source(click);
      var b = button('jg-r', click, s.querySelector('.icon').innerHTML + '<span class="jg-tip">' + escHtml(label(s)) + '</span>');
      b.dataset.view = viewOf(click);
      rail.appendChild(b);
    });
    document.body.appendChild(top);
    document.body.appendChild(rail);
    // The page on screen lights up its pill or icon; anything else lights up More.
    var mark = function () {
      var on = document.querySelector('.view.active'), id = on ? on.id : '', hit = false;
      document.querySelectorAll('#jg-top [data-view], #jg-rail [data-view]').forEach(function (b) {
        var yes = b.dataset.view === id;
        b.classList.toggle('on', yes);
        hit = hit || yes;
      });
      more.classList.toggle('on', !hit);
    };
    var mo = new MutationObserver(mark);
    document.querySelectorAll('.view').forEach(function (v) { mo.observe(v, { attributes:true, attributeFilter:['class'] }); });
    mark();
    return { top: top, rail: rail };
  }

  function set(on) {
    document.documentElement.classList.toggle('jj-glass', on);
    Chart.defaults.color = on ? 'rgba(244,247,245,.78)' : CHART.color;
    Chart.defaults.borderColor = on ? 'rgba(255,255,255,.12)' : CHART.borderColor;
    clearInterval(timer);
    if (!on) return;
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'jj-glass-bg';
      layer.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(layer, document.body.firstChild);
    }
    if (!menus) menus = build();
    paint();
    timer = setInterval(paint, 60 * 1000);   // catches the hour within a minute
  }
  return { set: set };
})();
