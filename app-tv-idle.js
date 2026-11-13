/* Office TV driving report (Jake, 2026-11-13): it plays on the office TV once Kelly has
   left the dashboard alone for 15 minutes in the afternoon. This file only notices "nobody
   has touched this page for 15 minutes after 1 PM" and tells the database once a day;
   tv_kelly_idle() decides whether it counts (Kelly only, from 1 PM Toronto time), and
   office-tv.html plays the report when it sees the row. */
(function () {
  var IDLE_MS = 15 * 60 * 1000;
  var last = Date.now(), sentDay = '';
  ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (ev) {
    window.addEventListener(ev, function () { last = Date.now(); }, { passive: true, capture: true });
  });
  setInterval(function () {
    var now = new Date(), day = now.toDateString();
    if (now.getHours() < 13 || sentDay === day || Date.now() - last < IDLE_MS) return;
    if (!window.currentUser) return;   // signed out: nobody to report
    db.rpc('tv_kelly_idle').then(function (r) {
      if (r.error) { console.warn('TV idle signal failed', r.error.message); return; }
      sentDay = day;
    });
  }, 60000);
})();
