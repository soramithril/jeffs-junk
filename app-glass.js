/* ── HOMEPAGE OPTION E: THE GLASS LOOK ─────────────────────────────────────────
   Jake, 2026-11-05: the dashboard's old layout, but every page in the frosted-glass
   look from his "Glassy Dashboard" video, over this season's login picture.

   app-home.js turns it on and off with JJGlass.set() when someone picks E (or signs
   in with E saved). It only puts html.jj-glass on and lays the picture behind the
   page; app-glass.css does the rest, and every rule there also needs body.signed-in,
   so nothing shows behind the sign-in screen.

   The picture is one of today's login posters (JJSeasonArt in login-art.js), moving on
   to the next every hour on the hour. It is worked out from the clock, so every tab
   and every computer shows the same one. Jake chose real blur (2026-11-05), knowing
   that blur over a full-screen picture is what made October's Halloween look lag:
   that is why the picture here never moves and nothing animates behind the cards. */
window.JJGlass = (function () {
  var HOUR = 60 * 60 * 1000;
  var layer = null, timer = null, shown = '';
  // Chart labels and grid lines are drawn by Chart.js, not CSS: light ones on glass.
  var CHART = { color: Chart.defaults.color, borderColor: Chart.defaults.borderColor };

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
    paint();
    timer = setInterval(paint, 60 * 1000);   // catches the hour within a minute
  }
  return { set: set };
})();
