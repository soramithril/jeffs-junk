// ── SNOW & ICE PAGE ───────────────────────────────────────────────────────
// The winter sites as one desk (Jake picked the "Desk" mockup, 2026-11-10):
// three gauges on top, areas and stops on the left, the Google map in the
// middle, the picked site on the right. It replaces the old List / Route map
// pair, so there is one screen instead of two.
//
// It has its own menu button, but it draws inside the Schedule page's
// container (#win-page), the same way Clothing and Inventory do: the winter
// data, the Add / Edit forms and the pop-ups all live in app-jwg-scheduler.js,
// and every save there ends in renderWinterPage(), which calls render() here.
// The map itself is app-winter-routes.js.
window.SnowDesk = (function(){
  var st = {sel: null, area: null, q: '', filter: ''};   // filter: '' | 'pending' | 'nophoto' | 'low'
  var W = null, root = null;
  var photoUrls = {};   // photo_path -> {url, until}; signed links last an hour

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function saltOf(loc){ return W.saltBins.find(function(s){ return s.location_id === loc.id; }); }
  function isLow(loc){ var s = saltOf(loc); return !!s && s.current_bags <= s.min_threshold; }
  function groupOf(code){ return W.groups.find(function(g){ return g.code === code; }); }
  function nick(loc){ return loc.client_name && loc.client_name !== loc.address ? loc.client_name : ''; }
  function onRun(loc){ return !!WinterRoutes.code(loc) && WinterRoutes.located(loc); }
  function selected(){ return W.locations.find(function(l){ return l.id === st.sel; }); }
  function shown(loc){
    var q = st.q.trim().toLowerCase();
    if(q && loc.address.toLowerCase().indexOf(q) < 0 && String(loc.client_name || '').toLowerCase().indexOf(q) < 0) return false;
    if(st.filter === 'pending') return loc.winter_contract === 'pending';
    if(st.filter === 'nophoto') return !loc.photo_path;
    if(st.filter === 'low') return isLow(loc);
    return true;
  }

  // ── gauges ──
  function paintGauges(){
    var n = W.locations.length;
    var conf = W.locations.filter(function(l){ return l.winter_contract === 'confirmed'; }).length;
    var noPhoto = W.locations.filter(function(l){ return !l.photo_path; });
    var bins = W.locations.filter(saltOf), lows = bins.filter(isLow);
    function names(list){ return list.slice(0, 2).map(function(l){ return esc(nick(l) || l.address); }).join(', ') + (list.length > 2 ? ' +' + (list.length - 2) : ''); }
    function gauge(key, label, big, small, pct, warn, hint){
      return '<button type="button" class="sx-gauge" data-filter="' + key + '" aria-pressed="' + (st.filter === key) + '" title="' + hint + '">'
        + '<span class="l">' + label + '</span><span class="v">' + big + '<small>' + small + '</small></span>'
        + '<span class="sx-bar"><i class="' + (warn ? 'warn' : '') + '" style="width:' + Math.max(pct, 1.5) + '%"></i></span></button>';
    }
    root.querySelector('#sx-gauges').innerHTML =
        gauge('pending', 'Contracts confirmed', conf, 'of ' + n, n ? conf / n * 100 : 0, conf < n, 'Show only the sites still pending')
      + gauge('nophoto', 'Site plans with a photo', n - noPhoto.length, 'of ' + n + (noPhoto.length ? ' · missing: ' + names(noPhoto) : ''), n ? (n - noPhoto.length) / n * 100 : 0, false, 'Show only the sites with no photo')
      + gauge('low', 'Salt bins low', lows.length, 'of ' + bins.length + (lows.length ? ' · ' + names(lows) : ''), bins.length ? lows.length / bins.length * 100 : 0, true, 'Show only the sites low on salt');
  }

  // ── areas and stops ──
  function stopRow(loc, color){
    var code = WinterRoutes.code(loc);
    return '<button type="button" class="sx-stop' + (loc.id === st.sel ? ' on' : '') + '" data-site="' + loc.id + '">'
      + '<span class="sx-code' + (code ? '' : ' none') + '"' + (code ? ' style="background:' + color + '"' : '') + '>' + (code || '—') + '</span>'
      + '<span><span class="a">' + esc(loc.address) + '</span>' + (nick(loc) ? '<span class="n">' + esc(nick(loc)) + '</span>' : '') + '</span></button>';
  }
  function paintList(){
    var narrowed = !!(st.q.trim() || st.filter);
    var sel = selected();
    var open = st.area || (sel && onRun(sel) ? sel.winter_group : null);
    var h = '<button type="button" class="sx-area' + (!st.area ? ' on' : '') + '" data-area=""><span class="sw" style="background:var(--n9)"></span>All areas<span class="ct">' + W.locations.length + '</span></button>';
    var loose = W.locations.filter(function(l){ return !onRun(l) && shown(l); });
    if(loose.length){
      h += '<div class="sx-loose"><div class="sx-loose-h">Not on the map yet</div>'
        + loose.map(function(l){ return stopRow(l, ''); }).join('') + '</div>';
    }
    W.groups.forEach(function(g){
      var stops = W.locations.filter(function(l){ return onRun(l) && l.winter_group === g.code; }).sort(function(a, b){ return a.winter_stop - b.winter_stop; });
      var vis = stops.filter(shown);
      if(narrowed && !vis.length) return;
      h += '<button type="button" class="sx-area' + (st.area === g.code ? ' on' : '') + '" data-area="' + g.code + '"><span class="sw" style="background:' + g.color + '"></span>' + esc(g.name)
        + '<span class="ct">' + (narrowed ? vis.length + ' of ' : '') + stops.length + '</span></button>';
      if(narrowed || open === g.code) h += '<div class="sx-stops">' + vis.map(function(l){ return stopRow(l, g.color); }).join('') + '</div>';
    });
    if(narrowed && !W.locations.some(shown)) h += '<div class="sx-none">No site matches.</div>';
    var box = root.querySelector('#sx-stops'), top = box.scrollTop;
    box.innerHTML = h;
    box.scrollTop = top;
  }

  // ── the picked site ──
  function paintDetail(){
    var box = root.querySelector('#sx-detail'), loc = selected();
    if(!loc){ box.innerHTML = '<div class="sx-none">Pick a site from the list or the map.</div>'; return; }
    var g = groupOf(loc.winter_group), code = WinterRoutes.code(loc), salt = saltOf(loc), low = isLow(loc);
    var mine = W.locationServices.filter(function(s){ return s.location_id === loc.id; });
    var nMarks = (loc.site_marks || []).length;
    var h = '<span class="sx-code big' + (code ? '' : ' none') + '"' + (code ? ' style="background:' + g.color + '"' : '') + '>' + (code || 'No stop yet') + '</span>'
      + '<h3>' + esc(loc.address) + '</h3>'
      + '<div class="nick">' + [nick(loc), g ? g.name : '', loc.city].filter(Boolean).map(esc).join(' · ') + '</div>'
      + '<div class="sx-sec"><div class="l">Contract</div><div class="sx-seg">'
      +   '<button type="button" data-contract="pending" aria-pressed="' + (loc.winter_contract === 'pending') + '">Pending</button>'
      +   '<button type="button" class="ok" data-contract="confirmed" aria-pressed="' + (loc.winter_contract === 'confirmed') + '">Confirmed</button></div></div>'
      + '<div class="sx-sec"><div class="l">What we do here</div><div class="sx-svcs">'
      +   W.serviceTypes.map(function(t){
            var on = mine.some(function(s){ return s.service_type_id === t.id; });
            return '<button type="button" class="sx-svc" data-svc="' + t.id + '" aria-pressed="' + on + '" title="Click to turn ' + (on ? 'off' : 'on') + '">' + esc(t.name) + '</button>';
          }).join('') + '</div></div>'
      + '<div class="sx-sec"><div class="l">Salt bin</div>'
      +   (salt
            ? '<div class="sx-salt"><button type="button" data-salt="-5">−5</button><button type="button" data-salt="-1">−1</button>'
              + '<input type="number" min="0" id="sx-salt-n" class="' + (low ? 'low' : '') + '" value="' + salt.current_bags + '" aria-label="Bags of salt">'
              + '<button type="button" data-salt="1">+1</button><button type="button" data-salt="5">+5</button>'
              + '<span class="t">bags · refill at ' + salt.min_threshold + '</span>' + (low ? '<span class="sx-tag bad">LOW</span>' : '') + '</div>'
            : '<span class="sx-dim">No salt bin at this site.</span>')
      + '</div>'
      + '<div class="sx-sec"><div class="l">Site plan</div>'
      +   (loc.photo_path
            ? '<button type="button" class="sx-photo" data-plan title="Open the site plan"><img id="sx-photo-img" alt="Aerial photo of ' + esc(loc.address) + '"><span id="sx-photo-mk"></span>'
              + '<span class="cap">' + nMarks + ' mark' + (nMarks === 1 ? '' : 's') + ' drawn</span></button>'
            : '<button type="button" class="sx-photo none" data-plan>No aerial photo yet. Add one</button>')
      + '</div>'
      + (loc.notes ? '<div class="sx-sec"><div class="l">Notes</div><div class="sx-notes">' + esc(loc.notes) + '</div></div>' : '')
      + '<div class="sx-row"><button type="button" class="sx-btn primary" data-plan>' + (loc.photo_path ? 'Open site plan' : 'Add photo') + '</button>'
      +   '<button type="button" class="sx-btn" data-edit>Edit site</button></div>'
      + '<div class="sx-row quiet"><button type="button" class="sx-link" data-move>' + (WinterRoutes.located(loc) ? 'Move pin' : 'Place on the map') + '</button>'
      +   '<button type="button" class="sx-link bad" data-delete>Delete site</button></div>';
    box.innerHTML = h;
    if(loc.photo_path) showPhoto(loc);
  }
  async function showPhoto(loc){
    var hit = photoUrls[loc.photo_path];
    if(!hit || hit.until < Date.now()){
      var r = await db.storage.from('winter-sites').createSignedUrl(loc.photo_path, 3600);
      if(r.error) throw r.error;
      hit = photoUrls[loc.photo_path] = {url: r.data.signedUrl, until: Date.now() + 50 * 60 * 1000};
    }
    var img = root.querySelector('#sx-photo-img');
    if(!img || st.sel !== loc.id) return;
    // The marks need the photo's shape, which is only known once it has loaded.
    img.onload = function(){
      if(st.sel === loc.id) root.querySelector('#sx-photo-mk').innerHTML = WinterSitePlan.svg(loc.site_marks, img.naturalWidth / img.naturalHeight, {labels: false});
    };
    img.src = hit.url;
  }

  // ── map ──
  function paintMap(fit){
    var placing = WinterRoutes.placing(), note = root.querySelector('#sx-placing');
    if(placing){
      var p = W.locations.find(function(l){ return l.id === placing; });
      note.innerHTML = 'Click the map where <b>' + esc(p ? p.address : '') + '</b> is. <button type="button" data-cancel-place>Cancel</button>';
    }
    note.hidden = !placing;
    WinterRoutes.render(root.querySelector('#sx-map'), W, {focus: st.area, selected: st.sel, fit: fit, onPick: pick});
  }

  function pick(loc, fromList){
    st.sel = loc.id;
    if(st.area && st.area !== loc.winter_group) st.area = onRun(loc) ? loc.winter_group : null;
    paintList(); paintDetail(); paintMap(false);
    if(fromList && WinterRoutes.located(loc)) WinterRoutes.panTo(loc);
  }

  function frame(){
    root.innerHTML = '<div class="sx-page">'
      + '<div class="sx-head"><div><div class="sx-title">Snow &amp; Ice</div><div class="sx-sub" id="sx-sub"></div></div>'
      +   '<div class="sx-acts"><button type="button" class="sx-btn" data-book>Print book</button><button type="button" class="sx-btn" data-types>Service list</button>'
      +   '<button type="button" class="sx-btn primary" data-add>+ Add site</button></div></div>'
      + '<div class="sx-gauges" id="sx-gauges"></div>'
      + '<div class="sx-desk">'
      +   '<div class="sx-panel sx-list"><input type="search" id="sx-q" class="sx-search" placeholder="Find an address or nickname" aria-label="Find a site"><div id="sx-stops"></div></div>'
      +   '<div class="sx-panel sx-mapbox"><div class="sx-placing" id="sx-placing" hidden></div><div class="wr-map-host" id="sx-map"></div></div>'
      +   '<div class="sx-panel sx-detail" id="sx-detail"></div>'
      + '</div></div>';
    root.querySelector('#sx-q').value = st.q;
    root.addEventListener('input', function(e){
      if(e.target.id === 'sx-q'){ st.q = e.target.value; paintList(); }
    });
    root.addEventListener('change', function(e){
      if(e.target.id === 'sx-salt-n') JWG.setWinterSalt(st.sel, e.target.value);
    });
    root.addEventListener('click', function(e){
      var t = e.target, b;
      if((b = t.closest('[data-site]'))){ pick(W.locations.find(function(l){ return l.id === b.dataset.site; }), true); return; }
      if((b = t.closest('[data-area]'))){
        st.area = b.dataset.area || null;
        var first = st.area && W.locations.filter(function(l){ return onRun(l) && l.winter_group === st.area; }).sort(function(x, y){ return x.winter_stop - y.winter_stop; })[0];
        var sel = selected();
        if(first && (!sel || sel.winter_group !== st.area)) st.sel = first.id;
        paintList(); paintDetail(); paintMap(true);
        return;
      }
      if((b = t.closest('[data-filter]'))){ st.filter = st.filter === b.dataset.filter ? '' : b.dataset.filter; paintGauges(); paintList(); return; }
      if(t.closest('[data-cancel-place]')){ WinterRoutes.cancelPlacing(); return; }
      if(t.closest('[data-book]')){ WinterBook.choose(); return; }
      if(t.closest('[data-types]')){ JWG.openManageWinterServiceTypes(); return; }
      if(t.closest('[data-add]')){ JWG.openAddWinterLocation(); return; }
      if(!st.sel) return;
      if((b = t.closest('[data-contract]'))){ JWG.setWinterContract(st.sel, b.dataset.contract); return; }
      if((b = t.closest('[data-svc]'))){ b.disabled = true; JWG.toggleWinterService(st.sel, b.dataset.svc); return; }
      if((b = t.closest('[data-salt]'))){ JWG.adjustWinterSalt(st.sel, +b.dataset.salt); return; }
      if(t.closest('[data-plan]')){ WinterSitePlan.open(st.sel); return; }
      if(t.closest('[data-edit]')){ JWG.editWinterLocation(st.sel); return; }
      if(t.closest('[data-move]')){ WinterRoutes.startPlacing(st.sel); return; }
      if(t.closest('[data-delete]')){ JWG.deleteWinterLocation(st.sel); return; }
    });
  }

  // Called by renderWinterPage() on every load and after every save.
  function render(el, win){
    W = win;
    var fresh = root !== el || !el.querySelector('.sx-desk');
    root = el;
    if(fresh) frame();
    if(!W.locations.some(function(l){ return l.id === st.sel; })){
      var run = W.locations.slice().sort(JWG.winterRouteSort);
      st.sel = run.length ? run[0].id : null;
    }
    if(st.area && !groupOf(st.area)) st.area = null;
    root.querySelector('#sx-sub').textContent = W.locations.length + ' site' + (W.locations.length === 1 ? '' : 's') + ' · ' + W.groups.length + ' areas · stops in driving order from the shop';
    paintGauges(); paintList(); paintDetail(); paintMap(fresh);
  }
  // The map calls this when a pin starts or stops waiting to be placed.
  function refresh(){ if(root && root.isConnected) paintMap(false); }

  return {render: render, refresh: refresh};
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
