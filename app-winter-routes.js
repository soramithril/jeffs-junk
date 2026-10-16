// ── WINTER ROUTES ─────────────────────────────────────────────────────────
// The snow sites' route groups, run order and Google route map (Jake, 2026-10-15).
//
// Every winter site has a group (jwg_winter_groups: E, N, W, A, SB, SV) and a stop
// number inside it. Its code is group + stop, e.g. SV-04, and that code is what the
// printed book and the crew use. Codes follow the order the truck drives: whenever a
// site joins a group, leaves it, moves on the map or is deleted, that group is put
// back in driving order from the shop and renumbered (renumberGroup).
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

  // Order stops 1..n of the table (0 is the shop) as one drive out from the shop:
  // always go to the nearest stop left, then untangle crossings (2-opt). The drive
  // from the shop counts, so the run starts where the truck naturally arrives.
  function driveOrder(dur, n){
    var left = [], route = [0];
    for(var i = 1; i <= n; i++) left.push(i);
    while(left.length){
      var from = route[route.length - 1];
      var next = left.reduce(function(a, b){ return dur[from][b] < dur[from][a] ? b : a; });
      route.push(next);
      left.splice(left.indexOf(next), 1);
    }
    function cost(r){ var c = 0; for(var k = 0; k < r.length - 1; k++) c += dur[r[k]][r[k + 1]]; return c; }
    var better = true;
    while(better){
      better = false;
      for(var a = 1; a < route.length - 1; a++){
        for(var b = a + 1; b < route.length; b++){
          var r2 = route.slice(0, a).concat(route.slice(a, b + 1).reverse(), route.slice(b + 1));
          if(cost(r2) < cost(route) - 1){ route = r2; better = true; }
        }
      }
    }
    return route.slice(1);
  }

  // Put one group back in driving order and write the new stop numbers. Sites not
  // on the map yet have no place in a run, so they carry no stop number.
  async function renumberGroup(group, locations){
    var members = locations.filter(function(l){ return l.winter_group === group && located(l); });
    var unplaced = locations.filter(function(l){ return l.winter_group === group && !located(l) && l.winter_stop != null; });
    var writes = unplaced.map(function(l){ return sbWrite(l.id, {winter_stop: null}); });
    if(members.length){
      var dur = await driveTable([SHOP].concat(members.map(function(l){ return {lat: l.lat, lng: l.lng}; })));
      driveOrder(dur, members.length).forEach(function(idx, k){
        var loc = members[idx - 1];
        if(loc.winter_stop !== k + 1) writes.push(sbWrite(loc.id, {winter_stop: k + 1}));
      });
    }
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
  var mapEl = null, map = null, overlays = [], focus = null, placing = null, info = null, HtmlMarker = null;

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
    info = new google.maps.InfoWindow();
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
      placeSite(id, {lat: e.latLng.lat(), lng: e.latLng.lng()});
    });
  }

  // Draw the route view into the Winter page. Called on every Winter render; the map
  // itself is created only the first time.
  async function render(host, side, W){
    renderSide(side, W);
    try { await loadGoogle(); }
    catch(e){
      host.innerHTML = '<div class="wr-map-error">The map could not load. Check the connection and reopen Route map.</div>';
      throw e;
    }
    // Frame the whole run only when the map is first built; later renders (a save,
    // another office PC's change) redraw the pins and leave the view where it was.
    var first = !map;
    if(first) buildMap(host);
    else host.appendChild(mapEl);
    drawOverlays(W, first);
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
        el.className = 'wr-pin' + (dim ? ' dim' : '');
        el.style.background = g.color;
        el.textContent = l.winter_stop;
        el.title = code(l) + ' · ' + l.address;
        el.addEventListener('click', function(ev){ ev.stopPropagation(); openInfo(W, l); });
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

  function svcNames(W, loc){
    return W.locationServices.filter(function(s){ return s.location_id === loc.id; })
      .map(function(s){ var t = W.serviceTypes.find(function(x){ return x.id === s.service_type_id; }); return t ? t.name : ''; })
      .filter(Boolean);
  }

  function openInfo(W, loc){
    var g = groupOf(W, loc.winter_group);
    var div = document.createElement('div');
    div.className = 'wr-info';
    div.innerHTML = '<div class="wr-info-code" style="color:' + g.color + '">' + code(loc) + '</div>'
      + '<div class="wr-info-addr">' + esc(loc.address) + '</div>'
      + (loc.client_name && loc.client_name !== loc.address ? '<div class="wr-info-nick">Crew calls it ' + esc(loc.client_name) + '</div>' : '')
      + '<div class="wr-info-svc">' + svcNames(W, loc).map(esc).join(' · ') + '</div>'
      + (loc.notes ? '<div class="wr-info-notes">' + esc(loc.notes) + '</div>' : '')
      + '<div class="wr-info-acts"><button type="button" data-act="plan">Site plan</button><button type="button" data-act="edit">Edit</button><button type="button" data-act="move">Move pin</button></div>';
    div.querySelector('[data-act="plan"]').onclick = function(){ info.close(); WinterSitePlan.open(loc.id); };
    div.querySelector('[data-act="edit"]').onclick = function(){ info.close(); JWG.editWinterLocation(loc.id); };
    div.querySelector('[data-act="move"]').onclick = function(){ info.close(); startPlacing(loc.id); };
    info.setContent(div);
    info.setPosition({lat: loc.lat, lng: loc.lng});
    info.open({map: map});
  }

  function renderSide(side, W){
    var unplaced = W.locations.filter(function(l){ return !located(l); });
    var h = '';
    if(placing){
      var pl = W.locations.find(function(l){ return l.id === placing; });
      h += '<div class="wr-placing">Click the map where <b>' + esc(pl ? pl.address : '') + '</b> is. <button type="button" data-cancel>Cancel</button></div>';
    }
    if(unplaced.length){
      h += '<div class="wr-group wr-unplaced"><div class="wr-gh"><span class="wr-chip" style="background:#9aa5a0">?</span>Not on the map yet</div>'
        + '<div class="wr-gmeta">The address could not be found. Place each one by hand.</div><ol>'
        + unplaced.map(function(l){ return '<li><span class="wr-addr">' + esc(l.address) + '</span><button type="button" data-place="' + l.id + '">Place</button></li>'; }).join('')
        + '</ol></div>';
    }
    W.groups.forEach(function(g){
      var stops = routed(W, g.code);
      h += '<div class="wr-group' + (focus && focus !== g.code ? ' dim' : '') + (focus === g.code ? ' on' : '') + '" data-group="' + g.code + '">'
        + '<div class="wr-gh"><span class="wr-chip" style="background:' + g.color + '">' + g.code + '</span>' + esc(g.name) + '</div>'
        + '<div class="wr-gmeta">' + stops.length + ' site' + (stops.length === 1 ? '' : 's') + '</div><ol>'
        + stops.map(function(l){
            return '<li data-site="' + l.id + '"><code style="color:' + g.color + '">' + code(l) + '</code><span class="wr-addr">' + esc(l.address)
              + (l.client_name && l.client_name !== l.address ? ' <i>· ' + esc(l.client_name) + '</i>' : '') + '</span></li>';
          }).join('')
        + '</ol></div>';
    });
    side.innerHTML = h;
    side.onclick = function(e){
      var t = e.target;
      if(t.closest('[data-cancel]')){ placing = null; setPlacingCursor(); renderSide(side, W); return; }
      var pb = t.closest('[data-place]');
      if(pb){ startPlacing(pb.dataset.place); return; }
      var li = t.closest('[data-site]');
      if(li){
        var loc = W.locations.find(function(l){ return l.id === li.dataset.site; });
        map.panTo({lat: loc.lat, lng: loc.lng});
        if(map.getZoom() < 16) map.setZoom(16);
        openInfo(W, loc);
        return;
      }
      var gr = t.closest('[data-group]');
      if(gr){
        focus = focus === gr.dataset.group ? null : gr.dataset.group;
        renderSide(side, W);
        drawOverlays(W, true);
      }
    };
    renderSide.last = {side: side, W: W};
  }

  // While a pin is waiting to be placed the map shows a crosshair instead of the hand.
  function setPlacingCursor(){ if(map) map.setOptions({draggableCursor: placing ? 'crosshair' : null}); }
  function startPlacing(id){
    placing = id;
    setPlacingCursor();
    var l = renderSide.last;
    if(l) renderSide(l.side, l.W);
  }

  // A pin placed or moved by hand: save the spot, give it a group if it has none,
  // then renumber the group it sits in.
  async function placeSite(id, pt){
    var W = JWG.WIN;
    var loc = W.locations.find(function(l){ return l.id === id; });
    try {
      var group = loc.winter_group || await suggestGroup(pt, W.locations.filter(function(l){ return l.id !== id; }), W.groups);
      await sbWrite(id, {lat: pt.lat, lng: pt.lng, winter_group: group});
      Object.assign(loc, {lat: pt.lat, lng: pt.lng, winter_group: group});
      await renumberGroup(group, W.locations);
      JWG.toast('Pin placed · ' + groupOf(W, group).name);
    } catch(e){
      JWG.toast('Could not save the pin: ' + e.message, 'error');
      throw e;
    } finally {
      await JWG.reloadWinter();
    }
  }

  return {code: code, located: located, renumberGroup: renumberGroup, suggestGroup: suggestGroup, findAddress: findAddress, render: render};
})();
