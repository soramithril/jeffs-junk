// ── WINTER SITE PLAN EDITOR ───────────────────────────────────────────────
// One winter site's aerial photo with its marks drawn on it. This is what the
// printed winter book shows for every site, and what the Snow & Ice page shows
// in its site panel.
//
// The photo is a Google Earth screenshot the office uploads or pastes (Ctrl+V).
// It is shrunk to 3200px wide in the browser (sharp enough to zoom in on; it was
// 1600 until 2026-11-11, which went soft as soon as the editor could zoom) and
// stored in the private 'winter-sites' bucket; a replaced photo gets a new path
// and the old file is removed.
//
// Marks are saved in site_marks as fractions of the photo, so they line up at
// any size. Every mark is {t: kind, p: [[x, y], ...], n: 'optional note'}
// (Jake, 2026-11-11 - before that a drop zone was a box, {t:'zone', r:[x,y,w,h]}):
//   zone, nopile, clear   an outline, three points or more
//   walk                  a line, two points or more
//   push                  an arrow, exactly two points (from, to)
//   hazard, salt          a pin, one point
// Each kind numbers itself in saved order: DZ-01 is the first drop zone.
//
// The editor opens as a full page over Snow & Ice, not a pop-up, so the photo
// gets the room. draw() below is the ONE place marks are turned into a picture;
// the book and the site panel call it too.
window.WinterSitePlan = (function(){
  var BUCKET = 'winter-sites', MAX_W = 3200, VW = 1000;
  var AREA_HINT = 'Drag to draw the outline by hand, or click each corner for straight edges. Hold Shift and drag for a box. Double-click to finish.';
  var KINDS = {
    zone:   {name: 'Drop zone',  code: 'DZ', color: '#ffd60a', shape: 'area',  key: 'Pile snow here.', hint: AREA_HINT},
    nopile: {name: 'Don’t pile', code: 'NP', color: '#ef4444', shape: 'area',  key: 'Never pile snow here.', hint: AREA_HINT},
    clear:  {name: 'Keep clear', code: 'KC', color: '#22d3ee', shape: 'area',  key: 'Entrances, fire routes and doors stay open.', hint: AREA_HINT},
    walk:   {name: 'Sidewalk',   code: 'SW', color: '#2f80ed', shape: 'line',  key: 'Plow and salt the walk.', hint: 'Drag along the sidewalk to trace it by hand, or click point to point for straight runs. Double-click to finish.'},
    push:   {name: 'Push arrow', code: 'PA', color: '#ffffff', shape: 'arrow', key: 'Push the snow this way.', hint: 'Drag from where the plow starts to where the snow ends up.'},
    hazard: {name: 'Hazard',     code: 'HZ', color: '#fb923c', shape: 'pin',   key: 'Watch for this.', hint: 'Click on a hydrant, curb, speed bump or anything else to watch for.'},
    salt:   {name: 'Salt bin',   code: 'SB', color: '#c4b5fd', shape: 'pin',   key: 'The salt bin is here.', hint: 'Click where the salt bin sits.'}
  };
  var ORDER = ['zone', 'nopile', 'clear', 'walk', 'push', 'hazard', 'salt'];
  var NEED = {area: 3, line: 2, arrow: 2, pin: 1};
  var FONT = 'font-family="Inter,system-ui,sans-serif"';
  var st = null;   // the site being edited

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function kind(m){
    var k = KINDS[m.t];
    if(!k) throw new Error('Unknown site mark type: ' + m.t);
    return k;
  }
  function label(marks, i){
    var m = marks[i], n = 0;
    for(var k = 0; k < i; k++) if(marks[k].t === m.t) n++;
    return kind(m).code + '-' + String(n + 1).padStart(2, '0');
  }
  function clamp(v){ return Math.min(1, Math.max(0, v)); }
  function f1(v){ return v.toFixed(1); }

  // ── drawing (shared with the book and the Snow & Ice site panel) ──
  // Marks as SVG, in a 1000-wide box as tall as the photo's shape makes it, so
  // labels, pins and arrowheads are never stretched. o: sel (index picked in the
  // editor), vsel (the dot picked on that mark), draft (a mark still being drawn), hover (where the next point would
  // go), labels (false to leave the codes off), size (how heavy everything is drawn:
  // line widths, codes, pins and handles all scale with it. The editor lowers it as
  // you zoom in, so the photo grows and the marks stay as fine as they were).
  function draw(marks, vh, o){
    o = o || {};
    var s = o.size || 1, h = '';
    function P(q){ return [q[0] * VW, q[1] * vh]; }
    function pts(p){ return p.map(function(q){ var c = P(q); return f1(c[0]) + ',' + f1(c[1]); }).join(' '); }
    function chip(x, y, text, color){
      if(o.labels === false) return '';
      var w = (text.length * 8.6 + 12) * s, hh = 21 * s;
      x = Math.min(VW - w / 2 - 2, Math.max(w / 2 + 2, x));
      y = Math.min(vh - hh / 2 - 2, Math.max(hh / 2 + 2, y));
      return '<rect x="' + f1(x - w / 2) + '" y="' + f1(y - hh / 2) + '" width="' + f1(w) + '" height="' + f1(hh) + '" rx="' + f1(5 * s) + '" fill="' + color + '" stroke="#012b1f" stroke-width="' + f1(1.2 * s) + '"/>'
        + '<text x="' + f1(x) + '" y="' + f1(y + 4.8 * s) + '" text-anchor="middle" font-size="' + f1(13.5 * s) + '" font-weight="800" fill="#012b1f" ' + FONT + '>' + text + '</text>';
    }
    function w(n){ return f1(n * s); }
    function one(m, i, isDraft){
      var K = kind(m), c = K.color, on = !isDraft && o.sel === i, g = '';
      var p = isDraft && o.hover && K.shape !== 'arrow' && !m.closed ? m.p.concat([o.hover]) : m.p;
      if(!p.length) return '';
      var a = P(p[0]);
      // Where a mark's code goes: in its middle if the mark can hold it, otherwise just
      // above it (below, at the photo's top edge), so a code never hides its own mark.
      function tag(mid){
        var text = label(marks, i), xs = p.map(function(q){ return q[0] * VW; }), ys = p.map(function(q){ return q[1] * vh; });
        var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        var cw = (text.length * 8.6 + 12) * s, ch = 21 * s, gap = 7 * s;
        if(mid && x1 - x0 >= cw * 1.3 && y1 - y0 >= ch * 1.9) return chip(mid[0], mid[1], text, c);
        return chip((x0 + x1) / 2, y0 - ch - gap < 0 ? y1 + ch / 2 + gap : y0 - ch / 2 - gap, text, c);
      }
      if(K.shape === 'area'){
        var dash = m.t === 'zone' ? '' : ' stroke-dasharray="' + w(11) + ' ' + w(7) + '"';
        if(isDraft && !m.closed) g += '<polyline points="' + pts(p) + '" fill="' + c + '" fill-opacity=".15" stroke="' + c + '" stroke-width="' + w(3) + '" stroke-dasharray="' + w(8) + ' ' + w(6) + '" stroke-linejoin="round"/>';
        else g += '<polygon points="' + pts(p) + '" fill="' + c + '" fill-opacity="' + (m.t === 'zone' ? .4 : .28) + '" stroke="#012b1f" stroke-width="' + w(on ? 6.5 : 5) + '" stroke-linejoin="round" stroke-opacity=".7"/>'
          + '<polygon points="' + pts(p) + '" fill="none" stroke="' + (on ? '#fff' : c) + '" stroke-width="' + w(3) + '"' + dash + ' stroke-linejoin="round"/>';
        if(!isDraft){
          var cx = 0, cy = 0;
          p.forEach(function(q){ cx += q[0]; cy += q[1]; });
          g += tag([cx / p.length * VW, cy / p.length * vh]);
        }
      } else if(K.shape === 'line'){
        g += '<polyline points="' + pts(p) + '" fill="none" stroke="transparent" stroke-width="' + w(22) + '" stroke-linecap="round" stroke-linejoin="round"/>'
          + '<polyline points="' + pts(p) + '" fill="none" stroke="' + (on ? '#012b1f' : '#fff') + '" stroke-width="' + w(7.5) + '" stroke-linecap="round" stroke-linejoin="round"/>'
          + '<polyline points="' + pts(p) + '" fill="none" stroke="' + c + '" stroke-width="' + w(4) + '" stroke-linecap="round" stroke-linejoin="round"' + (isDraft ? ' stroke-dasharray="' + w(10) + ' ' + w(8) + '"' : '') + '/>';
        if(!isDraft) g += tag(null);
      } else if(K.shape === 'arrow'){
        if(p.length < 2) return '';
        var b = P(p[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hd = 22 * s;
        var h1 = [b[0] - hd * Math.cos(ang - .45), b[1] - hd * Math.sin(ang - .45)], h2 = [b[0] - hd * Math.cos(ang + .45), b[1] - hd * Math.sin(ang + .45)];
        var col = on ? '#bbf7d0' : c;
        g += '<line x1="' + f1(a[0]) + '" y1="' + f1(a[1]) + '" x2="' + f1(b[0]) + '" y2="' + f1(b[1]) + '" stroke="#012b1f" stroke-width="' + w(10) + '" stroke-linecap="round" stroke-opacity=".8"/>'
          + '<line x1="' + f1(a[0]) + '" y1="' + f1(a[1]) + '" x2="' + f1(b[0]) + '" y2="' + f1(b[1]) + '" stroke="' + col + '" stroke-width="' + w(5.5) + '" stroke-linecap="round"/>'
          + '<polygon points="' + f1(b[0]) + ',' + f1(b[1]) + ' ' + f1(h1[0]) + ',' + f1(h1[1]) + ' ' + f1(h2[0]) + ',' + f1(h2[1]) + '" fill="' + col + '" stroke="#012b1f" stroke-width="' + w(2) + '" stroke-linejoin="round"/>';
        if(!isDraft) g += tag(null);
      } else {
        g += '<circle cx="' + f1(a[0]) + '" cy="' + f1(a[1]) + '" r="' + w(on ? 15 : 13) + '" fill="' + c + '" stroke="' + (on ? '#fff' : '#012b1f') + '" stroke-width="' + w(on ? 4 : 2) + '"/>'
          + '<text x="' + f1(a[0]) + '" y="' + f1(a[1] + 5.2 * s) + '" text-anchor="middle" font-size="' + w(14.5) + '" font-weight="800" fill="#012b1f" ' + FONT + '>' + (m.t === 'hazard' ? '!' : 'S') + '</text>';
        if(!isDraft) g += chip(a[0], a[1] + 27 * s, label(marks, i), c);
      }
      if(on && K.shape !== 'pin') g += m.p.map(function(q, k){ var v = P(q); return '<circle data-v="' + k + '" cx="' + f1(v[0]) + '" cy="' + f1(v[1]) + '" r="' + w(k === o.vsel ? 8.5 : 7) + '" fill="' + (k === o.vsel ? '#22c55e' : '#fff') + '" stroke="#012b1f" stroke-width="' + w(2.2) + '" style="cursor:grab"/>'; }).join('');
      return isDraft ? '<g pointer-events="none">' + g + '</g>' : '<g data-m="' + i + '">' + g + '</g>';
    }
    marks.forEach(function(m, i){ h += one(m, i, false); });
    if(o.draft) h += one(o.draft, -1, true);
    return h;
  }
  // A finished overlay for a photo of the given shape (width / height).
  function svg(marks, ar, o){
    var vh = VW / ar;
    return '<svg viewBox="0 0 ' + VW + ' ' + f1(vh) + '" preserveAspectRatio="none" aria-hidden="true">' + draw(marks || [], vh, o) + '</svg>';
  }
  // What the book's map key lists: each kind used on a site, with its count.
  function tally(marks){
    return ORDER.map(function(t){
      return {t: t, kind: KINDS[t], n: (marks || []).filter(function(m){ return m.t === t; }).length};
    }).filter(function(x){ return x.n; });
  }
  function notes(marks){
    return (marks || []).map(function(m, i){ return m.n ? {code: label(marks, i), text: m.n} : null; }).filter(Boolean);
  }

  async function signedUrl(path){
    var r = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
    if(r.error) throw r.error;
    return r.data.signedUrl;
  }

  // ── the editor ──
  async function open(id){
    close();
    var loc = JWG.WIN.locations.find(function(l){ return l.id === id; });
    var run = JWG.WIN.locations.slice().sort(JWG.winterRouteSort);
    var pos = run.findIndex(function(l){ return l.id === id; });
    st = {loc: loc, marks: JSON.parse(JSON.stringify(loc.site_marks || [])), tool: 'select', sel: null, vsel: null, ext: null, crop: null, draft: null, drag: null, hover: null,
          zoom: 1, size: 1, labels: true, undo: [], redo: [], dirty: false, blob: null, ar: null,
          prev: run[pos - 1] ? run[pos - 1].id : null, next: run[pos + 1] ? run[pos + 1].id : null,
          url: loc.photo_path ? await signedUrl(loc.photo_path) : null};
    var code = WinterRoutes.code(loc);
    var grp = JWG.WIN.groups.find(function(g){ return g.code === loc.winter_group; });
    var nick = loc.client_name && loc.client_name !== loc.address ? loc.client_name : '';
    var page = document.createElement('div');
    page.id = 'sp-page';
    page.innerHTML = '<div class="sp-head">'
      + '<div class="sp-id">' + (code ? '<span class="sp-code" style="background:' + grp.color + '">' + code + '</span>' : '')
      +   '<div><div class="sp-addr">' + esc(loc.address) + '</div><div class="sp-nick">' + [nick, grp ? grp.name : '', 'site ' + (pos + 1) + ' of ' + run.length].filter(Boolean).map(esc).join(' · ') + '</div></div></div>'
      + '<div class="sp-acts"><button type="button" class="sp-btn" data-go="back">← Back to Snow &amp; Ice</button>'
      +   '<button type="button" class="sp-btn" data-go="prev"' + (st.prev ? '' : ' disabled') + '>‹ Previous</button>'
      +   '<button type="button" class="sp-btn" data-go="next"' + (st.next ? '' : ' disabled') + '>Next ›</button>'
      +   '<button type="button" class="sp-btn primary" id="sp-save">Save</button>'
      +   (st.next ? '<button type="button" class="sp-btn primary" id="sp-save-next">Save &amp; next →</button>' : '') + '</div></div>'
      + '<div class="sp-bar"><div class="sp-tools"><button type="button" class="sp-tool" data-tool="select">Select &amp; move</button>'
      +   ORDER.map(function(t){ return '<button type="button" class="sp-tool" data-tool="' + t + '"><i style="background:' + KINDS[t].color + '"></i>' + KINDS[t].name + '</button>'; }).join('') + '</div>'
      + '<div class="sp-tools"><button type="button" class="sp-tool" id="sp-labels" title="Show or hide the codes on the photo">Labels</button><button type="button" class="sp-tool" id="sp-undo">↶ Undo</button><button type="button" class="sp-tool" id="sp-redo">↷ Redo</button>'
      +   '<button type="button" class="sp-tool" data-zoom="-1" aria-label="Zoom out">−</button><b id="sp-zl">100%</b><button type="button" class="sp-tool" data-zoom="1" aria-label="Zoom in">+</button></div></div>'
      + '<div class="sp-note" id="sp-note"></div>'
      + '<div id="sp-cropbar" hidden><b>Cropping.</b><span>Drag a box around the part of the photo to keep. Your marks move with it; a mark left wholly outside the box is removed.</span>'
      +   '<button type="button" class="sp-btn primary" id="sp-crop-apply">Apply crop</button><button type="button" class="sp-btn" id="sp-crop-cancel">Cancel</button></div>'
      + '<div class="sp-body"><div class="sp-stage" id="sp-stage"></div>'
      + '<aside class="sp-side"><div class="sp-side-h">Marks on this site</div><div id="sp-list"></div>'
      +   '<div class="sp-side-f"><label class="sp-tool sp-upload">' + (st.url ? 'Replace photo' : 'Upload photo') + '<input type="file" accept="image/*" id="sp-file" hidden></label>'
      +   '<button type="button" class="sp-tool" id="sp-crop">Crop photo</button>'
      +   '<button type="button" class="sp-tool" id="sp-clear">Clear all marks</button>'
      +   '<div class="sp-hint">You can also copy a Google Earth screenshot and press Ctrl+V. Notes print in the book.</div></div></aside></div>';
    var host = document.getElementById('win-page');
    host.hidden = true;
    host.parentNode.appendChild(page);
    window.scrollTo(0, 0);   // the editor is one screen tall; start at its top
    page.addEventListener('click', onClick);
    page.querySelector('#sp-file').onchange = function(e){ if(e.target.files[0]) takePhoto(e.target.files[0]); };
    page.querySelector('#sp-list').addEventListener('input', function(e){
      if(e.target.dataset.note == null) return;
      st.marks[+e.target.dataset.note].n = e.target.value;
      st.dirty = true;
    });
    page.querySelector('#sp-list').addEventListener('focusin', function(e){ if(e.target.dataset.note != null) remember(); });
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', fit);
    // The wheel zooms on the spot under the pointer, the way a map does.
    page.querySelector('#sp-stage').addEventListener('wheel', function(e){
      if(!st.ar) return;
      e.preventDefault();
      zoomTo(st.zoom * (e.deltaY < 0 ? 1.25 : .8), e.clientX, e.clientY);
    }, {passive: false});
    renderStage();
  }

  // Take the editor off the page and put Snow & Ice back.
  function close(){
    var page = document.getElementById('sp-page');
    if(page) page.remove();
    var host = document.getElementById('win-page');
    if(host) host.hidden = false;
    document.removeEventListener('paste', onPaste);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', fit);
    st = null;
  }
  // The Schedule page can redraw under the editor (a tab switch); then it is gone.
  function alive(){
    if(st && document.getElementById('sp-page')) return true;
    if(st) close();
    return false;
  }
  async function leave(to){
    finish();
    if(st.dirty && !await JWG.jwgConfirm({title: 'Unsaved changes', message: 'The changes to this site plan are not saved yet.', confirmLabel: 'Leave without saving'})) return;
    if(to === 'back'){ close(); await JWG.reloadWinter(); }
    else await open(to === 'prev' ? st.prev : st.next);
  }

  function remember(){
    st.undo.push(JSON.stringify(st.marks));
    if(st.undo.length > 80) st.undo.shift();
    st.redo = [];
    st.dirty = true;
  }
  function step(from, to){
    if(!from.length) return;
    to.push(JSON.stringify(st.marks));
    st.marks = JSON.parse(from.pop());
    st.sel = null; st.vsel = null; st.ext = null; st.draft = null; st.hover = null; st.dirty = true;
    paint();
  }

  function onClick(e){
    var t = e.target, b;
    if((b = t.closest('[data-go]'))){ leave(b.dataset.go); return; }
    if(t.closest('#sp-save')){ save(false); return; }
    if(t.closest('#sp-save-next')){ save(true); return; }
    if((b = t.closest('[data-tool]'))){ finish(); st.tool = b.dataset.tool; st.vsel = null; st.ext = null; if(st.tool !== 'select') st.sel = null; paint(); return; }
    if(t.closest('#sp-undo')){ finish(); step(st.undo, st.redo); return; }
    if(t.closest('#sp-redo')){ step(st.redo, st.undo); return; }
    if((b = t.closest('[data-zoom]'))){ zoomTo(st.zoom * (+b.dataset.zoom > 0 ? 1.5 : 1 / 1.5)); return; }
    if(t.closest('#sp-labels')){ st.labels = !st.labels; paint(); return; }
    if(t.closest('#sp-crop')){ finish(); st.crop = st.crop ? null : {box: null}; st.tool = 'select'; st.sel = null; st.vsel = null; st.ext = null; paint(); return; }
    if(t.closest('#sp-crop-cancel')){ st.crop = null; paint(); return; }
    if(t.closest('#sp-crop-apply')){ applyCrop(); return; }
    if(t.closest('#sp-clear')){ if(st.marks.length){ remember(); st.marks = []; st.sel = null; st.draft = null; paint(); } return; }
    if(t.closest('[data-del]')){ removeSelected(); return; }
    if((b = t.closest('[data-mark]')) && t.tagName !== 'INPUT'){ finish(); st.sel = +b.dataset.mark; st.vsel = null; st.ext = null; st.tool = 'select'; if(document.activeElement.blur) document.activeElement.blur(); paint(); }
  }
  function onPaste(e){
    if(!alive()) return;
    var item = Array.prototype.find.call(e.clipboardData.items, function(i){ return i.type.indexOf('image/') === 0; });
    if(!item) return;
    e.preventDefault();
    takePhoto(item.getAsFile());
  }
  function onKey(e){
    if(!alive() || /INPUT|TEXTAREA/.test(document.activeElement.tagName) || document.getElementById('jwg-confirm')) return;
    if(st.crop){ if(e.key === 'Escape'){ st.crop = null; paint(); } return; }
    var cmd = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if(cmd && k === 'z'){ e.preventDefault(); if(e.shiftKey) step(st.redo, st.undo); else { finish(); step(st.undo, st.redo); } }
    else if(cmd && k === 'y'){ e.preventDefault(); step(st.redo, st.undo); }
    else if(st.draft){
      // Still drawing: Enter ends it, Escape throws it away, Backspace takes back the last point.
      if(e.key === 'Enter'){ e.preventDefault(); finish(); paint(); }
      else if(e.key === 'Escape'){ e.preventDefault(); st.draft = null; st.hover = null; st.ext = null; paint(); }
      else if(e.key === 'Backspace'){ e.preventDefault(); st.draft.p.pop(); if(!st.draft.p.length) st.draft = null; paint(); }
    }
    else if(e.key === 'Escape'){ if(st.ext) st.ext = null; else { st.sel = null; st.vsel = null; } paint(); }
    // Delete takes out the picked dot if there is one, otherwise the whole mark.
    else if((e.key === 'Delete' || e.key === 'Backspace') && st.sel != null){ e.preventDefault(); if(st.vsel != null) removeDot(); else removeSelected(); }
  }
  function removeSelected(){
    if(st.sel == null) return;
    remember();
    st.marks.splice(st.sel, 1);
    st.sel = null; st.vsel = null; st.ext = null;
    if(document.activeElement.blur) document.activeElement.blur();
    paint();
  }
  function removeDot(){
    var m = st.marks[st.sel], shape = KINDS[m.t].shape;
    if(shape === 'arrow' || m.p.length <= NEED[shape]){ JWG.toast('That mark has no dot to spare. Remove the whole mark instead.', 'error'); return; }
    remember();
    m.p.splice(st.vsel, 1);
    st.vsel = null; st.ext = null;
    paint();
  }

  // End the mark being drawn by clicks. A double-click lands its last point twice,
  // so points on top of each other are dropped; too few points is not a mark.
  // When a line is being carried on from one of its ends (st.ext), the draft starts
  // at that end dot and everything after it joins the line.
  function finish(){
    var d = st.draft, ext = st.ext;
    if(!d) return;
    st.draft = null; st.hover = null;
    var p = d.p.filter(function(q, i){ return i === 0 || Math.abs(q[0] - d.p[i - 1][0]) > .004 || Math.abs(q[1] - d.p[i - 1][1]) > .004; });
    if(ext){
      st.ext = null;
      var add = p.slice(1), m = st.marks[ext.i];
      if(!add.length) return;
      remember();
      m.p = ext.atEnd ? m.p.concat(add) : add.reverse().concat(m.p);
      st.sel = ext.i; st.vsel = null;
      return;
    }
    if(p.length >= NEED[KINDS[d.t].shape]) commit({t: d.t, p: p});
  }
  function commit(m){
    remember();
    st.marks.push(m);
    st.sel = st.marks.length - 1;
  }
  // A hand-drawn path keeps only the points that carry its shape (Ramer-Douglas-Peucker),
  // measured on the 1000-wide drawing so "close enough" means the same on every photo.
  function simplify(path){
    var vh = VW / st.ar, P = path.map(function(q){ return [q[0] * VW, q[1] * vh]; }), keep = [];
    (function rdp(a, b){
      var far = 0, at = -1, ax = P[a][0], ay = P[a][1], dx = P[b][0] - ax, dy = P[b][1] - ay, len = Math.hypot(dx, dy) || 1;
      for(var i = a + 1; i < b; i++){
        var d = Math.abs(dy * (P[i][0] - ax) - dx * (P[i][1] - ay)) / len;
        if(d > far){ far = d; at = i; }
      }
      if(far > 4){ rdp(a, at); keep.push(at); rdp(at, b); }
    })(0, P.length - 1);
    return [0].concat(keep, [P.length - 1]).map(function(i){ return path[i]; });
  }

  function renderStage(){
    var stage = document.getElementById('sp-stage');
    if(!st.url){
      stage.innerHTML = '<div class="sp-empty">No photo yet. Upload a Google Earth screenshot of this site, or copy one and press Ctrl+V.</div>';
      paint();
      return;
    }
    stage.innerHTML = '<div class="sp-photo" id="sp-photo"><img src="' + st.url + '" alt="Aerial photo of ' + esc(st.loc.address) + '" draggable="false"><svg id="sp-svg" preserveAspectRatio="none"></svg></div>';
    var site = st;
    stage.querySelector('img').onload = function(){
      if(st !== site) return;
      st.ar = this.naturalWidth / this.naturalHeight;
      document.getElementById('sp-svg').setAttribute('viewBox', '0 0 ' + VW + ' ' + f1(VW / st.ar));
      wire(document.getElementById('sp-svg'));
      fit();
    };
  }
  // The photo fills the stage without stretching; zoom makes it bigger and the stage scrolls.
  function fit(){
    if(!alive() || !st.ar) return;
    var stage = document.getElementById('sp-stage');
    var w = Math.min(stage.clientWidth - 16, (stage.clientHeight - 16) * st.ar) * st.zoom;
    document.getElementById('sp-photo').style.width = Math.round(w) + 'px';
    // Marks keep one size on screen whatever the zoom: a code about 12px tall, a
    // sidewalk line about 4px wide. Zooming in makes the photo bigger, not the marks.
    st.size = .9 * VW / w;
    paint();
  }
  // Zoom so the spot under (cx, cy) stays under it; with no spot given, the middle.
  function zoomTo(z, cx, cy){
    z = Math.min(8, Math.max(1, z));
    if(z === st.zoom || !st.ar) return;
    var stage = document.getElementById('sp-stage'), ph = document.getElementById('sp-photo');
    var r = ph.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    if(cx == null){ cx = sr.left + sr.width / 2; cy = sr.top + sr.height / 2; }
    var fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
    st.zoom = z;
    fit();
    var n = ph.getBoundingClientRect();
    stage.scrollLeft += n.left + fx * n.width - cx;
    stage.scrollTop += n.top + fy * n.height - cy;
  }
  // The one line of help under the tools: what the pointer does right now.
  function note(){
    if(!st.url || st.crop) return '';
    if(st.ext) return 'Carrying ' + label(st.marks, st.ext.i) + ' on from its end: click or drag to add to it. Double-click or press Enter to finish, Escape to stop.';
    if(st.tool !== 'select') return KINDS[st.tool].hint + ' Scroll to zoom in.';
    var m = st.sel != null ? st.marks[st.sel] : null, shape = m ? KINDS[m.t].shape : '';
    if(shape === 'line') return 'Drag a dot to reshape. Click an end dot to carry the line on. Double-click the line to add a dot; click a dot and press Delete to remove it.';
    if(shape === 'area') return 'Drag a dot to reshape. Double-click the outline to add a dot; click a dot and press Delete to remove it.';
    return 'Click a mark to select it: drag to move, drag a white dot to reshape, Delete to remove. Scroll to zoom in; drag the photo to slide it.';
  }
  function paint(){
    var page = document.getElementById('sp-page'), el = document.getElementById('sp-svg');
    if(el && st.ar){
      el.innerHTML = draw(st.marks, VW / st.ar, {sel: st.sel, vsel: st.vsel, draft: st.draft, hover: st.hover, size: st.size, labels: st.labels}) + cropShade();
      el.style.cursor = st.tool === 'select' && !st.ext && !st.crop ? 'default' : 'crosshair';
    }
    page.querySelectorAll('[data-tool]').forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.tool === st.tool); b.disabled = !st.url; });
    page.querySelector('#sp-labels').setAttribute('aria-pressed', st.labels);
    page.querySelector('#sp-cropbar').hidden = !st.crop;
    page.querySelector('#sp-crop-apply').disabled = !(st.crop && st.crop.box);
    page.querySelector('#sp-crop').setAttribute('aria-pressed', !!st.crop);
    page.querySelector('#sp-crop').disabled = !st.url;
    page.querySelector('#sp-undo').disabled = !st.undo.length;
    page.querySelector('#sp-redo').disabled = !st.redo.length;
    page.querySelector('#sp-zl').textContent = Math.round(st.zoom * 100) + '%';
    page.querySelector('#sp-note').textContent = note();
    var list = page.querySelector('#sp-list');
    if(list.contains(document.activeElement)) return;   // someone is typing a note
    list.innerHTML = st.marks.length ? st.marks.map(function(m, i){
      var on = st.sel === i;
      return '<div class="sp-mark' + (on ? ' on' : '') + '" data-mark="' + i + '"><span class="sp-code" style="background:' + kind(m).color + ';color:#012b1f">' + label(st.marks, i) + '</span><b>' + kind(m).name + '</b>'
        + (on ? '<button type="button" class="sp-tool sp-del" data-del>Remove</button><input type="text" data-note="' + i + '" placeholder="Add a note for the crew" value="' + esc(m.n || '') + '">'
              : (m.n ? '<span class="n">' + esc(m.n) + '</span>' : '')) + '</div>';
    }).join('') : '<div class="sp-none">' + (st.url ? 'Nothing drawn yet. Pick a kind of mark above and draw on the photo.' : 'Add a photo to start.') + '</div>';
  }

  // Draw, trace, move and reshape, all as fractions of the photo.
  function wire(el){
    function pt(e){
      var r = el.getBoundingClientRect();
      return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)];
    }
    function far(e, d, px){ return Math.hypot(e.clientX - d.cx, e.clientY - d.cy) > px; }
    // The end dot a line is being carried on from, and that line's kind.
    function anchor(){ var m = st.marks[st.ext.i]; return m.p[st.ext.atEnd ? m.p.length - 1 : 0]; }
    // Double-clicks are told apart here, not by the browser: every repaint swaps the
    // shapes under the pointer, and the browser drops a dblclick whose target has gone.
    var lastDown = null;
    el.addEventListener('pointerdown', function(e){
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      var p = pt(e), d = {cx: e.clientX, cy: e.clientY, a: p, moved: false};
      var v = e.target.closest('[data-v]'), m = e.target.closest('[data-m]');
      if(st.crop){ st.crop.box = [p, p]; st.drag = {kind: 'crop'}; paint(); return; }
      var twice = lastDown && e.timeStamp - lastDown.t < 400 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
      lastDown = twice ? null : {t: e.timeStamp, x: e.clientX, y: e.clientY};
      if(twice && st.draft){ finish(); paint(); return; }
      if(twice && !v && addDot(p)){ paint(); return; }
      if(st.tool === 'select' && v && st.sel != null){ d.kind = 'vertex'; d.k = +v.dataset.v; d.before = JSON.stringify(st.marks); }
      else if(st.tool === 'select' && st.ext && !st.draft && m && +m.dataset.m !== st.ext.i){ st.ext = null; st.vsel = null; st.sel = +m.dataset.m; d.kind = 'move'; d.orig = JSON.parse(JSON.stringify(st.marks[st.sel].p)); d.before = JSON.stringify(st.marks); }
      else if(st.tool === 'select' && st.ext){
        // carrying a line on: a drag draws by hand from its end, a click adds a point
        d.kind = 'trace'; d.t = st.marks[st.ext.i].t; d.path = [anchor(), p]; d.box = false; d.clicking = !!st.draft;
      }
      else if(st.tool === 'select' && m){
        if(st.sel !== +m.dataset.m) st.vsel = null;
        st.sel = +m.dataset.m; d.kind = 'move'; d.orig = JSON.parse(JSON.stringify(st.marks[st.sel].p)); d.before = JSON.stringify(st.marks);
      }
      else if(st.tool === 'select'){ st.sel = null; st.vsel = null; var sg = document.getElementById('sp-stage'); d.kind = 'pan'; d.sx = sg.scrollLeft; d.sy = sg.scrollTop; }
      else {
        var shape = KINDS[st.tool].shape;
        st.sel = null; st.vsel = null;
        if(shape === 'pin'){ commit({t: st.tool, p: [p]}); d = null; }
        else if(shape === 'arrow'){ d.kind = 'arrow'; st.draft = {t: st.tool, p: [p, p]}; }
        // A drag draws by hand (or a box with Shift); a plain click adds a corner.
        else { d.kind = 'trace'; d.t = st.tool; d.path = [p]; d.box = shape === 'area' && e.shiftKey; d.clicking = !!st.draft; }
      }
      st.drag = d;
      paint();
    });
    el.addEventListener('pointermove', function(e){
      if(!st) return;
      var d = st.drag, p = pt(e);
      if(!d){ if(st.draft){ st.hover = p; paint(); } return; }
      if(d.kind === 'pan'){ var sg = document.getElementById('sp-stage'); sg.scrollLeft = d.sx - (e.clientX - d.cx); sg.scrollTop = d.sy - (e.clientY - d.cy); return; }
      if(d.kind === 'crop'){ st.crop.box[1] = p; paint(); return; }
      if(d.kind === 'move'){
        if(far(e, d, 2)) d.moved = true;
        st.marks[st.sel].p = d.orig.map(function(q){ return [clamp(q[0] + p[0] - d.a[0]), clamp(q[1] + p[1] - d.a[1])]; });
      } else if(d.kind === 'vertex'){ if(far(e, d, 3)){ d.moved = true; st.marks[st.sel].p[d.k] = p; } }
      else if(d.kind === 'arrow') st.draft.p[1] = p;
      else if(!d.clicking && (d.moved || far(e, d, 8))){
        d.moved = true;
        d.path.push(p);
        st.draft = d.box ? {t: d.t, closed: true, p: [d.a, [p[0], d.a[1]], p, [d.a[0], p[1]]]} : {t: d.t, p: d.path};
        st.hover = null;
      }
      paint();
    });
    el.addEventListener('pointerup', function(e){
      var d = st.drag, p = pt(e);
      st.drag = null;
      if(!d) return;
      if(d.kind === 'pan'){ paint(); return; }
      if(d.kind === 'crop'){
        // a click, or a sliver, is not a crop
        var cb = st.crop.box;
        if(Math.abs(cb[1][0] - cb[0][0]) < .05 || Math.abs(cb[1][1] - cb[0][1]) < .05) st.crop.box = null;
        paint();
        return;
      }
      if(d.kind === 'move'){ if(d.moved){ st.undo.push(d.before); st.redo = []; st.dirty = true; } }
      else if(d.kind === 'vertex'){
        if(d.moved){ st.undo.push(d.before); st.redo = []; st.dirty = true; }
        else {
          // a plain click picks the dot; on either end of a line it also starts carrying the line on
          var mk = st.marks[st.sel];
          st.vsel = d.k;
          st.ext = KINDS[mk.t].shape === 'line' && (d.k === 0 || d.k === mk.p.length - 1) ? {i: st.sel, atEnd: d.k !== 0} : null;
        }
      }
      else if(d.kind === 'arrow'){
        var a = st.draft;
        st.draft = null;
        if(far(e, d, 14)) commit({t: a.t, p: a.p});
      } else if(d.moved){
        var drawn = st.draft;
        st.draft = null;
        var path = d.box ? drawn.p : simplify(d.path);
        if(st.ext){ st.draft = {t: d.t, p: path}; finish(); }
        else if(path.length >= NEED[KINDS[d.t].shape]) commit({t: d.t, p: path});
      } else {
        // a click: one more corner; clicking the first corner again closes an outline
        if(!st.draft) st.draft = {t: d.t, p: st.ext ? [anchor()] : []};
        var first = st.draft.p[0], r = el.getBoundingClientRect();
        if(!st.ext && first && KINDS[d.t].shape === 'area' && st.draft.p.length >= 3 && Math.hypot((p[0] - first[0]) * r.width, (p[1] - first[1]) * r.height) < 14) finish();
        else st.draft.p.push(p);
      }
      paint();
    });
    // On a selected line or outline, a double-click drops a new dot where you clicked,
    // so a straight stretch can be bent. True when it did.
    function addDot(c){
      if(st.tool !== 'select' || st.sel == null) return false;
      var m = st.marks[st.sel], shape = KINDS[m.t].shape;
      if(shape !== 'line' && shape !== 'area') return false;
      var r = el.getBoundingClientRect(), n = m.p.length, best = null;
      for(var i = 0; i < (shape === 'area' ? n : n - 1); i++){
        var a = m.p[i], b = m.p[(i + 1) % n];
        var ax = a[0] * r.width, ay = a[1] * r.height, dx = b[0] * r.width - ax, dy = b[1] * r.height - ay;
        var t = Math.max(0, Math.min(1, ((c[0] * r.width - ax) * dx + (c[1] * r.height - ay) * dy) / (dx * dx + dy * dy || 1)));
        var dist = Math.hypot(c[0] * r.width - (ax + t * dx), c[1] * r.height - (ay + t * dy));
        if(!best || dist < best.dist) best = {dist: dist, at: i + 1, p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]};
      }
      if(!best || best.dist > 14) return false;
      remember();
      m.p.splice(best.at, 0, best.p);
      st.vsel = best.at; st.ext = null;
      return true;
    }
  }

  // ── cropping ──
  // The box being dragged: everything outside it dimmed.
  function cropShade(){
    if(!st.crop || !st.crop.box) return '';
    var b = st.crop.box, vh = VW / st.ar;
    var x0 = Math.min(b[0][0], b[1][0]) * VW, x1 = Math.max(b[0][0], b[1][0]) * VW, y0 = Math.min(b[0][1], b[1][1]) * vh, y1 = Math.max(b[0][1], b[1][1]) * vh;
    return '<g pointer-events="none"><path fill-rule="evenodd" fill="#000" fill-opacity=".6" d="M0 0H' + VW + 'V' + f1(vh) + 'H0Z M' + f1(x0) + ' ' + f1(y0) + 'H' + f1(x1) + 'V' + f1(y1) + 'H' + f1(x0) + 'Z"/>'
      + '<rect x="' + f1(x0) + '" y="' + f1(y0) + '" width="' + f1(x1 - x0) + '" height="' + f1(y1 - y0) + '" fill="none" stroke="#fff" stroke-width="' + f1(2.5 * st.size) + '" stroke-dasharray="' + f1(9 * st.size) + ' ' + f1(6 * st.size) + '"/></g>';
  }
  // Cut the photo down to the box. The marks are fractions of the photo, so each
  // point is re-measured against the box; a mark with no point inside it is dropped.
  // Nothing is stored until Save: leaving without saving keeps the old photo.
  async function applyCrop(){
    var b = st.crop.box;
    var x0 = Math.min(b[0][0], b[1][0]), x1 = Math.max(b[0][0], b[1][0]), y0 = Math.min(b[0][1], b[1][1]), y1 = Math.max(b[0][1], b[1][1]);
    var site = st;
    document.getElementById('sp-crop-apply').disabled = true;
    try {
      var src = st.blob;
      if(!src){
        var got = await fetch(st.url);
        if(!got.ok) throw new Error('the photo did not download (' + got.status + ')');
        src = await got.blob();
      }
      var bmp = await createImageBitmap(src);
      var sx = Math.round(x0 * bmp.width), sy = Math.round(y0 * bmp.height), sw = Math.round((x1 - x0) * bmp.width), sh = Math.round((y1 - y0) * bmp.height);
      var c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
      var blob = await new Promise(function(res){ c.toBlob(res, 'image/jpeg', .9); });
      if(st !== site) return;
      var lost = 0;
      st.marks = st.marks.filter(function(m){
        var inside = m.p.some(function(q){ return q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1; });
        if(!inside) lost++;
        return inside;
      }).map(function(m){
        return Object.assign({}, m, {p: m.p.map(function(q){ return [clamp((q[0] - x0) / (x1 - x0)), clamp((q[1] - y0) / (y1 - y0))]; })});
      });
      st.blob = blob;
      st.url = URL.createObjectURL(blob);
      st.crop = null; st.sel = null; st.vsel = null; st.ext = null; st.draft = null;
      st.undo = []; st.redo = []; st.dirty = true; st.zoom = 1;
      JWG.toast('Photo cropped' + (lost ? ', ' + lost + ' mark' + (lost === 1 ? '' : 's') + ' outside it removed' : '') + '. Press Save to keep it.');
      renderStage();
    } catch(e){
      JWG.toast('Could not crop the photo: ' + (e.message || e), 'error');
      paint();
      throw e;
    }
  }

  // A new photo: shrink it to print size as a JPEG, show it, and offer to clear
  // marks that were drawn on the old picture.
  async function takePhoto(file){
    var img = await new Promise(function(res, rej){
      var i = new Image();
      i.onload = function(){ res(i); };
      i.onerror = function(){ rej(new Error('That file is not a picture the browser can read')); };
      i.src = URL.createObjectURL(file);
    });
    var scale = Math.min(1, MAX_W / img.naturalWidth);
    var c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    st.blob = await new Promise(function(res){ c.toBlob(res, 'image/jpeg', .85); });
    st.url = URL.createObjectURL(st.blob);
    st.dirty = true;
    finish();
    if(st.marks.length && await JWG.jwgConfirm({title: 'New photo', message: 'The marks were drawn on the old photo and may not line up with this one.', confirmLabel: 'Clear the marks'})){
      remember();
      st.marks = [];
      st.sel = null;
    }
    st.zoom = 1;
    renderStage();
  }

  // goNext: after saving, open the next site in route order in the same editor.
  async function save(goNext){
    finish();
    var btns = document.querySelectorAll('#sp-save,#sp-save-next');
    btns.forEach(function(b){ b.disabled = true; });
    var next = st.next;
    var loc = st.loc, oldPath = loc.photo_path, path = oldPath;
    var r4 = function(v){ return Math.round(v * 10000) / 10000; };
    try {
      if(st.blob){
        path = 'sites/' + loc.id + '/' + Date.now() + '.jpg';
        var up = await db.storage.from(BUCKET).upload(path, st.blob, {contentType: 'image/jpeg'});
        if(up.error) throw up.error;
      }
      var marks = st.marks.map(function(m){
        var out = {t: m.t, p: m.p.map(function(q){ return q.map(r4); })};
        if(m.n && m.n.trim()) out.n = m.n.trim();
        return out;
      });
      await JWG.sbF('PATCH', 'jwg_service_locations?id=eq.' + loc.id, {site_marks: marks, photo_path: path, updated_at: new Date().toISOString()});
      if(st.blob && oldPath){
        var rm = await db.storage.from(BUCKET).remove([oldPath]);
        if(rm.error) console.warn('old site photo not removed', oldPath, rm.error.message);
      }
      loc.site_marks = marks; loc.photo_path = path;
      JWG.toast('Site plan saved');
      if(goNext){ await open(next); return; }
      close();
      await JWG.reloadWinter();
    } catch(e){
      btns.forEach(function(b){ b.disabled = false; });
      JWG.toast('Could not save the site plan: ' + (e.message || e), 'error');
      throw e;
    }
  }

  return {open: open, close: close, signedUrl: signedUrl, svg: svg, tally: tally, notes: notes, KINDS: KINDS};
})();
