// ── WINTER SITE PLAN EDITOR ───────────────────────────────────────────────
// One winter site's aerial photo with its snow drop zones drawn on it (Jake,
// 2026-10-15). This is what the printed winter book shows for every site.
//
// The photo is a Google Earth screenshot the office uploads or pastes (Ctrl+V).
// It is shrunk to 1600px wide in the browser (enough for a printed page) and
// stored in the private 'winter-sites' bucket; a replaced photo gets a new path
// and the old file is removed. Drop zones are boxes saved in site_marks as
// [x, y, w, h] fractions of the photo, so they line up at any size. Their order
// is their DZ number: DZ-01 is the first box.
window.WinterSitePlan = (function(){
  var BUCKET = 'winter-sites', MAX_W = 1600;
  var st = null;   // the site being edited: {loc, marks, sel, url, blob, drag}

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function dz(i){ return 'DZ-' + String(i + 1).padStart(2, '0'); }

  async function signedUrl(path){
    var r = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
    if(r.error) throw r.error;
    return r.data.signedUrl;
  }

  async function open(id){
    var loc = JWG.WIN.locations.find(function(l){ return l.id === id; });
    st = {loc: loc, marks: (loc.site_marks || []).map(function(m){ return m.slice(); }), sel: null, blob: null, drag: null,
          url: loc.photo_path ? await signedUrl(loc.photo_path) : null};
    var code = WinterRoutes.code(loc);
    var grp = JWG.WIN.groups.find(function(g){ return g.code === loc.winter_group; });
    JWG.openModal('<div class="sp-wrap">'
      + '<div class="sp-head">' + (code ? '<span class="wr-code" style="background:' + grp.color + '">' + code + '</span>' : '')
      + '<div><div class="sp-addr">' + esc(loc.address) + '</div>'
      + (loc.client_name && loc.client_name !== loc.address ? '<div class="sp-nick">Crew calls it ' + esc(loc.client_name) + '</div>' : '') + '</div></div>'
      + '<div class="sp-tools">'
      + '<label class="si-action-btn secondary sp-upload">Upload photo<input type="file" accept="image/*" id="sp-file" hidden></label>'
      + '<span class="sp-hint">or copy a Google Earth screenshot and press Ctrl+V</span>'
      + '<span class="sp-sp"></span>'
      + '<button type="button" class="si-action-btn secondary" id="sp-del" disabled>Delete zone</button>'
      + '<button type="button" class="si-action-btn secondary" id="sp-clear">Clear all</button>'
      + '</div>'
      + '<div class="sp-note" id="sp-note"></div>'
      + '<div class="sp-stage" id="sp-stage"></div>'
      + '<div class="si-modal-actions"><button class="modal-done" id="sp-save">Save site plan</button><button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button></div>'
      + '</div>', null, true);
    document.getElementById('sp-file').onchange = function(e){ if(e.target.files[0]) takePhoto(e.target.files[0]); };
    document.getElementById('sp-del').onclick = deleteSelected;
    document.getElementById('sp-clear').onclick = function(){ st.marks = []; st.sel = null; renderMarks(); };
    document.getElementById('sp-save').onclick = save;
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKey);
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
    if(!alive()) return;
    if((e.key === 'Delete' || e.key === 'Backspace') && st.sel != null && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)){
      e.preventDefault();
      deleteSelected();
    }
  }

  function renderStage(){
    var stage = document.getElementById('sp-stage');
    var note = document.getElementById('sp-note');
    if(!st.url){
      stage.innerHTML = '<div class="sp-empty">No photo yet. Upload a Google Earth screenshot of this site, or copy one and press Ctrl+V.</div>';
      note.textContent = '';
      return;
    }
    stage.innerHTML = '<div class="sp-photo" id="sp-photo"><img src="' + st.url + '" alt="Aerial photo of ' + esc(st.loc.address) + '" draggable="false"></div>';
    note.textContent = 'Drag on the photo to draw a drop zone. Click a zone to select it, drag it to move, use the corner to resize.';
    wirePhoto(document.getElementById('sp-photo'));
    renderMarks();
  }

  function renderMarks(){
    var ph = document.getElementById('sp-photo');
    document.getElementById('sp-del').disabled = st.sel == null;
    if(!ph) return;
    ph.querySelectorAll('.sp-mark').forEach(function(m){ m.remove(); });
    st.marks.forEach(function(m, i){
      var el = document.createElement('div');
      el.className = 'sp-mark' + (st.sel === i ? ' sel' : '');
      el.dataset.i = i;
      el.style.cssText = 'left:' + m[0] * 100 + '%;top:' + m[1] * 100 + '%;width:' + m[2] * 100 + '%;height:' + m[3] * 100 + '%';
      el.innerHTML = '<span>' + dz(i) + '</span>' + (st.sel === i ? '<i class="sp-h"></i>' : '');
      ph.appendChild(el);
    });
  }

  function deleteSelected(){
    if(st.sel == null) return;
    st.marks.splice(st.sel, 1);
    st.sel = null;
    renderMarks();
  }

  // Draw, move and resize, all as fractions of the photo.
  function wirePhoto(ph){
    function pt(e){
      var r = ph.getBoundingClientRect();
      return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
    }
    ph.addEventListener('pointerdown', function(e){
      e.preventDefault();
      ph.setPointerCapture(e.pointerId);
      var p = pt(e), mark = e.target.closest('.sp-mark');
      if(mark){
        st.sel = +mark.dataset.i;
        var m = st.marks[st.sel];
        st.drag = e.target.classList.contains('sp-h') ? {kind: 'size', m: m} : {kind: 'move', m: m, dx: p[0] - m[0], dy: p[1] - m[1]};
      } else {
        st.sel = null;
        st.drag = {kind: 'draw', start: p, m: [p[0], p[1], 0, 0]};
        st.marks.push(st.drag.m);
        st.sel = st.marks.length - 1;
      }
      renderMarks();
    });
    ph.addEventListener('pointermove', function(e){
      var d = st && st.drag;
      if(!d) return;
      var p = pt(e), m = d.m;
      if(d.kind === 'draw'){
        m[0] = Math.min(p[0], d.start[0]); m[1] = Math.min(p[1], d.start[1]);
        m[2] = Math.abs(p[0] - d.start[0]); m[3] = Math.abs(p[1] - d.start[1]);
      } else if(d.kind === 'move'){
        m[0] = Math.min(1 - m[2], Math.max(0, p[0] - d.dx));
        m[1] = Math.min(1 - m[3], Math.max(0, p[1] - d.dy));
      } else {
        m[2] = Math.max(.01, p[0] - m[0]); m[3] = Math.max(.01, p[1] - m[1]);
      }
      renderMarks();
    });
    ph.addEventListener('pointerup', function(){
      var d = st.drag;
      st.drag = null;
      // A click on bare photo draws nothing: drop the zero-size box it started.
      if(d && d.kind === 'draw' && (d.m[2] < .01 || d.m[3] < .01)){
        st.marks.splice(st.marks.indexOf(d.m), 1);
        st.sel = null;
      }
      renderMarks();
    });
  }

  // A new photo: shrink it to print size as a JPEG, show it, and offer to clear
  // zones that were drawn on the old picture.
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
    if(st.marks.length && await JWG.jwgConfirm({title: 'New photo', message: 'The drop zones were drawn on the old photo and may not line up with this one.', confirmLabel: 'Clear the zones'})){
      st.marks = [];
      st.sel = null;
    }
    renderStage();
  }

  async function save(){
    var btn = document.getElementById('sp-save');
    btn.disabled = true;
    var loc = st.loc, oldPath = loc.photo_path, path = oldPath;
    try {
      if(st.blob){
        path = 'sites/' + loc.id + '/' + Date.now() + '.jpg';
        var up = await db.storage.from(BUCKET).upload(path, st.blob, {contentType: 'image/jpeg'});
        if(up.error) throw up.error;
      }
      var marks = st.marks.map(function(m){ return m.map(function(v){ return Math.round(v * 10000) / 10000; }); });
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
