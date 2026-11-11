// ── WINTER ROUTES ─────────────────────────────────────────────────────────
// The snow sites' route groups, run order and Google route map (Jake, 2026-10-15).
//
// Every winter site has a group (jwg_winter_groups: E, N, W, A, SB, SV) and a stop
// number inside it. Its code is group + stop, e.g. SV-04, and that code is what the
// printed book and the crew use. Codes stay where the office puts them: a new site
// slots in at the stop picked in the form, or at the spot that adds the least
// driving, and only the sites after it move down one (placeInGroup). A site that
// leaves a group closes its gap (closeGap). Nothing reshuffles a whole group.
//
// Drive times come from the free OSRM router as one table per job — the same
// service the dispatch board uses. The map is Google's: only CREATING the map is
// billed, so it is built once, the first time someone opens Route map, and the same
// map is re-attached on every later render. Panning, zooming and redrawing pins are
// free. Google's terms forbid saving its map images, so there is no caching beyond
// keeping this one live map.
window.WinterRoutes = (function(){
  // Same browser key as the office TV: referrer-locked to the live site and limited
  // to the Maps JavaScript API, with a daily cap in the Cloud console.
  var GMAPS_KEY = 'AIzaSyDP9mUAQ0DCWBt8GRQN6649senq4hIDIG8';
  var SHOP = YARD_LATLNG;   // app-dispatch.js — every run starts at the shop

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function code(loc){
    return (loc.winter_group && loc.winter_stop) ? loc.winter_group + '-' + String(loc.winter_stop).padStart(2, '0') : '';
  }
  function located(loc){ return loc.lat != null && loc.lng != null; }

  // ── drive times ──
  // Seconds between every pair of points, as OSRM returns them. Throws when the
  // router does not answer: a run order built on guesses would be worse than none.
  async function driveTable(points){
    var url = 'https://router.project-osrm.org/table/v1/driving/'
      + points.map(function(p){ return p.lng + ',' + p.lat; }).join(';') + '?annotations=duration';
    var r = await fetch(url);
    if(!r.ok) throw new Error('route service answered ' + r.status);
    var json = await r.json();
    if(json.code !== 'Ok' || !json.durations) throw new Error('route service: ' + (json.code || 'no durations'));
    return json.durations;
  }

  // Where a site slots into a run with the least extra driving. dur is a drive
  // table of [shop, the site, the run's stops in order]; returns 0 for "first",
  // run length for "last".
  function bestSlot(dur, runLength){
    var best = 0, bestCost = Infinity;
    for(var k = 0; k <= runLength; k++){
      var prev = k === 0 ? 0 : k + 1;            // the shop, or the stop before
      var next = k === runLength ? null : k + 2;  // the stop after, if any
      var cost = dur[prev][1] + (next === null ? 0 : dur[1][next] - dur[prev][next]);
      if(cost < bestCost){ bestCost = cost; best = k; }
    }
    return best;
  }

  // Put a site into its group's run without reshuffling anyone else: at stop
  // `want`, or (want null) at the spot that adds the least driving. The sites after
  // it move down one. Codes stay where the office put them (Jake, 2026-11-03).
  async function placeInGroup(group, locations, site, want){
    var run = runOf(group, locations, site.id);
    var at;
    if(want) at = Math.min(want, run.length + 1) - 1;
    else {
      var dur = await driveTable([SHOP, site].concat(run).map(function(l){ return {lat: l.lat, lng: l.lng}; }));
      at = bestSlot(dur, run.length);
    }
    run.splice(at, 0, site);
    await writeStops(group, locations, run);
  }

  // A site left the group (moved, deleted, lost its pin): number the rest 1..n in
  // the order they already had.
  async function closeGap(group, locations){
    await writeStops(group, locations, runOf(group, locations, null));
  }

  // The group's sites on the map, in their current order, leaving one out.
  function runOf(group, locations, leaveOut){
    return locations.filter(function(l){ return l.winter_group === group && l.id !== leaveOut && located(l); })
      .sort(function(a, b){ return (a.winter_stop || 999) - (b.winter_stop || 999); });
  }

  // Number the run 1..n. Sites not on the map yet have no place in a run, so they
  // carry no stop number.
  async function writeStops(group, locations, run){
    var writes = locations.filter(function(l){ return l.winter_group === group && !located(l) && l.winter_stop != null; })
      .map(function(l){ return sbWrite(l.id, {winter_stop: null}); });
    run.forEach(function(l, k){ if(l.winter_stop !== k + 1) writes.push(sbWrite(l.id, {winter_stop: k + 1})); });
    await Promise.all(writes);
  }
  function sbWrite(id, patch){
    return JWG.sbF('PATCH', 'jwg_service_locations?id=eq.' + id, Object.assign({updated_at: new Date().toISOString()}, patch));
  }

  // The group a new spot belongs with: the one whose sites are, on average, the
  // shortest drive away. The office can still pick another in the form.
  async function suggestGroup(pt, locations, groups){
    var others = locations.filter(function(l){ return l.winter_group && located(l); });
    if(!others.length) return groups[0].code;
    var dur = await driveTable([pt].concat(others.map(function(l){ return {lat: l.lat, lng: l.lng}; })));
    var sum = {}, cnt = {};
    others.forEach(function(l, i){
      var s = (dur[0][i + 1] + dur[i + 1][0]) / 2;
      sum[l.winter_group] = (sum[l.winter_group] || 0) + s;
      cnt[l.winter_group] = (cnt[l.winter_group] || 0) + 1;
    });
    return Object.keys(sum).reduce(function(a, b){ return sum[b] / cnt[b] < sum[a] / cnt[a] ? b : a; });
  }

  // Address → map spot, through the app's own geocoder (app.js). Null when the
  // address cannot be found; the site then waits in "Not on the map yet".
  function findAddress(address, city){
    return new Promise(function(res){ geocode(address + ', ' + city + ', Ontario', res); });
  }

  // ── Google map ──
  var mapEl = null, map = null, overlays = [], focus = null, placing = null, HtmlMarker = null, selected = null, onPick = null;

  function loadGoogle(){
    if(window.google && google.maps) return Promise.resolve();
    if(loadGoogle.p) return loadGoogle.p;
    loadGoogle.p = new Promise(function(res, rej){
      window.__winterMapsReady = res;
      var s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GMAPS_KEY) + '&v=weekly&loading=async&callback=__winterMapsReady';
      s.async = true;
      s.onerror = function(){ loadGoogle.p = null; rej(new Error('Google Maps did not load')); };
      document.head.appendChild(s);
    });
    return loadGoogle.p;
  }

  function buildMap(host){
    mapEl = document.createElement('div');
    mapEl.className = 'wr-map';
    host.appendChild(mapEl);   // in the page before Google sizes it
    map = new google.maps.Map(mapEl, {
      center: SHOP, zoom: 12, mapTypeId: 'hybrid',
      streetViewControl: false, fullscreenControl: true, clickableIcons: false,
      isFractionalZoomEnabled: true,
      // Google's shop and bus-stop icons crowded out the site pins.
      styles: [{featureType: 'poi', stylers: [{visibility: 'off'}]}, {featureType: 'transit', stylers: [{visibility: 'off'}]}]
    });
    // Creating the map is the one thing Google bills; counted here and nowhere else,
    // into the same table as the office TV, so both show on the Usage page.
    db.rpc('bump_google_api', {p_api: 'maps_dynamic'}).then(function(r){
      if(r.error) console.warn('map load not counted', r.error.message);
    });
    HtmlMarker = class extends google.maps.OverlayView {
      constructor(pos, el){ super(); this.pos = pos; this.el = el; }
      onAdd(){ this.getPanes().overlayMouseTarget.appendChild(this.el); }
      draw(){
        var p = this.getProjection().fromLatLngToDivPixel(this.pos);
        if(p){ this.el.style.left = p.x + 'px'; this.el.style.top = p.y + 'px'; }
      }
      onRemove(){ this.el.remove(); }
    };
    map.addListener('click', function(e){
      if(!placing) return;
      var id = placing;
      placing = null;
      setPlacingCursor();
      SnowDesk.refresh();
      placeSite(id, {lat: e.latLng.lat(), lng: e.latLng.lng()});
    });
  }

  // Draw the map into the Snow & Ice page (app-snow.js), which owns the list and the
  // site panel. opts: focus (an area code or null), selected (a site id), fit (frame
  // the pins), onPick(site) when a pin is clicked. Called on every render; the map
  // itself is created only the first time.
  async function render(host, W, opts){
    focus = opts.focus; selected = opts.selected; onPick = opts.onPick;
    try { await loadGoogle(); }
    catch(e){
      host.innerHTML = '<div class="wr-map-error">The map could not load. Check the connection and reopen Snow &amp; Ice.</div>';
      throw e;
    }
    var first = !map;
    if(first) buildMap(host);
    else if(mapEl.parentNode !== host) host.appendChild(mapEl);
    drawOverlays(W, first || opts.fit);
  }
  function panTo(loc){
    if(!map) return;
    map.panTo({lat: loc.lat, lng: loc.lng});
    if(map.getZoom() < 15) map.setZoom(15);
  }
  function groupOf(W, c){ return W.groups.find(function(g){ return g.code === c; }); }
  function routed(W, g){
    return W.locations.filter(function(l){ return l.winter_group === g && located(l) && l.winter_stop; })
      .sort(function(a, b){ return a.winter_stop - b.winter_stop; });
  }

  function drawOverlays(W, fit){
    overlays.forEach(function(o){ o.setMap(null); });
    overlays = [];
    var bounds = new google.maps.LatLngBounds();
    W.groups.forEach(function(g){
      var stops = routed(W, g.code);
      var dim = focus && focus !== g.code;
      if(stops.length > 1){
        overlays.push(new google.maps.Polyline({
          map: map, path: stops.map(function(l){ return {lat: l.lat, lng: l.lng}; }),
          strokeColor: g.color, strokeOpacity: 0, zIndex: 1,
          icons: [{icon: {path: 'M 0,-1 0,1', strokeOpacity: dim ? .15 : .9, strokeColor: g.color, scale: 3}, offset: '0', repeat: '12px'}]
        }));
      }
      stops.forEach(function(l){
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'wr-pin' + (dim ? ' dim' : '') + (l.id === selected ? ' on' : '');
        el.style.background = g.color;
        el.textContent = l.winter_stop;
        el.title = code(l) + ' · ' + l.address;
        el.addEventListener('click', function(ev){ ev.stopPropagation(); onPick(l); });
        var m = new HtmlMarker(new google.maps.LatLng(l.lat, l.lng), el);
        m.setMap(map);
        overlays.push(m);
        if(!focus || focus === g.code) bounds.extend({lat: l.lat, lng: l.lng});
      });
    });
    var shop = document.createElement('div');
    shop.className = 'wr-shop';
    shop.title = 'Shop';
    var sm = new HtmlMarker(new google.maps.LatLng(SHOP.lat, SHOP.lng), shop);
    sm.setMap(map);
    overlays.push(sm);
    if(fit && !bounds.isEmpty()) map.fitBounds(bounds, 40);
  }

  // While a pin is waiting to be placed the map shows a crosshair instead of the hand.
  function setPlacingCursor(){ if(map) map.setOptions({draggableCursor: placing ? 'crosshair' : null}); }
  function startPlacing(id){
    placing = id;
    setPlacingCursor();
    SnowDesk.refresh();
  }
  function cancelPlacing(){
    placing = null;
    setPlacingCursor();
    SnowDesk.refresh();
  }

  // A pin placed or moved by hand: save the spot, give it a group if it has none.
  // A site that already has a stop keeps it; one without slots in at its best spot.
  async function placeSite(id, pt){
    var W = JWG.WIN;
    var loc = W.locations.find(function(l){ return l.id === id; });
    try {
      var group = loc.winter_group || await suggestGroup(pt, W.locations.filter(function(l){ return l.id !== id; }), W.groups);
      await sbWrite(id, {lat: pt.lat, lng: pt.lng, winter_group: group});
      Object.assign(loc, {lat: pt.lat, lng: pt.lng, winter_group: group});
      var locs = await JWG.freshWinterSites();
      var site = locs.find(function(l){ return l.id === id; });
      await placeInGroup(group, locs, site, site.winter_stop);
      JWG.toast('Pin placed · ' + groupOf(W, group).name);
    } catch(e){
      JWG.toast('Could not save the pin: ' + e.message, 'error');
      throw e;
    } finally {
      await JWG.reloadWinter();
    }
  }

  return {code: code, located: located, placeInGroup: placeInGroup, closeGap: closeGap, bestSlot: bestSlot, suggestGroup: suggestGroup, findAddress: findAddress, render: render, panTo: panTo, startPlacing: startPlacing, cancelPlacing: cancelPlacing, placing: function(){ return placing; }};
})();
