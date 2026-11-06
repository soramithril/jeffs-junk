/* ── Office TV: the new looks (Jake, 2026-11-06: "do it all") ─────────────────────
   Every screen now has more than one look and takes turns between them, one per lap
   of the board, so the wall changes without the lap getting any longer:
     Bin Work:          A driver cards · B next up + one list · C a tank per driver
     Operations:        the beat-last-year lanes · A odometer tiles · B tanks · C one big number
     Trucks on the Road: A trucks + rail · C map + the day as a timeline
   Bin Work A and Map A are drawn by office-tv.html itself (they are the old screens
   with the new marks added); everything else is built here from the data the page
   already loaded, passed in as `c` - this file never reads the database.
   The effects are plain-CSS versions of the React Bits ones in the mockup
   (tv-looks.css), so the Yodeck box gets no React and no canvas. */
window.JJTVLooks = (function () {
  var LOOKS = { bins:['a','b','c'], kpis:['lanes','a','b','c'], liveops:['a','c'] };
  var SVG_NS = 'viewBox="0 0 36 36"';

  // ── the effects ──
  // later = dashed ring, next = spinning arc, done = green disc with a tick drawn in
  function mark(state, size, warn) {
    var s = size || 30, a = 'class="tvl-mk' + (warn ? ' warn' : '') + '" width="' + s + '" height="' + s + '" ' + SVG_NS;
    if (state === 'done') return '<svg ' + a + '><circle class="ok" cx="18" cy="18" r="16"/><path class="tk" d="M10 18.5l5.5 5.5L26 13"/></svg>';
    if (state === 'next') return '<svg ' + a + '><circle class="rg" cx="18" cy="18" r="15"/><circle class="arc" cx="18" cy="18" r="15"/></svg>';
    return '<svg ' + a + '><circle class="rg" cx="18" cy="18" r="15"/></svg>';
  }
  // A number whose digits roll up from 0 like an odometer (settle() starts the roll).
  // Each digit is a 0-9 strip broken by <br>, so the page's countUp (which animates
  // plain-number leaves) leaves it alone.
  function odo(n) {
    return String(n).split('').map(function (d) {
      return /\d/.test(d) ? '<span class="tvl-odo"><i data-d="' + d + '">0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9</i></span>' : d;
    }).join('');
  }
  function shine(text, color) { return '<span class="tvl-shine" style="--sc:' + color + '">' + text + '</span>'; }
  // Items that take turns in one spot, `each` ms apiece. Two or three only (the keyframes).
  function rotate(items, each) {
    if (items.length === 1) return '<span class="tvl-rot"><span style="opacity:1">' + items[0] + '</span></span>';
    if (items.length > 3) throw new Error('rotate: two or three items only');
    var k = items.length === 2 ? 'tvlRot2' : 'tvlRot3', total = each * items.length;
    return '<span class="tvl-rot" style="--rk:' + k + ';--rd:' + total + 'ms">' + items.map(function (h, i) {
      return '<span style="animation-delay:' + (i * each) + 'ms">' + h + '</span>';
    }).join('') + '</span>';
  }
  function tank(pct, color, label) {
    var p = Math.max(0, Math.min(100, Math.round(pct)));
    return '<div class="tvl-tank" style="--lc:' + color + '"><div class="tks"></div>'
      + '<div class="lq" data-h="' + p + '"><svg viewBox="0 0 200 14" preserveAspectRatio="none"><path d="M0 7 Q25 0 50 7 T100 7 T150 7 T200 7 V14 H0z"/></svg></div>'
      + '<div class="pc">' + (label == null ? p + '%' : label) + '</div></div>';
  }
  // What just happened today, sliding past: bins dropped and picked up (the truck GPS
  // zones) and bookings entered. Empty when the HQ reads failed - then there is no strip.
  function ticker(c) {
    var items = latest(c);
    if (!items.length) return '';
    var row = items.map(function (x) {
      return '<span class="it"><i style="background:' + x.color + '"></i>' + c.esc(x.text) + ' <em>' + x.at + '</em></span>';
    }).join('');
    var secs = Math.max(30, items.length * 7);
    return '<div class="tvl-tick"><span class="tl">LATEST</span><div class="vw"><div class="rn" style="--td:' + secs + 's">' + row + row + '</div></div></div>';
  }
  function latest(c) {
    if (!c.hq) return [];
    var legs = {};
    c.board.forEach(function (g) { g.legs.forEach(function (l) { legs[l.j.job_id] = { g: g, l: l }; }); });
    var out = [];
    c.hq.notifs.forEach(function (n) {
      var hit = legs[n.job_id];
      if (!hit || (n.status !== 'dropped' && n.status !== 'pickedup')) return;
      var who = hit.g.crewId ? hit.g.name : 'A truck', size = (hit.l.j.bin_size || '').replace(/\s*yard/i, ' yd');
      out.push({ t: Date.parse(n.created_at), color: c.driverColor(hit.g.crewId),
        text: who + (n.status === 'dropped' ? ' dropped ' : ' picked up ') + (size ? 'a ' + size + ' bin' : 'a bin') + (hit.l.j.city ? ' · ' + hit.l.j.city : '') });
    });
    c.hq.entered.forEach(function (j) {
      var by = String(j.created_by || '').trim();
      if (!by || by === 'system') return;
      out.push({ t: Date.parse(j.created_at), color: '#e2c364', text: by + ' booked ' + (j.service || 'a job') + (j.city ? ' · ' + j.city : '') });
    });
    return out.sort(function (a, b) { return b.t - a.t; }).slice(0, 10).map(function (x) {
      x.at = new Date(x.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return x;
    });
  }
  // Start the rolls and fills once the new look is on the page (they animate FROM 0).
  function settle(root) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        [].forEach.call(root.querySelectorAll('.tvl-odo i'), function (i) { i.style.transform = 'translateY(-' + i.getAttribute('data-d') + 'em)'; });
        [].forEach.call(root.querySelectorAll('.tvl-tank .lq'), function (q) { q.style.height = q.getAttribute('data-h') + '%'; });
      });
    });
  }

  // ── Bin Work ──
  function allLegs(c) {
    var out = [];
    c.board.forEach(function (g) { g.legs.forEach(function (l) { out.push({ g: g, l: l }); }); });
    return out.sort(function (a, b) { return c.timeMins(a.l.time) - c.timeMins(b.l.time); });
  }
  // The leg each driver is on: their first not-done one, in time order.
  function nextOf(g) { for (var i = 0; i < g.legs.length; i++) if (!g.legs[i].done) return g.legs[i]; return null; }
  function legState(g, l) { return l.done ? 'done' : (l === nextOf(g) ? 'next' : 'later'); }
  function who(j) { return j.business_name || j.name || 'Customer'; }
  function size(j) { return (j.bin_size || '').replace(/\s*yard/i, ' yd'); }
  function kindWord(l) { return l.kind === 'drop' ? 'Drop-off' : 'Pickup'; }

  // B: the next stop large, everything else in one time-ordered list, and the ticker.
  function binsB(c) {
    var legs = allLegs(c);
    var nx = legs.filter(function (x) { return !x.l.done; })[0];
    var done = legs.filter(function (x) { return x.l.done; }).length;
    var needs = legs.filter(function (x) { return !x.l.done && !x.g.crewId; }).length;
    var left = '<div class="tvl-card tvl-next"><span class="tvl-k">' + (nx ? 'Next up' : 'All done') + '</span>';
    if (nx) {
      var j = nx.l.j;
      left += '<div class="big">' + rotate([c.esc(j.city || who(j)), c.esc(who(j)),
                c.esc(nx.g.crewId ? nx.g.name : 'Needs a driver') + (nx.l.time ? ' · ' + c.fmt12(nx.l.time) : '')], 2600) + '</div>'
           +  '<div class="sub">' + kindWord(nx.l) + (size(j) ? ' · ' + c.esc(size(j)) : '') + '</div>';
    } else {
      left += '<div class="big">' + shine('Every bin done!', '#86efac') + '</div>';
    }
    left += '<div class="nums"><div><span class="tvl-k">Done</span><b style="color:#86efac">' + odo(done) + '</b></div>'
         +  '<div><span class="tvl-k">To go</span><b>' + odo(legs.length - done) + '</b></div>'
         +  (needs ? '<div><span class="tvl-k">Need a driver</span><b style="color:#fca5a5">' + odo(needs) + '</b></div>' : '')
         +  '</div></div>';
    // the list starts two finished stops back, so the eye lands on what is coming
    var first = Math.max(0, legs.indexOf(nx) - 2), shown = legs.slice(first, first + 8);
    if (!nx) shown = legs.slice(-8);
    var rest = legs.length - shown.length;
    var list = '<div class="tvl-card tvl-list">' + shown.map(function (x) {
      var st = legState(x.g, x.l);
      return '<div class="it' + (x.l.done ? ' done' : '') + '" style="--c:' + c.driverColor(x.g.crewId) + '">'
        + '<span class="t">' + (x.l.time ? c.fmt12(x.l.time) : 'Any') + '</span>'
        + '<div><b>' + c.esc(x.l.j.city || who(x.l.j)) + '</b><span>' + c.esc((x.g.crewId ? x.g.name : 'Needs a driver') + ' · ' + kindWord(x.l) + ' · ' + who(x.l.j)) + '</span></div>'
        + mark(st, 34, !x.g.crewId) + '</div>';
    }).join('') + (rest > 0 ? '<div class="more">+ ' + rest + ' more today</div>' : '') + '</div>';
    return '<div class="tvl-bwb"><div class="gd">' + left + list + '</div>' + ticker(c) + '</div>';
  }

  // C: one card per driver with a tank that fills as their stops are done.
  function binsC(c) {
    var n = c.board.length, cols = n <= 6 ? n : Math.ceil(n / 2), rows = n <= 6 ? 1 : 2;
    var maxStops = rows === 1 ? 6 : 3;
    var cards = c.board.map(function (g) {
      var pct = g.legs.length ? g.done / g.legs.length * 100 : 0, warn = !g.crewId;
      var color = warn ? '#ef4444' : c.driverColor(g.crewId);
      var stops = g.legs.slice(0, maxStops).map(function (l) {
        return '<div class="stp' + (l.done ? ' done' : '') + '">' + mark(legState(g, l), 24, warn)
          + c.esc((l.time ? c.fmt12(l.time) + ' · ' : '') + (l.j.city || who(l.j))) + '</div>';
      }).join('');
      var more = g.legs.length > maxStops ? '<div class="more">+ ' + (g.legs.length - maxStops) + ' more</div>' : '';
      return '<div class="tvl-card tvl-gc' + (warn ? ' warn tvl-star' : '') + '">'
        + '<div><div class="nm">' + c.esc(warn ? 'Needs a driver' : g.name) + '</div><div class="sub">' + g.done + ' of ' + g.legs.length + ' done</div></div>'
        + tank(pct, color, g.done + '/' + g.legs.length)
        + '<div class="stops">' + stops + more + '</div></div>';
    }).join('');
    return '<div class="tvl-bwc" style="grid-template-columns:repeat(' + cols + ',minmax(0,1fr));grid-template-rows:repeat(' + rows + ',minmax(0,1fr))">' + cards + '</div>';
  }

  // ── Operations ──
  // The same three services the lanes race, with the same numbers (renderKpis builds them).
  function pctLine(s, MON) {
    if (s.pct == null) return '<span>New this year</span>';
    return '<span class="' + (s.pct >= 0 ? 'tvl-up' : 'tvl-down') + '">' + (s.pct >= 0 ? '▲ ' : '▼ ') + Math.abs(s.pct) + '%</span> vs ' + s.lastTd + ' by this day last ' + MON;
  }
  // A: six tiles, each number rolling in like an odometer, each edge glowing.
  function opsA(c) {
    var k = c.kpi, MON = c.month.slice(0, 3);
    var tiles = [
      ['Bins out now', k.binsOut, '#22d3ee', c.yardIn + ' in the yard'],
      ['Jobs today', k.jobsToday, '#facc15', k.completedToday + ' done'],
      ['Jobs this week', k.weekJobs, '#4ade80', 'Monday to Sunday']
    ].concat(c.services.map(function (s) { return [s.name + ' · ' + c.month, s.cur, s.accent, pctLine(s, MON)]; }));
    return '<div class="tvl-opa">' + tiles.map(function (t) {
      return '<div class="tvl-card tvl-tile tvl-glow" style="--gc:' + t[2] + '"><span class="tvl-k">' + c.esc(t[0]) + '</span>'
        + '<span class="v" style="color:' + t[2] + '">' + odo(t[1] || 0) + '</span><span class="d">' + t[3] + '</span></div>';
    }).join('') + '</div>';
  }
  // B: a tank per measure.
  function opsB(c) {
    var k = c.kpi, fleet = (k.binsOut || 0) + (c.yardIn || 0);
    var g = [
      ['Jobs done today', k.jobsToday ? k.completedToday / k.jobsToday * 100 : 0, '#facc15', k.completedToday + ' of ' + k.jobsToday + ' done'],
      ['Bins out', fleet ? k.binsOut / fleet * 100 : 0, '#22d3ee', k.binsOut + ' out · ' + c.yardIn + ' in the yard']
    ].concat(c.services.map(function (s) {
      return [s.name, s.last ? s.cur / s.last * 100 : 0, s.accent, s.cur + ' of last ' + c.month + '’s ' + s.last];
    }));
    return '<div class="tvl-opb" style="grid-template-columns:repeat(' + g.length + ',minmax(0,1fr))">' + g.map(function (x) {
      return '<div class="tvl-card tvl-gauge"><div class="k">' + c.esc(x[0]) + '</div>' + tank(x[1], x[2]) + '<div class="s">' + c.esc(x[3]) + '</div></div>';
    }).join('') + '</div>';
  }
  // C: one service at a time, very big, with the day's other numbers beside it.
  function opsC(c) {
    var MON = c.month.slice(0, 3);
    var slides = c.services.map(function (s) {
      var win = s.beat ? shine('Beat last ' + c.month + '!', '#e2c364')
              : s.onPace ? '<span class="tvl-up">On pace for ' + s.proj + '</span>'
              : '<span class="tvl-down">' + (s.last - s.proj) + ' short of last ' + c.month + '’s ' + s.last + '</span>';
      return '<div class="sl"><div class="nm">' + c.esc(s.name) + ' this ' + c.month + '</div>'
        + '<div class="big" style="color:' + s.accent + '">' + s.cur + '</div>'
        + '<div class="vs">' + pctLine(s, MON) + '</div><div class="win">' + win + '</div></div>';
    });
    var k = c.kpi, side = '<div class="tvl-card"><span class="tvl-k">Jobs today</span><span class="v">' + k.completedToday + '<small>of ' + k.jobsToday + ' done</small></span></div>';
    if (c.hq) {
      side += '<div class="tvl-card"><span class="tvl-k">Quotes due a call</span><span class="v" style="color:#f0a884">' + c.hq.quotesDue + '</span></div>'
           +  '<div class="tvl-card"><span class="tvl-k">Booked for tomorrow</span><span class="v">' + c.hq.tomorrow + '</span></div>';
    }
    return '<div class="tvl-opc"><div class="gd"><div class="tvl-card tvl-hero">' + rotate(slides, 10000) + '</div>'
      + '<div class="tvl-side">' + side + '</div></div>' + ticker(c) + '</div>';
  }

  // ── Trucks on the Road, look C: the day under the map ──
  // One lane per driver from 7 am to 5 pm, each bin leg at its booked time, a gold
  // line at now. Legs with no time sit in the "Any time" slot past 5.
  var H0 = 7, H1 = 17, HANY = 18;
  function xAt(h) { return ((Math.max(H0, Math.min(HANY, h)) - H0) / (HANY - H0) * 100) + '%'; }
  function dayLanes(c) {
    if (!c.board.length) return '<div class="hrs"></div><div class="bd" style="font:800 26px Inter;color:var(--muted);padding:10px 0">No bin drop-offs or pick-ups today</div>';
    var hrs = '';
    for (var h = H0; h <= H1; h++) hrs += '<span style="left:' + xAt(h) + '">' + (h % 12 || 12) + (h === H0 ? ' am' : h === 12 ? ' pm' : '') + '</span>';
    hrs += '<span style="left:' + xAt(17.5) + '">Any time</span>';
    var now = new Date(), nh = now.getHours() + now.getMinutes() / 60;
    var nowLine = nh >= H0 && nh <= H1
      ? '<div class="now" style="left:calc(190px + (100% - 190px) * ' + ((nh - H0) / (HANY - H0)) + ')"><b>'
        + now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + '</b></div>' : '';
    var lanes = c.board.map(function (g) {
      var warn = !g.crewId, color = c.driverColor(g.crewId);
      var at = g.legs.map(function (l) { var m = c.timeMins(l.time); return m >= 99999 ? 17.5 : m / 60; });
      var lo = Math.min.apply(null, at), hi = Math.max.apply(null, at);
      var seg = hi > lo ? '<div class="seg" style="left:' + xAt(lo) + ';width:calc(' + xAt(hi) + ' - ' + xAt(lo) + ');background:' + color + '"></div>' : '';
      var dots = g.legs.map(function (l, i) {
        return '<div class="sd" style="left:' + xAt(at[i]) + '">' + mark(legState(g, l), 30, warn)
          + '<small>' + c.esc(l.j.city || who(l.j)) + '</small></div>';
      }).join('');
      return '<div class="ln' + (warn ? ' warn' : '') + '"><div class="who"><i style="background:' + color + '"></i>' + (warn ? '⚠ No driver' : c.esc(g.name)) + '</div>'
        + '<div class="tr"><div class="any" style="left:' + xAt(H1) + '"></div>' + seg + dots + '</div></div>';
    }).join('');
    return '<div class="hrs">' + hrs + '</div><div class="bd">' + nowLine + lanes + '</div>';
  }

  // Which look a screen wears on a given lap. `force` is the ?debug hook's pin.
  var force = {};
  function lookFor(name, lap) {
    if (force[name]) return force[name];
    var l = LOOKS[name];
    return l ? l[lap % l.length] : null;
  }

  return { LOOKS: LOOKS, lookFor: lookFor, force: force, mark: mark, settle: settle,
           binsB: binsB, binsC: binsC, opsA: opsA, opsB: opsB, opsC: opsC, dayLanes: dayLanes };
})();
