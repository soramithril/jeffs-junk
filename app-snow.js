// ── SNOW & ICE PAGE ────────────────────────────────────────────────
// Three tabs, one job each (Jake, 2026-11-20: the one-screen "Desk" of 2026-11-10
// did all three at once and was "hard to use, all of it"):
//   Sites        look a site up: the list, then the picked site built round its
//                photo, with the setup checklist and the facts under it.
//   Site plans   build them: every site as a tile showing what is missing.
//   Snow night   run one: the gauges, the areas, the Google map and the picked
//                area's stops in driving order.
// Nothing the Desk did was cut; it was sorted into the tab whose job it is.
//
// It has its own menu button, but it draws inside the Schedule page's
// container (#win-page), the same way Clothing and Inventory do: the winter
// data, the Add / Edit forms and the pop-ups all live in app-jwg-scheduler.js,
// and every save there ends in renderWinterPage(), which calls render() here.
// The map itself is app-winter-routes.js; the drawing screen is app-winter-siteplan.js.
window.SnowDesk = (function(){
  // area: the Sites list's area filter. night: the area picked on Snow night.
  // filter: '' | 'pending' | 'nophoto' | 'nomarks' | 'low' | 'check'. plans: the same keys, for the tiles.
  var st = {tab: 'sites', sel: null, area: null, q: '', filter: '', plans: '', night: null};
  var W = null, root = null;
  var photoUrls = {};   // photo_path -> {url, until}; signed links last an hour

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function saltOf(loc){ return W.saltBins.find(function(s){ return s.location_id === loc.id; }); }
  function isLow(loc){ var s = saltOf(loc); return !!s && s.current_bags <= s.min_threshold; }
  function groupOf(code){ return W.groups.find(function(g){ return g.code === code; }); }
  function nick(loc){ return loc.client_name && loc.client_name !== loc.address ? loc.client_name : ''; }
  function title(loc){ return nick(loc) || loc.address; }
  function onRun(loc){ return !!WinterRoutes.code(loc) && WinterRoutes.located(loc); }
  function selected(){ return W.locations.find(function(l){ return l.id === st.sel; }); }
  function byId(id){ return W.locations.find(function(l){ return l.id === id; }); }
  function nMarks(loc){ return (loc.site_marks || []).length; }
  function plural(n, word){ return n + ' ' + word + (n === 1 ? '' : 's'); }
  function codeHtml(loc, big){
    var code = WinterRoutes.code(loc), g = groupOf(loc.winter_group);
    return '<span class="sx-code' + (big ? ' big' : '') + (code ? '' : ' none') + '"' + (code ? ' style="background:' + g.color + '"' : '') + '>' + (code || (big ? 'No stop yet' : '—')) + '</span>';
  }

  // What can be wrong with a site. The list, the tiles and the gauges all filter on these.
  var FILTERS = {
    pending: {label: 'Contract pending', test: function(l){ return l.winter_contract === 'pending'; }},
    nophoto: {label: 'No photo',         test: function(l){ return !l.photo_path; }},
    nomarks: {label: 'No marks',         test: function(l){ return !!l.photo_path && !nMarks(l); }},
    low:     {label: 'Salt low',         test: isLow},
    check:   {label: 'Marks to check',   test: function(l){ return WinterSitePlan.toCheck(l.site_marks) > 0; }}
  };
  function count(key){ return W.locations.filter(FILTERS[key].test).length; }
  function shown(loc){
    var q = st.q.trim().toLowerCase();
    if(q && loc.address.toLowerCase().indexOf(q) < 0 && String(loc.client_name || '').toLowerCase().indexOf(q) < 0) return false;
    if(st.area && loc.winter_group !== st.area) return false;
    return !st.filter || FILTERS[st.filter].test(loc);
  }

  // The six things a site needs before a snow night, in the order that works: the
  // pin comes before the area because placing it suggests the area and the stop.
  function steps(loc){
    return [
      {label: 'Address and nickname', done: true},
      {label: 'Pin on the map', done: WinterRoutes.located(loc), act: 'move', go: 'Place it'},
      {label: 'Area and stop number', done: !!WinterRoutes.code(loc), act: 'edit', go: 'Set them'},
      {label: 'Aerial photo', done: !!loc.photo_path, act: 'plan', go: 'Add photo'},
      {label: 'Marks drawn on the photo', done: nMarks(loc) > 0, act: 'plan', go: 'Draw marks'},
      {label: 'Contract confirmed', done: loc.winter_contract === 'confirmed', act: 'confirm', go: 'Confirm'}
    ];
  }
  function unfinished(loc){ return !loc.photo_path || !nMarks(loc); }

  // ── signed photo links ──
  async function sign(paths){
    var need = paths.filter(function(p){ var hit = photoUrls[p]; return !hit || hit.until < Date.now(); });
    if(!need.length) return;
    var r = await db.storage.from('winter-sites').createSignedUrls(need, 3600);
    if(r.error) throw r.error;
    r.data.forEach(function(x){
      if(x.error) throw new Error('No link for the photo ' + x.path + ': ' + x.error);
      photoUrls[x.path] = {url: x.signedUrl, until: Date.now() + 50 * 60 * 1000};
    });
  }
  // Put a site's photo in an <img>, and its marks over it once the photo's shape is known.
  function fill(img, loc, opts){
    img.onload = function(){
      var mk = img.parentNode.querySelector('.mk');
      if(mk) mk.innerHTML = WinterSitePlan.svg(loc.site_marks, img.naturalWidth / img.naturalHeight, opts);
    };
    img.src = photoUrls[loc.photo_path].url;
  }

  // ── Sites ──
  function sitesFrame(){
    return '<div class="sx-sites">'
      + '<div class="sx-panel sx-list"><input type="search" id="sx-q" class="sx-search" placeholder="Find an address or nickname" aria-label="Find a site">'
      +   '<div class="sx-chips" id="sx-areas"></div><div class="sx-chips" id="sx-filters"></div><div id="sx-stops"></div></div>'
      + '<div class="sx-panel sx-site" id="sx-detail"></div></div>';
  }
  function stopRow(loc){
    var n = WinterSitePlan.toCheck(loc.site_marks);
    var tag = n ? '<span class="sx-tag warn">' + n + ' to check</span>'
            : isLow(loc) ? '<span class="sx-tag bad">Salt low</span>'
            : !loc.photo_path ? '<span class="sx-tag warn">No photo</span>'
            : !nMarks(loc) ? '<span class="sx-tag warn">No marks</span>' : '';
    return '<button type="button" class="sx-stop' + (loc.id === st.sel ? ' on' : '') + '" data-site="' + loc.id + '">' + codeHtml(loc)
      + '<span class="sx-stop-t"><span class="a">' + esc(title(loc)) + '</span>' + (nick(loc) ? '<span class="n">' + esc(loc.address) + '</span>' : '') + '</span>' + tag + '</button>';
  }
  function paintList(){
    root.querySelector('#sx-areas').innerHTML = '<button type="button" class="sx-chip" data-area="" aria-pressed="' + !st.area + '">All ' + W.locations.length + '</button>'
      + W.groups.map(function(g){
          return '<button type="button" class="sx-chip" data-area="' + g.code + '" aria-pressed="' + (st.area === g.code) + '" title="' + esc(g.name) + '"><i style="background:' + g.color + '"></i>' + esc(g.code) + '</button>';
        }).join('');
    root.querySelector('#sx-filters').innerHTML = Object.keys(FILTERS).map(function(k){
      var n = count(k);
      return (n || st.filter === k) ? '<button type="button" class="sx-chip warn" data-filter="' + k + '" aria-pressed="' + (st.filter === k) + '">' + FILTERS[k].label + ' ' + n + '</button>' : '';
    }).join('');
    var vis = W.locations.filter(shown);
    var loose = vis.filter(function(l){ return !onRun(l); });
    var h = loose.length ? '<div class="sx-loose"><div class="sx-loose-h">Not on the map yet</div>' + loose.map(stopRow).join('') + '</div>' : '';
    W.groups.forEach(function(g){
      var stops = vis.filter(function(l){ return onRun(l) && l.winter_group === g.code; }).sort(function(a, b){ return a.winter_stop - b.winter_stop; });
      if(stops.length) h += '<div class="sx-grp">' + esc(g.name) + '</div>' + stops.map(stopRow).join('');
    });
    if(!vis.length) h = '<div class="sx-none">No site matches. <button type="button" class="sx-link" data-clear>Show all ' + W.locations.length + '</button></div>';
    var box = root.querySelector('#sx-stops'), top = box.scrollTop;
    box.innerHTML = h;
    box.scrollTop = top;
  }
  function paintDetail(){
    var box = root.querySelector('#sx-detail'), loc = selected();
    if(!loc){ box.innerHTML = '<div class="sx-none">Pick a site from the list.</div>'; return; }
    var g = groupOf(loc.winter_group), salt = saltOf(loc), low = isLow(loc), n = nMarks(loc), chk = WinterSitePlan.toCheck(loc.site_marks);
    var mine = W.locationServices.filter(function(s){ return s.location_id === loc.id; });
    var list = steps(loc), done = list.filter(function(s){ return s.done; }).length, next = list.find(function(s){ return !s.done; });
    box.innerHTML = '<div class="sx-site-h">' + codeHtml(loc, true)
      + '<div class="t"><h3>' + esc(title(loc)) + '</h3><div class="nick">' + [nick(loc) ? loc.address : '', g ? g.name : '', loc.city].filter(Boolean).map(esc).join(' · ') + '</div></div>'
      + '<button type="button" class="sx-btn primary" data-plan>' + (loc.photo_path ? 'Open site plan' : 'Add photo') + '</button>'
      + (WinterRoutes.located(loc) ? '<button type="button" class="sx-btn" data-show>Show on map</button>' : '')
      + '<button type="button" class="sx-btn" data-edit>Edit site</button></div>'
      + '<div class="sx-site-b">'
      + (loc.photo_path
          ? '<button type="button" class="sx-photo" data-plan title="Open the site plan"><img id="sx-photo-img" alt="Aerial photo of ' + esc(loc.address) + '"><span class="mk"></span>'
            + '<span class="cap">' + plural(n, 'mark') + ' drawn' + (chk ? ' · ' + chk + ' to check' : '') + '</span></button>'
          : '<button type="button" class="sx-photo none" data-plan>No aerial photo yet. Add one</button>')
      + '<div class="sx-card"><div class="l">Site setup · ' + done + ' of ' + list.length + '</div>'
      +   '<span class="sx-bar"><i style="width:' + (done / list.length * 100) + '%"></i></span><div class="sx-steps">'
      +   list.map(function(s){
            return '<div class="sx-step' + (s.done ? ' done' : '') + (s === next ? ' next' : '') + '"><i>✓</i><span>' + s.label + '</span>'
              + (s === next ? '<button type="button" class="sx-btn primary" data-step="' + s.act + '">' + s.go + '</button>' : '') + '</div>';
          }).join('') + '</div></div></div>'
      + '<div class="sx-facts">'
      + '<div class="sx-card"><div class="l">Contract</div><div class="sx-seg">'
      +   '<button type="button" data-contract="pending" aria-pressed="' + (loc.winter_contract === 'pending') + '">Pending</button>'
      +   '<button type="button" class="ok" data-contract="confirmed" aria-pressed="' + (loc.winter_contract === 'confirmed') + '">Confirmed</button></div></div>'
      + '<div class="sx-card"><div class="l">What we do here</div><div class="sx-svcs">'
      +   W.serviceTypes.map(function(t){
            var on = mine.some(function(s){ return s.service_type_id === t.id; });
            return '<button type="button" class="sx-svc" data-svc="' + t.id + '" aria-pressed="' + on + '" title="Click to turn ' + (on ? 'off' : 'on') + '">' + esc(t.name) + '</button>';
          }).join('') + '</div></div>'
      + '<div class="sx-card"><div class="l">Salt bin</div>'
      +   (salt
            ? '<div class="sx-salt"><button type="button" data-salt="-5">−5</button><button type="button" data-salt="-1">−1</button>'
              + '<input type="number" min="0" id="sx-salt-n" class="' + (low ? 'low' : '') + '" value="' + salt.current_bags + '" aria-label="Bags of salt">'
              + '<button type="button" data-salt="1">+1</button><button type="button" data-salt="5">+5</button>'
              + '<span class="t">bags · refill at ' + salt.min_threshold + '</span>' + (low ? '<span class="sx-tag bad">LOW</span>' : '') + '</div>'
            : '<span class="sx-dim">No salt bin at this site.</span>')
      + '</div>'
      + (loc.notes ? '<div class="sx-card"><div class="l">Notes</div><div class="sx-notes">' + esc(loc.notes) + '</div></div>' : '')
      + '</div>'
      + '<div class="sx-quiet"><button type="button" class="sx-link" data-move>' + (WinterRoutes.located(loc) ? 'Move pin' : 'Place on the map') + '</button>'
      +   '<button type="button" class="sx-link bad" data-delete>Delete site</button></div>';
    if(loc.photo_path) showPhoto(loc);
  }
  async function showPhoto(loc){
    await sign([loc.photo_path]);
    var img = root.querySelector('#sx-photo-img');
    if(img && st.sel === loc.id) fill(img, loc, {labels: true, size: 1.1});
  }

  // ── Site plans ──
  function plansFrame(){
    return '<div class="sx-panel sx-plans-h" id="sx-plans-h"></div><div class="sx-tiles" id="sx-tiles"></div>';
  }
  function paintPlans(){
    var n = W.locations.length, ready = W.locations.filter(function(l){ return !unfinished(l); }).length;
    root.querySelector('#sx-plans-h').innerHTML = '<b>' + ready + ' of ' + n + ' site plans have a photo and marks</b>'
      + '<button type="button" class="sx-chip" data-plans="" aria-pressed="' + !st.plans + '">All ' + n + '</button>'
      + ['nophoto', 'nomarks', 'check'].map(function(k){
          var c = count(k);
          return (c || st.plans === k) ? '<button type="button" class="sx-chip warn" data-plans="' + k + '" aria-pressed="' + (st.plans === k) + '">' + FILTERS[k].label + ' ' + c + '</button>' : '';
        }).join('');
    var list = W.locations.slice().sort(JWG.winterRouteSort).filter(function(l){ return !st.plans || FILTERS[st.plans].test(l); });
    root.querySelector('#sx-tiles').innerHTML = list.length ? list.map(function(loc){
      var m = nMarks(loc), chk = WinterSitePlan.toCheck(loc.site_marks);
      return '<button type="button" class="sx-tile" data-plan="' + loc.id + '">'
        + (loc.photo_path ? '<span class="ph"><img loading="lazy" data-photo="' + loc.id + '" alt=""><span class="mk"></span></span>' : '<span class="ph none">No photo yet</span>')
        + '<span class="m"><span class="a">' + esc(title(loc)) + '</span><span class="s">' + codeHtml(loc)
        + (!loc.photo_path ? '' : m ? '<span>' + plural(m, 'mark') + '</span>' : '<span class="sx-tag warn">No marks yet</span>')
        + (chk ? '<span class="sx-tag warn">' + chk + ' to check</span>' : '') + '</span></span></button>';
    }).join('') : '<div class="sx-none">Nothing here. Every site plan passes this check.</div>';
    tilePhotos(list.filter(function(l){ return l.photo_path; }));
  }
  // loading="lazy" means a photo is only downloaded when its tile scrolls into view.
  async function tilePhotos(list){
    await sign(list.map(function(l){ return l.photo_path; }));
    if(st.tab !== 'plans') return;
    list.forEach(function(loc){
      var img = root.querySelector('img[data-photo="' + loc.id + '"]');
      if(img) fill(img, loc, {labels: false, size: 2.2});
    });
  }

  // ── Snow night ──
  function nightFrame(){
    return '<div class="sx-gauges" id="sx-gauges"></div>'
      + '<div class="sx-desk sx-night">'
      +   '<div class="sx-panel sx-list" id="sx-nareas"></div>'
      +   '<div class="sx-panel sx-mapbox"><div class="sx-placing" id="sx-placing" hidden></div><div class="wr-map-host" id="sx-map"></div></div>'
      +   '<div class="sx-panel sx-run" id="sx-run"></div>'
      + '</div>';
  }
  // Each gauge is a way in to the Sites list, already narrowed to those sites.
  function paintGauges(){
    var n = W.locations.length, pend = count('pending'), noPhoto = W.locations.filter(FILTERS.nophoto.test);
    var bins = W.locations.filter(saltOf), lows = bins.filter(isLow);
    function names(list){ return list.slice(0, 2).map(function(l){ return esc(title(l)); }).join(', ') + (list.length > 2 ? ' +' + (list.length - 2) : ''); }
    function gauge(key, label, big, small, pct, warn, hint){
      return '<button type="button" class="sx-gauge" data-gauge="' + key + '" title="' + hint + '">'
        + '<span class="l">' + label + '</span><span class="v">' + big + '<small>' + small + '</small></span>'
        + '<span class="sx-bar"><i class="' + (warn ? 'warn' : '') + '" style="width:' + Math.max(pct, 1.5) + '%"></i></span></button>';
    }
    root.querySelector('#sx-gauges').innerHTML =
        gauge('pending', 'Contracts confirmed', n - pend, 'of ' + n, n ? (n - pend) / n * 100 : 0, pend > 0, 'Open the sites still pending')
      + gauge('nophoto', 'Site plans with a photo', n - noPhoto.length, 'of ' + n + (noPhoto.length ? ' · missing: ' + names(noPhoto) : ''), n ? (n - noPhoto.length) / n * 100 : 0, noPhoto.length > 0, 'Open the sites with no photo')
      + gauge('low', 'Salt bins low', lows.length, 'of ' + bins.length + (lows.length ? ' · ' + names(lows) : ''), bins.length ? lows.length / bins.length * 100 : 0, true, 'Open the sites with a low salt bin');
  }
  function paintAreas(){
    var all = W.locations.filter(onRun).length;
    root.querySelector('#sx-nareas').innerHTML = '<button type="button" class="sx-area' + (!st.night ? ' on' : '') + '" data-night=""><span class="sw" style="background:var(--n9)"></span>All areas<span class="ct">' + all + '</span></button>'
      + W.groups.map(function(g){
          var c = W.locations.filter(function(l){ return onRun(l) && l.winter_group === g.code; }).length;
          return '<button type="button" class="sx-area' + (st.night === g.code ? ' on' : '') + '" data-night="' + g.code + '"><span class="sw" style="background:' + g.color + '"></span>' + esc(g.name) + '<span class="ct">' + c + '</span></button>';
        }).join('');
  }
  function paintRun(){
    var box = root.querySelector('#sx-run'), g = st.night ? groupOf(st.night) : null;
    if(!g){ box.innerHTML = '<div class="sx-none">Pick an area on the left, or a pin on the map, to see its stops in driving order.</div>'; return; }
    var stops = W.locations.filter(function(l){ return onRun(l) && l.winter_group === g.code; }).sort(function(a, b){ return a.winter_stop - b.winter_stop; });
    box.innerHTML = '<div class="sx-grp">' + esc(g.name) + ' · ' + plural(stops.length, 'stop') + ', in driving order</div>'
      + stops.map(function(loc){
          var names = W.locationServices.filter(function(s){ return s.location_id === loc.id; })
            .map(function(s){ var t = W.serviceTypes.find(function(x){ return x.id === s.service_type_id; }); return t ? t.name.split(' — ')[0] : ''; })
            .filter(function(v, i, a){ return v && a.indexOf(v) === i; });
          return '<div class="sx-runrow' + (loc.id === st.sel ? ' on' : '') + '"><button type="button" class="sx-stop" data-nsite="' + loc.id + '">' + codeHtml(loc)
            + '<span class="sx-stop-t"><span class="a">' + esc(title(loc)) + '</span><span class="n">' + esc(names.join(' · ') || 'No services ticked') + '</span></span>'
            + (isLow(loc) ? '<span class="sx-tag bad">Salt low</span>' : '') + '</button>'
            + '<button type="button" class="sx-link" data-open="' + loc.id + '">Open</button></div>';
        }).join('');
  }
  function paintMap(fit){
    var placing = WinterRoutes.placing(), note = root.querySelector('#sx-placing');
    if(placing){
      var p = byId(placing);
      note.innerHTML = 'Click the map where <b>' + esc(p ? p.address : '') + '</b> is. <button type="button" data-cancel-place>Cancel</button>';
    }
    note.hidden = !placing;
    WinterRoutes.render(root.querySelector('#sx-map'), W, {focus: st.night, selected: st.sel, fit: fit, onPick: pinPicked});
  }
  // A pin clicked on the map: that site, and its area's stops beside the map.
  function pinPicked(loc){
    st.sel = loc.id;
    if(onRun(loc)) st.night = loc.winter_group;
    paintAreas(); paintRun(); paintMap(false);
  }

  // ── the service list ──
  // The jobs that can be ticked on a site: a small panel that drops from the
  // Service list button, with an x in its corner. (The pop-up it replaces took the
  // whole screen for five lines and had only a "Done" at the bottom; Jake could not
  // tell how to get out, and a full page was "too big for what it is".) Adding and
  // removing are still the scheduler's; both end by calling this again to redraw.
  function openTypes(){
    W = JWG.WIN;
    var pop = document.getElementById('sx-types');
    if(pop) render(root, W);   // a service was just added or removed: the page shows it too
    else {
      pop = document.createElement('div');
      pop.id = 'sx-types';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Service list');
      root.querySelector('.sx-acts').appendChild(pop);
      pop.addEventListener('click', function(e){
        var b;
        if(e.target.closest('[data-types-close]')) closeTypes();
        else if((b = e.target.closest('[data-type-del]'))) JWG.deleteWinterServiceType(b.dataset.typeDel);
      });
      pop.addEventListener('submit', function(e){ e.preventDefault(); JWG.addWinterServiceType(); });
      document.addEventListener('keydown', typesKey);
      document.addEventListener('mousedown', typesAway);
    }
    pop.innerHTML = '<div class="sx-types-h"><b>Service list</b><button type="button" class="sx-x" data-types-close aria-label="Close">×</button></div>'
      + '<div class="sx-types-sub">The jobs you can tick on a winter site.</div>'
      + (W.serviceTypes.length ? W.serviceTypes.map(function(t){
          var n = W.locationServices.filter(function(x){ return x.service_type_id === t.id; }).length;
          return '<div class="sx-type"><b>' + esc(t.name) + '</b><span>' + (n ? plural(n, 'site') : 'not used') + '</span>'
            + '<button type="button" class="sx-link bad" data-type-del="' + t.id + '">Remove</button></div>';
        }).join('') : '<div class="sx-none">No services yet.</div>')
      + '<form class="sx-type-add"><input type="text" id="new-win-type" class="sx-search" placeholder="Add a service" aria-label="New service name">'
      + '<button type="submit" class="sx-btn primary">Add</button></form>';
  }
  function typesKey(e){
    if(e.key === 'Escape' && !document.getElementById('jwg-confirm')) closeTypes();
  }
  // A click anywhere else on the page closes it, except inside the "Remove?" question.
  function typesAway(e){
    var pop = document.getElementById('sx-types'), ask = document.getElementById('jwg-confirm');
    if(!pop){ closeTypes(); return; }
    if(!pop.contains(e.target) && !(ask && ask.contains(e.target)) && !e.target.closest('[data-types]')) closeTypes();
  }
  function closeTypes(){
    var pop = document.getElementById('sx-types');
    if(pop) pop.remove();
    document.removeEventListener('keydown', typesKey);
    document.removeEventListener('mousedown', typesAway);
  }

  // ── the page ──
  var TABS = {sites: sitesFrame, plans: plansFrame, night: nightFrame};
  function goTab(tab){ st.tab = tab; paint(true); }
  // Placing or moving a pin happens on the map, so it happens on Snow night.
  function placePin(){
    var loc = selected();
    st.tab = 'night';
    st.night = onRun(loc) ? loc.winter_group : null;
    paint(true);
    WinterRoutes.startPlacing(st.sel);
  }
  function doStep(act){
    if(act === 'move') placePin();
    else if(act === 'edit') JWG.editWinterLocation(st.sel);
    else if(act === 'plan') WinterSitePlan.open(st.sel);
    else if(act === 'confirm') JWG.setWinterContract(st.sel, 'confirmed');
    else throw new Error('Unknown setup step: ' + act);
  }
  function frame(){
    root.innerHTML = '<div class="sx-page">'
      + '<div class="sx-head"><div><div class="sx-title">Snow &amp; Ice</div><div class="sx-sub" id="sx-sub"></div></div>'
      +   '<div class="sx-acts"><button type="button" class="sx-btn" data-times>Snow Times</button><button type="button" class="sx-btn" data-book>Print book</button><button type="button" class="sx-btn" data-types>Service list</button>'
      +   '<button type="button" class="sx-btn primary" data-add>+ Add site</button></div></div>'
      + '<div class="sx-tabs" id="sx-tabs"></div><div id="sx-body"></div></div>';
    root.addEventListener('input', function(e){
      if(e.target.id === 'sx-q'){ st.q = e.target.value; paintList(); }
    });
    root.addEventListener('change', function(e){
      if(e.target.id === 'sx-salt-n') JWG.setWinterSalt(st.sel, e.target.value);
    });
    root.addEventListener('click', function(e){
      var t = e.target, b;
      if((b = t.closest('[data-tab]'))){ goTab(b.dataset.tab); return; }
      if((b = t.closest('[data-site]'))){ st.sel = b.dataset.site; paintList(); paintDetail(); return; }
      if((b = t.closest('[data-area]'))){ st.area = b.dataset.area || null; paintList(); return; }
      if((b = t.closest('[data-filter]'))){ st.filter = st.filter === b.dataset.filter ? '' : b.dataset.filter; paintList(); return; }
      if(t.closest('[data-clear]')){ st.q = ''; st.area = null; st.filter = ''; root.querySelector('#sx-q').value = ''; paintList(); return; }
      if((b = t.closest('[data-plans]'))){ st.plans = b.dataset.plans; paintPlans(); return; }
      if((b = t.closest('[data-gauge]'))){ st.filter = b.dataset.gauge; st.area = null; st.q = ''; goTab('sites'); return; }
      if((b = t.closest('[data-night]'))){ st.night = b.dataset.night || null; paintAreas(); paintRun(); paintMap(true); return; }
      if((b = t.closest('[data-nsite]'))){
        var loc = byId(b.dataset.nsite);
        st.sel = loc.id; paintRun(); paintMap(false); WinterRoutes.panTo(loc); return; }
      if((b = t.closest('[data-open]'))){ st.sel = b.dataset.open; goTab('sites'); return; }
      if(t.closest('[data-cancel-place]')){ WinterRoutes.cancelPlacing(); return; }
      if(t.closest('[data-times]')){ JWG.setWinterView('times'); return; }
      if(t.closest('[data-book]')){ WinterBook.choose(); return; }
      if(t.closest('[data-types]')){ if(document.getElementById('sx-types')) closeTypes(); else openTypes(); return; }
      if(t.closest('[data-add]')){ JWG.openAddWinterLocation(); return; }
      if((b = t.closest('[data-plan]'))){ if(b.dataset.plan) st.sel = b.dataset.plan; WinterSitePlan.open(st.sel); return; }
      if(!st.sel) return;
      if((b = t.closest('[data-step]'))){ doStep(b.dataset.step); return; }
      if(t.closest('[data-show]')){ var s = selected(); st.night = onRun(s) ? s.winter_group : null; goTab('night'); WinterRoutes.panTo(s); return; }
      if((b = t.closest('[data-contract]'))){ JWG.setWinterContract(st.sel, b.dataset.contract); return; }
      if((b = t.closest('[data-svc]'))){ b.disabled = true; JWG.toggleWinterService(st.sel, b.dataset.svc); return; }
      if((b = t.closest('[data-salt]'))){ JWG.adjustWinterSalt(st.sel, +b.dataset.salt); return; }
      if(t.closest('[data-edit]')){ JWG.editWinterLocation(st.sel); return; }
      if(t.closest('[data-move]')){ placePin(); return; }
      if(t.closest('[data-delete]')){ JWG.deleteWinterLocation(st.sel); return; }
    });
  }
  // Draw the tab that is showing. A tab's frame is built once, when it is switched
  // to; a save only repaints what is inside it, so a scrolled list and a half-typed
  // search stay where they were.
  function paint(fit){
    var todo = W.locations.filter(unfinished).length;
    root.querySelector('#sx-tabs').innerHTML = [['sites', 'Sites', W.locations.length], ['plans', 'Site plans', todo ? todo + ' to finish' : 'all done'], ['night', 'Snow night', '']].map(function(t){
      return '<button type="button" class="sx-tab" data-tab="' + t[0] + '" aria-pressed="' + (st.tab === t[0]) + '">' + t[1] + (t[2] !== '' ? '<small>' + t[2] + '</small>' : '') + '</button>';
    }).join('');
    var body = root.querySelector('#sx-body'), fresh = body.dataset.showing !== st.tab;
    if(fresh){
      body.dataset.showing = st.tab;   // not data-tab: that is what the tab buttons carry, and a click anywhere in here would match it
      body.innerHTML = TABS[st.tab]();
      if(st.tab === 'sites') root.querySelector('#sx-q').value = st.q;
    }
    if(st.tab === 'sites'){ paintList(); paintDetail(); }
    else if(st.tab === 'plans') paintPlans();
    else { paintGauges(); paintAreas(); paintRun(); paintMap(fit || fresh); }
  }

  // Called by renderWinterPage() on every load and after every save.
  function render(el, win){
    W = win;
    var fresh = root !== el || !el.querySelector('.sx-page');
    root = el;
    if(fresh) frame();
    if(!W.locations.some(function(l){ return l.id === st.sel; })){
      var run = W.locations.slice().sort(JWG.winterRouteSort);
      st.sel = run.length ? run[0].id : null;
    }
    if(st.area && !groupOf(st.area)) st.area = null;
    if(st.night && !groupOf(st.night)) st.night = null;
    root.querySelector('#sx-sub').textContent = plural(W.locations.length, 'site') + ' · ' + W.groups.length + ' areas · stops in driving order from the shop';
    paint(fresh);
  }
  // The map calls this when a pin starts or stops waiting to be placed.
  function refresh(){ if(root && root.isConnected && st.tab === 'night') paintMap(false); }

  return {render: render, refresh: refresh, openTypes: openTypes};
})();

// ── The two menu buttons' icons ───────────────────────────────────────────
// Lawn & Grounds and Snow & Ice share the Summer & Winter coin until each has
// its own artwork: the same icon, tinted green and blue. paintNavIcons() (app.js)
// repaints the menu, so the tint is put back after every repaint.
(function(){
  var TINT = {"goJwg('summer')": 75, "goJwg('winter')": 175};
  function tint(){
    document.querySelectorAll('.sidebar .nav-item').forEach(function(btn){
      var deg = TINT[(btn.getAttribute('onclick') || '').replace(/\s+/g, '')];
      if(deg == null) return;
      var ico = btn.querySelector('.icon');
      ico.innerHTML = JJ3D.rail('summerWinter', 34);
      ico.style.background = 'transparent';
      var img = ico.querySelector('img');
      img.style.filter += ' hue-rotate(' + deg + 'deg)';
    });
  }
  var paint = window.paintNavIcons;
  window.paintNavIcons = function(){ paint.apply(this, arguments); tint(); };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tint); else tint();
})();
