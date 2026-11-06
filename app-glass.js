/* ── HOMEPAGE OPTION E: THE GLASS LOOK AND THE MOCKUP'S MENUS ─────────────────
   Jake, 2026-11-05: every page in the frosted-glass look from his "Glassy Dashboard"
   video, over this season's login picture, with the mockup's menus: a pill menu
   across the top and a small floating icon strip down the left, in place of the
   green side menu. E's home screen itself is app-glass-home.js.

   app-home.js turns it on and off with JJGlass.set() when someone picks E (or signs
   in with E saved). This puts html.jj-glass on, lays the picture behind the page
   and builds the menus; app-glass.css does the rest, and every rule there also needs
   body.signed-in, so nothing shows behind the sign-in screen.

   The menus are made from the side menu's own buttons (same names, same clicks), so
   they open exactly what the side menu opens; the icons are the mockup's line icons. The side menu is only hidden, never
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
    plus: '<path d="M12 5v14M5 12h14"/>',
    // The mockup's plain line icons, one per page (the side menu's coloured tiles stay there).
    "go('dashboard')": '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    "go('clients')": '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    "go('jobs')": '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    "go('bininventory')": '<path d="M3 8h18l-2 12H5z"/><path d="M7 8V5h10v3"/>',
    "goJwg('schedule')": '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    "go('landscaping')": '<path d="M12 22V12M12 12C12 7 8 4 4 4c0 5 3 8 8 8zM12 14c0-4 3-7 8-7 0 4-3 7-8 7z"/>',
    "go('pricing')": '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    "go('drdcalc')": '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 18v2M19 18v2"/>',
    "go('junkquotes')": '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    "go('livejobs')": '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    "go('dispatch')": '<path d="M1 16V6h13v10M14 9h4l4 4v3h-8"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'
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
  // A button's name: the span after its icon (the Daily ones nest a hint line inside it).
  function label(b) { var s = b.querySelector(':scope > span:not(.icon)'); return (s.querySelector('span') || s).textContent.trim(); }
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
      var b = button('jg-pill', click, svg(click) + '<span>' + escHtml(name) + '</span>');
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
      var b = button('jg-r', click, svg(click) + '<span class="jg-tip">' + escHtml(label(s)) + '</span>');
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
