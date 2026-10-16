// ── WINTER BOOK (printed) ────────────────────────────────────────────────
// The printed winter book (Jake, 2026-10-15): one US Letter page per snow site in
// the "Dossier" style he picked from the mockups — white paper, Jeff White Group
// green and logo, the site's aerial photo with its numbered drop zones (DZ-01...).
// Pages run in route order, and each group opens with a divider page listing its
// stops, so the binder reads front to back the way the trucks drive.
//
// It opens as a preview in its own window with a Print button on top, so the
// dashboard behind it is untouched. Photos come from the private 'winter-sites' bucket through signed
// links that last an hour — plenty to print. Everything is laid out in cqw (1% of
// the page width) so the page keeps its proportions on screen and on paper.
window.WinterBook = (function(){
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  var TICK = '<svg viewBox="0 0 20 20" width="78%" height="78%"><path d="M4 10.5l4 4 8-9" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="square"/></svg>';

  function season(d){ var y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return y + '–' + String(y + 1).slice(2); }
  function isoDay(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // Group picker: the whole book, or one group's pages.
  function choose(){
    var W = JWG.WIN;
    var count = function(c){ return W.locations.filter(function(l){ return l.winter_group === c && l.winter_stop; }).length; };
    var total = W.locations.filter(function(l){ return l.winter_group && l.winter_stop; }).length;
    JWG.openModal('<div style="display:flex;flex-direction:column;gap:8px">'
      + '<h3 style="margin-bottom:6px">Print the winter book</h3>'
      + '<div style="font-size:13px;color:var(--fg-muted);margin-bottom:6px">One page per site, in route order. It opens in a new window to look over, with a Print button on top.</div>'
      + '<button class="si-action-btn" onclick="WinterBook.print(null)">Whole book · ' + total + ' sites</button>'
      + W.groups.map(function(g){
          return '<button class="si-action-btn secondary wb-pick" onclick="WinterBook.print(\'' + g.code + '\')"><span class="wr-code" style="background:' + g.color + '">' + g.code + '</span> ' + esc(g.name) + ' · ' + count(g.code) + '</button>';
        }).join('')
      + '<div class="si-modal-actions"><button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button></div></div>', '440px');
  }

  async function print(groupCode){
    // Opened inside the click so the browser allows the window; filled once the
    // photos are ready.
    var win = window.open('', '_blank');
    if(!win){ JWG.toast('The browser blocked the print window. Allow pop-ups for this site and try again.', 'error'); return; }
    win.document.write('<p style="font:16px system-ui;padding:40px">Building the winter book…</p>');
    JWG.closeModal();
    try {
      var W = JWG.WIN;
      var groups = W.groups.filter(function(g){ return !groupCode || g.code === groupCode; });
      var bySite = {};
      groups.forEach(function(g){
        bySite[g.code] = W.locations.filter(function(l){ return l.winter_group === g.code && l.winter_stop; })
          .sort(function(a, b){ return a.winter_stop - b.winter_stop; });
      });
      var sites = [].concat.apply([], groups.map(function(g){ return bySite[g.code]; }));
      var photos = await loadPhotos(sites);
      var today = new Date();
      var pages = groups.map(function(g){
        return divider(g, bySite[g.code], W) + bySite[g.code].map(function(l){ return sitePage(l, g, bySite[g.code].length, photos[l.id], W, today); }).join('');
      }).join('');
      win.document.open();
      win.document.write(bookHtml(pages, groupCode ? groups[0].name : 'Whole book', sites.length));
      win.document.close();
      win.focus();
    } catch(e){
      win.close();
      JWG.toast('Could not build the winter book: ' + (e.message || e), 'error');
      throw e;
    }
  }

  // Signed links for every photo, plus each photo's shape (the page sizes the
  // picture to fit the space left, so it needs width ÷ height before layout).
  async function loadPhotos(sites){
    var withPhoto = sites.filter(function(l){ return l.photo_path; });
    if(!withPhoto.length) return {};
    var r = await db.storage.from('winter-sites').createSignedUrls(withPhoto.map(function(l){ return l.photo_path; }), 3600);
    if(r.error) throw r.error;
    var out = {};
    await Promise.all(withPhoto.map(function(l, i){
      var url = r.data[i].signedUrl;
      return new Promise(function(res, rej){
        var img = new Image();
        img.onload = function(){ out[l.id] = {url: url, ar: img.naturalWidth / img.naturalHeight}; res(); };
        img.onerror = function(){ rej(new Error('photo for ' + l.address + ' did not load')); };
        img.src = url;
      });
    }));
    return out;
  }

  function servicesOf(loc, W){
    return W.serviceTypes.map(function(t){
      return {name: t.name, on: W.locationServices.some(function(s){ return s.location_id === loc.id && s.service_type_id === t.id; })};
    });
  }

  function divider(g, stops, W){
    return '<section class="page divider" style="--g:' + g.color + '">'
      + '<div class="class">WINTER OPS // CREW EYES ONLY</div>'
      + '<div class="dv-body"><div class="dv-code">' + g.code + '</div><div class="dv-name">' + esc(g.name) + '</div>'
      + '<div class="dv-count">' + stops.length + ' site' + (stops.length === 1 ? '' : 's') + ' · in driving order from the shop</div>'
      + '<ol class="dv-list">' + stops.map(function(l){
          return '<li><b>' + WinterRoutes.code(l) + '</b><span>' + esc(l.address) + (l.client_name && l.client_name !== l.address ? ' <i>· ' + esc(l.client_name) + '</i>' : '') + '</span></li>';
        }).join('') + '</ol></div>'
      + '<div class="foot"><span>Jeff White Group</span><span>Winter operations</span><span>Group ' + g.code + '</span></div>'
      + '<div class="class">WINTER OPS // CREW EYES ONLY // DO NOT LEAVE ON DASH</div></section>';
  }

  function sitePage(l, g, groupSize, photo, W, today){
    var code = WinterRoutes.code(l);
    var marks = l.site_marks || [];
    var svc = servicesOf(l, W);
    var nick = l.client_name && l.client_name !== l.address ? l.client_name : '';
    // Photo box: as wide as the margins allow, never taller than the space left (cqw).
    var w = photo ? Math.min(86, 50 * photo.ar) : 86;
    var zones = marks.map(function(m, i){
      return '<div class="zone' + (m[1] < .05 ? ' top' : '') + '" style="left:' + m[0] * 100 + '%;top:' + m[1] * 100 + '%;width:' + m[2] * 100 + '%;height:' + m[3] * 100 + '%"><span>DZ-' + String(i + 1).padStart(2, '0') + '</span></div>';
    }).join('');
    return '<section class="page">'
      + '<div class="class">WINTER OPS // CREW EYES ONLY // SEASON ' + season(today) + '</div>'
      + '<div class="hdr"><img src="' + new URL('assets/jwg-logo.png', location.href).href + '" alt="">'
      + '<div class="org"><b>JEFF WHITE GROUP</b><span>WINTER OPERATIONS · SITE BRIEF</span></div>'
      + '<div class="file"><div><span>FILE</span><b>JWG-W-' + code + '</b></div><div><span>SECTOR</span><b>' + esc(g.name.toUpperCase()) + '</b></div><div><span>INTEL</span><b>' + isoDay(today) + '</b></div></div></div>'
      + '<div class="title"><div class="num"><small>SITE</small>' + code + '</div>'
      + '<dl class="kv"><dt>TARGET</dt><dd class="addr">' + esc(l.address) + '</dd>'
      + '<dt>LOCATION</dt><dd>' + esc((l.city || '').toUpperCase()) + ' · ' + esc(g.name.toUpperCase()) + '</dd>'
      + '<dt>CALLSIGN</dt><dd>' + (nick ? '<span class="call">' + esc(nick.toUpperCase()) + '</span>' : 'NONE ASSIGNED') + '</dd></dl>'
      + '<div class="stamp">AUTHORIZED</div></div>'
      + '<div class="sect"><span>MISSION ORDERS</span><span>CHECKED = DO IT</span></div>'
      + '<div class="svc" style="grid-template-columns:repeat(' + svc.length + ',1fr)">' + svc.map(function(s){
          return '<div class="' + (s.on ? 'yes' : 'no') + '"><span class="box">' + (s.on ? TICK : '') + '</span>' + esc(s.name.toUpperCase()) + '</div>';
        }).join('') + '</div>'
      + '<div class="photo-wrap">' + (photo
          ? '<div class="grid"><div class="gx">' + 'ABCDEFGH'.split('').map(function(c){ return '<span>' + c + '</span>'; }).join('') + '</div>'
            + '<div class="gy">' + [1, 2, 3, 4, 5, 6].map(function(c){ return '<span>' + c + '</span>'; }).join('') + '</div>'
            + '<div class="photo" style="width:' + w + 'cqw;aspect-ratio:' + photo.ar + '"><img src="' + photo.url + '" alt="">' + zones + '<i class="brk"></i></div></div>'
          : '<div class="nophoto">No photo yet. Add one in the Winter tab under Site plan.</div>') + '</div>'
      + '<div class="credit">Imagery © Google</div>'
      + '<div class="lower"><div><div class="h">Map key</div><div class="legend">'
      + '<div><i></i><span><b>Drop zone (DZ).</b> Pile snow here. ' + marks.length + ' on this site.</span></div>'
      + '<div><i class="x"></i><span><b>Never pile</b> on hydrants, doors, drains or neighbours\' lots.</span></div></div></div>'
      + '<div class="notes"><div class="h">Field notes</div>' + (l.notes ? '<p>' + esc(l.notes) + '</p>' : '') + '<div class="lines"><i></i><i></i><i></i><i></i><i></i><i></i></div></div></div>'
      + '<div class="foot"><span>File JWG-W-' + code + '</span><span>Base: 92 Davidson St</span><span>Stop ' + l.winter_stop + ' of ' + groupSize + ' · ' + g.code + '</span></div>'
      + '<div class="class">WINTER OPS // CREW EYES ONLY // DO NOT LEAVE ON DASH</div></section>';
  }

  // The book opens as a preview; the bar on top prints it and never prints itself.
  function bookHtml(pages, label, n){
    return '<!doctype html><html><head><meta charset="utf-8"><title>Winter book · ' + esc(label) + '</title>'
      + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800&family=Saira+Stencil+One&family=IBM+Plex+Mono:wght@500;600&display=swap">'
      + '<style>' + BOOK_CSS + '</style></head><body>'
      + '<div class="bar"><b>Winter book · ' + esc(label) + '</b><span>' + n + ' site page' + (n === 1 ? '' : 's') + ' plus a divider for each group. Print on Letter paper, margins: none.</span>'
      + '<button onclick="print()">Print</button></div>'
      + pages + '</body></html>';
  }

  // Letter pages; 1cqw = 1% of the 8.5in page width.
  var BOOK_CSS = [
    '@page{size:letter;margin:0}',
    ':root{--deep:#012b1f;--forest:#00732e;--logo:#33a661;--mint:#a2d1a3;--wash:#eaf5ec;--pile:#ffd60a;--ink:#3d3200;',
    '  --ui:"Archivo",system-ui,sans-serif;--stencil:"Saira Stencil One","Archivo",Impact,sans-serif;--mono:"IBM Plex Mono",ui-monospace,Consolas,monospace}',
    '*{box-sizing:border-box;margin:0;padding:0}',
    'html,body{background:#d9dfdb}',
    'body{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.page{width:8.5in;height:11in;margin:24px auto;background:#fff;color:#14201a;container-type:inline-size;display:flex;flex-direction:column;overflow:hidden;font-family:var(--ui);font-size:1.75cqw;line-height:1.35;page-break-after:always;break-after:page;box-shadow:0 8px 30px rgba(0,0,0,.18)}',
    '.bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;padding:12px 20px;background:var(--deep);color:#e6f2ea;font:14px var(--ui)}',
    '.bar span{flex:1;opacity:.8}',
    '.bar button{font:700 14px var(--ui);background:#22c55e;color:#012b1f;border:0;border-radius:8px;padding:9px 22px;cursor:pointer}',
    '@media print{html,body{background:#fff}.page{margin:0;box-shadow:none}.bar{display:none}}',
    '.class{flex:none;background:var(--deep);color:#e6f2ea;font-family:var(--mono);font-weight:600;font-size:1.35cqw;letter-spacing:.32em;text-align:center;padding:.9cqw 2cqw;white-space:nowrap;overflow:hidden}',
    '.hdr{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2.6cqw;align-items:center;padding:2.6cqw 5.5cqw 2cqw;border-bottom:.5cqw double var(--forest)}',
    '.hdr>img{width:10.5cqw;height:10.5cqw}',
    '.org{font-family:var(--mono);color:var(--deep);line-height:1.3}.org b{display:block;font-family:var(--ui);font-weight:800;font-size:2.6cqw;letter-spacing:.16em}.org span{display:block;font-size:1.35cqw;letter-spacing:.22em;color:var(--forest)}',
    '.file{border:.25cqw solid var(--deep);font-family:var(--mono);font-size:1.2cqw;color:var(--deep);letter-spacing:.12em}.file div{padding:.5cqw 1.2cqw;display:flex;justify-content:space-between;gap:2cqw}.file div+div{border-top:.18cqw solid var(--deep)}.file b{font-weight:600}',
    '.title{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:3cqw;align-items:center;padding:2.4cqw 5.5cqw 2.2cqw}',
    '.num{border:.45cqw solid var(--deep);color:var(--deep);font-family:var(--stencil);font-size:6cqw;line-height:1;padding:.6cqw 1.4cqw .4cqw;text-align:center;white-space:nowrap}',
    '.num small{display:block;font-family:var(--ui);font-weight:700;font-size:1.25cqw;letter-spacing:.24em;border-bottom:.3cqw solid var(--deep);padding-bottom:.4cqw;margin-bottom:.5cqw}',
    '.kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.5cqw 1.8cqw;align-items:baseline;min-width:0}',
    '.kv dt{font-family:var(--mono);font-size:1.2cqw;letter-spacing:.2em;color:var(--forest);font-weight:600}',
    '.kv dd{font-family:var(--mono);font-size:1.7cqw;color:#26332c;letter-spacing:.04em}',
    '.kv dd.addr{font-family:var(--ui);font-weight:800;font-size:4.2cqw;line-height:1.05;letter-spacing:-.01em;color:var(--deep);text-wrap:balance}',
    '.call{font-weight:600;background:var(--wash);color:var(--forest);border:1px solid var(--mint);padding:.1cqw 1cqw;letter-spacing:.06em}',
    '.stamp{align-self:start;margin-top:1cqw;border:.45cqw solid var(--logo);color:var(--logo);font-family:var(--stencil);font-size:2.4cqw;letter-spacing:.14em;padding:.4cqw 1.4cqw;transform:rotate(-8deg);opacity:.85;white-space:nowrap}',
    '.sect{display:flex;justify-content:space-between;margin:0 5.5cqw .8cqw;font-family:var(--mono);font-weight:600;font-size:1.25cqw;letter-spacing:.24em;color:var(--forest)}',
    '.svc{display:grid;margin:0 5.5cqw;border:.25cqw solid var(--deep)}',
    '.svc div{display:flex;align-items:center;gap:1cqw;padding:1cqw 1.2cqw;font-family:var(--mono);font-weight:600;font-size:1.2cqw;letter-spacing:.04em;line-height:1.2}',
    '.svc div+div{border-left:.25cqw solid var(--deep)}',
    '.svc .box{width:2.6cqw;height:2.6cqw;flex:none;border:.3cqw solid var(--deep);display:grid;place-items:center}',
    '.svc .yes .box{background:var(--forest);border-color:var(--forest)}.svc .no{color:#8a958f}.svc .no .box{border-color:#b5bfba}',
    '.photo-wrap{flex:none;display:flex;justify-content:center;padding:1.6cqw 5.5cqw .6cqw}',
    '.grid{display:grid;grid-template-columns:2cqw auto;grid-template-rows:2cqw auto;gap:.6cqw}',
    '.gx,.gy{display:flex;justify-content:space-around;font-family:var(--mono);font-size:1.05cqw;font-weight:600;color:var(--forest)}',
    '.gy{flex-direction:column;align-items:center}.gx{grid-column:2;grid-row:1}.gy{grid-column:1;grid-row:2}.grid .photo{grid-column:2;grid-row:2}',
    '.photo{position:relative;max-width:100%;overflow:hidden;outline:.25cqw solid var(--deep);outline-offset:.5cqw}',
    '.photo img{display:block;width:100%;height:100%;object-fit:cover}',
    '.zone{position:absolute;background:rgba(255,214,10,.42);border:2px solid var(--pile);box-shadow:0 0 0 1px rgba(1,43,31,.55)}',
    '.zone span{position:absolute;left:0;top:0;transform:translateY(-100%);background:var(--pile);color:var(--ink);font-family:var(--mono);font-weight:600;font-size:1.15cqw;padding:0 .45cqw;line-height:1.7cqw;white-space:nowrap;box-shadow:0 0 0 1px rgba(1,43,31,.55)}',
    '.zone.top span{transform:none}',
    '.brk{position:absolute;inset:0;pointer-events:none;--l:3cqw;--w:.5cqw;background:',
    '  linear-gradient(var(--logo),var(--logo)) 0 0/var(--l) var(--w) no-repeat,linear-gradient(var(--logo),var(--logo)) 0 0/var(--w) var(--l) no-repeat,',
    '  linear-gradient(var(--logo),var(--logo)) 100% 0/var(--l) var(--w) no-repeat,linear-gradient(var(--logo),var(--logo)) 100% 0/var(--w) var(--l) no-repeat,',
    '  linear-gradient(var(--logo),var(--logo)) 0 100%/var(--l) var(--w) no-repeat,linear-gradient(var(--logo),var(--logo)) 0 100%/var(--w) var(--l) no-repeat,',
    '  linear-gradient(var(--logo),var(--logo)) 100% 100%/var(--l) var(--w) no-repeat,linear-gradient(var(--logo),var(--logo)) 100% 100%/var(--w) var(--l) no-repeat}',
    '.nophoto{width:86cqw;height:40cqw;border:.3cqw dashed #b5bfba;display:grid;place-items:center;color:#7d8984;font-size:1.8cqw}',
    '.credit{text-align:right;padding:0 5.5cqw 1.2cqw;font-size:1cqw;color:#7d8984}',
    '.lower{flex:1;min-height:0;overflow:hidden;display:grid;grid-template-columns:1.1fr 1fr;gap:3cqw;padding:0 5.5cqw 2cqw}',
    '.h{font-family:var(--mono);font-weight:600;font-size:1.25cqw;letter-spacing:.24em;text-transform:uppercase;color:var(--forest);border-bottom:.2cqw solid var(--forest);padding-bottom:.4cqw;margin-bottom:.9cqw}',
    '.legend{display:grid;gap:.8cqw;font-size:1.6cqw}.legend div{display:flex;align-items:center;gap:1.2cqw}',
    '.legend i{width:3.2cqw;height:2cqw;flex:none;background:rgba(255,214,10,.55);border:.3cqw solid var(--pile);box-shadow:0 0 0 1px rgba(1,43,31,.55)}',
    '.legend i.x{background:#fff;border:.3cqw solid #c53030;box-shadow:none;position:relative}',
    '.legend i.x::after{content:"";position:absolute;inset:0;background:linear-gradient(45deg,transparent 45%,#c53030 45% 55%,transparent 55%),linear-gradient(-45deg,transparent 45%,#c53030 45% 55%,transparent 55%)}',
    '.notes p{margin-bottom:.8cqw;font-size:1.65cqw}.lines{display:grid;gap:2.6cqw;margin-top:1.4cqw}.lines i{display:block;border-bottom:1px solid #b9c4be}',
    '.foot{display:flex;justify-content:space-between;gap:2cqw;padding:1.1cqw 5.5cqw;border-top:.5cqw double var(--forest);color:var(--forest);font-family:var(--mono);font-size:1.15cqw;letter-spacing:.16em;text-transform:uppercase;font-weight:600}',
    // group divider page: the group's colour as a wide band, its stops listed in order
    '.divider .dv-body{flex:1;padding:10cqw 8cqw 4cqw;border-left:5cqw solid var(--g)}',
    '.dv-code{font-family:var(--stencil);font-size:22cqw;line-height:.9;color:var(--g)}',
    '.dv-name{font-weight:800;font-size:5cqw;color:var(--deep);margin-top:1cqw}',
    '.dv-count{font-family:var(--mono);font-size:1.5cqw;letter-spacing:.14em;text-transform:uppercase;color:var(--forest);margin:1.5cqw 0 4cqw}',
    '.dv-list{list-style:none;display:grid;gap:1.2cqw;font-size:2cqw}',
    '.dv-list li{display:grid;grid-template-columns:10cqw minmax(0,1fr);gap:2cqw;border-bottom:1px solid #d8e0db;padding-bottom:1cqw}',
    '.dv-list b{font-family:var(--mono);color:var(--g)}.dv-list i{color:#56655d;font-style:normal}'
  ].join('\n');

  return {choose: choose, print: print};
})();
