// ── WINTER SITE PLAN EDITOR ───────────────────────────────────────────────
// One winter site's aerial photo with its snow marks drawn on it (Jake,
// 2026-10-15). This is what the printed winter book shows for every site.
//
// The photo is a Google Earth screenshot the office uploads or pastes (Ctrl+V).
// It is shrunk to 1600px wide in the browser (enough for a printed page) and
// stored in the private 'winter-sites' bucket; a replaced photo gets a new path
// and the old file is removed. Marks are saved in site_marks as fractions of the
// photo, so they line up at any size. Two kinds (Jake, 2026-10-19):
//   {t:'zone', r:[x, y, w, h]}      a drop zone box - pile the snow here
//   {t:'walk', p:[[x, y], ...]}     a sidewalk line we plow, traced point by point
// Each kind numbers itself in saved order: DZ-01 is the first zone, SW-01 the
// first sidewalk.
window.WinterSitePlan = (function(){
  var BUCKET = 'winter-sites', MAX_W = 1600;
  var st = null;   // the site being edited: {loc, marks, mode, draft, sel, url, blob, drag}

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function label(i){
    var m = st.marks[i], n = 0;
    for(var k = 0; k < i; k++) if(st.marks[k].t === m.t) n++;
    return (m.t === 'zone' ? 'DZ-' : 'SW-') + String(n + 1).padStart(2, '0');
  }
  function clamp(v){ return Math.min(1, Math.max(0, v)); }

  async function signedUrl(path){
    var r = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
    if(r.error) throw r.error;
    return r.data.signedUrl;
  }

  async function open(id){
    var loc = JWG.WIN.locations.find(function(l){ return l.id === id; });
    st = {loc: loc, marks: JSON.parse(JSON.stringify(loc.site_marks || [])), mode: 'zone', draft: null, sel: null, blob: null, drag: null,
          url: loc.photo_path ? await signedUrl(loc.photo_path) : null};
    var code = WinterRoutes.code(loc);
    var grp = JWG.WIN.groups.find(function(g){ return g.code === loc.winter_group; });
    JWG.openModal('<div class="sp-wrap">'
      + '<div class="sp-head">' + (code ? '<span class="wr-code" style="background:' + grp.color + '">' + code + '</span>' : '')
      + '<div><div class="sp-addr">' + esc(loc.address) + '</div>'
      + (loc.client_name && loc.client_name !== loc.address ? '<div class="sp-nick">Crew calls it ' + esc(loc.client_name) + '</div>' : '') + '</div></div>'
      + '<div class="sp-tools">'
      + '<div class="sp-mode"><button type="button" data-mode="zone">Drop zones</button><button type="button" data-mode="walk">Sidewalks</button></div>'
      + '<label class="si-action-btn secondary sp-upload">Upload photo<input type="file" accept="image/*" id="sp-file" hidden></label>'
      + '<span class="sp-hint">or copy a Google Earth screenshot and press Ctrl+V</span>'
      + '<span class="sp-sp"></span>'
      + '<button type="button" class="si-action-btn" id="sp-finish" hidden>Finish line</button>'
      + '<button type="button" class="si-action-btn secondary" id="sp-del" disabled>Delete</button>'
      + '<button type="button" class="si-action-btn secondary" id="sp-clear">Clear all</button>'
      + '</div>'
      + '<div class="sp-note" id="sp-note"></div>'
      + '<div class="sp-stage" id="sp-stage"></div>'
      + '<div class="si-modal-actions"><button class="modal-done" id="sp-save">Save site plan</button><button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button></div>'
      + '</div>', null, true);
    document.querySelectorAll('.sp-mode button').forEach(function(b){ b.onclick = function(){ setMode(b.dataset.mode); }; });
    document.getElementById('sp-file').onchange = function(e){ if(e.target.files[0]) takePhoto(e.target.files[0]); };
    document.getElementById('sp-finish').onclick = finishWalk;
    document.getElementById('sp-del').onclick = deleteSelected;
    document.getElementById('sp-clear').onclick = function(){ st.marks = []; st.draft = null; st.sel = null; renderMarks(); };
    document.getElementById('sp-save').onclick = save;
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKey);
    setMode('zone');
    renderStage();
  }

  // Listeners live only while this editor is on screen.
  function alive(){
    if(document.getElementById('sp-stage')) return true;
    document.removeEventListener('paste', onPaste);
    document.removeEventListener('keydown', onKey);
    st = null;
    return false;
  }
  function onPaste(e){
    if(!alive()) return;
    var item = Array.prototype.find.call(e.clipboardData.items, function(i){ return i.type.indexOf('image/') === 0; });
    if(!item) return;
    e.preventDefault();
    takePhoto(item.getAsFile());
  }
  function onKey(e){
    if(!alive() || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if(st.draft){
      // Tracing a sidewalk: Enter ends it, Escape throws it away, Backspace undoes the last point.
      if(e.key === 'Enter'){ e.preventDefault(); finishWalk(); }
      else if(e.key === 'Escape'){ e.preventDefault(); st.draft.p = []; finishWalk(); }
      else if(e.key === 'Backspace'){ e.preventDefault(); st.draft.p.pop(); if(st.draft.p.length) renderMarks(); else finishWalk(); }
    } else if((e.key === 'Delete' || e.key === 'Backspace') && st.sel != null){
      e.preventDefault();
      deleteSelected();
    }
  }

  function setMode(mode){
    finishWalk();
    st.mode = mode;
    st.sel = null;
    document.querySelectorAll('.sp-mode button').forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.mode === mode); });
    document.getElementById('sp-note').textContent = !st.url ? '' : mode === 'zone'
      ? 'Drag on the photo to draw a drop zone. Click a zone to select it, drag it to move, use the corner to resize.'
      : 'Click along the sidewalk to trace it, then press Enter or Finish line. Click a line to select it, drag it to move, drag a dot to bend it.';
    renderMarks();
  }

  function renderStage(){
    var stage = document.getElementById('sp-stage');
    if(!st.url){
      stage.innerHTML = '<div class="sp-empty">No photo yet. Upload a Google Earth screenshot of this site, or copy one and press Ctrl+V.</div>';
      document.getElementById('sp-note').textContent = '';
      return;
    }
    stage.innerHTML = '<div class="sp-photo" id="sp-photo"><img src="' + st.url + '" alt="Aerial photo of ' + esc(st.loc.address) + '" draggable="false"></div>';
    wirePhoto(document.getElementById('sp-photo'));
    setMode(st.mode);
  }

  function renderMarks(){
    var ph = document.getElementById('sp-photo');
    var del = document.getElementById('sp-del');
    del.disabled = st.sel == null || !!st.draft;
    del.textContent = st.sel != null && !st.draft ? 'Delete ' + label(st.sel) : 'Delete';
    document.getElementById('sp-finish').hidden = !st.draft;
    if(!ph) return;
    ph.querySelectorAll('.sp-mark,.sp-walks,.sp-wlabel,.sp-v').forEach(function(m){ m.remove(); });
    var pct = function(v){ return v * 100 + '%'; };
    var walks = '', html = '';
    st.marks.forEach(function(m, i){
      var sel = st.sel === i;
      if(m.t === 'zone'){
        html += '<div class="sp-mark' + (sel ? ' sel' : '') + '" data-i="' + i + '" style="left:' + pct(m.r[0]) + ';top:' + pct(m.r[1]) + ';width:' + pct(m.r[2]) + ';height:' + pct(m.r[3]) + '">'
          + '<span>' + label(i) + '</span>' + (sel ? '<i class="sp-h"></i>' : '') + '</div>';
        return;
      }
      var pts = m.p.map(function(q){ return q[0] * 100 + ',' + q[1] * 100; }).join(' ');
      walks += '<g class="sp-walk' + (sel ? ' sel' : '') + (m === st.draft ? ' draft' : '') + '" data-i="' + i + '">'
        + '<polyline class="hit" points="' + pts + '"/><polyline class="case" points="' + pts + '"/><polyline class="line" points="' + pts + '"/></g>';
      html += '<span class="sp-wlabel' + (m.p[0][1] < .06 ? ' below' : '') + '" style="left:' + pct(m.p[0][0]) + ';top:' + pct(m.p[0][1]) + '">' + label(i) + '</span>';
      if(sel) html += m.p.map(function(q, k){ return '<i class="sp-v" data-i="' + i + '" data-k="' + k + '" style="left:' + pct(q[0]) + ';top:' + pct(q[1]) + '"></i>'; }).join('');
    });
    ph.insertAdjacentHTML('beforeend', '<svg class="sp-walks" viewBox="0 0 100 100" preserveAspectRatio="none">' + walks + '</svg>' + html);
  }

  function deleteSelected(){
    if(st.sel == null) return;
    st.marks.splice(st.sel, 1);
    st.sel = null;
    renderMarks();
  }

  // End the sidewalk being traced. A double-click lands its last point twice,
  // so trailing points on top of each other are dropped; fewer than two points
  // is not a line and goes away.
  function finishWalk(){
    var w = st.draft;
    if(!w) return;
    st.draft = null;
    var near = function(a, b){ return Math.abs(a[0] - b[0]) < .004 && Math.abs(a[1] - b[1]) < .004; };
    while(w.p.length > 1 && near(w.p[w.p.length - 1], w.p[w.p.length - 2])) w.p.pop();
    if(w.p.length < 2){ st.marks.splice(st.marks.indexOf(w), 1); st.sel = null; }
    renderMarks();
  }

  // Draw, trace, move and resize, all as fractions of the photo.
  function wirePhoto(ph){
    function pt(e){
      var r = ph.getBoundingClientRect();
      return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)];
    }
    ph.addEventListener('pointerdown', function(e){
      e.preventDefault();
      ph.setPointerCapture(e.pointerId);
      var p = pt(e), t = e.target;
      var vertex = t.closest('.sp-v'), zone = t.closest('.sp-mark'), walk = t.closest('.sp-walk');
      if(vertex){
        st.sel = +vertex.dataset.i;
        st.drag = {kind: 'vertex', m: st.marks[st.sel], k: +vertex.dataset.k};
      } else if(zone){
        st.sel = +zone.dataset.i;
        var z = st.marks[st.sel];
        st.drag = t.classList.contains('sp-h') ? {kind: 'size', m: z} : {kind: 'move', m: z, dx: p[0] - z.r[0], dy: p[1] - z.r[1]};
      } else if(walk && !st.draft){
        st.sel = +walk.dataset.i;
        var w = st.marks[st.sel];
        st.drag = {kind: 'walk', m: w, start: p, orig: w.p.map(function(q){ return q.slice(); })};
      } else if(st.mode === 'zone'){
        st.sel = null;
        st.drag = {kind: 'draw', start: p, m: {t: 'zone', r: [p[0], p[1], 0, 0]}};
        st.marks.push(st.drag.m);
        st.sel = st.marks.length - 1;
      } else {
        if(!st.draft){ st.draft = {t: 'walk', p: []}; st.marks.push(st.draft); }
        st.draft.p.push(p);
        st.sel = st.marks.indexOf(st.draft);
      }
      renderMarks();
    });
    ph.addEventListener('pointermove', function(e){
      var d = st && st.drag;
      if(!d) return;
      var p = pt(e), m = d.m;
      if(d.kind === 'draw'){
        m.r[0] = Math.min(p[0], d.start[0]); m.r[1] = Math.min(p[1], d.start[1]);
        m.r[2] = Math.abs(p[0] - d.start[0]); m.r[3] = Math.abs(p[1] - d.start[1]);
      } else if(d.kind === 'move'){
        m.r[0] = Math.min(1 - m.r[2], Math.max(0, p[0] - d.dx));
        m.r[1] = Math.min(1 - m.r[3], Math.max(0, p[1] - d.dy));
      } else if(d.kind === 'size'){
        m.r[2] = Math.max(.01, p[0] - m.r[0]); m.r[3] = Math.max(.01, p[1] - m.r[1]);
      } else if(d.kind === 'vertex'){
        m.p[d.k] = p;
      } else {
        var dx = p[0] - d.start[0], dy = p[1] - d.start[1];
        m.p = d.orig.map(function(q){ return [clamp(q[0] + dx), clamp(q[1] + dy)]; });
      }
      renderMarks();
    });
    ph.addEventListener('pointerup', function(){
      var d = st.drag;
      st.drag = null;
      // A click on bare photo draws nothing: drop the zero-size box it started.
      if(d && d.kind === 'draw' && (d.m.r[2] < .01 || d.m.r[3] < .01)){
        st.marks.splice(st.marks.indexOf(d.m), 1);
        st.sel = null;
      }
      renderMarks();
    });
    ph.addEventListener('dblclick', function(e){ e.preventDefault(); finishWalk(); });
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
    finishWalk();
    if(st.marks.length && await JWG.jwgConfirm({title: 'New photo', message: 'The drop zones and sidewalks were drawn on the old photo and may not line up with this one.', confirmLabel: 'Clear the marks'})){
      st.marks = [];
      st.sel = null;
    }
    renderStage();
  }

  async function save(){
    finishWalk();
    var btn = document.getElementById('sp-save');
    btn.disabled = true;
    var loc = st.loc, oldPath = loc.photo_path, path = oldPath;
    var r4 = function(v){ return Math.round(v * 10000) / 10000; };
    try {
      if(st.blob){
        path = 'sites/' + loc.id + '/' + Date.now() + '.jpg';
        var up = await db.storage.from(BUCKET).upload(path, st.blob, {contentType: 'image/jpeg'});
        if(up.error) throw up.error;
      }
      var marks = st.marks.map(function(m){
        return m.t === 'zone' ? {t: 'zone', r: m.r.map(r4)} : {t: 'walk', p: m.p.map(function(q){ return q.map(r4); })};
      });
      await JWG.sbF('PATCH', 'jwg_service_locations?id=eq.' + loc.id, {site_marks: marks, photo_path: path, updated_at: new Date().toISOString()});
      if(st.blob && oldPath){
        var rm = await db.storage.from(BUCKET).remove([oldPath]);
        if(rm.error) console.warn('old site photo not removed', oldPath, rm.error.message);
      }
      JWG.closeModal();
      JWG.toast('Site plan saved');
      await JWG.reloadWinter();
    } catch(e){
      btn.disabled = false;
      JWG.toast('Could not save the site plan: ' + (e.message || e), 'error');
      throw e;
    }
  }

  return {open: open, signedUrl: signedUrl};
})();
